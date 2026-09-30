/**
 * A day per workspace, counted (00279 platform_metrics), on a real Postgres.
 *
 * The nightly rollup counts one UTC day of every workspace that did anything in it: messages in and out by channel,
 * the customers' messages (asks) and how many anyone answered (first_replies, the reports' one definition), the
 * receptionist's replies answered at once, held and handed off, its 95th-percentile latency, the sends that failed by
 * what they came to, and model tokens. This builds a small day for a handful of made-up workspaces, at the edges of
 * the day too, and holds each number to what was written:
 *   - platform_metrics_roll(p_day): the counts per workspace; a backfilled message, a failed or queued send, another
 *     day's row and a reach-out draft (no `held`) are not counted where they should not be; the day is UTC (00:00:00 in,
 *     the next 00:00:00 out); a quiet workspace has no row; re-running the day replaces its rows and never doubles them;
 *     the clock's own command (cron.job) writes yesterday's;
 *   - platform_metrics_read(p_days): newest day first, the workspace's name beside its row, the window clamped to 1..90
 *     and a week by default;
 *   - platform_answer_silence(p_day): the ACTIVE workspaces whose customers wrote and nobody answered, and no other;
 *   - the door: RLS on and no policy, and neither the anon key nor a signed-in owner can read the table or execute
 *     any of the three; the service role can. A workspace's deletion takes its rows with it;
 *   - the clock: a cron job `platform-metrics-roll` at 00:17 UTC, registered in sweep_status as judged on its runs
 *     within 26 hours, and reported by sweep_health().
 *
 * Runs the way tenancy.db.test.mjs does: its own workspaces, users and rows, made with the service key and removed
 * after, against the database `supabase start` builds on this machine, never production. Two blocks go through the
 * CLI (SUPABASE_CLI names the binary when `supabase` is not on PATH; SUPABASE_DB_URL aims it), in a transaction that
 * never commits.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, people, messages and events"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

/** The day counted: long past, so nothing else in the database is on it. */
const D = "2026-03-10";
const at = (time, day = D) => `${day}T${time}Z`;

let db;
const made = { tenants: [], users: [] };
const RUN = Date.now().toString(36);
let serial = 0;
/** The workspaces: id and name by tag. */
const W = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function workspace(tag, status = "active") {
  const name = `Metrics ${tag} ${RUN}`;
  const t = ok(
    await db
      .from("tenants")
      .insert({ name, slug: `metrics-${tag}-${++serial}-${RUN}`, status })
      .select("id")
      .single(),
    `workspace ${tag}`,
  ).id;
  made.tenants.push(t);
  W[tag] = { id: t, name };
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

/** Messages of one thread: [direction, sender, channel, status, when, meta?]. */
async function messages(th, rows) {
  ok(
    await db.from("messages").insert(
      rows.map(([direction, sender, channel, status, when, meta]) => ({
        ...th,
        direction,
        sender,
        channel,
        status,
        type: "text",
        body: "made-up words",
        created_at: when,
        meta: meta ?? {},
      })),
    ),
    "messages",
  );
}

async function events(t, rows) {
  ok(
    await db.from("events").insert(
      rows.map(([kind, data, when]) => ({
        tenant_id: t,
        kind,
        category: kind.startsWith("usage.") ? "usage" : "message",
        data,
        created_at: when,
      })),
    ),
    "events",
  );
}

const rolled = async (t, day = D) =>
  ok(await db.from("platform_metrics").select("*").eq("tenant_id", t).eq("day", day), "platform_metrics")[0];
const roll = async (day = D) => ok(await db.rpc("platform_metrics_roll", { p_day: day }), `roll ${day}`);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });

  // W1, busy: three channels, both kinds of first reply, a failed send, the receptionist at work, the day's edges.
  const busy = await workspace("busy");
  const c1 = await thread(busy);
  const c2 = await thread(busy);
  await messages(c1, [
    ["inbound", "customer", "whatsapp", "received", at("10:00:00")], // ask 1
    ["outbound", "ai", "whatsapp", "sent", at("10:01:00")], // answers it: the receptionist
    ["inbound", "customer", "sms", "received", at("11:00:00")], // ask 2
    ["outbound", "human", "sms", "delivered", at("11:30:00")], // answers it: a person
    ["inbound", "customer", "whatsapp", "received", at("12:00:00")], // ask 3
    ["outbound", "ai", "whatsapp", "failed", at("12:01:00")], // never left: not out, not an answer
    ["outbound", "ai", "whatsapp", "queued", at("15:00:00")], // waiting: not out yet
    ["outbound", "ai", "whatsapp", "canceled", at("15:05:00")],
  ]);
  await messages(c2, [
    ["inbound", "customer", "email", "received", at("13:00:00")], // ask 4, never answered
    ["inbound", "customer", "whatsapp", "received", at("14:00:00"), { backfill: true }], // history brought in: nothing
    ["outbound", "system", "whatsapp", "read", at("14:30:00")], // out, and answers no one
    ["inbound", "customer", "whatsapp", "received", at("00:00:00")], // ask 5: the day's first instant is in
    ["inbound", "customer", "sms", "received", at("23:59:59")], // ask 6: its last second is in
    ["inbound", "customer", "whatsapp", "received", at("23:59:59", "2026-03-09")], // yesterday's
    ["inbound", "customer", "whatsapp", "received", at("00:00:00", "2026-03-11")], // tomorrow's first instant is out
  ]);
  await events(busy, [
    // The receptionist's replies: answered at once, held (both ways), handed over, and answered with no latency said.
    [
      "usage.llm_tokens",
      { held: null, escalate: false, latency_ms: 1000, input_tokens: 100, output_tokens: 20 },
      at("10:01:00"),
    ],
    [
      "usage.llm_tokens",
      { held: "low_confidence", escalate: false, latency_ms: 2000, input_tokens: 50, output_tokens: 10 },
      at("10:02:00"),
    ],
    [
      "usage.llm_tokens",
      { held: "veto_window", escalate: false, latency_ms: 3000, input_tokens: 10, output_tokens: 5 },
      at("10:03:00"),
    ],
    [
      "usage.llm_tokens",
      { held: null, escalate: true, latency_ms: 4000, input_tokens: 5, output_tokens: 5 },
      at("10:04:00"),
    ],
    ["usage.llm_tokens", { held: null, escalate: false, input_tokens: 1, output_tokens: 1 }, at("10:05:00")],
    // A reach-out reply's draft: tokens, and no `held`: not a reply, and its latency is not the receptionist's.
    [
      "usage.llm_tokens",
      { source: "reach_out_reply_draft", escalate: false, latency_ms: 90000, input_tokens: 7, output_tokens: 3 },
      at("10:06:00"),
    ],
    ["usage.ask_tokens", { input_tokens: 1000, output_tokens: 200, latency_ms: 800 }, at("10:07:00")],
    // Another day's tokens, and a kind that is not usage.
    [
      "usage.llm_tokens",
      { held: null, escalate: false, latency_ms: 9, input_tokens: 9999, output_tokens: 9999 },
      at("23:59:59", "2026-03-09"),
    ],
    [
      "usage.llm_tokens",
      { held: null, escalate: false, latency_ms: 9, input_tokens: 9999, output_tokens: 9999 },
      at("00:00:00", "2026-03-11"),
    ],
    ["message.sent", { sender: "ai", input_tokens: 9999 }, at("10:08:00")],
    // Sends that failed: the outcome said, or only the status. 429 and 408 are the provider's "not now".
    ["message.send_failed", { http_status: 503, outcome: "unknown", reason: "provider" }, at("12:01:00")],
    ["message.send_failed", { http_status: 502, reason: "provider" }, at("12:02:00")],
    ["message.send_failed", { http_status: 400, reason: "provider" }, at("12:03:00")],
    ["message.send_failed", { http_status: 429, reason: "provider" }, at("12:04:00")],
    ["message.send_failed", { http_status: 408, reason: "provider" }, at("12:05:00")],
    ["message.send_failed", { http_status: 0, reason: "provider" }, at("12:06:00")],
    ["message.send_failed", { http_status: 404, outcome: "retryable", reason: "provider" }, at("12:07:00")],
    ["message.send_failed", { reason: "provider" }, at("12:08:00")],
    ["message.send_failed", { http_status: 400, reason: "provider" }, at("00:00:00", "2026-03-11")],
  ]);

  // W2, silent: customers wrote and nothing that left answered them.
  const silent = await workspace("silent");
  const s1 = await thread(silent);
  await messages(s1, [
    ["inbound", "customer", "whatsapp", "received", at("09:00:00")],
    ["inbound", "customer", "whatsapp", "received", at("09:10:00")],
    ["inbound", "customer", "whatsapp", "received", at("09:20:00")],
    ["outbound", "ai", "whatsapp", "failed", at("09:21:00")],
  ]);
  await events(silent, [["message.send_failed", { http_status: 500, reason: "provider" }, at("09:21:00")]]);

  // W3 and W3b: silent too, but not active, so nobody is paged for them.
  const paused = await workspace("paused", "paused");
  await messages(await thread(paused), [
    ["inbound", "customer", "sms", "received", at("08:00:00")],
    ["inbound", "customer", "sms", "received", at("08:05:00")],
  ]);
  const test_ = await workspace("test", "test");
  await messages(await thread(test_), [["inbound", "customer", "sms", "received", at("08:00:00")]]);

  // W5: a person answered, and no receptionist ever did.
  const person = await workspace("person");
  await messages(await thread(person), [
    ["inbound", "customer", "email", "received", at("16:00:00")],
    ["outbound", "human", "email", "sent", at("16:20:00")],
  ]);

  // W4 and W6: nothing on the day. One is busy on other days; one has only history brought in.
  const quiet = await workspace("quiet");
  const q = await thread(quiet);
  await messages(q, [["inbound", "customer", "whatsapp", "received", at("12:00:00", "2026-03-12")]]);
  await events(quiet, [
    [
      "usage.llm_tokens",
      { held: null, escalate: false, input_tokens: 5, output_tokens: 5 },
      at("12:00:00", "2026-03-07"),
    ],
  ]);
  const history = await workspace("history");
  await messages(await thread(history), [
    ["inbound", "customer", "whatsapp", "received", at("12:00:00"), { backfill: true }],
  ]);
});

after(async () => {
  if (skip) return;
  for (const id of made.tenants) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of made.users) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/* ------------------------------------------------------------------------------------------------ the rollup */

test(
  "the roll counts each workspace's day, and writes a row only for a workspace that did something",
  { skip },
  async () => {
    const wrote = await roll();
    const all = ok(await db.from("platform_metrics").select("tenant_id").eq("day", D), "the day's rows");
    assert.equal(wrote, all.length, "it answers how many rows it wrote");

    const busy = await rolled(W.busy.id);
    assert.deepEqual(
      busy.messages_in,
      { whatsapp: 3, sms: 2, email: 1 },
      "customers' messages by channel, history and the edges out",
    );
    assert.deepEqual(
      busy.messages_out,
      { whatsapp: 2, sms: 1 },
      "sent, delivered or read only: not failed, queued or canceled",
    );
    assert.equal(busy.asks, 6, "six customers' messages, the first instant and the last second in");
    assert.equal(busy.answered, 2, "one answered by the receptionist, one by a person");
    assert.equal(busy.replies_answered, 2, "answered at once (one with no latency said)");
    assert.equal(busy.replies_held, 2, "held for low confidence and for the veto window");
    assert.equal(busy.replies_handed_off, 1, "handed to a person");
    assert.equal(
      busy.brain_p95_ms,
      3850,
      "the 95th percentile of 1, 2, 3 and 4 s; the draft's 90 s is not the receptionist's",
    );
    assert.equal(
      busy.tokens,
      217 + 1200,
      "model tokens, the receptionist's, the draft's and Ask's; another day's and another kind's are not",
    );
    assert.deepEqual(
      busy.provider_failures,
      { unknown: 2, refused: 1, retryable: 5 },
      "503 said unknown and 502 is; 400 refused; 429, 408, no answer, a said retryable and no status are calls that left nothing",
    );
    assert.equal(busy.day, D);

    const silent = await rolled(W.silent.id);
    assert.equal(silent.asks, 3);
    assert.equal(silent.answered, 0, "a send that failed is no answer");
    assert.deepEqual(silent.messages_in, { whatsapp: 3 });
    assert.deepEqual(silent.messages_out, {});
    assert.deepEqual(silent.provider_failures, { unknown: 1 });
    assert.deepEqual(
      [silent.replies_answered, silent.replies_held, silent.replies_handed_off, silent.brain_p95_ms, silent.tokens],
      [0, 0, 0, null, 0],
      "the receptionist did nothing that day: zeros, and no latency to report",
    );

    const person = await rolled(W.person.id);
    assert.deepEqual([person.asks, person.answered], [1, 1], "an answer from a person counts");
    assert.deepEqual(person.messages_out, { email: 1 });

    assert.equal((await rolled(W.paused.id)).asks, 2, "a paused workspace is counted; it is only not paged");
    assert.equal((await rolled(W.test.id)).asks, 1);

    assert.equal(await rolled(W.quiet.id), undefined, "a workspace busy on other days only has no row for this one");
    assert.equal(await rolled(W.history.id), undefined, "nor one with only history brought in");
  },
);

test("re-running a day replaces its rows and never counts twice", { skip }, async () => {
  const before_ = await rolled(W.silent.id);
  const others = await rolled(W.busy.id);
  const first = await roll();
  assert.equal((await rolled(W.busy.id)).tokens, others.tokens, "the same day twice counts the same tokens");
  assert.deepEqual(
    { ...(await rolled(W.busy.id)), rolled_at: null },
    { ...others, rolled_at: null },
    "and every other number of the day",
  );
  assert.ok(Date.parse((await rolled(W.busy.id)).rolled_at) >= Date.parse(others.rolled_at), "stamped again");
  const s = await thread(W.silent.id);
  await messages(s, [["inbound", "customer", "whatsapp", "received", at("09:30:00")]]);
  const second = await roll();
  assert.equal(second, first, "the same workspaces are written");
  const after_ = await rolled(W.silent.id);
  assert.equal(after_.asks, before_.asks + 1, "a message that came in is counted once, in place of the row that was");
  assert.deepEqual(after_.messages_in, { whatsapp: 4 });
  assert.equal(
    ok(await db.from("platform_metrics").select("tenant_id").eq("tenant_id", W.silent.id), "rows").length,
    1,
    "one row for the day",
  );
});

test("a table row cannot hold a negative count", { skip }, async () => {
  for (const bad of [{ asks: -1 }, { answered: -1 }, { replies_held: -1 }, { brain_p95_ms: -1 }, { tokens: -1 }]) {
    const r = await db.from("platform_metrics").insert({ tenant_id: W.quiet.id, day: "2026-02-01", ...bad });
    assert.ok(r.error, `${JSON.stringify(bad)} was accepted`);
    assert.equal(r.error.code, "23514");
  }
});

/* ------------------------------------------------------------------------------------------------ the alarm */

test(
  "platform_answer_silence names only the active workspaces whose customers were not answered by anyone",
  { skip },
  async () => {
    const silent = ok(await db.rpc("platform_answer_silence", { p_day: D }), "the day's silence");
    const mine = silent.filter((r) => Object.values(W).some((w) => w.id === r.tenant_id));
    assert.deepEqual(
      mine.map((r) => [r.tenant_id, r.name, r.asks]),
      [[W.silent.id, W.silent.name, (await rolled(W.silent.id)).asks]],
      "the silent workspace, with its name and its asks (the busy one, answered, and the person's are not listed; nor is the paused one, nor the test one, nor a workspace with nothing that day)",
    );
    const other = ok(await db.rpc("platform_answer_silence", { p_day: "2026-03-11" }), "another day");
    assert.equal(
      other.filter((r) => Object.values(W).some((w) => w.id === r.tenant_id)).length,
      0,
      "a day nobody rolled names nobody",
    );
    // A workspace that is paused today was active when its customers wrote; the alarm asks about who is active now.
    ok(await db.from("tenants").update({ status: "active" }).eq("id", W.paused.id), "activate");
    const woken = ok(await db.rpc("platform_answer_silence", { p_day: D }), "silence with the paused one active");
    assert.deepEqual(
      woken.filter((r) => r.tenant_id === W.paused.id).map((r) => r.asks),
      [2],
    );
    ok(await db.from("tenants").update({ status: "paused" }).eq("id", W.paused.id), "pause again");
  },
);

/* ------------------------------------------------------------------------------------------------- the read */

test(
  "platform_metrics_read: newest day first, the name beside the row, the window clamped to 1..90 and a week by default",
  { skip },
  async () => {
    const today = new Date();
    const day = (ago) =>
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ago))
        .toISOString()
        .slice(0, 10);
    const t = await workspace("reader");
    const rival = await workspace("rival");
    const rows = [1, 2, 7, 8, 89, 90, 91].map((ago) => ({ tenant_id: t, day: day(ago), asks: ago }));
    ok(await db.from("platform_metrics").insert(rows), "days");
    ok(
      await db.from("platform_metrics").insert({ tenant_id: rival, day: day(1), asks: 500 }),
      "a busier workspace, the same day",
    );
    const read = async (args) => {
      const data = ok(await db.rpc("platform_metrics_read", args), "read");
      return data.filter((r) => r.tenant_id === t || r.tenant_id === rival);
    };
    const days = (rs) => rs.filter((r) => r.tenant_id === t).map((r) => r.day);

    const week = await read({});
    assert.deepEqual(
      days(week),
      [day(1), day(2), day(7)],
      "a week by default, newest first: 7 days back is in, 8 is not",
    );
    assert.deepEqual(days(await read({ p_days: null })), days(week), "and null is a week");
    assert.deepEqual(days(await read({ p_days: 7 })), days(week));
    assert.deepEqual(
      week.filter((r) => r.day === day(1)).map((r) => [r.tenant_id, r.name]),
      [
        [rival, W.rival.name],
        [t, W.reader.name],
      ],
      "within a day the busier workspace first, each with its own name",
    );
    for (const r of week) {
      assert.equal(typeof r.name, "string");
      assert.deepEqual(Object.keys(r).sort(), [
        "answered",
        "asks",
        "brain_p95_ms",
        "day",
        "messages_in",
        "messages_out",
        "name",
        "provider_failures",
        "replies_answered",
        "replies_handed_off",
        "replies_held",
        "tenant_id",
        "tokens",
      ]);
    }
    assert.deepEqual(days(await read({ p_days: 1 })), [day(1)], "one day is yesterday");
    assert.deepEqual(days(await read({ p_days: 0 })), [day(1)], "less than one is one");
    assert.deepEqual(days(await read({ p_days: -30 })), [day(1)], "and so is a negative");
    assert.deepEqual(days(await read({ p_days: 8 })), [day(1), day(2), day(7), day(8)]);
    assert.deepEqual(
      days(await read({ p_days: 90 })),
      [day(1), day(2), day(7), day(8), day(89), day(90)],
      "ninety is the most",
    );
    assert.deepEqual(
      days(await read({ p_days: 5000 })),
      days(await read({ p_days: 90 })),
      "more than ninety is ninety",
    );
  },
);

/* ------------------------------------------------------------------------------------------------- the door */

test(
  "no member and no anon key reads the table or executes any of the three; the service role does",
  { skip },
  async () => {
    const owner = await workspace("door");
    const email = `metrics-owner-${RUN}@example.com`;
    const password = `pw-${RUN}-Aa1!`;
    const u = ok(await db.auth.admin.createUser({ email, password, email_confirm: true }), "user").user;
    made.users.push(u.id);
    ok(await db.from("memberships").insert({ tenant_id: owner, user_id: u.id, role: "owner" }), "membership");
    ok(
      await db.from("platform_metrics").insert({ tenant_id: owner, day: "2026-02-02", asks: 1 }),
      "a row of the workspace's",
    );
    const member = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await member.auth.signInWithPassword({ email, password });
    assert.equal(s.error, null, s.error?.message);
    const nobody = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

    for (const [who, client] of [
      ["a signed-in owner", member],
      ["the anon key", nobody],
    ]) {
      const read = await client.from("platform_metrics").select("*").eq("tenant_id", owner);
      assert.ok(read.error, `REGRESSION: ${who} read platform_metrics (${read.data?.length} rows)`);
      assert.equal(read.error.code, "42501", `${who}: ${read.error.message}`);
      const write = await client.from("platform_metrics").insert({ tenant_id: owner, day: "2026-02-03" });
      assert.equal(write.error?.code, "42501", `${who} wrote: ${write.error?.message}`);
      const erase = await client.from("platform_metrics").delete().eq("tenant_id", owner).select("day");
      assert.ok(erase.error || erase.data.length === 0, `${who} deleted a row`);
      for (const [fn, args] of [
        ["platform_metrics_roll", { p_day: D }],
        ["platform_metrics_read", { p_days: 7 }],
        ["platform_answer_silence", { p_day: D }],
      ]) {
        const r = await client.rpc(fn, args);
        assert.ok(r.error, `REGRESSION: ${who} executed ${fn}`);
        assert.equal(r.error.code, "42501", `${who} calling ${fn}: ${r.error.message}`);
      }
    }
    const served = await db.from("platform_metrics").select("*").eq("tenant_id", owner);
    assert.equal(served.error, null);
    assert.equal(served.data.length, 1, "the service role reads it, and nothing was written or deleted");
    for (const [fn, args] of [
      ["platform_metrics_read", { p_days: 7 }],
      ["platform_answer_silence", { p_day: D }],
    ])
      ok(await db.rpc(fn, args), `the service role calls ${fn}`);
  },
);

/** A transaction on this machine's database that never commits: `body` runs in a DO block that ends by raising what it `seen`. */
function rolledBack(body) {
  const sql = `do $$ declare seen jsonb := '{}'; begin ${body} raise exception 'seen %', encode(convert_to(seen::text, 'UTF8'), 'hex'); end $$`;
  const r = spawnSync(CLI, ["db", "query", ...CLI_TARGET, sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  const said = [r.stdout, r.stderr]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (/not_this_database/.test(said))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

test(
  "the table has row-level security on and no policy, so a member reads nothing however the grants stand",
  { skip },
  () => {
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${W.busy.id}') then
      raise exception 'not_this_database';
    end if;
    seen := jsonb_build_object(
      'rls', (select c.relrowsecurity from pg_class c where c.oid = 'public.platform_metrics'::regclass),
      'forced', (select c.relforcerowsecurity from pg_class c where c.oid = 'public.platform_metrics'::regclass),
      'policies', (select count(*) from pg_policy p where p.polrelid = 'public.platform_metrics'::regclass),
      'anon', has_table_privilege('anon', 'public.platform_metrics', 'SELECT,INSERT,UPDATE,DELETE'),
      'authenticated', has_table_privilege('authenticated', 'public.platform_metrics', 'SELECT,INSERT,UPDATE,DELETE'),
      'service', has_table_privilege('service_role', 'public.platform_metrics', 'SELECT,INSERT,UPDATE,DELETE'),
      'functions', (select jsonb_object_agg(f, jsonb_build_object(
          'anon', has_function_privilege('anon', f::regprocedure, 'EXECUTE'),
          'authenticated', has_function_privilege('authenticated', f::regprocedure, 'EXECUTE'),
          'service', has_function_privilege('service_role', f::regprocedure, 'EXECUTE')))
        from unnest(array['public.platform_metrics_roll(date)', 'public.platform_metrics_read(integer)', 'public.platform_answer_silence(date)']) f));
  `);
    assert.equal(seen.rls, true, "row-level security is on");
    assert.equal(seen.policies, 0, "and no policy lets a member in");
    assert.equal(seen.anon, false);
    assert.equal(
      seen.authenticated,
      false,
      "no table privilege for a signed-in session either: refused for the privilege, not an empty list",
    );
    assert.equal(seen.service, true);
    for (const [fn, who] of Object.entries(seen.functions))
      assert.deepEqual(who, { anon: false, authenticated: false, service: true }, fn);
  },
);

test("deleting a workspace takes its days with it", { skip }, async () => {
  const t = await workspace("gone");
  ok(
    await db.from("platform_metrics").insert([
      { tenant_id: t, day: "2026-02-04" },
      { tenant_id: t, day: "2026-02-05" },
    ]),
    "days",
  );
  assert.equal(ok(await db.from("platform_metrics").select("day").eq("tenant_id", t), "before").length, 2);
  ok(await db.from("tenants").delete().eq("id", t), "delete the workspace");
  assert.deepEqual(
    ok(await db.from("platform_metrics").select("day").eq("tenant_id", t), "after"),
    [],
    "its rows went with it",
  );
});

/* ------------------------------------------------------------------------------------------------ the clock */

test(
  "the clock: a job at 00:17 UTC, registered as judged on its runs within 26 hours, and sweep_health() reports it",
  { skip },
  async () => {
    const jobs = ok(await db.rpc("sweep_schedules"), "the schedules");
    const job = jobs.find((j) => j.jobname === "platform-metrics-roll");
    assert.ok(job, "no cron job named platform-metrics-roll is scheduled");
    assert.equal(job.schedule, "17 0 * * *");
    assert.equal(job.active, true);

    const row = ok(
      await db
        .from("sweep_status")
        .select("sweep, jobname, judged_by, max_silence")
        .eq("sweep", "platform_metrics_roll")
        .single(),
      "the register",
    );
    assert.deepEqual(row, {
      sweep: "platform_metrics_roll",
      jobname: "platform-metrics-roll",
      judged_by: "run",
      max_silence: "26:00:00",
    });

    const health = ok(await db.rpc("sweep_health"), "sweep_health").find((r) => r.sweep === "platform_metrics_roll");
    assert.ok(health, "sweep_health() does not report the clock");
    assert.equal(health.scheduled, true, "and finds its job");
    assert.equal(health.healthy, true, health.detail ?? "");
    assert.equal(health.detail, null);
  },
);

test("the clock's own command rolls up yesterday, UTC", { skip }, () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  // The workspace has a customer's message yesterday, written in the transaction the block runs in.
  const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${W.busy.id}') then
      raise exception 'not_this_database';
    end if;
    insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, status, created_at)
      select c.tenant_id, c.id, c.contact_id, 'sms', 'inbound', 'customer', 'text', 'received',
             ((now() at time zone 'utc')::date - 1)::timestamp at time zone 'utc' + interval '12 hours'
        from public.conversations c where c.tenant_id = '${W.quiet.id}' limit 1;
    -- The command the job holds, run as the job runs it.
    execute (select j.command from cron.job j where j.jobname = 'platform-metrics-roll');
    seen := jsonb_build_object(
      'day', (select pm.day::text from public.platform_metrics pm
               where pm.tenant_id = '${W.quiet.id}' order by pm.day desc limit 1),
      'asks', (select pm.asks from public.platform_metrics pm
                where pm.tenant_id = '${W.quiet.id}' and pm.day = (now() at time zone 'utc')::date - 1),
      'today', (select count(*) from public.platform_metrics pm where pm.day = (now() at time zone 'utc')::date));
  `);
  assert.equal(seen.day, yesterday, "the row is yesterday's, UTC");
  assert.equal(seen.asks, 1);
  assert.equal(seen.today, 0, "and nothing is counted for a day that is not over");
});
