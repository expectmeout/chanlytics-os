/**
 * The model ledger on the database (00276, 00277, 00278), with real sessions: every model call kept in dollars, who
 * reads it, what it rolls up to, the alarm that reads it and the keep; a new workspace's day of model budget; and the
 * second model's shadow rows (step 12, decision 0023): their shape, who does not read them, what they leave out of a
 * workspace's meter and alarm, and the week of agreement one function answers.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows. The
 * members are real: made with the admin API and signed in through the anon key, so RLS judges them as the dashboard's
 * client would.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { MODEL_PORTS, MODEL_PURPOSES, TOKENS_DAY_DEFAULT } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

let db;
let A;
let B;
let member; // a viewer of A: reads, never writes
let stranger; // an owner of B
const users = [];

async function memberClient(role, tenant) {
  const email = `ai-${role}-${stamp}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return client;
}

/** A primary call's row, as the model port writes it. */
const call = (tenant, over = {}) => ({
  tenant_id: tenant,
  purpose: "receptionist",
  model_asked: "claude-opus-5",
  model: "claude-opus-5",
  outcome: "answered",
  input_tokens: 1_000,
  output_tokens: 200,
  cache_read_tokens: 500,
  cache_write_tokens: 100,
  usd: 0.01,
  ...over,
});

/** One question a shadow answered. */
const shadow = (tenant, over = {}) => ({
  tenant_id: tenant,
  purpose: "reply_read",
  model_asked: "jev-1.13.0",
  model: "jev-1.13.0",
  outcome: "answered",
  port: "typesafe",
  shadow: true,
  question: "reply_intent",
  primary_answer: "no",
  shadow_answer: "no",
  shadow_confidence: 0.9,
  confident: true,
  agrees: true,
  input_tokens: 0,
  usd: 0,
  ...over,
});

/**
 * Rows into the ledger, asserted written. PostgREST writes a bulk insert's missing keys as null, not as the column's
 * default, so rows of different keys go in groups of the same keys.
 */
async function put(rows) {
  const groups = new Map();
  for (const r of rows)
    groups.set(Object.keys(r).sort().join(","), [...(groups.get(Object.keys(r).sort().join(",")) ?? []), r]);
  for (const group of groups.values()) {
    const w = await db.from("ai_usage").insert(group);
    assert.equal(w.error, null, w.error?.message);
  }
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const a = await db
    .from("tenants")
    .insert({ slug: `ai-usage-${stamp}`, name: "Ledger" })
    .select("id")
    .single();
  assert.equal(a.error, null, a.error?.message);
  A = a.data.id;
  const b = await db
    .from("tenants")
    .insert({ slug: `ai-usage-other-${stamp}`, name: "Other" })
    .select("id")
    .single();
  assert.equal(b.error, null, b.error?.message);
  B = b.data.id;
  member = await memberClient("viewer", A);
  stranger = await memberClient("owner", B);
});

after(async () => {
  if (skip) return;
  await db.from("ai_usage").delete().in("tenant_id", [A, B].filter(Boolean));
  await db.from("events").delete().in("tenant_id", [A, B].filter(Boolean));
  for (const id of [A, B]) if (id) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

const count = async (client, table, tenant, extra = (q) => q) => {
  const r = await extra(client.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", tenant));
  return r.error ? `error: ${r.error.code}` : r.count;
};

test(
  "00277: a workspace made now starts with a day of model budget on its reply row, and the money row locked to never",
  { skip },
  async () => {
    const reply = await db.from("policies").select("limits").eq("tenant_id", A).eq("class", "reply").single();
    assert.equal(reply.error, null, reply.error?.message);
    assert.deepEqual(reply.data.limits, {
      max_replies_day: 20,
      pause_hours: 24,
      max_llm_tokens_day: TOKENS_DAY_DEFAULT,
    });
    const money = await db.from("policies").select("mode").eq("tenant_id", A).eq("class", "money").single();
    assert.equal(money.data.mode, "never");
  },
);

test(
  "00276: a call is kept with its four kinds of tokens and its dollars; the columns' sets are the contracts'",
  { skip },
  async () => {
    await put([
      call(A),
      call(A, { purpose: "ask", model_asked: "claude-opus-5-5", model: "claude-opus-5-5", usd: 0.02, user_id: null }),
      call(A, { purpose: "reply_read", outcome: "fell_back", model: "claude-sonnet-5", usd: 0.001 }),
      call(B, { usd: 0.5 }),
    ]);
    // A purpose, an outcome or a port the contracts do not list is refused by the database's own CHECK.
    for (const bad of [
      { purpose: "chat" },
      { outcome: "great" },
      { port: "openai" },
      { input_tokens: -1 },
      { model: "" },
    ]) {
      const r = await db.from("ai_usage").insert(call(A, bad));
      assert.equal(r.error?.code, "23514", JSON.stringify(bad));
    }
    assert.ok(MODEL_PURPOSES.length >= 10 && MODEL_PORTS.includes("typesafe"));
  },
);

test(
  "00276: a member reads their workspace's calls and no other's; nobody signed in writes one, and anon reads none",
  { skip },
  async () => {
    assert.equal(await count(member, "ai_usage", A), 3);
    assert.equal(await count(member, "ai_usage", B), 0, "another workspace's rows are not there to read");
    assert.equal(await count(stranger, "ai_usage", A), 0);
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const seen = await anon.from("ai_usage").select("id").limit(1);
    assert.ok(seen.error || seen.data.length === 0, "anon reads nothing");
    const insert = await member.from("ai_usage").insert(call(A));
    assert.equal(insert.error?.code, "42501", "a member cannot write the ledger");
    const update = await member.from("ai_usage").update({ usd: 0 }).eq("tenant_id", A).select();
    assert.ok(update.error?.code === "42501" || update.data.length === 0, "nor change a row");
    const gone = await member.from("ai_usage").delete().eq("tenant_id", A).select();
    assert.ok(gone.error?.code === "42501" || gone.data.length === 0, "nor remove one");
    assert.equal(await count(db, "ai_usage", A), 3, "and all of it stands");
  },
);

test(
  "00276: the month rolls up by meter, purpose and model as the member's own rows; the phone and WhatsApp meters ride beside",
  { skip },
  async () => {
    await db.from("events").insert([
      { tenant_id: A, kind: "usage.voice_seconds", data: { seconds: 95 } },
      { tenant_id: A, kind: "usage.wa_conversation", data: {} },
    ]);
    const month = new Date().toISOString().slice(0, 7) + "-01";
    const mine = await member.rpc("ai_usage_month", { p_tenant_id: A, p_month: month });
    assert.equal(mine.error, null, mine.error?.message);
    const byMeter = (m) => mine.data.filter((r) => r.meter === m);
    assert.equal(
      byMeter("model").reduce((n, r) => n + Number(r.uses), 0),
      3,
    );
    assert.equal(Math.round(byMeter("model").reduce((n, r) => n + Number(r.usd), 0) * 1e4) / 1e4, 0.031);
    assert.deepEqual(
      byMeter("model")
        .map((r) => [r.purpose, r.model, Number(r.input_tokens), Number(r.cache_write_tokens)])
        .sort(),
      [
        ["ask", "claude-opus-5-5", 1000, 100],
        ["receptionist", "claude-opus-5", 1000, 100],
        ["reply_read", "claude-sonnet-5", 1000, 100],
      ],
    );
    assert.equal(Number(byMeter("voice_seconds")[0].quantity), 95);
    assert.equal(Number(byMeter("wa_conversation")[0].uses), 1);
    const theirs = await member.rpc("ai_usage_month", { p_tenant_id: B, p_month: month });
    assert.deepEqual(theirs.data ?? [], [], "RLS decides whose rows it sums: none of another workspace's");
  },
);

test(
  "00276: the alarm names the workspaces whose calls or turns failed this hour, for the service role alone; the purge keeps 400 days",
  { skip },
  async () => {
    await put([
      call(A, { outcome: "unreachable", usd: 0 }),
      call(A, { outcome: "rejected", usd: 0 }),
      call(A, { outcome: "unreadable", usd: 0 }),
      call(A, { outcome: "unreachable", usd: 0, created_at: ago(3 * HOUR) }),
    ]);
    const hot = await db.rpc("ai_failures_hour", { p_min: 3 });
    assert.equal(hot.error, null, hot.error?.message);
    assert.deepEqual(
      hot.data.filter((r) => r.tenant_id === A).map((r) => [Number(r.failed_calls), Number(r.brain_errors)]),
      [[3, 0]],
      "the three in the hour, not the one three hours ago",
    );
    assert.equal(hot.data.filter((r) => r.tenant_id === B).length, 0);
    assert.equal((await member.rpc("ai_failures_hour", { p_min: 1 })).error?.code, "42501");

    await put([call(A, { created_at: ago(401 * DAY) }), call(A, { created_at: ago(399 * DAY) })]);
    const purged = await db.rpc("ai_usage_purge");
    assert.equal(purged.error, null, purged.error?.message);
    assert.ok(purged.data >= 1);
    const old = await db
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A)
      .lt("created_at", ago(400 * DAY));
    assert.equal(old.count, 0, "nothing past its keep is left");
    const kept = await db
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A)
      .lt("created_at", ago(398 * DAY));
    assert.equal(kept.count, 1, "the row 399 days old stays");
    assert.equal((await member.rpc("ai_usage_purge")).error?.code, "42501");
    await db
      .from("ai_usage")
      .delete()
      .eq("tenant_id", A)
      .lt("created_at", ago(398 * DAY));
  },
);

test(
  "00278: a shadow row names its port and carries its comparison; the columns that compare belong to a shadow alone",
  { skip },
  async () => {
    assert.equal((await db.from("ai_usage").insert(shadow(A))).error, null);
    const rows = await db
      .from("ai_usage")
      .select("port, shadow, agrees, confident")
      .eq("tenant_id", A)
      .eq("shadow", true);
    assert.deepEqual(rows.data, [{ port: "typesafe", shadow: true, agrees: true, confident: true }]);
    const primary = await db
      .from("ai_usage")
      .select("port, shadow, question, agrees")
      .eq("tenant_id", A)
      .eq("shadow", false)
      .limit(1)
      .single();
    assert.deepEqual(
      primary.data,
      { port: "anthropic", shadow: false, question: null, agrees: null },
      "a primary's row carries none of them",
    );
    for (const [why, bad] of [
      ["a shadow on the primary's port", shadow(A, { port: "anthropic" })],
      ["a primary row that compares", call(A, { agrees: true })],
      ["a primary row that names a question", call(A, { question: "reply_intent" })],
      ["a confidence over one", shadow(A, { shadow_confidence: 1.5 })],
      ["a label that is a paragraph", shadow(A, { shadow_answer: "x".repeat(81) })],
    ]) {
      assert.equal((await db.from("ai_usage").insert(bad)).error?.code, "23514", why);
    }
    await db.from("ai_usage").delete().eq("tenant_id", A).eq("shadow", true);
  },
);

test(
  "00278: a workspace's meter, its alarm and its own read leave the platform's shadow rows out",
  { skip },
  async () => {
    const before = await db
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", A)
      .eq("shadow", false);
    await put([
      ...Array.from({ length: 6 }, () =>
        shadow(A, {
          outcome: "unreachable",
          question: "call",
          primary_answer: null,
          shadow_answer: null,
          shadow_confidence: null,
          confident: null,
          agrees: null,
        }),
      ),
      shadow(A, { input_tokens: 312, usd: 0.000013 }),
    ]);
    assert.equal(await count(member, "ai_usage", A), before.count, "a member reads no shadow row");
    assert.equal(
      await count(db, "ai_usage", A, (q) => q.eq("shadow", true)),
      7,
      "and the service role reads all of them",
    );
    const month = new Date().toISOString().slice(0, 7) + "-01";
    const mine = await member.rpc("ai_usage_month", { p_tenant_id: A, p_month: month });
    assert.equal(
      mine.data.filter((r) => r.meter === "model").reduce((n, r) => n + Number(r.uses), 0),
      before.count,
      "the meter counts the calls a workspace used",
    );
    assert.equal(mine.data.filter((r) => r.model === "jev-1.13.0").length, 0);
    const hot = await db.rpc("ai_failures_hour", { p_min: 5 });
    assert.equal(
      hot.data.filter((r) => r.tenant_id === A).length,
      0,
      "six failed shadow calls page nobody about a workspace",
    );
    await db.from("ai_usage").delete().eq("tenant_id", A).eq("shadow", true);
  },
);

test(
  "00278: a week of agreement per purpose and question, plain and among the answers that cleared the line; for the service role alone",
  { skip },
  async () => {
    const sure = (over) => shadow(A, over);
    await put([
      // reply_read / reply_intent: eight compared, six agree; five decided, four of them agree; one with no label to compare.
      ...Array.from({ length: 4 }, (_, i) => sure({ input_tokens: i === 0 ? 900 : 0, usd: i === 0 ? 0.000038 : 0 })),
      sure({ agrees: false, shadow_answer: "not_now" }),
      sure({ confident: false, shadow_confidence: 0.66 }),
      sure({ confident: false, shadow_confidence: 0.7 }),
      sure({ confident: false, shadow_confidence: 0.55, agrees: false, shadow_answer: "away" }),
      sure({ agrees: null, primary_answer: null }),
      // an injection question, two agreeing; and one ten days old, outside the week
      sure({ purpose: "receptionist", question: "injection", primary_answer: "false", shadow_answer: "false" }),
      sure({ purpose: "receptionist", question: "injection", primary_answer: "false", shadow_answer: "false" }),
      sure({
        purpose: "receptionist",
        question: "injection",
        agrees: false,
        shadow_answer: "true",
        created_at: ago(10 * DAY),
      }),
      // two calls that got no answer
      ...Array.from({ length: 2 }, () =>
        sure({
          purpose: "receptionist",
          outcome: "unreachable",
          question: "call",
          primary_answer: null,
          shadow_answer: null,
          shadow_confidence: null,
          confident: null,
          agrees: null,
        }),
      ),
    ]);
    const week = await db.rpc("ai_shadow_agreement", { p_days: 7 });
    assert.equal(week.error, null, week.error?.message);
    const mine = week.data.filter((r) => [A].includes(A) && r.port === "typesafe");
    const row = (purpose, question) => mine.find((r) => r.purpose === purpose && r.question === question);
    assert.deepEqual(
      Object.keys(week.data[0]).sort(),
      [
        "agree",
        "agreement",
        "compared",
        "confident",
        "confident_agree",
        "confident_agreement",
        "failed_calls",
        "input_tokens",
        "port",
        "purpose",
        "question",
        "usd",
      ],
      "the shape Ruben reads",
    );
    const reader = row("reply_read", "reply_intent");
    assert.deepEqual(
      [
        reader.compared,
        reader.agree,
        Number(reader.agreement),
        reader.confident,
        reader.confident_agree,
        Number(reader.confident_agreement),
      ].map(Number),
      [8, 6, 0.75, 5, 4, 0.8],
      "eight compared and six agree; five were sure and four of those agree",
    );
    assert.deepEqual([Number(reader.input_tokens), Number(reader.usd)], [900, 0.000038]);
    const inj = row("receptionist", "injection");
    assert.deepEqual([inj.compared, inj.agree].map(Number), [2, 2], "the row ten days old is outside the week");
    assert.equal(Number(row("receptionist", "call").failed_calls), 2);
    assert.deepEqual(
      [row("receptionist", "call").compared, row("receptionist", "call").agreement].map((v) =>
        v === null ? null : Number(v),
      ),
      [0, null],
    );
    const month = await db.rpc("ai_shadow_agreement", { p_days: 30 });
    assert.equal(
      Number(month.data.find((r) => r.purpose === "receptionist" && r.question === "injection").compared),
      3,
      "a longer window takes it",
    );
    for (const client of [member, stranger, createClient(URL_, ANON, { auth: { persistSession: false } })]) {
      assert.equal((await client.rpc("ai_shadow_agreement", { p_days: 7 })).error?.code, "42501");
    }
  },
);
