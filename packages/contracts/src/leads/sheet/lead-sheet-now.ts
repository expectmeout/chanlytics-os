/**
 * The lead sheet's one card (the canvas "Lead sheet, redesigned", 1 Nov 2026): what this lead needs from you, now. Before
 * a sequence has them, the fit and the reason, and how to reach them where that decides it; once one has them, where they
 * stand there, by the sequence's own reading of their place (sequence-place.ts): an email to OK, why one was held, an
 * email to send, what they said. It has one status word, so nothing fights the name for the head, and an amber edge
 * only where it needs you, as a step's box on the record has. Every sentence is here.
 *
 *   leadNowOf    the card: its word, tone and end, the line under it, and what it carries (the facts, the email)
 */
import { clockNear } from "../../shared/clock";
import { capitalize } from "../../shared/words";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../../reach-out/reach-out-replies";
import { isReachOutHold } from "../../reach-out/reach-out-words";
import { heldWhyOf } from "../../sequences/sequence-held";
import {
  PLACE_WORDS,
  placeToneOf,
  placeWordOf,
  type PlaceTone,
  type SequencePlaceDto,
} from "../../sequences/sequence-place";
import { sequenceLeftWords } from "../../sequences/sequence-words";
import type { LeadSheetClosedVM, LeadSheetState, LeadVerdictVM } from "./lead-sheet";
import type { LeadSheetChecksLineVM, LeadSheetEmailLineVM } from "./lead-sheet-card";
import { LEAD_LINE_WORDS, leadDayOf } from "./lead-sheet-lines";

export const LEAD_NOW_WORDS = {
  review: "To review",
  held: "Held by the check",
  heldElse: "The check held this email.",
  inIt: (name: string) => `In ${name}`,
  left: (name: string) => `Left ${name}`,
  written: (name: string) => `Written to by ${name}`,
  writtenSay: "A business gets one sequence.",
  nothingSent: "Nothing sent to them yet.",
  stepOf: LEAD_LINE_WORDS.stepOf,
  batch: (n: number) => `Goes in today's batch of ${n}.`,
  batchOne: "Goes in today's batch.",
  writing: "Its opening is being written. Approve waits for it.",
  toSend: "From your own inbox. Say Sent once it goes.",
  wrote: (intent: string | null) => (intent ? `Wrote back · ${intent}` : "Wrote back"),
  stopped: "The sequence stopped.",
  noNeed: "Nothing needs you.",
  sentNothing: "Nothing was sent to them.",
} as const;

const NW = LEAD_NOW_WORDS;

/** A way to reach them, where it decides what happens next: its value, what is known of it, and its tone. */
export interface LeadNowFactVM {
  kind: "phone" | "mail";
  value: string;
  note: string;
  tone: "ok" | "warn" | "plain";
  /** Still being read: a small ring beside its note. */
  busy: boolean;
}

/**
 * Which email the card carries: the first they would get from the pick, the one their step holds (waiting or held), the
 * draft handed to you, or none.
 */
type LeadNowMail = "first" | "step" | "draft" | null;

export interface LeadNowVM {
  tone: PlaceTone;
  /** It needs you: the amber edge. */
  need: boolean;
  word: string;
  /** Quiet, at the word's end: how many checks, the step, or when. */
  end: string | null;
  say: string | null;
  /** What could not be told, in amber: read before a lead is added. */
  unsure: string | null;
  /** What they said, as it was read. */
  quote: string | null;
  facts: LeadNowFactVM[];
  mail: LeadNowMail;
}

/** What the card is read from. */
interface LeadNowFacts {
  state: LeadSheetState;
  place: SequencePlaceDto | null;
  closed: LeadSheetClosedVM | null;
  elsewhere: { name: string; written: boolean } | null;
  verdict: LeadVerdictVM;
  /** The finder's words where it left them out ("Left out — Chain gyms"). */
  fitWord: string;
  reason: string | null;
  checks: LeadSheetChecksLineVM | null;
  /** Why Add would come to nothing here; it stands where a doubt would. */
  blocked: string | null;
  email: LeadSheetEmailLineVM;
  phone: { value: string; confirmed: boolean; today: string | null } | null;
  /** The pick's first email is there to read. */
  firstEmail: boolean;
  /** How many steps their sequence has, where it is known. */
  steps: number | null;
  /** How many an OK would send in their batch, where it is known. */
  batch: number | null;
  tz: string;
  nowMs: number;
}

const card = (p: Partial<LeadNowVM> & Pick<LeadNowVM, "word">): LeadNowVM => ({
  tone: "plain",
  need: false,
  end: null,
  say: null,
  unsure: null,
  quote: null,
  facts: [],
  mail: null,
  ...p,
});

/** When something on a place happened. */
const placeDay = (at: string | null, f: Pick<LeadNowFacts, "tz" | "nowMs">) => leadDayOf(at, f.tz, f.nowMs);

/** The step a place is at, from 1, of how many. */
const placeStep = (place: SequencePlaceDto, f: LeadNowFacts) => NW.stepOf(place.place.place ?? 1, f.steps);

/** Waits for your OK: how big its batch is, or that its opening is still being written. */
function waitingCard(f: LeadNowFacts, place: SequencePlaceDto): LeadNowVM {
  const writing = place.place.checked === false;
  const batch = f.batch && f.batch > 1 ? NW.batch(f.batch) : NW.batchOne;
  return card({
    word: PLACE_WORDS.waiting,
    tone: "warn",
    need: true,
    end: placeStep(place, f),
    say: writing ? NW.writing : batch,
    mail: "step",
  });
}

/** Held: why, in the words every held row says it. */
function heldCard(f: LeadNowFacts, place: SequencePlaceDto): LeadNowVM {
  const { why, hold_detail: detail } = place.place;
  return card({
    word: NW.held,
    tone: "warn",
    need: true,
    end: placeStep(place, f),
    say: isReachOutHold(why) ? `${heldWhyOf(why, detail)}.` : NW.heldElse,
    mail: "step",
  });
}

/** Wrote back: what they said, and that it stopped. */
function repliedCard(f: LeadNowFacts, place: SequencePlaceDto): LeadNowVM {
  const reply = place.place.reply;
  const intent = reply && isReplyIntent(reply.intent) ? REPLY_INTENT_WORDS[reply.intent] : null;
  const at = place.place.at ? Date.parse(place.place.at) : NaN;
  return card({
    word: NW.wrote(intent),
    tone: "warn",
    need: true,
    end: Number.isFinite(at) ? capitalize(clockNear(at, f.tz, f.nowMs)) : null,
    quote: reply && reply.summary ? `“${reply.summary}”` : null,
    say: NW.stopped,
  });
}

/** Whether anything of theirs ever went from this sequence. */
const everSent = (place: SequencePlaceDto) => place.sends.some((s) => s.sent_at);

/** Left: why and when, and whether anything had gone. */
function leftCard(f: LeadNowFacts, place: SequencePlaceDto): LeadNowVM {
  const why = capitalize(sequenceLeftWords(place.place.why) || "taken out");
  return card({
    word: NW.left(place.sequence.name),
    end: placeDay(place.place.at, f),
    say: everSent(place) ? `${why}.` : `${why}. ${NW.sentNothing}`,
  });
}

/** Their place, as the sequence reads it: what needs you there, else where they stand. */
function placeCard(f: LeadNowFacts, place: SequencePlaceDto): LeadNowVM {
  const clock = { tz: f.tz, nowMs: f.nowMs };
  const said = placeWordOf(place.place, place.sequence, clock);
  switch (place.place.group) {
    case "waiting":
      return waitingCard(f, place);
    case "held":
      return heldCard(f, place);
    case "to_send":
      return card({
        word: PLACE_WORDS.to_send,
        tone: "warn",
        need: true,
        end: placeStep(place, f),
        say: NW.toSend,
        mail: "draft",
      });
    case "replied":
      return repliedCard(f, place);
    case "done":
      return card({ word: PLACE_WORDS.done, end: placeDay(place.place.at, f), say: `${said.line}.` });
    case "left":
      return leftCard(f, place);
    default:
      return card({
        word: NW.inIt(place.sequence.name),
        tone: placeToneOf(place.place.group),
        end: placeStep(place, f),
        say: `${said.line}. ${NW.noNeed}`,
      });
  }
}

/** The number as a card says it: green only while they are open, so a call now would be answered. */
const phoneFact = (phone: NonNullable<LeadNowFacts["phone"]>): LeadNowFactVM => ({
  kind: "phone",
  value: phone.value,
  note: phone.today ?? "",
  tone: phone.today && /^open/i.test(phone.today) ? "ok" : "plain",
  busy: false,
});

/** The ways to reach them the card says: a phone where it is the way in, an address still being checked or missing. */
function waysOf(f: LeadNowFacts): LeadNowFactVM[] {
  const out: LeadNowFactVM[] = [];
  if (f.state === "phone" && f.phone) out.push(phoneFact(f.phone));
  if (f.state === "finding" && f.email.address)
    out.push({ kind: "mail", value: f.email.address, note: f.email.words, tone: "plain", busy: true });
  if (f.state === "phone")
    out.push({ kind: "mail", value: f.email.words, note: LEAD_PHONE_ONLY, tone: "plain", busy: false });
  return out;
}

const LEAD_PHONE_ONLY = "Phone only";

/** What could not be told of them, a line of its own on the card. */
const unsureOf = (f: LeadNowFacts): string | null =>
  f.checks && f.checks.exception ? capitalize(f.checks.exception) : null;

/** Before a sequence has them: the fit, the reason, what could not be told, and how to reach them. */
const fitCard = (f: LeadNowFacts): LeadNowVM =>
  card({
    word: f.fitWord,
    tone: f.verdict.tone,
    end: f.checks ? f.checks.words : null,
    say: f.reason,
    unsure: f.blocked ?? unsureOf(f),
    facts: waysOf(f),
    mail: f.firstEmail && (f.state === "ready" || f.state === "gap") ? "first" : null,
  });

/** A lead that stopped: what stopped it, in its own words, and the phone where one is left. */
const closedCard = (f: LeadNowFacts): LeadNowVM =>
  card({
    word: f.verdict.out ? f.fitWord : f.closed ? f.closed.title : PLACE_WORDS.left,
    say: f.closed && f.closed.line ? f.closed.line : f.verdict.out ? f.reason : null,
    facts: f.closed && f.closed.fix === "call" && f.phone ? [phoneFact(f.phone)] : [],
  });

/** In another sequence, with no place of theirs read here: the door's answer. */
const elsewhereCard = (e: { name: string; written: boolean }): LeadNowVM =>
  e.written
    ? card({ word: NW.written(e.name), say: NW.writtenSay })
    : card({ word: NW.inIt(e.name), tone: "ok", say: NW.nothingSent });

/** The card, by the lead's state and its place: their place first, whatever the pick. */
export function leadNowOf(f: LeadNowFacts): LeadNowVM {
  if (f.place) return placeCard(f, f.place);
  switch (f.state) {
    case "review":
      return card({
        word: NW.review,
        tone: "warn",
        need: true,
        end: f.checks ? f.checks.words : null,
        say: f.reason,
        unsure: unsureOf(f),
      });
    case "closed":
      return closedCard(f);
    case "replied":
      return card({ word: NW.wrote(null), tone: "warn", need: true, say: NW.stopped });
    case "elsewhere":
      return f.elsewhere ? elsewhereCard(f.elsewhere) : fitCard(f);
    default:
      return fitCard(f);
  }
}
