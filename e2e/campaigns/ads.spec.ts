import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";
import { V0 } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/words-page.ts";
import { firstTouchOf } from "../../apps/dashboard/src/surfaces/campaigns/ads/model/page-v0.ts";
import { ASK_ADS_VIEW } from "../../packages/contracts/src/ask/context";

/**
 * Campaigns › Ads in a real browser. The node suite draws every part of this page on a stub React, and none of that opens
 * the page's chunks: a word imported from the wrong entry of contracts passed the typecheck, the lint and every test, and
 * the page did not load (6 Nov 2026). So this runs the page as it ships, on every part that loads on demand.
 *
 * Whether Ads is drawn is the server's one answer on the settings read (`ads`: the edge offers it here, or the workspace
 * holds an ad account). The suite's stack has no edge to offer it, and connecting an account would be a write the page
 * does not need: the answer is drawn over the settings read here, so the real routes, the real report and the real page
 * run and nothing is written. The suite's workspace holds no ad account, so the page is the one with nothing connected.
 * What the workspace's counts are is the report's to say: a spec reads the answer the page was given and holds the page
 * to it, so a quiet or a busy month passes alike.
 */
const PEOPLE_READ = /\/api\/v1\/reports\/people\?/;

/**
 * The settings read says Ads is drawn here, or not, whatever the server answered: asked alone, and as its line where a
 * page's first reads (GET open) or the rest of a load's (GET open/rest) come as one answer, a line a read
 * (server/workspace/page-open.ts). Where a page reads settings in the rest, as Connections does, its own request is none.
 */
async function adsHere(page: Page, on: boolean) {
  await page.route("**/api/v1/settings?*", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.data.ads = on;
    await route.fulfill({ response: res, json });
  });
  await page.route(
    (url) => /^\/api\/v1\/open(\/rest)?$/.test(url.pathname),
    async (route) => {
      const res = await route.fetch();
      const lines = (await res.text()).split("\n").map((raw) => {
        if (!raw.trim()) return raw;
        const line = JSON.parse(raw);
        if (line.k !== "settings" || line.s !== 200 || !line.b?.data) return raw;
        line.b.data.ads = on;
        return JSON.stringify(line);
      });
      await route.fulfill({ response: res, body: lines.join("\n") });
    },
  );
}

/** What the page drew from its first script: every test id, as they first appear. */
const RECORD = `(() => {
  const log = { seen: [] };
  window.__adsLoad = log;
  const look = () => {
    for (const el of document.querySelectorAll("[data-testid]")) {
      const id = el.getAttribute("data-testid");
      if (!log.seen.includes(id)) log.seen.push(id);
    }
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
})();`;
interface Load {
  seen: string[];
}
const loaded = (page: Page) => page.evaluate(() => (window as unknown as { __adsLoad: Load }).__adsLoad);

/** Every read of the report the page makes, as it leaves. */
function readsOfTheReport(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (r) => {
    if (PEOPLE_READ.test(r.url())) asked.push(r.url());
  });
  return asked;
}

/** What the page threw: a chunk that fails to load, or a word its entry does not hold, throws here and nowhere else. */
function thrown(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test.describe("Campaigns › Ads, nothing connected", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await adsHere(page, true);
  });
  // A read the page starts as a test ends finds its answer gone: that is nothing of the test's.
  test.afterEach(({ page }) => page.unrouteAll({ behavior: "ignoreErrors" }));

  test("a cold load opens on what is true: no other page first, and the numbers are the report's own", async ({
    page,
  }) => {
    const errors = thrown(page);
    const asked = readsOfTheReport(page);
    // Sequences' list is none of this page's reads, and the document's head starts none of it for this address. Campaigns
    // fetches it ahead of need, for a press on its tab, and only once this page's own read is in (home/route.tsx
    // useViewsAhead, ads/first-read.ts): what this holds is the order.
    let reportIn = false;
    const early: string[] = [];
    page.on("response", (r) => {
      if (PEOPLE_READ.test(r.url())) reportIn = true;
    });
    page.on("request", (r) => {
      if (/\/api\/v1\/sequences\?/.test(r.url()) && !reportIn) early.push(r.url());
    });
    await page.addInitScript(RECORD);
    const report = page.waitForResponse((r) => PEOPLE_READ.test(r.url()));
    await page.goto("/#/campaigns/ads");
    await expect(page.getByTestId("ads-v0")).toBeVisible();
    const answer = (await (await report).json()) as { data: { series: Parameters<typeof firstTouchOf>[0] } };
    await expect(page.getByTestId("ads-v0-reading")).toBeHidden();

    const hero = page.getByTestId("ads-v0");
    const rows = firstTouchOf(answer.data.series)?.rows ?? [];
    for (const row of rows) {
      await expect(hero).toContainText(row.label);
      await expect(hero).toContainText(String(row.n));
    }
    if (rows.length === 0) await expect(page.getByTestId("ads-v0-nobody")).toHaveText(V0.nobodyNew);

    // The ad account's card stands beside the hero, whether or not Connect is offered here.
    await expect(page.getByTestId("ads-conn")).toBeVisible();
    expect(asked, "the report is read once").toHaveLength(1);
    expect(
      early,
      "and Sequences' list, which the page does not draw, is never read before the page's own read is in",
    ).toEqual([]);
    expect(new URL(asked[0] ?? "http://x").searchParams.get("period")).toBe("30d");

    const load = await loaded(page);
    // Before the page stood, nothing of Sequences; after it Sequences may be drawn hidden, ahead of its press.
    const stood = load.seen.indexOf("ads-v0");
    expect(stood, "the page stood").toBeGreaterThanOrEqual(0);
    expect(
      load.seen.slice(0, stood).filter((id) => id.startsWith("sq-")),
      "nothing of Sequences was drawn first",
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a read that fails says so and offers again, and never says nobody came", async ({ page }) => {
    await page.route(PEOPLE_READ, (route) =>
      route.fulfill({ status: 500, json: { ok: false, error: { message: "refused here" } } }),
    );
    await page.goto("/#/campaigns/ads");
    await expect(page.getByTestId("ads-v0-failed")).toContainText(V0.notRead);
    await expect(page.getByTestId("ads-v0")).not.toContainText(V0.emptyLead);
    await expect(page.getByTestId("ads-v0-nobody")).toBeHidden();
    await page.unroute(PEOPLE_READ);
    await page.getByTestId("ads-v0-again").click();
    await expect(page.getByTestId("ads-v0-failed")).toBeHidden();
    await expect(page.getByTestId("ads-v0-reading")).toBeHidden();
  });

  test("every part that loads on demand loads: New ad, Reports' lens and the card in Connections", async ({ page }) => {
    const errors = thrown(page);
    await page.goto("/#/campaigns/ads");
    await expect(page.getByTestId("ads-v0")).toBeVisible();
    await expect(page.getByTestId("ads-conn")).toBeVisible();

    await page.goto("/#/campaigns/ads:new");
    await expect(page.getByTestId("ads-new")).toBeVisible();
    await expect.poll(() => routeOf(page.url())).toBe("campaigns/ads:new");
    await page.goBack();
    await expect(page.getByTestId("ads-new")).toBeHidden();

    await page.goto("/#/reports/ads");
    await expect(page.getByTestId("ads-lens-live")).toBeVisible();
    await expect(page.getByTestId("ads-lens-none")).toBeVisible();

    await page.goto("/#/settings/integrations");
    await expect(page.getByTestId("conn-ads-real")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("AI is told what the page shows, in a word and no row, and matches questions about ads as they are typed; no model is asked", async ({
    page,
  }) => {
    const errors = thrown(page);
    const told: { surface?: string; route?: string; view?: string; rows?: unknown[] }[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/v1\/ask\/warm(\?|$)/.test(r.url())) told.push(r.postDataJSON());
    });
    const warmed = page.waitForResponse((r) => /\/api\/v1\/ask\/warm(\?|$)/.test(r.url()));
    await page.goto("/#/campaigns/ads");
    await expect(page.getByTestId("ads-v0")).toBeVisible();
    await page.getByTestId("ads-ask-door").click();
    await expect.poll(() => told.at(-1)?.view).toBe(ASK_ADS_VIEW.today);
    expect(told.at(-1)?.surface).toBe("campaigns");
    expect(told.at(-1)?.rows, "nothing of Sequences").toEqual([]);
    expect((await warmed).ok(), "the server reads the page for it").toBe(true);
    // The page's questions are no chips at rest (they come from a table: Ruben, 17 Nov 2026); typed, they match, about ads.
    await expect(page.getByText("Can I run an ad yet?")).toBeHidden();
    await page.getByTestId("ask-input").fill("an ad");
    await expect(page.getByText("Can I run an ad yet?")).toBeVisible();
    await expect(page.getByText("Set up my campaigns")).toBeHidden();
    await expect(page.getByPlaceholder("What should go out?")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("it opens on what is true and fits the width", async ({ page }) => {
      const errors = thrown(page);
      await page.goto("/#/campaigns/ads");
      await expect(page.getByTestId("ads-v0")).toBeVisible();
      await expect(page.getByTestId("ads-v0-reading")).toBeHidden();
      await expect(page.getByTestId("ads-conn")).toBeVisible();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, "no sideways scroll").toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  });
});

test.describe("Campaigns › Ads, where Ads is not drawn", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("an Ads address is Content's Made, where Ads would be, and nothing of Ads is drawn or read", async ({
    page,
  }) => {
    await signIn(page);
    await adsHere(page, false);
    const asked = readsOfTheReport(page);
    await page.addInitScript(RECORD);
    await page.goto("/#/campaigns/ads");
    // Campaigns in three tabs (decision 0147): Ads is the last of Made's views, so where it is not drawn its address is Made.
    await expect(page.getByTestId("content-page")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const load = await loaded(page);
    expect(load.seen.filter((id) => id.startsWith("ads-"))).toEqual([]);
    expect(asked).toEqual([]);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
