import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { activeWorkspace, scoped } from "./workspace";

/**
 * The text whisper's route, on a real workspace: wired, keeping its doors,
 * and refusing with a sentence what cannot be rewritten. A real rewrite
 * needs a draft that is counting down, which only a customer's message
 * produces; nothing here reaches the model.
 *
 * A POST from the request context carries no Origin, which the app reads as
 * a cross-site write and refuses — correctly. The app's own requests carry
 * their origin, so these do too, and the refusal is pinned as its own case.
 */
const BASE = process.env.E2E_BASE_URL ?? "https://app.chanlytics.com";
const fromTheApp = { headers: { origin: new URL(BASE).origin } };

test.describe("Rewriting a held draft on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a write that did not come from the app is refused before anything else", async ({ page }) => {
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/messages/3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c/steer", ws), { data: { text: "shorter" } });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });

  test("an unknown message is a 404 in the envelope", async ({ page }) => {
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/messages/3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c/steer", ws), { data: { text: "shorter" }, ...fromTheApp });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("not_found");
  });

  test("a reply that already went out cannot be rewritten, and the route says so", async ({ page }) => {
    const ws = await activeWorkspace(page);
    const list = await page.request.get("/api/v1/conversations");
    const { data } = await list.json();
    const first = data.conversations?.[0];
    test.skip(!first, "no conversations in this workspace");
    const thread = await page.request.get(`/api/v1/conversations/${first.id}`);
    const { data: t } = await thread.json();
    const sent = (t.messages ?? []).find((m: { sender: string; status?: string }) => m.sender === "ai" && m.status !== "queued");
    test.skip(!sent, "no sent reply to probe");
    const res = await page.request.post(scoped(`/api/v1/messages/${sent.id}/steer`, ws), { data: { text: "shorter" }, ...fromTheApp });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error.message).toContain("not waiting");
  });

  test("an empty instruction is refused at the door: the message is the row, judged first, then the words", async ({ page }) => {
    const ws = await activeWorkspace(page);
    // A message that is not this workspace's is not found, whatever the body says.
    const stranger = await page.request.post(scoped("/api/v1/messages/3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c/steer", ws), { data: { text: "   " }, ...fromTheApp });
    expect(stranger.status()).toBe(404);
    // On a reply of this workspace, the words are judged before the draft is,
    // so a blank instruction is a validation refusal whatever the reply's state.
    const list = await page.request.get("/api/v1/conversations");
    const { data } = await list.json();
    const first = data.conversations?.[0];
    test.skip(!first, "no conversations in this workspace");
    const thread = await page.request.get(`/api/v1/conversations/${first.id}`);
    const { data: t } = await thread.json();
    const reply = (t.messages ?? []).find((m: { sender: string }) => m.sender === "ai");
    test.skip(!reply, "no reply to probe");
    const res = await page.request.post(scoped(`/api/v1/messages/${reply.id}/steer`, ws), { data: { text: "   " }, ...fromTheApp });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("what should change");
  });
});
