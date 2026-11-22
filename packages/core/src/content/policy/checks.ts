/**
 * The seven checks a post is held to (the content loop PRD's 6.1), each a pure function over the facts its caller read:
 * the card that proposes it, the press that approves it, and the job right before the send (6.2). Each answers null, or
 * its refusal in the owner's words with the one thing to do. `evaluate` (evaluate.ts) asks those a moment has facts for
 * and answers every refusal at once.
 *
 * A check is a help, never a new way to be blocked: none of them guesses at an owner's own words. Whether words lean on a
 * day, an offer or a service is AI's to say as it drafts a placement (its card carries what they are about);
 * `wordsNeedAbout` is only the backstop on AI's own card for the plain cases, in the two languages AI writes posts in,
 * and what an owner types and presses themselves is their own word.
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
  postCaptionProblem,
  priceFigures,
  zoneDayKey,
  type ContentCheck,
  type InstagramPostable,
  type OwnersFact,
  type PieceIntent,
  type PostAbout,
  type PostHeldWhy,
  type PostKind,
  type PostPlace,
  type RightsGap,
} from "@chanlytics/contracts";

/** One refusal: which check, its code (as the post keeps it when held), and the words with the one thing to do. */
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
 * Content rights (principle 6: per person, per use): no new use of a file whose yes was taken back and not given again,
 * and none while a person named in it, or in what it was drawn from, has no yes of their own, or nobody is sure who is
 * in it (00691 file_rights_gap).
 */
export function rightsFor(files: { takenBack: boolean; gap: RightsGap }): PolicyRefusal | null {
  if (files.takenBack) return refusal("rights", "rights", CHECK_WORDS.takenBack);
  if (files.gap.is === "ok") return null;
  return refusal("rights", "rights", CHECK_WORDS.notYetSaid(files.gap.is === "person" ? files.gap.name : null));
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

/** Why the place does not take this kind of this file, in words; null where it does. */
function kindProblem(asked: PlaceAsked): string | null {
  if (asked.place === "instagram" && !instagramKindsFor(asked.fileKind).some((kind) => kind === asked.kind))
    return ON_INSTAGRAM.wrongKind;
  const google = asked.place === "google" && (asked.fileKind === "video" || asked.kind !== "picture");
  if (google || !capabilityStands(PLACE_CAPABILITIES[asked.place].formats[asked.kind]))
    return CHECK_WORDS.notTaken(asked.place, ON_INSTAGRAM.kind[asked.kind]);
  return null;
}

/** Publishing: the place takes this kind (section 7), the connection allows it, and the words fit the place's limits. */
export function placeAllows(asked: PlaceAsked): PolicyRefusal | null {
  const kind = kindProblem(asked);
  if (kind) return refusal("publishing", "place", kind);
  if (asked.connection === "not_connected")
    return refusal("publishing", "disconnected", CHECK_WORDS.notConnected(asked.place));
  if (asked.connection === "line_off") return refusal("publishing", "line_off", CHECK_WORDS.lineOff);
  const max = PLACE_CAPABILITIES[asked.place].limits.captionMax;
  if (asked.caption && asked.caption.length > max)
    return refusal("publishing", "place", CHECK_WORDS.tooLong(asked.place, max));
  const words = asked.place === "instagram" && asked.caption ? postCaptionProblem(asked.caption) : null;
  if (words) return refusal("publishing", "place", words);
  const video = asked.kind === "reel" ? videoProblem(asked) : null;
  return video ? refusal("publishing", "place", video) : null;
}

/** Money: what this costs fits what is left of the month's limit, where one is set. */
export function budgetAllows(money: {
  costCents: number;
  leftCents: number | null;
  limitCents: number | null;
}): PolicyRefusal | null {
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
/** A share off, or a word that is only ever an offer. */
const OFFER_WORDS = /\b\d{1,3}\s?%|\b(?:discount|promo|descuento|oferta|promoci[oó]n)\b/i;

/**
 * The backstop on AI's own card (PRD 6.1): words AI drafted that plainly name a date, a day, a share off or a price come
 * with what they are about, so the piece keeps its reason. AI says so itself: `about` names the day, the offer or the
 * service, or says outright that the words date nothing (a standing "Open Thursday to Saturday"). Null where the card
 * says what its words are about, or nothing plain was found; else the phrase and what it is. Never asked of words an
 * owner typed and pressed themselves.
 */
export function wordsNeedAbout(words: string, about: PostAbout | null): { is: "day" | "offer"; phrase: string } | null {
  if (about && (about.day || about.offer || about.service || about.nothing)) return null;
  const date = WRITTEN_DATE.exec(words)?.[0];
  if (date) return { is: "day", phrase: date };
  const day = dayWordIn(words);
  if (day) return { is: "day", phrase: new RegExp(`\\b${day}\\w*`, "i").exec(words)?.[0] ?? day };
  const offer = OFFER_WORDS.exec(words)?.[0] ?? priceFigures(words)[0];
  return offer ? { is: "offer", phrase: offer } : null;
}

/** What the reason check reads: why the piece exists, its last moment, the business's facts now, and what was said. */
export interface ReasonAsked {
  intent: PieceIntent | null;
  goodUntil: string | null;
  /** The moment judged: now at a send; the placement's own time where it is being approved for later. */
  atMs: number;
  nowMs: number;
  zone: string;
  /** What the business says of itself now: its notes in force and its services with their prices, a line each. */
  says: readonly string[];
  services: readonly string[];
  facts: readonly OwnersFact[];
  /** Before a send the words say what to change; at a send, what changed since it was approved. */
  moment: "before" | "send";
}

const sameWords = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
const holds = (text: string, part: string): boolean => text.toLowerCase().includes(part.trim().toLowerCase());

/** The day a reason was about, as a sentence names it: "Thursday". */
function dayNamed(intent: PieceIntent | null, zone: string): string {
  const key = intent?.day ?? intent?.offer?.until ?? null;
  if (!key || !isDayKey(key)) return "Its day";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: zone }).format(Date.parse(`${key}T12:00:00Z`));
}

/** Whether a fact the owner stated still covers these words today. */
const factCovers = (facts: readonly OwnersFact[], words: string, today: string): boolean =>
  facts.some((f) => f.until >= today && holds(f.says, words));

/** Too late: its last moment has gone by, or the time it is being set for comes after it. */
function lateRefusal(asked: ReasonAsked): PolicyRefusal | null {
  if (!asked.goodUntil) return null;
  const until = Date.parse(asked.goodUntil);
  if (until < asked.nowMs) return refusal("reason", "late", CHECK_WORDS.late(dayNamed(asked.intent, asked.zone)));
  return until < asked.atMs ? refusal("reason", "late", CHECK_WORDS.afterItsDay) : null;
}

/**
 * The reason (PRD 6.1, the seventh check): what the piece was made for is still so. Its last moment has not passed; an
 * offer it carries still runs (the business says it now, or the owner said so themselves); a service it names is still
 * offered. A piece with no intent leans on nothing Chanlytics tracks. There is no bare "post anyway": a reason that no
 * longer stands says the three ways on.
 */
export function reasonStands(asked: ReasonAsked): PolicyRefusal | null {
  const late = lateRefusal(asked);
  if (late) return late;
  const { intent } = asked;
  if (!intent) return null;
  const today = zoneDayKey(asked.nowMs, asked.zone);
  const before = asked.moment === "before";
  const offer = intent.offer;
  if (offer) {
    const runs = (offer.until === null || offer.until >= today) && asked.says.some((line) => holds(line, offer.says));
    if (!runs && !factCovers(asked.facts, offer.says, today))
      return refusal(
        "reason",
        "reason_passed",
        before ? CHECK_WORDS.notAnOffer(offer.says) : CHECK_WORDS.offerEnded(offer.says),
      );
  }
  const service = intent.service;
  if (service && !asked.services.some((s) => sameWords(s, service)) && !factCovers(asked.facts, service, today))
    return refusal(
      "reason",
      "reason_passed",
      before ? CHECK_WORDS.notAService(service) : CHECK_WORDS.serviceGone(service),
    );
  return null;
}
