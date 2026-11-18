/**
 * How often a watched folder is read, in one named setting (the footage sources plan, D18), and the rules that read
 * it. Every number of the pace is here and nowhere else: the database holds none (00641), and each is written onto a
 * folder's row (when it is next read, at what gap, when it is next walked) by the code below.
 *
 * These are the plan's starting values. The exact ones are set from what a day of real accounts measures (signals from
 * an account busy with documents, units a folder a day), and changing one is a change to this object alone.
 *
 * What it costs at Google since 1 May 2026: a read of the changes is 100 units, an item's record 5. At the floor, a
 * folder is 24 reads a day (2,400 units), a quiet one 4; ten thousand folders at the floor are 24 million units a day
 * of the 400 million that are free.
 */
import { DAY_MS, HOUR_MS, MIN_MS, SECOND_MS, WEEK_MS, type SourceItemRecord } from "@chanlytics/contracts";

export const SOURCE_PACE = {
  /** A folder is read at most once in this long, however many signals come. */
  readGapMs: 5 * MIN_MS,
  /** The gap once its reads keep finding changes elsewhere in the account and none inside (someone busy in Docs). */
  busyGapMs: 30 * MIN_MS,
  /** How many such reads in a row make an account busy elsewhere. Something inside changing ends it. */
  busyAfterReads: 3,
  /** The floor: a folder no signal reached is read by the clock this long after its last read. */
  floorMs: HOUR_MS,
  /** The floor of a quiet folder: one where nothing inside changed for `quietAfterMs`. Also how often a frozen one is asked after. */
  quietFloorMs: 6 * HOUR_MS,
  quietAfterMs: WEEK_MS,
  /** How long between re-walks: daily for a folder that changed within `quietAfterMs`, weekly otherwise. */
  rewalkMs: DAY_MS,
  quietRewalkMs: WEEK_MS,
  /**
   * A tree's routine re-walk is held to about this many of its provider's units a day (a day of floor reads): the
   * gap to the next is the longer of the two above and its last whole walk's units over this, in days, and never
   * more than `rewalkLongestMs`. The changes are the main road and the re-walk the net under it, so a large tree
   * is walked less often, never refused. A walk that is due at once (a lost place, a thaw, a hold, a reconnect)
   * is not held by it.
   */
  rewalkUnitsADay: 2400,
  rewalkLongestMs: 30 * DAY_MS,
  /** A push channel lasts a week at most and is never renewed: a new one is opened this long before the old ends. */
  channelRenewBeforeMs: 2 * DAY_MS,
  /**
   * The hold on a wave of removals: a read or a re-walk that would mark more than `holdItems` items gone or moved out,
   * or more than `holdShare` of what the folder holds, marks none. A run that would mark fewer than `holdLeast` never
   * holds, so one file deleted from a folder of five is simply gone.
   */
  holdItems: 20,
  holdShare: 0.1,
  holdLeast: 5,
  /** What a first watch takes in first (D11): the newest of the last `firstWatchDays` days, `firstWatchItems` at most. */
  firstWatchDays: 30,
  firstWatchItems: 50,
  /** The most items one folder is listed to (D15). Past it the rest is not listed, and the folder's row says so. */
  itemsMax: 50_000,
  /** A walk whose steps stopped is taken up again by the clock once it has written nothing for this long. */
  walkStaleMs: 30 * MIN_MS,
  /**
   * How many folders of a shared drive a walk lists in one question to its provider. A call costs the same
   * whatever it holds, so a tree of many small folders is listed many at a time (18 Nov 2026, a real Drive: 50
   * folders in one call took 0.9 s and 100 units against 12 s and 5,000 a folder at a time). Outside a shared
   * drive a folder is asked alone: there Drive answers many together only in part.
   */
  foldersAtOnce: 40,
  /** How many items' own records a read or a walk asks its provider for at once. */
  recordsAtOnce: 5,
  /**
   * A video listed without its length. A fresh upload is listed whole and measured by its provider a few minutes
   * later (18 Nov 2026: 1 min 19 s and 2 min 44 s after it was listed). Its record is asked again `lengthRetryMs`
   * on while it is younger than `lengthSoonMs`, then at each of the folder's reads, `lengthsARead` a read; once
   * `lengthWaitMs` have passed since its upload it is taken by its size alone.
   */
  lengthRetryMs: 3 * MIN_MS,
  lengthSoonMs: 10 * MIN_MS,
  lengthWaitMs: DAY_MS,
  lengthsARead: 50,
  /** How many of the items a re-walk did not find are asked after in one step. */
  missedAStep: 100,
} as const;

/**
 * Until when a video's length is waited for: the wait after its provider first held it, where its provider has not
 * said its length. Null for anything else. One whose wait is already over is simply not asked after.
 */
export function lengthUntilOf(item: Pick<SourceItemRecord, "kind" | "seconds" | "createdAt">): string | null {
  if (item.kind !== "video" || item.seconds !== null || item.createdAt === null) return null;
  const createdMs = Date.parse(item.createdAt);
  return Number.isFinite(createdMs) ? new Date(createdMs + SOURCE_PACE.lengthWaitMs).toISOString() : null;
}

/** Whether an awaited length is a fresh upload's: its provider measures those within minutes, so it is asked soon. */
export const isLengthSoon = (lengthUntil: string | null, nowMs: number): boolean =>
  lengthUntil !== null &&
  Date.parse(lengthUntil) - SOURCE_PACE.lengthWaitMs > nowMs - SOURCE_PACE.lengthSoonMs &&
  Date.parse(lengthUntil) > nowMs;

/** What a folder's row keeps of its reads: what the pace is decided from. */
interface ReadStanding {
  busyReads: number;
  lastChangeAt: string | null;
}

/** What one read found: how many changes the provider listed, and how many of them were inside the folder. */
interface ReadFound {
  changes: number;
  inside: number;
  /** Whether a signal arrived while the read was running: there may be more to read than it saw. */
  signalled: boolean;
}

/** What a read writes back onto its folder's row: the next read, the gap a signal is held to, and its standing. */
interface NextRead {
  nextReadAt: string;
  readGapSeconds: number;
  busyReads: number;
  lastChangeAt: string | null;
}

/** Whether nothing inside the folder changed for the pace's quiet span: it is read and walked less often. */
function isQuietFolder(lastChangeAt: string | null, nowMs: number): boolean {
  return lastChangeAt === null || nowMs - Date.parse(lastChangeAt) > SOURCE_PACE.quietAfterMs;
}

/**
 * The pace after a read. Something inside changed: the folder is live again, read at the short gap. Changes elsewhere
 * and none inside: one more busy read, and past the pace's count the long gap. A signal that came while the read ran
 * brings the next read one gap on; otherwise the next is the clock's floor.
 */
export function nextReadOf(standing: ReadStanding, found: ReadFound, nowMs: number): NextRead {
  const changedInside = found.inside > 0;
  const busyReads = changedInside ? 0 : found.changes > 0 ? standing.busyReads + 1 : standing.busyReads;
  const lastChangeAt = changedInside ? new Date(nowMs).toISOString() : standing.lastChangeAt;
  const gapMs = busyReads >= SOURCE_PACE.busyAfterReads ? SOURCE_PACE.busyGapMs : SOURCE_PACE.readGapMs;
  const floorMs = isQuietFolder(lastChangeAt, nowMs) ? SOURCE_PACE.quietFloorMs : SOURCE_PACE.floorMs;
  return {
    nextReadAt: new Date(nowMs + (found.signalled ? gapMs : floorMs)).toISOString(),
    readGapSeconds: gapMs / SECOND_MS,
    busyReads,
    lastChangeAt,
  };
}

/** When a signal's read falls due: now, or one gap after the folder's last read, whichever is later. */
export function signalDueOf(lastReadAt: string | null, readGapSeconds: number | null, nowMs: number): Date {
  const gapMs = (readGapSeconds ?? SOURCE_PACE.readGapMs / SECOND_MS) * SECOND_MS;
  const after = lastReadAt === null ? nowMs : Date.parse(lastReadAt) + gapMs;
  return new Date(Math.max(nowMs, after));
}

/** How far apart a tree's routine re-walks are held by what its last whole walk spent. */
const unitsGapMs = (walkUnits: number): number =>
  Math.min((walkUnits / SOURCE_PACE.rewalkUnitsADay) * DAY_MS, SOURCE_PACE.rewalkLongestMs);

/**
 * When a folder is next walked, as its walk ends: a day on where something inside changed lately, a week on where
 * nothing did, and later than either where the walk that just ended spent more than that many days' units.
 */
export function nextWalkOf(lastChangeAt: string | null, nowMs: number, walkUnits = 0): string {
  const own = isQuietFolder(lastChangeAt, nowMs) ? SOURCE_PACE.quietRewalkMs : SOURCE_PACE.rewalkMs;
  return new Date(nowMs + Math.max(own, unitsGapMs(walkUnits))).toISOString();
}

/**
 * The soonest a folder that just changed is walked again: a day on, and never sooner after its last whole walk than
 * what that walk spent allows.
 */
export function soonestRewalkOf(reconciledAt: string | null, walkUnits: number, nowMs: number): number {
  const held = reconciledAt === null ? 0 : Date.parse(reconciledAt) + unitsGapMs(walkUnits);
  return Math.max(nowMs + SOURCE_PACE.rewalkMs, held);
}

/** Whether a push channel is due: none kept, or one that ends within the pace's span. */
export function isChannelDue(expiresAt: string | null, nowMs: number): boolean {
  return expiresAt === null || Date.parse(expiresAt) - SOURCE_PACE.channelRenewBeforeMs <= nowMs;
}

/**
 * Whether a re-walk agrees with a hold: one that began a re-walk's span or more after the hold was written. A walk that
 * was already due when the hold came, and runs minutes after it, does not: a hold waits a day.
 */
export function agreesWithHold(holdAt: string | null, walkStartedAt: string | null): boolean {
  if (holdAt === null || walkStartedAt === null) return false;
  return Date.parse(walkStartedAt) - Date.parse(holdAt) >= SOURCE_PACE.rewalkMs;
}

/**
 * Whether a run's removals are a wave, held rather than marked: more than the pace's count, or more than its share of
 * what the folder holds, and never fewer than its least.
 */
export function isMassGone(leaving: number, held: number): boolean {
  if (leaving < SOURCE_PACE.holdLeast) return false;
  return leaving > SOURCE_PACE.holdItems || leaving > held * SOURCE_PACE.holdShare;
}
