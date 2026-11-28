import { test, expect, type Page, type Route } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * Content never waits long for Ads, in a real browser (the review of 28 Nov 2026, R2.9).
 *
 * Where a workspace runs ads, a load of Campaigns › Content holds its first draw for the two reads Ads opens on, so the Ads
 * tab says its figure with Made's and the Library's (Ruben, 26 Nov 2026; bridge/surfaces/ads-first-reads.ts). Both are
 * database reads started with the page, and nothing bounded them but the wait every first draw has, three seconds: a slow
 * day held Content's first screen that long for a figure on a tab. It waits half a second now.
 *
 * This is the measure, on the suite's own stack: the two reads are held back by the test, and the time from the answer that
 * says Ads is drawn here to Content's lists standing is read off the page's own clock. With the reads held it is the half
 * second and a draw; before the cap it was the three seconds. Then the reads are let go, and the figure follows.
 *
 * Whether Ads is drawn is the server's one answer on the settings read; the suite's stack has no edge to offer it and its
 * workspace holds no ad account, so that answer and the two reads' are drawn over the real routes here (as ads.spec.ts
 * draws the first), and nothing is written.
 */
const ADS_READ = /^\/api\/v1\/ads\/(account|page)$/;
/** More than the half second and a draw on a slow runner, and well under the three seconds it was. */
const HELD_AT_MOST_MS = 2000;

/** An ad account that is connected and holds no ads: the Ads tab's figure is 0. Made-up, and never written. */
const ACCOUNT = {
  offered: true,
  can_connect: true,
  meta: {
    id: "acc-1",
    external_id: "1200000000000042",
    business_id: null,
    status: "connected",
    standing: "active",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    page_name: "Harbor Studio",
    connected_at: "2026-11-18T15:00:00Z",
    revoked_at: null,
    disconnected_at: null,
    read_at: "2026-11-20T14:00:00Z",
    read_failed: false,
    spend_limit_minor: null,
    instagram_handle: null,
    ai_number: "+15550100142",
    checks: ["account-active", "payment", "page-linked"].map((id) => ({ id, ok: true })),
    whatsapp_link: "unsaid",
    can_pause: true,
    reads_instagram: true,
    choices: [],
  },
};
const ADS = {
  account: {
    status: "connected",
    name: "Harbor ads",
    currency: "USD",
    timezone: "America/New_York",
    read_at: "2026-11-20T14:00:00Z",
    read_failed: false,
    revoked_at: null,
    disconnected_at: null,
    ready: true,
  },
  window: { from: "2026-10-22", to: "2026-11-20" },
  today: "2026-11-20",
  ads: [],
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: true,
  stopped_at: null,
  needs_you: { count: 0, people: [] },
};

/**
 * The settings read says Ads is drawn here: asked alone, and as its line where a load's first reads come as one answer.
 * `at` is when that answer was first handed to the page, by this machine's clock (the page's own runs on the same one).
 */
async function adsDrawnHere(page: Page) {
  const said: { at: number | null } = { at: null };
  await page.route("**/api/v1/settings?*", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.data.ads = true;
    await route.fulfill({ response: res, json });
    said.at ??= Date.now();
  });
  await page.route(
    (url) => /^\/api\/v1\/open(\/rest)?$/.test(url.pathname),
    async (route) => {
      const res = await route.fetch();
      let carried = false;
      const lines = (await res.text()).split("\n").map((raw) => {
        if (!raw.trim()) return raw;
        const line = JSON.parse(raw);
        if (line.k !== "settings" || line.s !== 200 || !line.b?.data) return raw;
        line.b.data.ads = true;
        carried = true;
        return JSON.stringify(line);
      });
      await route.fulfill({ response: res, body: lines.join("\n") });
      if (carried) said.at ??= Date.now();
    },
  );
  return said;
}

/** Ads' two reads, answered with the made-up account once `until` settles; how many are waiting meanwhile. */
async function adsReads(page: Page, until: Promise<void>) {
  const state = { waiting: 0 };
  await page.route(
    (url) => ADS_READ.test(url.pathname),
    async (route: Route) => {
      state.waiting += 1;
      await until;
      state.waiting -= 1;
      const account = new URL(route.request().url()).pathname.endsWith("/account");
      await route.fulfill({ json: { ok: true, data: account ? ACCOUNT : ADS } });
    },
  );
  return state;
}

/** When each test id first stood, by the page's own clock, and whether the Ads tab said a figure as Made's tab first did. */
const RECORD = `(() => {
  const log = { seen: {}, adsFigureWithMade: null };
  window.__contentLoad = log;
  const look = () => {
    for (const el of document.querySelectorAll("[data-testid]")) {
      const id = el.getAttribute("data-testid");
      if (log.seen[id] === undefined) log.seen[id] = Math.round(performance.now());
    }
    if (log.adsFigureWithMade === null && document.querySelector('[data-testid="cnv-list-made"]'))
      log.adsFigureWithMade = !!document.querySelector('[data-testid="cnv-list-ads"] .subtab-count');
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });
})();`;
interface Load {
  seen: Record<string, number>;
  adsFigureWithMade: boolean | null;
}
const loadOf = (page: Page) => page.evaluate(() => (window as unknown as { __contentLoad: Load }).__contentLoad);

/** When a test id first stood, by this machine's clock: the page's own clock, from the moment its document began. */
const stoodAt = (page: Page, id: string) =>
  page.evaluate((testid) => {
    const seen = (window as unknown as { __contentLoad: Load }).__contentLoad.seen[testid];
    return seen === undefined ? null : performance.timeOrigin + seen;
  }, id);

function thrown(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test.describe("Campaigns › Content, where the workspace runs ads", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  let settings: { at: number | null };
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    settings = await adsDrawnHere(page);
    await page.addInitScript(RECORD);
  });
  // A read the page starts as a test ends finds its answer gone: that is nothing of the test's.
  test.afterEach(({ page }) => page.unrouteAll({ behavior: "ignoreErrors" }));

  test("with Ads' two reads held back, Content's first screen stands in about half a second, and the figure follows", async ({
    page,
  }) => {
    const errors = thrown(page);
    let letGo = () => {};
    const reads = await adsReads(page, new Promise<void>((go) => (letGo = go)));
    await page.goto("/#/campaigns/content");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });

    await expect(page.getByTestId("cnv-list-made")).toBeVisible();
    expect(reads.waiting, "both of Ads' reads are still out as Content stands").toBe(2);
    const stood = await stoodAt(page, "cnv-list-made");
    expect(settings.at, "the settings read answered").not.toBeNull();
    expect(stood, "Made's tab was seen standing").not.toBeNull();
    const held = (stood ?? Infinity) - (settings.at ?? 0);
    test.info().annotations.push({ type: "Content held for Ads, ms", description: String(Math.round(held)) });
    // Said in the run's log too, where the before and the after are read side by side.
    console.log(`content-waits-for-ads: Content's first screen stood ${Math.round(held)} ms after the settings read`);
    expect(held, "Content's first screen held for Ads' reads").toBeLessThan(HELD_AT_MOST_MS);
    await expect(page.getByTestId("cnv-list-ads")).toBeVisible();
    expect((await loadOf(page)).adsFigureWithMade, "no figure to say yet").toBe(false);

    // The reads land: the Ads tab says its figure, and nothing Content drew is taken back.
    letGo();
    await expect(page.getByTestId("cnv-list-ads").locator(".subtab-count")).toHaveText("0", { timeout: 20_000 });
    await expect(page.getByTestId("cnv-list-made")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("with the reads in as they are asked, the Ads tab says its figure with Made's, at the first draw", async ({
    page,
  }) => {
    const errors = thrown(page);
    await adsReads(page, Promise.resolve());
    await page.goto("/#/campaigns/content");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    await expect(page.getByTestId("cnv-list-made")).toBeVisible();
    await expect(page.getByTestId("cnv-list-ads").locator(".subtab-count")).toHaveText("0");
    expect((await loadOf(page)).adsFigureWithMade, "the figure stood as Made's tab first did").toBe(true);
    expect(errors).toEqual([]);
  });
});
