import { test, expect } from "@playwright/test";
import { signIn, HAVE_SESSION, WHY_SKIPPED } from "./session";
import { apiGet } from "./workspace";

/**
 * Exports, on a real workspace, from the routes that write the files.
 *
 * The signed-in session is the workspace owner, so the whole customer list is
 * theirs to take. Every request here is a read; each file taken is a row on the
 * ledger, which says who took it.
 */
const PEOPLE_HEADER =
  "name,whatsapp_name,phone,email,consent,consent_source,consent_updated,offers_consent,offers_consent_source,offers_consent_updated,do_not_contact,channels,conversations,calls,escalations,first_contact,last_message,last_inbound,last_call,receptionist," +
  // Appended by the wiring's second audit (R14 X3, #1595): email's own answer about offers, and what each yes covers.
  "email_offers,email_offers_source,email_offers_updated,email_unreachable_since,consent_covers,offers_covers";

/** The workspace's file's sections, in its order (contracts EXPORT_SECTIONS). */
const WORKSPACE_SECTIONS = [
  "people",
  "conversations",
  "files",
  "calls",
  "consent_history",
  "notes_and_steps",
  "deals",
  "business",
  "team",
  "bookings",
  "lists",
  "list_members",
  "campaigns",
  "sends",
  "templates",
  "holds",
  "rules",
  "reviews",
  "leads",
  "reach_out_replies",
];
/** One person's (contracts PERSON_EXPORT_SECTIONS): the workspace's, less its own five. */
const WORKSPACES_OWN = new Set(["business", "team", "campaigns", "templates", "reviews"]);
const PERSON_SECTIONS = WORKSPACE_SECTIONS.filter((s) => !WORKSPACES_OWN.has(s));

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

  test("the workspace's own copy: one JSON file that parses, every section in order, what it counted and what it leaves out", async ({
    page,
  }) => {
    const res = await apiGet(page, "/api/v1/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="workspace-.+.json"/);
    expect(res.headers()["cache-control"]).toBe("private, no-store");
    const doc = await res.json();
    expect(doc.format).toBe("chanlytics-workspace-export");
    expect(Object.keys(doc)).toEqual([
      "format",
      "version",
      "workspace",
      ...WORKSPACE_SECTIONS,
      "manifest",
      "not_included",
    ]);
    expect(doc.manifest.people).toBe(doc.people.length);
    for (const left of doc.not_included) expect(left.why).toBeTruthy();
  });

  test("one person's own copy, when the workspace has someone: their records alone (R14 X5)", async ({ page }) => {
    const list = await apiGet(page, "/api/v1/contacts");
    expect(list.status()).toBe(200);
    const first = (await list.json()).data.people?.[0] as { id: string } | undefined;
    test.skip(!first, "no people in this workspace");
    const id = first?.id ?? "";

    const res = await apiGet(page, `/api/v1/export?person=${id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="person-.+.json"/);
    const doc = await res.json();
    expect(doc.format).toBe("chanlytics-person-export");
    expect(doc.person).toEqual({ id });
    expect(Object.keys(doc)).toEqual([
      "format",
      "version",
      "workspace",
      "person",
      ...PERSON_SECTIONS,
      "manifest",
      "not_included",
    ]);
    expect(doc.people.map((p: { id: string }) => p.id)).toEqual([id]);
    for (const c of doc.conversations as { contact_id: string }[]) expect(c.contact_id).toBe(id);
    for (const c of doc.calls as { contact_id: string | null }[]) expect(c.contact_id).toBe(id);
    for (const n of doc.notes_and_steps as { contact_id: string }[]) expect(n.contact_id).toBe(id);
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
