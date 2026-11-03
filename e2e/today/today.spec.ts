import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "../session";
import { atRoute, routeOf } from "../address";
import { expectFoundWellFormed, expectNoQueueRepeat, expectSinceOpens } from "../signals";
import { WAITING_PLACES, WAITING_QUESTION, WAITING_SEARCH_NAME, refuseAnswers, waitingSearch } from "../waiting-search";

/**
 * Today on a real workspace (Today in three zones, 2 Nov 2026): the head's one sentence, Since you looked under it and, on
 * a desk, the day's four figures beside the greeting, each with its receipt; then the zones, Need you in its groups
 * beside the day, Ask found under the day, and the week and the pins in one strip. Everything that asks for a person is
 * one list in the kit's row grammar; every number is one the page it links to prints; nothing is said twice.
 */
test.describe("Today on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
  });

  test("nothing above the work but what cannot wait, then Need you in groups: every row a sentence and a verb, someone waiting how long beside their name; one primary verb; no seed", async ({
    page,
  }) => {
    // Nothing above the work while every line is up; a line that is down is one band that says so, with its one door.
    await expect(page.getByTestId("today-standing")).toHaveCount(0);
    const alert = page.getByTestId("today-alert");
    if (await alert.count()) await expect(alert).toContainText(/disconnected|paused/);
    // The head says how many need you, or what the day is where nobody does (zones/head.tsx).
    await expect(page.getByTestId("today-head-lead")).toHaveCount(1);
    const queue = page.getByTestId("today-queue");
    if ((await queue.count()) === 0) {
      await expect(page.getByTestId("today-head-lead")).toHaveText(
        /^Nothing (needs you|in the queue|can come in yet)\.$/,
      );
    } else {
      await expect(queue).toBeVisible();
      const rows = queue.locator(".tq-list .cl-attn-row");
      const n = await rows.count();
      // Need you's rows (decision 0071 as amended, need-you/people-rows.tsx): someone waiting on you says how long beside
      // their name and no state line; Older is one row naming them, with Mark all done; anything else (a run, a search,
      // your own to-do) says where it stands. Every row offers a verb: its own, or its work's.
      const WAITING = ["queue-handoff", "queue-callback", "queue-window", "queue-reply", "queue-held"];
      for (const row of await rows.all()) {
        expect((await row.locator(".cl-attn-sentence").innerText()).trim().length).toBeGreaterThan(0);
        const id = (await row.getAttribute("data-testid")) ?? "";
        if (id === "queue-older") await expect(row.locator(".cl-attn-who")).toHaveText(/^\d+ over a week$/);
        else if (WAITING.includes(id)) {
          await expect(row.locator(".cl-attn-wait")).toHaveCount(1);
          await expect(row.locator(".cl-attn-status")).toHaveCount(0);
        } else expect((await row.locator(".cl-attn-status").innerText()).trim().length).toBeGreaterThan(0);
        const verbs = (await row.locator(".cl-attn-cta").count()) + (await row.locator(".cl-attn-work button").count());
        expect(verbs, "a row with nothing to do").toBeGreaterThan(0);
        expect(await row.locator(".cl-attn-cta").count()).toBeLessThanOrEqual(2);
      }
      // The list's one coral is the first open row's act, its own verb or its work's; To do's where nothing above took it.
      await expect(queue.locator(".tq-list :is(.cl-attn-cta.primary, .cl-attn-work .btn-primary)")).toHaveCount(
        Math.min(1, n),
      );
      await expect(queue.locator(".tq-head .tq-count")).toHaveCount(0);
    }
    await expect(page.getByText("Agent Command")).toHaveCount(0);
    // The greeting is the frame head's, over the page (zones/head.tsx): nothing inside the page says it.
    await expect(page.locator(".dash-a-v2").getByText(/Good (morning|afternoon|evening)/)).toHaveCount(0);
    // Nothing invented: no dollar amounts in the figures, the band, Need you or the day, which hold no revenue column (a
    // proposal's worth is the Pipeline's, said in Ask found's row where one waits).
    for (const cell of await page.locator(".tz-alerts, .today-head-figs, .tz-need, .tz-day").allInnerTexts())
      expect(cell).not.toMatch(/\$\d/);
  });

  test("the head's four figures with their clauses, zeros on a quiet day; a receipt on hover adds to its figure", async ({
    page,
  }) => {
    // A desk's four stand in the frame's head beside the greeting (figures.tsx TodayHeadFigures); Today so far is a
    // phone's. Booked leads, and the messages are what Answered is out of (the canvas of 2 Nov 2026, D6).
    await expect(page.getByTestId("today-card")).toHaveCount(0);
    const card = page.locator(".today-head-figs");
    await expect(card).toBeVisible();
    const figures = card.locator('[data-testid^="today-figure-"]');
    await expect(figures).toHaveCount(4);
    for (const id of ["booked", "answered", "calls", "new"]) {
      const fig = card.getByTestId(`today-figure-${id}`);
      // A number, out of another where it has one ("31 of 34"), or a dash where it could not be read: never a zero
      // nobody counted.
      await expect(fig.locator(".tc-fig-n")).toHaveText(/^(\d+( of \d+)?|–)$/);
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
    // The line is the one door, in the strip under the zones (foot.tsx WeekLine).
    await expect(page.getByTestId("today-foot").getByTestId("today-period")).toHaveCount(1);
    await line.click();
    await expect(page).toHaveURL(atRoute(/^reports/));
    await page.waitForLoadState("networkidle");
    // Reports' messages figure, over the same range, prints the same count (the strip is one list of the kit's figures, each
    // named by its metric in data-figure).
    await expect(
      page.getByTestId("reports-tiles").locator('[data-figure="customer_messages"] .figure-value'),
    ).toContainText(m![2]);
  });

  test("the day beside the work: its note, the bar, the rest of it; its door is the Calendar", async ({ page }) => {
    // Today in three zones (zones/page.tsx, zones/day.tsx): beside Need you, over Ask found. A workspace with no calendar
    // linked draws the one row that links one; one with nothing going out today and no calendar read draws no day.
    const day = page.getByTestId("today-day");
    if ((await day.count()) === 0) return;
    await expect(day).toBeInViewport();
    const door = day.getByRole("link", { name: "Calendar", exact: true });
    await expect(door).toHaveCount(1);
    await door.click();
    await expect(page).toHaveURL(atRoute(/^calendar/));
  });

  test("Ask found: every row what it is, its sentence and its one act, its why behind the sentence beside Not today; three at most", async ({
    page,
  }) => {
    const rows = await expectFoundWellFormed(page);
    if (rows.length === 0) return;
    for (const r of rows)
      expect(r.tag).toMatch(
        /^(Booking gap|No reply|Next step|Waiting|Reach|Gone quiet|Replies fell|Ask noticed|Ask's idea|Worth a listen|Tried their receptionist)$/,
      );
    // Not today stands beside the why, and is not pressed here: it would rest the row a week for the suite's member.
    const zone = page.getByTestId("today-ask-found");
    const first = zone.locator('.tz-idea[data-testid^="today-found-"]').first();
    await first.getByTestId("today-found-sentence").click();
    await expect(first.getByTestId("today-found-rest")).toHaveText("Not today");
    await first.getByTestId("today-found-sentence").click();
    await expect(first.getByTestId("today-found-rest")).toHaveCount(0);
    // A rule's row asks Ask why beside it (the AskFound board: "Ask why stays"), not pressed here: it would start a turn.
    const rule = zone.locator('.tz-idea[data-testid="today-found-rule"]').first();
    if (await rule.count()) {
      await rule.getByTestId("today-found-sentence").click();
      await expect(rule.getByTestId("today-found-ask")).toHaveText("Ask why");
      await rule.getByTestId("today-found-sentence").click();
    }
  });

  test("the three are the Ask button's face on a desktop: nothing stands above the queue", async ({ page }) => {
    // Today draws no band of its own; Ask's face is the top bar's button, and the Stage's.
    await expect(page.getByTestId("today-face")).toHaveCount(0);
    await expect(page.getByTestId("tb-ask").getByTestId("tb-ask-face")).toBeVisible();
    // The zones are the first band on the page (the bento, zones/page.tsx), under what cannot wait where a line is down,
    // and they have room under the bar: with the standing line gone nothing else gave them any, and the card's edge sat
    // on the bar's rule.
    const { first, gap } = await page.evaluate(() => {
      const el = [...(document.querySelector(".dash-a-v2")?.children ?? [])].find(
        (c) => c.getBoundingClientRect().height > 0,
      );
      const bar = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
      return { first: el?.className ?? "", gap: el ? el.getBoundingClientRect().top - bar : -1 };
    });
    expect(first, "nothing stands above the zones but what cannot wait").toMatch(/tz-bento|tz-alerts/);
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

  test("the work and the day stand side by side on a desk, and in one column under 1280px (the bento, zones.css)", async ({
    page,
  }) => {
    const tracks = () =>
      page.evaluate(() => {
        const bento = document.querySelector(".tz-bento");
        return bento ? getComputedStyle(bento).gridTemplateColumns.split(" ").length : 0;
      });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(tracks, { message: "Need you beside the day" }).toBe(2);
    await page.setViewportSize({ width: 1180, height: 900 });
    await expect.poll(tracks, { message: "one column below a desk's width" }).toBe(1);
  });

  test("a search waiting on its answer is one row of the queue: its name, its wait, its question, and Answer opens the pile it asks about", async ({
    page,
  }) => {
    // The seed's second search stopped after its first places to ask (e2e-workspace.mjs, WAITING_ROUND). Answer only
    // opens the search; nothing here may answer it, which would start paid work.
    const attempts = await refuseAnswers(page);
    const search = await waitingSearch(page);
    const queue = page.getByTestId("today-queue");
    // A question waits for your answer as a run waits for your OK: in To decide.
    const row = queue.getByTestId("today-group-ok").getByTestId("queue-search");
    await expect(row).toHaveCount(1);
    await expect(row).toBeInViewport({ ratio: 1 });
    await expect(row.locator(".cl-attn-who")).toHaveText(WAITING_SEARCH_NAME);
    // Waited three hours when the seed ran: the number moves with the clock, the words do not.
    await expect(row.locator(".cl-attn-wait")).toHaveText(/^\d+h$/);
    await expect(row.locator(".cl-attn-sentence")).toHaveText(WAITING_QUESTION);
    await expect(row.locator(".cl-attn-status")).toHaveText(
      "Waiting for your answer · nothing is spent while it waits",
    );
    const answer = row.getByRole("button", { name: "Answer", exact: true });
    await expect(answer).toBeInViewport({ ratio: 1 });
    await answer.click();
    await expect.poll(() => routeOf(page.url())).toBe(search.route);
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

  test("nobody in Need you is said again in Ask found, and Since you looked opens in place", async ({ page }) => {
    await expect(page.getByTestId("today-zones")).toBeVisible();
    // While you were away went (Today in three zones): what happened is the head's one line, and its rows open under it.
    await expect(page.getByTestId("today-away")).toHaveCount(0);
    if (await page.getByTestId("today-queue").count()) await expectNoQueueRepeat(page);
    await expectSinceOpens(page);
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
    // The head is the greeting and one sentence: no second headline under it (the redesign of 1 Nov 2026).
    await expect(page.getByTestId("today-head-lead")).toHaveCount(1);
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
