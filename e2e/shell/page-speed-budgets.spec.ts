import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * Each page is drawn with its rows within its budget, on a cold load and on a move (the page-open PRD of 3 Nov 2026, L9,
 * NFR3). The page says when it was drawn (READY, client/page-speed.ts), as a measure on the page's own clock carrying the
 * report the field data keeps; this reads those, so the nightly holds the same number the back office shows, and fails a
 * page past its line in tests/baselines/page-speed-budgets.json. Every other load spec proves that nothing
 * moves once drawn; none said how long the drawing took.
 *
 * A fresh context is a first load, as after every deploy: no cache, no warm. Each page is read once; the line has a fifth of
 * room over the week it was set from, so a slow runner's one load is not a regression.
 */
const BUDGETS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../tests/baselines/page-speed-budgets.json"), "utf8"),
) as { cold: Record<string, number>; move: Record<string, number> };

/** Each page's address, as the frame moves to it (the hash the shell still takes and moves to its path). */
const ADDRESS: Record<string, string> = {
  today: "/#/today",
  inbox: "/#/inbox",
  people: "/#/clients",
  calendar: "/#/calendar",
  leads: "/#/clients/leads",
  campaigns: "/#/campaigns/sequences",
  reports: "/#/reports",
  live: "/#/live",
  conversations: "/#/conversations",
};
/** The sidebar's place each moved-to page is pressed by. */
const PLACE: Record<string, string> = { inbox: "inbox", people: "people", calendar: "calendar", reports: "reports" };

interface Drawn {
  page: string;
  ms: number;
  part: string | null;
}

/** The READY measures the page has said so far: the page's own (no part), with the time each took. */
const readies = (page: Page): Promise<Drawn[]> =>
  page.evaluate(() =>
    (performance.getEntriesByType("measure") as PerformanceMeasure[]).flatMap((m) => {
      const s = (m.detail as { speed?: { name?: string; page?: string; part?: string } } | null)?.speed;
      return s?.name === "READY" ? [{ page: s.page ?? "", part: s.part ?? null, ms: Math.round(m.duration) }] : [];
    }),
  );

/** The page's own READY, once it has said it. */
async function drawnIn(page: Page, name: string, after = 0): Promise<number> {
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

test.describe("each page is drawn with its rows within its budget", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  for (const [name, budget] of Object.entries(BUDGETS.cold)) {
    test(`${name}, cold: within ${budget} ms`, async ({ browser }) => {
      const page = await (await browser.newContext()).newPage();
      await signIn(page);
      await page.goto(ADDRESS[name]);
      const ms = await drawnIn(page, name);
      expect(ms, `${name} drawn with its rows ${ms} ms into a cold load`).toBeLessThanOrEqual(budget);
    });
  }

  for (const [name, budget] of Object.entries(BUDGETS.move)) {
    test(`${name}, a move from Today: within ${budget} ms`, async ({ browser }) => {
      const page = await (await browser.newContext()).newPage();
      await signIn(page);
      await page.goto(ADDRESS.today);
      await drawnIn(page, "today");
      await page.waitForLoadState("networkidle");
      const before = (await readies(page)).filter((r) => r.page === name && !r.part).length;
      await page.locator(`.sidebar [data-nav="${PLACE[name]}"]`).first().click();
      const ms = await drawnIn(page, name, before);
      expect(ms, `${name} drawn with its rows ${ms} ms after the press`).toBeLessThanOrEqual(budget);
    });
  }
});
