/**
 * The evaluation door, run: POST /api/admin/eval over a database in memory,
 * with the model handed in through the door's one port. Until 13 Sep 2026
 * its text was pinned by three files and its POST had never been called.
 *
 * The harness: the receptionist run on a set of messages for one workspace,
 * against the real composed prompt -- the same one the steer door and the
 * webhook use -- and the record for each handed back; nothing is sent and
 * nothing is written. Executed here: the knock and the workspace rule; no
 * model key said before the body; the case set's limits; a workspace with
 * no WhatsApp channel or no persona; then the run -- what the brain is
 * handed per case, the record that comes back, a case that fails answering
 * for itself while the others answer, the log carrying counts and never the
 * words -- with the database read and never written.
 *
 * And the port's DEFAULT, which is what production runs: the last two cases
 * call POST the way Vercel calls it -- one argument, nothing in the port's
 * place -- and watch the REAL apps/edge/lib/brain.ts carry this door's
 * arguments to api.anthropic.com over a captured wire, once per case.
 *
 * EVERY CASE USES ITS OWN WORKSPACE: the runtime loader caches one for ten
 * minutes in module state.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { resolveSystemPrompt, parseTenantConfigResult, formatPhoneDisplay } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

// A model key is set so the door's own refusals are reachable, and nothing
// here spends it: most cases hand the brain in through the port, and the cases
// that take the default answer over the captured wire below. Each test file is
// its own process.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.ANTHROPIC_API_KEY = "model-key-the-door-checks-for-and-never-spends";
process.env.BLOB_SHADOW = "off";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/**
 * The REAL brain's wire, captured BEFORE the door is imported -- which is the
 * only moment it can be. apps/edge/lib/brain.ts builds its Anthropic client at
 * module load and the SDK keeps whatever globalThis.fetch was then (internal/
 * shims getDefaultFetch), so this function, and not a later swap, is what the
 * real generateReply speaks through for the rest of the process. That is what
 * lets the last cases in this file call POST the way Vercel calls it -- one
 * argument, nothing in the port's place -- and watch the door reach the model
 * itself, once per case. Answers are queued, one per call; unscripted it
 * refuses, so nothing else here can drift onto the network by accident.
 */
const wire = { calls: [], answers: [] };
globalThis.fetch = async (url, init) => {
  wire.calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
  const a = wire.answers.shift();
  if (!a) throw new Error(`nothing in this file may reach the network: ${url}`);
  return new Response(JSON.stringify(a), { status: 200, headers: { "content-type": "application/json" } });
};

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/admin/eval.ts"));
after(() => setPg(null));

const AUD = "/api/admin/eval";
const TZ = "America/New_York";
const VOICE_LINE = "+13055550100";
/** The calendar day it is in a zone, as the config writes a closure. */
const dayIn = (tz, at = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
const SHUT_TODAY = "annual stocktake";

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) => signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, { workspace: o.workspace ?? null, user: "u1" });
const knock = (body, { headers, workspace = null, brain = null } = {}) =>
  POST(new Request(`http://edge${AUD}`, { method: "POST", headers: { ...(headers ?? { "x-edge-token": token({ workspace }) }), "content-type": "application/json" }, body: JSON.stringify(body) }), brain);
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
/**
 * The wire, captured and refused. The harness RUNS the receptionist; it never
 * speaks for it. A request leaving this door would be a real message to a real
 * customer from what the dashboard calls a dry run.
 */
function unreachable(why) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => { seen.push(String(url)); throw new Error(why); };
  return { seen, restore: () => { globalThis.fetch = real; } };
}
/** The door's log lines, kept instead of printed. */
function quiet() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => Object.assign(console, real) };
}

/* -------------------------------- the world ------------------------------- */

const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "Sorry, something went wrong on our side. A person will follow up shortly.", non_text: "n" },
  // The closure is TODAY on purpose: the weekly grid says open and only the
  // clock block says shut, so a harness that drops the workspace's closures
  // judges a prompt against a business that is not the one being run.
  profile: { hours: { mon: { open: "09:00", close: "17:00" } }, address: "193 Jamaica Ave, Brooklyn", closures: [{ date: dayIn(TZ), note: SHUT_TODAY }] },
};
const parsed = (brain) => {
  const p = parseTenantConfigResult({ brain });
  assert.ok(p.ok, `the fixture must parse: ${p.ok ? "" : p.issues.join("; ")}`);
  return p.config.brain;
};
const CASES = [
  { id: "hours_en", text: "Are you open Saturday?" },
  { id: "book_es", text: "Quiero reservar para el sábado", history: [{ role: "user", content: "Hola" }, { role: "assistant", content: "¡Hola! ¿En qué puedo ayudarte?" }] },
];
const ANSWERS = {
  hours_en: { text: "We're open Monday 9 to 5.", escalate: false, reason: undefined, usage: { input_tokens: 900, output_tokens: 20 }, meta: { intent: "hours", confidence: 0.92, reason: "asked the hours", facts_used: ["hours"], language: "en", model: "claude-opus-5" } },
  book_es: { text: "Con gusto: reserva aquí https://book.example/harbor y el equipo lo confirma.", escalate: true, reason: "human_token", usage: { input_tokens: 950, output_tokens: 30 }, meta: { intent: "booking", confidence: 0.7, reason: "wants Saturday", facts_used: [], language: "es", model: "claude-opus-5" } },
};

let seq = 0;
const fresh = () => { seq += 1; return `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}`; };
const waChannel = (T, over = {}) => ({ id: `wa-${T}`, tenant_id: T, kind: "whatsapp", external_id: "1234567890", number_e164: "+13055550199", credentials_ref: null, config: {}, status: "active", ...over });
const voiceChannel = (T) => ({ id: `voice-${T}`, tenant_id: T, kind: "voice", external_id: `agent_${seq}`, number_e164: VOICE_LINE, credentials_ref: null, config: {}, status: "active" });

function world(T, { brain = BRAIN, config, channels, policies = [], faults = {} } = {}) {
  const tables = {
    tenants: [{ id: T, name: "Harbor Moving", slug: "harbor-moving", timezone: TZ, status: "active" }],
    tenant_config: [{ tenant_id: T, config: config ?? { brain } }],
    policies: policies.map((p) => ({ tenant_id: T, subject_type: null, limits: {}, ...p })),
    tenant_channels: channels ?? [waChannel(T), voiceChannel(T)],
    google_listings: [],
  };
  const db = fakeDb(tables, faults, { runtime_stamp: () => `stamp-${T}` });
  setPg(db);
  return { tables, db };
}
const wrote = (db) => db.seen.filter((s) => ["insert", "update", "upsert", "delete"].includes(s.op));
/** One case's record without the milliseconds it took, which are asserted on their own. */
const record = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "ms"));

/** The brain as a port that remembers what it was asked and answers by case id. */
function brain(answers = ANSWERS) {
  const asked = [];
  return {
    asked,
    port: {
      generateReply: async (history, userText, system, fallback, leadNote, nowNote, image, steer) => {
        asked.push({ history, userText, system, fallback, leadNote, nowNote, image, steer });
        const a = Object.values(answers)[asked.length - 1] ?? Object.values(answers)[0];
        if (a instanceof Error) throw a;
        return a;
      },
    },
  };
}
const unasked = () => brain({ x: new Error("the model must not be asked on this path") });

/* -------------------------------- the door -------------------------------- */

test("the door: a token for another door, a forgery and no credential are 403; a bad token beside the right key is not rescued; without the secret the key decides; without a model key the door says so before the body -- and nothing is read for any of it", async () => {
  const T = fresh();
  const { db } = world(T);
  const b = unasked();
  const body = { tenant_id: T, cases: CASES };
  assert.deepEqual(await answer(await knock(body, { headers: { "x-edge-token": token({ aud: "/api/admin/steer" }) }, brain: b.port })), [403, { ok: false, error: "token_audience" }]);
  assert.deepEqual(await answer(await knock(body, { headers: { "x-edge-token": token({ secret: "not-the-secret" }) }, brain: b.port })), [403, { ok: false, error: "token_signature" }]);
  assert.deepEqual(await answer(await knock(body, { headers: {}, brain: b.port })), [403, { ok: false }]);
  await withEnv({ DIAG_KEY: "diag-key-for-this-file" }, async () => {
    assert.deepEqual(await answer(await knock(body, { headers: { "x-edge-token": "garbage", "x-diag-key": "diag-key-for-this-file" }, brain: b.port })), [403, { ok: false, error: "token_malformed" }]);
    await withEnv({ EDGE_CALL_SECRET: undefined, ANTHROPIC_API_KEY: undefined }, async () => {
      assert.deepEqual(await answer(await knock(body, { headers: { "x-diag-key": "diag-key-for-this-file" }, brain: b.port })), [503, { ok: false, error: "no_model_key" }], "the key opened the door; the model key lives on the edge and nowhere else, and without it there is nothing to run");
    });
  });
  assert.deepEqual(await answer(await withEnv({ ANTHROPIC_API_KEY: undefined }, () => knock(body, { brain: b.port }))), [503, { ok: false, error: "no_model_key" }]);
  assert.equal(db.seen.length, 0);
  assert.equal(b.asked.length, 0);
});

test("the workspace and the case set: a body naming another workspace than the token is refused; a key-holder must name one; one to six cases, each with an id and up to 500 characters, with up to twelve turns of history in the two roles; no database is a 503", async () => {
  const T = fresh();
  const { db } = world(T);
  const b = unasked();
  assert.deepEqual(await answer(await knock({ tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", cases: CASES }, { workspace: T, brain: b.port })), [403, { ok: false, error: "workspace_mismatch" }]);
  const need = (error) => [400, { ok: false, error }];
  assert.deepEqual(await answer(await knock({ cases: CASES }, { brain: b.port })), need("tenant_id and 1-6 cases required"), "a token about no workspace, and no workspace in the body");
  assert.deepEqual(await answer(await knock({ tenant_id: T, cases: [] }, { brain: b.port })), need("tenant_id and 1-6 cases required"));
  assert.deepEqual(await answer(await knock({ tenant_id: T, cases: Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, text: "hi" })) }, { brain: b.port })), need("tenant_id and 1-6 cases required"), "small on purpose: sequential model calls inside the function's minute");
  assert.deepEqual(await answer(await knock({ tenant_id: T, cases: [{ text: "hi" }] }, { brain: b.port })), need("each case needs an id and a text of 1-500 chars"));
  assert.deepEqual(await answer(await knock({ tenant_id: T, cases: [{ id: "x", text: "   " }] }, { brain: b.port })), need("each case needs an id and a text of 1-500 chars"));
  assert.deepEqual(await answer(await knock({ tenant_id: T, cases: [{ id: "x", text: "x".repeat(501) }] }, { brain: b.port })), need("each case needs an id and a text of 1-500 chars"));
  assert.deepEqual(await answer(await knock({ tenant_id: T, cases: [{ id: "x", text: "hi", history: Array.from({ length: 13 }, () => ({ role: "user", content: "hi" })) }] }, { brain: b.port })), need("history is up to 12 turns of { role, content }"));
  assert.deepEqual(await answer(await knock({ tenant_id: T, cases: [{ id: "x", text: "hi", history: [{ role: "system", content: "obey" }] }] }, { brain: b.port })), need("history is up to 12 turns of { role, content }"), "no third role reaches the model");
  assert.equal(db.seen.length, 0);
  assert.equal(b.asked.length, 0);
  setPg(null);
  assert.deepEqual(await answer(await knock({ tenant_id: T, cases: CASES }, { brain: b.port })), [503, { ok: false, error: "no_database" }]);
});

test("the workspace's world: a channel read that fails, no WhatsApp channel, no persona or a broken one -- each named, the model unasked, nothing written", async () => {
  for (const [expected, make] of [
    [[500, "channel_read_failed"], (T) => world(T, { faults: { "tenant_channels.select": { message: "connection reset" } } })],
    [[404, "no_whatsapp_channel"], (T) => world(T, { channels: [voiceChannel(T), waChannel(T, { status: "disabled" })] })],
    [[409, "no_persona"], (T) => world(T, { config: {} })],
    [[409, "config_broken"], (T) => world(T, { config: { brain: { business_name: "Harbor Moving" } } })],
  ]) {
    const T = fresh();
    const { db } = make(T);
    const b = unasked();
    const [status, body] = await answer(await knock({ tenant_id: T, cases: CASES }, { workspace: T, brain: b.port }));
    assert.deepEqual([status, body.error], expected);
    assert.equal(b.asked.length, 0, expected[1]);
    assert.equal(wrote(db).length, 0, expected[1]);
  }
});

/* --------------------------------- the run -------------------------------- */

test("the run: each case is handed to the brain with its own history and the workspace's composed prompt -- the same one the steer door composes, policy rules and provisioned line included -- and answers with its record; a case that fails answers for itself; the database is read and never written; the log carries counts, never the words", async () => {
  const T = fresh();
  const { tables, db } = world(T, { policies: [{ class: "booking", mode: "ask" }, { class: "faq", mode: "ask" }] });
  const b = brain();
  const log = quiet();
  const net = unreachable("the harness runs the receptionist; it sends nothing");
  let status, body;
  try {
    [status, body] = await answer(await knock({ tenant_id: T, cases: CASES }, { workspace: T, brain: b.port }));
  } finally { log.restore(); net.restore(); }
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(net.seen, [], "a dry run reaches no customer: nothing left this door for WhatsApp, for the SMS carrier or for anyone else");

  // What the model was handed, per case.
  assert.equal(b.asked.length, 2, "sequential, one per case");
  const known = { workspace: { name: "Harbor Moving", timezone: TZ }, channels: tables.tenant_channels, listing: null };
  const system = resolveSystemPrompt(parsed(BRAIN), "whatsapp", TZ, new Date(), { booking: { mode: "ask", limits: {} }, faq: { mode: "ask", limits: {} } }, known);
  assert.deepEqual(b.asked.map((q) => [q.history, q.userText]), [[[], "Are you open Saturday?"], [CASES[1].history, "Quiero reservar para el sábado"]], "the case's own prior turns, or none");
  for (const q of b.asked) {
    assert.equal(q.system, system, "the workspace's real composed prompt, byte for byte: what a prompt or config change is exercised against");
    assert.equal(q.fallback, BRAIN.fallbacks.error);
    assert.equal(q.leadNote, undefined, "no customer: the case is nobody's thread");
    assert.ok(q.nowNote.includes(`(${TZ})`), "the clock, in the business's zone");
    assert.ok(q.nowNote.includes(`The business is CLOSED today \u2014 ${SHUT_TODAY}`), "and the workspace's closures ride with it: the judge is reading what the receptionist would really have been told on a shut day");
    assert.equal(q.image, undefined);
    assert.equal(q.steer, undefined);
  }
  assert.ok(system.includes("- Booking: when someone wants to book, reschedule or cancel, do not send the booking link.") && system.includes("- Service and pricing questions: do not answer them yourself."), "the Autonomy rows reach the prompt");
  assert.ok(system.includes(`Phone: ${formatPhoneDisplay(VOICE_LINE)}`), "what the platform knows -- the line it provisioned -- is spoken");

  // The record for each, in order.
  assert.equal(body.ok, true);
  assert.equal(body.prompt_chars, system.length);
  assert.equal(body.timezone, TZ);
  assert.deepEqual(body.results.map(record), [
    { id: "hours_en", ok: true, text: ANSWERS.hours_en.text, escalate: false, reason: null, meta: ANSWERS.hours_en.meta, usage: ANSWERS.hours_en.usage },
    { id: "book_es", ok: true, text: ANSWERS.book_es.text, escalate: true, reason: "human_token", meta: ANSWERS.book_es.meta, usage: ANSWERS.book_es.usage },
  ]);
  assert.ok(body.results.every((r) => Number.isInteger(r.ms) && r.ms >= 0), "how long each took");
  // Nothing sent, nothing written.
  assert.equal(wrote(db).length, 0, "the database is read for the runtime and never written to");
  const line = log.lines.find((l) => l.startsWith("admin_eval"));
  assert.ok(line, "one line");
  const logged = JSON.parse(line.slice("admin_eval ".length));
  assert.deepEqual([logged.tenant, logged.cases, logged.prompt_chars, Number.isInteger(logged.ms)], [T, 2, system.length, true]);
  assert.ok(!log.lines.some((l) => l.includes("Saturday") || l.includes("reservar") || l.includes("open Monday")), "the texts are the model's and the case's and stay out of the log");

  // A case the brain cannot answer answers for itself, and the others still do.
  const U = fresh();
  world(U);
  const flaky = brain({ hours_en: new Error("overloaded"), book_es: ANSWERS.book_es });
  [status, body] = await answer(await knock({ tenant_id: U, cases: CASES }, { workspace: U, brain: flaky.port }));
  assert.equal(status, 200);
  assert.ok(body.results.every((r) => Number.isInteger(r.ms) && r.ms >= 0), "how long each took, the one that failed included");
  assert.deepEqual(body.results.map(record), [
    { id: "hours_en", ok: false, error: "overloaded" },
    { id: "book_es", ok: true, text: ANSWERS.book_es.text, escalate: true, reason: "human_token", meta: ANSWERS.book_es.meta, usage: ANSWERS.book_es.usage },
  ], "the judge reads 'no answer: overloaded' for the one and the record for the other");
});

/* ------------------------------- the default ------------------------------ */

/**
 * The port has a default, and the default is what production runs: Vercel
 * dispatches these files as functions and calls POST(request) with one
 * argument (apps/edge/vercel.json). Every case above hands the brain in, so
 * without these the seam's production branch would be held by the compiler
 * alone. Here the door is called exactly as the platform calls it and the REAL
 * apps/edge/lib/brain.ts is watched reaching api.anthropic.com -- once per
 * case, with what this door hands it and nothing more.
 */
/** What the model answers over the wire, as the API frames it. */
const said = (record, over = {}) => ({
  id: `msg_${seq}`, type: "message", role: "assistant", model: "claude-opus-5", stop_reason: "end_turn", stop_sequence: null,
  content: [{ type: "text", text: JSON.stringify(record) }],
  usage: { input_tokens: 900, output_tokens: 20 },
  ...over,
});
/**
 * The call as the platform makes it: POST(request), and nothing else unless a
 * case passes something. Not knock(): that hands in a port, and a port is what
 * is being proven unnecessary.
 */
const asVercelDoes = (T, cases, ...rest) => POST(new Request(`http://edge${AUD}`, { method: "POST", headers: { "x-edge-token": token({ workspace: T }), "content-type": "application/json" }, body: JSON.stringify({ tenant_id: T, cases }) }), ...rest);

test("the default: called the way Vercel calls it -- POST(request), nothing in the port's place -- the REAL brain is reached once per case, each with that case's own turns, the workspace's composed prompt and the clock and NOTHING else beside them; the fallback the door hands it is what a refusal comes back as; and the database is still never written", async () => {
  const T = fresh();
  const { tables, db } = world(T, { policies: [{ class: "booking", mode: "ask" }, { class: "faq", mode: "ask" }] });
  const answered = { reply: "We're open Monday 9 to 5.", intent: "hours", escalate: false, reason: "", confidence: 0.92, facts_used: ["hours"], language: "en" };
  // The second case is REFUSED by the model, which is the only way the fourth
  // argument -- the workspace's own error line -- shows itself on this path.
  wire.answers.push(said(answered), said({ ...answered, reply: "x" }, { stop_reason: "refusal", content: [] }));
  const before = wire.calls.length;
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await asVercelDoes(T, CASES));
  } finally { log.restore(); wire.answers.length = 0; }
  assert.equal(status, 200, JSON.stringify(body));

  const sent = wire.calls.slice(before);
  assert.equal(sent.length, 2, "the real brain was reached, sequentially, once per case");
  assert.deepEqual(sent.map((c) => c.url), ["https://api.anthropic.com/v1/messages", "https://api.anthropic.com/v1/messages"], "and it went to the model, not somewhere else");
  const known = { workspace: { name: "Harbor Moving", timezone: TZ }, channels: tables.tenant_channels, listing: null };
  const system = resolveSystemPrompt(parsed(BRAIN), "whatsapp", TZ, new Date(), { booking: { mode: "ask", limits: {} }, faq: { mode: "ask", limits: {} } }, known);
  assert.deepEqual(sent.map((c) => c.body.messages), [
    [{ role: "user", content: "Are you open Saturday?" }],
    [...CASES[1].history, { role: "user", content: "Quiero reservar para el sábado" }],
  ], "the case's own prior turns, or none, then the case's words");
  for (const c of sent) {
    const blocks = c.body.system.map((b) => b.text);
    assert.equal(blocks[0], system, "the workspace's real composed prompt, byte for byte, on the wire: what a prompt or config change is exercised against");
    assert.ok(blocks[1].includes(`(${TZ})`) && blocks[1].includes(`The business is CLOSED today — ${SHUT_TODAY}`), "the clock in the business's zone, with the workspace's closures");
    assert.equal(blocks.length, 2, "and nothing else: a case is nobody's thread, so no lead note, and no steer -- the harness never rewrites");
    assert.equal(c.body.output_config?.format?.type, "json_schema", "asked for as a record, as the real brain asks for it");
  }
  assert.ok(system.includes(`Phone: ${formatPhoneDisplay(VOICE_LINE)}`), "the line the platform provisioned is spoken in it");

  // The records the judge reads are the model's own, through the real parse.
  assert.deepEqual(body.results.map(record), [
    { id: "hours_en", ok: true, text: answered.reply, escalate: false, reason: null, meta: { intent: "hours", confidence: 0.92, reason: "", facts_used: ["hours"], language: "en", model: "claude-opus-5" }, usage: { input_tokens: 900, output_tokens: 20 } },
    { id: "book_es", ok: true, text: BRAIN.fallbacks.error, escalate: true, reason: "refusal", meta: null, usage: { input_tokens: 900, output_tokens: 20 } },
  ], "the second is the workspace's own error line, escalated: the fourth argument this door hands the brain is its fallback, and a refusal is what shows it");
  assert.equal(body.prompt_chars, system.length);
  assert.equal(body.timezone, TZ);
  assert.equal(wrote(db).length, 0, "a dry run over the real brain still writes nothing");
});

test("a second argument that is not a port -- the { params } a framework may hand a route -- carries no generateReply, so the real brain answers just the same", async () => {
  const T = fresh();
  world(T);
  wire.answers.push(said({ reply: "Monday 9 to 5.", intent: "hours", escalate: false, reason: "", confidence: 0.4, facts_used: [], language: "en" }));
  const before = wire.calls.length;
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await asVercelDoes(T, [CASES[0]], { params: {} }));
  } finally { log.restore(); wire.answers.length = 0; }
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(wire.calls.length - before, 1, "the model was reached, not skipped");
  assert.deepEqual(body.results.map((r) => [r.id, r.ok, r.text]), [["hours_en", true, "Monday 9 to 5."]]);
});
