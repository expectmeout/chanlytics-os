/**
 * The in-memory database refuses what PostgREST and Postgres refuse, with their codes (_fake-db.mjs, over the schema
 * _schema.mjs reads from the migrations' generated files). Before 29 Sep 2026 it took any row it was handed: no
 * columns, no NOT NULL, no CHECK, no unique key but the ones a suite named, no limit on an `.in()` or a read, and
 * #1100's writer passed every test it had while production refused it. database/fake-db/fake-db-agrees.db.test.mjs sends the
 * same requests to the replayed stack and holds the two to one answer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { uniqueKeysOf } from "../../_schema.mjs";
import { keyOf, render } from "../../../gen/unique-keys.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const code = (r) => r.error?.code;

test("a table, a column or an embed the database does not have is refused as PostgREST refuses it", async () => {
  const db = fakeDb({ contacts: [{ id: C, tenant_id: T, consent: "unknown" }] });
  assert.equal(code(await db.from("no_such_table").select("*")), "PGRST205");
  assert.equal(code(await db.from("contacts").select("id, name")), "42703", "contacts has no name column");
  assert.equal(code(await db.from("contacts").select("id").eq("phone", "+15550100")), "42703");
  assert.equal(code(await db.from("contacts").select("id").order("nope")), "42703");
  assert.equal(code(await db.from("contacts").select("id, calls_log(id)")), "PGRST200");
  assert.equal(code(await db.from("contacts").insert({ tenant_id: T, phone: "+15550100" })), "PGRST204");
  assert.equal(code(await db.from("contacts").update({ phone: "+15550100" }).eq("id", C)), "PGRST204");
  // What the schema has is answered: a column, a path into a jsonb, an embed along a foreign key.
  assert.equal((await db.from("contacts").select("id, phone_e164, tenants(name)")).error, null);
});

test("a NOT NULL left empty is 23502, on an insert, an upsert and an update, and nothing is written", async () => {
  const tables = { contacts: [{ id: C, tenant_id: T, consent: "unknown" }] };
  const db = fakeDb(tables);
  const missing = await db.from("contacts").insert({ phone_e164: "+15550100" });
  assert.equal(code(missing), "23502");
  assert.match(missing.error.message, /null value in column "tenant_id" of relation "contacts"/);
  assert.equal(code(await db.from("contacts").update({ tenant_id: null }).eq("id", C)), "23502");
  // A column with a default may be left out, and may not be sent as null: null is not "use the default".
  assert.equal(code(await db.from("contacts").insert({ tenant_id: T, consent: null })), "23502");
  assert.equal(tables.contacts.length, 1);
});

test("a bulk insert writes NULL where a row lacks a key another row names, as postgrest-js's columns make it", async () => {
  const tables = {};
  const db = fakeDb(tables);
  // The second job names no state; the first does, so the second's is NULL, not the default -- and state is NOT NULL.
  const r = await db.from("jobs").insert([
    { tenant_id: T, kind: "push_send", due_at: "2026-09-29T12:00:00Z", state: "scheduled" },
    { tenant_id: T, kind: "push_send", due_at: "2026-09-29T12:00:00Z" },
  ]);
  assert.equal(code(r), "23502");
  assert.equal(tables.jobs?.length ?? 0, 0, "the whole statement is refused");
});

test("a value outside a CHECK's set is 23514, and NULL passes a CHECK", async () => {
  const db = fakeDb({});
  const r = await db.from("contacts").insert({ tenant_id: T, consent: "maybe" });
  assert.equal(code(r), "23514");
  assert.match(r.error.message, /violates check constraint "contacts_consent_check"/);
  assert.equal(
    code(
      await db.from("jobs").insert({ tenant_id: T, kind: "a_kind_with_no_handler", due_at: "2026-09-29T12:00:00Z" }),
    ),
    "23514",
  );
  assert.equal((await db.from("contacts").insert({ tenant_id: T, consent: "opted_in", email: null })).error, null);
});

test("a second row on a unique key is 23505: the primary key, a table's own unique columns, a partial index", async () => {
  const tables = { contacts: [{ id: C, tenant_id: T, consent: "unknown" }], memberships: [], lines: [] };
  const db = fakeDb(tables);
  assert.equal(code(await db.from("contacts").insert({ id: C, tenant_id: T })), "23505");
  assert.equal((await db.from("memberships").insert({ tenant_id: T, user_id: U, role: "owner" })).error, null);
  assert.equal(code(await db.from("memberships").insert({ tenant_id: T, user_id: U, role: "viewer" })), "23505");
  // lines_one_live_per_tenant_idx (00195): one line a workspace, among those provisioning or answering.
  const line = (id, voice_state) => rows.line({ id, tenant_id: T, voice_state });
  assert.equal((await db.from("lines").insert(line(uuid(1), "answering"))).error, null);
  assert.equal((await db.from("lines").insert(line(uuid(2), "failed"))).error, null, "outside the index's predicate");
  const second = await db.from("lines").insert(line(uuid(3), "provisioning"));
  assert.equal(code(second), "23505");
  assert.match(second.error.message, /lines_one_live_per_tenant_idx/);
  // An update that would make a second live line is refused the same way.
  assert.equal(code(await db.from("lines").update({ voice_state: "answering" }).eq("id", uuid(2))), "23505");
});

test("a write is judged only against the keys it reaches: a column no key reads leaves seeded rows alone", async () => {
  // Two live lines in one workspace is a state the database could never hold; a fixture that seeds it is not made a
  // refusal by an update that touches neither the workspace nor the state, as Postgres makes none.
  const seeded = [
    rows.line({ id: uuid(1), tenant_id: T, voice_state: "answering" }),
    rows.line({ id: uuid(2), tenant_id: T, voice_state: "provisioning" }),
  ];
  const db = fakeDb({ lines: seeded });
  const touch = await db.from("lines").update({ state_since: "2026-09-29T13:00:00.000Z" }).eq("id", uuid(1));
  assert.equal(touch.error, null);
  assert.equal(seeded[0].state_since, "2026-09-29T13:00:00.000Z");
  const again = await db.from("lines").update({ voice_state: "provisioning" }).eq("id", uuid(2));
  assert.equal(again.error, null, "saying the state it already has moves nothing the key reads");
  // A write that reaches the key (the state its predicate reads) is judged, and refused.
  assert.equal(code(await db.from("lines").update({ voice_state: "provisioning" }).eq("id", uuid(1))), "23505");
  assert.equal(seeded[0].voice_state, "answering", "nothing was written");
});

test("a partial key's predicate sees the default of a column a row leaves out: two email_ingest jobs with no state are one", async () => {
  const job = {
    tenant_id: T,
    kind: "email_ingest",
    due_at: "2026-09-29T12:00:00Z",
    payload: { mailbox_id: "m", received_id: "r" },
  };
  const db = fakeDb({});
  assert.equal((await db.from("jobs").insert(job)).error, null);
  const again = await db.from("jobs").insert(job);
  assert.equal(code(again), "23505");
  assert.match(again.error.message, /jobs_email_ingest_uq/);
  // a job that failed is outside the key's predicate, whether its state is sent or is the default
  assert.equal((await db.from("jobs").insert({ ...job, state: "failed" })).error, null);
});

test("<> and NOT leave out a row whose cell is NULL, as SQL does; an update that matches nothing is refused no value", async () => {
  const db = fakeDb({
    contacts: [
      rows.contact({ id: uuid(1), tenant_id: T, email: null }),
      rows.contact({ id: uuid(2), tenant_id: T, email: "b@example.com" }),
    ],
  });
  const ids = async (q) => (await q).data.map((r) => r.id);
  const all = () => db.from("contacts").select("id");
  assert.deepEqual(await ids(all().neq("email", "no@example.com")), [uuid(2)]);
  assert.deepEqual(await ids(all().not("email", "eq", "no@example.com")), [uuid(2)]);
  assert.deepEqual(await ids(all().not("email", "like", "no%")), [uuid(2)]);
  assert.deepEqual(await ids(all().not("email", "is", null)), [uuid(2)]);
  // Postgres checks a value against the rows it writes: none written, none refused (a column that is not there still is)
  assert.equal((await db.from("contacts").update({ tenant_id: null }).eq("id", uuid(99))).error, null);
  assert.equal(code(await db.from("contacts").update({ tenant_id: null }).eq("id", uuid(1))), "23502");
  assert.equal(code(await db.from("contacts").update({ nope: 1 }).eq("id", uuid(99))), "PGRST204");
});

test("an upsert's conflict target must be a whole unique key (42P10), and a NULL in it conflicts with nothing", async () => {
  const tables = { memberships: [{ id: uuid(9), tenant_id: T, user_id: U, role: "operator", views: {} }] };
  const db = fakeDb(tables);
  assert.equal(
    code(await db.from("memberships").upsert({ tenant_id: T, user_id: U, role: "owner" }, { onConflict: "role" })),
    "42P10",
  );
  const same = await db
    .from("memberships")
    .upsert({ tenant_id: T, user_id: U, role: "owner" }, { onConflict: "user_id,tenant_id" })
    .select("role");
  assert.deepEqual(same, { data: [{ role: "owner" }], error: null });
  assert.equal(tables.memberships.length, 1, "saying it twice makes one row");
});

test("an .in() past the gateway's 8 KiB request line is a 414; a read answers at most max_rows, and only what it named", async () => {
  const contacts = Array.from({ length: 1500 }, (_, i) => ({ id: uuid(i), tenant_id: T, consent: "unknown" }));
  const db = fakeDb({ contacts });
  const ids = (n) => contacts.slice(0, n).map((c) => c.id);
  const fits = await db.from("contacts").select("id").in("id", ids(200));
  assert.equal(fits.error, null);
  assert.equal(fits.data.length, 200);
  const past = await db.from("contacts").select("id").in("id", ids(220));
  assert.equal(past.data, null);
  assert.match(past.error.message, /414 Request-URI Too Large/);
  const all = await db.from("contacts").select("id, consent", { count: "exact" });
  assert.equal(all.data.length, 1000, "PostgREST's max_rows cuts a read at 1,000 rows, silently");
  assert.equal(all.count, 1500, "the count is of every match");
  assert.deepEqual(Object.keys(all.data[0]), ["id", "consent"], "a read holds the columns it named, and no other");
  const head = await db.from("contacts").select("id", { count: "exact", head: true });
  assert.deepEqual([head.data, head.count], [null, 1500]);
});

test("a write answers rows only when it asks for them, and travels as JSON", async () => {
  const tables = {};
  const db = fakeDb(tables);
  assert.deepEqual(await db.from("contacts").insert({ tenant_id: T }), { data: null, error: null });
  const back = await db
    .from("contacts")
    .insert({ tenant_id: T, email: undefined, consent_updated_at: new Date("2026-09-29T12:00:00Z") })
    .select("tenant_id, email, consent_updated_at")
    .single();
  assert.deepEqual(back.data, { tenant_id: T, email: undefined, consent_updated_at: "2026-09-29T12:00:00.000Z" });
  assert.equal("email" in tables.contacts[1], false, "an undefined value is not sent");
  assert.deepEqual(await db.from("contacts").update({ email: "a@example.com" }).eq("id", tables.contacts[0].id), {
    data: null,
    error: null,
  });
  // A filter's undefined is the word "undefined" in the URL: it matches nothing, never "rows without the column".
  assert.deepEqual((await db.from("contacts").select("id").eq("email", undefined)).data, []);
});

test("a function the database does not have, or called by names it does not take, is PGRST202", async () => {
  const db = fakeDb({}, {}, { claim_due_jobs: () => [] });
  assert.equal(code(await db.rpc("no_such_function", {})), "PGRST202");
  assert.equal(code(await db.rpc("claim_due_jobs", { p_limit: 5 })), "PGRST202", "p_lease_seconds is not optional");
  assert.equal(code(await db.rpc("claim_due_jobs", { p_limit: 5, p_lease_seconds: 90, p_extra: 1 })), "PGRST202");
  assert.deepEqual(await db.rpc("claim_due_jobs", { p_limit: 5, p_lease_seconds: 90 }), { data: [], error: null });
});

/* ---- The unique keys the migrations build, read from the database's own index definitions ---- */

/** An index row as tooling/scripts/gen/unique-keys.mjs's query answers it, with the text Postgres prints for it. */
const index = (over) => ({
  tbl: "t",
  name: "t_uq",
  is_primary: false,
  nulls_not_distinct: false,
  def: "",
  pred: null,
  keys: ["a"],
  ...over,
});

test("an index's printed definition is read to a key the double evaluates: columns, lower(), coalesce(), a jsonb path, and a predicate", () => {
  const key = keyOf(
    index({
      keys: ["tenant_id", "lower((email)::text)", "COALESCE(service, ''::text)", "((payload ->> 'message_id'::text))"],
      pred: "((kind = 'email_ingest'::text) AND (state <> 'failed'::text) AND (archived_at IS NULL))",
    }),
  );
  assert.equal(key.unmodelled, undefined);
  const [k] = uniqueKeysOf({ uniques: { t: [key] } }, "t");
  const row = (over) => ({
    tenant_id: T,
    email: "A@Example.com",
    service: null,
    payload: { message_id: "m1" },
    kind: "email_ingest",
    state: "scheduled",
    archived_at: null,
    ...over,
  });
  assert.equal(
    k.key(row()),
    JSON.stringify([T, "a@example.com", "", "m1"]),
    "lower(), COALESCE() and ->> as Postgres reads them",
  );
  assert.equal(k.where(row()), true);
  assert.equal(k.where(row({ state: "failed" })), false, "outside the predicate");
  assert.equal(
    k.where(row({ state: null })),
    false,
    "a NULL comparison is unknown, and a partial index holds only true",
  );
  assert.equal(k.key(row({ payload: {} })), null, "a NULL part: NULLs are distinct, so the row never conflicts");
  assert.deepEqual([...k.reads].sort(), ["archived_at", "email", "kind", "payload", "service", "state", "tenant_id"]);
});

test("= ANY (ARRAY[...]) and IS NOT NULL predicates are read; a key the double cannot read is kept, with why, never dropped", () => {
  const set = keyOf(
    index({ keys: ["tenant_id"], pred: "(voice_state = ANY (ARRAY['provisioning'::text, 'answering'::text]))" }),
  );
  assert.deepEqual(set.where, { in: { column: "voice_state" }, values: ["provisioning", "answering"] });
  assert.deepEqual(keyOf(index({ pred: "(e164 IS NOT NULL)" })).where, { notNull: { column: "e164" } });
  const odd = keyOf(
    index({
      keys: ["date_trunc('day'::text, created_at)"],
      def: "CREATE UNIQUE INDEX t_uq ON t (date_trunc('day', created_at))",
    }),
  );
  assert.match(odd.unmodelled, /date_trunc\(\) is not modelled/);
  const file = JSON.parse(
    render([index({ keys: ["a"] }), index({ name: "odd", keys: ["date_trunc('day'::text, created_at)"] })]),
  );
  assert.deepEqual([file.keys.length, file.unmodelled.map((u) => u.name)], [1, ["odd"]]);
});
