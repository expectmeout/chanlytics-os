import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute, routeOf } from "../address";
import { apiGet } from "../workspace";
import type { SequenceRecordDto, SequencesPageDto } from "../../packages/contracts/src/index";

/**
 * What opens where it was pressed (the Campaigns wiring review's rule C), in a browser: until the framework's rating of
 * 19 Oct 2026 it was proved only over a made-up window. A run waiting for an OK opens over the Inbox and over Today, a
 * step's message over its sequence, the emails handed to you in their sheet over the Inbox, Get their yes over People's list and
 * closed back to it, and New's choices replace the address rather than stack it. A sheet over a page is one entry in the
 * history, so Back closes it and leaves the page as it was; on a phone the tab bar stands down while it is open.
 * Nothing is approved, sent or written: a row is pressed on its name, never on its verb, whose Approve would send.
 */

/** GET sequences, as the list reads it. */
async function readList(page: Page): Promise<SequencesPageDto> {
  const r = await apiGet(page, "/api/v1/sequences");
  expect(r.status()).toBe(200);
  return ((await r.json()) as { data: SequencesPageDto }).data;
}

/** The thing open over the page, by the address's own word (contracts shell/see-over.ts), or null. */
const seeOf = (page: Page): string | null => new URL(page.url()).searchParams.get("see");
const entries = (page: Page): Promise<number> => page.evaluate(() => window.history.length);

/** The first row of a run waiting for an OK on a page's queue: a run's own, or the one row two or more fold into. */
const runRow = (page: Page) => page.getByTestId("brief-run-row").or(page.getByTestId("brief-runs-row")).first();

test.describe("Campaigns opens in place on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a run waiting for an OK opens over the Inbox and over Today: one entry, Back closes it, and the page is as it was", async ({
    page,
  }) => {
    const list = await readList(page);
    test.skip(list.sequences.flatMap((s) => s.needs.batches).length === 0, "no batch here waits for an OK");
    for (const [at, route] of [
      ["/#/inbox", /^inbox/],
      ["/#/today", /^today$/],
    ] as const) {
      await page.goto(at);
      const row = runRow(page);
      await expect(row).toBeVisible();
      const before = await entries(page);
      await row.locator(".cl-attn-who").click();
      await expect(page.getByTestId("see-run")).toBeVisible();
      expect(seeOf(page), at).toMatch(/^run:/);
      expect(routeOf(page.url()), at).toMatch(route);
      expect(await entries(page), `${at}: the run is one entry`).toBe(before + 1);
      // Its home is a press away, and the sheet says so.
      await expect(page.getByTestId("see-home")).toBeVisible();
      await page.goBack();
      await expect(page.getByTestId("see-run")).toHaveCount(0);
      expect(seeOf(page), at).toBeNull();
      await expect(runRow(page)).toBeVisible();
    }
  });

  test("the emails handed to you open as a sheet over the Inbox: one entry, Back puts it away", async ({ page }) => {
    await page.goto("/#/inbox");
    await expect(page).toHaveURL(atRoute(/^inbox/));
    const row = page.getByTestId("brief-to-send");
    // The Inbox's Needs you draws once its reads are in: a row of runs, To send's or none.
    await page.waitForLoadState("networkidle");
    test.skip((await row.count()) === 0, "no email here is handed to its owner to send");
    const before = await entries(page);
    await row.locator(".cl-attn-who").click();
    // A sheet over the page, as a run is (Ruben, 20 Oct 2026: never a list unfolded under its row).
    await expect(page.getByTestId("see-to-send").getByTestId("bc-to-send-body")).toBeVisible();
    expect(routeOf(page.url())).toMatch(/^inbox/);
    expect(seeOf(page)).toBe("to-send");
    expect(await entries(page), "the list is one entry").toBe(before + 1);
    await expect(page.getByTestId("inbox-runs-waiting").getByTestId("bc-to-send-body")).toHaveCount(0);
    await page.goBack();
    await expect(page.getByTestId("see-to-send")).toHaveCount(0);
    expect(seeOf(page)).toBeNull();
  });

  test("a step's message opens over its sequence, Back closes it, and its home is Messages open on it", async ({
    page,
  }) => {
    const list = await readList(page);
    let found: { id: string; place: number; name: string } | null = null;
    for (const s of list.sequences.filter((x) => x.starts !== "leads").slice(0, 8)) {
      const r = await apiGet(page, `/api/v1/sequences/${s.id}`);
      if (r.status() !== 200) continue;
      const rec = ((await r.json()) as { data: SequenceRecordDto }).data;
      const step = rec.steps.find((x) => x.template_name);
      if (step?.template_name) {
        found = { id: s.id, place: step.place, name: step.template_name };
        break;
      }
    }
    test.skip(!found, "no customer's sequence here sends a message");
    if (!found) return;
    await page.goto(`/#/campaigns/sequences/${found.id}`);
    await page.getByTestId(`sq-step-${found.place}`).click();
    const door = page.getByTestId(`sq-step-words-${found.place}-from`);
    await expect(door).toBeVisible();
    const before = await entries(page);
    await door.click();
    await expect(page.getByTestId("see-message")).toBeVisible();
    expect(seeOf(page)).toBe(`message:${found.name}`);
    expect(routeOf(page.url())).toMatch(new RegExp(`^campaigns/sequences/${found.id}`));
    expect(await entries(page)).toBe(before + 1);
    await page.goBack();
    await expect(page.getByTestId("see-message")).toHaveCount(0);
    expect(seeOf(page)).toBeNull();
    // Its one home: the Messages list open on it, its row lit.
    await door.click();
    await page.getByTestId("see-home").click();
    await expect(page).toHaveURL(atRoute(new RegExp(`^campaigns/messages/${found.name}$`)));
    await expect(page.getByTestId("see-message")).toHaveCount(0);
    await expect(page.getByTestId("template-pane")).toBeVisible();
  });

  test("Get their yes opens over People's list and closes to it: Back from there is never the sheet again", async ({
    page,
  }) => {
    await page.goto("/#/clients");
    await expect(page).toHaveURL(atRoute(/^clients$/));
    await page.goto("/#/clients/get-yes");
    const yes = page.getByTestId("bc-optin");
    await expect(yes).toBeVisible();
    await page.getByTestId("bc-optin-close").click();
    await expect(yes).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^clients$/));
    await page.goBack();
    await expect(page.getByTestId("bc-optin")).toHaveCount(0);
  });

  test("New's choices replace the address, never stack it: Close leaves New in one Back", async ({ page }) => {
    await page.goto("/#/campaigns/sequences/new");
    const pane = page.getByTestId("sq-new");
    await expect(pane).toBeVisible();
    const before = await entries(page);
    await pane.getByTestId("sq-new-on-date").click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences\/new:once$/));
    await page.getByTestId("sq-new-on-leads").click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences\/new:leads$/));
    await page.getByTestId("sq-new-on-moment").click();
    await expect(page).toHaveURL(atRoute(/^campaigns\/sequences\/new(:moment(:[^/]+)?)?$/));
    expect(await entries(page), "three choices, no new entry").toBe(before);
  });
});

test.describe("Campaigns opens in place on a phone", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the tab bar stands down while a run is over the Inbox, and is back once it closes", async ({ page }) => {
    const list = await readList(page);
    test.skip(list.sequences.flatMap((s) => s.needs.batches).length === 0, "no batch here waits for an OK");
    await page.goto("/#/inbox");
    const tabs = page.getByTestId("phone-tabs");
    await expect(tabs).toBeVisible();
    await runRow(page).locator(".cl-attn-who").click();
    await expect(page.getByTestId("see-run")).toBeVisible();
    await expect(tabs).toBeHidden();
    await page.goBack();
    await expect(page.getByTestId("see-run")).toHaveCount(0);
    await expect(tabs).toBeVisible();
  });
});
