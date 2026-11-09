import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { orIfItMoved } from "./ready";

/**
 * Nothing lands over what a page has drawn (docs/architecture.md, "How a page opens"; the page-open PRD of 3 Nov 2026, L9):
 * once the page says it is drawn with its rows (READY, client/page-speed.ts), what came after it may not move what stands.
 * Today, the Inbox, People, Settings and Campaigns each have a load spec of their own that names their parts; the six pages
 * here had none. This one asks them all the browser's own question: the layout shifts painted after the page's READY,
 * not caused by an input, add up to no more than a hair (SHIFT_MAX), on a cold load in a fresh context.
 */
const SHIFT_MAX = 0.02;
const PAGES: Record<string, string> = {
  calendar: "/#/calendar",
  leads: "/#/clients/leads",
  reports: "/#/reports",
  live: "/#/live",
  conversations: "/#/conversations",
  person: "/#/clients",
};

/** From the document's first script: every painted shift with when it was, and each READY the page says. */
const RECORD = `(() => {
  const log = { shifts: [] };
  window.__holdStill = log;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) log.shifts.push({ at: e.startTime, value: e.value });
  }).observe({ type: "layout-shift", buffered: true });
})();`;

test.describe("a page holds still once it is drawn with its rows", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  for (const [name, address] of Object.entries(PAGES)) {
    test(`${name}: nothing moves after it is drawn`, async ({ browser }) => {
      const page = await (await browser.newContext()).newPage();
      await page.addInitScript(RECORD);
      await signIn(page);
      if (name === "person") {
        // A person's page: the first person People lists, opened by its address.
        await page.goto(address);
        await page.waitForLoadState("networkidle");
        const href = await page.locator('a[href*="/people/"]').first().getAttribute("href");
        test.skip(!href, "this workspace has nobody to open");
        const fresh = await (await browser.newContext()).newPage();
        await fresh.addInitScript(RECORD);
        await signIn(fresh);
        await fresh.goto(href!);
        await expectStill(fresh, "person");
        return;
      }
      await page.goto(address);
      await expectStill(page, name);
    });
  }
});

async function expectStill(page: import("@playwright/test").Page, name: string): Promise<void> {
  let drawnAt = -1;
  await expect
    .poll(
      async () => {
        drawnAt = await orIfItMoved(
          page.evaluate(() => {
            const ready = (performance.getEntriesByType("measure") as PerformanceMeasure[]).find(
              (m) => (m.detail as { speed?: { name?: string; part?: string } } | null)?.speed?.name === "READY",
            );
            return ready ? ready.startTime + ready.duration : -1;
          }),
          -1,
        );
        return drawnAt >= 0;
      },
      { timeout: 30_000, message: `${name} says it was drawn` },
    )
    .toBe(true);
  // Long enough for everything the page reads after its first draw to land: the boot's second pass, the feed's catch-up.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_500);
  const after = await page.evaluate(
    (at) =>
      (
        (window as unknown as { __holdStill: { shifts: Array<{ at: number; value: number }> } }).__holdStill.shifts ??
        []
      )
        .filter((s) => s.at > at)
        .reduce((sum, s) => sum + s.value, 0),
    drawnAt,
  );
  expect(after, `${name}: what moved after it was drawn`).toBeLessThanOrEqual(SHIFT_MAX);
}
