/**
 * The lead sheet's dock, in every state (the canvas "Lead sheet, redesigned", 1 Nov 2026): only what to press, each press
 * saying what it does, the card above it saying why. For a lead to decide on, Not a fit, Later and Add to the pick (▾ the
 * picker), or Add to a sequence where nothing is picked; while a sequence has them, what needs you there, by its own
 * reading of their place (contracts sequence-place.ts): an OK to give, a held email's answers, an email to send, a reply
 * to answer, or a reply to tell where none is read. Where it runs and nothing needs you, no primary, only the quiet ways
 * on: Take out, asked first, and your own call or email (the review of 4 Nov 2026: an empty foot read as "nothing can be
 * done here", and Take out sat two presses deep). Every step gone and no reply: the way on is yours, a call or an email.
 * One press at most is the primary. Every sentence is here.
 *
 *   leadDockOf          the dock: its presses, by the lead's state and its place
 *   leadLeaveAskOf      what Take out asks, and what the sheet asks once you wrote to them yourself
 */
import { runApproveWords } from "../../shell/campaign-rooms";
import { heldAnswersOf, heldOwnWordsOf, waitingAnswersOf, type HeldAnswer } from "../../sequences/sequence-held";
import type { SequencePlaceDto } from "../../sequences/sequence-place";
import type { SequenceState } from "../../sequences/sequence";
import {
  LEAD_SHEET_WORDS,
  sheetSlot as slot,
  type LeadSheetClosedVM,
  type LeadSheetSlotVM,
  type LeadSheetState,
} from "./lead-sheet";

/* -------------------------------------------------------------------------------------------- the dock -------- */

/** The dock: Not a fit and Later as round glyphs, its quieter presses, the one primary, and what its caret holds. */
export interface LeadSheetDockVM {
  /** Not a fit and Later, the round glyphs before the acts, where the lead is to decide on. */
  x: boolean;
  later: boolean;
  /** The quieter presses, before the primary. */
  others: LeadSheetSlotVM[];
  primary: LeadSheetSlotVM | null;
  /** The primary's caret: other ways to answer the same thing. Empty where it has none. */
  more: LeadSheetSlotVM[];
  /** Their email handed over: the row every To send draws stands in the acts' place. */
  toSend: boolean;
}

export const LEAD_DOCK_WORDS = {
  notFit: "Not a fit",
  later: "Later",
  addTo: (name: string) => `Add to ${name}`,
  addToOne: "Add to a sequence",
  choose: "Choose where it goes",
  otherWays: "Other ways to answer",
  checking: "Checking the mailbox…",
  call: "Call",
  moveTo: (name: string) => `Move to ${name}`,
  open: (name: string) => `Open ${name}`,
  putBack: "Put back",
  ready: "Move back to Ready",
  exclude: "Leave out",
  keep: "Keep",
  approve: runApproveWords,
  writing: "Waits for its opening to be written",
  theyWrote: "They wrote back…",
  answer: "Answer",
  takeOut: "Take out",
  write: "Write to them",
} as const;

const D = LEAD_DOCK_WORDS;

/**
 * What Take out asks where nothing else needs you: this sequence, what happens after, and the way to stop every one (the
 * stop door's own Never write to them again) under it. Once you said you sent an email of your own, the same question,
 * said for why: the send door still writes to a lead you marked contacted. A call needs no such question: one that
 * reached them moves the lead past what the door writes to (outreachRefusalOf), and the rest leave it running.
 */
export const LEAD_LEAVE_WORDS = {
  question: (name: string, sequence: string) => `Take ${name} out of ${sequence}?`,
  nothingMore: "Nothing more goes to them from it.",
  putBack: "Nothing went to them yet, so you can put them back.",
  wrote: "You wrote to them yourself. Its next email would still go.",
  yes: "Take out",
  no: "Keep them in",
  keepGoing: "Keep it going",
} as const;

/** What Take out asks: the question, what follows, the way to stop every sequence (none once you wrote), and its answers. */
export interface LeadLeaveAskVM {
  question: string;
  detail: string;
  never: string | null;
  yes: string;
  no: string;
}

/** Take out, asked: out of the sequence their place stands in, said for why where an email of your own asks it. */
export function leadLeaveAskOf(p: { name: string; place: SequencePlaceDto; wrote: boolean }): LeadLeaveAskVM {
  const L = LEAD_LEAVE_WORDS;
  const sent = p.place.sends.some((s) => s.sent_at);
  return {
    question: L.question(p.name, p.place.sequence.name),
    detail: p.wrote ? L.wrote : sent ? L.nothingMore : L.putBack,
    never: p.wrote ? null : LEAD_SHEET_WORDS.menu.never,
    yes: L.yes,
    no: p.wrote ? L.keepGoing : L.no,
  };
}

/** What the dock is read from, beside the state and the place. */
export interface LeadSheetDockFacts {
  state: LeadSheetState;
  place: SequencePlaceDto | null;
  /** Where Add goes: the search's pick; null where nothing is picked yet. */
  pick: { id: string; name: string; state: SequenceState } | null;
  /** Why Add is off for this lead in the pick (the add door's answer, or a hole); null when it would go. */
  blocked: string | null;
  /**
   * The sequence that has them, where it is not the pick (their place, else the add door's answer): whether it wrote to
   * them already, which keeps them there.
   */
  elsewhere: { id: string | null; name: string; written: boolean } | null;
  canCall: boolean;
  /** An email of your own can be written to them here: an address that reaches them, and the sheet's own page. */
  canWrite: boolean;
  /** A search holds the lead: Later puts it off in this pass. */
  canLater: boolean;
  closed: LeadSheetClosedVM | null;
  /** How many an OK sends in the batch that waits with them (the record's count), where it is known. */
  batch?: number;
}

const dock = (p: Partial<LeadSheetDockVM>): LeadSheetDockVM => ({
  x: false,
  later: false,
  others: [],
  primary: null,
  more: [],
  toSend: false,
  ...p,
});

/** An answer to an email, as a press of the dock: the decide verb's door, or the leave verb. */
const answerSlot = (a: HeldAnswer): LeadSheetSlotVM =>
  a.door === "take_out"
    ? slot("take_out", a.words, "ban", "n")
    : slot("decide", a.words, a.door === "skip" ? "ban" : "check", null, { door: a.door });

/** Whether an answer leaves this email out, the quiet press beside the primary. */
const leavesOut = (a: HeldAnswer) => a.door === "take_out" || a.door === "skip";

/**
 * A held email's answers (contracts heldAnswersOf): the first that lets it go or fixes it is the primary, the one that
 * leaves it out stands beside it, and the rest are under the caret.
 */
function heldDock(place: SequencePlaceDto): LeadSheetDockVM {
  const { why, hold_detail: detail, place: at, own } = place.place;
  const asked = heldAnswersOf({ reason: why, detail }, at);
  const answers = own ? heldOwnWordsOf({ why: "", answers: asked }).answers : asked;
  const [first, ...rest] = answers.filter((a) => !leavesOut(a));
  return dock({
    others: answers.filter(leavesOut).map(answerSlot),
    primary: first ? answerSlot(first) : null,
    more: rest.map(answerSlot),
  });
}

/** An email waiting for your OK: leaving this one out, and Approve, which sends every email an OK sends. */
function waitingDock(f: LeadSheetDockFacts, place: SequencePlaceDto): LeadSheetDockVM {
  const { place: at, checked, own } = place.place;
  const no = waitingAnswersOf({ opening: null, checking: false }, at).filter(leavesOut);
  const writing = checked === false && !own;
  return dock({
    others: no.map(answerSlot),
    primary: slot("approve", D.approve(f.batch ?? 1), "check", "a", { off: writing ? D.writing : null }),
  });
}

/** Sent by hand from an inbox nobody reads here: only you can say a reply came (They wrote back…). */
const toldOf = (place: SequencePlaceDto): LeadSheetSlotVM | null =>
  place.reads_replies || !place.sends.some((s) => s.sent_at) ? null : slot("they_wrote", D.theyWrote, "chat", "a");

/** Your own ways to them: a call from your phone, and an email of your own where one is not already said. */
const ownWaysOf = (f: LeadSheetDockFacts, write: boolean): LeadSheetSlotVM[] => [
  ...(f.canCall ? [slot("call", D.call, "phone", "c")] : []),
  ...(f.canWrite && write ? [slot("write", D.write, "mail")] : []),
];

/**
 * Still a lead to write to, by what the send door writes to (a business that said no, became a person or was set aside is
 * not, whatever its place still says): only then are your own ways to them offered.
 */
const writtenTo = (f: LeadSheetDockFacts) => f.state === "sequence";

/**
 * A place a lead has moved past: a closed lead's one fix (back to Ready, which lets its sequence write again); else only
 * what you alone can tell.
 */
function movedPast(f: LeadSheetDockFacts, place: SequencePlaceDto): LeadSheetDockVM | null {
  if (f.state === "closed") return closedDock(f);
  const told = toldOf(place);
  return told ? dock({ others: [told] }) : null;
}

/**
 * Their sequence runs and nothing needs you: no primary, the quiet ways on. Take out (asked, with Never write under it);
 * They wrote back… where only you can tell; your call and your email. In another sequence than the pick, with nothing
 * sent, Move to the pick stays the one primary.
 */
function standsDock(f: LeadSheetDockFacts, place: SequencePlaceDto): LeadSheetDockVM {
  const leave = slot("leave", D.takeOut, "ban", "n");
  const away = elsewhereDock(f);
  if (away && away.primary) return dock({ others: [leave], primary: away.primary });
  const told = toldOf(place);
  return dock({ others: [leave, ...(told ? [told] : []), ...ownWaysOf(f, !told)] });
}

/**
 * Every step went and no reply came: a business gets one sequence, so the way on is yours, a call where there is a number,
 * else an email; or Not a fit, which sets them aside.
 */
function doneDock(f: LeadSheetDockFacts, place: SequencePlaceDto): LeadSheetDockVM {
  const told = toldOf(place);
  const [primary, ...rest] = ownWaysOf(f, true);
  return dock({ x: true, others: told ? [told] : rest, primary: primary ?? null });
}

/**
 * Out of a sequence. Taken out by you: Put back while nothing went, and your own ways to them. Out for any other reason
 * (they asked to stop, they unsubscribed, their address stopped): only Put back where there is one, and nothing of yours.
 */
function leftDock(f: LeadSheetDockFacts, place: SequencePlaceDto): LeadSheetDockVM | null {
  const back = place.put_back ? [slot("return", D.putBack, "undo", "a")] : [];
  const own = writtenTo(f) && place.place.why === "removed" ? ownWaysOf(f, true) : [];
  return back.length + own.length > 0 ? dock({ others: [...back, ...own] }) : null;
}

/** The dock while a sequence has them: what their place needs, else its quiet ways on. */
function placeDock(f: LeadSheetDockFacts, place: SequencePlaceDto): LeadSheetDockVM | null {
  const row = place.place;
  switch (row.group) {
    case "waiting":
      return waitingDock(f, place);
    case "held":
      return row.send_id ? heldDock(place) : null;
    case "to_send":
      return dock({ toSend: true });
    case "replied":
      return dock({ primary: slot("thread", D.answer, "chat", "a") });
    case "left":
      return leftDock(f, place);
    case "next":
    case "queued":
    case "in":
      return writtenTo(f) ? standsDock(f, place) : movedPast(f, place);
    case "done":
      return writtenTo(f) ? doneDock(f, place) : movedPast(f, place);
    default:
      return null;
  }
}

/** Not a fit and Later before the acts, for a lead to decide on. */
const deciding = (f: LeadSheetDockFacts) => ({ x: true, later: f.canLater });

/** The dock for a lead not in a sequence yet: Add to the pick, or the picker where Add can't go. */
function readyDock(f: LeadSheetDockFacts): LeadSheetDockVM {
  if (!f.pick) return dock({ ...deciding(f), primary: slot("pick", D.addToOne, "plus", "a") });
  if (f.state === "finding")
    return dock({ ...deciding(f), primary: slot("add", D.checking, "plus", "a", { off: D.checking, split: true }) });
  if (f.blocked) return dock({ ...deciding(f), primary: slot("pick", D.choose, "plus", "a") });
  return dock({ ...deciding(f), primary: slot("add", D.addTo(f.pick.name), "plus", "a", { split: true }) });
}

/** A closed lead: its one fix where one exists; a call is the way on, the others a way back. */
function closedDock(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  const fix = f.closed ? f.closed.fix : null;
  if (!fix) return null;
  if (fix === "call") return dock({ primary: slot("call", D.call, "phone", "c") });
  return dock({
    others: [fix === "put_back" ? slot("put_back", D.putBack, "undo", "a") : slot("ready", D.ready, "undo", "a")],
  });
}

/** In another sequence than the pick: Move to the pick while nothing was sent to them, else Open that one. */
function elsewhereDock(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  const e = f.elsewhere;
  if (!e) return null;
  if (e.written) return e.id ? dock({ others: [slot("sequence", D.open(e.name), "chevron", "a")] }) : null;
  return f.pick && f.pick.id !== e.id ? dock({ primary: slot("move", D.moveTo(f.pick.name), "chevron", "a") }) : null;
}

/**
 * The dock, by the lead's state and its place (the canvas's Logic board): what needs you in their sequence where one has
 * them, else its quiet ways on; else To review's Leave out and Keep, a phone's Call, another sequence's Move to (nothing
 * sent yet) or Open (written to), a closed lead's one fix, or Not a fit, Later and Add. Null where nothing is left to
 * press (a closed lead with no fix, one who asked to stop with nothing to put back): the sheet then draws no foot at all.
 */
export function leadDockOf(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  // Their place first: what needs you there, whatever the pick; else, in another than the pick, Move or Open.
  if (f.place) return placeDock(f, f.place) ?? elsewhereDock(f);
  switch (f.state) {
    case "review":
      return dock({ others: [slot("exclude", D.exclude, "ban", "n")], primary: slot("keep", D.keep, "check", "a") });
    case "phone":
      return dock({ ...deciding(f), primary: f.canCall ? slot("call", D.call, "phone", "c") : null });
    case "elsewhere":
      return elsewhereDock(f);
    case "replied":
      return dock({ primary: slot("thread", D.answer, "chat", "a") });
    case "sequence":
      return null;
    case "closed":
      return closedDock(f);
    default:
      return readyDock(f);
  }
}

/** Every press of a dock that carries a key: what a key finds in a pile. */
export const dockSlotsOf = (d: LeadSheetDockVM): LeadSheetSlotVM[] => [...d.others, ...(d.primary ? [d.primary] : [])];
