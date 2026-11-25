/**
 * A load on a device that holds a page's rows reads only what changed (25 Nov 2026).
 *
 * Every load read every page's rows again once the page on screen was drawn, so the next press opens at once: on the
 * nightly's own stack that read-ahead was 240 of the 264 database calls behind a load of People, and 82 of Today's 192.
 * Yet the device already holds those rows (surface-cache.ts: a copy of each surface, a day at most, drawn before
 * anything is read), and the database already keeps what its topic told (GET changes, 00508), which a tab asks for
 * as it joins the live feed.
 *
 * So a load is treated as a tab that never closed. A tab left open trusts what it read for as long as the feed tells
 * of no change to it, and reads it again where it is drawn once it is a quarter of an hour old (hearing/clock.ts). A
 * load does the same with what the device kept: for the surfaces of the pages not on screen, it asks once what the
 * topic told since the oldest of their copies, and reads only the ones told of. The rest stand as the copy has them,
 * dated when the copy was read, so the clock still reads one again as its page comes on screen once it is old.
 *
 * Only where that is as true as it is of an open tab:
 *  - a surface the feed tells of (`live`, `its-page`): one it tells nothing is read at the boot, as before;
 *  - a copy of the business's own today: what counts the day so far is read again at the day's turn;
 *  - a copy still inside what the surface itself says it is good for (`readEveryMs`, `validUntil`);
 *  - an answer that says every notice (`whole`): where the feed's record cannot say them all, everything is read.
 * The page on screen is read as it always was: this is the read-ahead alone.
 */
import type { SurfaceOverride } from "../surface-data";
import { subscribesToRealtime, wantsRefresh, type RealtimeChange } from "../surface-realtime";
import type { CatchUp, CaughtUpNotice } from "./catch-up";

/** What the boot hands over to decide what it need not read. */
export interface KeptAsk {
  /** What the topic told since a moment (hearing/live-feed.ts catchUpLiveFeed); absent (a test's runner), all is read. */
  catchUp: CatchUp | undefined;
  /** When the copy the device kept of a surface was read (this browser's clock), or null where it drew none. */
  keptAt(o: SurfaceOverride): number | null;
  /** The business's day at a moment, by the workspace's zone; null where the zone is not known yet. */
  dayAt(ms: number): string | null;
  /** A moment of this browser's clock as the servers' clock reads it, on the early side (bridge/api.ts serversClockOf). */
  serversClockOf(browserMs: number): number;
  /** The workspace the notices are of, as a live notice's row names it: asked once the feed's record has answered. */
  tenant(): string;
  now: number;
}

/** A surface whose copy the boot may stand on, with when that copy was read. */
export interface KeptCopy {
  surface: SurfaceOverride;
  at: number;
}

/** When the copy of a surface was read, where the boot may stand on it at all; null where it is read as before. */
function standsOn(o: SurfaceOverride, ask: KeptAsk): number | null {
  if (!subscribesToRealtime(o) || (o.fresh !== "live" && o.fresh !== "its-page")) return null;
  const at = ask.keptAt(o);
  if (at === null || at > ask.now) return null;
  const today = ask.dayAt(ask.now);
  if (today === null || ask.dayAt(at) !== today) return null;
  if (typeof o.readEveryMs === "number" && ask.now - at >= o.readEveryMs) return null;
  const until = o.validUntil?.() ?? null;
  if (until !== null && ask.now >= until) return null;
  return at;
}

/**
 * Whether the boot holds any copy it may stand on. Where it holds none (a first load, a runner given no record to ask),
 * it asks nothing and waits for nothing: such a load runs as it always did, to the turn.
 */
export function anyKept(strangers: readonly SurfaceOverride[], ask: KeptAsk): boolean {
  return !!ask.catchUp && strangers.some((surface) => standsOn(surface, ask) !== null);
}

/** A notice read back, as the surfaces' own rule reads a live one (hearing/catch-up.ts): one change a status it left. */
function changesOf(notice: CaughtUpNotice, tenant: string): RealtimeChange[] {
  return (notice.statuses?.length ? notice.statuses : [undefined]).map((status) => ({
    table: notice.table,
    event: notice.event,
    row: { tenant_id: tenant, ...(status ? { status } : {}) },
    ...(notice.at ? { at: notice.at } : {}),
    ...(notice.threads ? { threads: notice.threads } : {}),
  }));
}

/** Whether a notice tells of a change the copy does not hold: one the surface hears, told after the copy was read. */
function toldSince(copy: KeptCopy, notice: CaughtUpNotice, ask: KeptAsk): boolean {
  const at = notice.at ? Date.parse(notice.at) : Number.NaN;
  // A notice with no clock is not judged: the surface is read, the side of reading again.
  if (Number.isFinite(at) && at < ask.serversClockOf(copy.at)) return false;
  return changesOf(notice, ask.tenant()).some((change) => wantsRefresh(copy.surface, change.table, change));
}

/**
 * Of the surfaces of the pages not on screen, the ones the boot need not read: the device holds a copy of each, and the
 * topic told of nothing it draws since that copy was read. Empty where the feed's record could not be asked or could not
 * say every notice: then the boot reads them all, as it always did.
 */
export async function keptUnchanged(strangers: readonly SurfaceOverride[], ask: KeptAsk): Promise<KeptCopy[]> {
  if (!ask.catchUp) return [];
  const copies = strangers.flatMap((surface): KeptCopy[] => {
    const at = standsOn(surface, ask);
    return at === null ? [] : [{ surface, at }];
  });
  if (!copies.length) return [];
  let notices: readonly CaughtUpNotice[] | null;
  try {
    notices = await ask.catchUp(Math.min(...copies.map((copy) => copy.at)));
  } catch {
    notices = null;
  }
  if (!notices) return [];
  const told = notices;
  return copies.filter((copy) => !told.some((notice) => toldSince(copy, notice, ask)));
}
