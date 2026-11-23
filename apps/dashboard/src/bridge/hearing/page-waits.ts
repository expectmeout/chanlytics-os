/**
 * What the rest of a boot waits for on the page on screen (surface-runner.ts bootInPasses), besides its own surfaces: the
 * reads it opens on that are no surface, and its draw. Each for the route's wait at most (the runner says it), so a read
 * that never lands, or a page that never draws, holds the shell's badge and bell back no longer than the frame waits for it.
 */
import { afterDrawn } from "../workspace";

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
 * Settled once the page on screen is drawn (workspace.ts afterDrawn), or at `capMs`: a page that never draws (a failure it
 * says in its own words, a page with nothing to read) waits no longer.
 */
export const pageDrawnIn = (capMs: number): Promise<void> => atMost(afterDrawn(), capMs);
