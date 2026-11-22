/**
 * The seven checks a post is held to (the content loop PRD's 6.1), each a pure function over the facts its caller read:
 * the card that proposes it, the press that approves it, and the job right before the send (6.2). Each answers null, or
 * its refusal in the owner's words with the one thing to do. `evaluate` (evaluate.ts) asks those a moment has facts for
 * and answers every refusal at once.
 *
 * What is not here yet, and why: claims are the owner's own words or AI's held to them (the dashboard's post-check.ts
 * rule, handed in as `problem`) until pass 3's owner_claims; money is a press's, which costs nothing to send, until the
 * plan reserves a week's cost (pass 3); a rung other than "AI asks first" waits for the Autonomy pane's content rows.
 */
import {
  CHECK_WORDS,
  ON_INSTAGRAM,
  PLACE_CAPABILITIES,
  capabilityStands,
  dayWordIn,
  instagramKindsFor,
  isDayKey,
  namesMoney,
  postCaptionProblem,
  priceFigures,
  zoneDayKey,
  type ContentCheck,
  type InstagramPostable,
  type OwnersFact,
  type PieceIntent,
  type PostHeldWhy,
  type PostKind,
  type PostPlace,
} from "@chanlytics/contracts";

/** One refusal: which check, its code (as the post keeps it when held), the words, and what mends it. */
export interface PolicyRefusal {
  check: ContentCheck;
  code: PostHeldWhy;
  words: string;
}

const refusal = (check: ContentCheck, code: PostHeldWhy, words: string): PolicyRefusal => ({ check, code, words });

/** Authorization: whoever acts may still act for the business with the permission the act needs. */
export function mayAct(actor: { may: boolean; approving: boolean }): PolicyRefusal | null {
  if (actor.may) return null;
  return refusal("authorization", "approver", actor.approving ? CHECK_WORDS.mayNot : ON_INSTAGRAM.held.approver);
}

/**
 * Content rights: no new use of a file whose yes for posts was taken back on it, or on what it was drawn from, and not
 * given again (00665; per person once pass 1b's people in a file are named).
 */
export function rightsFor(files: { takenBack: boolean }): PolicyRefusal | null {
  return files.takenBack ? refusal("rights", "rights", CHECK_WORDS.takenBack) : null;
}

/** Claim evidence: words AI wrote are held to what the owner said (the caller's rule); the owner's own words are theirs. */
export function evaluateClaimPolicy(words: { aiWrote: boolean; problem: string | null }): PolicyRefusal | null {
  return words.aiWrote && words.problem ? refusal("claims", "claim", CHECK_WORDS.claim(words.problem)) : null;
}

/** What a placement asks of its place: where, as what, of which file, through which connection, with which words. */
export interface PlaceAsked {
  place: PostPlace;
  kind: PostKind;
  fileKind: string;
  connection: InstagramPostable;
  caption: string | null;
  video: { mime: string | null; bytes: number | null; ms: number | null } | null;
}

/** Why a video cannot go as a reel, by the place's own limits; null where it can, or where nothing is known to say no. */
function videoProblem(asked: PlaceAsked): string | null {
  const limits = PLACE_CAPABILITIES[asked.place].limits.video;
  if (!limits || !asked.video) return null;
  const { mime, bytes, ms } = asked.video;
  if (mime && !limits.mimes.includes(mime)) return CHECK_WORDS.video;
  if (bytes !== null && bytes > limits.maxBytes) return CHECK_WORDS.video;
  if (ms !== null && (ms < limits.minMs || ms > limits.maxMs)) return CHECK_WORDS.video;
  return null;
}

/** Publishing: the place takes this kind (section 7), the connection allows it, and the words fit the place's limits. */
export function placeAllows(asked: PlaceAsked): PolicyRefusal | null {
  if (asked.place === "instagram" && !instagramKindsFor(asked.fileKind).some((kind) => kind === asked.kind))
    return refusal("publishing", "place", ON_INSTAGRAM.wrongKind);
  if (asked.place === "google" && (asked.fileKind === "video" || asked.kind !== "picture"))
    return refusal("publishing", "place", CHECK_WORDS.notTaken("google", ON_INSTAGRAM.kind[asked.kind]));
  if (!capabilityStands(PLACE_CAPABILITIES[asked.place].formats[asked.kind]))
    return refusal("publishing", "place", CHECK_WORDS.notTaken(asked.place, ON_INSTAGRAM.kind[asked.kind]));
  if (asked.connection === "not_connected")
    return refusal("publishing", "disconnected", CHECK_WORDS.notConnected(asked.place));
  if (asked.connection === "line_off") return refusal("publishing", "line_off", CHECK_WORDS.lineOff);
  const max = PLACE_CAPABILITIES[asked.place].limits.captionMax;
  if (asked.caption && asked.caption.length > max)
    return refusal("publishing", "place", CHECK_WORDS.tooLong(asked.place, max));
  const instagram = asked.place === "instagram" && asked.caption ? postCaptionProblem(asked.caption) : null;
  if (instagram) return refusal("publishing", "place", instagram);
  const video = asked.kind === "reel" ? videoProblem(asked) : null;
  return video ? refusal("publishing", "place", video) : null;
}

/** Money: what this costs fits what is left of the month's limit, where one is set. */
export function budgetAllows(money: { costCents: number; leftCents: number | null; limitCents: number | null }) {
  if (money.leftCents === null || money.costCents <= money.leftCents) return null;
  return refusal("money", "money", CHECK_WORDS.money(Math.round((money.limitCents ?? 0) / 100)));
}

/** Automation: nothing goes while everything is stopped, and AI never posts alone while its rung asks first. */
export function automationAllows(at: { stopped: boolean; pressedBy: "owner" | "ai" }): PolicyRefusal | null {
  if (at.stopped) return refusal("automation", "stopped", CHECK_WORDS.stopped);
  return at.pressedBy === "ai" ? refusal("automation", "stopped", CHECK_WORDS.aiAlone) : null;
}

/** A date written out: "Dec 2", "2 de diciembre", "12/2". */
const WRITTEN_DATE =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|ene|abr|ago|dic)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\s+de\s+[a-záéíóú]+\b|\b\d{1,2}\/\d{1,2}\b/i;
/** Words that make an offer of a share or an amount off. */
const OFFER_WORDS = /\b\d{1,3}\s?%|\b(?:off|discount|deal|promo|special|descuento|oferta|promoci[oó]n)\b/i;
/** A weekday said again and again ("Fridays", "todos los viernes"): a standing fact, which dates nothing. */
const EVERY_WEEKDAY = /\b(?:mon|tues|wednes|thurs|fri|satur|sun)days\b|\btodos los\b/i;

/**
 * What in a post's words leans on something that can change (PRD 6.1): a day (today, tomorrow, a weekday once, a date),
 * or an offer or a price. Null for words that date nothing ("Open late on Fridays").
 */
export function datedPhraseIn(words: string): { is: "day" | "offer"; phrase: string } | null {
  const date = WRITTEN_DATE.exec(words)?.[0];
  if (date) return { is: "day", phrase: date };
  const day = EVERY_WEEKDAY.test(words) ? null : dayWordIn(words);
  if (day) return { is: "day", phrase: new RegExp(`\\b${day}\\w*`, "i").exec(words)?.[0] ?? day };
  const offer = OFFER_WORDS.exec(words)?.[0] ?? (namesMoney(words) ? "an offer" : priceFigures(words)[0]);
  return offer ? { is: "offer", phrase: offer } : null;
}

/** What the reason check reads: why the piece exists, its last moment, the business's facts now, and what was said. */
export interface ReasonAsked {
  intent: PieceIntent | null;
  goodUntil: string | null;
  nowMs: number;
  zone: string;
  /** The owner's notes in force now (what an offer is kept as before pass 3's claims). */
  notes: readonly string[];
  services: readonly string[];
  facts: readonly OwnersFact[];
  words: string;
  /** Before the approval, words that date something need an intent; after it, the intent the approval kept is read. */
  moment: "propose" | "approve" | "send";
}

const sameWords = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const holds = (text: string, part: string): boolean => text.toLowerCase().includes(part.trim().toLowerCase());

/** The day a reason was about, as a sentence names it: "Thursday". */
function dayNamed(intent: PieceIntent | null, zone: string): string {
  const key = intent?.day ?? intent?.offer?.until ?? null;
  if (!key || !isDayKey(key)) return "Its day";
  const noon = Date.parse(`${key}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: zone }).format(noon);
}

/** Whether a fact the owner stated still covers these words today. */
const factCovers = (facts: readonly OwnersFact[], words: string, today: string): boolean =>
  facts.some((f) => f.until >= today && holds(f.says, words));

/**
 * The reason (PRD 6.1, the seventh check): what the piece was made for is still so. Its last moment has not passed; an
 * offer it carries still runs (a note in force says it, or the owner said so themselves); a service it names is still
 * offered. Before approval, words that date something need an intent. There is no bare "post anyway": a reason that no
 * longer stands says the three ways on.
 */
export function reasonStands(asked: ReasonAsked): PolicyRefusal | null {
  if (asked.goodUntil && Date.parse(asked.goodUntil) < asked.nowMs)
    return refusal("reason", "late", CHECK_WORDS.late(dayNamed(asked.intent, asked.zone)));
  const { intent } = asked;
  if (!intent) {
    const dated = asked.moment === "send" ? null : datedPhraseIn(asked.words);
    if (!dated) return null;
    const words = dated.is === "day" ? CHECK_WORDS.needsDay(dated.phrase) : CHECK_WORDS.needsOffer(dated.phrase);
    return refusal("reason", "reason_passed", words);
  }
  const today = zoneDayKey(asked.nowMs, asked.zone);
  const offer = intent.offer;
  if (offer) {
    const runs = (offer.until === null || offer.until >= today) && asked.notes.some((n) => holds(n, offer.says));
    if (!runs && !factCovers(asked.facts, offer.says, today))
      return refusal("reason", "reason_passed", CHECK_WORDS.offerEnded(offer.says));
  }
  const service = intent.service;
  if (service && !asked.services.some((s) => sameWords(s, service)) && !factCovers(asked.facts, service, today))
    return refusal("reason", "reason_passed", CHECK_WORDS.serviceGone(service));
  return null;
}
