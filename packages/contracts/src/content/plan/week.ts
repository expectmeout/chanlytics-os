/**
 * A week of posts as one list (the content loop PRD's 8.4, 10 and 21.2): the reasons to post now, a plan's slots and
 * how each was scored, what the plan asks to be filmed, and the few pure rules every tree reads the same way: which
 * week a plan is for, when it is due ready, how a week says its size, and the cadence a workspace stands at.
 */
import type { PieceIntent } from "../placements/approvals";
import type { PostHeldWhy, PostKind } from "../posts";
import type { OpportunityKind, PlanPlace, PlanStatus, SlotState } from "./sets";
import { CADENCE_DEFAULT } from "../../config/content-cadence";
import type { ContentCadence } from "../../config/content-config";
import { POST_LIMITS, type PostLanguage } from "../../files/post";
import { isObjectRecord, nonBlankOrNull } from "../../shared/unknown";
import { DOW, keyParts, mondayOf, shiftKey } from "../../shared/zone/day-keys";
import { dayInZone } from "../../shared/zone/math";

/**
 * A reason to post now, with its evidence (PRD 10.1). `key` names it within its week, the same each time it is read,
 * so a slot's intent can name it (`opportunity_id`) and the send can ask whether it still stands.
 */
export interface Opportunity {
  key: string;
  kind: OpportunityKind;
  /** The sentence an owner reads: "Thursday has 3 hours open". */
  says: string;
  /** The day it is about (a day key in the business's zone), where it is about one. */
  day: string | null;
  /** The last day it stands, where it ends (an offer's last day). */
  until: string | null;
  /** The service it is about, by the business's own name for it. */
  service: string | null;
  /** How strong a reason it is, 0 to 1. */
  strength: number;
  /** What it was read from: hours open, a review's stars and first words, a file's id, a claim's id. Never a person. */
  evidence: Readonly<Record<string, string | number | boolean | null>>;
}

/** The parts a candidate is scored on (PRD 10.2, step 3), each 0 to 1 with its reason. */
export type ScorePart =
  "relevance" | "footage_fit" | "eligibility" | "novelty" | "audience_fit" | "effort" | "expected_value" | "timeliness";

/** A slot's score, kept on the row (plan_slots.score): the total and each part with why. */
export interface SlotScore {
  total: number;
  parts: { [K in ScorePart]: { value: number; why: string } };
}

/** What a slot that needs footage asks to be filmed (plan_slots.ask): one sentence, a length, and the reason it serves. */
export interface FootageAsk {
  what: string;
  seconds: number;
  opportunity_id: string | null;
}

/**
 * Why a slot is held: what holds a post (contracts POST_HELD_WHYS), or `unmade`, approved and what it was to be made into
 * could not be (its one fix: Try again).
 */
export type SlotHeldWhy = PostHeldWhy | "unmade";

/**
 * The words AI wrote for a creative while drafting the week (00706 `plan_slots.words`), as the Week shows them and the
 * approval makes them: the picture's line and the small words over and under it, the caption that goes with it, and the
 * language they are in. A reel opens on its line.
 */
export interface SlotWords {
  line: string;
  over: string | null;
  under: string | null;
  caption: string;
  language: PostLanguage;
}

/** The most a week's caption says: short enough for every place a slot goes (Google's 1,500 is the least). */
export const SLOT_CAPTION_MAX = 1500;

/** Words within their limit, or null where they are past it or blank. */
const within = (value: unknown, most: number): string | null => {
  const words = nonBlankOrNull(value);
  return words && words.length <= most ? words : null;
};

/**
 * A creative's words as AI answered them or the database keeps them, read: null for words that are not the shape, a
 * line or a caption missing or past its limit. What a picture says over it is held to the post's own limits.
 */
export function slotWordsOf(value: unknown): SlotWords | null {
  if (!isObjectRecord(value)) return null;
  const line = within(value.line, POST_LIMITS.line);
  const caption = within(value.caption, SLOT_CAPTION_MAX);
  if (!line || !caption) return null;
  return {
    line,
    over: within(value.over, POST_LIMITS.over),
    under: within(value.under, POST_LIMITS.under),
    caption,
    language: value.language === "es" ? "es" : "en",
  };
}

/** One slot of a week's plan, as a page and AI read it. */
export interface PlanSlotDto {
  id: string;
  /** The creative this slot is one place of: slots of one creative share it, and the Week draws them as one row. */
  creative: string;
  place: PlanPlace;
  kind: PostKind;
  at: string;
  state: SlotState;
  title: string;
  /** The reason it serves, in a sentence ("Thursday has 3 hours open"); null for one that serves only a goal. */
  reason: string | null;
  file_id: string | null;
  piece_id: string | null;
  post_id: string | null;
  intent: PieceIntent | null;
  /** AI's words for its creative; null for a slot asking for footage, or one drafted when they could not be written. */
  words: SlotWords | null;
  blocked_why: SlotHeldWhy | null;
  blocked_reason: string | null;
  ask: FootageAsk | null;
  score: SlotScore | null;
  /** The made file a held week's slot was drawn into ahead of its approval (00714), reused by whoever places it; else null. */
  prepared_file_id: string | null;
}

/** A week's plan, as a page and AI read it. */
export interface WeekPlanDto {
  plan: {
    id: string;
    week_of: string;
    status: PlanStatus;
    /** Why it is smaller than the cadence asks, where it is ("Only 2 this week: the clips from Tuesday are too dark"). */
    fewer: string | null;
    ready_at: string | null;
    approved_at: string | null;
    approved_by: string | null;
    /**
     * When a week AI may approve goes (00714, the content loop PRD's 12.4): 8:00 in the business's zone for a week held,
     * while it is ready and the rung still holds it; null when nothing goes without the owner's press.
     */
    goes_at: string | null;
  } | null;
  slots: PlanSlotDto[];
}

/** The weekly plan's most asks to film (PRD 10.2, step 5). */
export const FOOTAGE_ASKS_MOST = 3;

/**
 * Which week a plan made now is for: from Sunday the week that starts the next day, else the week we are in (a plan the
 * owner asks for on a Wednesday covers what is left of this week). Weeks run Monday to Sunday in the business's zone.
 */
export function planWeekOf(zone: string, nowMs: number): string {
  const today = dayInZone(zone, nowMs);
  return today.weekday === "sun" ? shiftKey(today.key, 1) : mondayOf(today.key);
}

/** A weekday's short name for a day key: "Thu". */
export const weekdayShortOf = (key: string): string => {
  const { y, m, d } = keyParts(key);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
};

/** A cadence's ranges, read with the default under every part the owner left unset. */
export function cadenceOf(cadence: ContentCadence | undefined): {
  instagram: { reel: readonly [number, number]; picture: readonly [number, number]; story: readonly [number, number] };
  google: { picture: readonly [number, number] };
} {
  return {
    instagram: {
      reel: cadence?.instagram?.reel ?? CADENCE_DEFAULT.instagram.reel,
      picture: cadence?.instagram?.picture ?? CADENCE_DEFAULT.instagram.picture,
      story: cadence?.instagram?.story ?? CADENCE_DEFAULT.instagram.story,
    },
    google: { picture: cadence?.google?.picture ?? CADENCE_DEFAULT.google.picture },
  };
}

/** A week's creatives counted by what they are, each once, whatever places it goes to (PRD 21.2, call 12). */
export function creativesOf(slots: readonly Pick<PlanSlotDto, "creative" | "kind" | "state">[]): {
  reels: number;
  posts: number;
  stories: number;
} {
  const seen = new Map<string, PostKind>();
  for (const slot of slots) {
    if (slot.state === "needs_footage" || slot.state === "removed") continue;
    // A creative is the kind its first place shows: a reel stays a reel where Google shows a picture of it.
    if (!seen.has(slot.creative)) seen.set(slot.creative, slot.kind);
  }
  const kinds = [...seen.values()];
  return {
    reels: kinds.filter((k) => k === "reel").length,
    posts: kinds.filter((k) => k === "picture").length,
    stories: kinds.filter((k) => k === "story").length,
  };
}

const countedAs = (count: number, one: string, many: string): string => (count === 1 ? `a ${one}` : `${count} ${many}`);

/**
 * A week said as what it is (PRD 21.2, call 12): "A reel and 2 posts", never "4 pieces, 6 places". Empty for a week with
 * nothing to post.
 */
export function weekSizeSaid(counts: { reels: number; posts: number; stories: number }): string {
  const parts = [
    counts.reels > 0 ? countedAs(counts.reels, "reel", "reels") : null,
    counts.posts > 0 ? countedAs(counts.posts, "post", "posts") : null,
    counts.stories > 0 ? countedAs(counts.stories, "story", "stories") : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return "";
  const phrase = parts.length === 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
