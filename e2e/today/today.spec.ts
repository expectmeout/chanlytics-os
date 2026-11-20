import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute, routeOf } from "../address";
import { expectFoundWellFormed, expectNoQueueRepeat } from "../signals";
import { WAITING_QUESTION, WAITING_SEARCH_NAME, refuseAnswers, waitingSearch } from "../waiting-search";
import { NEED_YOU_WORDS } from "../../packages/contracts/src/need-you/words";

/**
 * Today on a real workspace (Today, calm, 19 Nov 2026): the head's one sentence, then one card, the thing most worth
 * doing, with the page's one primary verb; every other thing a line, who waits on you first, the day and what it came to,
 * what AI found, and an end. Every number is one the page it links to prints; nothing is said twice.
 */
test.describe("Today on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
  });

  test("nothing above the work but what cannot wait, then one card and lines: who waits how long beside their name; one primary verb, the card's; no seed", async ({
    page,
  }) => {
    // Nothing above the work while every line is up; a line that is down is one band that says so, with its one door.
    await expect(page.getByTestId("today-standing")).toHaveCount(0);
    const alert = page.getByTestId("today-alert");
    if (await alert.count()) await expect(alert).toContainText(/disconnected|paused/);
    // The head says how many need you, or what the day is where nobody does (zones/head.tsx).
    await expect(page.getByTestId("today-head-lead")).toHaveCount(1);
    const card = page.getByTestId("today-card");
    if (await card.count()) {
      await expect(card).toHaveCount(1);
      expect((await card.locator(".calm-title").innerText()).trim().length, "the card says what it is").toBeGreaterThan(
        0,
      );
      // The page's one coral is the card's (D1): a line never carries one.
      await expect(page.locator(".dash-a-v2 .btn-primary")).toHaveCount(1);
      await expect(card.locator(".btn-primary")).toHaveCount(1);
    } else await expect(page.locator(".dash-a-v2 .btn-primary")).toHaveCount(0);
    // Who waits on you, past the card: a line each, who and what they said, how long beside their name.
    const WAITING = ["queue-handoff", "queue-callback", "queue-window", "queue-reply", "queue-held"];
    for (const line of await page.getByTestId("today-queue").locator(".calm-line:not([data-folded])").all()) {
      expect((await line.locator(".calm-name").innerText()).trim().length, "a line names what it is").toBeGreaterThan(
        0,
      );
      if (WAITING.includes((await line.getAttribute("data-testid")) ?? ""))
        await expect(line.locator(".calm-wait")).toHaveCount(1);
    }
    await expect(page.getByText("Agent Command")).toHaveCount(0);
    // The greeting is the frame head's, over the page (zones/head.tsx): nothing inside the page says it.
    await expect(page.locator(".dash-a-v2").getByText(/Good (morning|afternoon|evening)/)).toHaveCount(0);
    // Nothing invented: no dollar amounts in the band, the card or the lines, which hold no revenue column (a proposal's
    // worth is the Pipeline's).
    for (const cell of await page.locator(".tz-alerts, .calm-lead, .calm-lines").allInnerTexts())
      expect(cell).not.toMatch(/\$\d/);
  });

  test("what the day came to is one line, its door Reports; no figures", async ({ page }) => {
    // The four figures went from the head and from Today so far (Today, calm, D3 and D7): what came of the day is a line.
    await expect(page.locator('[data-testid^="today-figure-"]')).toHaveCount(0);
    const line = page.getByTestId("today-came-to-line");
    if ((await line.count()) === 0) return;
    expect((await line.locator(".calm-name").innerText()).trim()).toMatch(/\d/);
    await line.locator("a[href]").first().click();
    await expect(page).toHaveURL(atRoute(/^reports/));
  });

  test("the day is one line, who is next and what is left, its door the Calendar", async ({ page }) => {
    // Today, calm (zones/day.tsx): the day's line, its bar and what asks for something under it. A workspace with no
    // calendar linked draws the one row that links one; one with nothing going out today and no calendar read draws none.
    await page.setViewportSize({ width: 1440, height: 900 });
    const line = page.getByTestId("today-day-line");
    if ((await line.count()) === 0) return;
    await expect(line).toBeInViewport();
    await line.locator("a[href]").first().click();
    await expect(page).toHaveURL(atRoute(/^calendar/));
  });

  test("AI found: every finding what it is with its numbers, the card's one act beside Not today, every line its own door; three lines at most", async ({
    page,
  }) => {
    const rows = await expectFoundWellFormed(page);
    const card = rows.find((r) => r.card);
    if (!card) return;
    // Not today stands in the card, and is not pressed here: it would rest it a week for the suite's member.
    const lead = page.locator('[data-testid="today-card"][data-holder="found"]');
    await expect(lead.getByTestId("today-found-rest")).toHaveText("Not today");
    // A rule's card asks Ask why beside it (the AskFound board: "Ask why stays"), not pressed here: it would start a turn.
    if (card.source === "rule") await expect(lead.getByTestId("today-found-ask")).toHaveText("Ask why");
  });

  test("the three are the Ask button's face on a desktop: nothing stands above the page", async ({ page }) => {
    // Today draws no band of its own; Ask's face is the top bar's button, and the Stage's.
    await expect(page.getByTestId("today-face")).toHaveCount(0);
    await expect(page.getByTestId("tb-ask").getByTestId("tb-ask-face")).toBeVisible();
    // The page's two columns are its first band (zones/page.tsx), under what cannot wait where a line is down, with room
    // under the bar: with the standing line gone nothing else gave them any, and the card's edge sat on the bar's rule.
    const { first, gap } = await page.evaluate(() => {
      const el = [...(document.querySelector(".dash-a-v2")?.children ?? [])].find(
        (c) => c.getBoundingClientRect().height > 0,
      );
      const bar = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
      return { first: el?.className ?? "", gap: el ? el.getBoundingClientRect().top - bar : -1 };
    });
    expect(first, "nothing stands above the page but what cannot wait").toMatch(/calm-desk|tz-alerts/);
    expect(gap, "the first band keeps the page's gap under the top bar").toBeGreaterThanOrEqual(8);
    // A page with no Ask client (the standalone mockup) draws the mockup's palette; a workspace, and the local harness
    // since Ask Rewired's Phase 7, open the real one.
    if (!(await page.evaluate(() => !!(window as { __ask?: unknown }).__ask))) return;
    await page.getByTestId("tb-ask").click();
    const pal = page.getByTestId("ask-real");
    await expect(pal).toBeVisible();
    await expect(pal.getByTestId("ask-line-face")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pal).toBeHidden();
  });

  test("the card and who waits stand beside the day on a desk, and in one column under 1280px (calm.css)", async ({
    page,
  }) => {
    const tracks = () =>
      page.evaluate(() => {
        const desk = document.querySelector(".calm-desk");
        return desk ? getComputedStyle(desk).gridTemplateColumns.split(" ").length : 0;
      });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(tracks, { message: "the work beside the day" }).toBe(2);
    await page.setViewportSize({ width: 1180, height: 900 });
    await expect.poll(tracks, { message: "one column below a desk's width" }).toBe(1);
  });

  test("a search waiting on its answer is one line of who waits: its name, its wait, its question; pressed, it takes the card with its two answers", async ({
    page,
  }) => {
    // The seed's second search stopped after its first places to ask (e2e-workspace.mjs, WAITING_ROUND). Pressing it only
    // opens it; nothing here may answer it, which would start paid work.
    const attempts = await refuseAnswers(page);
    // The seed's own search, as the page's read answers it: a seed that drifted from these words fails here.
    await waitingSearch(page);
    const card = page.locator('[data-testid="today-card"]:has([data-testid="queue-search"])');
    if ((await card.count()) === 0) {
      const line = page.getByTestId("today-queue").locator('.calm-line[data-testid="queue-search"]:not([data-folded])');
      await expect(line).toHaveCount(1);
      await line.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await expect(line.locator(".calm-name")).toHaveText(WAITING_SEARCH_NAME);
      // Waited three hours when the seed ran: the number moves with the clock, the words do not.
      await expect(line.locator(".calm-wait")).toHaveText(/^\d+h$/);
      await expect(line).toContainText(WAITING_QUESTION);
      await line.locator('[role="button"]').first().click();
    }
    // Answered where it stands (his call D8 of 9 Nov 2026, need-you/sheet/search-work.tsx): the card holds the question
    // whole, a line to say what to change, that nothing is spent, and its two answers. Neither is pressed: an answer
    // starts paid work.
    await expect(card).toHaveCount(1);
    await expect(card.getByText(WAITING_QUESTION, { exact: true })).toBeVisible();
    await expect(card.getByPlaceholder(NEED_YOU_WORDS.search.change)).toBeVisible();
    await expect(card.getByText(NEED_YOU_WORDS.search.nothingSpent, { exact: true })).toBeVisible();
    for (const name of [NEED_YOU_WORDS.search.stop, NEED_YOU_WORDS.search.keep])
      await expect(card.getByRole("button", { name, exact: true })).toBeEnabled();
    expect(routeOf(page.url()), "and Today stays where it is").toBe("today");
    expect(attempts, "opening a waiting search answers nothing").toEqual([]);
  });

  test("nobody who waits on you is said again in AI found, and nothing under the head says the bell's news again", async ({
    page,
  }) => {
    await expect(page.getByTestId("today-zones")).toBeVisible();
    // While you were away went (Today in three zones), and Since you looked after it (decision 0137): news is the bell's.
    await expect(page.getByTestId("today-away")).toHaveCount(0);
    await expect(page.getByTestId("today-since")).toHaveCount(0);
    await expectNoQueueRepeat(page);
  });
});

test.describe("Today on a phone", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the work first: the card starts on the first screen, and nothing widens the page", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-phone")).toBeVisible();
    // Nothing widens the page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // The head is the greeting and one sentence: no second headline under it (the redesign of 1 Nov 2026).
    await expect(page.getByTestId("today-head-lead")).toHaveCount(1);
    const card = page.getByTestId("today-card");
    if ((await card.count()) === 0) return;
    const box = await card.boundingBox();
    expect(box!.y, "the card's head is on the first screen").toBeLessThan(844 - 120);
    // A line says its one fact on one line: nothing is cut from its right but by its own ellipsis.
    for (const name of await page.locator(".calm-line:not([data-folded]) .calm-name").all())
      expect(
        await name.evaluate(
          (el) => el.scrollWidth <= el.clientWidth + 1 || getComputedStyle(el).textOverflow === "ellipsis",
        ),
      ).toBe(true);
  });

  test("the ✦ opens AI over the whole screen; no band stands above the queue; a swipe down closes it", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-face")).toHaveCount(0);
    // A page with no Ask client (the standalone mockup) has no takeover to open; a workspace and the local harness do.
    test.skip(!(await page.evaluate(() => !!(window as { __ask?: unknown }).__ask)), "no Ask client on this page");
    await page.getByTestId("phone-ask").tap();
    const ask = page.getByTestId("ask-real");
    await expect(ask).toBeVisible();
    const box = await ask.boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBeGreaterThan(800);
    await expect(ask.getByTestId("ask-hero")).toBeVisible();
    await expect(ask.getByTestId("ask-input")).not.toBeFocused();
    // A pull down past the threshold from the head closes it, following the finger (kit/motion/swipe.ts touchSwipe): a let-go
    // past a third of the screen, 160px at most, leaves; this one travels 220px.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 40 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 120 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 260 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(ask).toHaveCount(0);
  });
});
