import { expect, type Page } from "@playwright/test";

/**
 * When a page says it was drawn with its rows: READY (client/page-speed.ts), a measure on the page's own clock carrying
 * the report the field data keeps, so a spec holds the same number the back office shows.
 */
interface Drawn {
  page: string;
  ms: number;
  part: string | null;
}

/**
 * A read of the page that a navigation may cut off, as the address moving from its hash to its path does: that is a new
 * document, so the read has nothing to say yet, and the poll asks again. It failed the check of production on 7 Nov 2026.
 */
export const orIfItMoved = <T>(read: Promise<T>, otherwise: T): Promise<T> =>
  read.catch((e: unknown) => {
    if (String(e).includes("Execution context was destroyed")) return otherwise;
    throw e;
  });

/** The READY measures the page has said so far: the page's own (no part), with the time each took. */
const readies = (page: Page): Promise<Drawn[]> =>
  orIfItMoved(
    page.evaluate(() =>
      (performance.getEntriesByType("measure") as PerformanceMeasure[]).flatMap((m) => {
        const s = (m.detail as { speed?: { name?: string; page?: string; part?: string } } | null)?.speed;
        return s?.name === "READY" ? [{ page: s.page ?? "", part: s.part ?? null, ms: Math.round(m.duration) }] : [];
      }),
    ),
    [],
  );

/** How many times this page has said it was drawn, for a spec about to move to it. */
export const timesDrawn = async (page: Page, name: string): Promise<number> =>
  (await readies(page)).filter((r) => r.page === name && !r.part).length;

/** The page's own READY, once it has said it `after` times already: how long that drawing took. */
export async function drawnIn(page: Page, name: string, after = 0): Promise<number> {
  let ms = -1;
  await expect
    .poll(
      async () => {
        const own = (await readies(page)).filter((r) => r.page === name && !r.part);
        ms = own.length > after ? own[own.length - 1].ms : -1;
        return ms >= 0;
      },
      { timeout: 30_000, message: `${name} says it was drawn` },
    )
    .toBe(true);
  return ms;
}
