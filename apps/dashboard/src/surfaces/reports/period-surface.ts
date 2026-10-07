/**
 * A read that follows the period Reports shows (`shownReportPeriod`, kept in this browser), made once for every one of them:
 * Today's headline (headline.ts) and the Reviews lens's (reviews-surface.ts), and Campaigns' when it comes. Part of the SurfaceData
 * seam (legacy-bridge/surface-data.ts); a page reads what one publishes through `useSurface(key)`, or through `useFollower(key)`
 * where it must also say how that stands against the period shown.
 *
 * The surface is read for the period shown, and held by period (the last four, each workspace's apart) with when each was read: a
 * pick of one this tab has read paints at once (`paintHeld`, called by `setReportRange`), and is read again behind it only if it
 * has aged (`isStale`, `readAged`). A read that lands for a period already left is held and never painted over the one now shown. A
 * pick that failed leaves Reports on the period it had (`paintKept`): the read held for that period is painted, and where this tab
 * holds none, whatever is published is of another period and is taken away, so nothing says a period the page does not. A write
 * that makes what is held wrong (`forget`) drops it, and the next draw of its page reads it.
 *
 * What a surface says of itself is its `state` (surface-values.ts `FollowState`), from the period shown, the period its value is of
 * and the outcome of its last read: "current", "coming" while a pick's read is out, "failed" when it could not be made. Its page
 * draws the value and the state; none of this is the page's to work out.
 */
import type { ReportPeriodId } from "@chanlytics/contracts";
import { heldViews } from "@/legacy-bridge/held-views";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { isSurfaceDegraded, isSurfaceFailed, surfaceMoved } from "@/legacy-bridge/surface-status";
import { declareFollower, setSurfaceValue, surfaceValue, type SurfaceKey, type SurfaceValues } from "../surface-values";
import { shownReportPeriod } from "./surface";

/** The surfaces whose value says the period it is of. */
type FollowerKey = { [K in SurfaceKey]: SurfaceValues[K] extends { period: ReportPeriodId } ? K : never }[SurfaceKey];

/** The read for a period, and the live-feed rule of the surface where it hears the feed at all. */
interface PeriodSurfaceOptions<K extends FollowerKey> {
  key: K;
  /** The whole value the surface publishes for `period`, made by its one read. */
  read: (period: ReportPeriodId) => Promise<SurfaceValues[K]>;
  live?: Pick<SurfaceOverride, "refreshOnTables" | "refreshWhen">;
}

export function periodSurface<K extends FollowerKey>({ key, read, live }: PeriodSurfaceOptions<K>) {
  /** The periods this tab has read: going back to one paints at once, and a read behind it keeps it current. */
  const held = heldViews<{ value: SurfaceValues[K]; readAt: number }>(4);
  /** Moved on by every forget: a read that went out before it answers its own pass, and is not held past it. */
  let generation = 0;
  /** Whoever draws the surface is told it moved: what is published changed, or the period it follows did. */
  const announce = () => surfaceMoved(key);

  /** Paint the read this tab holds for the period now shown, and tell whoever follows it that the period moved; whether one was held. */
  function paintHeld(): boolean {
    const have = held.get(shownReportPeriod());
    if (have) setSurfaceValue(key, have.value);
    announce();
    return have !== undefined;
  }

  /** After a pick that failed: the period kept is the one painted, or, where none is held for it, nothing of a period the page left. */
  function paintKept(): void {
    if (paintHeld()) return;
    if (surfaceValue(key)?.period === shownReportPeriod()) return;
    setSurfaceValue(key, undefined);
    announce();
  }

  /** Whether the read for the period now shown is held at all, and was made within the measure every on-demand read is held to. */
  const isStale = (): boolean => readAged(held.get(shownReportPeriod())?.readAt);

  /** A write made what is held wrong: nothing is held, nothing is published, and the page that draws it reads it as it comes on screen. */
  function forget(): void {
    generation += 1;
    held.forget();
    setSurfaceValue(key, undefined);
    announce();
  }

  declareFollower(key, () => {
    const value = surfaceValue(key);
    if (value?.period === shownReportPeriod()) return "current";
    return (value === undefined ? isSurfaceFailed(key) : isSurfaceDegraded(key)) ? "failed" : "coming";
  });

  const override: SurfaceOverride = {
    key,
    value: key,
    // Read where its page is drawn, as it comes on screen, and again then when it has aged (a pick keeps it fresh behind the control:
    // period.ts).
    onDemand: true,
    isStale,
    events: [`surface:${key}`],
    ...live,
    // A period's reads take their turn; a pick of another period is read at once (activateOverride).
    view: shownReportPeriod,
    apply: async () => {
      const period = shownReportPeriod();
      const asked = generation;
      const value = await read(period);
      // Held for the period it is of, even if the page has moved on: the read was made, and a pick back to it paints it.
      if (asked === generation) held.hold(period, { value, readAt: Date.now() });
      // A pick of another period while this read was out: its answer is for a period left, and is never painted over the new one.
      if (period !== shownReportPeriod()) return;
      setSurfaceValue(key, value);
    },
  };

  return { override, paintHeld, paintKept, isStale, forget };
}
