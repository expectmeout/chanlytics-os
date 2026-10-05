/**
 * Campaigns: one playbook's detail, which a moment, a line or a row of Coming up opens into (moved from
 * legacy/pages/playbook-card.jsx, decision 0015; Reach out Part 2.5). Campaigns' home draws it in a sheet from the side
 * (home/drawer.tsx); it was the pane beside the Playbooks list, which the home replaced (3 Oct 2026).
 *
 * One playbook: what starts it, what it sends, its clock, its mode, what its runs earned, and the verbs. A run that
 * waits for a person is approved or skipped right here, the same doors as on Today and Broadcasts.
 */
import { useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { DELIVERY_RECEIPTS_TIP, PLAYBOOK_DELETE_WORDS, pipelineRoute, poolWords } from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { pageClock } from "@/legacy-bridge/zone";
import { canRestoreList, gate, navigate, restoreList } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import type { MenuItem } from "../../kit/menu/menu";
import { StatePill } from "../../kit/pill/state-pill";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { useSurface } from "../../use-surface";
import { bcWhenWords } from "../broadcasts/when-words";
import { MessagePreview } from "../parts/message-preview";
import { CmPane, useCmPhone } from "../parts/split";
import type { PlaybookCardVM, PlaybookTriggerOption, PlaybooksSurface } from "./surface";
import { playbooks as V } from "./verbs";
import {
  PB_NONE,
  pbDay,
  pbFooter,
  pbIcon,
  pbLangWords,
  pbMessage,
  pbNoNumberWords,
  pbPeople,
  pbReach,
  pbReachDoor,
  pbReachWords,
  pbReplyTip,
  pbSentWhen,
  pbStatus,
  pbTitle,
  pbWrongSlot,
} from "./words";

/** What the toast raises (the shell's one flash). */
export type Flash = (flash: { tone?: string; msg: ReactNode }) => void;

/** A playbook as the surface holds it. */
type PlaybookRow = PlaybookCardVM;

type Waiting = NonNullable<PlaybookCardVM["totals"]["waiting"]>;
type History = PlaybookCardVM["totals"]["history"][number];

/** What an act's verb answers: the API's own, a refusal carrying the sentence for the toast. */
type Outcome<D> = { ok: true; data: D } | { ok: false; message: string };

interface CardProps {
  p: PlaybookRow;
  canAct: boolean;
  onEdit: (p: PlaybookRow) => void;
  flash: Flash;
}

/** The trigger the surface offers for a playbook's moment, or null when the surface has no such one. */
function triggerOption(surface: PlaybooksSurface | undefined, id: string): PlaybookTriggerOption | null {
  return ((surface && surface.triggers) || PB_NONE).find((t) => t.id === id) || null;
}

/**
 * The trigger's list, on People (a smart list's own view); `segments/<id>` would land there too, one hop later. A
 * follow-up's is the Pipeline's own view of the proposals waiting (contracts pipelineRoute).
 */
function cardListRoute(p: PlaybookRow, trig: PlaybookTriggerOption | null): string {
  return p.trigger === "saved_list" && p.list_key
    ? `clients/seg:${p.list_key}`
    : p.trigger === "saved_list" && p.list_id
      ? `clients/list:${p.list_id}`
      : trig && trig.list
        ? `clients/seg:${trig.list}`
        : trig && trig.kind === "deal"
          ? pipelineRoute({ view: "waiting" })
          : "clients/seg:opted_in";
}

/** What the card reads of its playbook and of the surface, worked out once as it draws. */
function cardRead(p: PlaybookRow, surface: PlaybooksSurface | undefined) {
  const waiting = p.totals.waiting;
  const status = pbStatus(p);
  const trig = triggerOption(surface, p.trigger);
  // What its runs send. Templates that could not be read are said once, over the cards; one not among the approved, here.
  const templates = surface?.templates;
  const businessName = surface?.businessName;
  const message = Array.isArray(templates) ? pbMessage(p, templates, businessName) : null;
  const templateGone = Array.isArray(templates) && !message;
  const wrongSlot = message ? pbWrongSlot(p, message.template, surface?.triggers) : null;
  const reach = pbReach({ state: p.state, candidates: p.candidates, held: p.held, waiting });
  const reachWords = pbReachWords(reach);
  // Everyone its moment names, as the tile reads it: whether anybody on it said the yes decides the door and the count.
  const named = p.named || (trig && trig.named) || null;
  const reachDoor = pbReachDoor(reach, named);
  const noNumber = pbNoNumberWords(p, named);
  return {
    waiting,
    status,
    trig,
    businessName,
    message,
    templateGone,
    wrongSlot,
    reachWords,
    reachDoor,
    noNumber,
    named,
    listRoute: cardListRoute(p, trig),
  };
}

interface ActsIn {
  p: PlaybookRow;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setSure: Dispatch<SetStateAction<boolean>>;
  setSkipSure: Dispatch<SetStateAction<boolean>>;
  flash: Flash;
}

/**
 * The verbs a card presses. An act is said the moment the server takes it, from what it answered (`onAccepted`), not once
 * the playbooks and the broadcasts are read again behind it; the card repaints from that re-read, and its buttons wait
 * for it -- a Run now pressed twice before the first run's rows had landed would be two runs.
 */
function cardActs({ p, busy, setBusy, setSure, setSkipSure, flash }: ActsIn) {
  const act = async <D,>(
    fn: (o: { onAccepted: (d: D) => void }) => Promise<Outcome<D>>,
    said: (d: D) => ReactNode,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    let done = false;
    const say = (d: D) => {
      done = true;
      flash({ tone: "ok", msg: said(d) });
    };
    const r = await fn({ onAccepted: say });
    setBusy(false);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    else if (!done) say(r.data);
  };
  const toggle = () =>
    act(
      (o) => (p.state === "paused" ? V.resume(p.id, o) : V.pause(p.id, o)),
      () =>
        p.state === "paused" ? (
          <>
            <b>{p.name}</b> resumed — next run {p.next === "paused" ? "at its hour" : p.next}
          </>
        ) : (
          <>
            <b>{p.name}</b> paused — nothing runs until you resume it
          </>
        ),
    );
  const runNow = () =>
    act(
      (o) => V.runNow(p.id, o),
      (d: Output<"POST playbooks/[id]/run">) =>
        d.outcome === "sent" ? (
          <>
            <b>{p.name}</b> — {pbPeople(d.eligible)}, {pbSentWhen(d)}
          </>
        ) : d.outcome === "held" ? (
          <>
            <b>{p.name}</b> — {pbPeople(d.eligible)} waiting for your approval
          </>
        ) : (
          <>
            <b>{p.name}</b> — nobody new to send to right now
          </>
        ),
    );
  // The server may move the run to nine o'clock: the receipt says when it really goes (broadcasts/when-words.ts bcWhenWords).
  const approve = (waiting: Waiting) =>
    act(
      (o) => V.approveRun(waiting.id, o),
      (d: Output<"POST broadcasts/[id]/approve">) => (
        <>
          <b>{p.name}</b> approved — {pbPeople(d.recipient_count || waiting.recipient_count)}, {bcWhenWords(d)}
        </>
      ),
    );
  const skip = (waiting: Waiting) => {
    setSkipSure(false);
    return act(
      (o) => V.skipRun(waiting.id, o),
      () => (
        <>
          <b>{p.name}</b> — this run skipped, nothing sent
        </>
      ),
    );
  };
  const remove = () => {
    setSure(false);
    void act(
      (o) => V.remove(p.id, o),
      () => (
        <>
          <b>{p.name}</b> {PLAYBOOK_DELETE_WORDS.done}
        </>
      ),
    );
  };
  return { act, toggle, runNow, approve, skip, remove };
}

/** Everything the card's sections read. */
interface CardCtx extends ReturnType<typeof cardRead> {
  p: PlaybookRow;
  canAct: boolean;
  onEdit: (p: PlaybookRow) => void;
  busy: boolean;
  sure: boolean;
  skipSure: boolean;
  setSure: Dispatch<SetStateAction<boolean>>;
  setSkipSure: Dispatch<SetStateAction<boolean>>;
  acts: ReturnType<typeof cardActs>;
}

/** The message first, beside what the rule does with it. */
function cardWords(c: CardCtx) {
  const { p, message, businessName } = c;
  return (
    message && (
      <div className="ob-words" data-testid="pb-words">
        <MessagePreview
          from={businessName}
          body={message.body}
          values={message.values}
          header={message.template.header}
          footer={pbFooter(message.template)}
          buttons={message.template.buttons}
          compact
        />
        {/* Which message this is, captioning the message itself, and in which
            language -- that was a data-tip on a chip, and no finger reaches one.
            It opens the Library, where the same one is renamed or replaced. */}
        <LinkButton className="ob-words-name" onClick={() => navigate("messages")} data-testid="pb-template-name">
          {pbTitle(p.template_name)} <span className="dim">&middot; {pbLangWords(p.template_language)}</span>
        </LinkButton>
      </div>
    )
  );
}

/** Who its moment reaches, as a link that opens them, and who of them wait: nothing where the server could not count. */
function sentenceCounted(c: CardCtx) {
  const { p, trig, noNumber, named, listRoute } = c;
  if (named === null || p.candidates === null || p.held === null) return false;
  return (
    <>
      {" "}
      &mdash;{" "}
      <LinkButton
        className="ob-link"
        data-tip={
          trig && trig.kind === "visit"
            ? "Everyone with a recorded yes — the day's visits are picked from them · click to open them in People"
            : trig && trig.kind === "deal"
              ? "The proposals waiting with nothing back — before their links, their follow-ups and the week's breath · click to open them in the Pipeline"
              : "The list this playbook watches — before the gap and the week's breath · click to open it in People"
        }
        onClick={() => navigate(listRoute)}
        data-testid="pb-audience"
      >
        {noNumber ||
          `${pbPeople(p.candidates)} ${trig && trig.kind === "deal" ? poolWords(p.trigger) : "on the list"} said yes`}
      </LinkButton>
      {/* Why a list with people on it can still offer nobody: one message per
          person per week, across playbooks. A bare "0 people" read as broken. */}
      {p.held > 0 ? <>, and {pbPeople(p.held)} more heard from you this week and wait</> : null}
    </>
  );
}

/** A playbook whose list was archived says so, and offers to bring the list back to a role that may. */
function sentenceArchived(c: CardCtx) {
  const { p, canAct, acts } = c;
  return (
    <>
      Paused &mdash; its list, <b>{p.triggerLabel}</b>, is archived.
      {canAct && canRestoreList() ? (
        <>
          {" "}
          <LinkButton
            className="ob-link"
            onClick={() =>
              acts.act(
                () => restoreList(p.list_id),
                () => (
                  <>
                    <b>{p.triggerLabel}</b> is back; resume the playbook when you want it running
                  </>
                ),
              )
            }
            data-testid="pb-list-restore"
          >
            Bring the list back
          </LinkButton>
          , or edit the playbook to run on another.
        </>
      ) : null}
    </>
  );
}

/** "Next run paused" was the words when it is. A follow-up where deals are off says why it runs nothing. */
function sentenceState(c: CardCtx) {
  const { p, reachWords, reachDoor } = c;
  if (p.off) return <>{p.off}</>;
  if (p.listArchived) return sentenceArchived(c);
  if (p.state === "paused") return <>Paused &mdash; nothing runs until you resume it.</>;
  // The hour was in bold on its own, which promised a send. It keeps
  // the hour and says what the hour will do.
  if (reachWords)
    return (
      <>
        Next run {p.next} &mdash; <b>{reachWords}</b>.
        {reachDoor && (
          <>
            {" "}
            <LinkButton className="ob-link" onClick={() => navigate(reachDoor.to)} data-testid="pb-reach-door">
              {reachDoor.label}
            </LinkButton>
            .
          </>
        )}
      </>
    );
  return (
    <>
      Next run <b>{p.next}</b>.
    </>
  );
}

/** The trigger's hint, who it reaches, the clock, and when it last ran, as one sentence. */
function cardSentence(c: CardCtx) {
  const { p } = c;
  return (
    <p className="ob-sentence">
      {/* The trigger's hint is a CONDITION, not an audience -- "Nothing heard
          in 30 days", "Only ever phoned, never texted" -- so "Goes to" in
          front of it was broken English on five of the six triggers. It
          leads, and the count follows it. */}
      {p.triggerHint}
      {sentenceCounted(c)}. {p.schedule}. {sentenceState(c)}
      {p.last_run_for ? <> Last ran {pbDay(p.last_run_for)}.</> : <> It has not run yet.</>}
    </p>
  );
}

/** The sentence, what is wrong with the message, and what the runs earned. */
function cardFacts(c: CardCtx) {
  const { p, canAct, onEdit, templateGone, wrongSlot } = c;
  return (
    <div className="ob-facts">
      {cardSentence(c)}
      {templateGone && (
        <p className="bc-excl-hint warn" data-testid="pb-template-gone">
          Its message is no longer approved by WhatsApp, so its runs are skipped until it is approved again or the
          playbook sends another.
        </p>
      )}
      {wrongSlot && (
        <p className="bc-excl-hint warn" data-testid="pb-slot-wrong">
          Its message reads wrong: {wrongSlot}
          {canAct ? (
            <>
              {" "}
              <LinkButton className="ob-link" onClick={() => onEdit(p)} data-testid="pb-slot-wrong-edit">
                Edit it
              </LinkButton>
              , and each slot takes what it should.
            </>
          ) : null}
        </p>
      )}
      {/* What its runs earned, as ONE sentence rather than five numbers with
          dots between them. Numbers read as a sentence here the way they do on
          Today, Reports and People; each run below still says its own. */}
      {/* One run says itself once: the row below carries the same numbers
          with its date and its door, and the two disagreed about which
          numbers to show. The sum is worth a sentence once there is a sum. */}
      {p.totals.runs > 1 && (
        <p className="ob-sentence ob-sentence-dim" data-testid="pb-results">
          <span className="tabular">{p.totals.runs}</span> {p.totals.runs === 1 ? "run" : "runs"} so far:{" "}
          <span className="tabular">{p.totals.sent}</span> sent,{" "}
          <span className="tabular" data-tip={DELIVERY_RECEIPTS_TIP}>
            {p.totals.delivered}
          </span>{" "}
          delivered,{" "}
          <span className="tabular" data-tip={pbReplyTip()}>
            {p.totals.replied}
          </span>{" "}
          wrote back
          {p.totals.held > 0 ? (
            <>
              , <span className="tabular">{p.totals.held}</span> held back
            </>
          ) : null}
          .
        </p>
      )}
    </div>
  );
}

/** One run, as a line that opens as itself on Broadcasts (broadcasts/run:<id>), read by its id however old it is. */
function historyRow(h: History) {
  return (
    <LinkButton
      key={h.id}
      className="cl-prof-aut-hint ob-history-row"
      onClick={() => navigate(`broadcasts/run:${h.id}`)}
      data-testid="pb-run-open"
    >
      <span className="tabular">{pbDay(h.run_for || (h.scheduled_for ? h.scheduled_for.slice(0, 10) : ""))}</span>
      {" · "}
      {h.state === "sent" ? (
        <>
          {h.sent} sent{h.delivered > 0 ? `, ${h.delivered} delivered` : ""}
          {h.held > 0 ? `, ${h.held} held` : ""}
          {h.replied > 0 ? `, ${h.replied} replied` : ""}
        </>
      ) : h.state === "pending_approval" ? (
        `waiting for you · ${h.recipient_count} people`
      ) : h.state === "sending" ? (
        `sending · ${h.sent} so far`
      ) : h.state === "scheduled" ? (
        `scheduled · ${h.recipient_count} people`
      ) : (
        h.state
      )}
      <Icon name="arrow-right" size={10} />
    </LinkButton>
  );
}

/**
 * The runs themselves, newest first, from the same rows the totals are summed over -- every run, not the recent fifty
 * broadcasts of any kind.
 */
function cardHistory(c: CardCtx) {
  const { p } = c;
  return (
    p.totals.history &&
    p.totals.history.length > 0 && (
      <div className="ob-history" data-testid="pb-history">
        {/* Each run opens as itself on Broadcasts (broadcasts/run:<id>), read by its id however old it is. */}
        {p.totals.history.map((h) => historyRow(h))}
        {p.totals.runs > p.totals.history.length && (
          <span className="ob-history-more" data-testid="pb-history-more">
            The newest {p.totals.history.length} of {p.totals.runs} runs
          </span>
        )}
      </div>
    )
  );
}

/** A run waiting on a person: Approve, the card's one filled act, for every role (it says who may), and Skip, which asks. */
function cardWaitActs(c: CardCtx) {
  const { p, canAct, busy, skipSure, setSkipSure, waiting, acts } = c;
  if (!waiting) return null;
  if (canAct && skipSure) {
    return (
      <Confirm
        question={`Skip this run of ${p.name}?`}
        detail="Nothing sends, and the run closes."
        yes="Yes, skip it"
        danger
        busy={busy}
        onYes={() => acts.skip(waiting)}
        onNo={() => setSkipSure(false)}
        testid="pb-skip"
      />
    );
  }
  return (
    <>
      {canAct && (
        <Button size="sm" disabled={busy} onClick={() => setSkipSure(true)} data-testid="pb-skip">
          Skip this run
        </Button>
      )}
      <Button
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={() => void acts.approve(waiting)}
        data-testid="pb-approve"
        {...(canAct ? {} : gate("approve", "approve a run"))}
      >
        <Icon name="check" size={12} /> Approve · {pbPeople(waiting.recipient_count)}
      </Button>
    </>
  );
}

/**
 * What a role that may change it does to it, at the head of its pane: Pause or Resume and Edit in words, and behind the
 * kit's menu the two that are pressed least and cost most -- Run now, and Delete, which asks first. They were five
 * buttons in a row under the card, the red Delete among them.
 */
function cardOwnActs(c: CardCtx, phone = false) {
  const { p, canAct, busy, sure, setSure, waiting, acts, onEdit } = c;
  if (!canAct) return null;
  const hours = pageClock().hours;
  // On a phone the pane's head is a capsule a thumb wide: every act is the menu's, as a thread's Actions are.
  const words: MenuItem[] = phone
    ? [
        {
          label: p.state === "paused" ? "Resume" : "Pause",
          glyph: <Icon name={p.state === "paused" ? "play" : "pause"} size={13} />,
          disabled: busy,
          onSelect: () => void acts.toggle(),
        },
        { label: "Edit", glyph: <Icon name="pencil" size={13} />, disabled: busy, onSelect: () => onEdit(p) },
      ]
    : [];
  const more: MenuItem[] = [
    ...words,
    ...(p.state === "running" && !waiting
      ? [
          {
            label: "Run now",
            glyph: <Icon name="bolt" size={13} />,
            title: `Runs it now, at your request — sends unless its class is set to Never; outside ${hours.range} it goes at ${hours.first}`,
            disabled: busy,
            onSelect: () => void acts.runNow(),
          },
        ]
      : []),
    {
      label: "Delete…",
      glyph: <Icon name="x" size={13} />,
      tone: "danger",
      disabled: busy,
      onSelect: () => setSure(true),
    },
  ];
  return (
    <>
      {phone ? null : (
        <>
          <Button size="sm" disabled={busy} onClick={() => void acts.toggle()} data-testid="pb-pause">
            <Icon name={p.state === "paused" ? "play" : "pause"} size={12} />{" "}
            {p.state === "paused" ? "Resume" : "Pause"}
          </Button>
          <Button variant="quiet" size="sm" disabled={busy} onClick={() => onEdit(p)} data-testid="pb-edit">
            Edit
          </Button>
        </>
      )}
      {sure ? null : (
        <Menu
          label={`More for ${p.name}`}
          trigger={
            <Button variant="quiet" size="sm" iconOnly aria-label={`More for ${p.name}`} data-testid="pb-more">
              <Icon name="more" size={14} />
            </Button>
          }
          groups={[{ items: more }]}
        />
      )}
    </>
  );
}

/** Delete, asked: the one question, where the acts were. */
function cardDeleteAsk(c: CardCtx) {
  const { p, canAct, busy, sure, setSure, acts } = c;
  if (!canAct || !sure) return null;
  return (
    <Confirm
      question={`Delete ${p.name}?`}
      detail={PLAYBOOK_DELETE_WORDS.detail}
      yes="Yes, delete"
      danger
      busy={busy}
      onYes={acts.remove}
      onNo={() => setSure(false)}
      testid="pb-delete"
    />
  );
}

/** What the card says: the message beside what the rule does with it, then its runs, newest first. */
function cardBody(c: CardCtx) {
  return (
    <>
      {/* The message first, beside what the rule does with it.
          The card led with the trigger, the schedule, the audience, the template's
          NAME and the next run -- five chips and a meta line -- and the thing that
          actually reaches a customer was two clamped lines at 12px in --ink-muted,
          under a "Show the whole message" toggle. A playbook IS a message, a list
          and a clock; the message goes first and the rest is one sentence. */}
      <div className="ob-body">
        {cardWords(c)}
        {cardFacts(c)}
      </div>

      {/* The runs themselves, newest first, from the same rows the totals are
          summed over -- every run, not the recent fifty broadcasts of any kind. */}
      {cardHistory(c)}
    </>
  );
}

/** A playbook's state and verbs, held once for the pane it is open in (Campaigns' home draws it in a sheet). */
function useCard({ p, canAct, onEdit, flash }: Pick<CardProps, "p" | "canAct" | "onEdit" | "flash">): CardCtx {
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  // Skip asks first, as it does on Broadcasts, with a question of its own apart from the delete's.
  const [skipSure, setSkipSure] = useState(false);
  const surface = useSurface("playbooks");
  const read = cardRead(p, surface);
  const acts = cardActs({ p, busy, setBusy, setSure, setSkipSure, flash });
  return { ...read, p, canAct, onEdit, busy, sure, skipSure, setSure, setSkipSure, acts };
}

interface PaneProps {
  p: PlaybookRow;
  canAct: boolean;
  onEdit: (p: PlaybookRow) => void;
  flash: Flash;
  onClose: () => void;
}

/**
 * The playbook open, in the pane beside the list (parts/split.tsx), as a thread opens beside the Inbox's: its mark, name,
 * state and what starts it, with Pause, Edit and the rest at the head; what it sends, its sentence and its runs in the
 * body; and a run waiting on you, or a delete asked, in the foot. It opened under its own row, which pushed every row
 * after it down by the card's height, the list's columns over a card that had none.
 */
export function PlaybookPane({ p, canAct, onEdit, flash, onClose }: PaneProps) {
  const c = useCard({ p, canAct, onEdit, flash });
  const phone = useCmPhone();
  const { status, reachWords, waiting } = c;
  const asking = cardDeleteAsk(c);
  const foot = asking ? (
    <div className="pb-pane-foot">{asking}</div>
  ) : waiting ? (
    <div className="pb-pane-foot">
      <span className="pb-pane-foot-say" data-testid="pb-waiting">
        This run waits on you
      </span>
      {cardWaitActs(c)}
    </div>
  ) : null;
  return (
    <CmPane
      testid="pb-pane"
      className="pb-pane"
      mark={
        <span className="mark pb-row-mark" aria-hidden="true">
          <Icon name={pbIcon(p.trigger)} size={13} />
        </span>
      }
      title={p.name}
      badge={
        <StatePill
          kind="playbook"
          value={status === "paused" ? "paused" : status === "approval" ? "approval" : "running"}
        />
      }
      sub={p.triggerHint}
      tools={cardOwnActs(c, phone)}
      foot={foot}
      onClose={onClose}
    >
      <div className="ob-card-detail" data-testid="pb-detail" data-state={status}>
        {(reachWords || p.policy_class) && (
          <div className="ob-head ob-head-bare">
            {reachWords && (
              <span className="ob-reach" data-testid="pb-reach">
                {reachWords}
              </span>
            )}
            <PolicyChip cls={p.policy_class} />
          </div>
        )}
        {cardBody(c)}
      </div>
    </CmPane>
  );
}
