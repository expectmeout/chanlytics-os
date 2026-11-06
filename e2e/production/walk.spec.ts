import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { activeWorkspace, scoped, apiGet } from "../workspace";
import { assertNothingInvented } from "../shell/invented";
import { placeRow } from "../shell/places";
import { drawnIn, timesDrawn } from "../shell/ready";

/**
 * Production, walked once, the way a person walks it: signed in, one page, a press at a time. The whole suite runs on a copy
 * of the commit every night (nightly-e2e.yml); this says the real deployment, its real database and its real edge answer
 * as that copy did, and it asks little of them: one cold open is 233 database reads (measured 6 Nov 2026), where the suite
 * on production was about 125,000 a night.
 *
 * It looks for what only production can say. A page thrown out of its own script is a failure here; a console error is not,
 * since a provider's script or a browser's own warning writes there too, and one that matters to a customer shows on the page.
 */
const STOPS: { name: string; press: (page: Page) => Locator }[] = [
  { name: "inbox", press: (page) => placeRow(page, "Inbox") },
  { name: "people", press: (page) => placeRow(page, "People") },
  {
    name: "leads",
    press: (page) => page.getByRole("navigation", { name: "Which people" }).getByRole("link", { name: "Leads" }),
  },
  { name: "calendar", press: (page) => placeRow(page, "Calendar") },
  { name: "campaigns", press: (page) => placeRow(page, "Campaigns") },
  { name: "reports", press: (page) => placeRow(page, "Reports") },
];

test.describe("production, walked once", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  let page: Page;
  const thrown: string[] = [];

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    page.on("pageerror", (error) => thrown.push(error.message));
    await signIn(page);
  });

  test("Today opens, drawn with its rows, nothing on it invented", async () => {
    await page.goto("/#/today");
    await drawnIn(page, "today");
    await assertNothingInvented(page, "today");
    expect(thrown).toEqual([]);
  });

  for (const stop of STOPS) {
    test(`a press reaches ${stop.name}, drawn with its rows, nothing on it invented`, async () => {
      const before = await timesDrawn(page, stop.name);
      await stop.press(page).click();
      await drawnIn(page, stop.name, before);
      await assertNothingInvented(page, stop.name);
      expect(thrown).toEqual([]);
    });
  }

  test("Settings opens, nothing on it invented", async () => {
    await page.goto("/#/admin/business");
    await page.waitForLoadState("networkidle");
    await assertNothingInvented(page, "settings");
    expect(thrown).toEqual([]);
  });

  test("the app says which commit it is", async ({ request }) => {
    const said = await (await request.get("/api/version")).json();
    expect(said.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  test("the calendar sweep on the edge refuses a call without the sweep key", async ({ request }) => {
    const res = await request.post("https://chanlytics-messaging.vercel.app/api/cron/calendar", { data: {} });
    expect([401, 503]).toContain(res.status());
  });

  // Here because a copy answers "Billing is only on the production dashboard." Read-only: the refusal opens no Stripe.
  test("Checkout is refused for a direct arrangement, and says so", async ({ baseURL }) => {
    const { data } = await (await apiGet(page, "/api/v1/billing")).json();
    test.skip(
      data.billing.account.mode !== "direct",
      "the live workspace pays by card; the refusal is for direct arrangements",
    );
    // Named, as the client names it. Unscoped, this POST was refused with a
    // 400 by the ambiguity guard and the spec read it as a billing failure.
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/billing/checkout", ws), {
      headers: { origin: baseURL!, "content-type": "application/json" },
      data: {},
    });
    const body = await res.json();
    // 409, exactly. STATUS_OF.direct = 409 on the edge (api/admin/billing.ts:30)
    // and the route maps a 409 through unchanged, so this is deterministic —
    // and the looser [403, 409, 503] it replaced would have swallowed the two
    // regressions worth catching: a 403 means the test account lost owner, a
    // 503 means the edge is unreachable. The body is in the message because a
    // bare status assertion threw away the sentence naming the refusal.
    expect(res.status(), `checkout answered ${res.status()}: ${JSON.stringify(body)}`).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("direct arrangement");
  });
});
