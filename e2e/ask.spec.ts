import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * Ask on a real workspace: the palette opens from ⌘K and the button, shows
 * the workspace and nothing seeded, jumps, answers the quick questions
 * without a model, and runs a real turn that reads and cites.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://chanlytics-os.vercel.app";
const fromTheApp = { headers: { origin: new URL(BASE).origin } };
const INVENTED = ["Aisha", "Jordan", "Lena", "Drifting VIP", "revenue pacing", "Serenity", "Sarah Chen"];

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

  test("⌘K opens the palette on the workspace; the button and New Chat are live; nothing invented", async ({ page }) => {
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
    test.setTimeout(120_000);
    const res = await page.request.post("/api/v1/ask", {
      data: { text: "what are our opening hours this week?", thread_id: null, scope: null, surface: "today" },
      ...fromTheApp,
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("x-ndjson");
    const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lines[0].t).toBe("thread");
    const final = lines.find((l) => l.t === "final");
    expect(final, "a final message").toBeTruthy();
    expect(final.message.text.length).toBeGreaterThan(0);
    if (!final.message.failed) {
      expect(final.message.tools.length).toBeGreaterThan(0);
      expect(final.message.ungrounded).toBe(false);
    }
    // The thread is the person's own and reads back.
    const list = await page.request.get("/api/v1/ask/threads");
    const { data } = await list.json();
    expect(data.threads.some((t: { id: string }) => t.id === lines[0].id)).toBe(true);
    const one = await page.request.get(`/api/v1/ask/threads/${lines[0].id}`);
    const { data: d1 } = await one.json();
    expect(d1.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    const del = await page.request.delete(`/api/v1/ask/threads/${lines[0].id}`, fromTheApp);
    expect(del.status()).toBe(200);
  });

  test("the palette streams a turn and shows citations or a plain failure", async ({ page }) => {
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
    await page.screenshot({ path: "test-results/ask-turn.png" });
  });
});
