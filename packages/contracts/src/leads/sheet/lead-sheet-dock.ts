/**
 * The lead sheet's dock, in every state (the canvas's States board, 18 Oct 2026: "one line, at most two acts, never a
 * pointer elsewhere"): for a lead to decide on, Not a fit, Later and Add to the pick (▾ the picker), or Add to a sequence
 * where nothing is picked; while a sequence has them, only what needs you there, by its own reading of their place
 * (contracts sequence-place.ts): an OK to give, a held email's choices, an email to send, a reply to answer, or a reply
 * to tell where none is read. Nothing at all where nothing needs you: up next, in it, done, left. Every sentence is here.
 *
 *   leadDockOf         the dock: its line, its fact and its acts, by the lead's state and its place
 *   leadSheetWordOf    the word beside the name: the place, or the lead's own state before a sequence
 */
import { clockDate, clockNear } from "../../shared/clock";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../../reach-out/reach-out-replies";
import { PLACE_WORDS, placeToneOf, type PlaceTone, type SequencePlaceDto } from "../../sequences/sequence-place";
import type { SequenceState } from "../../sequences/sequence";
import { sheetSlot as slot, type LeadSheetClosedVM, type LeadSheetSlotVM, type LeadSheetState } from "./lead-sheet";

/* --------------------------------------------------------------------------------------------- the word ------- */

/**
 * The word beside the name: where they stand once a sequence has them (its place's own word), else the lead's own state:
 * To decide, To review, Call first, Wrote back, or what closed it.
 */
export function leadSheetWordOf(p: {
  state: LeadSheetState;
  place: SequencePlaceDto | null;
  closed: LeadSheetClosedVM | null;
}): { word: string; tone: PlaceTone } {
  if (p.place) return { word: PLACE_WORDS[p.place.place.group], tone: placeToneOf(p.place.place.group) };
  switch (p.state) {
    case "review":
      return { word: "To review", tone: "warn" };
    case "replied":
      return { word: PLACE_WORDS.replied, tone: "warn" };
    case "elsewhere":
    case "sequence":
      return { word: PLACE_WORDS.in, tone: "ok" };
    case "closed":
      return { word: p.closed ? p.closed.title : PLACE_WORDS.left, tone: "plain" };
    case "phone":
      return { word: "Call first", tone: "warn" };
    default:
      return { word: "To decide", tone: "plain" };
  }
}

/* -------------------------------------------------------------------------------------------- the dock -------- */

/** The dock: its line and fact (none where the acts say it all), Not a fit and Later as round glyphs, and its acts. */
export interface LeadSheetDockVM {
  line: string | null;
  fact: string | null;
  /** Something is being read or checked: a spinner beside the line, and Add waits. */
  waiting: boolean;
  /** Not a fit and Later, the round glyphs before the acts, where the lead is to decide on. */
  x: boolean;
  later: boolean;
  acts: LeadSheetSlotVM[];
  /** A held email: its choices stand in the acts' place (contracts heldChoicesOf), the same verb as the record's. */
  held: { sendId: string; batchId: string | null; hold: string | null; place: number | null } | null;
}

export const LEAD_DOCK_WORDS = {
  notFit: "Not a fit",
  later: "Later",
  addTo: (name: string) => `Add to ${name}`,
  addToOne: "Add to a sequence",
  choose: "Choose where it goes",
  checking: "Checking the mailbox…",
  noEmail: { line: "No email", fact: "Phone only" },
  call: "Call",
  moveTo: (name: string) => `Move to ${name}`,
  inOther: (name: string) => ({ line: `In ${name}`, fact: "Nothing sent to them yet" }),
  writtenBy: (name: string) => ({ line: `Written to by ${name}`, fact: "A business gets one sequence" }),
  open: (name: string) => `Open ${name}`,
  putBack: "Put back",
  ready: "Move back to Ready",
  review: { line: "To review", fact: "Keep it on the search?" },
  exclude: "Leave out",
  keep: "Keep",
  waiting: (step: number, others: number) => ({
    line: `Step ${step} waits for your OK`,
    fact: others > 0 ? `With ${others} others in today's batch` : "In today's batch",
  }),
  approve: "Approve",
  toSend: (step: number) => ({ line: `Step ${step} is yours to send`, fact: "From your own inbox" }),
  openDraft: "Open the draft",
  sentByHand: (step: number, at: string | null) => ({
    line: at ? `Step ${step} sent ${at}` : `Step ${step} sent`,
    fact: "Replies aren't read here",
  }),
  theyWrote: "They wrote back…",
  replied: (intent: string | null, at: string | null) => ({
    line: intent ? `Wrote back · ${intent}` : "Wrote back",
    fact: [at, "the sequence stopped"].filter(Boolean).join(" · "),
  }),
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
  /** How many others are in the batch that waits for an OK with them (the record's people), where it is known. */
  batchOthers?: number;
  tz: string;
  nowMs: number;
}

const dock = (p: Partial<LeadSheetDockVM> & Pick<LeadSheetDockVM, "acts">): LeadSheetDockVM => ({
  line: null,
  fact: null,
  waiting: false,
  x: false,
  later: false,
  held: null,
  ...p,
});

/** The step a place is at, from 1. */
const stepNumberOf = (place: SequencePlaceDto) => place.place.place ?? 1;

/** Their last email sent by hand (no mailbox reads replies): when it went. */
function sentByHandAt(place: SequencePlaceDto, f: LeadSheetDockFacts): string | null {
  const sent = place.sends.filter((s) => s.sent_at).at(-1);
  const at = sent && sent.sent_at ? Date.parse(sent.sent_at) : NaN;
  return Number.isFinite(at) ? clockDate(at, f.tz, f.nowMs) : null;
}

/** The dock while a sequence has them: only where their place needs you, or a reply only they can tell. */
function placeDock(f: LeadSheetDockFacts, place: SequencePlaceDto): LeadSheetDockVM | null {
  const row = place.place;
  const step = stepNumberOf(place);
  switch (row.group) {
    case "waiting":
      return dock({ ...D.waiting(step, f.batchOthers ?? 0), acts: [slot("approve", D.approve, "check", "a")] });
    case "held":
      return row.send_id
        ? dock({ acts: [], held: { sendId: row.send_id, batchId: row.batch_id, hold: row.why, place: row.place } })
        : null;
    case "to_send":
      return dock({ ...D.toSend(step), acts: [slot("open_draft", D.openDraft, "send", "a")] });
    case "replied": {
      const intent = row.reply && isReplyIntent(row.reply.intent) ? REPLY_INTENT_WORDS[row.reply.intent] : null;
      const at = row.at ? clockNear(Date.parse(row.at), f.tz, f.nowMs) : null;
      return dock({ ...D.replied(intent, at), acts: [slot("thread", D.answer, "chat", "a")] });
    }
    case "in":
    case "done": {
      // Sent by hand from an inbox nobody reads here: only they can say a reply came (They wrote back…).
      if (place.reads_replies || !place.sends.some((s) => s.sent_at)) return null;
      return dock({
        ...D.sentByHand(step, sentByHandAt(place, f)),
        acts: [slot("they_wrote", D.theyWrote, "chat", "a")],
      });
    }
    default:
      return null;
  }
}

/** Not a fit and Later before the acts, for a lead to decide on. */
const deciding = (f: LeadSheetDockFacts) => ({ x: true, later: f.canLater });

/** The dock for a lead not in a sequence yet: Add to the pick, or the picker; why Add can't go, and the way on. */
function readyDock(f: LeadSheetDockFacts): LeadSheetDockVM {
  if (!f.pick) return dock({ ...deciding(f), acts: [slot("pick", D.addToOne, "plus", "a")] });
  if (f.state === "finding")
    return dock({
      ...deciding(f),
      waiting: true,
      acts: [slot("add", D.checking, "plus", "a", { off: D.checking, split: true })],
    });
  if (f.blocked) return dock({ ...deciding(f), line: f.blocked, acts: [slot("pick", D.choose, "plus", "a")] });
  return dock({ ...deciding(f), acts: [slot("add", D.addTo(f.pick.name), "plus", "a", { split: true })] });
}

/** A closed lead: its one fix where one exists (Put back, back to Ready, a call), its title the line. */
function closedDock(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  const fix = f.closed ? f.closed.fix : null;
  if (!f.closed || !fix) return null;
  const one =
    fix === "put_back"
      ? slot("put_back", D.putBack, "undo", "a")
      : fix === "ready"
        ? slot("ready", D.ready, "undo", "a")
        : slot("call", D.call, "phone", "c");
  return dock({ line: f.closed.title, fact: f.closed.line || null, acts: [one] });
}

/**
 * The dock, by the lead's state and its place (the canvas's States board): what needs you in their sequence where one
 * has them; else To review's Leave out and Keep, a phone's Call, another sequence's Move to (nothing sent yet) or Open
 * (written to), a closed lead's one fix, or Not a fit, Later and Add. Null where nothing needs you.
 */
/** In another sequence than the pick: Move to the pick while nothing was sent to them, else Open that one. */
function elsewhereDock(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  const e = f.elsewhere;
  if (!e) return null;
  if (e.written)
    return dock({ ...D.writtenBy(e.name), acts: e.id ? [slot("sequence", D.open(e.name), "chevron", "a")] : [] });
  return dock({
    ...D.inOther(e.name),
    acts: f.pick && f.pick.id !== e.id ? [slot("move", D.moveTo(f.pick.name), "chevron", "a")] : [],
  });
}

export function leadDockOf(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  // Their place first: what needs you there, whatever the pick; else, in another than the pick, Move or Open.
  if (f.place) return placeDock(f, f.place) ?? elsewhereDock(f);
  if (f.reading) return dock({ line: D.reading, waiting: true, acts: [] });
  switch (f.state) {
    case "review":
      return dock({
        ...D.review,
        acts: [slot("exclude", D.exclude, "ban", "n"), slot("keep", D.keep, "check", "a")],
      });
    case "phone":
      return f.canCall
        ? dock({ ...deciding(f), ...D.noEmail, acts: [slot("call", D.call, "phone", "c")] })
        : dock({ ...deciding(f), ...D.noEmail, acts: [] });
    case "elsewhere":
      return elsewhereDock(f);
    case "replied":
      return dock({ ...D.replied(null, null), acts: [slot("thread", D.answer, "chat", "a")] });
    case "sequence":
      return null;
    case "closed":
      return closedDock(f);
    default:
      return readyDock(f);
  }
}
