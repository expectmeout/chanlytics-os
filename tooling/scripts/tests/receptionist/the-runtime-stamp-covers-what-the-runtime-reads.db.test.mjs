/**
 * The runtime stamp covers what the runtime reads, on a real database (00330).
 *
 * loadTenantRuntime keeps a workspace's runtime per instance for up to ten minutes and reads it again only when
 * runtime_stamp (00059) says something changed. The stamp named the settings, the policies and the workspace row, and
 * not the channels, the listing or the lines the same read carries, so a channel reconnected or a token rewritten
 * reached a warm instance up to ten minutes late. A SQL function's text can be read; what it answers on a row written,
 * changed and deleted cannot be read from source. Runs against Postgres in the database workflow; skipped without a
 * local database. Service role: the stamp is the edge's, and no member may call it.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes channels"
      : false;

let db;
let tenantId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `stamp-${Date.now()}`, name: "Stamp" })
    .select("id")
    .single();
  if (t.error) throw new Error(t.error.message);
  tenantId = t.data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("events").delete().eq("tenant_id", tenantId);
  await db.from("tenants").delete().eq("id", tenantId);
});

const stamp = async () => {
  const r = await db.rpc("runtime_stamp", { p_tenant_id: tenantId });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

test(
  "a channel written, changed and removed moves the stamp each time; what did not change leaves it alone",
  { skip },
  async () => {
    const before = await stamp();
    assert.equal(await stamp(), before, "read twice with nothing changed: the same");

    const made = await db
      .from("tenant_channels")
      .insert({ tenant_id: tenantId, kind: "whatsapp", external_id: `pn-${Date.now()}`, status: "disabled" })
      .select("id")
      .single();
    assert.equal(made.error, null, made.error?.message);
    const withChannel = await stamp();
    assert.notEqual(withChannel, before, "a channel connected is a change the runtime must read");

    // moddatetime keeps updated_at, and a token written touches the row (put_channel_credentials), so a status or a
    // credential changing is seen the same way: through the row's newest change.
    await new Promise((r) => setTimeout(r, 5));
    const on = await db.from("tenant_channels").update({ status: "active" }).eq("id", made.data.id).select("id");
    assert.equal(on.error, null, on.error?.message);
    const active = await stamp();
    assert.notEqual(active, withChannel, "a channel switched on is a change");

    const gone = await db.from("tenant_channels").delete().eq("id", made.data.id).select("id");
    assert.equal(gone.error, null, gone.error?.message);
    assert.notEqual(
      await stamp(),
      active,
      "a channel removed is a change too: the count moves where the newest change cannot",
    );
  },
);

test("the stamp a member may not read: service role only, as 00059 left it", { skip }, async () => {
  const fn = await db
    .rpc("runtime_stamp", { p_tenant_id: tenantId })
    .then(() => true)
    .catch(() => false);
  assert.equal(fn, true, "the service role reads it");
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!anon) return;
  const asAnon = createClient(URL_, anon, { auth: { persistSession: false } });
  const refused = await asAnon.rpc("runtime_stamp", { p_tenant_id: tenantId });
  assert.ok(refused.error, "anon is refused");
});
