/**
 * Reading everything again, once (the wiring's second audit, lane R9: S2-4, S2-7, S10-3, S10-7). A return to the tab, the
 * network back, the live feed joined or joined again, a page coming in front after what it held, and the business's day
 * turning each ask for surfaces to be read again. Each built its own burst: a rejoin read every live page at once outside the
 * boot's four lanes (twenty-three reads at once took 7.8 s to land), a phone resume made a return and a rejoin read the same
 * surfaces twice, and a page nobody was looking at read as much as the one on screen.
 *
 * Now one pass serves them all (`again`). It reads in the page's own order through the boot's lanes, and remembers for each
 * surface asked for the moment a read must have begun after to hold what it was asked for: a surface read since (by a lane of
 * this pass, a notice, a write) is not read again, and a pass asked for while one is out is that pass's next round. What a pass
 * reads is what the page on screen draws and what is heard on every page; a surface heard only on its page is kept for the
 * pages that draw it (the runner's readHere).
 *
 * A hidden page holds what the feed says (`holdWhileHidden`) and reads it as it comes back in front; back after half a minute
 * or more, or with the feed down, it reads everything again, since anything may have changed.
 */
import { MIN_MS } from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";
import { getConnection, getSurfaceStatuses, setConnection } from "../surface-status";
import { hearFront, pageHidden } from "./front";

/**
 * A return to the tab this soon after it was hidden reads nothing again but what the feed said meanwhile, while the feed is up
 * and every surface is live: the feed kept them current. Every return used to read every surface -- about 28 reads on a
 * workspace, for a glance at another app; the phone app's five pages each did it on every return to the app.
 */
const AWAY_BEFORE_READ_AGAIN_MS = MIN_MS / 2;

/** Why everything is read again. */
export type PassReason = "return" | "online" | "join" | "rejoin" | "shown" | "midnight";

/**
 * The reasons that ask for no moment of their own: a return, the network back or the page shown while a pass is out joins it at
 * the moment it began, so what that pass has read holds what they ask for (a phone's resume is a return and the network back in
 * one breath, and two returns in quick succession were a pass and a half). A join or a rejoin names the moment of its join, and
 * the day's turn needs a read begun after midnight: theirs are their own.
 */
const JOINS_THE_PASS_OUT: ReadonlySet<PassReason> = new Set(["return", "online", "shown"]);

/** What a pass asks of the runner it reads through. */
export interface PassRun {
  readonly overrides: readonly SurfaceOverride[];
  /** How many reads a pass has out at once: the boot's lanes. */
  readonly lanes: number;
  /** Read it again through the runner; settles when its read has, whether it landed or not. */
  read(o: SurfaceOverride): Promise<void>;
  /** When its last read began (the runner's readFrom), or undefined when it was never read. */
  readFrom(o: SurfaceOverride): number | undefined;
  /** Of these, what a pass reads with the page on screen; the rest are kept for the pages that draw them (readHere). */
  here(list: readonly SurfaceOverride[]): SurfaceOverride[];
  /** Whether the page on screen is drawn from it (screenOwn). */
  drawn(o: SurfaceOverride): boolean;
  /** The order the page on screen reads in (screenRank): its own surface first. */
  order(): (o: SurfaceOverride) => number;
  stopped(): boolean;
}

export interface Passes {
  /**
   * Read these again (everything, where none are named), each one whose last read began before `since` (now, where none is
   * said; the moment the pass out began, for a reason that joins it): in the page's order, through the lanes. Settles when the
   * pass is done, this round and any asked for meanwhile.
   */
  again(reason: PassReason, list?: readonly SurfaceOverride[], since?: number): Promise<void>;
  /** The feed told of a change while nobody was looking: read it as the page comes back in front. */
  holdWhileHidden(o: SurfaceOverride): void;
  /** The last reason a pass ran for, for a test to read. */
  lastReason(): PassReason | null;
  stop(): void;
}

/** The one pass, and the return, the network and the page in front it serves. */
export function passesOf(run: PassRun, win: Window = window): Passes {
  /** Each surface asked for, and the moment a read of it must have begun after to hold what it was asked for. */
  const due = new Map<SurfaceOverride, number>();
  let running: Promise<void> | null = null;
  /** When the pass out began (JOINS_THE_PASS_OUT). */
  let began = 0;
  let reason: PassReason | null = null;

  /** Whether a surface still owes the read it was asked for: none of its reads began after the moment asked. */
  const owes = (o: SurfaceOverride): boolean => {
    const since = due.get(o);
    if (since === undefined) return false;
    const from = run.readFrom(o);
    return from === undefined || from < since;
  };

  const round = async (): Promise<void> => {
    const order = run.order();
    const queue = [...due.keys()].sort((x, y) => order(x) - order(y));
    const lane = async (): Promise<void> => {
      for (let o = queue.shift(); o !== undefined; o = queue.shift()) {
        if (run.stopped()) return;
        const owed = owes(o);
        due.delete(o);
        if (owed) await run.read(o);
      }
    };
    await Promise.all(Array.from({ length: Math.min(run.lanes, queue.length) }, lane));
  };

  const pass = async (): Promise<void> => {
    // A surface asked for again while its round was out waits for the next round: the read under way began before it.
    while (due.size && !run.stopped()) await round();
  };

  const again: Passes["again"] = (why, list, since) => {
    reason = why;
    const at = since ?? (running && JOINS_THE_PASS_OUT.has(why) ? began : Date.now());
    for (const o of run.here(list ?? run.overrides)) due.set(o, Math.max(due.get(o) ?? 0, at));
    if (!running) began = Date.now();
    running ??= pass().finally(() => {
      running = null;
    });
    return running;
  };

  // The page in front again: what the feed said while it was hidden is read, or everything when it was away long, the feed
  // dropped meanwhile or a surface stopped refreshing.
  const held = new Set<SurfaceOverride>();
  let hiddenAt: number | null = null;
  const onFront = () => {
    if (pageHidden()) {
      hiddenAt ??= Date.now();
      return;
    }
    // Shown with no hiding heard (a page that opened behind): as long away as can be.
    const away = hiddenAt === null ? Infinity : Date.now() - hiddenAt;
    hiddenAt = null;
    const statuses = getSurfaceStatuses();
    // A surface read only where it is drawn, or heard only on its page, and not drawn here, is none the feed could have let go
    // stale on this page: it does not count.
    const kept = (o: SurfaceOverride) => (o.onDemand || o.fresh === "its-page") && !run.drawn(o);
    const allLive = run.overrides.every((o) => kept(o) || statuses.get(o.key) === "live");
    if (away < AWAY_BEFORE_READ_AGAIN_MS && allLive && !getConnection().realtimeDown) {
      if (!held.size) return;
      const list = [...held];
      held.clear();
      void again("shown", list);
      return;
    }
    held.clear();
    void again("return");
  };
  const unhearFront = hearFront(onFront, win);

  // The browser says when this device loses its connection and when it has it back. Offline is the shell's to say at once;
  // back online, everything is read again now rather than at the next return, because anything may have changed meanwhile.
  const onOffline = () => setConnection({ offline: true });
  const onOnline = () => {
    setConnection({ offline: false });
    void again("online");
  };
  if (typeof navigator !== "undefined" && navigator.onLine === false) setConnection({ offline: true });
  win.addEventListener("offline", onOffline);
  win.addEventListener("online", onOnline);

  return {
    again,
    holdWhileHidden: (o) => held.add(o),
    lastReason: () => reason,
    stop() {
      due.clear();
      held.clear();
      unhearFront();
      win.removeEventListener("offline", onOffline);
      win.removeEventListener("online", onOnline);
    },
  };
}
