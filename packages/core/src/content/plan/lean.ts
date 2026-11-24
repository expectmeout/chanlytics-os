/**
 * What a week leans on of the business's own patterns (the content loop PRD's 9.4 and 10.2, step 1): a pattern moves the
 * plan's weights; the one strongest early sign is tried, and said as a try; too little moves nothing and claims nothing.
 * A difference that moved with a second thing is leaned on by neither. Every lean says why, in the slot's own score, so
 * AI answers "why this?" from it (PRD 12.3).
 *
 *  - What the footage is (a clip's length, what it shows) moves a candidate's expected value.
 *  - When it goes up (the hour, a weekday or the weekend) moves a slot's time, and says so as its audience fit.
 *
 * Pure.
 */
import type { ContentPattern, PlanPlace, PostKind } from "@chanlytics/contracts";
import { lengthBandOf } from "./patterns";

/** What the week leans on: the patterns it may move by, and the one early sign it tries. */
export interface WeekLean {
  sure: readonly ContentPattern[];
  tried: ContentPattern | null;
}

/** A part of a candidate's or slot's score: a value from 0 to 1, and why. */
interface Leaned {
  value: number;
  why: string;
}

/** What a candidate's expected value is where nothing is sure: the middle, said as the plan said it before patterns. */
const UNKNOWN_VALUE: Leaned = { value: 0.5, why: "Not known yet: too few posts to compare" };

/** The hour a slot goes up at for each hour a pattern names, in the business's zone. */
const HOUR_OF_BAND: Readonly<Record<string, number>> = { morning: 9, midday: 12, evening: 18, late: 21 };

/** The patterns a week leans on, and its one try: the strongest early sign that moved with nothing else. */
export function weekLeanOf(patterns: readonly ContentPattern[]): WeekLean {
  const free = patterns.filter((p) => p.movedWith === null);
  return {
    sure: free.filter((p) => p.level === "pattern"),
    tried: [...free.filter((p) => p.level === "early")].sort((a, b) => b.lift - a.lift)[0] ?? null,
  };
}

/** Whether footage is in a pattern's cohort, out of it, or not told apart by it (a picture has no length). */
function footageSide(pattern: ContentPattern, footage: { seconds: number | null; shows: readonly string[] }) {
  if (pattern.dimension === "length") {
    const band = lengthBandOf(footage.seconds);
    if (band === null) return "untold";
    return band === pattern.better ? "in" : "out";
  }
  if (pattern.dimension !== "shows") return "untold";
  return footage.shows.some((s) => s.trim().toLowerCase() === pattern.better) ? "in" : "out";
}

/** How much a pattern's lift adds to a candidate in its cohort: up to 0.4 over the middle. */
const liftedValue = (lift: number): number => Math.min(0.9, 0.5 + (lift - 1) / 2);

/**
 * A candidate's expected value from what its footage is: higher in a pattern's cohort, lower out of it, a little higher
 * where the week's try is about it; the middle, and "not known yet", where nothing is sure. Words alone are told apart by
 * nothing.
 */
export function expectedValueOf(
  lean: WeekLean,
  kind: PostKind,
  footage: { seconds: number | null; shows: readonly string[] } | null,
): Leaned {
  if (!footage) return UNKNOWN_VALUE;
  for (const pattern of lean.sure) {
    if (pattern.kind !== kind) continue;
    const side = footageSide(pattern, footage);
    if (side === "in") return { value: liftedValue(pattern.lift), why: pattern.says };
    if (side === "out") return { value: 0.35, why: `${pattern.says}; this one is not` };
  }
  const tried = lean.tried;
  if (tried?.kind === kind && footageSide(tried, footage) === "in")
    return { value: 0.6, why: `An early sign, tried this week: ${tried.says}` };
  return UNKNOWN_VALUE;
}

/**
 * When a slot of this place and kind goes up, and its audience fit: the hour a pattern names, for every slot; the hour
 * the week's try names, for its first slot alone (`nth` 0); else the plan's own hour, and the fit as the candidate said it.
 */
export function slotHourOf(
  lean: WeekLean,
  slot: { place: PlanPlace; kind: PostKind; nth: number },
  fallback: number,
): { hour: number; fit: Leaned | null } {
  const ofSlot = (p: ContentPattern | null) =>
    p?.dimension === "hour" && p.place === slot.place && p.kind === slot.kind ? p : null;
  const sure = lean.sure.map(ofSlot).find((p) => p !== null) ?? null;
  if (sure) return { hour: HOUR_OF_BAND[sure.better] ?? fallback, fit: { value: 0.8, why: sure.says } };
  const tried = ofSlot(lean.tried);
  if (tried && slot.nth === 0)
    return {
      hour: HOUR_OF_BAND[tried.better] ?? fallback,
      fit: { value: 0.6, why: `An early sign, tried on this one: ${tried.says}` },
    };
  return { hour: fallback, fit: null };
}

/**
 * Whether a candidate of this kind, tied to no day, goes up on a weekday or at the weekend: the side a pattern names for
 * all of them, the side the week's try names for its first (`nth` 0); null where nothing leans either way.
 */
export function dayLeanOf(lean: WeekLean, kind: PostKind, nth: number): "weekday" | "weekend" | null {
  const ofKind = (p: ContentPattern | null) => (p?.dimension === "day" && p.kind === kind ? p : null);
  const side = (lean.sure.map(ofKind).find((p) => p !== null) ?? (nth === 0 ? ofKind(lean.tried) : null))?.better;
  return side === "weekday" || side === "weekend" ? side : null;
}
