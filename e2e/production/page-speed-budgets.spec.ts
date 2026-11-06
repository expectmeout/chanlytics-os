import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { placeRow } from "../shell/places";
import { drawnIn, timesDrawn } from "../shell/ready";

/**
 * Each page is drawn with its rows within its budget, on a cold load and on a move (the page-open PRD of 3 Nov 2026, L9,
 * NFR3). The page says when it was drawn (READY, client/page-speed.ts), as a measure on the page's own clock carrying the
 * report the field data keeps; this reads those, so the nightly holds the same number the back office shows, and fails a
 * page past its line in tooling/scripts/tests/baselines/page-speed-budgets.json. Every other load spec proves that nothing
 * moves once drawn; none said how long the drawing took.
 *
 * Here, not on the nightly's own stack: a copy's timings say nothing about a customer's. And so it asks little of
 * production: a cold open is 233 database reads (measured 6 Nov 2026), so a night opens four pages cold, the ones most
 * opened, and takes every move on one signed-in page. The field data holds the other pages' cold loads.
 *
 * A fresh context is a first load, as after every deploy: no cache, no warm. Each page is read once; the line has a fifth of
 * room over the week it was set from, so a slow runner's one load is not a regression.
 */
const BUDGETS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../tooling/scripts/tests/baselines/page-speed-budgets.json"), "utf8"),
) as { cold: Record<string, number>; move: Record<string, number> };

/** The pages a night opens cold, and each one's address, as the frame moves to it (the hash the shell still takes). */
const COLD: Record<string, string> = {
  today: "/#/today",
  inbox: "/#/inbox",
  people: "/#/clients",
  leads: "/#/clients/leads",
};
/** The sidebar's place each moved-to page is pressed by. */
const PLACE: Record<string, string> = { inbox: "Inbox", people: "People", calendar: "Calendar", reports: "Reports" };

test.describe("each page is drawn with its rows within its budget", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  for (const [name, address] of Object.entries(COLD)) {
    const budget = BUDGETS.cold[name];
    test(`${name}, cold: within ${budget} ms`, async ({ browser }) => {
      const page = await (await browser.newContext()).newPage();
      await signIn(page);
      await page.goto(address);
      const ms = await drawnIn(page, name);
      expect(ms, `${name} drawn with its rows ${ms} ms into a cold load`).toBeLessThanOrEqual(budget);
    });
  }

  test.describe("a move from Today", () => {
    test.describe.configure({ mode: "serial" });
    let page: Page;
    let onToday = true;

    test.beforeAll(async ({ browser }) => {
      page = await (await browser.newContext()).newPage();
      await signIn(page);
      await page.goto(COLD.today);
      await drawnIn(page, "today");
      await page.waitForLoadState("networkidle");
    });

    for (const [name, budget] of Object.entries(BUDGETS.move)) {
      test(`${name}, a move from Today: within ${budget} ms`, async () => {
        if (!onToday) {
          const seen = await timesDrawn(page, "today");
          await placeRow(page, "Today").click();
          await drawnIn(page, "today", seen);
        }
        const before = await timesDrawn(page, name);
        await placeRow(page, PLACE[name]).click();
        onToday = false;
        const ms = await drawnIn(page, name, before);
        expect(ms, `${name} drawn with its rows ${ms} ms after the press`).toBeLessThanOrEqual(budget);
      });
    }
  });
});
