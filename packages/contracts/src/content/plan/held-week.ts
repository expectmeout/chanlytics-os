/**
 * A week AI may approve (00714; the content loop PRD's 12.4, canvas v18 board B5): when it goes, and what AI suggests as
 * a rung and why.
 *
 * The owner sets Approve the week on the Autonomy pane. Holding it, a ready week goes up at 8:00 AM in the business's zone
 * unless the owner stops it first (the hold window is the safe form: no Undo is promised once a post is up); sending it,
 * it goes as soon as it is ready; asking, it waits for the owner's press, as before. Only the owner moves a rung: AI
 * suggests one only with its record behind it, and Use it is the owner's own press. The edge's call to make the week is
 * week-made-door.ts (zod, the server's alone).
 */
import { DAY_MS, MIN_MS } from "../../shared/time";
import { wallClockAt, zoneDayKey } from "../../shared/clock";
import { POLICY_MODE_WORDS, type PolicyMode } from "../../config/workspace-config/policy-classes";

/** The hour a held week goes up, in the business's own zone: the board's "8:00 AM". */
const WEEK_GOES_HOUR = 8;

/**
 * When a ready week goes under the rung, as an ISO time: holding it, the next 8:00 AM in the business's zone; sending it,
 * now; asking (or no rung read), never.
 */
export function weekGoesAtOf(mode: string | null | undefined, zone: string, nowMs: number): string | null {
  if (mode === "auto") return new Date(nowMs).toISOString();
  if (mode !== "veto") return null;
  const today = zoneDayKey(nowMs, zone);
  const at = wallClockAt(zone, today, WEEK_GOES_HOUR, 0);
  return new Date(
    at > nowMs ? at : wallClockAt(zone, zoneDayKey(nowMs + DAY_MS, zone), WEEK_GOES_HOUR, 0),
  ).toISOString();
}

/** How many weeks in a row the owner approved as AI planned them before AI suggests holding the week. */
const RUNG_SUGGESTED_AFTER = 4;

/** A week the owner approved, as AI's suggestion reads it: whether a member's press approved it, and whether it was edited. */
export interface WeekApprovedRecord {
  /** Approved by a member's press (not by AI under a rung). */
  by_owner: boolean;
  /** Whether the owner left out, moved or swapped a slot of it; null for a week from before this was kept. */
  edited: boolean | null;
}

/** AI's suggested rung for Approve the week, with its record as its words. */
export interface RungSuggestion {
  mode: PolicyMode;
  count: number;
  words: string;
}

/**
 * What AI suggests for Approve the week, or nothing: only while the row asks, and only with a record behind it, the
 * newest weeks approved by the owner's own press with nothing changed, at least RUNG_SUGGESTED_AFTER in a row. A week whose
 * edits are not known ends the run, as an edited one does: the suggestion claims nothing it has no record of.
 */
export function rungSuggestionOf(
  mode: string | null | undefined,
  newestFirst: readonly WeekApprovedRecord[],
): RungSuggestion | null {
  if (mode !== "ask") return null;
  const run = newestFirst.findIndex((w) => !w.by_owner || w.edited !== false);
  const count = run < 0 ? newestFirst.length : run;
  if (count < RUNG_SUGGESTED_AFTER) return null;
  return {
    mode: "veto",
    count,
    words: `AI suggests ${POLICY_MODE_WORDS.veto.head}: ${count} weeks approved with no edits`,
  };
}

/** The press that takes AI's suggestion: the owner's own, on the row. */
export const RUNG_SUGGESTION_USE = "Use it";

/**
 * The making queue's setting (00714), sized from what the database's front can take, never from a count of today's
 * workspaces: the front slows past about 60 calls a second (the load review), and the queue may take a third of it.
 */
export const MAKING_CALLS_A_SECOND = 20;

/**
 * The calls one week's pass makes at the database's front, counted along the code path: a picture drawn and stored (its
 * material read, its file begun and kept, its shapes uploaded) and each of its places readied (the checks' reads, its
 * shapes read back and summed, its words kept): about thirty a creative, three creatives a week.
 */
export const CALLS_A_WEEK_MADE = 90;

/** How long one week's pass takes on the dashboard: the drawing of its pictures, one after another. */
export const SECONDS_A_WEEK_MADE = 30;

/**
 * How many weeks are made at once, platform-wide (content_weeks_start's cap): the calls a second the queue may take,
 * over the calls a week makes, times how long a week takes. 20 calls a second, 90 a week, 30 seconds: 6 at once, 720
 * weeks an hour. Held weeks are prepared through the night at that pace (twelve hours from Sunday 20:00: 8,640 weeks),
 * the earliest first post first, so 8:00 itself is one call a week (the queue's db test: 10,000 weeks in one zone, none
 * late). Raise MAKING_CALLS_A_SECOND when the front is measured to take more.
 */
export const WEEKS_MAKING_AT_ONCE = Math.max(
  1,
  Math.floor((MAKING_CALLS_A_SECOND * SECONDS_A_WEEK_MADE) / CALLS_A_WEEK_MADE),
);

/** How long a week's making holds its place in the queue before it is begun again: the dashboard's making runs 300 s at most. */
export const WEEK_MAKING_LEASE_S = 600;

/** How long before its time a slot AI makes must still be: one nearer is held with why, never posted late. */
export const WEEK_MADE_AHEAD_MS = 5 * MIN_MS;

/** The making queue as its doors take it: the cap and the lease, said once for the edge and the dashboard. */
export const WEEK_MAKING_QUEUE = { cap: WEEKS_MAKING_AT_ONCE, leaseSeconds: WEEK_MAKING_LEASE_S } as const;
