/**
 * A workspace's logo on a real database (00407): what reading the source cannot prove.
 *
 * The address is written by one door, set_workspace_logo, on the member's own session: whoever may change the
 * workspace's settings, never a viewer or an operator, never for another workspace, never an address in another
 * workspace's folder; it answers the address it held and writes the change's event in the same transaction. No session
 * may write the column itself, and the CHECK binds the address to the row's own id even for the service role. The
 * bucket is public to read, PNG alone at 256KB, and no member may put, list or remove a file in it. Runs against Postgres
 * in the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces"
      : false;

const PASSWORD = "a-long-test-password-1";
let db;
let A;
let B;
const users = {};
const sessions = {};

async function workspace(name) {
  const t = await db
    .from("tenants")
    .insert({ slug: `logo-${name}-${Date.now()}`, name })
    .select("id")
    .single();
  if (t.error) throw new Error(t.error.message);
  return t.data.id;
}

async function member(key, tenantId, role) {
  const email = `${key}-${Date.now()}@example.com`;
  const made = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  users[key] = made.data.user.id;
  const m = await db.from("memberships").insert({ tenant_id: tenantId, user_id: users[key], role });
  if (m.error) throw new Error(m.error.message);
  const as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await as.auth.signInWithPassword({ email, password: PASSWORD });
  if (s.error) throw new Error(s.error.message);
  sessions[key] = as;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await workspace("Harbor");
  B = await workspace("Bayside");
  await member("owner", A, "owner");
  await member("operator", A, "operator");
  await member("viewer", A, "viewer");
});

after(async () => {
  if (skip || !A) return;
  for (const t of [A, B]) {
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
  for (const id of Object.values(users)) await db.auth.admin.deleteUser(id);
});

const pathIn = (tenantId) => `${tenantId}/${randomUUID()}.png`;
const set = (who, tenantId, path) =>
  sessions[who].rpc("set_workspace_logo", { p_tenant_id: tenantId, p_logo_path: path });
const logoOf = async (tenantId) =>
  (await db.from("tenants").select("logo_path").eq("id", tenantId).single()).data.logo_path;

test(
  "the owner sets the logo through the door: it answers what it held, and the change's event is written beside it",
  { skip },
  async () => {
    const first = pathIn(A);
    const r1 = await set("owner", A, first);
    assert.equal(r1.error, null, r1.error?.message);
    assert.equal(r1.data, null, "nothing held before");
    assert.equal(await logoOf(A), first);

    const second = pathIn(A);
    const r2 = await set("owner", A, second);
    assert.equal(r2.data, first, "the address it held, for the save to let go of");
    assert.equal(await logoOf(A), second);

    const events = (
      await db
        .from("events")
        .select("kind, subject_type, subject_id, data")
        .eq("tenant_id", A)
        .eq("kind", "settings.changed")
    ).data;
    assert.equal(events.length, 2, "one event a change, in the same transaction");
    assert.deepEqual(events[0].data, { fields: ["logo"], by: users.owner, version: null });
    assert.equal(events[0].subject_type, "workspace");
    assert.equal(events[0].subject_id, A);

    const cleared = await set("owner", A, "");
    assert.equal(cleared.data, second);
    assert.equal(await logoOf(A), null, "an empty address takes the logo away");
  },
);

test("nobody else may: not an operator, not a viewer, not the owner for another workspace", { skip }, async () => {
  const before = await logoOf(A);
  for (const who of ["operator", "viewer"]) {
    const r = await set(who, A, pathIn(A));
    assert.equal(r.error?.code, "42501", `${who}: ${r.error?.message}`);
  }
  const other = await set("owner", B, pathIn(B));
  assert.equal(other.error?.code, "42501", "the owner of one workspace is nobody in another");
  assert.equal(await logoOf(A), before);
  assert.equal(await logoOf(B), null);
});

test(
  "an address in another workspace's folder is refused by the door, and by the CHECK even for the service role",
  { skip },
  async () => {
    const r = await set("owner", A, pathIn(B));
    assert.equal(r.error?.code, "22023", r.error?.message);
    const direct = await db
      .from("tenants")
      .update({ logo_path: pathIn(B) })
      .eq("id", A)
      .select("id");
    assert.equal(direct.error?.code, "23514", "tenants_logo_path_shape: the address is bound to the row's own id");
    const shapeless = await db
      .from("tenants")
      .update({ logo_path: `${A}/logo.svg` })
      .eq("id", A)
      .select("id");
    assert.equal(shapeless.error?.code, "23514", "only a random name, only a PNG");
  },
);

test("no session writes the column itself: the door is the only way", { skip }, async () => {
  const r = await sessions.owner
    .from("tenants")
    .update({ logo_path: pathIn(A) })
    .eq("id", A)
    .select("id");
  assert.ok(r.error || !r.data?.length, "refused, or no row moved");
  if (r.error) assert.equal(r.error.code, "42501", r.error.message);
});

test(
  "the bucket: public to read, PNG alone at 256KB, and no member may put, list or remove a file in it",
  { skip },
  async () => {
    const bucket = (await db.storage.getBucket("workspace-logos")).data;
    assert.equal(bucket.public, true);
    assert.equal(bucket.file_size_limit, 262144);
    assert.deepEqual([...bucket.allowed_mime_types], ["image/png"], "never an SVG, never a file as it was sent");

    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const mine = pathIn(A);
    const put = await sessions.owner.storage.from("workspace-logos").upload(mine, png, { contentType: "image/png" });
    assert.ok(put.error, "a member's session may not put a file: only the server, after it remade the picture");
    const listed = await sessions.owner.storage.from("workspace-logos").list(A);
    assert.ok(listed.error || listed.data.length === 0, "nor list one");

    const ours = await db.storage.from("workspace-logos").upload(mine, png, { contentType: "image/png" });
    assert.equal(ours.error, null, ours.error?.message);
    const removed = await sessions.owner.storage.from("workspace-logos").remove([mine]);
    assert.ok(removed.error || removed.data.length === 0, "nor remove one");
    assert.ok(
      (await db.storage.from("workspace-logos").list(A)).data.some((f) => mine.endsWith(f.name)),
      "still there",
    );

    const svg = await db.storage
      .from("workspace-logos")
      .upload(pathIn(A).replace(".png", ".svg"), new TextEncoder().encode("<svg/>"), { contentType: "image/svg+xml" });
    assert.ok(svg.error, "the bucket itself refuses an SVG, whoever sends it");
    await db.storage.from("workspace-logos").remove([mine]);
  },
);
