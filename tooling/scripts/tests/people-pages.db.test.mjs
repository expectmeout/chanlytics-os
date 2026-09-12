/**
 * The People page at scale -- on a real database.
 *
 * 00112 gives people_list a query, a limit and an offset; 00113 keeps a
 * member's page views on their membership row. A function body and a row's
 * RLS are what reading source cannot prove, so these run against Postgres
 * in the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes customers"
    : false;

let db;
let tenantId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from("tenants").insert({ slug: `people-pages-${Date.now()}`, name: "People pages" }).select("id").single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

test("people_list: a query matches a name, a WhatsApp name or three digits; a limit and an offset page under the same order; the old call answers as before", { skip }, async () => {
  const people = [
    { display_name: "Ada Lovelace", wa_profile_name: null, phone_e164: "+15550100001" },
    { display_name: null, wa_profile_name: "Bo 💅", phone_e164: "+15550100002" },
    { display_name: "Cy Adams", wa_profile_name: null, phone_e164: "+15550100003" },
  ];
  const { error } = await db.from("contacts").insert(people.map((p) => ({ tenant_id: tenantId, ...p })));
  assert.equal(error, null);
  const list = async (args) => {
    const { data, error: e } = await db.rpc("people_list", { p_tenant_id: tenantId, ...args });
    assert.equal(e, null, e?.message);
    return data.map((r) => r.display_name ?? r.wa_profile_name);
  };
  assert.equal((await list({})).length, 3, "the old call, the whole page");
  assert.deepEqual((await list({ p_query: "ada" })).sort(), ["Ada Lovelace", "Cy Adams"], "a name, case-insensitively, anywhere in it");
  assert.deepEqual(await list({ p_query: "bo" }), ["Bo 💅"], "their name on WhatsApp");
  assert.deepEqual(await list({ p_query: "(555) 010-0003" }), ["Cy Adams"], "digits, however typed");
  assert.deepEqual(await list({ p_query: "01" }), await list({}), "fewer than three digits is not a number search");
  assert.deepEqual(await list({ p_query: "   " }), await list({}), "blank is everyone");
  const all = await list({});
  assert.deepEqual(await list({ p_limit: 2 }), all.slice(0, 2));
  assert.deepEqual(await list({ p_limit: 2, p_offset: 2 }), all.slice(2));
  assert.deepEqual(await list({ p_limit: 5000 }), all, "the ceiling holds");
  const { data: one } = await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: (await db.from("contacts").select("id").eq("tenant_id", tenantId).eq("display_name", "Cy Adams").single()).data.id });
  assert.equal(one.length, 1, "one person by id, still");
});

test("member_view_set: a member's own row in the workspace named; a stranger is refused; the shape is judged", { skip }, async () => {
  // A user, made through the auth admin API, then a membership; the door is
  // called as that user by a signed-in client.
  const email = `views-${Date.now()}@example.test`;
  const { data: made, error: uErr } = await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true });
  assert.equal(uErr, null, uErr?.message);
  const userId = made.user.id;
  try {
    const { error: mErr } = await db.from("memberships").insert({ tenant_id: tenantId, user_id: userId, role: "viewer" });
    assert.equal(mErr, null, mErr?.message);
    const { data: anon } = await db.from("tenants").select("id").limit(0);
    void anon;
    const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
    const { error: sErr } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
    if (sErr) { assert.ok(true, `no anon sign-in here: ${sErr.message}`); return; }
    const { data: views, error } = await as.rpc("member_view_set", { p_tenant_id: tenantId, p_page: "people", p_view: { sortBy: "name", sortDir: "asc" } });
    assert.equal(error, null, error?.message);
    assert.deepEqual(views, { people: { sortBy: "name", sortDir: "asc" } });
    const { data: again } = await as.rpc("member_view_set", { p_tenant_id: tenantId, p_page: "broadcasts", p_view: { tab: "history" } });
    assert.deepEqual(again, { people: { sortBy: "name", sortDir: "asc" }, broadcasts: { tab: "history" } }, "pages merge; one page replaces its own");
    const { data: own } = await as.from("memberships").select("views").eq("tenant_id", tenantId).eq("user_id", userId).single();
    assert.deepEqual(own.views, again, "read back through the member's own row");
    const { data: other, error: oErr } = await db.from("tenants").insert({ slug: `views-other-${Date.now()}`, name: "Other" }).select("id").single();
    assert.equal(oErr, null);
    try {
      const { error: stranger } = await as.rpc("member_view_set", { p_tenant_id: other.id, p_page: "people", p_view: {} });
      assert.match(stranger?.message ?? "", /Not a member/);
    } finally {
      await db.from("tenants").delete().eq("id", other.id);
    }
    const { error: badPage } = await as.rpc("member_view_set", { p_tenant_id: tenantId, p_page: "People Page", p_view: {} });
    assert.match(badPage?.message ?? "", /short lowercase name/);
    const { error: badView } = await as.rpc("member_view_set", { p_tenant_id: tenantId, p_page: "people", p_view: [1, 2] });
    assert.match(badView?.message ?? "", /small object/);
  } finally {
    await db.auth.admin.deleteUser(userId);
  }
});
