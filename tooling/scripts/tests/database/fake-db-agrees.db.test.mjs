/**
 * The in-memory database (_fake-db.mjs) and the real one answer the same requests the same way. The double refuses what
 * PostgREST and Postgres refuse (database/fake-db-schema.test.mjs proves it does, against the schema read from the
 * migrations); this proves the refusals it makes are the database's: each case below is sent to the replayed stack and
 * to the double, and the two must agree on whether it was refused, with what code, and in what words. A double that
 * drifts from the database is a test that lies, and this is what fails when it does.
 *
 * Every write is kept in the workspace this file makes and deletes. The double gets the same rows the workspace holds.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes rows"
      : false;

let db;
let T;
const stamp = Date.now().toString(36);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const made = await db
    .from("tenants")
    .insert({ slug: `fake-agrees-${stamp}`, name: "Fake Agrees" })
    .select("id")
    .single();
  assert.equal(made.error, null, made.error?.message);
  T = made.data.id;
});

after(async () => {
  if (skip || !T) return;
  await db.from("tenants").delete().eq("id", T);
});

/** What a response says, in the words a test would assert: refused with what, or answered with how many rows. */
const said = (r) =>
  r.error
    ? { code: r.error.code, message: r.error.message }
    : { rows: Array.isArray(r.data) ? r.data.length : r.data == null ? null : 1, count: r.count ?? null };

/** Each case: a request as a function of a client, the tenant and a suffix that keeps two runs' values apart. */
const CASES = [
  ["a table the database does not have", (c) => c.from("no_such_table").select("*")],
  ["a column a select names that the table lacks", (c) => c.from("contacts").select("id, name")],
  ["a column a filter names that the table lacks", (c) => c.from("contacts").select("id").eq("phone", "+13055550101")],
  ["a column an order names that the table lacks", (c) => c.from("contacts").select("id").order("nope")],
  ["an embed with no key between the two", (c) => c.from("contacts").select("id, calls_log(id)")],
  ["an insert naming a column the table lacks", (c, t) => c.from("contacts").insert({ tenant_id: t, phone: "1" })],
  ["an update naming a column the table lacks", (c, t) => c.from("contacts").update({ phone: "1" }).eq("tenant_id", t)],
  ["a NOT NULL column left out of an insert", (c, t, s) => c.from("contacts").insert({ phone_e164: `+1305${s}` })],
  [
    "a NOT NULL column with a default sent as null",
    (c, t) => c.from("contacts").insert({ tenant_id: t, consent: null }),
  ],
  ["a value outside a CHECK's set", (c, t) => c.from("contacts").insert({ tenant_id: t, consent: "maybe" })],
  [
    "a job kind no handler answers to",
    (c, t) => c.from("jobs").insert({ tenant_id: t, kind: "a_kind_with_no_handler", due_at: "2026-09-29T12:00:00Z" }),
  ],
  [
    "a bulk insert whose second row lacks a NOT NULL key the first names",
    (c, t) =>
      c.from("jobs").insert([
        { tenant_id: t, kind: "push_send", due_at: "2026-09-29T12:00:00Z", state: "scheduled" },
        { tenant_id: t, kind: "push_send", due_at: "2026-09-29T12:00:00Z" },
      ]),
  ],
  [
    "a second contact on a unique key",
    async (c, t, s) => {
      const row = { tenant_id: t, email: `same-${s}@example.com` };
      const first = await c.from("contacts").insert(row);
      assert.equal(first.error, null, first.error?.message);
      return c.from("contacts").insert(row);
    },
  ],
  [
    "a NULL on a unique key, twice, conflicts with nothing",
    async (c, t) => {
      const first = await c.from("contacts").insert({ tenant_id: t });
      assert.equal(first.error, null, first.error?.message);
      return c.from("contacts").insert({ tenant_id: t });
    },
  ],
  [
    "a second live line on a partial unique index",
    async (c, t, s) => {
      const line = (state, e164) => rows.line({ tenant_id: t, voice_state: state, e164: `+1305${s}${e164}` });
      const first = await c.from("lines").insert(line("answering", "1"));
      assert.equal(first.error, null, first.error?.message);
      const out = await c.from("lines").insert(line("failed", "2"));
      assert.equal(out.error, null, "a line outside the index's predicate is taken");
      return c.from("lines").insert(line("provisioning", "3"));
    },
  ],
  [
    "an upsert whose conflict target no key matches",
    (c, t) =>
      c.from("tenant_channels").upsert({ tenant_id: t, kind: "whatsapp", external_id: "1" }, { onConflict: "status" }),
  ],
  ["a function the database does not have", (c) => c.rpc("no_such_function", {})],
  ["a function called by names it does not take", (c) => c.rpc("claim_due_jobs", { p_limit: 5 })],
];

/** The rows the two databases both start a case with: none, but a case that needs some makes them itself. */
test("each refusal the double makes is the database's: the same code, and the same words", { skip }, async () => {
  const answers = [];
  for (const [name, request] of CASES) {
    // a fresh double each, so one case's rows are never another's; the real database keeps its own, apart by suffix
    const suffix = `${stamp}${answers.length}`.replace(/\D/g, "").slice(-7).padStart(7, "0");
    const real = said(await request(db, T, suffix));
    const fake = said(await request(fakeDb({}, {}, { claim_due_jobs: () => [] }), T, suffix));
    answers.push({ name, real, fake });
  }
  const differ = answers.filter((a) => JSON.stringify(a.real) !== JSON.stringify(a.fake));
  assert.deepEqual(
    differ.map((a) => [a.name, a.real, a.fake]),
    [],
    "the double answers as the database does",
  );
});

test(
  "a read answers at most max_rows and counts every match; an .in() past the gateway's line is refused",
  { skip },
  async () => {
    // Contacts the cases above already left in this workspace are the database's alone: the double starts with these.
    const before_ = await db.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", T);
    assert.equal(before_.error, null, before_.error?.message);
    const many = Array.from({ length: 1050 }, (_, i) =>
      rows.contact({ tenant_id: T, phone_e164: `+1305${5550000 + i}` }),
    );
    for (let i = 0; i < many.length; i += 500) {
      const ok = await db.from("contacts").insert(many.slice(i, i + 500));
      assert.equal(ok.error, null, ok.error?.message);
    }
    const fake = fakeDb({ contacts: many });
    const read = (c) => c.from("contacts").select("id", { count: "exact" }).eq("tenant_id", T);
    const [r, f] = [await read(db), await read(fake)];
    assert.deepEqual(
      [r.data.length, r.count - before_.count],
      [1000, 1050],
      "the database cuts a read at max_rows and counts the rest",
    );
    assert.deepEqual([f.data.length, f.count], [1000, 1050], "and so does the double");

    // The gateway's request line: the largest .in() of uuids each one takes, found by asking. The words differ (the local
    // stack's Kong says "URI too long", the hosted gateway sends its 414 page, which is what the double keeps); the size
    // at which a request is refused is the same.
    const ids = (n) => many.slice(0, n).map((r) => r.id);
    const refused = async (c, n) => (await c.from("contacts").select("id").in("id", ids(n))).error !== null;
    const largest = async (c) => {
      let [fits, past] = [100, 400];
      assert.equal(await refused(c, fits), false);
      assert.equal(await refused(c, past), true);
      while (past - fits > 1) {
        const mid = Math.floor((fits + past) / 2);
        if (await refused(c, mid)) past = mid;
        else fits = mid;
      }
      return fits;
    };
    const [real, double] = [await largest(db), await largest(fake)];
    assert.ok(real > 150 && real < 300, `${real} uuids fit the database's request line`);
    assert.equal(double, real, "the double refuses a request line at the size the gateway does");
    assert.match(
      (await fake.from("contacts").select("id").in("id", ids(400))).error.message,
      /414 Request-URI Too Large/,
    );
    assert.match((await db.from("contacts").select("id").in("id", ids(400))).error.message, /URI too long|414/);
  },
);
