/**
 * The reach-out sheet (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015; Reach out, Part 4 PR 6;
 * canvas boards 01-04): a chain of emails to a search's leads, written and started in one sheet beside the page, or
 * changed from its Playbooks row or its Templates row. On the house RecordSheet, keeping what was typed in the tab
 * (useUnsavedWork). Its parts, in the canvas's order: who gets it (the search's reach as the database counts it, the
 * unconfirmed addresses a door), what you'd say (the first email's subject and words, the six slots as chips, each
 * problem under its field), then (up to five steps, each after its days), the pace, the mailboxes it writes from, and before
 * it goes (one business's email at a time, by a press: the preview spends the model, R12). Start saves and runs the
 * first step, and the sheet stays open to say what happened (R14), with the one door on: the run that waits, or the
 * chain's row. The mailboxes and the booking link are Setup's and Settings' reads: until they are in, the sheet says it is
 * reading them and Start waits, never "none". Every sentence is contracts' (`reachOuts.words`); every act goes through
 * `reachOuts`. Never a fetch here. Its parts are sheet-fields.tsx and sheet-plan.tsx, its state sheet-draft.ts.
 *
 * Opened by Sequences for a lead (the lead sheet's hand-off, 17 Oct 2026), it writes a sequence on a list of its own: a new
 * one, or a version of one, its steps, waits and mailboxes copied. The list is made as Start is pressed, holding the lead
 * (lead_search_choose), so a sheet left without starting leaves nothing behind; until then who gets it is said by name,
 * and there is no business of the list's to preview.
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  MailboxConnectionDto,
  MailboxProvider,
  ReachOutChainDto,
  ReachOutDraft,
  ReachOutPreviewInput,
  ReachOutSavedDto,
} from "@chanlytics/contracts";
import type { SettingsRecord } from "@/legacy-bridge/surfaces/settings";
import { gate, navigate, setupDto, setupFailed, surfaceFailed } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { RecordSheet } from "../../kit/record/sheet";
import { UnsavedAsk } from "../../kit/record/work";
import type { UnsavedWork } from "../../kit/record/work";
import { useSurface } from "../../use-surface";
import { useReachOutDraft } from "./sheet-draft";
import { RoThen, RoWhat, RoWho, RoWhoNewList } from "./sheet-fields";
import { RoBefore, RoFrom, RoPace } from "./sheet-plan";
import { reachOuts } from "./surface";

type Words = typeof reachOuts.words;

/** The mailboxes the workspace connected, and the providers it may connect at, as Setup read them. */
function roMailboxes(): { mailboxes: MailboxConnectionDto[]; providers: MailboxProvider[] } {
  const setup = setupDto();
  const s = setup && setup.email && setup.email.sending;
  return { mailboxes: (s && s.mailboxes) || [], providers: (s && s.providers) || [] };
}

/** Whether the workspace has a booking link, as Settings read it. */
function roBookingLink(settings: SettingsRecord | null | undefined): boolean {
  const b = settings && settings.config && settings.config.brain;
  return !!(b && b.booking_link);
}

/** A read the sheet draws from: in, still out, or failed. */
type SheetRead = "in" | "reading" | "failed";

/** Whether a read the sheet draws from is in, still out, or failed (the mailboxes are Setup's; the link, Settings'). */
function roReads(settings: SettingsRecord | null | undefined): { mailboxes: SheetRead; settings: SheetRead } {
  return {
    mailboxes: setupDto() ? "in" : setupFailed() || surfaceFailed("start") ? "failed" : "reading",
    settings:
      settings && settings.config
        ? "in"
        : (settings && settings.broken) || surfaceFailed("admin", "workspace")
          ? "failed"
          : "reading",
  };
}

/** What a save did, said in the sheet where the words were. */
type Saved = ReturnType<Words["reachOutSavedWords"]>;

/** Saved: what its first run did (R14), said where the words were, until the owner closes the sheet or goes on. */
function RoSaved({ saved }: { saved: Saved }) {
  return (
    <section className="pb-sec" data-testid="ro-saved-sec">
      <p className="pb-when" data-tone={saved.tone} role="status" data-testid="ro-saved">
        {saved.text}
      </p>
    </section>
  );
}

interface FootProps {
  W: Words;
  work: UnsavedWork;
  say: { tone: string; text: string };
  ready: boolean;
  busy: boolean;
  editing: boolean;
  onStart: () => void;
  saved: Saved | null;
  onClose: () => void;
  /** Where the one door on goes, when the opener moves the page itself (see SheetProps.onGo). */
  onGo?: (route: string) => void;
}

/** The foot: what the chain will do, Cancel, and Start it (or Save, changing one); the one question first when asked. */
function RoFoot({ W, work, say, ready, busy, editing, onStart, saved, onClose, onGo }: FootProps) {
  const P = W.REACH_OUT_SHEET_PARTS;
  if (saved)
    return (
      <div className="pb-foot" data-foot-pair="">
        <span className="pb-foot-say" />
        <Button onClick={onClose} data-testid="ro-close">
          {P.close}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (onGo) {
              onGo(saved.to);
              return;
            }
            navigate(saved.to);
            onClose();
          }}
          data-testid="ro-saved-go"
        >
          {saved.label}
        </Button>
      </div>
    );
  if (work.asking)
    return (
      <div className="pb-foot">
        <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="ro-leave" />
      </div>
    );
  return (
    <div className="pb-foot" data-foot-pair="">
      <span
        className="pb-foot-say"
        data-tone={say.tone}
        role={say.tone === "danger" ? "alert" : undefined}
        data-testid="ro-foot-say"
      >
        {say.text}
      </span>
      <Button onClick={work.leave} data-testid="ro-cancel">
        {P.cancel}
      </Button>
      <Button
        variant="primary"
        disabled={!ready || busy}
        onClick={onStart}
        data-testid="ro-start"
        {...gate("approve", editing ? "change a reach-out" : "start a reach-out")}
      >
        {busy ? (editing ? P.saving : P.starting) : editing ? P.save : P.start}
      </Button>
    </div>
  );
}

/** What the sheet reads of Setup and Settings, and what the draft and the mailboxes make of it. */
function sheetFacts(W: Words, draft: ReachOutDraft, settings: SettingsRecord | null | undefined) {
  const { mailboxes, providers } = roMailboxes();
  const reads = roReads(settings);
  const unread = W.reachOutSheetUnreadOf(reads);
  const pace = W.reachOutSheetPaceOf(mailboxes, draft.mailbox_ids);
  // With no mailbox connected its owner sends it (00429): the one way it can go, so Start needs no mailbox then.
  const ownerSends = draft.owner_sends || (reads.mailboxes === "in" && mailboxes.length === 0);
  // An unread link is not a missing one: its problem is not said until Settings is in, and Start waits for it.
  const issues = W.reachOutDraftIssues(draft, { bookingLink: reads.settings !== "in" || roBookingLink(settings) });
  const ready = !unread && issues.ready && (ownerSends || pace.mailboxes > 0);
  const first = mailboxes.find(
    (m) => m.state === "connected" && (draft.mailbox_ids.length === 0 || draft.mailbox_ids.includes(m.id)),
  );
  return {
    mailboxes,
    providers,
    reads,
    unread,
    pace,
    issues,
    ready,
    first: ownerSends ? undefined : first,
    ownerSends,
  };
}

type Facts = ReturnType<typeof sheetFacts>;

/** The sheet's title: the reach-out's name, typed in place until it is saved. */
function sheetTitle(p: {
  W: Words;
  draft: ReachOutDraft;
  setDraft: Dispatch<SetStateAction<ReachOutDraft>>;
  saved: boolean;
}) {
  const { W, draft, setDraft, saved } = p;
  return (
    <span className="pb-title-wrap">
      <Field
        className="pb-title-box"
        shape="title"
        value={draft.name}
        onValueChange={(name) => setDraft((d) => ({ ...d, name }))}
        maxLength={80}
        readOnly={saved}
        spellCheck={false}
        aria-label={W.REACH_OUT_SHEET_PARTS.name}
        data-testid="ro-name"
      />
      <Icon name="pencil" size={13} />
    </span>
  );
}

interface ComposeProps {
  W: Words;
  st: ReturnType<typeof useReachOutDraft>;
  search: { id: string; name: string };
  facts: Facts;
  ask: (index: number) => ReachOutPreviewInput;
  reachN: number;
  stale: { key: string };
  onList: SheetProps["onList"];
}

/** The sheet's parts, in the canvas's order. */
function composeParts(p: ComposeProps) {
  const { W, st, search, facts, ask, reachN, stale, onList } = p;
  const { draft, setDraft } = st;
  const { issues, first, pace, mailboxes, providers, reads, unread, ownerSends } = facts;
  return (
    <div className="pb-compose ro-compose">
      {onList ? (
        <RoWhoNewList W={W} leadName={onList.leadName} version={onList.from ? onList.from.name : null} />
      ) : (
        <RoWho
          W={W}
          search={search}
          reach={st.reach}
          include={draft.include_unconfirmed}
          onInclude={(v) => setDraft((d) => ({ ...d, include_unconfirmed: v }))}
        />
      )}
      <RoWhat
        W={W}
        draft={draft}
        issues={issues}
        onEdit={st.editStep}
        onSigned={(v) => setDraft((d) => ({ ...d, signed_by: v }))}
        from={first ? `${first.from_name} · ${first.address}` : null}
      />
      <RoThen
        W={W}
        draft={draft}
        issues={issues}
        onEdit={st.editStep}
        onAfter={(n, v) => st.editStep(n, { after_days: v })}
        onAdd={() => setDraft(W.reachOutAddStep)}
        onAddHand={(kind) => setDraft((d) => W.reachOutAddHandStep(d, kind))}
        onHand={(n, v) => setDraft((d) => W.reachOutSetHandWords(d, n, v))}
        onDrop={() => setDraft(W.reachOutDropStep)}
      />
      <RoPace
        W={W}
        pace={pace}
        gap={draft.gap_minutes}
        onGap={(v) => setDraft((d) => ({ ...d, gap_minutes: v }))}
        ownerSends={ownerSends}
      />
      <RoFrom
        W={W}
        mailboxes={mailboxes}
        providers={providers}
        unread={reads.mailboxes === "in" ? null : unread}
        draft={draft}
        ownerSends={ownerSends}
        onPick={(ids) => setDraft((d) => ({ ...d, mailbox_ids: ids }))}
        onOwner={(on) => setDraft((d) => ({ ...d, owner_sends: on }))}
      />
      {onList ? (
        <section className="pb-sec" data-testid="ro-before-new">
          <span className="pb-sec-k">{W.REACH_OUT_SHEET_PARTS.before}</span>
          <p className="pb-when">{W.REACH_OUT_NEW_LIST_WORDS.before}</p>
        </section>
      ) : (
        <RoBefore W={W} ask={ask} of={W.reachOutPreviewOf(reachN)} stale={stale} />
      )}
    </div>
  );
}

interface SheetProps {
  search: { id: string; name: string };
  chain?: ReachOutChainDto | null;
  includeUnconfirmed?: boolean;
  onClose: () => void;
  onDone?: (saved: ReachOutSavedDto) => void;
  /**
   * Where the one door on goes (the run that waits, or the chain's row), for an opener whose address is the sheet's own
   * (Campaigns' home): it replaces that address with the door's, which closes the sheet, where the default is to go there and
   * then close it, which a close that is a step Back would undo.
   */
  onGo?: (route: string) => void;
  /**
   * A list of its own, made as Start is pressed (a new sequence for a lead, or a version): the leads it holds and how they
   * are said, and the sequence it copies. `search` is then the list it will be, by name, with no id yet.
   */
  onList?: { leadIds: readonly string[]; leadName: string; name: string; from: ReachOutChainDto | null } | null;
}

/**
 * The sheet. `search` is { id, name }; `chain` the chain being changed, or null for a new one; `onDone(saved)` hears
 * a save the server took (the opener reads the search again behind it). Saved, the sheet stays and says what its first
 * run did (R14), with Close and the one door on; `onClose` closes it.
 */
export function ReachOutSheet(props: SheetProps) {
  const { search, chain = null, includeUnconfirmed = false, onClose, onDone, onGo, onList = null } = props;
  const W = reachOuts.words;
  const st = useReachOutDraft(W, { search, chain, includeUnconfirmed, onClose, onList });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const settings = useSurface("settings")?.settings;
  const { draft } = st;
  const facts = sheetFacts(W, draft, settings);
  const { unread, pace, ready } = facts;
  // A list of its own holds its leads once Start is pressed: who it is for is the count until then.
  const reachN = onList
    ? onList.leadIds.length
    : st.reach
      ? draft.include_unconfirmed
        ? st.reach.with_unconfirmed
        : st.reach.ready
      : 0;
  const say = error
    ? { tone: "danger", text: error }
    : {
        tone: "plain",
        text:
          unread ||
          W.sheetFootWords({
            share: pace.share,
            gapMinutes: draft.gap_minutes,
            ready: reachN,
            editing: !!chain,
            ownerSends: facts.ownerSends,
          }),
      };
  const body = W.reachOutChainBodyOf({ ...draft, owner_sends: facts.ownerSends }, search.id);
  const ask = (index: number): ReachOutPreviewInput => ({
    search_id: search.id,
    index,
    include_unconfirmed: draft.include_unconfirmed,
    words: { subject: body.steps[0].subject, body: body.steps[0].body },
    signed_by: body.signed_by,
  });
  const start = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    // A list of its own is made first, holding its leads, and the sequence is written on it.
    const made = onList ? await reachOuts.lists.chooseLeads({ name: body.name, lead_ids: [...onList.leadIds] }) : null;
    if (made && !made.ok) {
      setBusy(false);
      return setError(made.message || "");
    }
    const on = made && made.ok ? { ...body, search_id: made.data.search_id } : body;
    const r = chain ? await reachOuts.update(chain.root_id, on) : await reachOuts.save(on);
    setBusy(false);
    if (!r || !r.ok) return setError((r && r.message) || "");
    st.work.done();
    setSaved(W.reachOutSavedWords(r.data));
    if (onDone) onDone(r.data);
  };
  const stale = { key: JSON.stringify([body.steps[0], body.signed_by, draft.include_unconfirmed]) };
  return (
    <RecordSheet
      id="reach-out"
      testid="ro-sheet"
      className="pb-sheet ro-sheet"
      title={sheetTitle({ W, draft, setDraft: st.setDraft, saved: !!saved })}
      sub={W.REACH_OUT_SHEET_WORDS.sub}
      onClose={saved ? onClose : st.work.leave}
      closeLabel={saved ? W.REACH_OUT_SHEET_PARTS.close : W.REACH_OUT_SHEET_PARTS.cancel}
      foot={
        <RoFoot
          W={W}
          work={st.work}
          say={say}
          ready={ready}
          busy={busy}
          editing={!!chain}
          onStart={start}
          saved={saved}
          onClose={onClose}
          onGo={onGo}
        />
      }
    >
      {saved ? <RoSaved saved={saved} /> : composeParts({ W, st, search, facts, ask, reachN, stale, onList })}
    </RecordSheet>
  );
}
