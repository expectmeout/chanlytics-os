/**
 * A read that follows what Reports shows, made once for every one of them: Today's headline (headline.ts), which follows
 * the period by name kept in this browser, and the Reviews lens's (reviews-surface.ts), which follows the range on
 * screen, the days a member picked among them; and Campaigns' own 30 days (campaigns/home/results-surface.ts), which
 * follows one fixed period whatever Reports shows. Part of the SurfaceData seam
 * (legacy-bridge/surface-data.ts); a page reads what one publishes through `useSurface(key)`, or through
 * `useFollower(key)` where it must also say how that stands against what is shown.
 *
 * Each says what it follows (`shown`) and which range a value of its is of (`of`), both by the range's one name
 * (contracts reportRangeKey): Today's line never follows days a member picked on Reports, since a line that said "Sep 1
 * to 20" the next morning would be a stale one, while the Reviews lens is drawn on the very page the days are picked on.
 *
 * The surface is read for the range it follows, and held by that name (the last four, each workspace's apart) with when
 * each was read: a pick of one this tab has read paints at once (`paintHeld`, called by `setReportRange`), and is read
 * again behind it only if it has aged (`isStale`, `readAged`). A read that lands for a range already left is held and
 * never painted over the one now shown. A pick that failed leaves Reports on the range it had (`paintKept`): the read
 * held for that range is painted, and where this tab holds none, whatever is published is of another range and is
 * taken away, so nothing says a range the page does not. A write that makes what is held wrong (`forget`) drops it, and
 * the next draw of its page reads it.
 *
 * What a surface says of itself is its `state` (surface-values.ts `FollowState`), from the range shown, the range its
 * value is of and the outcome of its last read: "current", "coming" while a pick's read is out, "failed" when it could
 * not be made. Its page draws the value and the state; none of this is the page's to work out.
 */
import { reportRangeKey, type ReportRange } from "@chanlytics/contracts";
import { heldViews } from "@/legacy-bridge/held-views";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import type { ReadsDeclaration } from "@/legacy-bridge/surface-realtime";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { isSurfaceDegraded, isSurfaceFailed, surfaceMoved } from "@/legacy-bridge/surface-status";
import { declareFollower, setSurfaceValue, surfaceValue, type SurfaceKey, type SurfaceValues } from "../surface-values";

/**
 * What a surface follows, the read for it, and what it draws and how fresh it must stay (`live`, declareReads): the kinds of
 * record, where it hears them, how long after the last change it reads (Campaigns' 30 days wait out a burst, as Reports does) and
 * the longest it waits from the first (a dear read, Today's headline, asks for more than the runner's three seconds).
 */
interface PeriodSurfaceOptions<K extends SurfaceKey, R extends ReportRange> {
  key: K;
  /** The range the surface follows now: the period kept in this browser, whatever Reports shows, or a fixed period. */
  shown: () => R;
  /** The range a value is of, by its one name (reportRangeKey). */
  of: (value: NonNullable<SurfaceValues[K]>) => string;
  /** The whole value the surface publishes for `range`, made by its one read. */
  read: (range: R) => Promise<NonNullable<SurfaceValues[K]>>;
  live: ReadsDeclaration &
    Pick<SurfaceOverride, "debounceMs" | "maxWaitMs" | "refreshOnMessageStatuses" | "receiptsQuietMs">;
  /** Whether it counts "the day so far", so the business's midnight reads it again (SurfaceOverride.readAtMidnight). */
  readAtMidnight?: boolean;
}

export function periodSurface<K extends SurfaceKey, R extends ReportRange>({
  key,
  shown,
  of,
  read,
  live,
  readAtMidnight,
}: PeriodSurfaceOptions<K, R>) {
  /** The ranges this tab has read: going back to one paints at once, and a read behind it keeps it current. */
  const held = heldViews<{ value: NonNullable<SurfaceValues[K]>; readAt: number }>(4);
  /** Moved on by every forget: a read that went out before it answers its own pass, and is not held past it. */
  let generation = 0;
  /** Whoever draws the surface is told it moved: what is published changed, or the range it follows did. */
  const announce = () => surfaceMoved(key);
  /** The name of the range followed now. */
  const shownKey = (): string => reportRangeKey(shown());
  /** Whether what is published is of the range followed now. */
  const isCurrent = (): boolean => {
    const value = surfaceValue(key);
    return value !== undefined && value !== null && of(value) === shownKey();
  };

  /** Paint the read this tab holds for the range now followed, and tell whoever follows it that the range moved; whether one was held. */
  function paintHeld(): boolean {
    const have = held.get(shownKey());
    if (have) setSurfaceValue(key, have.value);
    announce();
    return have !== undefined;
  }

  /** After a pick that failed: the range kept is the one painted, or, where none is held for it, nothing of a range the page left. */
  function paintKept(): void {
    if (paintHeld()) return;
    if (isCurrent()) return;
    setSurfaceValue(key, undefined);
    announce();
  }

  /** Whether the read for the range now followed is held at all, and was made within the measure every on-demand read is held to. */
  const isStale = (): boolean => readAged(held.get(shownKey())?.readAt);

  /** A write made what is held wrong: nothing is held, nothing is published, and the page that draws it reads it as it comes on screen. */
  function forget(): void {
    generation += 1;
    held.forget();
    setSurfaceValue(key, undefined);
    announce();
  }

  /**
   * A write made every range held wrong, and the page that draws what is published is on screen and is about to read it: nothing
   * is held, so no pick paints a count from before the write, but what is published stays until the read replaces it. A band that
   * went blank for the length of a read (Worth a look, which is not drawn without its numbers) would jump on every reply.
   */
  function outdate(): void {
    generation += 1;
    held.forget();
  }

  declareFollower(key, () => {
    if (isCurrent()) return "current";
    return (surfaceValue(key) === undefined ? isSurfaceFailed(key) : isSurfaceDegraded(key)) ? "failed" : "coming";
  });

  const override: SurfaceOverride = {
    key,
    value: key,
    // Read where its page is drawn, as it comes on screen, and again then when it has aged (a pick keeps it fresh behind the control:
    // period.ts).
    onDemand: true,
    isStale,
    events: [`surface:${key}`],
    ...(readAtMidnight ? { readAtMidnight } : {}),
    // What it draws and how fresh it must stay: the tables it hears and the rule over them are derived (declareReads).
    ...declareReads(key, live),
    ...(live.debounceMs === undefined ? {} : { debounceMs: live.debounceMs }),
    ...(live.maxWaitMs === undefined ? {} : { maxWaitMs: live.maxWaitMs }),
    // The receipts its funnel counts (Delivered, Read), heard once they quieten, where the surface names them (S3-5).
    ...(live.refreshOnMessageStatuses ? { refreshOnMessageStatuses: live.refreshOnMessageStatuses } : {}),
    ...(live.receiptsQuietMs === undefined ? {} : { receiptsQuietMs: live.receiptsQuietMs }),
    // A range's reads take their turn; a pick of another range is read at once (activateOverride).
    view: shownKey,
    apply: async () => {
      const range = shown();
      const name = reportRangeKey(range);
      const asked = generation;
      const value = await read(range);
      // Held for the range it is of, even if the page has moved on: the read was made, and a pick back to it paints it.
      if (asked === generation) held.hold(name, { value, readAt: Date.now() });
      // A pick of another range while this read was out: its answer is for a range left, and is never painted over the new one.
      if (name !== shownKey()) return;
      setSurfaceValue(key, value);
    },
  };

  return { override, paintHeld, paintKept, isStale, forget, outdate };
}
