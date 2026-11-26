/**
 * The shell's accept of invitations is made only where one is open (invitations/accept.ts; "Pages that open at once", piece
 * 8). It was made on every load, 52 loads in 52 in the phone sweep of 23 Nov 2026, a function, a session check and a read of
 * invitations each time, for the few loads that seat someone. The list of workspaces says now whether an invitation is open
 * for the address the session proved (GET workspaces, user.invited, team.ts hasOpenInvites), and the boot makes the accept
 * only where it says so or cannot say (a server from before it said so). A person with no workspace and nothing open is not
 * held for an accept that could seat them nowhere. Its own file: the accept is once a process.
 *
 * Run on the real list route over a database in memory, and on the real workspace surface over a scripted wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const workspaces = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const L = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionTables = () => ({
  memberships: [
    { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York", logo_path: null }],
  profiles: [],
});
const invitation = (over) => ({
  id: "inv-1",
  tenant_id: L,
  role: "operator",
  email: "ada@example.com",
  accepted_at: null,
  revoked_at: null,
  expires_at: "2999-01-01T00:00:00Z",
  ...over,
});
const listWith = async (invitations) => {
  setServiceClient(fakeDb({ invitations }));
  try {
    const ctx = {
      supabase: fakeDb(sessionTables(), {}, { platform_staff_state: () => "none" }),
      userId: "u1",
      email: "Ada@example.com",
      params: {},
    };
    return await workspaces.GET.run(new Request("http://localhost/api/v1/workspaces"), ctx);
  } finally {
    setServiceClient(null);
  }
};

test("the list of workspaces says whether an invitation is open for the address the session proved", async () => {
  assert.equal((await listWith([invitation()])).user.invited, true, "open, to this address whatever its case");
  assert.equal((await listWith([])).user.invited, false, "none");
  assert.equal((await listWith([invitation({ accepted_at: "2026-11-01T00:00:00Z" })])).user.invited, false, "taken up");
  assert.equal((await listWith([invitation({ revoked_at: "2026-11-01T00:00:00Z" })])).user.invited, false, "revoked");
  assert.equal((await listWith([invitation({ expires_at: "2026-01-01T00:00:00Z" })])).user.invited, false, "expired");
  assert.equal((await listWith([invitation({ email: "bo@example.com" })])).user.invited, false, "someone else's");
});

/* ---- the boot, over a scripted wire ---- */
globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/harbor/today", hash: "", search: "" };
globalThis.document ??= { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage ??= storage();
globalThis.sessionStorage ??= storage();
const bus = new EventTarget();
globalThis.window.addEventListener = (...a) => bus.addEventListener(...a);
globalThis.window.removeEventListener = (...a) => bus.removeEventListener(...a);
globalThis.window.dispatchEvent = (e) => bus.dispatchEvent(e);
globalThis.location.replace = () => {};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls = [];
let list = null;
globalThis.window.fetch = async (url, init = {}) => {
  const line = `${init.method ?? "GET"} ${new URL(String(url), "https://app.chanlytics.com").pathname.replace("/api/v1/", "")}`;
  calls.push(line);
  if (line === "GET workspaces") return json(200, { ok: true, data: list });
  if (line === "POST me/invitations/accept") return json(200, { ok: true, data: { joined: [] } });
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};

const { api } = await importSrc("apps/dashboard/src/bridge/api.ts");
const { workspaceOverride } = await importSrc("apps/dashboard/src/bridge/surface-data.ts");

test("a boot whose list says nothing is open makes no accept, and a person in no workspace is not held for one", async () => {
  const me = { id: "u1", email: "ada@example.com", role: "owner", invited: false };
  const ws = { id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" };
  list = { workspaces: [ws], active_workspace_id: A, user: me };
  await workspaceOverride.apply();
  assert.deepEqual(calls, ["GET workspaces"], "the list alone");

  api().forget();
  calls.length = 0;
  list = { workspaces: [], active_workspace_id: null, user: me };
  const began = Date.now();
  await workspaceOverride.apply();
  assert.deepEqual(calls, ["GET workspaces"], "no accept for a list that holds no workspace either");
  assert.ok(Date.now() - began < 2000, "and nothing waited for one");
});
