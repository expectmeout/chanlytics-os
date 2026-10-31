import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * Today on a cold load draws as one page: nothing lands over the queue once it is drawn, and nothing pushes it down. Each of
 * these did, on production, before the Today load review (27 Oct 2026): the Setup card landing from its own chunk after the
 * queue (4 of 13 desk loads, 10 of 41 phone ones), the frame's head filling in a frame after the page and moving all of it
 * down 92 px, Going today and a run's seat from the stream's second tier, the drafts' words after the rows. A fresh context
 * holds no cache, so this is a first load, as after every deploy.
 *
 * Measured in the page from its first script (an init script): the queue's top, every frame, from when it first appears.
 * The page's entrance (the route's fade, a few pixels up as it comes in) is all the queue may move.
 */
const ENTRANCE_PX = 8;
const RECORD = `(() => {
  const log = { queue: [], above: null, head: null };
  window.__todayLoad = log;
  const look = () => {
    const q = document.querySelector('[data-testid="today-queue"]');
    if (!q) return;
    const top = Math.round(q.getBoundingClientRect().top + window.scrollY);
    if (log.above === null) {
      // What stands above the queue in the frame it is first drawn in, and the head over the page then.
      log.above = ["today-setup", "today-brought-in", "today-going"].filter((id) => document.querySelector('[data-testid="' + id + '"]'));
      const head = document.querySelector("header.pg-head");
      log.head = head ? Math.round(head.getBoundingClientRect().height) : 0;
    }
    const last = log.queue[log.queue.length - 1];
    if (last === undefined || last !== top) log.queue.push(top);
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
  const tick = () => { look(); if (performance.now() < 15000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

test.describe("Today on a cold load", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("the queue never moves once it is drawn, past the page's entrance; the head and what stands above the queue are drawn with it", async ({
    page,
  }) => {
    await page.addInitScript(RECORD);
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    await expect(page.getByTestId("today-queue")).toBeVisible();
    // Long enough for everything the page reads after its first draw to land: People's book, the period line, the bell.
    await page.waitForLoadState("networkidle");
    const load = await page.evaluate(
      () => (window as unknown as { __todayLoad: { queue: number[]; above: string[]; head: number } }).__todayLoad,
    );
    const first = load.queue[0];
    const moved = Math.max(...load.queue.map((y) => Math.abs(y - first)));
    expect(moved, `the queue's tops, frame by frame: ${load.queue.join(" > ")}`).toBeLessThanOrEqual(ENTRANCE_PX);
    // Whatever stands above the queue at the end stood there in its first frame: nothing landed over it.
    const aboveNow = await page.evaluate(() =>
      ["today-setup", "today-brought-in", "today-going"].filter((id) =>
        document.querySelector(`[data-testid="${id}"]`),
      ),
    );
    expect(load.above).toEqual(aboveNow);
    // A desk's head says the greeting and the day's sentence in the frame the page is drawn in.
    const viewport = page.viewportSize();
    if (viewport && viewport.width > 720) expect(load.head, "the head, drawn with the page").toBeGreaterThan(40);
  });
});
