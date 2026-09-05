import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";

/**
 * The text whisper's route, on a real workspace: wired, keeping its doors,
 * and refusing with a sentence what cannot be rewritten. A real rewrite
 * needs a draft that is counting down, which only a customer's message
 * produces; nothing here reaches the model.
 */
test.describe("Rewriting a held draft on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("an unknown message is a 404 in the envelope", async ({ page }) => {
    const res = await page.request.post("/api/v1/messages/3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c/steer", { data: { text: "shorter" } });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("not_found");
  });

  test("a reply that already went out cannot be rewritten, and the route says so", async ({ page }) => {
    const list = await page.request.get("/api/v1/conversations");
    const { data } = await list.json();
    const first = data.conversations?.[0];
    test.skip(!first, "no conversations in this workspace");
    const thread = await page.request.get(`/api/v1/conversations/${first.id}`);
    const { data: t } = await thread.json();
    const sent = (t.messages ?? []).find((m: { sender: string; status?: string }) => m.sender === "ai" && m.status !== "queued");
    test.skip(!sent, "no sent reply to probe");
    const res = await page.request.post(`/api/v1/messages/${sent.id}/steer`, { data: { text: "shorter" } });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.message).toContain("not waiting");
  });

  test("an empty instruction is refused before anything is looked up", async ({ page }) => {
    const res = await page.request.post("/api/v1/messages/3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c/steer", { data: { text: "   " } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("what should change");
  });
});
