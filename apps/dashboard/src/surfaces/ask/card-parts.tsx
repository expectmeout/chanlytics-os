/**
 * A card's parts, as the Line draws them (the spec 2026-09-27-ask-chat-on-a-phone, D16): who or what it touches, the change
 * as it will land, what follows, then one act. AskCard (card.tsx) holds its state and its verbs.
 */
import { useState } from "react";
import type { AskCardSheet, AskProposal, AskProposalOutcome } from "@chanlytics/contracts";
import { PROPOSAL_GATE } from "@chanlytics/contracts/page-specs";
import { SEARCH_CARD_REPLACED } from "@chanlytics/contracts";
import { Confirm } from "../kit/confirm/confirm";
import { Icon } from "../kit/icon/icon";
import { askCalls, gate } from "./shell";
import type { LineWords } from "./words";

// Each kind a source names (contracts ASK_CITATION_KINDS) as the mark before its row, the page's own glyph where its
// page has one: a thread or a conversation is a chat. A scope's run is the Broadcasts row a citation calls a broadcast.
// A list's card and a run's card (AT_CARD_ICONS) are marked as their rows are.
const AT_KIND_GLYPHS: Record<string, string> = {
  thread: "chat",
  conversation: "chat",
  call: "phone",
  person: "users",
  page: "arrow-right",
  lead: "star",
  search: "search",
  deal: "deal",
  list: "filter",
  broadcast: "wave",
  run: "wave",
  playbook: "bolt",
  ad: "arrow-right",
  template: "content",
  mailbox: "mail",
  visit: "calendar",
  review: "star",
};
/** A kind's mark, for a row in an answer and for the scope the Line carries; a kind it does not know is a chat. */
export const askKindGlyph = (kind: string): string => AT_KIND_GLYPHS[kind] || "chat";
// A card is who or what it touches, the change as it will land, what follows, then one act (the spec
// 2026-09-27-ask-chat-on-a-phone, D16); these are its parts, and AskCard below holds its state and its verbs.

// Each card's kind as the mark in its tile: a list's card and a run's card are marked as their rows are.
const AT_CARD_ICONS: Record<string, string> = {
  reply: "chat",
  steer: "chat",
  whisper: "phone",
  call_hand_over: "phone",
  invite: "users",
  policy: "shield",
  settings: "settings",
  person_mode: "settings",
  person_mode_many: "settings",
  thread_verb: "inbox",
  broadcast: "wave",
  playbook: "bolt",
  playbook_channels: "bolt",
  playbook_change: "bolt",
  sequence_make: "bolt",
  sequence_step: "bolt",
  sequence_step_remove: "bolt",
  sequence_words: "bolt",
  sequence_start: "bolt",
  sequence_leave: "bolt",
  sequence_send_decide: "wave",
  sequence_send_said: "wave",
  booking_request: "calendar",
  fact_suggestion: "edit",
  sequence_draft: "bolt",
  sequence_discard: "bolt",
  lead_search: "search",
  people_search: "search",
  lead_search_more: "search",
  lead_stage: "search",
  lead_mark: "search",
  lead_later: "search",
  leads_bulk: "search",
  leads_check: "search",
  lead_addressee: "search",
  lead_list: "search",
  reach_out_said: "search",
  reach_out_add: "wave",
  reach_out_make: "wave",
  deal: "users",
  note: "edit",
  note_many: "edit",
  follow_up: "edit",
  answer_style: "settings",
  person_details: "user",
  person_add: "user",
  person_merge: "users",
  person_message: "chat",
  answer: "shield",
  answer_many: "shield",
  review_reply: "chat",
  list: askKindGlyph("list"),
  list_member: askKindGlyph("list"),
  list_change: askKindGlyph("list"),
  list_delete: askKindGlyph("list"),
  run: askKindGlyph("run"),
  message: askKindGlyph("template"),
  memory: "sparkle",
  memory_change: "sparkle",
  memory_forget: "sparkle",
  fix: "alert",
};

// The card's head: the kind's mark in its tile, the title, and the kind's word under it.
export const AskCardHead = ({ p, t }: { p: AskProposal; t: LineWords }) => {
  const KIND: Record<string, string> = {
    reply: t.kReply,
    steer: t.kSteer,
    thread_verb: t.kInbox,
    person_mode: t.kPerson,
    person_mode_many: t.kPerson,
    policy: t.kAutonomy,
    settings: t.kSettings,
    whisper: t.kWhisper,
    call_hand_over: t.kCall,
    invite: t.kTeam,
    broadcast: t.kBroadcast,
    playbook: t.kPlaybook,
    playbook_channels: t.kPlaybook,
    playbook_change: t.kPlaybook,
    sequence_make: t.kSequence,
    sequence_step: t.kSequence,
    sequence_step_remove: t.kSequence,
    sequence_words: t.kSequence,
    sequence_start: t.kSequence,
    sequence_leave: t.kSequence,
    sequence_send_decide: t.kColdEmail,
    sequence_send_said: t.kColdEmail,
    booking_request: t.kBooking,
    sequence_draft: t.kSequence,
    sequence_discard: t.kSequence,
    lead_search: t.kLeads,
    people_search: t.kLeads,
    lead_search_more: t.kLeads,
    lead_stage: t.kLeads,
    lead_mark: t.kLeads,
    lead_later: t.kLeads,
    leads_bulk: t.kLeads,
    leads_check: t.kLeads,
    lead_addressee: t.kLeads,
    lead_list: t.kLeads,
    reach_out_said: t.kLeads,
    reach_out_add: t.kColdEmail,
    reach_out_make: t.kColdEmail,
    deal: t.kDeal,
    note: t.kNote,
    note_many: t.kNote,
    follow_up: t.kFollowUp,
    answer_style: t.kStyle,
    person_details: t.kDetails,
    person_add: t.kPeople,
    person_merge: t.kPeople,
    person_message: t.kMessage,
    answer: t.kAnswer,
    answer_many: t.kAnswer,
    review_reply: t.kReview,
    list: t.kList,
    list_member: t.kList,
    list_change: t.kList,
    list_delete: t.kList,
    run: t.kRun,
    message: t.kMessage,
    memory: t.kMemory,
    memory_change: t.kMemory,
    memory_forget: t.kMemory,
    fix: t.kFix,
  };
  return (
    <div className="ask-card-head">
      <span className="ask-card-mark">
        <Icon name={AT_CARD_ICONS[p.kind] || "inbox"} size={15} />
      </span>
      <span className="ask-card-name">
        <span className="ask-card-title">{p.title}</span>
        <span className="ask-card-kind">{KIND[p.kind] || p.kind}</span>
      </span>
    </div>
  );
};

// A card's change as a sheet (contracts AskCardSheet): what holds it first, in the warn tone, then a row a fact on a
// key column, the way an owner checks a campaign before they press it (the answer canvas, C1).
export const AskSheet = ({ sheet }: { sheet: AskCardSheet }) => (
  <div className="ask-spec" data-testid="ask-card-sheet">
    {(sheet.holds || []).map((h, i) => (
      <p key={i} className="ask-spec-hold">
        {h}
      </p>
    ))}
    <dl className="ask-spec-rows">
      {sheet.rows.map((r) => (
        <div key={r.label} className="ask-spec-row">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  </div>
);

// The change as it will land, on the sunken ground: a reply as the sent bubble it will be, a campaign or a send as its
// sheet, anything else its summary.
// Before the act a reply's warnings stand under it, and while it can go as it is (its window open), its undo's own
// words say what follows; with the window shut only a template can go, and the note says so instead.
// A message the card writes is drawn whole, each version under its channel's word as the person reached on it reads
// it, and when each goes and who it reaches under them (its summary, which quotes them, is the model's).
/** A version of the message a card writes, as the person reached on it reads it. */
interface CardVersion {
  channel: string;
  label: string;
  words: string;
}

export const AskCardChange = ({ p, t, idle }: { p: AskProposal; t: LineWords; idle: boolean }) => {
  const pl = p.payload || {};
  const reply = p.kind === "reply";
  const shut = pl.window_open === false;
  const written = p.kind === "message" && Array.isArray(pl.said) ? (pl.said as CardVersion[]) : null;
  return (
    <>
      <div className={`ask-card-change${reply ? " bubble" : ""}`}>
        {written ? (
          <div className="ask-card-said" data-testid="ask-card-versions">
            {written.map((v) => (
              <p key={v.channel} className="ask-card-summary">
                <span className="ask-card-kind">{v.label}</span>
                {"\n"}
                {v.words}
              </p>
            ))}
          </div>
        ) : p.sheet && p.sheet.rows && p.sheet.rows.length ? (
          <AskSheet sheet={p.sheet} />
        ) : (
          <p className="ask-card-summary">{p.kind === "fix" && p.line ? p.line : p.summary}</p>
        )}
      </div>
      {written && pl.follows ? <p className="ask-card-foot">{pl.follows as string}</p> : null}
      {reply && idle && pl.price_warning ? <div className="ask-card-note">{t.priceNote}</div> : null}
      {reply && idle && shut ? <div className="ask-card-note">{t.windowNote}</div> : null}
      {reply && idle && !shut && p.undo ? <p className="ask-card-foot">{p.undo}</p> : null}
    </>
  );
};

// Before the act: Approve (Send on a reply), Edit in the composer on a reply, Open where the answer does not already
// offer the place (`hideOpen`, oneDoor; where it goes is the contract's cardOpenRoute), and Not now apart. The role gate
// the card's spec names (contracts PROPOSAL_GATE) is drawn by the shell's rule (window.gate): a role that may not approve
// the card still sees Approve, hears why at the control, and a press does nothing. The route re-checks. A plan's send
// that waits for a step not made yet says so in the kit's state pill in Approve's place (`waits`, contracts planGroupOf).
// A card of the one thing to fix before a campaign can reach anyone commits nothing: its door, named by the card, stands
// in Approve's place and opens where it is fixed (the 30 Oct 2026 review, item 6).
export const AskCardActs = ({
  p,
  t,
  busy,
  waits,
  hideOpen,
  onApprove,
  onDismiss,
  onNav,
  press = null,
}: {
  p: AskProposal;
  t: LineWords;
  busy: boolean;
  waits: string | null;
  hideOpen: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onNav: (to: string) => void;
  press?: { label: string; disabled: boolean } | null;
}) => {
  const A = askCalls();
  const pl = p.payload || {};
  const gateKey = PROPOSAL_GATE[p.kind] || "approve";
  const openRoute = A && A.cardOpenRoute ? A.cardOpenRoute(p) : null;
  if (p.kind === "fix")
    return (
      <div className="ask-card-actions">
        {typeof pl.to === "string" && pl.door ? (
          <button className="btn btn-primary btn-sm" onClick={() => onNav(pl.to as string)} data-testid="ask-card-door">
            {pl.door as string}
          </button>
        ) : null}
        <button className="btn btn-ghost btn-sm ask-card-not-now" onClick={onDismiss} disabled={busy}>
          {t.notNow}
        </button>
      </div>
    );
  return (
    <div className="ask-card-actions">
      {waits ? (
        <span className="pill" data-testid="ask-card-waits">
          {waits}
        </span>
      ) : null}
      {waits ? null : (
        <button
          className="btn btn-primary btn-sm"
          onClick={onApprove}
          disabled={busy || !!(press && press.disabled)}
          data-testid="ask-card-approve"
          {...gate(gateKey, "approve this card")}
        >
          {busy ? t.working : press ? press.label : p.kind === "reply" ? t.send : t.approve}
        </button>
      )}
      {p.kind === "reply" && pl.conversation_id ? (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            onNav(`inbox/th-${pl.conversation_id as string}`);
            if (A) A.editReply(p);
          }}
        >
          {t.editComposer}
        </button>
      ) : null}
      {openRoute && !hideOpen ? (
        <button className="btn btn-ghost btn-sm" onClick={() => onNav(openRoute)}>
          {/^campaigns\/sequences\/new(:|$)/.test(openRoute) ? t.openNew : t.openIt}
        </button>
      ) : null}
      <button className="btn btn-ghost btn-sm ask-card-not-now" onClick={onDismiss} disabled={busy}>
        {t.notNow}
      </button>
    </div>
  );
};

// The take-back clock: a hairline ring emptying over a send's own window, drawn where the window stands (a card drawn
// again mid-window starts part-empty) and running for what is left of it. Its end is the window's: `onDone` is the
// animation's own end, which comes at the same moment under reduced motion, where the ring holds still (ask.css).
const AT_RING = 40.84; // the ring's length, 2π × 6.5 (ask.css .ask-ring-arc)
const AskRing = ({ from, until, onDone }: { from: number; until: number; onDone: () => void }) => {
  const [at] = useState(() => Date.now());
  const gone = Math.min(1, Math.max(0, (at - from) / Math.max(1, until - from)));
  return (
    <svg
      className="ask-card-ring"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-testid="ask-card-ring"
    >
      <circle className="ask-ring-track" cx="8" cy="8" r="6.5" />
      <circle
        className="ask-ring-arc"
        cx="8"
        cy="8"
        r="6.5"
        transform="rotate(-90 8 8)"
        style={{ strokeDashoffset: AT_RING * gone, animationDuration: `${Math.round(Math.max(1, until - at))}ms` }}
        onAnimationEnd={onDone}
      />
    </svg>
  );
};

// After the act, one line on the sunken ground: what happened, and the undo the verb has while it is still true (`open`,
// contracts askUndoOpen). A send that can still be taken back leads with its clock and says Undo, its own words the
// button's title; the ring's end takes the Undo with it. Undoing a new playbook deletes it, so that undo asks first.
export const AskCardReceipt = ({
  p,
  t,
  state,
  receipt,
  err,
  open,
  undoData,
  doneAt,
  busy,
  onUndo,
  onRetry,
}: {
  p: AskProposal;
  t: LineWords;
  state: AskProposalOutcome["state"] | "idle";
  receipt: string;
  err: string;
  open: boolean;
  undoData: AskProposalOutcome["undo"];
  doneAt: number;
  busy: boolean;
  onUndo: () => Promise<void>;
  onRetry: () => void;
}) => {
  const [armed, setArmed] = useState(false);
  const [ended, setEnded] = useState(false);
  const until =
    open && undoData && typeof undoData.cancelable_until === "string" ? Date.parse(undoData.cancelable_until) : 0;
  const clock = until > 0 && !ended;
  const can = open && !ended;
  const undoArmed = async () => {
    await onUndo();
    setArmed(false);
  };
  return (
    <div className="ask-card-receipt">
      {clock ? (
        <AskRing from={doneAt} until={until} onDone={() => setEnded(true)} />
      ) : (
        <Icon
          name={state === "done" ? "check" : state === "failed" ? "alert" : "x"}
          size={11}
          className={state === "done" ? "ok" : ""}
        />
      )}
      <span className="ask-card-said">
        {state === "failed"
          ? err || receipt
          : state === "dismissed"
            ? receipt === SEARCH_CARD_REPLACED
              ? t.changedBelow
              : t.notNow
            : receipt}
      </span>
      {can && !armed ? (
        <button
          className="btn btn-ghost btn-sm ask-card-undo"
          onClick={p.kind === "playbook" ? () => setArmed(true) : onUndo}
          disabled={busy}
          title={clock ? (p.undo ?? undefined) : undefined}
        >
          {clock ? t.undo : p.undo}
        </button>
      ) : null}
      {can && armed ? (
        <Confirm
          question={`${p.undo as string}?`}
          detail={t.undoCampaignDetail}
          yes={t.undoCampaignYes}
          danger
          busy={busy}
          onYes={undoArmed}
          onNo={() => setArmed(false)}
          testid="ask-card-undo"
        />
      ) : null}
      {state === "failed" ? (
        <button className="btn btn-ghost btn-sm ask-card-undo" onClick={onRetry}>
          {t.tryAgain}
        </button>
      ) : null}
    </div>
  );
};
