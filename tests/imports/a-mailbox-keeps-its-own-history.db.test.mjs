/**
 * A mailbox's history is its own, on the database (00499, decision 0086): the imports ledger keeps one row a mailbox
 * for what a mailbox brings and one a workspace for every other source; the one door hands a mailbox the row an earlier
 * ledger kept for it; a run holds its row, so a write of a run Stop or a later run took it from changes nothing; a
 * mailbox's rows go with it; and what its owner chose (its six months, or from now on) is the mailbox's, one of two.
 * Local stack only: it makes workspaces.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const stamp = Date.now().toString(36);
let db;
let A;
let n = 0;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** A mailbox the workspace connected, on a host of its own. */
const mailbox = (over = {}) => {
  n += 1;
  const host = `history-${stamp}-${n}.example`;
  return one(
    db.from("mailbox_connections").insert({
      tenant_id: A,
      provider: "google",
      provider_account: `acct-${stamp}-${n}`,
      address: `sam${n}@${host}`,
      host,
      from_name: "Sam",
      ...over,
    }),
  );
};
/** A write through the ledger's one door, as the service role. */
const note = (p) => db.rpc("import_ledger_note", { p_tenant_id: A, p_state: "running", ...p });
/** The workspace's rows of a source, as [mailbox, state, run, counts]. */
const rowsOf = async (source) =>
  ok(
    await db
      .from("imports")
      .select("connection_id, state, run, counts, job_cursor")
      .eq("tenant_id", A)
      .eq("source", source)
      .order("connection_id", { ascending: true, nullsFirst: true }),
  );

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `history-${stamp}`, name: "Harbor Moving Co" }));
});
after(async () => {
  if (skip) return;
  if (A) ok(await db.from("tenants").delete().eq("id", A));
});

test("one row a mailbox for what a mailbox brings, one a workspace for every other source", { skip }, async () => {
  const [m1, m2] = [await mailbox(), await mailbox()].sort();
  for (const m of [m1, m2]) ok(await note({ p_source: "contacts", p_connection_id: m, p_counts: { people: 3 } }));
  ok(await note({ p_source: "calendar", p_counts: { past: 2 } }));
  ok(await note({ p_source: "calendar", p_counts: { past: 1 }, p_add: true }));
  assert.deepEqual(
    (await rowsOf("contacts")).map((r) => [r.connection_id, r.counts]),
    [
      [m1, { people: 3 }],
      [m2, { people: 3 }],
    ],
  );
  assert.deepEqual(
    (await rowsOf("calendar")).map((r) => [r.connection_id, r.counts]),
    [[null, { past: 3 }]],
    "the workspace's own source: one row, a second write its own",
  );
  const named = await note({ p_source: "calendar", p_connection_id: m1 });
  assert.equal(named.error?.code, "23514", "a workspace's source names no mailbox");
});

test(
  "a mailbox is handed the row an earlier ledger kept for it: its cursor names it, or it is still going and names none",
  { skip },
  async () => {
    const [m1, m2, m3] = [await mailbox(), await mailbox(), await mailbox()];
    // As the ledger before 0086 kept it: the workspace's row, its cursor naming the mailbox it was reading.
    ok(await note({ p_source: "mailbox", p_counts: { messages: 40 }, p_cursor: { connection: m1, at: 7 } }));
    ok(await note({ p_source: "mailbox", p_connection_id: m1, p_counts: { messages: 2 }, p_add: true }));
    assert.deepEqual(
      (await rowsOf("mailbox")).map((r) => [r.connection_id, r.counts, r.job_cursor]),
      [[m1, { messages: 42 }, { connection: m1, at: 7 }]],
      "the one row, the mailbox's now, read on from its place",
    );
    // Queued by an edge before 0086 and not read yet: the first mailbox to write takes it.
    ok(await note({ p_source: "whatsapp_contacts", p_state: "done" }));
    ok(await note({ p_source: "contacts", p_state: "queued", p_cursor: {} }));
    ok(await note({ p_source: "contacts", p_connection_id: m2, p_counts: { people: 5 } }));
    assert.deepEqual(
      (await rowsOf("contacts")).filter((r) => [m2, null].includes(r.connection_id)).map((r) => r.connection_id),
      [m2],
      "taken, never left queued beside a row of its own",
    );
    // Done, and naming another mailbox: not this one's.
    ok(await note({ p_source: "contacts", p_state: "done", p_cursor: { connection: m1 } }));
    ok(await note({ p_source: "contacts", p_connection_id: m3 }));
    const kept = (await rowsOf("contacts")).filter((r) => r.connection_id === null);
    assert.equal(kept.length, 1, "the row it named is left for its own mailbox");
  },
);

test("a run holds its row: a write of a run Stop or a later run took it from changes nothing", { skip }, async () => {
  const m = await mailbox();
  const at = (p) => note({ p_source: "mailbox", p_connection_id: m, ...p });
  ok(await at({ p_state: "queued", p_run: "1", p_take: true, p_counts: {}, p_cursor: {} }));
  ok(await at({ p_run: "1", p_counts: { messages: 10 }, p_add: true, p_cursor: { connection: m, at: 3 } }));
  // Stop: the row taken from every run.
  ok(
    await at({
      p_state: "failed",
      p_error: "Stopped. What came in is kept.",
      p_add: true,
      p_run: "stopped:1",
      p_take: true,
    }),
  );
  // The part mid-read as Stop was pressed writes as it ends.
  ok(await at({ p_run: "1", p_counts: { messages: 5 }, p_add: true, p_cursor: { connection: m, at: 9 } }));
  let [row] = await rowsOf("mailbox").then((rs) => rs.filter((r) => r.connection_id === m));
  assert.deepEqual(
    [row.state, row.run, row.counts, row.job_cursor],
    ["failed", "stopped:1", { messages: 10 }, { connection: m, at: 3 }],
    "the stop stands, and where it stood",
  );
  // Resume: a run of its own takes it, and its parts write.
  ok(await at({ p_state: "queued", p_run: "2", p_take: true, p_add: true }));
  ok(await at({ p_run: "2", p_counts: { messages: 1 }, p_add: true }));
  [row] = await rowsOf("mailbox").then((rs) => rs.filter((r) => r.connection_id === m));
  assert.deepEqual([row.state, row.run, row.counts], ["running", "2", { messages: 11 }]);
  // An edge before 0086 names no run, and writes as it did.
  ok(await at({ p_state: "done", p_counts: {}, p_add: true }));
  [row] = await rowsOf("mailbox").then((rs) => rs.filter((r) => r.connection_id === m));
  assert.deepEqual([row.state, row.run], ["done", "2"]);
});

test("a mailbox's rows go with it, and what its owner chose is one of two", { skip }, async () => {
  const m = await mailbox({ history: "from_now" });
  ok(await note({ p_source: "contacts", p_connection_id: m }));
  assert.equal(ok(await db.from("mailbox_connections").select("history").eq("id", m).single()).history, "from_now");
  const odd = await db.from("mailbox_connections").update({ history: "a_year" }).eq("id", m);
  assert.equal(odd.error?.code, "23514");
  assert.equal(
    ok(
      await db
        .from("mailbox_connections")
        .select("history")
        .eq("id", await mailbox())
        .single(),
    ).history,
    "six_months",
    "a mailbox connected as before brings its six months",
  );
  ok(await db.from("mailbox_connections").delete().eq("id", m));
  assert.equal((await rowsOf("contacts")).filter((r) => r.connection_id === m).length, 0);
});
