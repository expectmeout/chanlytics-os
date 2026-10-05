/**
 * A day keeps what the lenses read (00316), on a real Postgres.
 *
 * The nightly roll (platform_metrics_roll) counted a day from events purged at thirty days and kept nothing of what the
 * receptionist did. Five columns now keep it, read from rows that last:
 *   - handled: how each customer message ended (messages.meta.handled: ai, held, handoff, blocked);
 *   - topics: what customers asked about, texts (meta.intent) and connected inbound calls (analysis.topic) together,
 *     the nine words of contracts' BRAIN_INTENTS;
 *   - ai_tokens and ai_usd: the model's tokens and list-price dollars by purpose, from the ledger (ai_usage), the
 *     workspace's own calls and never a shadow's; and `tokens` is the ledger's total where the ledger holds the day;
 *   - voice_usd: what the day's calls cost, through call_cost_usd (Retell's cents as dollars, null for anything that is
 *     not a plausible cost).
 * A day nothing said anything about is null, never {} or 0; a word outside its closed set is never a key; the SQL's
 * copies of the closed sets are held to contracts' sets here, so a new topic fails this until the roll is widened;
 * rolling a day again replaces its columns; and a failure in the new columns costs those columns alone: the day's
 * existing counts are still written and the roll still answers.
 *
 * The roll is global (every workspace that did anything that day), so each case owns a day long past and its own
 * workspaces, and nothing else in the database is on it. Made with the service key and removed after, against the
 * database `supabase start` builds on this machine, never production. One block goes through the CLI
 * (SUPABASE_CLI names the binary when `supabase` is not on PATH; SUPABASE_DB_URL aims it), in a transaction that never
 * commits.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { BRAIN_INTENTS, HANDLED_OUTCOMES } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, people, messages and calls"
      : false;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";
// The database the CLI is pointed at: the one the environment names when it is on this machine, else the stack
// `supabase start` runs here.
const DB_URL = process.env.SUPABASE_DB_URL;
const CLI_TARGET =
  DB_URL && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
    ? ["--db-url", `${DB_URL}${DB_URL.includes("?") ? "&" : "?"}sslmode=disable`]
    : ["--local"];

/** The day counted: long past, and nobody else's. */
const D = "2026-03-17";
const at = (time, day = D) => `${day}T${time}Z`;
const RUN = Date.now().toString(36);
let serial = 0;
let db;
const made = [];
const W = {};
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function workspace(tag) {
  const id = ok(
    await db
      .from("tenants")
      .insert({ name: `Lenses ${tag} ${RUN}`, slug: `harbor-lenses-${tag}-${++serial}-${RUN}` })
      .select("id")
      .single(),
    tag,
  ).id;
  made.push(id);
  W[tag] = id;
  return id;
}
/** A person with a thread: the ids messages are written into. */
async function thread(t) {
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: t, phone_e164: `+1555013${String(++serial).padStart(4, "0")}` })
      .select("id")
      .single(),
  ).id;
  const conversation = ok(
    await db.from("conversations").insert({ tenant_id: t, contact_id: contact }).select("id").single(),
  ).id;
  return { tenant_id: t, contact_id: contact, conversation_id: conversation };
}
/** Messages: [direction, sender, when, meta]. All WhatsApp. */
const messages = async (th, rows) =>
  ok(
    await db.from("messages").insert(
      rows.map(([direction, sender, when, meta]) => ({
        ...th,
        channel: "whatsapp",
        direction,
        sender,
        type: "text",
        body: "made-up words",
        status: direction === "inbound" ? "received" : "sent",
        created_at: when,
        meta: meta ?? {},
      })),
    ),
    "messages",
  );
const calls = async (t, rows) =>
  ok(
    await db.from("calls").insert(
      rows.map((r, i) => ({
        tenant_id: t,
        retell_call_id: `lenses-${serial}-${i}-${RUN}`,
        direction: "inbound",
        status: "ended",
        ...r,
      })),
    ),
    "calls",
  );
// A bulk insert fills a key one row lacks with NULL, not the column's default, and a shadow row names columns the
// others do not: so the primary's own values are written out here, and a shadow row overrides them.
const ledger = async (t, rows) =>
  ok(
    await db.from("ai_usage").insert(
      rows.map((r) => ({
        tenant_id: t,
        model_asked: "claude-sonnet-5",
        model: "claude-sonnet-5",
        outcome: "answered",
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        port: "anthropic",
        shadow: false,
        question: null,
        ...r,
      })),
    ),
    "ledger",
  );
const roll = async (day = D) => ok(await db.rpc("platform_metrics_roll", { p_day: day }), `roll ${day}`);
const rolled = async (t, day = D) =>
  ok(await db.from("platform_metrics").select("*").eq("tenant_id", t).eq("day", day), "row")[0];

const stamped = (handled, intent, extra = {}) => ({ handled, ...(intent ? { intent } : {}), ...extra });

/**
 * A transaction on this machine's database that never commits (as team-changes-and-their-audit.db.test.mjs runs one):
 * `body` runs in a DO block that ends by raising what it `seen`, so everything it did goes with it.
 */
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
  const seen = /seen (7b[0-9a-f]*)/.exec(said);
  if (/not_this_database/.test(said))
    throw new Error(
      "the CLI reached a database that does not hold this suite's rows: point SUPABASE_DB_URL at the stack",
    );
  if (!seen) throw new Error(`the block did not get to say what it saw: ${said.slice(-800)}`);
  return JSON.parse(Buffer.from(seen[1], "hex").toString("utf8"));
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });

  // busy: every way a message ends, every way a word can be wrong, both edges of the day, a call of every kind, a ledger.
  const busy = await workspace("busy");
  const c1 = await thread(busy);
  await messages(c1, [
    ["inbound", "customer", at("10:00:00"), stamped("ai", "booking")],
    ["inbound", "customer", at("10:05:00"), stamped("ai", "pricing")],
    ["inbound", "customer", at("10:10:00"), stamped("held", "pricing")],
    ["inbound", "customer", at("10:15:00"), stamped("handoff", "complaint")],
    ["inbound", "customer", at("10:20:00"), stamped("blocked")],
    ["inbound", "customer", at("10:25:00")], // never stamped: counted in neither
    ["inbound", "customer", at("10:30:00"), stamped("banana", "banana")], // words outside the sets: never a key
    ["inbound", "customer", at("10:35:00"), stamped("ai", "booking", { backfill: true })], // history brought in
    ["outbound", "ai", at("11:00:00"), stamped("ai", "booking")], // the receptionist's own words are no customer's message
    ["inbound", "customer", at("00:00:00"), stamped("ai", "hours")], // the day's first instant is in
    ["inbound", "customer", at("23:59:59"), stamped("held", "location")], // its last second is in
    ["inbound", "customer", at("23:59:59", "2026-03-16"), stamped("ai", "booking")], // yesterday's
    ["inbound", "customer", at("00:00:00", "2026-03-18"), stamped("ai", "booking")], // tomorrow's first instant is out
  ]);
  await calls(busy, [
    { started_at: at("09:00:00"), duration_ms: 60000, analysis: { topic: "booking" }, cost: { combined_cost: 245 } },
    { started_at: at("09:10:00"), duration_ms: 30000, analysis: { topic: "pricing" }, cost: { combined_cost: 105.5 } },
    {
      started_at: at("09:20:00"),
      status: "error",
      duration_ms: 0,
      analysis: { topic: "pricing" },
      cost: { combined_cost: 10 },
    }, // never connected: no topic, but it cost
    {
      started_at: at("09:30:00"),
      direction: "outbound",
      analysis: { topic: "location" },
      cost: { combined_cost: 20 },
    }, // went out: no topic
    {
      started_at: at("09:40:00"),
      duration_ms: 1000,
      analysis: { topic: "banana" },
      cost: { combined_cost: "12" },
    }, // neither
    { started_at: at("09:50:00"), duration_ms: 1000, cost: { combined_cost: -5 } },
    { started_at: at("09:51:00"), duration_ms: 1000, cost: [1, 2] },
    { started_at: at("09:52:00"), duration_ms: 1000, cost: { combined_cost: 99999999 } },
    {
      started_at: at("00:00:00", "2026-03-18"),
      duration_ms: 1000,
      analysis: { topic: "booking" },
      cost: { combined_cost: 500 },
    }, // another day
  ]);
  await ledger(busy, [
    {
      purpose: "receptionist",
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_tokens: 300,
      cache_write_tokens: 50,
      usd: 0.0123,
      created_at: at("10:01:00"),
    },
    { purpose: "receptionist", input_tokens: 500, output_tokens: 100, usd: 0.005, created_at: at("10:06:00") },
    { purpose: "ask", input_tokens: 2000, output_tokens: 300, usd: 0.02, created_at: at("10:07:00") },
    { purpose: "lead_judge", input_tokens: 300, output_tokens: 100, usd: null, created_at: at("10:08:00") }, // no price: tokens, no dollars
    {
      purpose: "lead_judge",
      input_tokens: 9999,
      output_tokens: 0,
      usd: 0.5,
      shadow: true,
      port: "typesafe",
      question: "independent",
      created_at: at("10:09:00"),
    }, // a second opinion
    { purpose: "ask", input_tokens: 7777, output_tokens: 0, usd: 7, created_at: at("23:59:59", "2026-03-16") }, // another day
  ]);
  // The same calls as the events the first statement counts tokens from: the ledger's total must win, not add.
  ok(
    await db.from("events").insert([
      {
        tenant_id: busy,
        kind: "usage.llm_tokens",
        category: "usage",
        data: { held: null, escalate: false, input_tokens: 100, output_tokens: 20 },
        created_at: at("10:01:00"),
      },
    ]),
    "events",
  );

  // junk: a message and nothing the roll can read from it; and a workspace whose only news is the events' tokens.
  await messages(await thread(await workspace("junk")), [
    ["inbound", "customer", at("12:00:00"), stamped("banana", "banana")],
  ]);
  const old = await workspace("events");
  await messages(await thread(old), [["inbound", "customer", at("12:00:00")]]);
  ok(
    await db.from("events").insert([
      {
        tenant_id: old,
        kind: "usage.llm_tokens",
        category: "usage",
        data: { held: null, escalate: false, input_tokens: 100, output_tokens: 20 },
        created_at: at("12:01:00"),
      },
      {
        tenant_id: old,
        kind: "usage.ask_tokens",
        category: "usage",
        data: { input_tokens: 25, output_tokens: 5 },
        created_at: at("12:02:00"),
      },
    ]),
    "events",
  );
  // mixed: a stamped message and the events' tokens and no ledger row: the lenses are kept, and tokens stay the events' count.
  const mixed = await workspace("mixed");
  await messages(await thread(mixed), [["inbound", "customer", at("13:00:00"), stamped("ai", "booking")]]);
  ok(
    await db.from("events").insert([
      {
        tenant_id: mixed,
        kind: "usage.llm_tokens",
        category: "usage",
        data: { held: null, escalate: false, input_tokens: 100, output_tokens: 20 },
        created_at: at("13:01:00"),
      },
    ]),
    "events",
  );
  // voice: a day of calls and nothing else; quiet: a call of another day only.
  await calls(await workspace("voice"), [
    { started_at: at("15:00:00"), duration_ms: 90000, cost: { combined_cost: 150 } },
  ]);
  await calls(await workspace("quiet"), [
    { started_at: at("15:00:00", "2026-03-19"), duration_ms: 90000, cost: { combined_cost: 150 } },
  ]);
  // words: a message for each of the nine topics, each ended one of the four ways, and a connected call for each topic,
  // to hold the SQL's copies of the closed sets (the messages' list, the calls' list) to contracts' sets.
  const words = await thread(await workspace("words"));
  await messages(
    words,
    BRAIN_INTENTS.map((intent, i) => [
      "inbound",
      "customer",
      at(`16:0${i}:00`),
      stamped(HANDLED_OUTCOMES[i % HANDLED_OUTCOMES.length], intent),
    ]),
  );
  await calls(
    words.tenant_id,
    BRAIN_INTENTS.map((topic, i) => ({ started_at: at(`17:0${i}:00`), duration_ms: 1000, analysis: { topic } })),
  );
  // edges: the ledger and the calls at the day's first and last instants (in), and at the next day's first instant and the
  // last of the day before (out).
  const edges = await workspace("edges");
  await ledger(edges, [
    { purpose: "receptionist", input_tokens: 10, output_tokens: 0, usd: 0.001, created_at: at("00:00:00") },
    { purpose: "receptionist", input_tokens: 20, output_tokens: 0, usd: 0.002, created_at: at("23:59:59") },
    { purpose: "receptionist", input_tokens: 1000, output_tokens: 0, usd: 1, created_at: at("00:00:00", "2026-03-18") },
    { purpose: "receptionist", input_tokens: 2000, output_tokens: 0, usd: 2, created_at: at("23:59:59", "2026-03-16") },
  ]);
  await calls(edges, [
    { started_at: at("00:00:00"), duration_ms: 1000, cost: { combined_cost: 100 } },
    { started_at: at("23:59:59"), duration_ms: 1000, cost: { combined_cost: 200 } },
    { started_at: at("00:00:00", "2026-03-18"), duration_ms: 1000, cost: { combined_cost: 400 } },
    { started_at: at("23:59:59", "2026-03-16"), duration_ms: 1000, cost: { combined_cost: 800 } },
  ]);
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

test(
  "the day's lenses columns: how each customer message ended, what they asked about, the model's tokens and dollars by purpose, what the calls cost",
  { skip },
  async () => {
    const wrote = await roll();
    const all = ok(await db.from("platform_metrics").select("tenant_id").eq("day", D), "rows");
    assert.equal(wrote, all.length, "it answers how many rows it wrote, a row the second statement made included");

    const busy = await rolled(W.busy);
    assert.deepEqual(
      busy.messages_in,
      { whatsapp: 9 },
      "00277's counts are what they were: customers' messages, history and the edges out",
    );
    assert.deepEqual(
      busy.handled,
      { ai: 3, held: 2, handoff: 1, blocked: 1 },
      "stamped customer messages only; the unstamped, the backfilled, the receptionist's own and the unknown word are not counted",
    );
    assert.deepEqual(
      busy.topics,
      { booking: 2, pricing: 3, complaint: 1, hours: 1, location: 1 },
      "texts and connected inbound calls, in one list",
    );
    assert.deepEqual(
      busy.ai_tokens,
      { receptionist: 2150, ask: 2300, lead_judge: 400 },
      "all four kinds of tokens by purpose; a shadow and another day are not",
    );
    assert.deepEqual(
      busy.ai_usd,
      { receptionist: 0.0173, ask: 0.02 },
      "dollars by purpose; a purpose with no priced call has none",
    );
    assert.equal(
      Number(busy.voice_usd),
      3.805,
      "245 + 105.5 + 10 + 20 cents: a call that never connected or went out still cost; a cost that is no number, below nothing, an array or absurd is not one",
    );
    assert.equal(
      busy.tokens,
      4850,
      "the ledger's total for the day, not the ledger's plus the event's 120 for the same calls",
    );
  },
);

test(
  "a day nothing said anything about is absent, not zero: unknown words, a workspace with only the events' tokens, and a day of calls and nothing else",
  { skip },
  async () => {
    const junk = await rolled(W.junk);
    assert.deepEqual(
      [junk.handled, junk.topics, junk.ai_tokens, junk.ai_usd, junk.voice_usd],
      [null, null, null, null, null],
    );
    assert.deepEqual(junk.messages_in, { whatsapp: 1 });

    const events = await rolled(W.events);
    assert.equal(events.tokens, 150, "no ledger rows: the events' count, as 00277 gave it");
    assert.deepEqual([events.ai_tokens, events.ai_usd, events.voice_usd], [null, null, null]);

    const mixed = await rolled(W.mixed);
    assert.deepEqual([mixed.handled, mixed.topics, mixed.ai_tokens], [{ ai: 1 }, { booking: 1 }, null]);
    assert.equal(
      mixed.tokens,
      120,
      "the lenses were kept and no ledger row holds the day: tokens stay the events' count",
    );

    const voice = await rolled(W.voice);
    assert.equal(Number(voice.voice_usd), 1.5);
    assert.deepEqual(
      [voice.asks, voice.messages_in, voice.handled, voice.ai_tokens],
      [0, {}, null, null],
      "its row is the second statement's, and what it did not count is an honest zero or empty",
    );

    assert.equal(await rolled(W.quiet), undefined, "a call of another day makes no row for this one");
  },
);

test(
  "the SQL's copies of the closed sets are contracts' sets: every handled word and every topic lands, once",
  { skip },
  async () => {
    const words = await rolled(W.words);
    const expectHandled = {};
    BRAIN_INTENTS.forEach((_, i) => {
      const h = HANDLED_OUTCOMES[i % HANDLED_OUTCOMES.length];
      expectHandled[h] = (expectHandled[h] ?? 0) + 1;
    });
    assert.deepEqual(words.handled, expectHandled);
    assert.deepEqual(
      words.topics,
      Object.fromEntries(BRAIN_INTENTS.map((w) => [w, 2])),
      "each word once from a text and once from a connected call",
    );
  },
);

test(
  "the day is UTC's for the ledger and the calls: its first and last instants are in, the next day's first instant and the day before's last are out",
  { skip },
  async () => {
    const edges = await rolled(W.edges);
    assert.deepEqual(edges.ai_tokens, { receptionist: 30 });
    assert.deepEqual(edges.ai_usd, { receptionist: 0.003 });
    assert.equal(edges.tokens, 30);
    assert.equal(Number(edges.voice_usd), 3);
  },
);

test(
  "rolled again, the day's lenses columns are replaced and never doubled; tokens come from the ledger once",
  { skip },
  async () => {
    const first = await rolled(W.busy);
    await ledger(W.busy, [
      { purpose: "ask", input_tokens: 100, output_tokens: 0, usd: 0.001, created_at: at("11:30:00") },
    ]);
    await roll();
    const second = await rolled(W.busy);
    assert.deepEqual(second.handled, first.handled);
    assert.deepEqual(second.topics, first.topics);
    assert.deepEqual(
      second.ai_tokens,
      { receptionist: 2150, ask: 2400, lead_judge: 400 },
      "the new call is in, the old ones are not counted twice",
    );
    assert.equal(second.tokens, 4950);
    assert.equal(Number(second.voice_usd), 3.805);
    assert.ok(Date.parse(second.rolled_at) >= Date.parse(first.rolled_at));
    assert.equal(
      ok(await db.from("platform_metrics").select("tenant_id").eq("tenant_id", W.busy).eq("day", D), "rows").length,
      1,
    );
  },
);

test("call_cost_usd: Retell's cents as dollars, and nothing else is a cost", { skip }, async () => {
  const usd = async (p_cost) => ok(await db.rpc("call_cost_usd", { p_cost }), JSON.stringify(p_cost));
  assert.equal(Number(await usd({ combined_cost: 245 })), 2.45);
  assert.equal(Number(await usd({ combined_cost: 0 })), 0, "a call that cost nothing is a real zero");
  assert.equal(Number(await usd({ combined_cost: 12.5, product_costs: [] })), 0.125);
  for (const bad of [
    null,
    {},
    [],
    "245",
    245,
    { combined_cost: "245" },
    { combined_cost: null },
    { combined_cost: -1 },
    { combined_cost: 10000000 },
    [{ combined_cost: 1 }],
  ])
    assert.equal(await usd(bad), null, `${JSON.stringify(bad)} is no cost`);
});

test(
  "a failure in the new columns costs those columns alone: the day's existing counts are written and the roll answers",
  { skip },
  async () => {
    const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${W.busy}') then raise exception 'not_this_database'; end if;
    set local lock_timeout = '3s';
    perform public.platform_metrics_roll('${D}');
    seen := seen || jsonb_build_object('control', (select handled is not null from public.platform_metrics where tenant_id = '${W.busy}' and day = '${D}'));
    delete from public.platform_metrics where day = '${D}';
    -- A table that refuses every one of the new columns' values, for the rows that exist already and the ones still to come.
    alter table public.platform_metrics add constraint __lenses_refused
      check (handled is null and topics is null and ai_tokens is null and ai_usd is null and voice_usd is null) not valid;
    seen := seen || jsonb_build_object('wrote', public.platform_metrics_roll('${D}'));
    seen := seen || jsonb_build_object(
      'asks', (select asks from public.platform_metrics where tenant_id = '${W.busy}' and day = '${D}'),
      'in', (select messages_in from public.platform_metrics where tenant_id = '${W.busy}' and day = '${D}'),
      'handled', (select handled from public.platform_metrics where tenant_id = '${W.busy}' and day = '${D}'),
      'rows', (select count(*) from public.platform_metrics where day = '${D}'));
  `);
    assert.equal(seen.control, true, "the control: without the refusing constraint the columns are kept");
    assert.deepEqual(seen.in, { whatsapp: 9 }, "00277's counts were written");
    assert.ok(seen.asks > 0);
    assert.equal(seen.handled, null, "and the lenses' columns were not");
    assert.ok(seen.wrote >= 4 && seen.rows === seen.wrote, "the roll answered, with the rows that did land");
  },
);
