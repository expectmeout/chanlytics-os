import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

/**
 * Exports, on a real workspace, from the routes that write the files.
 *
 * The signed-in session is the workspace owner, so the whole customer list is
 * theirs to take. Nothing is written; every request here is a read.
 */
const PEOPLE_HEADER = "name,whatsapp_name,phone,consent,consent_source,consent_updated,offers_consent,offers_consent_source,offers_consent_updated,do_not_contact,channels,conversations,calls,escalations,first_contact,last_message,last_inbound,last_call,receptionist";

test.describe("Exports on a real workspace", () => {
  test.skip(!HAVE_SESSION, WHY_SKIPPED);
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("everyone as a CSV: an attachment, private, with the fixed header", async ({ page }) => {
    const ws = await page.request.get("/api/v1/workspaces");
    expect(ws.status()).toBe(200);
    const { data } = await ws.json();
    const id = data.activeWorkspaceId ?? data.workspaces[0]?.id;
    expect(id).toBeTruthy();

    const res = await page.request.get(`/api/v1/contacts/export?workspace=${id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toContain("attachment;");
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    const body = await res.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body.slice(1).split("\r\n")[0]).toBe(PEOPLE_HEADER);
  });

  test("a thread as text, when the workspace has one", async ({ page }) => {
    const list = await apiGet(page, "/api/v1/conversations");
    expect(list.status()).toBe(200);
    const { data } = await list.json();
    const first = data.conversations?.[0];
    test.skip(!first, "no conversations in this workspace");

    const res = await apiGet(page, `/api/v1/conversations/${first.id}/export`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");
    const text = await res.text();
    expect(text.startsWith("Conversation with ")).toBe(true);
    expect(text).toContain("· WhatsApp · ");
    expect(text).toContain("· times in ");
  });

  test("a call as text, when the workspace has one", async ({ page }) => {
    const list = await apiGet(page, "/api/v1/calls");
    expect(list.status()).toBe(200);
    const { data } = await list.json();
    const first = data.calls?.[0];
    test.skip(!first, "no calls in this workspace");

    const res = await apiGet(page, `/api/v1/calls/${first.id}/export`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");
    const text = await res.text();
    expect(text.startsWith("Phone call with ")).toBe(true);
    expect(text).toContain("Transcript");
  });
});
