/**
 * The money lock holds (00102).
 *
 * The charter says the receptionist never decides money, and the database is
 * where that is enforced: a policies row of class 'money' is always mode
 * 'never', and no policy row may change its workspace, class or subject. The
 * second half is what 00012 lacked -- an owner could carry the money row out
 * of the workspace's scope and the runtime then read the class as 'ask'.
 *
 * A trigger is exactly what reading source cannot prove, so this runs against
 * the local database the Database workflow builds from every migration. Never
 * production: `supabase start`, then `pnpm test:db` with its keys.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes policies"
    : false;

let db;
let tenantId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  // provision_tenant seeds the whole matrix, money row included.
  const { data, error } = await db.from("tenants").insert({ slug: `money-lock-${Date.now()}`, name: "Money lock" }).select("id").single();
  assert.equal(error, null, error?.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

const moneyRow = () => db.from("policies").select("id, mode, subject_type, subject_id").eq("tenant_id", tenantId).eq("class", "money").is("subject_type", null).maybeSingle();

test("the workspace's money row is seeded, and locked to never", { skip }, async () => {
  const { data, error } = await moneyRow();
  assert.equal(error, null, error?.message);
  assert.ok(data, "provision_tenant seeds a money row");
  assert.equal(data.mode, "never");
  const r = await db.from("policies").update({ mode: "ask" }).eq("id", data.id);
  assert.match(r.error?.message ?? "", /locked to never/, "the mode does not move");
});

test("the money row cannot be carried out of the workspace's scope", { skip }, async () => {
  const { data } = await moneyRow();
  // The move that used to succeed: same mode, a different subject, so the
  // workspace no longer has a money row and the runtime read the class as ask.
  const moved = await db.from("policies").update({ subject_type: "contact", subject_id: randomUUID() }).eq("id", data.id);
  assert.match(moved.error?.message ?? "", /keeps its workspace, class and subject/, "the subject does not move");
  const reclassed = await db.from("policies").update({ class: "reviews" }).eq("id", data.id);
  assert.match(reclassed.error?.message ?? "", /keeps its workspace, class and subject/, "the class does not move");
  const still = await moneyRow();
  assert.equal(still.data?.id, data.id, "the row is where it was");
});

test("no policy row changes its identity; mode and limits still do", { skip }, async () => {
  const { data: reply } = await db.from("policies").select("id, mode").eq("tenant_id", tenantId).eq("class", "reply").is("subject_type", null).single();
  const ok = await db.from("policies").update({ mode: "ask", limits: { pause_hours: 2 } }).eq("id", reply.id).select("id, mode, limits");
  assert.equal(ok.error, null, ok.error?.message);
  assert.equal(ok.data?.[0]?.mode, "ask");
  assert.deepEqual(ok.data?.[0]?.limits, { pause_hours: 2 });
  const away = await db.from("policies").update({ class: "faq" }).eq("id", reply.id);
  assert.match(away.error?.message ?? "", /keeps its workspace, class and subject/);
});

test("the per-person door still works: an upsert on the full key writes the mode and nothing else", { skip }, async () => {
  // setPersonReplyMode (packages/db) upserts on the unique key. On conflict
  // PostgREST sets every column it was given, identity included -- the values
  // already there -- which the guard must read as no change.
  const contactId = randomUUID();
  const row = { tenant_id: tenantId, class: "reply", mode: "never", subject_type: "contact", subject_id: contactId };
  const first = await db.from("policies").upsert(row, { onConflict: "tenant_id,class,subject_type,subject_id" });
  assert.equal(first.error, null, first.error?.message);
  const second = await db.from("policies").upsert({ ...row, mode: "ask" }, { onConflict: "tenant_id,class,subject_type,subject_id" });
  assert.equal(second.error, null, second.error?.message);
  const { data } = await db.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "reply").eq("subject_id", contactId).single();
  assert.equal(data.mode, "ask");
});

test("a money row for one person is a money row: never, or nothing", { skip }, async () => {
  const bad = await db.from("policies").insert({ tenant_id: tenantId, class: "money", mode: "auto", subject_type: "contact", subject_id: randomUUID() });
  assert.match(bad.error?.message ?? "", /locked to never/);
});
