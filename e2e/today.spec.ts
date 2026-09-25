import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";
import { expectAwayAddsUp, expectLeaksWellFormed, expectNoQueueRepeat, expectWarningsFirst } from "./signals";
import { WAITING_PLACES, WAITING_QUESTION, WAITING_SEARCH_NAME, refuseAnswers, waitingSearch } from "./waiting-search";

/**
 * Today on a real workspace: the work first, then the day's own card (four figures, each with its receipt), then
 * what is left over. Everything that asks for a person is one queue in the strip's row grammar; every number is one
 * the page it links to prints; nothing is said twice.
 */
test.describe("Today on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
  });

  test("nothing above the work, then one queue: every row a sentence, a state line and a verb; one primary verb; no seed", async ({
    page,
  }) => {
    // Nothing above the work while every line is up; a line that is down is one red line that says so.
    await expect(page.getByTestId("today-standing")).toHaveCount(0);
    const alert = page.getByTestId("today-alert");
    if (await alert.count()) await expect(alert).toContainText(/disconnected|paused/);
    const queue = page.getByTestId("today-queue");
    await expect(queue).toBeVisible();
    const rows = queue.locator(".tq-list .cl-attn-row");
    const n = await rows.count();
    for (const row of await rows.all()) {
      expect((await row.locator(".cl-attn-sentence").innerText()).trim().length).toBeGreaterThan(0);
      expect((await row.locator(".cl-attn-status").innerText()).trim().length).toBeGreaterThan(0);
      await expect(row.locator(".cl-attn-cta")).toHaveCount((await row.locator(".cl-attn-cta").count()) > 1 ? 2 : 1);
    }
    await expect(queue.locator(".tq-list .cl-attn-cta.primary")).toHaveCount(Math.min(1, n));
    await expect(queue.locator(".tq-head .tq-count")).toHaveCount(0);
    if (n === 0) await expect(queue.locator('[data-testid^="today-queue-empty-"]')).toBeVisible();
    await expect(page.getByText("Agent Command")).toHaveCount(0);
    await expect(page.getByText(/Good (morning|afternoon|evening)/)).toHaveCount(0);
    // Nothing invented: no dollar amounts anywhere on a page with no revenue column.
    for (const cell of await page.locator(".today-alert, .today-card, .tsec").allInnerTexts())
      expect(cell).not.toMatch(/\$\d/);
  });

  test("the day's card: four figures with their clauses, or the quiet line with its proof; a receipt on hover adds to its figure", async ({
    page,
  }) => {
    const card = page.getByTestId("today-card");
    await expect(card).toBeVisible();
    const figures = card.locator('[data-testid^="today-figure-"]');
    const n = await figures.count();
    if (n === 0) {
      await expect(card.getByTestId("today-quiet-line")).toContainText(
        /^Nothing has come in yet today\. (The last message arrived .+|No messages have arrived yet\.)/,
      );
      return;
    }
    expect(n).toBe(4);
    for (const id of ["messages", "answered", "calls", "new"]) {
      const fig = card.getByTestId(`today-figure-${id}`);
      await expect(fig.locator(".tc-fig-n")).toHaveText(/^\d+$/);
      expect((await fig.locator(".tc-fig-m").innerText()).trim().length).toBeGreaterThan(0);
      await expect(card.getByTestId(`today-receipt-${id}`)).toHaveCount(0);
      if ((await fig.locator("button.tc-fig-btn").count()) === 0) continue;
      await fig.hover();
      const receipt = card.getByTestId(`today-receipt-${id}`);
      await expect(receipt).toBeVisible();
      await expect(receipt).toHaveAttribute("role", "dialog");
      const value = (await fig.locator(".tc-fig-n").innerText()).trim();
      expect((await receipt.locator(".tc-receipt-t").innerText()).trim()).not.toMatch(new RegExp(`\\b${value}\\b`));
      await expect(receipt.locator("button")).toHaveCount((await receipt.locator("button").count()) ? 1 : 0);
      await page.mouse.move(0, 0);
      await expect(receipt).toHaveCount(0);
    }
  });

  test("the period line is Reports' own number, said once, with the page's one door to Reports", async ({ page }) => {
    const line = page.getByTestId("today-period");
    const failed = page.getByTestId("today-period-failed");
    await expect(line.or(failed)).toBeVisible({ timeout: 15_000 });
    if ((await line.count()) === 0) return;
    const said = (await line.innerText()).trim();
    const m = /^Last (7|30|90) days: (\d+) messages?/.exec(said);
    expect(m, said).not.toBeNull();
    const door = page.getByTestId("today-card").getByRole("button", { name: /Open Reports/ });
    await expect(door).toHaveCount(1);
    await door.click();
    await expect(page).toHaveURL(/#\/reports/);
    await page.waitForLoadState("networkidle");
    // Reports' messages tile, over the same range, prints the same count (the tiles are one list since #928, each
    // named by data-tile).
    await expect(page.getByTestId("reports-tiles").locator('[data-tile="messages"] .rpt-tile-value')).toContainText(
      m![2],
    );
  });

  test("the day beside the queue: at most five rows and a line to the Calendar; nothing without a feed", async ({
    page,
  }) => {
    const day = page.getByTestId("today-day");
    await day.waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
    if ((await day.count()) === 0) {
      const res = await apiGet(page, "/api/v1/calendar");
      const cal = ((await res.json()).data?.calendar as { feed?: { state?: string } } | undefined)?.feed;
      expect(cal?.state, "no day module, so the feed must not be readable").not.toBe("ok");
      return;
    }
    await expect(day).toBeVisible();
    const frames = day.getByTestId("today-day-frame");
    await expect(frames).toHaveCount(2);
    await expect(frames.first()).toContainText(/^Today · /);
    for (const frame of await frames.all()) {
      const items = await frame.getByTestId("today-day-item").count();
      expect(items).toBeLessThanOrEqual(5);
      const more = frame.getByTestId("today-day-more");
      if ((await more.count()) > 0) {
        await expect(more).toHaveText(/^\d+ more on the Calendar$/);
        expect(items).toBe(5);
      }
    }
    await expect(day.getByRole("button", { name: /Open Calendar/ })).toBeVisible();
  });

  test("worth a look: every row a claim with its arithmetic, a word for its tone, an Ask door that asks the row's own sentence", async ({
    page,
  }) => {
    const rows = await expectLeaksWellFormed(page);
    if (rows.length === 0) return;
    for (const r of rows) {
      const row = page.getByTestId(`today-leak-${r.id}`);
      // The deal rows' tags (0008) show only where deals are on; the nightly workspace answers "booking".
      await expect(row.locator(".tl-tag")).toHaveText(/^(Booking gap|No reply|Next step|Waiting|Reach|Gone quiet)$/);
      expect(r.doors).toContain("Ask why");
    }
    await page.getByTestId(`today-leak-ask-${rows[0].id}`).click();
    // The shell's Ask palette (ask-real.jsx, testid ask-real as ask.spec and phone.spec read it) opens on the row's own question.
    const ask = page.getByTestId("ask-real");
    await expect(ask).toBeVisible();
    await expect(ask).toContainText(rows[0].text.slice(0, 40), { timeout: 15_000 });
  });

  test("the three are the Ask button's face on a desktop: nothing stands above the queue", async ({ page }) => {
    // Today draws no band of its own; Ask's face is the top bar's button, and the Stage's.
    await expect(page.getByTestId("today-face")).toHaveCount(0);
    await expect(page.getByTestId("tb-ask").getByTestId("tb-ask-face")).toBeVisible();
    // The queue is the first thing on the page, or the second under a line that is down, and it has room under the
    // bar: with the standing line gone nothing else gave it any, and the card's edge sat on the bar's rule.
    const { first, gap } = await page.evaluate(() => {
      const el = [...(document.querySelector(".dash-a-v2")?.children ?? [])].find(
        (c) => c.getBoundingClientRect().height > 0,
      );
      const bar = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
      return { first: el?.className ?? "", gap: el ? el.getBoundingClientRect().top - bar : -1 };
    });
    expect(first, "nothing stands above the queue but a line that is down").toMatch(/dash-a-v2-core|today-alert/);
    expect(gap, "the first band keeps the page's gap under the top bar").toBeGreaterThanOrEqual(8);
    // The local harness installs no Ask client, so its palette is the mockup's; only a workspace opens the real one.
    if (!(await page.evaluate(() => !!(window as { __ask?: unknown }).__ask))) return;
    await page.getByTestId("tb-ask").click();
    const pal = page.getByTestId("ask-real");
    await expect(pal).toBeVisible();
    await expect(pal.getByTestId("ask-line-face")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(pal).toBeHidden();
  });

  test("a search waiting on its answer is one row of the queue: its name, its wait, its question, and Answer opens the pile it asks about", async ({
    page,
  }) => {
    // The seed's second search stopped after its first places to ask (e2e-workspace.mjs, WAITING_ROUND). Answer only
    // opens the search; nothing here may answer it, which would start paid work.
    const attempts = await refuseAnswers(page);
    const search = await waitingSearch(page);
    const queue = page.getByTestId("today-queue");
    await expect(queue.locator(".tq-sub")).toContainText("1 search waiting for your answer");
    const row = queue.getByTestId("queue-search");
    await expect(row).toHaveCount(1);
    await expect(row).toBeInViewport({ ratio: 1 });
    await expect(row.locator(".cl-attn-who")).toHaveText(WAITING_SEARCH_NAME);
    // Waited three hours when the seed ran: the number moves with the clock, the words do not.
    await expect(row.locator(".cl-attn-meta")).toHaveText(/^Leads, waited \d+h$/);
    await expect(row.locator(".cl-attn-sentence")).toHaveText(WAITING_QUESTION);
    await expect(row.locator(".cl-attn-status")).toHaveText(
      "Waiting for your answer · nothing is spent while it waits",
    );
    const answer = row.getByRole("button", { name: "Answer", exact: true });
    await expect(answer).toBeInViewport({ ratio: 1 });
    await answer.click();
    await expect.poll(() => new URL(page.url()).hash).toBe(`#/${search.route}`);
    // Landed on this search's left-out pile, with its question over it: the three places it asks about, and no
    // place from the other search.
    const strip = page.getByTestId("lead-strip");
    await expect(strip).toBeInViewport({ ratio: 1 });
    await expect(strip.getByTestId("strip-title")).toHaveText(WAITING_QUESTION);
    const rows = page.locator(".cl-table tbody tr");
    await expect(rows).toHaveCount(WAITING_PLACES.length);
    for (const name of WAITING_PLACES) await expect(rows.filter({ hasText: name })).toHaveCount(1);
    expect(attempts, "opening a waiting search answers nothing").toEqual([]);
  });

  test("while you were away: nothing in the queue is said twice, the count adds up, and a warning is never below good news", async ({
    page,
  }) => {
    await expect(page.getByTestId("today-queue")).toBeVisible();
    await expectNoQueueRepeat(page);
    await expectAwayAddsUp(page);
    await expectWarningsFirst(page);
  });
});

test.describe("Today on a phone", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the work first: the queue starts on the first screen; a receipt is a panel in the flow, not a popover", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const queue = page.getByTestId("today-queue");
    await expect(queue).toBeVisible();
    // Nothing widens the page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await queue.boundingBox();
    expect(box!.y, "the queue's head is on the first screen").toBeLessThan(844 - 120);
    // The line an owner decides from wraps; nothing is cut from its right.
    for (const status of await queue.locator(".tq-list .cl-attn-status").all()) {
      expect(await status.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), await status.innerText()).toBe(true);
    }
    const fig = page.getByTestId("today-card").locator("button.tc-fig-btn").first();
    if ((await fig.count()) === 0) return;
    await fig.scrollIntoViewIfNeeded();
    await fig.tap();
    const receipt = page.getByTestId("today-card").locator('[data-testid^="today-receipt-"]');
    await expect(receipt).toBeVisible();
    const position = await receipt.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe("static");
  });

  test("the ✦ opens Ask over the whole screen; no band stands above the queue; a swipe down closes it", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-face")).toHaveCount(0);
    // The local harness installs no Ask client, so it has no takeover to open; only a workspace does.
    test.skip(!(await page.evaluate(() => !!(window as { __ask?: unknown }).__ask)), "no Ask on this harness");
    await page.getByTestId("phone-ask").tap();
    const ask = page.getByTestId("ask-real");
    await expect(ask).toBeVisible();
    const box = await ask.boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBeGreaterThan(800);
    await expect(ask.getByTestId("ask-hero")).toBeVisible();
    await expect(ask.getByTestId("ask-input")).not.toBeFocused();
    // A pull down past the threshold from the head closes it, following the finger (data-bits touchSwipe): a let-go
    // past a third of the screen, 160px at most, leaves; this one travels 220px.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 40 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 120 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 260 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(ask).toHaveCount(0);
  });
});
