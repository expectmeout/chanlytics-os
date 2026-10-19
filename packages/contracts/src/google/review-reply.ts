/**
 * The receptionist under a Google review — the pure half.
 *
 * What the Autonomy row for reviews means, the prompt that writes a reply in
 * the business's name, which unreplied reviews the auto mode may answer in
 * one sync, how a draft is cleaned before it is shown or posted, and the
 * words the pages say. No model, no network: the edge calls the model with
 * the prompt built here; the tests read the same functions.
 */

import { clockTime } from "../shared/clock";
import { PLAYBOOK_VETO_DELAY_MS } from "../playbooks/playbook-triggers";
import { DAY_MS } from "../shared/time";
import { waitEndsWords } from "../waits/wait-rules";
import { violatesNoPrices, namesMoney } from "../config/policy";
import { DATA_NOT_INSTRUCTIONS, fenced, promptSafeName } from "../ai/fence";

export type ReviewReplyMode = "auto" | "veto" | "ask" | "never";

/** The row's mode, from the workspace's policy rows. No row, or a mode the class cannot take, reads as ask: a draft held for your OK, nothing posted alone. */
export function reviewReplyModeOf(
  rows: ReadonlyArray<{ class: string; mode: string }> | null | undefined,
): ReviewReplyMode {
  const m = rows?.find((r) => r.class === "reviews")?.mode;
  return m === "auto" || m === "veto" || m === "never" ? m : "ask";
}

/**
 * Under Holds it (decision 0064, step 6), a review's reply is written and posted after this long unless it is stopped:
 * the hold a batch is given (the veto's wait, so the Autonomy row's words are its), read by the hourly sync, which
 * posts it at its first run after the time.
 */
export const REVIEW_HOLD_MS = PLAYBOOK_VETO_DELAY_MS;

/**
 * The reply the receptionist wrote and holds under a review (decision 0064, step 6): its words, which go in the composer;
 * its line under the review, how its wait ends (reviewHeldReplyWords); and whether it posts on its own after its time
 * (Holds it) or waits for your OK (Ask me).
 */
export interface HeldReviewReply {
  text: string;
  words: string;
  posts: boolean;
}

/** A review's held reply as a card draws it, or null: none is held, or a reply is already posted. */
export function heldReviewReplyOf(
  r: { reply_text: string | null; draft_text?: string | null; posts_at?: string | null },
  tz: string,
): HeldReviewReply | null {
  if (r.reply_text || !r.draft_text) return null;
  return { text: r.draft_text.trim(), words: reviewHeldReplyWords(r.posts_at, tz), posts: !!r.posts_at };
}

/** A held reply's line under its review: when it goes (Holds it) or that it waits for your OK (Ask me), by the wait rule. */
export function reviewHeldReplyWords(postsAt: string | null | undefined, tz: string): string {
  const at = postsAt ? Date.parse(postsAt) : NaN;
  return Number.isFinite(at)
    ? `${waitEndsWords("review_hold", `after ${clockTime(at, tz)}`)}.`
    : `${waitEndsWords("review_ask")}.`;
}

/**
 * The bell when the sync wrote replies and holds them (decision 0064, step 6): under Ask me they wait for your OK, under
 * Holds it each posts after its time unless stopped. One review's opens it; several open the lens. Null for none.
 */
export function reviewDraftsBell(
  drafted: ReadonlyArray<{ author: string | null; text: string; posts_at: string | null }>,
  tz: string,
): { title: string; body: string } | null {
  const [d, ...rest] = drafted;
  if (!d) return null;
  if (rest.length === 0) {
    const who = (d.author ?? "").trim();
    const goes = d.posts_at ? `posts after ${clockTime(Date.parse(d.posts_at), tz)}` : "waits for your OK";
    return {
      title: `${REVIEW_REPLY_HELD_TITLE} ${who ? `${who}'s review` : "a review"} ${goes}`,
      body: `${d.text} ${reviewHeldReplyWords(d.posts_at, tz)}`,
    };
  }
  const holds = drafted.some((r) => r.posts_at);
  return {
    title: `${drafted.length} replies to reviews ${holds ? "post unless you stop them" : "wait for your OK"}`,
    body: "Each is on Reports, under its review.",
  };
}

/** How a held reply's bell row begins, so the bell's close finds it (notice-closes.ts): "A reply to …". */
export const REVIEW_REPLY_HELD_TITLE = "A reply to";

/** What the receptionist knows about the business when it writes under a review. */
export interface ReviewReplyFacts {
  name: string;
  /** The owner's own words for how the receptionist speaks, when given. */
  tone: string | null;
  /** The languages the business speaks, first one first. */
  languages: string[];
  /** The line customers already use, for the invitation on a poor review. */
  phone: string | null;
  website: string | null;
  /** Service names, so a reply can name what they had without inventing it. */
  services: string[];
}

export interface ReviewToAnswer {
  rating: number | null;
  author: string | null;
  text: string | null;
  /** When it was written, ISO, when known. */
  written_at: string | null;
}

/** At most this many words; Google shows a reply beside the review, not under a fold. */
export const REVIEW_REPLY_MAX_WORDS = 60;
/** A cap on the cleaned draft, well above the words asked for and well under Google's 4096. */
export const REVIEW_REPLY_MAX_CHARS = 1000;
/** How many unreplied reviews the auto mode answers in one sync; the rest wait for the next hour. */
export const REVIEW_AUTO_REPLIES_PER_SYNC = 3;
/** The auto mode answers reviews written within this long; older ones are the owner's. */
export const REVIEW_AUTO_REPLY_MAX_AGE_MS = 14 * DAY_MS;

function firstName(author: string | null): string | null {
  const a = (author ?? "").trim();
  if (!a || /^(a google user|anonymous)$/i.test(a)) return null;
  return a.split(/\s+/)[0];
}

/**
 * The prompt: the business as the system, the review as the message. The
 * rules are the charter's — no money, no invented facts, no arguing — and
 * the reply's length and language are fixed here, not left to taste.
 */
export function reviewReplyPrompt(facts: ReviewReplyFacts, review: ReviewToAnswer): { system: string; user: string } {
  const lang = facts.languages[0] ?? "English";
  const system = [
    "You write the public reply a business posts under a Google review, in the business's own name.",
    `Business: ${facts.name}.`,
    facts.tone ? `Tone, in the owner's words: ${facts.tone}` : null,
    facts.languages.length ? `Languages the business speaks: ${facts.languages.join(", ")}.` : null,
    facts.services.length ? `Services: ${facts.services.slice(0, 12).join(", ")}.` : null,
    facts.website ? `Website: ${facts.website}` : null,
    facts.phone ? `Phone: ${facts.phone}` : null,
    "",
    "Rules:",
    `- Reply in the language the review is written in. When the review has no words, reply in ${lang}.`,
    `- One to three sentences, at most ${REVIEW_REPLY_MAX_WORDS} words. Warm and specific to what they wrote, never a form letter.`,
    "- Address them by first name when one is given; no name when the review is anonymous.",
    "- Four or five stars: thank them and pick up one thing they praised.",
    `- Three stars or fewer: thank them for the feedback, apologise plainly for what went wrong, and invite them to get in touch so it can be put right${facts.phone ? ` (${facts.phone})` : ""}. Never argue, never dispute what they wrote, never blame them.`,
    "- Never mention refunds, discounts, prices or compensation — those decisions belong to the owner.",
    "- Never invent details about their visit, names of staff, or promises the business did not make.",
    "- No emojis, no hashtags, no sign-off, no quotation marks around the reply, and do not write the business name at the end.",
    `- ${DATA_NOT_INSTRUCTIONS}`,
    "",
    "Answer with the reply text only.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const author = promptSafeName(review.author);
  const name = firstName(author);
  const text = (review.text ?? "").replace(/\s+/g, " ").trim();
  // The review is someone else's words: fenced, so a line in it can say nothing to the model (ai/fence.ts).
  const user = [
    `Rating: ${typeof review.rating === "number" ? `${review.rating} of 5` : "not given"}`,
    `From: ${name ? author : "a customer who did not give a name"}`,
    review.written_at ? `Written: ${review.written_at.slice(0, 10)}` : null,
    text ? `Review:\n${fenced("review", text)}` : "The review has no words, only the stars.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  return { system, user };
}

/**
 * A draft as the model returned it, made fit to show or post: labels the
 * model sometimes prefixes, quotation marks around the whole, and runs of
 * whitespace gone; empty when nothing usable remains.
 */
export function cleanDraft(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let t = raw.replace(/\r\n?/g, "\n").trim();
  t = t.replace(/^(reply|response|draft)\s*:\s*/i, "");
  t = t.replace(/^["“”'‘’«»]+|["“”'‘’«»]+$/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t.slice(0, REVIEW_REPLY_MAX_CHARS);
}

/**
 * Why an automatic reply may not be posted in public: it names a price or money (a refund, a discount, compensation)
 * the prompt already forbids. Layer two for reviews: the prompt is never the only defense, and a reply posted on Google
 * cannot be taken back the way a held draft can. Null when it may go.
 */
export function autoReplyHold(text: string): "price" | "money" | null {
  if (violatesNoPrices(text)) return "price";
  if (namesMoney(text)) return "money";
  return null;
}

/** Why a reply was held, as autoReplyHold names it, finishing "…and held it:" -- the one set the activity feed and Reports read. */
const REVIEW_HELD_WORDS: Readonly<Record<string, string>> = { price: "it named a price", money: "it named money" };

/** The reason a held reply gives in words, from google.reply_held's `why`; null for one this set does not hold (never a guess). */
export function reviewHeldWords(why: string | null | undefined): string | null {
  return why != null && Object.hasOwn(REVIEW_HELD_WORDS, why) ? (REVIEW_HELD_WORDS[why] ?? null) : null;
}

export interface ReviewOnRecord {
  id: string;
  review_id: string;
  origin: string;
  published_at: string | null;
  reply_text: string | null;
}

/**
 * The reviews the auto mode may answer in one sync: from the profile, with
 * no reply yet, written after the profile was connected — what came in
 * while the receptionist was on duty, never the years before — and not
 * older than two weeks. Newest first, capped; the rest wait for the next
 * hour, which finds them still unreplied.
 */
export function autoReplyCandidates<T extends ReviewOnRecord>(
  rows: readonly T[],
  connectedAt: string | null,
  nowMs: number,
  cap = REVIEW_AUTO_REPLIES_PER_SYNC,
): T[] {
  const connected = connectedAt ? Date.parse(connectedAt) : NaN;
  if (Number.isNaN(connected)) return [];
  return rows
    .filter((r) => r.origin === "profile" && !r.reply_text && r.published_at)
    .map((r) => ({ r, at: Date.parse(r.published_at as string) }))
    .filter(({ at }) => !Number.isNaN(at) && at > connected && nowMs - at <= REVIEW_AUTO_REPLY_MAX_AGE_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, cap))
    .map(({ r }) => r);
}

/** The bell after the receptionist answered: one review by name, several by count. */
export function autoReplyBell(
  answered: ReadonlyArray<{ author: string | null; text: string }>,
): { title: string; body: string } | null {
  if (!answered.length) return null;
  if (answered.length === 1) {
    const who = (answered[0].author ?? "").trim();
    return { title: who ? `Replied to ${who}'s review` : "Replied to a review on Google", body: answered[0].text };
  }
  const names = answered.map((a) => (a.author ?? "").trim()).filter(Boolean);
  return {
    title: `Replied to ${answered.length} reviews on Google`,
    body: names.length
      ? `Under the reviews from ${names.join(", ")}. Each reply is on Reports.`
      : "Each reply is on Reports.",
  };
}

/** What the Reports card says beside the source of its reviews, when replies can go out from here. */
export function reviewReplyWords(mode: ReviewReplyMode | null | undefined, canReply: boolean): string {
  if (!canReply || !mode) return "";
  if (mode === "auto") return "new ones are answered by the receptionist within the hour";
  if (mode === "veto") return "the receptionist writes each reply and posts it after 30 minutes unless you stop it";
  if (mode === "ask") return "the receptionist writes each reply and holds it for your OK";
  return "";
}
