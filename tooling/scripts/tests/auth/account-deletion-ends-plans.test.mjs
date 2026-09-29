/**
 * Deleting your account ends the plans of the workspaces you were the only member of (00248): the door pauses each
 * and names it, and DELETE /me asks the edge's billing door to end its plan -- so a card whose holder can no longer
 * sign in is charged nothing more. An edge that cannot end one never fails the deletion, which already happened; the
 * plan's next event there ends it (billing-door.test.mjs). The real route runs over the suite's fake database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_PROVIDERS = "live";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_URL = "https://edge.example.com";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const me = await import(at("apps/dashboard/app/api/v1/me/route.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function world(answer, edge) {
  setRateStore(memoryStore());
  const supabase = fakeDb({ memberships: [] }, {}, { delete_my_account: () => answer });
  supabase.auth = { signOut: async () => ({ error: null }) };
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    asked.push({ url: String(url), body: JSON.parse(init?.body ?? "null") });
    return edge(String(url));
  };
  const ctx = { supabase, userId: "u1", email: "ada@example.com", params: {} };
  const del = () => me.DELETE.run(new Request("http://localhost/api/v1/me", { method: "DELETE" }), ctx);
  return { asked, del, restore: () => (globalThis.fetch = realFetch) };
}

test("the plans of the workspaces the account emptied are ended through the edge, one call each; a workspace with others in it is not asked about", async () => {
  const w = world({ deleted: true, workspaces_left_empty: 2, workspaces_emptied: [A, B] }, () =>
    Response.json({ ok: true, status: "canceled" }),
  );
  try {
    assert.deepEqual(await w.del(), { deleted: true, workspaces_left_empty: 2 });
  } finally {
    w.restore();
  }
  assert.deepEqual(
    w.asked.map((a) => [a.url, a.body]),
    [
      ["https://edge.example.com/api/admin/billing", { op: "end", tenant_id: A }],
      ["https://edge.example.com/api/admin/billing", { op: "end", tenant_id: B }],
    ],
  );
});

test("an edge that cannot end a plan never fails the deletion, which already happened; nothing emptied asks nothing", async () => {
  const w = world({ deleted: true, workspaces_left_empty: 1, workspaces_emptied: [A] }, () =>
    Response.json({ ok: false, error: "stripe_refused" }, { status: 502 }),
  );
  const said = [];
  const realError = console.error;
  console.error = (...args) => said.push(args[0]);
  try {
    assert.deepEqual(await w.del(), { deleted: true, workspaces_left_empty: 1 });
  } finally {
    console.error = realError;
    w.restore();
  }
  assert.deepEqual(said, ["account_delete_plan_not_ended"]);

  const none = world({ deleted: true, workspaces_left_empty: 0, workspaces_emptied: [] }, () => {
    throw new Error("nothing should be asked");
  });
  try {
    assert.deepEqual(await none.del(), { deleted: true, workspaces_left_empty: 0 });
  } finally {
    none.restore();
  }
  assert.deepEqual(none.asked, []);
});
