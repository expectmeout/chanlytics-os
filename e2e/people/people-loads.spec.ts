import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { apiGet } from "../workspace";

/**
 * People on a cold load draws as one page: "Reading…" where the list will stand, then the list, and nothing moves. Each of
 * these did, on production, before the People load review (28 Oct 2026): the frame's Reading… stood one draw and the page
 * drawn in its place said nothing until People was in, an empty pane for 100 to 160 ms; on a phone the strip of scopes came
 * into the top with the list and the page under it moved 44 px down (0.058 of the browser's layout shift); and a person's
 * page stood under the head drawn with their name, which went as their page came, 55 px of a phone's top (0.078). A fresh
 * context holds no cache, so this is a first load, as after every deploy; nothing of the app is loaded before the page.
 *
 * Measured in the page from its first script (an init script): the browser's own layout shifts, summed, and whether the
 * route's pane ever stood empty once something had been drawn in it.
 */
const SHIFT_NOISE = 0.001;
const RECORD = `(() => {
  const log = { shift: 0, drawn: false, blank: false };
  window.__peopleLoad = log;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) log.shift += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  const look = () => {
    const main = document.querySelector("main#main");
    if (!main) return;
    if (main.children.length > 0) log.drawn = true;
    else if (log.drawn) log.blank = true;
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
})();`;

interface Load {
  shift: number;
  drawn: boolean;
  blank: boolean;
}

async function loadOf(page: Page): Promise<Load> {
  // Long enough for everything the page reads after its first draw to land.
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => (window as unknown as { __peopleLoad: Load }).__peopleLoad);
}

for (const [where, size] of [
  ["a desk", null],
  ["a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`People on a cold load, on ${where}`, () => {
    test.skip(!HAVE_SESSION, WHY_SKIPPED);
    if (size) test.use(size);

    test("the list comes where Reading… stood, with no empty pane between, and nothing moves", async ({ page }) => {
      await page.addInitScript(RECORD);
      await signIn(page);
      await page.goto("/#/clients");
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
      await expect(page.locator("table.pl-table")).toBeVisible({ timeout: 30_000 });
      const load = await loadOf(page);
      expect(load.blank, "the route's pane stood empty between Reading… and the list").toBe(false);
      expect(load.shift, "the layout shifts the browser counted, summed").toBeLessThanOrEqual(SHIFT_NOISE);
    });

    test("a person's page arrives where its Reading… stood", async ({ page }) => {
      await page.addInitScript(RECORD);
      await signIn(page);
      // Who to open, asked of the API, so nothing of the app is loaded (and cached) before their page.
      const people = (await (await apiGet(page, "/api/v1/contacts")).json()).data.people as { id: string }[];
      test.skip(people.length === 0, "this workspace has nobody to open");
      await page.goto(`/#/clients/${people[0].id}`);
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
      await expect(page.getByTestId("person-now")).toBeVisible({ timeout: 30_000 });
      const load = await loadOf(page);
      expect(load.shift, "the layout shifts the browser counted, summed").toBeLessThanOrEqual(SHIFT_NOISE);
    });
  });
}
