import { test, expect, type Page } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { apiGet } from "../workspace";
import { SEQUENCE_FLOW_WORDS, type SequencesPageDto } from "../../packages/contracts/src/index";

/**
 * Campaigns' views on a cold load draw as one page: nothing they draw is said and then taken back, and the strip of views
 * never moves once it is drawn. Each of these did, on production, before the Campaigns load review (28 Oct 2026): the head
 * said "Messages" or "New" under ‹ Campaigns while the page was read, then the page said Campaigns and the strip moved
 * 25 px up (13 on a phone); New drew a panel of what to set up first and swapped it 200 ms later for the row the searches
 * gave; Messages said there was no number, then the list moved 55 px up; a one-off's step said its message was gone, then
 * its words stood there a frame later. A fresh context holds no cache, so this is a first load, as after every deploy.
 *
 * Measured in the page from its first script (an init script): the strip's top every frame, and every test id and the
 * words of a step's message as they first appear. The page's entrance (a few pixels up as it comes in) is all the strip
 * may move.
 */
const ENTRANCE_PX = 8;
const RECORD = `(() => {
  const log = { strip: [], seen: {}, words: [] };
  window.__cmLoad = log;
  const look = () => {
    for (const el of document.querySelectorAll("[data-testid]")) {
      const id = el.getAttribute("data-testid");
      if (log.seen[id] === undefined) log.seen[id] = Math.round(performance.now());
    }
    const s = document.querySelector('[data-testid="campaigns-views"]');
    if (s) {
      const top = Math.round(s.getBoundingClientRect().top);
      if (log.strip[log.strip.length - 1] !== top) log.strip.push(top);
    }
    const w = document.querySelector('[data-testid="sq-step-words-1"]');
    const said = w ? w.textContent.trim() : null;
    if (said && log.words[log.words.length - 1] !== said) log.words.push(said);
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });
  const tick = () => { look(); if (performance.now() < 15000) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

interface Load {
  strip: number[];
  seen: Record<string, number>;
  words: string[];
}

/** A cold load of a Campaigns address, settled: what the recorder saw, frame by frame. Signed in before. */
async function coldLoad(page: Page, route: string, drawn: string): Promise<Load> {
  await page.addInitScript(RECORD);
  await page.goto(`/#/${route}`);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  await expect(page.getByTestId(drawn)).toBeVisible();
  // Long enough for everything the page reads after its first draw to land.
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => (window as unknown as { __cmLoad: Load }).__cmLoad);
}

const stripMoved = (load: Load) => Math.max(0, ...load.strip.map((y) => Math.abs(y - (load.strip[0] ?? y))));

test.describe("Campaigns' views on a cold load", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Messages: the strip never moves once drawn, and no number is never said where there is one", async ({
    page,
  }) => {
    const load = await coldLoad(page, "campaigns/messages", "messages-real");
    expect(stripMoved(load), `the strip's tops, frame by frame: ${load.strip.join(" > ")}`).toBeLessThanOrEqual(
      ENTRANCE_PX,
    );
    const noNumberNow = await page.getByTestId("messages-no-number").count();
    if (noNumberNow === 0)
      expect(load.seen["messages-no-number"], "said there was no number, then took it back").toBe(undefined);
  });

  test("New: the strip never moves, and its starts are never swapped for what to set up first", async ({ page }) => {
    const load = await coldLoad(page, "campaigns/sequences/new", "sq-new");
    expect(stripMoved(load), `the strip's tops, frame by frame: ${load.strip.join(" > ")}`).toBeLessThanOrEqual(
      ENTRANCE_PX,
    );
    // New draws its starts or what a bare workspace needs before them, and whichever it ends on is the one it drew.
    const startsNow = await page.getByTestId("sq-nw-starts").count();
    const setupNow = await page.getByTestId("sq-nw-setup").count();
    if (startsNow > 0)
      expect(load.seen["sq-nw-setup"], "drew what to set up, then swapped it for the starts").toBe(undefined);
    if (setupNow > 0)
      expect(load.seen["sq-nw-starts"], "drew starts, then swapped them for what to set up").toBe(undefined);
  });

  test("a one-off's step never says its message is gone where its words are there", async ({ page }) => {
    // The workspace's one-offs, as the list reads them (a read of the API alone: the page holds nothing yet), whose step's
    // words are its message's.
    const r = await apiGet(page, "/api/v1/sequences");
    expect(r.status()).toBe(200);
    const list = ((await r.json()) as { data: SequencesPageDto }).data;
    const oneOff = list.sequences.find((s) => s.starts === "date" && s.state !== "draft");
    test.skip(!oneOff, "the workspace holds no one-off that went or waits");
    const load = await coldLoad(page, `campaigns/sequences/${oneOff!.id}`, "sq-steps");
    const now = load.words[load.words.length - 1];
    if (now !== SEQUENCE_FLOW_WORDS.messageGone)
      expect(load.words, `the step's words, frame by frame: ${load.words.join(" > ")}`).not.toContain(
        SEQUENCE_FLOW_WORDS.messageGone,
      );
    expect(stripMoved(load), `the strip's tops, frame by frame: ${load.strip.join(" > ")}`).toBeLessThanOrEqual(
      ENTRANCE_PX,
    );
  });
});
