/**
 * The call-start door, run: a call announced the way Retell announces one, on
 * the URL the number was bought with, over a database in memory, with every
 * request that leaves the process captured. Until 14 Sep 2026 this handler's
 * binding was held by a read of its text and no test had ever called its POST;
 * what it decides was already run, in call-start.test.mjs.
 *
 * What runs here is the wire around that decision. The key on the URL is the
 * door, and a refused knock reads nothing and says nothing. Past it, the answer
 * is always a 200 carrying the variables the shell's prompt reads: the
 * workspace's own for an agent the database routes, the shell's own defaults
 * for anything else. Each way the answer falls short is said on a line of its
 * own at its own level -- a warning for an agent nobody routes or a workspace
 * with no persona, an error for a read that failed -- and every line carries
 * the caller's tail, never their number. Only an agent nobody routes pages the
 * platform, once a window, and that note is waited for: the answer is held
 * while the note is in flight, for three seconds and no longer.
 *
 * EVERY CASE OWNS ITS IDENTIFIERS. The channel resolver keeps a routing answer
 * in module state (five minutes; a miss for one), the runtime is cached per
 * workspace for ten, and the platform's note stays quiet for fifteen minutes
 * per agent: a case sharing any of them with another would read the first
 * one's answer and pass while proving nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSystemPrompt, describeNow, parseTenantConfigResult } from "@chanlytics/contracts";
import { FACTS_UNAVAILABLE, CALLER_UNKNOWN, GREETING_DEFAULT, greetingFor } from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";

const SECRET = "fn-secret-for-this-file";
const MAIL = { RESEND_API_KEY: "re_test_only", LEAD_TO: "ops@platform.test", LEAD_FROM: "Pager <pager@platform.test>" };

// Each test file is its own process, so this is the whole environment, set
// before the handler is imported below. The platform's mailbox is configured,
// so what is not mailed below is not mailed by decision, never for want of an
// address; and the only database is the one handed in.
process.env.RETELL_FN_SECRET = SECRET;
Object.assign(process.env, MAIL);
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const hook = await import(at("apps/edge/api/retell-inbound.ts"));

/* -------------------------------------------------------------- the wire */

const RESEND = "https://api.resend.com/";

/**
 * Every request that leaves this process, captured for the whole file: the
 * platform's note is the one thing this door sends, and a case that forgot to
 * listen must not reach a real provider. Answered as Resend answers a mail it
 * accepted, unless a case says how -- the note held until the case lets it
 * land, and the note that never comes back.
 */
const requests = [];
let reply = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const call = { url: String(url), init };
  requests.push(call);
  return reply ? reply(call) : new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
};
after(() => { globalThis.fetch = realFetch; setPg(null); });

/* ------------------------------------------------------------- the knock */

const DOOR = "https://chanlytics-messaging.vercel.app/api/retell-inbound";

/**
 * What Vercel hands a method export beside the request: its runtime calls
 * `webHandler(request, new FetchEvent(request))`, and Vercel's FetchEvent
 * carries `waitUntil` (lib/whatsapp/ports.ts says why that decided where the
 * seam went). Every knock carries one, so every case runs the door the way
 * production calls it.
 */
const event = () => ({ waitUntil: () => {} });
/** Retell's POST to the number's inbound webhook: the call as it arrives, the key on the URL. `key: null` sends none. */
const knock = (body, { key = SECRET } = {}) =>
  hook.POST(new Request(key === null ? DOOR : `${DOOR}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), event());
/** What Retell hears: the status, the type and the body. */
const heard = async (res) => [res.status, res.headers.get("content-type"), await res.json()];
/** The shell's own defaults, as the answer carries them: what the agent says with no webhook at all. */
const SHELL = { call_inbound: { dynamic_variables: { caller_context: CALLER_UNKNOWN, business_facts: FACTS_UNAVAILABLE, greeting: GREETING_DEFAULT } } };

/** Set (or with undefined, unset) variables for one call, and put them back. */
async function withEnv(patch, fn) {
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

/** What the door says on the console while `fn` runs: one structured line each, and anything else as it came. */
async function listening(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const stream of ["log", "warn", "error"]) {
    console[stream] = (...args) => {
      let line = null;
      try { line = JSON.parse(args[0]); } catch {}
      lines.push(line && typeof line === "object" && line.event ? { stream, ...line } : { stream, event: String(args[0]), args });
    };
  }
  try {
    return await fn({ lines, said: (name) => lines.filter((l) => l.event === name) });
  } finally {
    Object.assign(console, real);
  }
}

/* ------------------------------------------------------------- the world */

const TZ = "America/New_York";
/** The line the receptionist answers, and the one a transfer dials. */
const LINE = "+13055550100";
const HANDOFF = "+13055550199";
const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { hours: { mon: { open: "09:00", close: "17:00" } }, handoff_number: HANDOFF },
};
/** The brain as the runtime holds it: parsed, so the composer is handed the same object here as there. */
const PARSED = parseTenantConfigResult({ brain: BRAIN });
assert.ok(PARSED.ok, `the fixture must parse: ${PARSED.ok ? "" : PARSED.issues.join("; ")}`);

const pad = (n, width) => String(n).padStart(width, "0");
const ago = (ms) => new Date(Date.now() - ms).toISOString();
let seq = 0;

/**
 * One workspace answering on one voice agent, with one caller on file who
 * texted a couple of hours ago -- every identifier its own (see the header).
 * `channel` is the voice row's status, or null for no row at all.
 * `open(faults)` hands the door a database over these tables.
 */
function world({ config = { brain: BRAIN }, channel = "active" } = {}) {
  const i = ++seq;
  const T = `cccccccc-0000-4000-8000-${pad(i, 12)}`;
  const AGENT = `agent_inbound_${i}_${crypto.randomBytes(4).toString("hex")}`;
  const CALLER = `+1646555${pad(2000 + i, 4)}`;
  const CALL_ID = `call_inbound_${i}`;
  const P = `dddddddd-0000-4000-8000-${pad(i, 12)}`;
  const C = `eeeeeeee-0000-4000-8000-${pad(i, 12)}`;
  const tables = {
    tenant_channels: channel ? [{ id: `voice-${i}`, tenant_id: T, kind: "voice", external_id: AGENT, number_e164: LINE, credentials_ref: null, config: {}, status: channel }] : [],
    tenant_config: [{ tenant_id: T, config }],
    policies: [],
    tenants: [{ id: T, name: "Harbor", timezone: TZ, status: "active" }],
    google_listings: [],
    contacts: [{ id: P, tenant_id: T, phone_e164: CALLER, display_name: "Rosa", wa_profile_name: null, last_seen_at: ago(3_600_000), consent: "opted_in", dnc: false, notes: null, erased_at: null }],
    conversations: [{ id: C, tenant_id: T, contact_id: P }],
    messages: [
      { id: `m-${i}-1`, tenant_id: T, conversation_id: C, body: "Are you open Saturday?", sender: "customer", direction: "inbound", type: "text", status: "received", created_at: ago(7_200_000), channel_ts: ago(7_200_000), meta: null },
      { id: `m-${i}-2`, tenant_id: T, conversation_id: C, body: "Yes, 9 to 5.", sender: "ai", direction: "outbound", type: "text", status: "sent", created_at: ago(7_000_000), channel_ts: ago(7_000_000), meta: null },
    ],
  };
  const mark = requests.length;
  return {
    i, T, AGENT, CALLER, CALL_ID, tables,
    open: (faults = {}) => {
      // The hold a call takes on the caller's thread (00130) is the database's
      // to give: it is one locked statement, so a double answers here the way
      // Postgres answers, by what it returns rather than by what was read.
      const held = [];
      const db = fakeDb(tables, faults, {
        runtime_stamp: () => `stamp-${i}`,
        claim_conversation_control: (args) => { held.push(args); return "claimed"; },
      });
      db.held = held;
      setPg(db);
      return db;
    },
    /** The call as Retell announces it to the inbound webhook. */
    call: (over = {}) => ({ event: "call_inbound", call_inbound: { call_id: CALL_ID, agent_id: AGENT, from_number: CALLER, to_number: LINE, ...over } }),
    /** The context every line the door writes for this call carries: the caller's tail, the agent, the call. */
    tail: { from_tail: CALLER.slice(-4), agent_id: AGENT, call_id: CALL_ID },
    /** What Resend was asked to send since this world was made. */
    mail: () => requests.slice(mark).filter((c) => c.url.startsWith(RESEND)).map((c) => JSON.parse(c.init.body)),
    left: () => requests.slice(mark),
  };
}

/** The facts the text receptionist's composer writes for this workspace, on one clock: its prompt, then the day. No calendar, so no openings. */
function factsAt(w, now) {
  const brain = PARSED.config.brain;
  const known = { workspace: { name: "Harbor", timezone: TZ }, channels: w.tables.tenant_channels, listing: null };
  return `${resolveSystemPrompt(brain, "voice", TZ, now, {}, known)}\n\n${describeNow(TZ, now, brain.profile?.closures)}`;
}

/* -------------------------------------------------------------- the door */

test("the door: no key, an empty one and a wrong one are each a 401 that reads nothing, sends nothing and says nothing; the secret on the URL opens it", async () => {
  const w = world();
  const db = w.open();
  await listening(async (log) => {
    for (const [key, why] of [
      [null, "no key at all"],
      ["", "an empty key"],
      ["not-the-secret", "a wrong key"],
      [SECRET.toUpperCase(), "the secret in another case"],
    ]) {
      const res = await knock(w.call(), { key });
      assert.deepEqual([res.status, await res.json()], [401, { ok: false }], why);
    }
    // With no secret configured, nothing matches it: not a missing key, not an empty one.
    await withEnv({ RETELL_FN_SECRET: undefined }, async () => {
      for (const key of [null, "", "anything"]) {
        assert.equal((await knock(w.call(), { key })).status, 401, `no secret configured, key ${JSON.stringify(key)}`);
      }
    });
    // An empty secret is no secret: an empty key must not match it. The webhook
    // door already refuses this (retell-webhook.ts guards with !!urlKey).
    await withEnv({ RETELL_FN_SECRET: "" }, async () => {
      for (const key of [null, "", "anything"]) {
        assert.equal((await knock(w.call(), { key })).status, 401, `an empty secret configured, key ${JSON.stringify(key)}`);
      }
    });
    assert.equal(db.seen.length, 0, "not one row read before the key holds");
    assert.deepEqual(w.left(), [], "nothing left the process");
    assert.deepEqual(log.lines, [], "and nothing was said: a knock on a public URL is not a call");

    assert.equal((await knock(w.call())).status, 200, "the same call with the secret: the refusals above were the key's doing");
  });
});

/* ------------------------------------------------------------ the answer */

test("a routed call is answered 200 with the four variables the shell's prompt reads: the workspace's own facts on the clock of the call, the caller's own memory, the business greeted by name, the line a transfer dials -- said in one line with the caller's tail", async () => {
  const w = world();
  const db = w.open();
  await listening(async (log) => {
    const before = new Date();
    const res = await knock(w.call());
    const after = new Date();
    const [status, type, body] = await heard(res);
    assert.deepEqual([status, type], [200, "application/json"]);
    assert.deepEqual([Object.keys(body), Object.keys(body.call_inbound)], [["call_inbound"], ["dynamic_variables"]], "the shape Retell reads the variables from");
    const v = body.call_inbound.dynamic_variables;
    assert.deepEqual(Object.keys(v), ["caller_context", "business_facts", "handoff_number", "greeting"], "the four the shell's prompt reads, and nothing else");
    assert.ok([factsAt(w, before), factsAt(w, after)].includes(v.business_facts), `the composition the text receptionist is given, for this workspace, on the clock of the call:\n${v.business_facts}`);
    assert.equal(v.greeting, greetingFor("Harbor Moving"), "the business named at the door");
    assert.equal(v.handoff_number, HANDOFF);
    assert.deepEqual(v.caller_context.split("\n"), [
      "Name on record: Rosa. Returning contact. Last in touch today.",
      "Recent interactions on this number (calls and messages):",
      "Customer: Are you open Saturday?",
      "Business: Yes, 9 to 5.",
    ], "the caller's own memory, from the workspace the agent routes to");
    assert.deepEqual(
      db.seen.filter((q) => q.table === "tenant_channels" && q.filters.some(([, col]) => col === "external_id")).map((q) => q.filters),
      [[["eq", "kind", "voice"], ["eq", "external_id", w.AGENT]]],
      "routed by the agent the call arrived on",
    );

    assert.deepEqual(log.said("retell_inbound"), [{ stream: "log", level: "info", event: "retell_inbound", ...w.tail, facts: "composed", memory: "known", facts_chars: v.business_facts.length, hold: "claimed" }],
      "one line: the caller's tail, the agent, the call, and what the agent was handed");
    assert.deepEqual(log.lines.filter((l) => l.stream !== "log"), [], "nothing fell short, so nothing is said above info");
    assert.ok(!JSON.stringify(log.lines).includes(w.CALLER.slice(2)), "never the number");
    assert.deepEqual(w.left(), [], "and nobody is paged for a call that was answered");
  });
});

test("an agent nobody routes is answered 200 with the shell's own defaults, said as a warning with the tail, and the platform is told once a window -- naming the agent, never the caller -- without one row of any workspace read", async () => {
  const w = world({ channel: "disabled" });
  const db = w.open();
  await listening(async (log) => {
    assert.deepEqual(await heard(await knock(w.call())), [200, "application/json", SHELL], "what the shell says on its own: no facts, no memory, no line to dial, a greeting that names nobody");
    assert.deepEqual(db.seen.map((q) => q.table), ["tenant_channels"], "the routing answer, and nothing of anyone's facts or memory");
    assert.deepEqual(log.said("inbound_ctx_unrouted"), [{ stream: "warn", level: "warn", event: "inbound_ctx_unrouted", ...w.tail }]);
    assert.deepEqual(log.said("retell_inbound").map((l) => [l.facts, l.memory, l.facts_chars, l.hold]), [["unrouted", "none", FACTS_UNAVAILABLE.length, null]], "nothing routed, so there is no thread to hold");

    const mail = w.mail();
    assert.equal(mail.length, 1, "the platform is told");
    assert.deepEqual([mail[0].from, mail[0].to, mail[0].subject], [MAIL.LEAD_FROM, [MAIL.LEAD_TO], "Calls are arriving for a voice channel that is switched off"]);
    assert.ok(mail[0].text.startsWith(`1 call(s) just arrived for agent ${w.AGENT}, which the control plane will not route`), mail[0].text);
    assert.ok(!mail[0].text.includes(w.CALLER.slice(2)) && !mail[0].text.includes("Rosa"), "an agent and a count: nobody who called");

    // Another call inside the window: answered the same and said again, and the platform is not told again.
    assert.deepEqual(await heard(await knock(w.call())), [200, "application/json", SHELL]);
    assert.equal(log.said("inbound_ctx_unrouted").length, 2, "each call is said");
    assert.equal(w.mail().length, 1, "one note a window for an agent");
  });

  // A call that names no agent at all: nothing to route by, so nothing is read, and the note says so.
  const v = world();
  const vdb = v.open();
  await listening(async (log) => {
    assert.deepEqual(await heard(await knock(v.call({ agent_id: undefined }))), [200, "application/json", SHELL]);
    assert.equal(vdb.seen.length, 0, "no agent, no routing key: not one row read");
    const { agent_id: _none, ...tail } = v.tail;
    assert.deepEqual(log.said("inbound_ctx_unrouted"), [{ stream: "warn", level: "warn", event: "inbound_ctx_unrouted", ...tail }], "the line carries no agent it was not given");
    const mail = v.mail();
    assert.equal(mail.length, 1);
    assert.ok(mail[0].text.startsWith("1 call(s) just arrived for agent unknown,"), mail[0].text);
  });
});

test("routed with no persona: 200 with no facts and a greeting that names nobody, said as a warning; a config that does not parse, a channel that could not be read and no database are said as errors -- and nobody is paged for any of them", async () => {
  const a = world({ config: {} });
  a.open();
  await listening(async (log) => {
    const [status, , body] = await heard(await knock(a.call()));
    const v = body.call_inbound.dynamic_variables;
    assert.equal(status, 200);
    assert.deepEqual([v.business_facts, v.greeting, "handoff_number" in v], [FACTS_UNAVAILABLE, GREETING_DEFAULT, false], "told there are no facts rather than told nothing, and no line to dial");
    assert.ok(v.caller_context.startsWith("Name on record: Rosa."), "the caller is still this workspace's to recognise");
    assert.deepEqual(log.said("inbound_facts_missing"), [{ stream: "warn", level: "warn", event: "inbound_facts_missing", ...a.tail }]);
    assert.deepEqual(log.said("inbound_ctx_failed"), []);
  });
  assert.deepEqual(a.mail(), [], "a workspace with no persona is its owner's to fix: nobody is paged");

  for (const c of [
    { why: "a config that does not parse", config: { brain: { business_name: "" } }, facts: "missing", memory: "known", error: "the workspace's config does not parse" },
    { why: "a voice channel the database could not read", faults: { "tenant_channels.select": { message: "connection reset" } }, facts: "unreadable", memory: "none", error: "the voice channel could not be looked up" },
    { why: "no database at all", noDatabase: true, facts: "unreadable", memory: "none", error: "no database to route the call with" },
  ]) {
    const w = world(c.config ? { config: c.config } : {});
    if (c.noDatabase) setPg(null);
    else w.open(c.faults);
    await listening(async (log) => {
      const [status, , body] = await heard(await knock(w.call()));
      assert.deepEqual([status, body.call_inbound.dynamic_variables.business_facts], [200, FACTS_UNAVAILABLE], `${c.why}: still a 200, so Retell connects the call with what there is`);
      assert.deepEqual(log.said("inbound_ctx_failed"), [{ stream: "error", level: "error", event: "inbound_ctx_failed", ...w.tail, facts: c.facts, memory: c.memory, error: c.error }], `${c.why}: said as an error, with the tail`);
      assert.deepEqual([log.said("inbound_facts_missing"), log.said("inbound_ctx_unrouted")], [[], []], `${c.why}: the error is the line, never a warning beside it`);
    });
    assert.deepEqual(w.mail(), [], `${c.why}: nobody is paged for it`);
  }
});

/* ------------------------------------------------------ the bounded note */

test("the platform's note is waited for: the answer is held while the note is in flight and released when it lands -- and a note that never comes back holds it three seconds, and not a moment longer", async (t) => {
  // The clock is the test's: only setTimeout is taken, so the door's three
  // seconds pass when this case says so, and nothing else in the process moves.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const turn = () => new Promise((r) => setImmediate(r));
  const turns = async (n) => { for (let k = 0; k < n; k++) await turn(); };
  const until = async (done, what) => {
    for (let k = 0; k < 500; k++) { if (done()) return; await turn(); }
    assert.fail(`still waiting for ${what}`);
  };
  /** A knock whose answer is watched rather than awaited. */
  const watch = (answer) => {
    const call = { answered: false, res: null };
    answer.then((res) => { call.answered = true; call.res = res; });
    return call;
  };

  try {
    // Held by the note, and let go by it: the clock never moves.
    const a = world({ channel: null });
    a.open();
    let land = null;
    reply = () => new Promise((resolve) => { land = resolve; });
    await listening(async (log) => {
      const call = watch(knock(a.call()));
      await until(() => a.mail().length === 1, "the note to leave for Resend");
      await turns(50);
      assert.equal(call.answered, false, "held while the note is in flight: an invocation frozen on its answer abandons the send");
      land(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
      await until(() => call.answered, "the answer, once the note landed");
      assert.deepEqual(await heard(call.res), [200, "application/json", SHELL]);
      assert.equal(log.said("retell_inbound").length, 1);
    });

    // A note that never comes back: held for the whole budget, then answered without it.
    const b = world({ channel: null });
    b.open();
    reply = () => new Promise(() => {});
    await listening(async () => {
      const call = watch(knock(b.call()));
      await until(() => b.mail().length === 1, "the note to leave for Resend");
      await turns(50);
      assert.equal(call.answered, false, "waited for");
      t.mock.timers.tick(2_999);
      await turns(50);
      assert.equal(call.answered, false, "for the whole of the budget");
      t.mock.timers.tick(1);
      await until(() => call.answered, "the answer at three seconds");
      assert.deepEqual(await heard(call.res), [200, "application/json", SHELL], "and answered without it: Retell gives this webhook ten seconds, and the caller gets their call");
    });
  } finally {
    reply = null;
  }
});
