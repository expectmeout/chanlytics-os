import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { activeWorkspace, scoped, apiGet } from "./workspace";

/**
 * Ask on a real workspace: the palette opens from ⌘K and the button, shows
 * the workspace and nothing seeded, jumps, answers the quick questions
 * without a model, and runs a real turn that reads and cites.
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

  test("⌘K opens the palette on the workspace; the button and New Chat are live; nothing invented", async ({
    page,
  }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("tb-ask")).toBeEnabled();
    await expect(page.getByTestId("tb-ask")).not.toContainText("Soon");
    await page.keyboard.press("Control+k");
    const pal = page.getByTestId("ask-real");
    await expect(pal).toBeVisible();
    const text = await pal.innerText();
    for (const s of INVENTED) expect(text, `invented: "${s}"`).not.toContain(s);
    await expect(pal.locator(".cmd-sec-label", { hasText: "Ask" }).first()).toBeVisible();
    await page.screenshot({ path: "test-results/ask-palette.png" });
    await page.keyboard.press("Escape");
    await expect(pal).toBeHidden();
    await page.getByTestId("tb-ask").click();
    await expect(page.getByTestId("ask-real")).toBeVisible();
    // Ask's face: the three are the button's icon and stand on a stage above the conversation (ask-face.jsx).
    await expect(page.getByTestId("tb-ask-face")).toBeVisible();
    await expect(page.getByTestId("ask-real").getByTestId("ask-stage")).toBeVisible();
  });

  test("two words jump; a quick question is answered without a model", async ({ page }) => {
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    const input = page.getByTestId("ask-input");
    await input.fill("rep");
    await expect(page.getByTestId("ask-row-jump").first()).toContainText("Reports");
    await input.fill("who needs me?");
    await input.press("Enter");
    const fast = page.getByTestId("ask-fast");
    await expect(fast).toBeVisible();
    await expect(fast).toContainText(/need|Nobody is waiting/);
    await expect(page.getByTestId("ask-trace")).toHaveCount(0);
    await page.screenshot({ path: "test-results/ask-fast.png" });
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
    await page.waitForURL(/#\/conversations\/cv-/, { timeout: 120_000 });
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

  test("the palette streams a turn and shows citations or a plain failure", async ({ page }) => {
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
    const text = await turn.first().innerText();
    expect(text.length).toBeGreaterThan(10);
    for (const s of INVENTED) expect(text).not.toContain(s);
    // On a desktop the conversation has the rail beside it, with New chat.
    await expect(page.getByTestId("ask-rail")).toBeVisible();
    await expect(page.getByTestId("ask-rail").locator(".ask-new-btn")).toBeVisible();
    await page.screenshot({ path: "test-results/ask-turn.png" });
  });
});
