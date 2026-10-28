import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * Each pane of Settings on a cold load draws as one: what it draws lands with it, and nothing grows a card or adds one
 * once the pane is drawn. Each of these did, on production, before the Settings load review (28 Oct 2026): How it answers'
 * "What it can do" said it was reading and grew 321 px when Setup landed, a second on; Connections' Email card came with
 * Setup too, 1.4 s on; Billing's plan said it was reading; Team's partner card came after the members on every load, and
 * the log after its pane; Memory drew a reading card and then the pane.
 *
 * A cold load: the tab's storage emptied after the home has sent it to the workspace, so the pane's address is the first
 * thing read. Measured in the page from its first script (an init script): the tops and heights of the pane's cards, every
 * frame, from when the pane first appears. The page's entrance (a few pixels as it comes in) is all a card may move.
 */
const ENTRANCE_PX = 8;
const PANES = ["receptionist", "integrations", "billing", "team", "memory", "activity", "profile"] as const;
const RECORD = `(() => {
  const log = { frames: [] };
  window.__settingsLoad = log;
  const look = () => {
    const pane = document.querySelector(".set-pane");
    if (!pane) return;
    const top = pane.getBoundingClientRect().top;
    const cards = [...pane.querySelectorAll(".rec-card")].map((c) => {
      const b = c.getBoundingClientRect();
      return [Math.round(b.top - top), Math.round(b.height)];
    });
    const last = log.frames[log.frames.length - 1];
    if (!last || JSON.stringify(last) !== JSON.stringify(cards)) log.frames.push(cards);
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  const tick = () => { look(); if (performance.now() < 15000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

type Frame = [number, number][];
const said = (f: Frame) => f.map(([t, h]) => `${t}:${h}`).join(" ");

test.describe("Settings' panes on a cold load", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  for (const pane of PANES) {
    test(`${pane}: its cards are drawn whole in the frame the pane first appears in, and none grows or comes after`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto("/");
      await page.waitForURL(/\/w\/[^/?#]+/, { timeout: 30_000 });
      const slug = /\/w\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
      if (!slug) throw new Error(`the home sent this tab somewhere with no workspace in it: ${page.url()}`);
      // What the home left in the tab goes, so the pane is read as after a deploy.
      await page.goto("/api/version");
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.addInitScript(RECORD);
      await page.goto(`/w/${slug}/settings/${pane}`);
      await expect(page.locator(".set-pane")).toBeVisible({ timeout: 30_000 });
      // Long enough for everything the page reads after its first draw to land: the boot's second pass, the feed's.
      await page.waitForLoadState("networkidle");
      const frames = await page.evaluate(
        () => (window as unknown as { __settingsLoad: { frames: Frame[] } }).__settingsLoad.frames,
      );
      const first = frames[0];
      const last = frames[frames.length - 1];
      const story = frames.map(said).join(" > ");
      expect(last.length, `the pane's cards, frame by frame: ${story}`).toBe(first.length);
      last.forEach(([top, height], i) => {
        expect(Math.abs(top - first[i][0]), `card ${i + 1}'s top, frame by frame: ${story}`).toBeLessThanOrEqual(
          ENTRANCE_PX,
        );
        expect(Math.abs(height - first[i][1]), `card ${i + 1}'s height, frame by frame: ${story}`).toBeLessThanOrEqual(
          ENTRANCE_PX,
        );
      });
    });
  }
});
