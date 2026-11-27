/**
 * A card's own small read on Today that Today's first draw waits for: Cold email's one line (cold-email-note-read.ts) and
 * Content's card (content-note-read.ts). Each is kept in the tab by workspace (read-cache.ts `tab`), so Today draws the card
 * from the last answer at once and reads again behind it; and, where the tab opens on Today holding none, its first draw
 * waits for the read the document's head started with Today's own (contracts PREFETCH_READS), as it waits for its own
 * surface (surface-status firstDrawWaitsFor). Asked only once the page had drawn, such a card landed 0.3 to 0.6 s after the
 * page on a first visit and pushed the day down under it (79 px on a phone for Cold email's line, the load review of 10 Nov
 * 2026; about 230 px for Content's card). The frame loads each with Today's surface (override.ts), which holds the draw
 * before Today's gate first opens, and only where the document's head has the read out: the frame takes that read and asks
 * the server for nothing itself. A move to Today from another page, the tab holding none, asks for each as the move is asked
 * and waits for it the same way (arriveOnToday).
 *
 * Drawn, Cold email's line and Content's read again only once Today's own read has landed having begun after their last
 * ask (useReadAsTheDayIsRead), since that is when the frame heard something: a notice of what Today draws, a write read
 * again behind it, the fifteen-minute heal, the day's turn, the network or the tab come back. Never for the clock's minute
 * remake of the day from what it holds (override.ts `rederive`, hearing/clock.ts), which asks the server nothing and moves
 * the day's surface all the same. The cards read again on every move of it, at most once a minute, so a Today left open
 * in front read both notes again once or twice in two minutes for nothing: 17 database calls a minute against the
 * nightly's line of 12 (e2e/shell/database-calls.spec.ts, run 45931523493, 27 Nov 2026).
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { MIN_MS, firstRowsStand } from "@chanlytics/contracts";
import { headStarted } from "@/bridge/api";
import { hearFront, pageHidden } from "@/bridge/hearing/front";
import { readCache } from "@/bridge/read-cache";
import { ROUTE_WAITS, routePartsOf } from "@/bridge/surface-registry";
import {
  firstDrawWaitsFor,
  isSurfaceFailed,
  isSurfaceReady,
  onSurfaceMoved,
  surfaceMoved,
  surfaceVersion,
} from "@/bridge/surface-status";
import { afterBoot, getActiveWorkspace, warmsOnItsOwn } from "@/bridge/workspace";
import { letsGo } from "@/client/trouble";
import { setupCardCode, todayOnScreen } from "./setup-card-code";

/** The answer as it is kept: a workspace with nothing to say holds `value: null`, which is not the same as holding nothing. */
interface Held<T> {
  value: T | null;
}

interface FirstDrawRead<T> {
  /** What this tab last read for the workspace on screen, or null where it holds nothing: what Today's first draw is made of. */
  kept: () => Held<T> | null;
  /**
   * Where the tab opened on Today and holds nothing, its first draw waits for the read: said as the frame loads Today's
   * surface (override.ts), and only where the document's head has the read out. A tab that holds an answer draws it at once.
   */
  hold: () => void;
  /**
   * The read now, as the card asks for it; null where it failed or was refused, so the card claims nothing it could not
   * read. The first ask after a load that waited for it is that load's own read, so a load never asks twice, and a page drawn
   * before it landed (the route's wait passed) still hears it.
   */
  read: () => Promise<T | null>;
}

/** How a card's read stands in Today beside the page's own. */
interface FirstDrawReadOptions {
  /**
   * The signal the parts it is drawn into redraw on as an answer is kept (surface-status surfaceMoved), where they read it in
   * their own render (Today's arrangement reads what Today draws from People: people-read.ts): one that lands past the
   * first draw's wait.
   */
  heard?: string;
  /** Whether a move to Today from another page waits for it too, where the tab holds none (arriveOnToday). */
  onArrival?: boolean;
  /**
   * Whether what it carries is in hand another way, where a move to Today neither waits for it nor reads it ahead: People's
   * whole book, for Today's read of People (people-read.ts).
   */
  servedBy?: () => boolean;
}

/** A card's read that said so (`onArrival`): as a move to Today reaches it (`arrive`, waited for), and begun before one. */
interface Arriving {
  arrive: () => void;
  begin: () => void;
}

/** What a move to Today waits for beside its Setup card's code, and reads ahead of one. */
const arrivals = new Set<Arriving>();

/**
 * A move to Today asked from another page (workspace.ts onRouteAsked, said by override.ts): its first draw waits for the
 * Setup card's code and for each card's read the tab holds no answer for, as a load's does (`hold`). Asked only as Today's
 * page drew, each landed after it: from the Calendar, Cold email's line 0.3 s after the page and 79 px over the day, the
 * Setup card 75 ms after (the phone review of 15 Nov 2026). Said as the move is asked, before the router draws the page.
 */
export function arriveOnToday(route: string): void {
  if (routePartsOf(route).page !== "today" || todayOnScreen()) return;
  firstDrawWaitsFor(
    "today",
    setupCardCode().then(
      () => undefined,
      () => undefined,
    ),
  );
  for (const card of arrivals) card.arrive();
}

/** What Today's first draw waits for that is read ahead of a move to it (readTodaySoon): what is not in yet. */
const todayWaitsToRead = (): string[] =>
  (ROUTE_WAITS.today ?? []).filter((k) => !isSurfaceReady(k) && !isSurfaceFailed(k));

/**
 * What Today's first draw waits for, read on any other page once that page has its own reads (afterBoot("page"); `read`: the
 * runner's read of those surfaces, FrameApp.tsx), with each card's read the tab holds none of, so a press to Today draws at
 * once. Asked only as Today was reached, its first draw came 1.6 to 2.0 s after the press (the phone review of 15 Nov
 * 2026); asked once the whole boot was in, 1.3 to 2.4 s on production, where that was three seconds on (16 Nov). The AI's
 * morning among them, whose read asks for none off Today (ask-morning-surface.ts). Never where the page may not warm on its
 * own (warmsOnItsOwn).
 */
export function readTodaySoon(read: (keys: string[]) => void, at?: Window): void {
  const win = at ?? (typeof window === "undefined" ? null : window);
  if (!win || !warmsOnItsOwn()) return;
  const go = () => {
    if (todayOnScreen()) return;
    const keys = todayWaitsToRead();
    if (keys.length) read(keys);
    for (const card of arrivals) card.begin();
  };
  const soon = () => void afterBoot("page").then(go);
  if (win.document.readyState === "complete") soon();
  else win.addEventListener("load", soon, { once: true });
}

/** Whether a phone's kept picture stands where the page will draw (contracts firstRowsStand); none where there is no document. */
const pictureStands = (): boolean => typeof document !== "undefined" && firstRowsStand(document);

/**
 * Settled a turn on where a copy of Today kept from an earlier visit is in hand (a tab reopened: the frame restores it as
 * it loads, FrameApp.tsx) and nothing stands in the page's place; never otherwise. Such a page draws at once: held for the
 * card it drew 0.4 to 1 s later, for a card that lands under what it shows. A phone's kept picture stands where the page
 * will, card and all, so there the page waits for the card under it.
 */
const drawsAtOnce = (): Promise<void> =>
  new Promise((done) => {
    queueMicrotask(() => {
      if (isSurfaceReady("today") && !pictureStands()) done();
    });
  });

/** A card's read: kept under `key`, started by the document's head at `path`, asked by `ask`, standing as `opts` says. */
export function firstDrawRead<T>(
  key: string,
  path: string,
  ask: () => Promise<T | null>,
  { heard, onArrival = false, servedBy }: FirstDrawReadOptions = {},
): FirstDrawRead<T> {
  const held = readCache<Held<T>>(key, () => true, { tab: true });
  const askFor = (): Promise<T | null> =>
    held
      .through(getActiveWorkspace() ?? "", async () => ({ value: await ask() }))
      .then(
        (kept) => {
          if (heard) surfaceMoved(heard);
          return kept.value;
        },
        () => null,
      );
  const kept = (): Held<T> | null => held.peek(getActiveWorkspace() ?? "");
  /** Whether a move to Today has it already: kept, or in hand the other way. */
  const inHand = (): boolean => !!kept() || !!servedBy?.();
  /** The load's own read, or the move's, while the card has not taken it: the one Today's first draw waited for. */
  let loadsRead: Promise<T | null> | null = null;
  if (onArrival)
    arrivals.add({
      // A read already out, one started ahead, is the one waited for, never asked again.
      arrive: () => {
        if (inHand()) return;
        loadsRead ??= askFor();
        firstDrawWaitsFor("today", loadsRead);
      },
      begin: () => {
        if (!inHand()) loadsRead ??= askFor();
      },
    });
  return {
    kept,
    hold: () => {
      if (!todayOnScreen() || kept() || !headStarted(path)) return;
      loadsRead = askFor();
      firstDrawWaitsFor("today", Promise.race([loadsRead, drawsAtOnce()]));
    },
    read: () => {
      const first = loadsRead;
      loadsRead = null;
      return first ?? askFor();
    },
  };
}

/* ------------------------------------------------------------------------- read again as Today is read -- */

/** The signal Today's own read says as it lands (surface-status surfaceMoved): never the clock's remake of the day. */
const DAY_READ = "today_read";

/** When the newest of Today's own reads to land began, by this browser's clock; 0 before any. */
let dayReadBegan = 0;

/**
 * Today's own read landed, begun at `began` (override.ts `apply`). The load's, which the document's head started beside the
 * cards' own reads, is not said: the cards read with it.
 */
export function dayWasRead(began: number): void {
  dayReadBegan = Math.max(dayReadBegan, began);
  surfaceMoved(DAY_READ);
}

const hearDayRead = (fn: () => void) => onSurfaceMoved([DAY_READ], fn);
const dayReadsHeard = () => surfaceVersion([DAY_READ]);

/** `ask` once `waitMs` has passed and the page is in front: a read due while nobody looks waits for them. Answers the stop. */
function askLater(waitMs: number, ask: () => void): () => void {
  let unfront: (() => void) | null = null;
  const inFront = () => {
    if (!pageHidden()) return ask();
    unfront = hearFront(() => {
      if (pageHidden()) return;
      unfront?.();
      unfront = null;
      ask();
    });
  };
  const stop = () => unfront?.();
  if (waitMs <= 0) {
    inFront();
    return stop;
  }
  const timer = setTimeout(inFront, waitMs);
  // A test's process is not kept alive by a card's wait alone (a browser's timer is a number, with none).
  const handle: unknown = timer;
  if (letsGo(handle)) handle.unref();
  return () => {
    clearTimeout(timer);
    stop();
  };
}

/**
 * A card's own read beside the day: asked as the card is drawn, and again where Today's own read has landed having begun
 * after the card last asked, at most once a minute. One due inside the minute is asked as the minute ends, never let go,
 * since what Today heard may be the card's too (a mailbox, a run, the business's settings); and one due while nobody looks
 * as the page comes in front. `take` is handed each answer, null where the read failed or was refused.
 */
export function useReadAsTheDayIsRead<T>(read: () => Promise<T | null>, take: (value: T | null) => void): void {
  const heard = useSyncExternalStore(hearDayRead, dayReadsHeard, dayReadsHeard);
  const askedAt = useRef<number | null>(null);
  const due = useRef<(() => void) | null>(null);
  useEffect(() => {
    const ask = () => {
      askedAt.current = Date.now();
      void read().then(take);
    };
    if (askedAt.current === null) return ask();
    // Asked since the day was read, or asked for already: nothing more.
    if (dayReadBegan <= askedAt.current || due.current) return;
    let atOnce = false;
    const stop = askLater(askedAt.current + MIN_MS - Date.now(), () => {
      atOnce = true;
      due.current = null;
      ask();
    });
    if (!atOnce) due.current = stop;
  }, [heard, read, take]);
  // A card no longer drawn asks nothing it was due.
  useEffect(
    () => () => {
      due.current?.();
      due.current = null;
    },
    [],
  );
}
