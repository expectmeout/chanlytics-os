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
 * Claims are the owner's own words, or AI's held to what the owner said and the claims that stand (claims.ts, pass 3's
 * owner_claims). The reason reads the business's facts and, where a piece was made for an opportunity, the opportunities
 * as they stand now (pass 3's opportunitiesOf), so "Thursday has openings" is asked again right before it goes. What is
 * not here yet, and why: a rung other than "AI asks first" waits for the Autonomy pane's content rows.
 */
import {
  CONTENT_CHECK_WORDS,
  ON_FACEBOOK,
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
  type Opportunity,
  type OwnerClaim,
  type OwnersFact,
  type PieceIntent,
  type PostAbout,
  type PostHeldWhy,
  type PostKind,
  type PostPlace,
} from "@chanlytics/contracts";
import { claimProblemOf, saidWithClaims, type ClaimProblem } from "./claims";

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
  return refusal(
    "authorization",
    "approver",
    actor.approving ? CONTENT_CHECK_WORDS.mayNot : ON_INSTAGRAM.held.approver,
  );
}

/** What the claims check reads: the words, who wrote them, what the owner said here, and the claims kept. */
export interface ClaimsAsked {
  aiWrote: boolean;
  words: string;
  /** The owner's own words this claim may lean on: their questions in the conversation at hand, their Settings. */
  said: string;
  claims: readonly Pick<OwnerClaim, "text" | "valid_until" | "withdrawn_at">[];
  /** Today, in the business's own zone: a claim stands through its last day. */
  today: string;
}

/** A claim problem in the owner's words with its one fix (PRD 6.3, Claim). */
const claimWordsOf = (problem: ClaimProblem): string =>
  problem.is === "price" || problem.is === "money"
    ? CONTENT_CHECK_WORDS.notAnOffer(problem.phrase)
    : CONTENT_CHECK_WORDS.notYours(problem.phrase);

/**
 * Claim evidence (PRD 6.1): every price, share off, number, money offer or promise in words AI wrote is one the owner
 * said, or a claim that stands today. The owner's own words are theirs, and never refused by a guess.
 */
export function evaluateClaimPolicy(claim: ClaimsAsked): PolicyRefusal | null {
  if (!claim.aiWrote) return null;
  const problem = claimProblemOf(claim.words, saidWithClaims(claim.said, claim.claims, claim.today));
  return problem ? refusal("claims", "claim", claimWordsOf(problem)) : null;
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
function videoProblem(placement: PlaceAsked): string | null {
  const limits = PLACE_CAPABILITIES[placement.place].limits.video;
  if (!limits || !placement.video) return null;
  const { mime, bytes, ms } = placement.video;
  if (mime && !limits.mimes.includes(mime)) return CONTENT_CHECK_WORDS.video;
  if (bytes !== null && bytes > limits.maxBytes) return CONTENT_CHECK_WORDS.video;
  if (ms !== null && (ms < limits.minMs || ms > limits.maxMs)) return CONTENT_CHECK_WORDS.video;
  return null;
}

/** Why the place does not take this kind of this file, in words; null where it does. */
function kindProblem(placement: PlaceAsked): string | null {
  // A Page (pass 5) takes what Instagram takes: a picture as a post or a story, a video as a reel.
  if (placement.place !== "google" && !instagramKindsFor(placement.fileKind).some((kind) => kind === placement.kind))
    return placement.place === "facebook" ? ON_FACEBOOK.wrongKind : ON_INSTAGRAM.wrongKind;
  const google = placement.place === "google" && (placement.fileKind === "video" || placement.kind !== "picture");
  if (google || !capabilityStands(PLACE_CAPABILITIES[placement.place].formats[placement.kind]))
    return CONTENT_CHECK_WORDS.notTaken(placement.place, ON_INSTAGRAM.kind[placement.kind]);
  return null;
}

/** Publishing: the place takes this kind (section 7), the connection allows it, and the words fit the place's limits. */
export function placeAllows(placement: PlaceAsked): PolicyRefusal | null {
  const kind = kindProblem(placement);
  if (kind) return refusal("publishing", "place", kind);
  if (placement.connection === "not_connected")
    return refusal("publishing", "disconnected", CONTENT_CHECK_WORDS.notConnected(placement.place));
  if (placement.connection === "line_off") return refusal("publishing", "line_off", CONTENT_CHECK_WORDS.lineOff);
  const max = PLACE_CAPABILITIES[placement.place].limits.captionMax;
  if (placement.caption && placement.caption.length > max)
    return refusal("publishing", "place", CONTENT_CHECK_WORDS.tooLong(placement.place, max));
  const words = placement.place === "instagram" && placement.caption ? postCaptionProblem(placement.caption) : null;
  if (words) return refusal("publishing", "place", words);
  const video = placement.kind === "reel" ? videoProblem(placement) : null;
  return video ? refusal("publishing", "place", video) : null;
}

/** Money: what this costs fits what is left of the month's limit, where one is set. */
export function budgetAllows(money: {
  costCents: number;
  leftCents: number | null;
  limitCents: number | null;
}): PolicyRefusal | null {
  if (money.leftCents === null || money.costCents <= money.leftCents) return null;
  return refusal("money", "money", CONTENT_CHECK_WORDS.money(Math.round((money.limitCents ?? 0) / 100)));
}

/** Automation: nothing goes while everything is stopped, and AI never posts alone while its rung asks first. */
export function automationAllows(at: { stopped: boolean; pressedBy: "owner" | "ai" }): PolicyRefusal | null {
  if (at.stopped) return refusal("automation", "stopped", CONTENT_CHECK_WORDS.stopped);
  return at.pressedBy === "ai" ? refusal("automation", "stopped", CONTENT_CHECK_WORDS.aiAlone) : null;
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
  /**
   * The reasons to post as they stand this moment (opportunitiesOf, read again), where the piece was made for one; null
   * where none was read (a piece made for no opportunity, or a caller that has no reader of them); `unread` where the
   * send asked and they could not be read: a promise of open time is then not known to stand.
   */
  opportunities: readonly Pick<Opportunity, "key">[] | "unread" | null;
  /** Before a send the words say what to change; at a send, what changed since it was approved. */
  moment: "before" | "send";
}

const wordsMatch = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
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
function lateRefusal(reason: ReasonAsked): PolicyRefusal | null {
  if (!reason.goodUntil) return null;
  const until = Date.parse(reason.goodUntil);
  if (until < reason.nowMs)
    return refusal("reason", "late", CONTENT_CHECK_WORDS.late(dayNamed(reason.intent, reason.zone)));
  return until < reason.atMs ? refusal("reason", "late", CONTENT_CHECK_WORDS.afterItsDay) : null;
}

/**
 * The reason (PRD 6.1, the seventh check): what the piece was made for is still so. Its last moment has not passed; an
 * offer it carries still runs (the business says it now, or the owner said so themselves); a service it names is still
 * offered. A piece with no intent leans on nothing Chanlytics tracks. There is no bare "post anyway": a reason that no
 * longer stands says the three ways on.
 */
export function reasonStands(reason: ReasonAsked): PolicyRefusal | null {
  const late = lateRefusal(reason);
  if (late) return late;
  const { intent } = reason;
  if (!intent) return null;
  const today = zoneDayKey(reason.nowMs, reason.zone);
  const before = reason.moment === "before";
  const offer = intent.offer;
  if (offer) {
    const runs = (offer.until === null || offer.until >= today) && reason.says.some((line) => holds(line, offer.says));
    if (!runs && !factCovers(reason.facts, offer.says, today))
      return refusal(
        "reason",
        "reason_passed",
        before ? CONTENT_CHECK_WORDS.notAnOffer(offer.says) : CONTENT_CHECK_WORDS.offerEnded(offer.says),
      );
  }
  const service = intent.service;
  if (service && !reason.services.some((s) => wordsMatch(s, service)) && !factCovers(reason.facts, service, today))
    return refusal(
      "reason",
      "reason_passed",
      before ? CONTENT_CHECK_WORDS.notAService(service) : CONTENT_CHECK_WORDS.serviceGone(service),
    );
  return opportunityRefusal(reason, today);
}

/**
 * The opportunity a piece was made for, asked again (PRD 6.1, the seventh check): open time on a day it named is still
 * open. Asked only where the piece names one and the caller read them; an owner's stated fact for its day covers it
 * ("Thursday still has openings"), since Chanlytics sees only its own calendar. Where the caller asked and could not
 * read them, the promise is not known to stand: refused under a why of its own (`reason_unread`), never let through.
 */
function opportunityRefusal(reason: ReasonAsked, today: string): PolicyRefusal | null {
  const named = reason.intent?.opportunity_id;
  const now = reason.opportunities;
  if (!named || now === null || (now !== "unread" && now.some((o) => o.key === named))) return null;
  const day = dayNamed(reason.intent, reason.zone);
  if (factCovers(reason.facts, day, today)) return null;
  // Not read is not known: neither gone nor still there. Its own why, so whoever asked may ask again before holding it.
  if (now === "unread") return refusal("reason", "reason_unread", CONTENT_CHECK_WORDS.openingsUnread(day));
  return refusal(
    "reason",
    "reason_passed",
    reason.moment === "before" ? CONTENT_CHECK_WORDS.noOpenings(day) : CONTENT_CHECK_WORDS.filledUp(day),
  );
}
