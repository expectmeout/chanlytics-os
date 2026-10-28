import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";

/**
 * The Inbox on a cold load draws as one page: nothing lands in the thread once it is drawn, and nothing moves the list. Each
 * of these did, on production, before the Inbox load review (28 Oct 2026): a thread outside WhatsApp's window drew its reply
 * box 0.3 to 1.5 s after the thread (the settings read's templates, in the boot's second pass), pushing the conversation 145
 * to 162 px up; the head's deal and visit chips came with People's book after it; the draft Ask kept was read once the box
 * had drawn. A fresh context holds no cache, so this is a first load, as after every deploy.
 *
 * Measured in the page from its first script (an init script). What moved is the browser's own count of it (layout-shift
 * entries), which counts only frames that were painted: a position read as the page is changed can catch a layout the
 * browser corrects before it paints (the frame's top, measured in the same frame), which nobody sees. What the thread drew
 * in its first frame is read as it first appears. The page's entrance is a transform, which moves nothing the count sees.
 */
const ENTRANCE_PX = 8;
/** What the head says beside the name, from People's row: drawn with the head, or not at all. */
const HEAD_FACTS = [
  "ix-th-deal",
  "ix-th-visit",
  "ix-th-visit-door",
  "ix-th-works-at",
  "ix-th-works-door",
  "ix-th-step",
];
/** The Inbox's own parts, as a shift's source is named: the list's rows, the thread, its timeline and its reply box. */
const PARTS = [".ix-thread", ".ix-thread-pane", ".ix-timeline", ".ix-composer", ".ix-th-head"];
const RECORD = `(() => {
  const facts = ${JSON.stringify(HEAD_FACTS)};
  const parts = ${JSON.stringify(PARTS)};
  const log = { moved: [], facts: null, boxAtFirst: null };
  window.__inboxLoad = log;
  const partOf = (node) => {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    return el ? parts.find((p) => el.closest(p)) : undefined;
  };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      for (const s of e.sources || []) {
        const part = partOf(s.node);
        const dy = Math.round(Math.abs(s.currentRect.y - s.previousRect.y));
        if (part && dy > 0) log.moved.push(part + " " + Math.round(s.previousRect.y) + ">" + Math.round(s.currentRect.y));
      }
    }
  }).observe({ type: "layout-shift", buffered: true });
  const look = () => {
    const pane = document.querySelector(".ix-thread-pane");
    if (!pane || log.facts !== null) return;
    log.facts = facts.filter((id) => pane.querySelector('[data-testid="' + id + '"]'));
    log.boxAtFirst = !!pane.querySelector(".ix-composer");
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true });
})();`;

interface InboxLoad {
  moved: string[];
  facts: string[] | null;
  boxAtFirst: boolean | null;
}

/** How far a shift's line says a part moved ("part 776>614"). */
const distance = (line: string) => {
  const [from, to] = (line.split(" ").at(-1) ?? "0>0").split(">").map(Number);
  return Math.abs((to ?? 0) - (from ?? 0));
};

test.describe("The Inbox on a cold load", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);

  test("the list and the open thread never move once drawn, past the page's entrance; the reply box and the head's facts come with the thread", async ({
    page,
  }) => {
    await page.addInitScript(RECORD);
    await signIn(page);
    await page.goto("/#/inbox");
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    await expect(page.locator(".ix-thread").first()).toBeVisible();
    // Long enough for everything the page reads after its first draw to land: People's book, the feed's re-read.
    await page.waitForLoadState("networkidle");
    const load = await page.evaluate(() => (window as unknown as { __inboxLoad: InboxLoad }).__inboxLoad);
    const far = load.moved.filter((line) => distance(line) > ENTRANCE_PX);
    expect(far, `what moved once painted: ${load.moved.join(", ") || "nothing"}`).toEqual([]);
    // A phone opens on its list alone; a desk draws the thread beside it.
    const viewport = page.viewportSize();
    if (!viewport || viewport.width <= 720) return;
    expect(load.boxAtFirst, "the reply box, drawn with the thread").toBe(true);
    // Whatever the head says of them at the end it said in its first frame: nothing landed beside the name.
    const factsNow = await page.evaluate(
      (ids) => ids.filter((id) => document.querySelector(`.ix-thread-pane [data-testid="${id}"]`)),
      HEAD_FACTS,
    );
    expect(load.facts).toEqual(factsNow);
  });
});
