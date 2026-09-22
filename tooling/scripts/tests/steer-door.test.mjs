/**
 * The steer door, run: POST /api/admin/steer over a database in memory, with
 * the model handed in through the door's one port. Until 13 Sep 2026 its
 * text was pinned by twenty-odd assertions in three files and its POST had
 * never been called.
 *
 * The text whisper: a held draft is rewritten to one line from the owner by
 * the same brain, with the same memory and the same composed prompt, and
 * queued again to wait like the first one did. Executed here: the knock; the
 * door's own refusals (no model key, not a held draft, no phone, no channel,
 * no persona, nothing to answer, another workspace's draft); what the brain
 * is handed (the thread without the held draft, the customer's last words,
 * the workspace's prompt with its policy rules and the line the platform
 * provisioned, who the customer is, the owner's words framed as a steer); and
 * the order that keeps two drafts from racing to the customer -- the new one
 * queued FIRST on the draft's own wire, the old one retired by a count, and
 * the rewrite taken back when the count is zero (the tick sent the old draft
 * while the model was thinking) or when the retire failed. A rewrite that
 * quotes a price leaves the original where it was.
 *
 * And the port's DEFAULT, which is what production runs: the last three cases
 * call POST the way Vercel calls it -- one argument, nothing in the port's
 * place -- and watch the REAL apps/edge/lib/brain.ts carry this door's
 * arguments to api.anthropic.com over a captured wire.
 *
 * EVERY CASE USES ITS OWN WORKSPACE. The runtime loader caches a workspace for
 * ten minutes in module state; two cases sharing one would have the second
 * read the first's answer instead of the database.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import {
  resolveSystemPrompt,
  frameSteer,
  whisperText,
  parseTenantConfigResult,
  formatPhoneDisplay,
  REPLY_DELAY_DEFAULT_MS,
} from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

// The door reads these at call time; each test file is its own process. A
// model key is set so the door's own refusals are reachable, and a case that
// wants the no-model path unsets it for its own call. Nothing here spends it:
// most cases hand the brain in through the port, and the cases that take the
// default answer over the captured wire below.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.ANTHROPIC_API_KEY = "model-key-the-door-checks-for-and-never-spends";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/**
 * The REAL brain's wire, captured BEFORE the door is imported -- which is the
 * only moment it can be. apps/edge/lib/brain.ts builds its Anthropic client
 * at module load and the SDK keeps whatever globalThis.fetch was then
 * (internal/shims getDefaultFetch), so this function, and not a later swap,
 * is what the real generateReply speaks through for the rest of the process.
 * That is what lets the last test in this file call POST the way Vercel calls
 * it -- one argument, nothing in the port's place -- and watch the door reach
 * the model itself. Unscripted it refuses, so nothing else here can drift
 * onto the network by accident.
 */
const wire = { calls: [], answer: null };
globalThis.fetch = async (url, init) => {
  wire.calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
  if (!wire.answer) throw new Error(`nothing in this file may reach the network: ${url}`);
  return new Response(JSON.stringify(wire.answer), { status: 200, headers: { "content-type": "application/json" } });
};

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST } = await import(at("apps/edge/api/admin/steer.ts"));
after(() => setPg(null));

const AUD = "/api/admin/steer";
const TZ = "America/New_York";
const CUSTOMER = "+16465550123";
const VOICE_LINE = "+13055550100";
const OWNER_SAYS = "mention Saturday is full";
const ago = (ms) => new Date(Date.now() - ms).toISOString();
/** The calendar day it is in a zone, as the config writes a closure. */
const dayIn = (tz, at = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
const SHUT_TODAY = "annual stocktake";

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, { workspace: o.workspace ?? null, user: "u1" });
/** A steer as the dashboard sends it: a token minted for this door and the draft's workspace, the draft's id and the owner's words. */
const knock = (body, { headers, workspace = null, brain = null } = {}) =>
  POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...(headers ?? { "x-edge-token": token({ workspace }) }), "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    brain,
  );
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
/**
 * The wire, captured and refused. This door sends NOTHING: the rewrite is
 * queued to wait its window and the tick is what puts it on the customer's
 * screen. A request leaving here would be the second answer this whole door
 * is built to prevent.
 */
function unreachable(why) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    throw new Error(why);
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
/** The door's log lines, kept instead of printed, so what they carry can be read. */
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
  fallbacks: {
    greeting: "g",
    error: "Sorry, something went wrong on our side. A person will call you back from {phone}.",
    non_text: "n",
  },
};
/**
 * The same brain with a profile, so the prompt is COMPOSED -- and states the
 * line the platform provisioned. The closure is TODAY on purpose: the weekly
 * grid says open and only the clock block says shut, so the rewrite either
 * carries the workspace's closures or answers "yes, come at 4" on a day the
 * business is closed.
 */
const PROFILED = {
  ...BRAIN,
  profile: {
    hours: { mon: { open: "09:00", close: "17:00" } },
    address: "193 Jamaica Ave, Brooklyn",
    closures: [{ date: dayIn(TZ), note: SHUT_TODAY }],
  },
};
const parsed = (brain) => {
  const p = parseTenantConfigResult({ brain });
  assert.ok(p.ok, `the fixture must parse: ${p.ok ? "" : p.issues.join("; ")}`);
  return p.config.brain;
};

/** What the brain says, unless a case scripts otherwise. */
const ANSWER = {
  text: "Saturday is fully booked, but Friday afternoon or Monday morning are open. Pick a time here: https://book.example/harbor",
  escalate: false,
  usage: { input_tokens: 900, output_tokens: 60 },
  meta: {
    intent: "booking",
    confidence: 0.86,
    reason: "asked for a Saturday slot",
    facts_used: ["hours"],
    language: "en",
    model: "claude-opus-5",
  },
};

/** A workspace, a draft, a conversation, a customer and a job nobody else in this file uses. */
let seq = 0;
function fresh() {
  seq += 1;
  const n = String(seq).padStart(12, "0");
  return {
    T: `aaaaaaaa-aaaa-4aaa-8aaa-${n}`,
    M: `dddddddd-dddd-4ddd-8ddd-${n}`,
    C: `cccccccc-cccc-4ccc-8ccc-${n}`,
    P: `bbbbbbbb-bbbb-4bbb-8bbb-${n}`,
    J: `eeeeeeee-eeee-4eee-8eee-${n}`,
  };
}
const waChannel = (w, over = {}) => ({
  id: `wa-${w.T}`,
  tenant_id: w.T,
  kind: "whatsapp",
  external_id: "1234567890",
  number_e164: "+13055550199",
  credentials_ref: null,
  config: {},
  status: "active",
  ...over,
});
const smsChannel = (w, over = {}) => ({
  id: `sms-${w.T}`,
  tenant_id: w.T,
  kind: "sms",
  external_id: "+13055550101",
  number_e164: "+13055550101",
  credentials_ref: null,
  config: {},
  status: "active",
  ...over,
});
const voiceChannel = (w, over = {}) => ({
  id: `voice-${w.T}`,
  tenant_id: w.T,
  kind: "voice",
  external_id: `agent_${seq}`,
  number_e164: VOICE_LINE,
  credentials_ref: null,
  config: {},
  status: "active",
  ...over,
});
const msg = (w, over) => ({
  tenant_id: w.T,
  conversation_id: w.C,
  contact_id: w.P,
  type: "text",
  channel: "whatsapp",
  channel_ts: null,
  meta: {},
  ...over,
});
/** The thread the draft answers: a question, the answer that went out, and the customer's latest words. */
const thread = (w) => [
  msg(w, {
    id: `m1-${seq}`,
    body: "Are you open Saturday?",
    sender: "customer",
    direction: "inbound",
    status: "received",
    created_at: ago(7200_000),
  }),
  msg(w, {
    id: `m2-${seq}`,
    body: "Yes, 9 to 5.",
    sender: "ai",
    direction: "outbound",
    status: "sent",
    created_at: ago(7000_000),
  }),
  msg(w, {
    id: `m3-${seq}`,
    body: "Can I come at 4 on Saturday?",
    sender: "customer",
    direction: "inbound",
    status: "received",
    created_at: ago(120_000),
  }),
];
/** The held draft: the receptionist's reply, waiting its veto window. */
const heldDraft = (w, over = {}) =>
  msg(w, {
    id: w.M,
    body: "Sure, Saturday at 4 works. See you then!",
    sender: "ai",
    direction: "outbound",
    status: "queued",
    created_at: ago(60_000),
    meta: { source: "veto_window", delay_ms: 45_000 },
    ...over,
  });
/** The job that would send it. */
const job = (w) => ({
  id: w.J,
  tenant_id: w.T,
  kind: "outbound_send",
  state: "scheduled",
  due_at: new Date(Date.now() + 40_000).toISOString(),
  payload: {
    message_id: w.M,
    conversation_id: w.C,
    to_phone: CUSTOMER,
    body: "Sure, Saturday at 4 works. See you then!",
  },
});

function world(w, { brain = BRAIN, config, channels, draft = {}, messages, policies = [], contact, faults = {} } = {}) {
  const tables = {
    tenants: [{ id: w.T, name: "Harbor Moving", slug: "harbor-moving", timezone: TZ, status: "active" }],
    tenant_config: [{ tenant_id: w.T, config: config ?? { brain } }],
    policies: policies.map((p) => ({ tenant_id: w.T, subject_type: null, limits: {}, ...p })),
    tenant_channels: channels ?? [waChannel(w)],
    google_listings: [],
    contacts: [
      contact ?? {
        id: w.P,
        tenant_id: w.T,
        phone_e164: CUSTOMER,
        display_name: "Rosa",
        wa_profile_name: null,
        last_seen_at: ago(3600_000),
        consent: "opted_in",
        dnc: false,
        notes: null,
      },
    ],
    conversations: [
      { id: w.C, tenant_id: w.T, contact_id: w.P, contacts: { phone_e164: CUSTOMER }, last_message_at: ago(120_000) },
    ],
    messages: messages ?? [...thread(w), heldDraft(w, draft)],
    jobs: [job(w)],
    events: [],
  };
  const db = fakeDb(tables, faults, { runtime_stamp: () => `stamp-${w.T}` });
  setPg(db);
  return { tables, db };
}
const writes = (db, table) =>
  db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));

/** The brain as a port that remembers what it was asked; `script` answers each call, or throws, or does what the tick would have. */
function brain(script = ANSWER) {
  const asked = [];
  return {
    asked,
    port: {
      generateReply: async (history, userText, system, fallback, leadNote, nowNote, image, steer) => {
        asked.push({ history, userText, system, fallback, leadNote, nowNote, image, steer });
        const a = typeof script === "function" ? await script(asked.length) : script;
        if (a instanceof Error) throw a;
        return a;
      },
    },
  };
}
/** A brain nothing may reach. */
const unasked = () =>
  brain(() => {
    throw new Error("the model must not be asked on this path");
  });

/* -------------------------------- the door -------------------------------- */

test("the door: a token for another door, a forgery and no credential are 403 and nothing is read; without the secret the key decides; without a model key the door says so before the body", async () => {
  const w = fresh();
  const { db } = world(w);
  const b = unasked();
  const body = { message_id: w.M, text: OWNER_SAYS };
  assert.deepEqual(
    await answer(
      await knock(body, { headers: { "x-edge-token": token({ aud: "/api/admin/whisper" }) }, brain: b.port }),
    ),
    [403, { ok: false, error: "token_audience" }],
  );
  assert.deepEqual(
    await answer(
      await knock(body, { headers: { "x-edge-token": token({ secret: "not-the-secret" }) }, brain: b.port }),
    ),
    [403, { ok: false, error: "token_signature" }],
  );
  assert.deepEqual(await answer(await knock(body, { headers: {}, brain: b.port })), [403, { ok: false }]);
  await withEnv({ DIAG_KEY: "diag-key-for-this-file" }, async () => {
    assert.deepEqual(
      await answer(
        await knock(body, {
          headers: { "x-edge-token": "garbage", "x-diag-key": "diag-key-for-this-file" },
          brain: b.port,
        }),
      ),
      [403, { ok: false, error: "token_malformed" }],
      "no falling back from a bad token to the key",
    );
    await withEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
      assert.deepEqual(
        await answer(await knock(body, { headers: { "x-diag-key": "diag-key-for-this-file" }, brain: b.port })),
        [503, { ok: false, error: "no_model_key" }],
        "the key opened the door; without a model there is nothing to rewrite with",
      );
    });
  });
  assert.deepEqual(
    await answer(await withEnv({ ANTHROPIC_API_KEY: undefined }, () => knock(body, { brain: b.port }))),
    [503, { ok: false, error: "no_model_key" }],
  );
  assert.equal(db.seen.length, 0, "nothing was read for any of it");
  assert.equal(b.asked.length, 0);
});

test("the body: a draft id that is not a uuid, no words, or more than 500 of them are refused before anything is read; no database is a 503", async () => {
  const w = fresh();
  const { db } = world(w);
  for (const body of [
    {},
    { message_id: "not-an-id", text: OWNER_SAYS },
    { message_id: w.M },
    { message_id: w.M, text: "   " },
    { message_id: w.M, text: "x".repeat(501) },
  ]) {
    assert.deepEqual(
      await answer(await knock(body, { brain: unasked().port })),
      [400, { ok: false, error: "message_id + text (1-500 chars) required" }],
      JSON.stringify(body),
    );
  }
  assert.equal(db.seen.length, 0);
  setPg(null);
  assert.deepEqual(await answer(await knock({ message_id: w.M, text: OWNER_SAYS }, { brain: unasked().port })), [
    503,
    { ok: false, error: "no_database" },
  ]);
});

/* ------------------------------- the refusals ----------------------------- */

test("the draft: a read that fails is a 500, an unknown id a 404, another workspace's draft a 403 -- and none of it reaches the model or writes a row", async () => {
  const w = fresh();
  const broken = world(w, { faults: { "messages.select": { message: "connection reset" } } });
  assert.deepEqual(await answer(await knock({ message_id: w.M, text: OWNER_SAYS }, { brain: unasked().port })), [
    500,
    { ok: false, error: "message_read_failed" },
  ]);
  assert.equal(writes(broken.db, "messages").length, 0);

  const v = fresh();
  const { tables, db } = world(v);
  assert.deepEqual(
    await answer(
      await knock({ message_id: "dddddddd-dddd-4ddd-8ddd-ffffffffffff", text: OWNER_SAYS }, { brain: unasked().port }),
    ),
    [404, { ok: false, error: "not_found" }],
  );
  // A token minted for another workspace opens only that workspace's drafts.
  const other = "aaaaaaaa-aaaa-4aaa-8aaa-ffffffffffff";
  assert.deepEqual(
    await answer(await knock({ message_id: v.M, text: OWNER_SAYS }, { workspace: other, brain: unasked().port })),
    [403, { ok: false, error: "workspace_mismatch" }],
  );
  assert.equal(tables.messages.find((m) => m.id === v.M).status, "queued", "the draft still waits");
  assert.equal(writes(db, "messages").length + writes(db, "jobs").length, 0);
});

test("not a held draft: the customer's own message, a reply already sent, a draft already canceled -- each 409, the model unasked", async () => {
  for (const [what, over] of [
    ["the customer's own words", { sender: "customer", direction: "inbound", status: "received" }],
    ["a reply that already went out", { status: "sent" }],
    ["a draft somebody already stopped", { status: "canceled" }],
  ]) {
    const w = fresh();
    const { db } = world(w, { draft: over });
    const b = unasked();
    assert.deepEqual(
      await answer(await knock({ message_id: w.M, text: OWNER_SAYS }, { workspace: w.T, brain: b.port })),
      [409, { ok: false, error: "not_a_held_draft" }],
      what,
    );
    assert.equal(b.asked.length, 0, what);
    assert.equal(writes(db, "messages").length, 0, what);
  }
});

test("the world around the draft: no phone on the conversation, no active channel of the draft's kind, no persona (or a broken one), nothing from the customer to answer -- each its own 409, nothing written", async () => {
  const cases = [
    [
      "no_phone",
      (w) =>
        world(w, {
          messages: [...thread(w), heldDraft(w)],
          contact: { id: w.P, tenant_id: w.T, phone_e164: CUSTOMER },
        }),
      (tables) => {
        tables.conversations[0].contacts = null;
      },
    ],
    ["no_channel", (w) => world(w, { channels: [voiceChannel(w), waChannel(w, { status: "disabled" })] })],
    ["no_persona", (w) => world(w, { config: {} })],
    ["config_broken", (w) => world(w, { config: { brain: { business_name: "Harbor Moving" } } })],
    ["nothing_to_answer", (w) => world(w, { messages: [thread(w)[1], heldDraft(w)] })],
  ];
  for (const [error, make, then] of cases) {
    const w = fresh();
    const { tables, db } = make(w);
    then?.(tables);
    const b = unasked();
    assert.deepEqual(
      await answer(await knock({ message_id: w.M, text: OWNER_SAYS }, { workspace: w.T, brain: b.port })),
      [409, { ok: false, error }],
      error,
    );
    assert.equal(b.asked.length, 0, error);
    assert.equal(writes(db, "messages").length + writes(db, "jobs").length, 0, error);
    assert.equal(tables.messages.find((m) => m.id === w.M).status, "queued", `${error}: the draft still waits`);
  }
});

/* ------------------------------- the rewrite ------------------------------ */

test("the rewrite: the brain is handed the thread without the held draft, the customer's last words, the composed prompt with the policy rule and the provisioned line, who the customer is, and the owner's words framed as a steer; the new draft is queued FIRST on the draft's wire, then the old one is retired with its job", async () => {
  const w = fresh();
  const { tables, db } = world(w, {
    brain: PROFILED,
    channels: [waChannel(w), voiceChannel(w)],
    policies: [{ class: "booking", mode: "ask" }],
  });
  const b = brain();
  const log = quiet();
  const net = unreachable("the steer door sends nothing; the tick sends the draft when its window ends");
  let status, body;
  try {
    [status, body] = await answer(
      await knock({ message_id: w.M, text: `  ${OWNER_SAYS}  ` }, { workspace: w.T, brain: b.port }),
    );
  } finally {
    log.restore();
    net.restore();
  }
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(
    net.seen,
    [],
    "nothing left this door for the customer: the rewrite waits its veto window like the draft it replaces, and the tick is what sends it",
  );
  const draft = tables.messages.find((m) => m.meta?.source === "steered");
  assert.ok(draft, "a new draft row");
  assert.deepEqual(
    body,
    { ok: true, message_id: draft.id, text: ANSWER.text, meta: ANSWER.meta, escalate: false, delay_ms: 45_000 },
    "what the dashboard shows: the new draft, its words, its record, and how long it waits -- the old draft's own window",
  );

  // What the model was asked.
  assert.equal(b.asked.length, 1);
  const q = b.asked[0];
  assert.deepEqual(
    q.history,
    [
      { role: "user", content: "Are you open Saturday?" },
      { role: "assistant", content: "Yes, 9 to 5." },
      { role: "user", content: "Can I come at 4 on Saturday?" },
    ],
    "the same memory the reply was written from: the held draft is not in it, only what was delivered",
  );
  assert.equal(q.userText, "Can I come at 4 on Saturday?", "the customer's latest words are what the rewrite answers");
  const known = { workspace: { name: "Harbor Moving", timezone: TZ }, channels: tables.tenant_channels, listing: null };
  assert.equal(
    q.system,
    resolveSystemPrompt(parsed(PROFILED), "whatsapp", TZ, new Date(), { booking: { mode: "ask", limits: {} } }, known),
    "the workspace's composed prompt, byte for byte",
  );
  assert.ok(
    q.system.includes("- Booking: when someone wants to book, reschedule or cancel, do not send the booking link."),
    "the Autonomy rows reach the rewrite's prompt",
  );
  assert.ok(
    q.system.includes(`Phone: ${formatPhoneDisplay(VOICE_LINE)}`),
    "what the platform knows -- the line it provisioned -- is spoken, formatted for a person",
  );
  assert.equal(
    q.fallback,
    `Sorry, something went wrong on our side. A person will call you back from ${formatPhoneDisplay(VOICE_LINE)}.`,
    "the holding message, with the line as it is now (S5)",
  );
  assert.equal(q.leadNote, "Name on record: Rosa. Returning contact. Last in touch today.", "who the customer is");
  assert.ok(q.nowNote.includes(`(${TZ})`), "the clock, in the business's zone");
  assert.ok(
    q.nowNote.includes(`The business is CLOSED today \u2014 ${SHUT_TODAY}`),
    "and the workspace's closures ride with it: the last block the model reads is the one that settles a shut day against a weekly grid that says open",
  );
  assert.equal(q.image, undefined);
  assert.equal(q.steer, frameSteer(OWNER_SAYS), "the instruction rides as the brain's steer block, trimmed and framed");
  assert.equal(whisperText(q.steer), OWNER_SAYS);

  // The rows: the new draft, queued and waiting on the same wire; the old one retired, pointing at it.
  assert.equal(draft.status, "queued");
  assert.deepEqual(
    [
      draft.tenant_id,
      draft.conversation_id,
      draft.contact_id,
      draft.sender,
      draft.direction,
      draft.channel,
      draft.body,
    ],
    [w.T, w.C, w.P, "ai", "outbound", "whatsapp", ANSWER.text],
  );
  assert.deepEqual(
    draft.meta,
    { source: "steered", delay_ms: 45_000, ...ANSWER.meta, steer: OWNER_SAYS, steered_from: w.M, escalate: false },
    "the row remembers the answer, the instruction and what it replaced",
  );
  const old = tables.messages.find((m) => m.id === w.M);
  assert.deepEqual([old.status, old.error], ["canceled", { reason: "steered", replaced_by: draft.id }]);
  // The jobs: the old one withdrawn, a new one due when the window ends.
  assert.equal(tables.jobs.find((j) => j.id === w.J).state, "canceled", "the old draft's send is withdrawn");
  const send = tables.jobs.find((j) => j.payload?.message_id === draft.id);
  assert.ok(send, "the new draft has its send");
  assert.equal(send.kind, "outbound_send");
  assert.equal(send.tenant_id, w.T);
  assert.deepEqual(send.payload, { message_id: draft.id, conversation_id: w.C, to_phone: CUSTOMER, body: ANSWER.text });
  const due = Date.parse(send.due_at) - Date.now();
  assert.ok(due > 40_000 && due <= 45_000, `due in ${due}ms: the old draft's own delay`);
  // The order is the safety: queued first, retired second, so a failure between the two leaves ONE draft standing, never none.
  const inserted = db.seen.findIndex((s) => s.table === "messages" && s.op === "insert");
  const retired = db.seen.findIndex(
    (s) => s.table === "messages" && s.op === "update" && s.values.status === "canceled",
  );
  assert.ok(inserted >= 0 && retired > inserted, "the new draft is queued before the old one is retired");
  const retire = db.seen[retired];
  assert.ok(
    retire.filters.some(([op, col, val]) => op === "eq" && col === "status" && val === "queued"),
    "retired only while still queued: the count is the guard",
  );
  assert.equal(retire.columns, "id", "and the rows touched are read back, so zero can be told from one");
  // The log carries the shape of what happened, never the words.
  const line = log.lines.find((l) => l.includes('"event":"admin_steer"'));
  assert.ok(line, "one line");
  assert.ok(line.includes(`"chars":${OWNER_SAYS.length}`) && line.includes(draft.id), "the length and the ids");
  assert.ok(
    !line.includes(OWNER_SAYS) && !line.includes(ANSWER.text.slice(0, 20)),
    "the words are the owner's and the model's and stay out of the log",
  );
});

test("a draft with no window of its own waits the workspace's veto delay -- its reply limit, else the default", async () => {
  const w = fresh();
  const { tables } = world(w, {
    draft: { meta: { source: "low_confidence" } },
    policies: [{ class: "reply", mode: "veto", limits: { reply_delay_ms: 120_000 } }],
  });
  const [status, body] = await answer(
    await knock({ message_id: w.M, text: OWNER_SAYS }, { workspace: w.T, brain: brain().port }),
  );
  assert.equal(status, 200);
  assert.equal(body.delay_ms, 120_000, "the reply class's own limit");
  assert.equal(tables.messages.find((m) => m.id === body.message_id).meta.delay_ms, 120_000);

  const v = fresh();
  world(v, { draft: { meta: { source: "low_confidence" } } });
  const [, plain] = await answer(
    await knock({ message_id: v.M, text: OWNER_SAYS }, { workspace: v.T, brain: brain().port }),
  );
  assert.equal(plain.delay_ms, REPLY_DELAY_DEFAULT_MS, "no limit set: the default window");
});

test("a held reply to a text goes out again as a text: the tenant's channel is resolved by the draft's kind and the rewrite is queued on it, so a texting-only workspace can steer too", async () => {
  const w = fresh();
  const { tables, db } = world(w, { channels: [smsChannel(w)], draft: { channel: "sms" } });
  const [status, body] = await answer(
    await knock({ message_id: w.M, text: OWNER_SAYS }, { workspace: w.T, brain: brain().port }),
  );
  assert.equal(status, 200, JSON.stringify(body));
  const lookup = db.seen.find((s) => s.table === "tenant_channels" && s.filters.some(([, c]) => c === "kind"));
  assert.ok(
    lookup.filters.some(([, c, v]) => c === "kind" && v === "sms"),
    "resolved by the draft's kind, not always WhatsApp",
  );
  assert.equal(
    tables.messages.find((m) => m.id === body.message_id).channel,
    "sms",
    "REGRESSION: the row defaulted to WhatsApp, so a steered text was sent over WhatsApp to a number that had only ever texted",
  );
  assert.equal(tables.messages.find((m) => m.id === w.M).status, "canceled");
});

/* -------------------------------- the guards ------------------------------ */

test("a rewrite that would quote a price is refused, and the original draft and its send are left exactly where they were", async () => {
  const w = fresh();
  const { tables, db } = world(w);
  const log = quiet();
  let res;
  try {
    res = await knock(
      { message_id: w.M, text: "tell them it's 180 an hour" },
      {
        workspace: w.T,
        brain: brain({ ...ANSWER, text: "A two-bedroom move is $180 an hour, and Saturday is full." }).port,
      },
    );
  } finally {
    log.restore();
  }
  assert.deepEqual(await answer(res), [409, { ok: false, error: "policy_block_price" }]);
  assert.equal(writes(db, "messages").length + writes(db, "jobs").length, 0, "nothing written");
  assert.equal(tables.messages.find((m) => m.id === w.M).status, "queued");
  assert.equal(tables.jobs.find((j) => j.id === w.J).state, "scheduled");
  assert.ok(log.lines.some((l) => l.includes('"event":"steer_policy_block_price"')));
  assert.ok(!log.lines.some((l) => l.includes("$180")), "the words stay out of the log");
});

test("the race: the tick sent the old draft while the model was thinking, so the retire counts zero rows -- the rewrite is taken back with 409 already_sent and its send withdrawn, and the sent reply is not touched", async () => {
  const w = fresh();
  const { tables, db } = world(w);
  // The seconds the model takes are where the tick claims the old draft's job and sends it.
  const b = brain(() => {
    Object.assign(
      tables.messages.find((m) => m.id === w.M),
      { status: "sent", external_id: "wamid.sent-by-the-tick" },
    );
    tables.jobs.find((j) => j.id === w.J).state = "done";
    return ANSWER;
  });
  const net = unreachable("a lost race must not put the rewrite on the wire behind the reply the customer already has");
  let lost;
  try {
    lost = await answer(await knock({ message_id: w.M, text: OWNER_SAYS }, { workspace: w.T, brain: b.port }));
  } finally {
    net.restore();
  }
  assert.deepEqual(
    lost,
    [409, { ok: false, error: "already_sent" }],
    "REGRESSION: the update matched nothing, reported no error, and the rewrite went out behind the reply it was meant to replace -- two answers to one message",
  );
  assert.deepEqual(net.seen, [], "and the door itself sent neither of them");
  const sent = tables.messages.find((m) => m.id === w.M);
  assert.deepEqual([sent.status, sent.error], ["sent", undefined], "the reply the customer already has is left alone");
  const draft = tables.messages.find((m) => m.meta?.source === "steered");
  assert.ok(draft, "the rewrite was queued first --");
  assert.deepEqual([draft.status, draft.error], ["canceled", { reason: "steer_lost_race" }], "-- and taken back");
  const withdrawn = writes(db, "jobs").filter((s) => s.op === "update" && s.values.state === "canceled");
  assert.deepEqual(
    withdrawn.map((s) => s.filters.find(([, c]) => c === "payload->>message_id")[2]),
    [draft.id],
    "the rewrite's send is withdrawn; the old job, already claimed, is nobody's to cancel",
  );
  assert.equal(tables.jobs.find((j) => j.id === w.J).state, "done");
});

test("a brain that fails is a 502 with nothing written; a draft that cannot be queued leaves the old one standing; an old draft that cannot be retired takes the new one back", async () => {
  const w = fresh();
  const failed = world(w);
  assert.deepEqual(
    await answer(
      await knock(
        { message_id: w.M, text: OWNER_SAYS },
        { workspace: w.T, brain: brain(() => new Error("overloaded")).port },
      ),
    ),
    [502, { ok: false, error: "brain_failed" }],
  );
  assert.equal(writes(failed.db, "messages").length + writes(failed.db, "jobs").length, 0);
  assert.equal(failed.tables.messages.find((m) => m.id === w.M).status, "queued");

  const v = fresh();
  const unqueued = world(v, { faults: { "messages.insert": { message: "connection reset" } } });
  assert.deepEqual(
    await answer(await knock({ message_id: v.M, text: OWNER_SAYS }, { workspace: v.T, brain: brain().port })),
    [502, { ok: false, error: "could_not_queue" }],
  );
  assert.equal(
    unqueued.tables.messages.find((m) => m.id === v.M).status,
    "queued",
    "if the new one cannot be queued the old one still stands",
  );
  assert.equal(unqueued.tables.jobs.find((j) => j.id === v.J).state, "scheduled");

  // The retire fails ONCE -- the update of the old draft -- and the rollback that follows succeeds.
  const u = fresh();
  let updates = 0;
  const unretired = world(u, {
    faults: {
      get "messages.update"() {
        return ++updates === 1 ? { message: "connection reset" } : undefined;
      },
    },
  });
  assert.deepEqual(
    await answer(await knock({ message_id: u.M, text: OWNER_SAYS }, { workspace: u.T, brain: brain().port })),
    [500, { ok: false, error: "could_not_retire_old_draft" }],
  );
  assert.equal(unretired.tables.messages.find((m) => m.id === u.M).status, "queued", "the old draft still stands");
  const draft = unretired.tables.messages.find((m) => m.meta?.source === "steered");
  assert.deepEqual(
    [draft.status, draft.error],
    ["canceled", { reason: "steer_rolled_back" }],
    "if the old one cannot be retired the new one is taken back, so two drafts never race to the customer",
  );
  const withdrawn = writes(unretired.db, "jobs").filter((s) => s.op === "update" && s.values.state === "canceled");
  assert.deepEqual(
    withdrawn.map((s) => s.filters.find(([, c]) => c === "payload->>message_id")[2]),
    [draft.id],
  );
  assert.equal(
    unretired.tables.jobs.find((j) => j.id === u.J).state,
    "scheduled",
    "the old draft's send still stands with it",
  );
});

/* ------------------------------- the default ------------------------------ */

/**
 * The port has a default, and the default is what production runs: Vercel
 * dispatches these files as functions and calls POST(request) with one
 * argument (apps/edge/vercel.json). Every case above hands the brain in, so
 * without this one the seam's production branch would be held by the compiler
 * alone. Here the door is called exactly as the platform calls it and the
 * REAL apps/edge/lib/brain.ts is watched reaching api.anthropic.com with the
 * arguments this door composes.
 */
/** What the model answers over the wire, as the API frames it. */
const said = (record) => ({
  id: `msg_${seq}`,
  type: "message",
  role: "assistant",
  model: "claude-opus-5",
  stop_reason: "end_turn",
  stop_sequence: null,
  content: [{ type: "text", text: JSON.stringify(record) }],
  usage: { input_tokens: 900, output_tokens: 60 },
});
/**
 * The call as the platform makes it: POST(request), and nothing else unless a
 * case passes something. Not knock(): that hands in a port, and a port is what
 * is being proven unnecessary.
 */
const asVercelDoes = (w, ...rest) =>
  POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { "x-edge-token": token({ workspace: w.T }), "content-type": "application/json" },
      body: JSON.stringify({ message_id: w.M, text: OWNER_SAYS }),
    }),
    ...rest,
  );

test("the default: called the way Vercel calls it -- POST(request), nothing in the port's place -- the door reaches the REAL brain, which carries the composed prompt, the clock, who the customer is and the owner's steer to the model, and the record that comes back is the rewrite the dashboard sees", async () => {
  const w = fresh();
  const { tables } = world(w, {
    brain: PROFILED,
    channels: [waChannel(w), voiceChannel(w)],
    policies: [{ class: "booking", mode: "ask" }],
  });
  const reply = "Saturday is fully booked -- Friday afternoon or Monday morning are open.";
  wire.answer = said({
    reply,
    intent: "booking",
    escalate: false,
    reason: "",
    confidence: 0.86,
    facts_used: ["hours"],
    language: "en",
  });
  const before = wire.calls.length;
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await asVercelDoes(w));
  } finally {
    log.restore();
    wire.answer = null;
  }

  assert.equal(status, 200, JSON.stringify(body));
  const sent = wire.calls.slice(before);
  assert.equal(sent.length, 1, "the real brain was reached: one request left this process");
  assert.equal(sent[0].url, "https://api.anthropic.com/v1/messages", "and it went to the model, not somewhere else");
  const known = { workspace: { name: "Harbor Moving", timezone: TZ }, channels: tables.tenant_channels, listing: null };
  assert.deepEqual(
    sent[0].body.messages,
    [
      { role: "user", content: "Are you open Saturday?" },
      { role: "assistant", content: "Yes, 9 to 5." },
      { role: "user", content: "Can I come at 4 on Saturday?" },
    ],
    "the thread the draft answers, the held draft not in it",
  );
  const blocks = sent[0].body.system.map((b) => b.text);
  assert.equal(
    blocks[0],
    resolveSystemPrompt(parsed(PROFILED), "whatsapp", TZ, new Date(), { booking: { mode: "ask", limits: {} } }, known),
    "the workspace's composed prompt, byte for byte, on the wire",
  );
  assert.ok(
    blocks[1].includes(`(${TZ})`) && blocks[1].includes(`The business is CLOSED today \u2014 ${SHUT_TODAY}`),
    "the clock in the business's zone, with the workspace's closures",
  );
  assert.equal(
    blocks[2],
    "Who you are speaking with: Name on record: Rosa. Returning contact. Last in touch today.",
    "who the customer is",
  );
  assert.equal(blocks[3], frameSteer(OWNER_SAYS), "and the owner's instruction, framed as the steer block");
  assert.equal(blocks.length, 4, "and nothing else");
  assert.equal(
    sent[0].body.output_config?.format?.type,
    "json_schema",
    "asked for as a record, as the real brain asks for it",
  );

  // What the owner sees is the model's own answer, read back through the real
  // parse and queued to wait its window.
  const draft = tables.messages.find((m) => m.meta?.source === "steered");
  assert.ok(draft, "a new draft row");
  assert.deepEqual(body, {
    ok: true,
    message_id: draft.id,
    text: reply,
    meta: {
      intent: "booking",
      confidence: 0.86,
      reason: "",
      facts_used: ["hours"],
      language: "en",
      model: "claude-opus-5",
    },
    escalate: false,
    delay_ms: 45_000,
  });
  assert.deepEqual([draft.status, draft.body], ["queued", reply]);
  assert.equal(
    tables.messages.find((m) => m.id === w.M).status,
    "canceled",
    "the old draft retired behind it, as on every other path",
  );
});

test("a second argument that is not a port -- the { params } a framework may hand a route -- carries no generateReply, so the real brain answers just the same", async () => {
  const w = fresh();
  const { tables } = world(w);
  const reply = "Saturday is full, but Friday works.";
  wire.answer = said({
    reply,
    intent: "booking",
    escalate: false,
    reason: "",
    confidence: 0.5,
    facts_used: [],
    language: "en",
  });
  const before = wire.calls.length;
  const log = quiet();
  let status, body;
  try {
    [status, body] = await answer(await asVercelDoes(w, { params: {} }));
  } finally {
    log.restore();
    wire.answer = null;
  }
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(wire.calls.length - before, 1, "the model was reached, not skipped");
  assert.equal(body.text, reply);
  assert.equal(tables.messages.find((m) => m.meta?.source === "steered").body, reply);
});

test("the real brain refusing is the door's 502: no port, the wire unscripted, and what the dashboard gets is brain_failed with the original draft left where it was", async () => {
  const w = fresh();
  const { tables, db } = world(w);
  const before = wire.calls.length;
  const log = quiet();
  let res;
  try {
    res = await asVercelDoes(w);
  } finally {
    log.restore();
  }
  assert.ok(
    wire.calls.length > before,
    "the real brain tried the model and could not reach it -- the refusal is the wire's, not a stub's",
  );
  assert.deepEqual(await answer(res), [502, { ok: false, error: "brain_failed" }]);
  assert.ok(log.lines.some((l) => l.includes('"event":"steer_brain_failed"')));
  assert.equal(writes(db, "messages").length + writes(db, "jobs").length, 0, "nothing written");
  assert.equal(tables.messages.find((m) => m.id === w.M).status, "queued", "the draft still waits for its window");
});
