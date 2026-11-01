/**
 * The lead sheet's dock, in every state (the canvas "Lead sheet, redesigned", 1 Nov 2026): only what to press, each press
 * saying what it does, the card above it saying why. For a lead to decide on, Not a fit, Later and Add to the pick (▾ the
 * picker), or Add to a sequence where nothing is picked; while a sequence has them, only what needs you there, by its own
 * reading of their place (contracts sequence-place.ts): an OK to give, a held email's answers, an email to send, a reply
 * to answer, or a reply to tell where none is read. No dock at all where nothing needs you. One press at most is the
 * primary. Every sentence is here.
 *
 *   leadDockOf         the dock: its presses, by the lead's state and its place
 */
import { runApproveWords } from "../../shell/campaign-rooms";
import { heldAnswersOf, waitingAnswersOf, type HeldAnswer } from "../../sequences/sequence-held";
import type { SequencePlaceDto } from "../../sequences/sequence-place";
import type { SequenceState } from "../../sequences/sequence";
import { sheetSlot as slot, type LeadSheetClosedVM, type LeadSheetSlotVM, type LeadSheetState } from "./lead-sheet";

/* -------------------------------------------------------------------------------------------- the dock -------- */

/** The dock: Not a fit and Later as round glyphs, its quieter presses, the one primary, and what its caret holds. */
export interface LeadSheetDockVM {
  /** Said where there is nothing to press yet: their place or the sequences are being read. */
  line: string | null;
  /** Something is being read or checked: a small ring beside the line. */
  waiting: boolean;
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
  /** The desk's keys under the dock: in a pile, each act's key, ⇧A the picker, J and K, Z undo. */
  keys: { notFit: "not a fit", later: "later", add: "add", choose: "choose", move: "move", undo: "undo" },
  reading: "Reading where they stand",
} as const;

const D = LEAD_DOCK_WORDS;

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
  /** A search holds the lead: Later puts it off in this pass. */
  canLater: boolean;
  closed: LeadSheetClosedVM | null;
  /** Their place or the sequences still being read: the dock waits, offering nothing the reads could take back. */
  reading: boolean;
  /** How many an OK sends in the batch that waits with them (the record's count), where it is known. */
  batch?: number;
}

const dock = (p: Partial<LeadSheetDockVM>): LeadSheetDockVM => ({
  line: null,
  waiting: false,
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
  const { why, hold_detail: detail, place: at } = place.place;
  const answers = heldAnswersOf({ reason: why, detail }, at);
  const [first, ...rest] = answers.filter((a) => !leavesOut(a));
  return dock({
    others: answers.filter(leavesOut).map(answerSlot),
    primary: first ? answerSlot(first) : null,
    more: rest.map(answerSlot),
  });
}

/** An email waiting for your OK: leaving this one out, and Approve, which sends every email an OK sends. */
function waitingDock(f: LeadSheetDockFacts, place: SequencePlaceDto): LeadSheetDockVM {
  const { place: at, checked } = place.place;
  const no = waitingAnswersOf({ opening: null, checking: false }, at).filter(leavesOut);
  const writing = checked === false;
  return dock({
    others: no.map(answerSlot),
    primary: slot("approve", D.approve(f.batch ?? 1), "check", "a", { off: writing ? D.writing : null }),
  });
}

/** The dock while a sequence has them: only where their place needs you, or a reply only they can tell. */
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
      return place.put_back ? dock({ others: [slot("return", D.putBack, "undo", "a")] }) : null;
    case "in":
    case "done":
      // Sent by hand from an inbox nobody reads here: only they can say a reply came (They wrote back…).
      if (place.reads_replies || !place.sends.some((s) => s.sent_at)) return null;
      return dock({ others: [slot("they_wrote", D.theyWrote, "chat", "a")] });
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
 * them; else To review's Leave out and Keep, a phone's Call, another sequence's Move to (nothing sent yet) or Open
 * (written to), a closed lead's one fix, or Not a fit, Later and Add. Null where nothing needs you: the sheet then draws
 * no foot at all.
 */
export function leadDockOf(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  // Their place first: what needs you there, whatever the pick; else, in another than the pick, Move or Open.
  if (f.place) return placeDock(f, f.place) ?? elsewhereDock(f);
  if (f.reading) return dock({ line: D.reading, waiting: true });
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
