import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

/**
 * Attachments, on a real workspace: the route that serves them is wired,
 * keeps the door, and says "no attachment" in the envelope rather than
 * failing. Whether a real photo renders inline needs a real photo, which a
 * customer sends and a test does not.
 */
test.describe("Attachments on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("an unknown message is a 404 in the envelope, never a redirect", async ({ page }) => {
    const res = await apiGet(page, "/api/v1/messages/3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c/media", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("not_found");
  });

  test("a message without a stored attachment says so", async ({ page }) => {
    const list = await apiGet(page, "/api/v1/conversations");
    const { data } = await list.json();
    const first = data.conversations?.[0];
    test.skip(!first, "no conversations in this workspace");
    const thread = await apiGet(page, `/api/v1/conversations/${first.id}`);
    const { data: t } = await thread.json();
    const textMsg = (t.messages ?? []).find((m: { type: string }) => m.type === "text");
    test.skip(!textMsg, "no text message to probe");
    const res = await apiGet(page, `/api/v1/messages/${textMsg.id}/media`, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.message).toContain("no stored attachment");
  });
});
