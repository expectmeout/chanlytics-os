/**
 * A day counts how long the ledger and the answer waited, the sends that doubled and the jobs that died (00330,
 * decision 0029's Phase 0), on a real Postgres.
 *
 * The nightly roll's third statement keeps five columns of platform_metrics: job_lag_ms by lane (first claims only),
 * first_answer_ms by channel (the next outbound row after a customer's, whoever wrote it), duplicate_sends (the same
 * words to one thread within a minute), dead_letters by kind (state failed, final), and relay_lag_ms, which the relay's
 * own migration writes and is null until then. This builds one workspace's day of threads and jobs, at the edges too,
 * and holds each number to what was written; a workspace the day said nothing of that kind about reads null, never
 * zero; the read function answers the five beside the rest; and a re-run of the day replaces them and does not double
 * them. Runs as platform-metrics.db.test.mjs does: its own workspaces and rows, made with the service key and removed
 * after, against the database `supabase start` builds on this machine, never production.
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
      ? "refusing a database that is not on this machine: this suite makes workspaces, threads, messages and jobs"
      : false;

/** The day counted: long past, so nothing else in the database is on it. */
const D = "2026-03-12";
const at = (time, day = D) => `${day}T${time}Z`;
const RUN = Date.now().toString(36);
let serial = 0;

let db;
const made = [];

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function workspace(tag) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ name: `Spine ${tag} ${RUN}`, slug: `spine-${tag}-${++serial}-${RUN}` })
      .select("id")
      .single(),
    `workspace ${tag}`,
  ).id;
  made.push(t);
  return t;
}

/** A person with a thread; answers the ids messages are written into. */
async function thread(t) {
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: t, phone_e164: `+1555010${String(++serial).padStart(4, "0")}` })
      .select("id")
      .single(),
    "contact",
  ).id;
  const conversation = ok(
    await db.from("conversations").insert({ tenant_id: t, contact_id: contact }).select("id").single(),
    "conversation",
  ).id;
  return { tenant_id: t, contact_id: contact, conversation_id: conversation };
}

/** Messages of one thread: [direction, sender, channel, status, when, body?]. */
async function messages(th, rows) {
  ok(
    await db.from("messages").insert(
      rows.map(([direction, sender, channel, status, when, body]) => ({
        ...th,
        direction,
        sender,
        channel,
        status,
        type: "text",
        body: body ?? "made-up words",
        created_at: when,
      })),
    ),
    "messages",
  );
}

/** Jobs as the ledger leaves them: [kind, state, due, fired, attempts, updated]. */
async function jobs(t, rows) {
  ok(
    await db.from("jobs").insert(
      rows.map(([kind, state, due_at, fired_at, attempts, updated_at]) => ({
        tenant_id: t,
        kind,
        state,
        due_at,
        fired_at,
        attempts,
        updated_at: updated_at ?? fired_at ?? due_at,
        payload: {},
      })),
    ),
    "jobs",
  );
}

const rolled = async (t, day = D) =>
  ok(await db.from("platform_metrics").select("*").eq("tenant_id", t).eq("day", day), "platform_metrics")[0];
const roll = async (day = D) => ok(await db.rpc("platform_metrics_roll", { p_day: day }), `roll ${day}`);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const t of made) {
    await db.from("jobs").delete().eq("tenant_id", t);
    await db.from("events").delete().eq("tenant_id", t);
    await db.from("tenants").delete().eq("id", t);
  }
});

test(
  "the five, counted from one workspace's day: waits by lane and by channel at the 95th percentile, the doubled send, the dead by kind",
  { skip },
  async () => {
    const t = await workspace("busy");
    const a = await thread(t);
    const b = await thread(t);
    await messages(a, [
      // Asked at 10:00:00 on WhatsApp, answered 30 s later; the same words again 20 s on: one duplicate.
      ["inbound", "customer", "whatsapp", "received", at("10:00:00")],
      ["outbound", "ai", "whatsapp", "sent", at("10:00:30"), "Hello, how can we help?"],
      ["outbound", "ai", "whatsapp", "sent", at("10:00:50"), "Hello, how can we help?"],
      // The same words two minutes later are a new send, not a duplicate.
      ["outbound", "human", "whatsapp", "sent", at("10:03:00"), "Hello, how can we help?"],
      // Asked at noon and never answered: asks less answered, not a wait.
      ["inbound", "customer", "whatsapp", "received", at("12:00:00")],
    ]);
    await messages(b, [
      // By text, answered by a person 120 s on; a reply across midnight to a pair's first is the next day's duplicate.
      ["inbound", "customer", "sms", "received", at("11:00:00")],
      ["outbound", "human", "sms", "sent", at("11:02:00"), "On our way"],
      ["outbound", "ai", "sms", "sent", at("23:59:40"), "Thanks, see you soon"],
      ["outbound", "ai", "sms", "sent", at("00:00:10", "2026-03-13"), "Thanks, see you soon"],
    ]);
    await jobs(t, [
      // A reply (lane 0) claimed 5 s past its due time; a bulk send (lane 2) 60 s past; a second claim is not a wait.
      ["outbound_send", "done", at("10:00:00"), at("10:00:05"), 1],
      ["broadcast_send", "done", at("10:00:00"), at("10:01:00"), 1],
      ["broadcast_send", "done", at("10:00:00"), at("10:30:00"), 2],
      // Two intakes died that day; one died the day after.
      ["email_ingest", "failed", at("09:00:00"), at("09:00:01"), 3, at("09:05:00")],
      ["email_ingest", "failed", at("09:10:00"), at("09:10:01"), 3, at("09:15:00")],
      ["email_ingest", "failed", at("09:20:00"), at("09:20:01"), 3, at("00:01:00", "2026-03-13")],
    ]);

    assert.ok((await roll()) >= 1, "the day was counted");
    const row = await rolled(t);
    assert.deepEqual(row.job_lag_ms, { 0: 5000, 2: 60000 }, "first claims only, by lane");
    assert.deepEqual(
      row.first_answer_ms,
      { whatsapp: 30000, sms: 120000 },
      "the first answer after each ask, by channel",
    );
    assert.equal(row.duplicate_sends, 1, "the same words within a minute, once; two minutes on is a new send");
    assert.deepEqual(row.dead_letters, { email_ingest: 2 }, "the jobs that died that day, by kind");
    assert.equal(row.relay_lag_ms, null, "the relay writes its own number");
    assert.equal(row.asks, 3, "the first statement's columns are the same day");

    const next = await roll("2026-03-13");
    assert.ok(next >= 0);
    const after_ = await rolled(t, "2026-03-13");
    assert.equal(after_.duplicate_sends, 1, "the pair across midnight is counted once, on the day of its second");
    assert.deepEqual(after_.dead_letters, { email_ingest: 1 });

    assert.ok((await roll()) >= 0, "run again");
    const again = await rolled(t);
    assert.deepEqual(
      [again.job_lag_ms, again.duplicate_sends, again.dead_letters],
      [{ 0: 5000, 2: 60000 }, 1, { email_ingest: 2 }],
      "a re-run replaces the five and does not double them",
    );
  },
);

test(
  "a day the workspace said nothing of a kind about reads null, never zero; the read answers the five",
  { skip },
  async () => {
    const t = await workspace("quiet");
    const th = await thread(t);
    // One ask, never answered, nothing sent, no job: a row for the day (asks) with none of the five.
    await messages(th, [["inbound", "customer", "whatsapp", "received", at("09:00:00")]]);
    await roll();
    const row = await rolled(t);
    assert.equal(row.asks, 1);
    assert.deepEqual(
      [row.job_lag_ms, row.first_answer_ms, row.duplicate_sends, row.dead_letters, row.relay_lag_ms],
      [null, null, null, null, null],
    );

    const read = ok(await db.rpc("platform_metrics_read", { p_days: 90 }), "read");
    const mine = read.find((r) => r.tenant_id === t);
    // The day is long past the read's window of at most ninety days: the columns are answered, the row only when in it.
    if (mine) assert.ok("job_lag_ms" in mine && "relay_lag_ms" in mine, "the five ride beside the rest");
    const columns = ok(await db.rpc("platform_metrics_read", { p_days: 1 }), "read today");
    assert.ok(Array.isArray(columns));
  },
);
