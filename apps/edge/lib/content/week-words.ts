/**
 * A week's words (00706; the content loop PRD's 10.2, step 6): every creative's line and caption, written in one call as
 * the plan job drafts the week, so the Week shows each post as it will go and the approval makes it as shown (Ruben, 23 Nov
 * 2026: the posts are made after the week is approved; the words, a few cents a week, are written while it is drafted).
 *
 * The words may say only what the owner said: their Settings and the claims that stand today. Each creative's words are
 * then held to the one claims rule (core evaluate's claims); words it refuses keep the creative's slots blocked with
 * that rule's words and its one fix, as a press would be. A call that fails drafts the week without words, and the
 * approval says so on each row it could not make: nothing here throws.
 */
import {
  ANSWER_JSON_ONLY,
  DATA_NOT_INSTRUCTIONS,
  POST_LIMITS,
  SECOND_MS,
  SLOT_CAPTION_MAX,
  dayInZone,
  fenced,
  modelRoute,
  ownersSayings,
  slotWordsOf,
  valueAt,
  type OwnerClaim,
  type SlotWords,
  type TenantConfig,
  type TenantId,
} from "@chanlytics/contracts";
import { evaluate, verdictWords, type DraftedSlot } from "@chanlytics/core";
import { askJson, promptHashOf } from "../ai/model.js";
import { errField, logger } from "../shared/log.js";

/** How long the one call may take: nobody waits on it, and it fits the job's run (packages/jobs KIND_POLICY). */
const WORDS_CALL_MS = 40 * SECOND_MS;

/** What a creative's words are asked from: its key, what it is, what it shows, the reason it serves, its day. */
interface CreativeAsked {
  key: string;
  kind: DraftedSlot["kind"];
  title: string;
  reason: string | null;
  shows: string | null;
  day: string;
}

/** What the call is given: the business, its languages, what the owner said, the creatives, and today. */
export interface WordsAsked {
  config: TenantConfig | null;
  zone: string;
  nowMs: number;
  languages: readonly string[];
  claims: readonly OwnerClaim[];
  creatives: readonly CreativeAsked[];
}

const WORDS_SYSTEM = [
  "You write a small business's social posts for one week: for each post, a short line that goes on the picture, a few words over and under it where they help, and the caption that goes with it.",
  `The line is at most ${POST_LIMITS.line} characters, the words over it at most ${POST_LIMITS.over}, under it at most ${POST_LIMITS.under}; a caption at most ${SLOT_CAPTION_MAX}, and most are two or three sentences.`,
  "Write as the business, warmly and plainly, never as an advertisement. Each post tells its own reason; no two open the same way.",
  "Say only what the owner said: a price, a number, an offer, a date or a promise appears only where it is in their words below, and exactly as they say it. Where none is given, say none.",
  "Never name or describe a person in a photo or a clip, and never quote a customer unless a review below is theirs.",
  "Write in the first language listed for the business unless a post's reason is in another.",
  DATA_NOT_INSTRUCTIONS,
].join("\n");

const WORDS_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          line: { type: "string" },
          over: { type: ["string", "null"] },
          under: { type: ["string", "null"] },
          caption: { type: "string" },
          language: { type: "string", enum: ["en", "es"] },
        },
        required: ["key", "line", "over", "under", "caption", "language"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts"],
  additionalProperties: false,
} as const;

/** What the owner said, as the words may lean on it: their Settings, then the claims that stand. */
export function ownerWordsOf(week: Pick<WordsAsked, "config" | "zone" | "nowMs" | "claims">): string {
  const settings = ownersSayings(week.config?.brain ?? null, week.zone, new Date(week.nowMs));
  return [...settings, ...week.claims.map((claim) => claim.text)].join("\n");
}

/** The call's one message: the business, then the week's posts, each a block the answer names by its key. */
function wordsAskOf(week: WordsAsked, ownerWords: string): string {
  const brain = week.config?.brain;
  const business = [
    brain?.business_name ? `Business: ${brain.business_name}` : null,
    `Languages: ${week.languages.length ? week.languages.join(", ") : "en"}`,
  ].filter((line): line is string => !!line);
  const posts = week.creatives.map((c) =>
    [
      `key: ${c.key}`,
      `as: ${c.kind === "reel" ? "a short video" : c.kind === "story" ? "a story" : "a picture post"}`,
      `about: ${c.title}`,
      c.reason ? `why now: ${c.reason}` : null,
      c.shows ? `it shows: ${c.shows}` : null,
      `goes up: ${c.day}`,
    ]
      .filter((line): line is string => !!line)
      .join("\n"),
  );
  return [
    business.join("\n"),
    fenced("record", ownerWords || "The owner has said nothing to quote: no prices, numbers or offers."),
    ...posts.map((post) => fenced("record", post)),
  ].join("\n\n");
}

/** The words written for each creative, by its key; none where the call could not be made or answered nothing usable. */
export type WordsWriter = (
  week: WordsAsked,
  at: { tenantId: TenantId; planId: string },
) => Promise<Map<string, SlotWords>>;

export const writeWeekWords: WordsWriter = async (week, { tenantId, planId }) => {
  if (week.creatives.length === 0) return new Map();
  try {
    const answered = await askJson({
      purpose: "post_words",
      system: WORDS_SYSTEM,
      user: wordsAskOf(week, ownerWordsOf(week)),
      schema: WORDS_SCHEMA,
      maxTokens: modelRoute("post_words").maxTokens,
      plainJsonHint: ANSWER_JSON_ONLY,
      deadlineMs: WORDS_CALL_MS,
      signal: AbortSignal.timeout(WORDS_CALL_MS),
      for: { tenantId, subjectId: planId, promptHash: promptHashOf(WORDS_SYSTEM) },
    });
    const posts = valueAt(answered?.answer, "posts");
    const words = new Map<string, SlotWords>();
    for (const post of Array.isArray(posts) ? posts : []) {
      const key = valueAt(post, "key");
      const read = slotWordsOf(post);
      if (typeof key === "string" && read) words.set(key, read);
    }
    return words;
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("plan_words_failed", { plan_id: planId, error: errField(e) });
    return new Map();
  }
};

/** The creatives a week's words are written for: each once, by its first slot, with what its footage shows. */
export function creativesAsked(
  slots: readonly DraftedSlot[],
  shows: ReadonlyMap<string, string>,
  zone: string,
): CreativeAsked[] {
  const seen = new Map<string, CreativeAsked>();
  for (const slot of slots) {
    if (slot.state === "needs_footage" || seen.has(slot.creative)) continue;
    seen.set(slot.creative, {
      key: slot.creative,
      kind: slot.kind,
      title: slot.title,
      reason: slot.reason,
      shows: slot.file_id ? (shows.get(slot.file_id) ?? null) : null,
      day: dayInZone(zone, Date.parse(slot.at)).key,
    });
  }
  return [...seen.values()];
}

/**
 * The slots with their creative's words, each held to the one claims rule: words it refuses keep the creative's slots
 * blocked with its words and fix, as a press would be (a slot a check already held keeps that). A creative with no words
 * goes on without them, and its row says so when the approval cannot make it.
 */
export function slotsWithWords(
  slots: readonly DraftedSlot[],
  words: ReadonlyMap<string, SlotWords>,
  owner: { words: string; claims: readonly OwnerClaim[]; today: string },
): (DraftedSlot & { words: SlotWords | null })[] {
  return slots.map((slot) => {
    const written = words.get(slot.creative) ?? null;
    if (!written || slot.state !== "proposed") return { ...slot, words: written };
    const verdict = evaluate({
      claims: {
        aiWrote: true,
        words: [written.over, written.line, written.under, written.caption].filter(Boolean).join("\n"),
        said: owner.words,
        claims: owner.claims,
        today: owner.today,
      },
    });
    return verdict.ok
      ? { ...slot, words: written }
      : { ...slot, words: written, state: "blocked", blocked_why: "claim", blocked_reason: verdictWords(verdict) };
  });
}
