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
 */
import { firstRowsStand } from "@chanlytics/contracts";
import { headStarted } from "@/bridge/api";
import { readCache } from "@/bridge/read-cache";
import { ROUTE_WAITS, routePartsOf } from "@/bridge/surface-registry";
import { firstDrawWaitsFor, isSurfaceFailed, isSurfaceReady, surfaceMoved } from "@/bridge/surface-status";
import { afterBoot, getActiveWorkspace, warmsOnItsOwn } from "@/bridge/workspace";
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
  { heard, onArrival = false }: FirstDrawReadOptions = {},
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
  /** The load's own read, or the move's, while the card has not taken it: the one Today's first draw waited for. */
  let loadsRead: Promise<T | null> | null = null;
  if (onArrival)
    arrivals.add({
      // A read already out, one started ahead, is the one waited for, never asked again.
      arrive: () => {
        if (kept()) return;
        loadsRead ??= askFor();
        firstDrawWaitsFor("today", loadsRead);
      },
      begin: () => {
        if (!kept()) loadsRead ??= askFor();
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
