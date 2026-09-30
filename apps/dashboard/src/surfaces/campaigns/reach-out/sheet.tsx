/**
 * The reach-out sheet (moved from legacy/pages/reach-out/reach-out-sheet.jsx, decision 0015; Reach out, Part 4 PR 6;
 * canvas boards 01-04): a chain of emails to a search's leads, written and started in one sheet beside the page, or
 * changed from its Playbooks row or its Templates row. On the house RecordSheet, keeping what was typed in the tab
 * (useUnsavedWork). Its parts, in the canvas's order: who gets it (the search's reach as the database counts it, the
 * unconfirmed addresses a door), what you'd say (the first email's subject and words, the six slots as chips, each
 * problem under its field), then (up to five steps, each after its days), the pace, the domains it sends from, and before
 * it goes (one business's email at a time, by a press: the preview spends the model, R12). Start saves and runs the
 * first step, and the sheet stays open to say what happened (R14), with the one door on: the run that waits, or the
 * chain's row. The domains and the booking link are Setup's and Settings' reads: until they are in, the sheet says it is
 * reading them and Start waits, never "none". Every sentence is contracts' (`reachOuts.words`); every act goes through
 * `reachOuts`. Never a fetch here. Its parts are sheet-fields.tsx and sheet-plan.tsx, its state sheet-draft.ts.
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  ReachOutChainDto,
  ReachOutDraft,
  ReachOutPreviewInput,
  ReachOutSavedDto,
  SendingDomainDto,
} from "@chanlytics/contracts";
import type { SettingsRecord } from "@/legacy-bridge/surfaces/settings";
import { gate, navigate, setupDto, setupFailed, surfaceFailed } from "../../legacy-verbs";
import { recordSheetPart, unsavedAskPart } from "../../legacy-parts";
import type { UnsavedWork } from "../../legacy-parts";
import { Icon } from "../../kit/icon/icon";
import { useSurface } from "../../use-surface";
import { useReachOutDraft } from "./sheet-draft";
import { RoThen, RoWhat, RoWho } from "./sheet-fields";
import { RoBefore, RoFrom, RoPace } from "./sheet-plan";
import { reachOuts } from "./surface";

type Words = typeof reachOuts.words;

/** The sending domains, as Setup read them. */
function roDomains(): SendingDomainDto[] {
  const setup = setupDto();
  const e = setup && setup.email;
  return (e && e.sending && e.sending.domains) || [];
}

/** Whether the workspace has a booking link, as Settings read it. */
function roBookingLink(settings: SettingsRecord | null | undefined): boolean {
  const b = settings && settings.config && settings.config.brain;
  return !!(b && b.booking_link);
}

/** A read the sheet draws from: in, still out, or failed. */
type SheetRead = "in" | "reading" | "failed";

/** Whether a read the sheet draws from is in, still out, or failed (the domains are Setup's; the link, Settings'). */
function roReads(settings: SettingsRecord | null | undefined): { domains: SheetRead; settings: SheetRead } {
  return {
    domains: setupDto() ? "in" : setupFailed() || surfaceFailed("start") ? "failed" : "reading",
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
}

/** The foot: what the chain will do, Cancel, and Start it (or Save, changing one); the one question first when asked. */
function RoFoot({ W, work, say, ready, busy, editing, onStart, saved, onClose }: FootProps) {
  const UnsavedAsk = unsavedAskPart();
  const P = W.REACH_OUT_SHEET_PARTS;
  if (saved)
    return (
      <div className="pb-foot">
        <span className="pb-foot-say" />
        <button type="button" className="btn" onClick={onClose} data-testid="ro-close">
          {P.close}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            navigate(saved.to);
            onClose();
          }}
          data-testid="ro-saved-go"
        >
          {saved.label}
        </button>
      </div>
    );
  if (work.asking)
    return (
      <div className="pb-foot">
        <UnsavedAsk onYes={work.discard} onNo={work.stay} what="saved" testid="ro-leave" />
      </div>
    );
  return (
    <div className="pb-foot">
      <span
        className="pb-foot-say"
        data-tone={say.tone}
        role={say.tone === "danger" ? "alert" : undefined}
        data-testid="ro-foot-say"
      >
        {say.text}
      </span>
      <button type="button" className="btn" onClick={work.leave} data-testid="ro-cancel">
        {P.cancel}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!ready || busy}
        onClick={onStart}
        data-testid="ro-start"
        {...gate("approve", editing ? "change a reach-out" : "start a reach-out")}
      >
        {busy ? (editing ? P.saving : P.starting) : editing ? P.save : P.start}
      </button>
    </div>
  );
}

/** What the sheet reads of Setup and Settings, and what the draft and the domains make of it. */
function sheetFacts(W: Words, draft: ReachOutDraft, settings: SettingsRecord | null | undefined) {
  const domains = roDomains();
  const reads = roReads(settings);
  const unread = W.reachOutSheetUnreadOf(reads);
  const pace = W.reachOutSheetPaceOf(
    domains.map((d) => ({ id: d.id, state: d.state, sent_days: Number(d.sent_days) || 0 })),
    draft.domain_ids,
  );
  // An unread link is not a missing one: its problem is not said until Settings is in, and Start waits for it.
  const issues = W.reachOutDraftIssues(draft, { bookingLink: reads.settings !== "in" || roBookingLink(settings) });
  const ready = !unread && issues.ready && pace.domains > 0;
  const first = domains.find(
    (d) => d.state === "verified" && (draft.domain_ids.length === 0 || draft.domain_ids.includes(d.id)),
  );
  return { domains, reads, unread, pace, issues, ready, first };
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
      <input
        className="pb-title"
        value={draft.name}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
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
}

/** The sheet's parts, in the canvas's order. */
function composeParts(p: ComposeProps) {
  const { W, st, search, facts, ask, reachN, stale } = p;
  const { draft, setDraft } = st;
  const { issues, first, pace, domains, reads, unread } = facts;
  return (
    <div className="pb-compose ro-compose">
      <RoWho
        W={W}
        search={search}
        reach={st.reach}
        include={draft.include_unconfirmed}
        onInclude={(v) => setDraft((d) => ({ ...d, include_unconfirmed: v }))}
      />
      <RoWhat
        W={W}
        draft={draft}
        issues={issues}
        onEdit={st.editStep}
        onFocus={st.focus}
        onSlot={st.slot}
        onSigned={(v) => setDraft((d) => ({ ...d, signed_by: v }))}
        from={first ? `${first.from_name} · ${first.address}` : null}
      />
      <RoThen
        W={W}
        draft={draft}
        issues={issues}
        onEdit={st.editStep}
        onFocus={st.focus}
        onSlot={st.slot}
        onAfter={(n, v) => st.editStep(n, { after_days: v })}
        onAdd={() => setDraft(W.reachOutAddStep)}
        onAddHand={(kind) => setDraft((d) => W.reachOutAddHandStep(d, kind))}
        onHand={(n, v) => setDraft((d) => W.reachOutSetHandWords(d, n, v))}
        onDrop={() => setDraft(W.reachOutDropStep)}
      />
      <RoPace W={W} pace={pace} gap={draft.gap_minutes} onGap={(v) => setDraft((d) => ({ ...d, gap_minutes: v }))} />
      <RoFrom
        W={W}
        domains={domains}
        unread={reads.domains === "in" ? null : unread}
        draft={draft}
        onPick={(ids) => setDraft((d) => ({ ...d, domain_ids: ids }))}
      />
      <RoBefore W={W} ask={ask} of={W.reachOutPreviewOf(reachN)} stale={stale} />
    </div>
  );
}

interface SheetProps {
  search: { id: string; name: string };
  chain?: ReachOutChainDto | null;
  includeUnconfirmed?: boolean;
  onClose: () => void;
  onDone?: (saved: ReachOutSavedDto) => void;
}

/**
 * The sheet. `search` is { id, name }; `chain` the chain being changed, or null for a new one; `onDone(saved)` hears
 * a save the server took (the opener reads the search again behind it). Saved, the sheet stays and says what its first
 * run did (R14), with Close and the one door on; `onClose` closes it.
 */
export function ReachOutSheet({ search, chain = null, includeUnconfirmed = false, onClose, onDone }: SheetProps) {
  const RecordSheet = recordSheetPart();
  const W = reachOuts.words;
  const st = useReachOutDraft(W, { search, chain, includeUnconfirmed, onClose });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const settings = useSurface("settings")?.settings;
  const { draft } = st;
  const facts = sheetFacts(W, draft, settings);
  const { unread, pace, ready } = facts;
  const reachN = st.reach ? (draft.include_unconfirmed ? st.reach.with_unconfirmed : st.reach.ready) : 0;
  const say = error
    ? { tone: "danger", text: error }
    : {
        tone: "plain",
        text:
          unread ||
          W.sheetFootWords({ share: pace.share, gapMinutes: draft.gap_minutes, ready: reachN, editing: !!chain }),
      };
  const body = W.reachOutChainBodyOf(draft, search.id);
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
    const r = chain ? await reachOuts.update(chain.root_id, body) : await reachOuts.save(body);
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
        />
      }
    >
      {saved ? <RoSaved saved={saved} /> : composeParts({ W, st, search, facts, ask, reachN, stale })}
    </RecordSheet>
  );
}
