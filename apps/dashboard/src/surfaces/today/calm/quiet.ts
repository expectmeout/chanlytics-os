/**
 * How sure Today is that it shows all there is (Working for you, W18, 21 Nov 2026): nothing missing is ever said as nothing
 * to do. Who needs you is counted from Today's read (needs-you.ts), and the page's end stands on the runs' and setting up's
 * reads as well, so the page may end with "That's everything" only once all three are read in this visit, whole, on a
 * device that is online, with every line up. Four kinds of quiet, and the three that are not sure each say one plain sentence:
 *
 *   sure      every read in and current: a healthy day shows nothing extra
 *   settling  drawn from this device's copy of an earlier visit while its read is out: said as it stands, with no end yet
 *   checking  nothing read yet: the head says it is checking who needs you, and the page has no end until it knows
 *   behind    read once, and the latest read failed or came back in part, or the device is offline: "As of 10:42 AM,
 *             catching up", and the page asks again by itself
 *   unread    a read failed with nothing landed, or a line is down: so there may be more, and the page never says it is done
 *
 * Today's end said "That's everything" under a count it had not read (it read an unread count as none, and setting up
 * unread as answering): the fix was owed whatever else was chosen.
 */
import { useSyncExternalStore } from "react";
import { MIN_MS } from "@chanlytics/contracts";
import {
  getConnection,
  getSurfaceStatuses,
  isSurfaceDegraded,
  isSurfaceFailed,
  onSurfaceMoved,
  onSurfaceStatusChange,
  readAtOf,
} from "@/bridge/surface-status";
import { refreshSurface } from "../../frame-verbs";
import { surfaceValue, type SurfaceKey } from "../../surface-values";
import { useWaitFor } from "../../use-surface";

/** How sure the page is, by the kinds above; `at` is when the oldest of what it shows was read, where it knows. */
export type TodayQuiet =
  | { kind: "sure" }
  | { kind: "settling" }
  | { kind: "checking" }
  | { kind: "behind"; at: number | null }
  | { kind: "unread"; line: boolean };

/** How one read stands: read in this visit, only kept from an earlier one, read and since failed, not yet, or never. */
export type ReadStanding = "live" | "kept" | "behind" | "checking" | "failed";

/**
 * The reads each part's quiet stands on: the head's count is made from Today's own read (which counts the runs waiting
 * itself, its `runs_waiting`), and the page's end reads the runs' rows and setting up's as well.
 */
const READS_OF = {
  count: ["today"],
  end: ["today", "broadcasts", "setup"],
} as const satisfies Record<string, readonly SurfaceKey[]>;

/** Which part asks: the head, over the count, or the page's end. */
export type QuietOf = keyof typeof READS_OF;

/** The worst standing first: a failure says more than a wait, a wait more than an old copy, an old copy more than none. */
const WORST_FIRST: readonly ReadStanding[] = ["failed", "checking", "behind", "kept", "live"];

/** How a surface's read stands now (bridge/surface-status.ts). */
function standingOf(key: SurfaceKey): ReadStanding {
  if (surfaceValue(key) === undefined) return isSurfaceFailed(key) ? "failed" : "checking";
  if (isSurfaceDegraded(key)) return "behind";
  return getConnection().offline ? "behind" : getSurfaceStatuses().has(key) ? "live" : "kept";
}

/**
 * The page's quiet, from how each of its reads stands, whether a line is down (Today's own standing) and when the oldest of
 * what it shows was read. Pure: the page's hook reads the world and hands it here.
 */
export function quietOf(reads: readonly ReadStanding[], at: { lineDown: boolean; readAt: number | null }): TodayQuiet {
  const worst = WORST_FIRST.find((standing) => reads.includes(standing)) ?? "live";
  if (worst === "failed") return { kind: "unread", line: false };
  if (at.lineDown) return { kind: "unread", line: true };
  if (worst === "checking") return { kind: "checking" };
  if (worst === "behind") return { kind: "behind", at: at.readAt };
  return { kind: worst === "kept" ? "settling" : "sure" };
}

/** Each part's quiet last answered, by what it says, so a hook over it draws again only when that changes. */
const shown = new Map<QuietOf, { said: string; quiet: TodayQuiet }>();

function quietNow(part: QuietOf): TodayQuiet {
  const reads = READS_OF[part];
  const read = reads.map(readAtOf).filter((at): at is number => at !== null);
  const quiet = quietOf(reads.map(standingOf), {
    lineDown: surfaceValue("today")?.standing.lines.down ?? false,
    readAt: read.length ? Math.min(...read) : null,
  });
  const said = `${quiet.kind}|${quiet.kind === "behind" ? quiet.at : ""}|${quiet.kind === "unread" ? quiet.line : ""}`;
  const was = shown.get(part);
  if (was?.said === said) return was.quiet;
  shown.set(part, { said, quiet });
  return quiet;
}

const countNow = () => quietNow("count");
const endNow = () => quietNow("end");

/** Told when one of the page's reads moves, or its status or the device's connection does. */
function hearQuiet(fn: () => void): () => void {
  const reads = onSurfaceMoved(READS_OF.end, fn);
  const statuses = onSurfaceStatusChange(fn);
  return () => {
    reads();
    statuses();
  };
}

/** A part's quiet, drawn again as it changes: the head's over the count, the end's over everything it stands on. */
export function useTodayQuiet(part: QuietOf): TodayQuiet {
  const now = part === "count" ? countNow : endNow;
  return useSyncExternalStore(hearQuiet, now, now);
}

/** Whether the page should ask again by itself: a read that failed, or one that is behind (never a line down: that is the line's). */
const asksAgain = (quiet: TodayQuiet): boolean => (quiet.kind === "unread" && !quiet.line) || quiet.kind === "behind";

/**
 * While a read failed or is behind, the page asks again by itself (the runner's own two tries come first), slower each time
 * up to a minute, and never while it is hidden: what the head says of it ("catching up", "Today tries again") stays true.
 */
export function useCatchUp(quiet: TodayQuiet): void {
  useWaitFor(asksAgain(quiet), {
    everyMs: MIN_MS / 2,
    ceilingMs: MIN_MS,
    maxMs: Number.POSITIVE_INFINITY,
    read: () => {
      for (const key of READS_OF.end) if (standingOf(key) !== "live") void refreshSurface(key);
    },
    until: () => !asksAgain(endNow()),
  });
}
