import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { routeOf } from "../address";
import { CONNECT, EXAMPLE, V0, firstTouchOf } from "../../packages/contracts/src/ads/ads-page";

/**
 * Campaigns › Ads in a workspace's preview, in a real browser. The node suite draws every part of this page on a stub React, and
 * none of that opens the page's chunks: a word imported from the wrong entry of contracts passed the typecheck, the lint and every
 * test, and the page did not load (6 Nov 2026). So this runs the page as it ships, on every part that loads on demand.
 *
 * The suite's workspace has no Ads preview, and turning one on would be a write the page does not need: the flag is drawn over the
 * settings read here, so the real route, the real report and the real page run and nothing is written. Every press here stays in
 * the browser (the preview connects, spends and saves nothing). What the workspace's counts are is the report's to say: a spec reads
 * the answer the page was given and holds the page to it, so a quiet or a busy month passes alike.
 */
const NOTE = "ads-preview-note";
const PEOPLE_READ = /\/api\/v1\/reports\/people\?/;

/** The settings read says the Ads preview is on, or off, whatever the workspace's own config holds. */
async function adsPreview(page: Page, on: boolean) {
  await page.route("**/api/v1/settings?*", async (route) => {
    const res = await route.fetch();
    const json = await res.json();
    json.data.config = { ...json.data.config, features: { ...json.data.config?.features, ads_preview: on } };
    await route.fulfill({ response: res, json });
  });
}

/** What the page drew from its first script: every example it stood on, and every test id, as they first appear. */
const RECORD = `(() => {
  const log = { examples: [], seen: [] };
  window.__adsLoad = log;
  const look = () => {
    for (const el of document.querySelectorAll("[data-example]")) {
      const example = el.getAttribute("data-example");
      if (!log.examples.includes(example)) log.examples.push(example);
    }
    for (const el of document.querySelectorAll("[data-testid]")) {
      const id = el.getAttribute("data-testid");
      if (!log.seen.includes(id)) log.seen.push(id);
    }
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-example"] });
})();`;
interface Load {
  examples: string[];
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

const example = (page: Page) => page.getByTestId("campaigns-ads").getAttribute("data-example");

/** The Example pill's menu, as a person presses it: the kit's Menu, a popup on a desk and a sheet on a phone. */
async function chooseExample(page: Page, name: string) {
  await page.getByTestId("ads-example").click();
  await page.getByRole("menuitemradio", { name }).click();
}

test.describe("Campaigns › Ads, a workspace's preview", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await adsPreview(page, true);
  });
  // A read the page starts as a test ends finds its answer gone: that is nothing of the test's.
  test.afterEach(({ page }) => page.unrouteAll({ behavior: "ignoreErrors" }));

  test("a cold load opens on what is true: no sample, no other page first, and the numbers are the report's own", async ({
    page,
  }) => {
    const errors = thrown(page);
    const asked = readsOfTheReport(page);
    const lists: string[] = [];
    page.on("request", (r) => {
      if (/\/api\/v1\/sequences\?/.test(r.url())) lists.push(r.url());
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

    await expect(page.getByTestId(NOTE)).toHaveText(`${EXAMPLE.preview.word} ${EXAMPLE.preview.today}`);
    await expect(page.getByTestId("ads-example")).toContainText(EXAMPLE.preview.pill);
    await expect(page.getByTestId("ads-platform-meta")).toBeVisible();
    expect(asked, "the report is read once").toHaveLength(1);
    expect(lists, "and Sequences' list, which the page does not draw, is not read for it").toEqual([]);
    expect(new URL(asked[0] ?? "http://x").searchParams.get("period")).toBe("30d");

    const load = await loaded(page);
    expect(load.examples, "it never stood on the sample").toEqual(["v0"]);
    expect(
      load.seen.filter((id) => /^(sq-|ads-figures|ads-ledger)/.test(id)),
      "nothing of Sequences or the sample was drawn first",
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("the pill, pressed right after load, walks to an example and back; a kept example reads no report", async ({
    page,
  }) => {
    const errors = thrown(page);
    const asked = readsOfTheReport(page);
    await page.goto("/#/campaigns/ads");
    // As a person presses it: the page is there, whether or not the counts have landed.
    await expect(page.getByTestId("ads-example")).toBeVisible();
    await chooseExample(page, EXAMPLE.choices.running);
    await expect(page.getByTestId("ads-ledger")).toBeVisible();
    await expect(page.getByTestId("ads-figures")).toBeVisible();
    expect(await example(page)).toBe("running");
    await expect(page.getByTestId(NOTE)).toHaveText(`${EXAMPLE.preview.word} ${EXAMPLE.preview.said}`);
    await expect(page.getByTestId("ads-example")).toContainText(EXAMPLE.pill);

    const before = asked.length;
    await page.reload();
    await expect(page.getByTestId("ads-ledger")).toBeVisible();
    expect(await example(page), "the tab keeps the choice").toBe("running");
    expect(asked.length, "a page about to show an example reads no report").toBe(before);

    await chooseExample(page, EXAMPLE.preview.todayChoice);
    await expect(page.getByTestId("ads-v0")).toBeVisible();
    await expect(page.getByTestId("ads-v0-reading")).toBeHidden();
    expect(asked.length, "today's counts are read again").toBe(before + 1);
    await expect(page.getByTestId("ads-ledger")).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("ads-v0")).toBeVisible();
    expect(await example(page), "and today keeps nothing").toBe("v0");
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

  test("every part of the sample that loads on demand loads: an ad's drawer, Results, New ad and Reports' lens", async ({
    page,
  }) => {
    const errors = thrown(page);
    await page.goto("/#/campaigns/ads");
    await chooseExample(page, EXAMPLE.choices.running);

    await page.getByTestId("ads-row-open").first().click();
    await expect(page.getByTestId("ads-detail")).toBeVisible();
    await expect.poll(() => routeOf(page.url())).toMatch(/^campaigns\/ads:ad:/);
    await page.goBack();
    await expect(page.getByTestId("ads-detail")).toBeHidden();

    await page.getByTestId("ads-results-door").click();
    await expect(page.getByTestId("ads-results")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("ads-results")).toBeHidden();

    await page.getByTestId("ads-head-new").click();
    await expect(page.getByTestId("ads-new-body")).toBeVisible();
    await page.getByRole("button", { name: /^Next: the ad/ }).click();
    await expect(page.getByTestId("ads-new-files-door")).toBeVisible();
    await page.goBack();
    await page.goBack();

    await page.goto("/#/reports/ads");
    await expect(page.getByTestId("ads-lens")).toBeVisible();
    await expect(page.getByTestId("ads-lens").getByTestId(NOTE)).toHaveText(
      `${EXAMPLE.preview.word} ${EXAMPLE.preview.said}`,
    );
    expect(errors).toEqual([]);
  });

  test("Connections says no account is connected, and Connect, pressed, says it connected nothing", async ({
    page,
  }) => {
    const errors = thrown(page);
    const asked = readsOfTheReport(page);
    await page.goto("/#/settings/integrations");
    const card = page.getByTestId("connections-ads");
    await expect(card).toBeVisible();
    await expect(card.getByTestId(NOTE)).toHaveText(`${EXAMPLE.preview.word} ${EXAMPLE.preview.connectLater}`);
    for (const platform of ["meta", "google", "tiktok"]) {
      await expect(page.getByTestId(`ad-state-${platform}`)).toHaveText(CONNECT.off);
    }
    await page.getByTestId("ad-connect-meta").click();
    await expect(page.getByText(CONNECT.signIn("meta"))).toBeVisible();
    await expect(page.getByTestId("ad-state-meta")).toHaveText(CONNECT.off);
    expect(asked, "the card has no counts to read").toEqual([]);
    expect(errors).toEqual([]);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("it opens on what is true and fits the width; the menu says which row is yours", async ({ page }) => {
      const errors = thrown(page);
      await page.goto("/#/campaigns/ads");
      await expect(page.getByTestId("ads-v0")).toBeVisible();
      await expect(page.getByTestId("ads-v0-reading")).toBeHidden();
      await expect(page.getByTestId(NOTE)).toBeVisible();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, "no sideways scroll").toBeLessThanOrEqual(0);
      await page.getByTestId("ads-example").click();
      await expect(page.getByRole("menuitemradio", { name: EXAMPLE.preview.todayChoice })).toBeVisible();
      await expect(page.getByText(EXAMPLE.preview.menuNote)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test("Connections' note is drawn where a card's second line is not", async ({ page }) => {
      await page.goto("/#/settings/integrations");
      const card = page.getByTestId("connections-ads");
      await expect(card.getByTestId(NOTE)).toBeVisible();
      await expect(page.getByTestId("ad-state-meta")).toBeAttached();
    });
  });
});

test.describe("Campaigns › Ads, where the preview is off", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("an Ads address is Sequences, and nothing of Ads is drawn or read", async ({ page }) => {
    await signIn(page);
    await adsPreview(page, false);
    const asked = readsOfTheReport(page);
    await page.addInitScript(RECORD);
    await page.goto("/#/campaigns/ads");
    await expect(page.getByTestId("sq-page")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const load = await loaded(page);
    expect(load.examples).toEqual([]);
    expect(load.seen.filter((id) => id.startsWith("ads-"))).toEqual([]);
    expect(asked).toEqual([]);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });
});
