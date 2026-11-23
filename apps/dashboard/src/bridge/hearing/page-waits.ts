/**
 * What the rest of a boot waits for on the page on screen (surface-runner.ts bootInPasses), besides its own surfaces: the
 * reads it opens on that are no surface, and its draw. Each for the route's wait at most (the runner says it), so a read
 * that never lands, or a page that never draws, holds the shell's badge and bell back no longer than the frame waits for it.
 */
import { publicEnv } from "@/lib/public-env";

/**
 * Whether the page on screen goes first (the plan "Pages that open at once", piece 3): what other pages read waits for it
 * to be drawn, not only for its own reads. On unless NEXT_PUBLIC_PAGE_FIRST says off (lib/public-env.ts).
 */
export const pageFirst = (): boolean => publicEnv.NEXT_PUBLIC_PAGE_FIRST !== "off";

/**
 * The page on screen's draw: settled once it is drawn (pageDrawn), at once where nobody said a draw is coming
 * (drawComing); `due` settles the one coming.
 */
const pageDraw: { now: Promise<void>; due: (() => void) | null } = { now: Promise.resolve(), due: null };

/**
 * Said at the shell's module scope with bootComing (FrameApp.tsx): the page on screen will say when it is drawn. Until then,
 * what other pages read waits, as does what is read ahead for a press (workspace.ts afterBoot("page")): on a first open the
 * page's reads were in while its code still loaded, and People and Campaigns began about twenty reads for other pages
 * before they drew (the phone sweep of 22 Nov 2026). Nothing waits where the switch is off.
 */
export function drawComing(): void {
  if (pageDraw.due || !pageFirst()) return;
  pageDraw.now = new Promise<void>((settle) => (pageDraw.due = settle));
}

/**
 * The page on screen is drawn: its main part's rows, or its gate open where it has none (FrameApp). What waited for it goes
 * once that frame is painted, never in it: begun in the commit, the rest's twenty reads went out before the browser had put
 * the page on the screen (the local sweep of 23 Nov 2026), and a load's READY counted them as begun ahead of it.
 */
export function pageDrawn(): void {
  const due = pageDraw.due;
  if (!due) return;
  pageDraw.due = null;
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => setTimeout(due, 0));
  else due();
}

/**
 * A read the page on screen opens on that is no surface -- a person's page reads its person (people-detail.ts
 * warmPersonOnScreen) -- said to the boot before it starts, so the surfaces nobody is looking at wait for it as they
 * wait for the page's own. Measured on production (25 Sep 2026, a cold person page): the person's read took 3,236 ms
 * beside nine of the boot's, and 773 ms alone.
 */
const pageReads = new Set<Promise<unknown>>();
export function bootWaitsFor(read: Promise<unknown>): void {
  pageReads.add(read);
  const done = () => pageReads.delete(read);
  read.then(done, done);
}

/** Settled once `wait` has, landed or not, or once `capMs` has gone by, whichever is first. */
function atMost(wait: Promise<unknown>, capMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const capped = new Promise<void>((r) => (timer = setTimeout(r, capMs)));
  const settled = wait.then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([settled, capped]).finally(() => clearTimeout(timer));
}

/** The page's reads said so far, this boot's, then let go of: a read that never lands is this boot's wait at most, never the next one's. */
export function pageReadsIn(capMs: number): Promise<void> {
  const reads = [...pageReads];
  pageReads.clear();
  return reads.length === 0 ? Promise.resolve() : atMost(Promise.allSettled(reads), capMs);
}

/**
 * Settled once the page on screen is drawn (pageDrawn), or at `capMs`: a page that never draws (a failure it says in its
 * own words, a page with nothing to read) waits no longer.
 */
export const pageDrawnIn = (capMs: number): Promise<void> => atMost(pageDraw.now, capMs);
