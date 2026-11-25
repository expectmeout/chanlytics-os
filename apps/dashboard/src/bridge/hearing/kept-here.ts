/**
 * What the boot stands on in this tab (hearing/kept.ts says the rule): the copies the device kept, dated by when each was
 * read, judged by this browser's clock as the servers read it and by the business's own day; and what the runner is told
 * of each copy that stands.
 */
import { serversClockOf } from "../api";
import type { SurfaceOverride } from "../surface-data";
import { isSurfaceReady, readAtOf, standOnKept } from "../surface-status";
import type { CatchUp } from "./catch-up";
import { dayAt } from "./clock";
import type { KeptAsk, KeptCopy } from "./kept";

/**
 * What the boot asks its copies with, here: a surface the cache restored (ready before anything is read) is dated when the
 * visit that kept it read it (surface-status.ts noteReadAt). Made as the boot begins, before any read of this load dates one.
 */
export function keptAskHere(catchUp: CatchUp | undefined, tenant: () => string, win: Window = window): KeptAsk {
  return {
    catchUp,
    keptAt: (o) => (isSurfaceReady(o.key) ? readAtOf(o.key) : null),
    dayAt: (ms) => dayAt(ms, win),
    serversClockOf,
    tenant,
    now: Date.now(),
  };
}

/**
 * Each surface whose copy stands leaves the boot's list of what it still reads, is told to the runner as read when its
 * copy was (`readAs`: the clock reads it again where it is drawn, once that is a quarter of an hour old), and stands as
 * live. One a move has since asked for, or the list no longer holds, is left to the boot.
 */
export async function standOnKeptCopies(
  strangers: SurfaceOverride[],
  unchanged: Promise<KeptCopy[]>,
  readAs: (surface: SurfaceOverride, at: number) => void,
): Promise<void> {
  for (const { surface, at } of await unchanged) {
    const place = strangers.indexOf(surface);
    if (place < 0) continue;
    strangers.splice(place, 1);
    readAs(surface, at);
    standOnKept(surface.key);
  }
}
