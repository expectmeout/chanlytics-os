/**
 * The receptionist under a Google review — the pure half.
 *
 * What the Autonomy row for reviews means, the prompt that writes a reply in
 * the business's name, which unreplied reviews the auto mode may answer in
 * one sync, how a draft is cleaned before it is shown or posted, and the
 * words the pages say. No model, no network: the edge calls the model with
 * the prompt built here; the tests read the same functions.
 */

import { DAY_MS } from "../shared/time";

export type ReviewReplyMode = "auto" | "ask" | "never";

/** The row's mode, from the workspace's policy rows. No row, or a mode the class cannot take, reads as ask: a draft on request, nothing posted alone. */
export function reviewReplyModeOf(
  rows: ReadonlyArray<{ class: string; mode: string }> | null | undefined,
): ReviewReplyMode {
  const m = rows?.find((r) => r.class === "reviews")?.mode;
  return m === "auto" || m === "never" ? m : "ask";
}

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
    "",
    "Answer with the reply text only.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const name = firstName(review.author);
  const text = (review.text ?? "").replace(/\s+/g, " ").trim();
  const user = [
    `Rating: ${typeof review.rating === "number" ? `${review.rating} of 5` : "not given"}`,
    `From: ${name ? review.author!.trim() : "a customer who did not give a name"}`,
    review.written_at ? `Written: ${review.written_at.slice(0, 10)}` : null,
    text ? `Review: "${text}"` : "The review has no words, only the stars.",
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
  if (mode === "ask") return "the receptionist drafts, you send";
  return "";
}
