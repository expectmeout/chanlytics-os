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
 * page past its line in tests/baselines/page-speed-budgets.json. Every other load spec proves that nothing
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
  fs.readFileSync(path.join(__dirname, "../../tests/baselines/page-speed-budgets.json"), "utf8"),
) as { cold: Record<string, number>; move: Record<string, number> };

/** The pages a night opens cold, and each one's address, as the frame moves to it (the hash the shell still takes). */
const COLD = {
  today: "/#/today",
  inbox: "/#/inbox",
  people: "/#/clients",
  leads: "/#/clients/leads",
};
/**
 * What was measured, said on every run, a pass as well as a fail: each line is set from a week of these (the baseline's
 * note: the first week's p75 plus a fifth), and a night that passed kept none. The week the lines were to be lowered from, 3
 * to 10 Nov 2026, left nothing to read, and a browser a suite drives is no customer, so the field data holds none of it
 * either (client/page-speed-rules.ts notACustomer). One line in the run's log, in one shape, and on the report beside its test.
 */
function measured(kind: "cold" | "move", name: string, ms: number, budget: number): void {
  test.info().annotations.push({ type: "drawn", description: `${ms} ms of ${budget}` });
  console.log(`page-speed ${kind} ${name}: ${ms} ms of ${budget}`);
}

/** The sidebar's place each moved-to page is pressed by. */
const PLACE: Record<string, string> = { inbox: "Inbox", people: "People", calendar: "Calendar", reports: "Reports" };

test.describe("each page is drawn with its rows within its budget", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  for (const [name, address] of Object.entries(COLD)) {
    const budget = BUDGETS.cold[name] ?? 0;
    test(`${name}, cold: within ${budget} ms`, async ({ browser }) => {
      const page = await (await browser.newContext()).newPage();
      await signIn(page);
      await page.goto(address);
      const ms = await drawnIn(page, name);
      measured("cold", name, ms, budget);
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
        await placeRow(page, PLACE[name] ?? name).click();
        onToday = false;
        const ms = await drawnIn(page, name, before);
        measured("move", name, ms, budget);
        expect(ms, `${name} drawn with its rows ${ms} ms after the press`).toBeLessThanOrEqual(budget);
      });
    }
  });
});
