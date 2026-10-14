/**
 * Time is a notice nobody sends (decision 0058, amended for the wiring's second audit, lane R8). What a page says of the
 * clock moves with no record changing, so the live feed never tells it: a visit that was "Next" is under way, a WhatsApp
 * window drops under six hours, a message goes an hour unanswered, a step falls due at midnight, a campaign passes its
 * last day. Each lived as long as the read it was said in, and a tab left open on Today said the morning's visit was
 * next at two in the afternoon. The runner keeps one clock for every surface instead (startSurfaces):
 *
 *  - A surface whose words are made from what it holds and the moment (`rederive`) is made again from what it holds,
 *    with no read: at each minute's turn while a page that draws it is on screen, as such a page comes on screen or the
 *    tab comes back, and wherever it is drawn or not once the business's day has turned since it was last made.
 *  - A surface no notice tells of a change to its source (the owner's own calendar feed) says how old a read of it may
 *    be while a page that draws it is on screen (`readEveryMs`), and is read again then, on any page that draws it: a
 *    timer inside one page's effect kept only that page current (the wiring's second audit, S2-3).
 *  - A surface that holds a fact the server made by the read's own clock says when it stops being true (`validUntil`:
 *    People's next visit), and is read again once that has passed, where it is drawn.
 *  - And anything the feed tells of and the page on screen draws is read again once its last read is a quarter of an hour old
 *    (the rolling heal, lane R9): a notice the tab missed (a socket a phone suspended, a read that failed past its retries, a
 *    change in the moment before the feed was joined) is healed within that, and what a page says of ages ("3 days ago") is
 *    never older.
 *
 * A hidden tab does none of it, and is made again and read where due as it is shown. The day's own reads, of what counts
 * the day so far, stay the day turn's (`readAtMidnight`, surface-runner.ts watchTheDayTurn).
 */
import { MIN_MS, zoneDayKey } from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";
import { drawsTheScreen } from "../surface-registry";
import { onSurfaceMoved, surfaceMoved } from "../surface-status";
import { hearAddress, routeOnScreen } from "../workspace";
import { knownZone } from "../zone";
import { hearFront, pageHidden } from "./front";

/** What the clock asks of the runner it keeps time for. */
export interface ClockRun {
  readonly overrides: readonly SurfaceOverride[];
  /** When the surface's last read began, as the runner keeps it (its `readFrom`); undefined when it was never read. */
  readFrom(o: SurfaceOverride): number | undefined;
  /** Whether a read of it is already asked for (a refresh waiting out its burst). */
  asked(o: SurfaceOverride): boolean;
  /** Read it again, through the runner. */
  read(o: SurfaceOverride): void;
  /** Whether the runner has stopped. */
  stopped(): boolean;
}

/** A hair past the minute's turn, so a tick never judges the minute it leaves. */
const PAST_THE_MINUTE_MS = 50;

/** How old a read of anything the feed tells of may be while a page that draws it is on screen: the rolling heal. */
export const HEAL_AFTER_MS = 15 * MIN_MS;

/**
 * Whether the rolling heal keeps a surface: one the feed tells of, wherever or on its page. Not one read only where it is
 * drawn (`onDemand`), which its own age reads as its page comes on screen, nor one the feed tells nothing (own-change, aged).
 */
const healed = (o: SurfaceOverride): boolean => !o.onDemand && (o.fresh === "live" || o.fresh === "its-page");

const minuteOf = (ms: number): number => Math.floor(ms / MIN_MS);

/** The business's day at `ms`, by the workspace's zone; null before the zone is known, or for one the browser cannot read. */
function dayAt(ms: number, win: Window): string | null {
  const zone = knownZone(win);
  if (!zone) return null;
  try {
    return zoneDayKey(ms, zone);
  } catch {
    return null;
  }
}

/**
 * Make a surface again from what it holds, at `now`, and tell the pages that draw it where anything moved: its own
 * events, as a read tells them (surface-data.ts activateOverride), or its key where it has none. A remake that throws is
 * a page left as it was, never a broken tab.
 */
function remake(o: SurfaceOverride, now: Date, win: Window): void {
  let moved: boolean;
  try {
    moved = o.rederive?.(now) === true;
  } catch (e) {
    console.error("surface_rederive_failed", o.key, e instanceof Error ? e.message : e);
    return;
  }
  if (!moved) return;
  if (o.events?.length) for (const event of o.events) win.dispatchEvent(new CustomEvent(event));
  else surfaceMoved(o.key);
}

/**
 * Keep time for a runner's surfaces: their remakes and their timed reads, as above. Answers the stop. Arms nothing where
 * no surface asks for either.
 */
export function watchTheClock(run: ClockRun, win: Window = window): () => void {
  const remade = run.overrides.filter((o) => typeof o.rederive === "function");
  const timed = run.overrides.filter(
    (o) => (typeof o.readEveryMs === "number" && o.readEveryMs > 0) || typeof o.validUntil === "function" || healed(o),
  );
  if (!remade.length && !timed.length) return () => {};

  /** When each surface was last made, by a read or a remake: the minute, and the business's day. */
  const made = new Map<string, { minute: number; day: string | null }>();
  const stamp = (key: string) => {
    const at = Date.now();
    made.set(key, { minute: minuteOf(at), day: dayAt(at, win) });
  };
  const unhear = remade.map((o) => onSurfaceMoved([o.key], () => stamp(o.key)));

  const visible = () => !pageHidden();

  /** One look at the clock: what is due is made again, and what is old where it is drawn is read again. */
  const look = () => {
    if (run.stopped() || !visible()) return;
    const at = Date.now();
    const now = new Date(at);
    const route = routeOnScreen(win);
    const minute = minuteOf(at);
    const day = dayAt(at, win);
    for (const o of remade) {
      const was = made.get(o.key);
      const drawn = drawsTheScreen(o.key, route);
      // Drawn here, each minute; anywhere, once the day has turned since (a step due at midnight, the Calendar's today).
      const due = drawn ? !was || was.minute < minute : !!was && day !== null && was.day !== null && was.day !== day;
      if (!due) continue;
      remake(o, now, win);
      stamp(o.key);
    }
    for (const o of timed) {
      if (!drawsTheScreen(o.key, route) || run.asked(o)) continue;
      const from = run.readFrom(o);
      if (from === undefined) continue; // never read: the boot's, or its page's, to read first
      // Old enough by its own measure, or past what it holds was true until, by a read that began before that instant.
      const until = o.validUntil?.() ?? null;
      const aged = at - from >= Math.min(o.readEveryMs ?? Infinity, healed(o) ? HEAL_AFTER_MS : Infinity);
      const expired = until !== null && at >= until && from < until;
      if (aged || expired) run.read(o);
    }
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const tick = () => {
    look();
    arm();
  };
  const arm = () => {
    if (run.stopped()) return;
    timer = setTimeout(tick, MIN_MS - (Date.now() % MIN_MS) + PAST_THE_MINUTE_MS);
    // A test's process, or a worker's, is not kept alive by the clock alone (a browser's timer is a number, with none).
    const handle: unknown = timer;
    if (typeof handle === "object" && handle !== null && "unref" in handle) (handle as { unref: () => void }).unref();
  };
  const onShown = () => {
    if (visible()) look();
  };
  const unhearAddress = hearAddress(look, win);
  const unhearFront = hearFront(onShown, win);
  arm();
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
    unhearAddress();
    unhearFront();
    for (const stop of unhear) stop();
  };
}
