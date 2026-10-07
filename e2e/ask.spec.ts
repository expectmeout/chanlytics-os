import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { atRoute, routeOf } from "./address";
import { activeWorkspace, scoped, apiGet } from "./workspace";
import { WAITING_QUESTION, WAITING_SEARCH_NAME, refuseAnswers, waitingSearch } from "./waiting-search";

/**
 * Ask on a real workspace, as the Line: it opens from ⌘K and the top bar's
 * button, shows the workspace and nothing seeded, draws no key, jumps,
 * answers the quick questions without a model, and runs a real turn that
 * reads and cites.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";
const fromTheApp = { headers: { origin: new URL(BASE).origin } };
const INVENTED = ["Aisha", "Jordan", "Lena", "Drifting VIP", "revenue pacing", "Serenity", "Sarah Chen"];
/**
 * A real turn spends model tokens on whichever workspace the run signs in to.
 * The nightly runs without them and each of the five says so in its skip;
 * E2E_PAID_MODEL=1 puts them back for a run that should spend.
 */
const PAID = process.env.E2E_PAID_MODEL === "1";
const WHY_UNPAID = "a real model turn costs money: set E2E_PAID_MODEL=1 to run it";

test.describe("Ask, without a session", () => {
  test("the turn route refuses a cross-site POST and an unauthenticated one", async ({ request }) => {
    const anon = await request.post("/api/v1/ask", { data: { text: "who needs me?" }, ...fromTheApp });
    expect([401, 403]).toContain(anon.status());
  });
});

test.describe("Ask on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("⌘K opens the Line on the workspace; the top bar's button is the one door; nothing invented, no key drawn", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("tb-ask")).toBeEnabled();
    await expect(page.getByTestId("tb-ask")).not.toContainText("Soon");
    await expect(page.getByRole("button", { name: "New Chat" }), "one door to Ask (the Line, D8)").toHaveCount(0);
    await page.keyboard.press("Control+k");
    const pal = page.getByTestId("ask-real");
    await expect(pal).toBeVisible();
    const text = await pal.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    expect(text, "no key is drawn in the Line (D17)").not.toMatch(/[↵⌘]|\besc\b/i);
    // At rest: Right now first, then the page's own questions.
    await expect(pal.getByTestId("ask-row-now")).toBeVisible();
    await expect(pal.locator(".ask-rows-label", { hasText: "Ask about Today" })).toBeVisible();
    await page.screenshot({ path: "test-results/ask-line.png" });
    await page.keyboard.press("Escape");
    await expect(pal).toBeHidden();
    await page.getByTestId("tb-ask").click();
    await expect(page.getByTestId("ask-real")).toBeVisible();
    // Ask's face: the three are the button's icon, and stand in the line while it is open (ask-face.jsx).
    await expect(page.getByTestId("ask-real").getByTestId("ask-line-face")).toBeVisible();
  });

  test("two words jump; a quick question is answered without a model, as the Line draws an answer", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill("rep");
    await expect(page.getByTestId("ask-row-jump").first()).toContainText("Reports");
    await input.fill("who needs me?");
    await input.press("Enter");
    const say = page.getByTestId("ask-say");
    await expect(say).toBeVisible();
    await expect(say).toContainText(/waiting/);
    await expect(page.getByTestId("ask-trace")).toHaveCount(0);
    await page.screenshot({ path: "test-results/ask-quick.png" });
  });

  test("Right now says a search is waiting: its pill and its clause, and Brief me names it with a door to the pile it asks about", async ({
    page,
  }) => {
    // Brief me asks "Who needs me right now?", which the Line answers from what the page holds, without a model;
    // refuseAnswers holds that to it (a turn that reached the model would be refused and counted).
    const attempts = await refuseAnswers(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    const search = await waitingSearch(page);
    await page.keyboard.press("Control+k");
    const pal = page.getByTestId("ask-real");
    const now = pal.getByTestId("ask-row-now");
    await expect(now).toBeInViewport({ ratio: 1 });
    await expect(now.getByTestId("ask-pill").filter({ hasText: /search/ })).toHaveText("1 search waiting");
    // The search's clause of the sentence: first, capitalised, when nobody else is waiting; after a "; " otherwise.
    await expect(now.locator(".ask-row-label")).toContainText(
      new RegExp(`(^|; )[Yy]our search for ${WAITING_SEARCH_NAME} is waiting for your answer[.;]`),
    );
    await now.getByTestId("ask-row-brief").click();
    await expect(pal.getByTestId("ask-say")).toBeVisible();
    await expect(pal.getByTestId("ask-trace")).toHaveCount(0);
    const item = pal.getByTestId("ask-item").filter({ hasText: WAITING_SEARCH_NAME });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("Leads");
    await expect(item).toContainText(WAITING_QUESTION);
    await item.click();
    await expect.poll(() => routeOf(page.url())).toBe(search.route);
    await expect(page.getByTestId("lead-strip").getByTestId("strip-title")).toHaveText(WAITING_QUESTION);
    expect(attempts, "Brief me spent no turn and answered nothing").toEqual([]);
  });

  test("a real turn reads the workspace and answers with what it read", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(120_000);
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/ask", ws), {
      data: { text: "what are our opening hours this week?", thread_id: null, scope: null, surface: "today" },
      ...fromTheApp,
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("x-ndjson");
    const lines = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    expect(lines[0].t).toBe("thread");
    const final = lines.find((l) => l.t === "final");
    expect(final, "a final message").toBeTruthy();
    expect(final.message.text.length).toBeGreaterThan(0);
    if (!final.message.failed) {
      // Hours come from the prompt now: a one-round answer with no read is the
      // intended shape, and it is grounded (the facts are the workspace's).
      expect(final.message.rounds).toBeGreaterThanOrEqual(1);
      expect(final.message.ungrounded).toBe(false);
    }
    // The thread is the person's own and reads back.
    const list = await apiGet(page, "/api/v1/ask/threads");
    const { data } = await list.json();
    expect(data.threads.some((t: { id: string }) => t.id === lines[0].id)).toBe(true);
    const one = await apiGet(page, `/api/v1/ask/threads/${lines[0].id}`);
    const { data: d1 } = await one.json();
    expect(d1.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    const del = await page.request.delete(scoped(`/api/v1/ask/threads/${lines[0].id}`, ws), fromTheApp);
    expect(del.status()).toBe(200);
  });

  test("a request to act becomes a card with Approve and Not now, and the test never approves it", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(120_000);
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/ask", ws), {
      data: { text: "invite ask-e2e-card@example.com as a viewer", thread_id: null, scope: null, surface: "settings" },
      ...fromTheApp,
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const lines = (await res.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const final = lines.find((l) => l.t === "final");
    expect(final).toBeTruthy();
    if (!final.message.failed) {
      const invite = final.message.proposals.find((p: { kind: string }) => p.kind === "invite");
      expect(invite, "an invite card").toBeTruthy();
      expect(invite.needs).toBe("owner");
      expect(invite.payload.email).toBe("ask-e2e-card@example.com");
      expect(final.message.text).not.toMatch(/\bI (have )?(sent|invited)\b/i);
      // Dismissing is recorded on the turn; approving would send a real email.
      const out = await page.request.post(
        scoped(`/api/v1/ask/messages/${final.message.id}/proposals/${invite.id}`, ws),
        {
          data: { state: "dismissed", receipt: "Not now", atMs: Date.now() },
          ...fromTheApp,
        },
      );
      expect(out.status()).toBe(200);
      const back = await apiGet(page, `/api/v1/ask/threads/${lines[0].id}`);
      const { data } = await back.json();
      const stored = data.messages[1].proposals.find((p: { id: string }) => p.id === invite.id);
      expect(stored.outcome.state).toBe("dismissed");
    }
    await page.request.delete(scoped(`/api/v1/ask/threads/${lines[0].id}`, ws), fromTheApp);
  });

  test("opening a call from the palette lands on the call, in its thread", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(150_000);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill("open the transcript of the most recent call");
    await input.press("Enter");
    // The answer lands and the app goes there by itself; the palette closes.
    await page.waitForURL(atRoute(/^conversations\/cv-/), { timeout: 120_000 });
    await expect(page.getByTestId("ask-real")).toBeHidden();
    // A call is drawn as its card: in its thread, opened there, or alone in the thread's frame (calls-in-the-thread).
    await expect(page.getByTestId("tl-call").first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: "test-results/ask-clickthrough.png" });
    // ⌘K brings the conversation back where it was.
    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("ask-turn").first()).toBeVisible();
  });

  test("the same question twice is one thread, not twins", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(150_000);
    // A question of its own, so older threads that also mention today's
    // writers (the eval set asks about them) are not counted as twins.
    const nonce = Date.now().toString(36).slice(-5);
    const question = `who wrote today? check ${nonce}`;
    const ws = await activeWorkspace(page);
    const ask = async () => {
      const res = await page.request.post(scoped("/api/v1/ask", ws), {
        data: { text: question, thread_id: null, scope: null, surface: "today" },
        ...fromTheApp,
        timeout: 90_000,
      });
      expect(res.status()).toBe(200);
      return (await res.text())
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .find((l) => l.t === "thread").id as string;
    };
    const first = await ask();
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill(`Who wrote today? Check ${nonce}`);
    await input.press("Enter");
    await expect(page.getByTestId("ask-turn").first()).toBeVisible({ timeout: 120_000 });
    await expect(page.locator(".ask-cursor")).toHaveCount(0, { timeout: 120_000 });
    const list = await apiGet(page, "/api/v1/ask/threads");
    const { data } = await list.json();
    const twins = data.threads.filter((t: { title: string }) => t.title.includes(nonce));
    expect(twins.length, "one thread for one question").toBe(1);
    expect(twins[0].id).toBe(first);
    await page.request.delete(scoped(`/api/v1/ask/threads/${first}`, ws), fromTheApp);
  });

  test("the Line streams a turn and shows its answer or a plain failure, with Clear to end it", async ({ page }) => {
    test.skip(!PAID, WHY_UNPAID);
    test.setTimeout(120_000);
    await page.goto("/#/inbox");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill("what are our hours this week?");
    await input.press("Enter");
    const turn = page.getByTestId("ask-turn");
    await expect(turn.first()).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".ask-cursor")).toHaveCount(0, { timeout: 90_000 });
    const text = await page.getByTestId("ask-say").innerText();
    expect(text.length).toBeGreaterThan(10);
    for (const s of INVENTED) expect(text).not.toContain(s);
    await page.screenshot({ path: "test-results/ask-turn.png" });
    // Clear ends the conversation; the Line is home again.
    await page.getByTestId("ask-clear").click();
    await expect(page.getByTestId("ask-row-now")).toBeVisible();
  });
});

/**
 * One paid question on each of five surfaces, each carrying its page the way the palette sends it: the context is the
 * palette's own (window.__ask.context, legacy-bridge/ask/context.ts, over what the page drew), warmed as the Line
 * warms it on open (POST ask/warm), then sent with the question. The turn answers, carries no failure and names
 * nothing the workspace does not hold. The eval's cases on these surfaces (tooling/evals/ask-cases.json) grade the
 * answers; this proves the page rides a real turn end to end.
 */
const ON_THE_PAGE: Array<{ surface: string; hash: string; text: string; rows: boolean }> = [
  { surface: "today", hash: "today", text: "who needs me right now?", rows: false },
  { surface: "inbox", hash: "inbox", text: "what does the person in this list want?", rows: false },
  { surface: "people", hash: "clients", text: "how many people are on this list?", rows: true },
  { surface: "leads", hash: "clients/leads", text: "which of these leads has a website?", rows: true },
  { surface: "reports", hash: "reports", text: "how did this period go?", rows: false },
];

test.describe("Ask with the page it is asked on", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const q of ON_THE_PAGE)
    test(`a question on ${q.surface} carries its page, and the turn answers from this workspace alone`, async ({
      page,
    }) => {
      test.skip(!PAID, WHY_UNPAID);
      test.setTimeout(120_000);
      await page.goto(`/#/${q.hash}`);
      await page.waitForLoadState("networkidle");
      test.skip(!(await page.evaluate(() => !!(window as { __ask?: unknown }).__ask)), "no Ask client on this page");
      const context = await page.evaluate((words) => {
        const { CHANLY } = window as unknown as { CHANLY: { address: { route: () => string } } };
        const [p, ...rest] = CHANLY.address.route().split("/");
        const ask = (window as unknown as { __ask: { context: (r: unknown, w: string) => unknown } }).__ask;
        return ask.context({ page: p || "today", param: rest.length ? rest.join("/") : null }, words) as {
          surface: string;
          rows: Array<{ kind: string; id: string }>;
        };
      }, q.text);
      expect(context.surface).toBe(q.surface);
      if (q.rows) expect(context.rows.length, "the rows the page drew ride along").toBeGreaterThan(0);
      const ws = await activeWorkspace(page);
      const warm = await page.request.post(scoped("/api/v1/ask/warm", ws), { data: context, ...fromTheApp });
      expect(warm.status(), "the palette's warm is taken").toBe(200);
      const res = await page.request.post(scoped("/api/v1/ask", ws), {
        data: { text: q.text, thread_id: null, scope: null, surface: q.surface, context },
        ...fromTheApp,
        timeout: 90_000,
      });
      expect(res.status()).toBe(200);
      const lines = (await res.text())
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      const final = lines.find((l) => l.t === "final");
      expect(final, "a final message").toBeTruthy();
      expect(final.message.failed, final.message.text).toBeFalsy();
      expect(final.message.text.length).toBeGreaterThan(0);
      for (const s of INVENTED) expect(final.message.text, `invented: "${s}"`).not.toContain(s);
      await page.request.delete(scoped(`/api/v1/ask/threads/${lines[0].id}`, ws), fromTheApp);
    });
});

test.describe("Ask on a phone", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the ✦ opens the takeover; words typed survive a close by Back and come back on the next open", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("phone-ask").tap();
    const ask = page.getByTestId("ask-real");
    await expect(ask).toBeVisible();
    await ask.getByTestId("ask-input").fill("how did the");
    // The takeover pushed one entry of its own as it opened (ask-real.jsx, S8): Back closes it and stays on Today.
    await page.goBack();
    await expect(ask).toHaveCount(0);
    await expect(page).toHaveURL(atRoute(/^today$/));
    // The words are kept as typed (S9) and are back in the field on the next open.
    await page.getByTestId("phone-ask").tap();
    await expect(ask).toBeVisible();
    await expect(ask.getByTestId("ask-input")).toHaveValue("how did the");
  });
});
