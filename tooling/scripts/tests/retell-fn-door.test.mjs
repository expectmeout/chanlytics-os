/**
 * The function bridge, run: send_booking_link called the way Retell calls a
 * custom function mid-call -- the call and the tool's arguments, with the
 * header configured on the tool -- over a database in memory, with Meta's
 * Graph API answered by a captured fetch. Until 14 Sep 2026 this handler's
 * text was pinned by five reads in five files and no test had ever called its
 * POST.
 *
 * The header is the door, and a refused knock reads nothing. Past it, every
 * answer is a 200 whose `result` the voice agent SPEAKS, so what is asserted is
 * the sentence a waiting caller hears. Before a workspace is known, a number
 * that is no phone is read back and a call that routes to nobody cannot send.
 * After: the person's own mode wins over the workspace's; the booking link is a
 * conversational message, proactive only toward somebody who is not on the
 * line; a paused workspace and a full day's cap are refused at the gate; and
 * every number a caller is told is the one the resolver publishes. What passes
 * leaves through deliver(): the approved template on the workspace's own
 * WhatsApp number and token, never the environment's, recorded in the caller's
 * thread -- and what the wire refuses or fails is said in the caller's terms.
 *
 * EVERY CASE OWNS ITS IDENTIFIERS. The channel resolver keeps a routing answer
 * in module state (five minutes; a miss for one) and the runtime is cached per
 * workspace for ten, re-checked against its stamp: a case sharing an agent or a
 * workspace with another would read the first one's answer and pass while
 * proving nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const SECRET = "fn-secret-for-this-file";
/** The environment's own WhatsApp pair: present, so a send that fell back to it would show. */
const ENV_WHATSAPP = { phoneId: "109990000000004", token: "the-environments-own-whatsapp-token" };

// Each test file is its own process, so this is the whole environment, set
// before the handler is imported below. This door pages nobody, so there is no
// mailbox; and the only database is the one handed in.
process.env.RETELL_FN_SECRET = SECRET;
process.env.BLOB_SHADOW = "off";
process.env.WHATSAPP_PHONE_ID = ENV_WHATSAPP.phoneId;
process.env.WHATSAPP_ACCESS_TOKEN = ENV_WHATSAPP.token;
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "LEAD_TO", "LEAD_FROM", "BLOB_READ_WRITE_TOKEN"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { refusalScript } = await import(at("apps/edge/lib/outbound-gate.ts"));
const hook = await import(at("apps/edge/api/retell-fn.ts"));

/* -------------------------------------------------------------- the wire */

const GRAPH = "https://graph.facebook.com/v25.0";
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Every request that leaves this process, captured for the whole file, because
 * a booking link that passes is a real send. Graph answers as it answers a
 * template it accepted, unless a case hands in its own answer; nothing else
 * should be asked at all.
 */
const requests = [];
let graphReply = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  requests.push({ url: u, init });
  if (graphReply) return graphReply(u, init);
  if (!u.startsWith(GRAPH)) return json(404, {});
  const to = JSON.parse(init.body).to;
  return json(200, { messaging_product: "whatsapp", contacts: [{ input: to, wa_id: to }], messages: [{ id: `wamid.fn.${requests.length}` }] });
};
after(() => { globalThis.fetch = realFetch; setPg(null); });

/** What left after `mark`: every request, and the Graph sends as Meta receives them. */
function leftSince(mark) {
  const calls = requests.slice(mark);
  return {
    calls,
    graph: calls.filter((c) => c.url.startsWith(GRAPH)).map((c) => ({ url: c.url, authorization: c.init.headers.Authorization, body: JSON.parse(c.init.body) })),
  };
}

/* ------------------------------------------------------------- the knock */

const DOOR = "https://chanlytics-messaging.vercel.app/api/retell-fn";

/**
 * What Vercel hands a method export beside the request: its runtime calls
 * `webHandler(request, new FetchEvent(request))`, and Vercel's FetchEvent
 * carries `waitUntil` (lib/whatsapp/ports.ts). Every knock carries one, so
 * every case runs the door the way production calls it.
 */
const event = () => ({ waitUntil: () => {} });
/** Retell's call to the custom function, with the header configured on the tool. `secret: null` sends none. */
const knock = (body, { secret = SECRET, url = DOOR } = {}) =>
  hook.POST(new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret === null ? {} : { "x-fn-secret": secret }) },
    body: JSON.stringify(body),
  }), event());

/** What the voice agent is handed to say: a 200 whose one field is the sentence. */
async function spoken(res) {
  assert.equal(res.status, 200, "every answer past the door is a 200: an error status leaves the agent silent with a caller on the line");
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ["result"]);
  return body.result;
}

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

/** What the handler says on the console while `fn` runs: an event name, then what it carries. */
async function listening(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const stream of ["log", "warn", "error"]) console[stream] = (...args) => { lines.push({ stream, event: String(args[0]), args }); };
  try {
    return await fn({
      lines,
      said: (name) => lines.filter((l) => l.event === name),
      /** The fields a `retell_fn_*` line carries, parsed. */
      fields: (name) => lines.filter((l) => l.event === name).map((l) => JSON.parse(l.args[1])),
    });
  } finally {
    Object.assign(console, real);
  }
}

/* ---------------------------------------------------- what the agent says */

const CANNOT_SEND = "I could not send the WhatsApp message just now. Let the caller know they can book online, and offer to have someone follow up.";
const READ_IT_BACK = "I could not determine a valid mobile number. Ask the caller to read it back, or offer to book them on the call.";
const CALLERS_OWN = "I can only send WhatsApp messages to the number the caller is phoning from. Ask them to call from that mobile, or offer to book them on the call.";
const SENT = "Booking link sent to their WhatsApp. Confirm they should see it momentarily.";
/** The line this workspace's receptionist answers on, as the resolver publishes it. */
const PUBLISHED = "+1 (305) 555-0100";

/* ------------------------------------------------------------- the world */

const TZ = "America/New_York";
const LINE = "+13055550100";
const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  // A transfer line of its own, and no published number typed: which number a caller is told is the resolver's to say.
  profile: { hours: { mon: { open: "09:00", close: "17:00" } }, handoff_number: "+13055550199" },
};
/** The template this workspace has approved for it, as Meta receives it for this business. */
const TEMPLATE = {
  name: "booking_link",
  language: { code: "en_US" },
  // "there" is the first name: a caller is usually somebody nobody has met yet,
  // and resolveParams writes that rather than leaving a gap.
  components: [{ type: "body", parameters: [{ type: "text", text: "there" }, { type: "text", text: "Harbor Moving" }, { type: "text", text: "book.example/harbor" }] }],
};
/** What the thread keeps: the template's own words, filled -- not a placeholder line about them. */
const NOTE = "Hi there, it's Harbor Moving. Here's the link to book your appointment: book.example/harbor — pick any time that suits you.";
/** The workspace's own approved booking template, as a sync leaves the row. */
const BOOKING_ROW = {
  channel: "whatsapp", name: "booking_link", language: "en_US", category: "utility", meta_status: "approved", title: null,
  body_preview: "Hi {{1}}, it's {{2}}. Here's the link to book your appointment: {{3}} — pick any time that suits you.",
  variables: [
    { position: 1, label: "First name", example: "Dani" },
    { position: 2, label: "Business name", example: "Luna Studio" },
    { position: 3, label: "Booking link", example: "https://booksy.com/luna-studio" },
  ],
};
const SOURCE = "voice_booking_link";

const pad = (n, width) => String(n).padStart(width, "0");
const iso = (ms) => new Date(ms).toISOString();
let seq = 0;

/**
 * One workspace answering calls on one voice agent, with a WhatsApp number
 * whose token is in the vault ("own"), one that carries none ("none"), or no
 * WhatsApp number (false) -- every identifier its own (see the header). `mode`
 * is the workspace's reply mode and `line` the voice row's number. `person()`
 * puts someone on file, `ask()` is the tool's call, and `open()` hands the door
 * a database over these tables.
 */
function world({ status = "active", mode = "auto", booking = null, brain = BRAIN, whatsapp = "own", line = LINE, templates } = {}) {
  const i = ++seq;
  const T = `bbbbbbbb-0000-4000-8000-${pad(i, 12)}`;
  const AGENT = `agent_fn_${i}_${crypto.randomBytes(4).toString("hex")}`;
  const PHONE_ID = String(106580000000000 + i);
  const TOKEN = `workspace-${i}-whatsapp-token`;
  const workspace = { id: T, name: "Harbor Moving", timezone: TZ, status };
  const tables = {
    tenants: [workspace],
    tenant_channels: [
      { id: `voice-${i}`, tenant_id: T, kind: "voice", external_id: AGENT, number_e164: line, status: "active", credentials_ref: null, config: {} },
      ...(whatsapp ? [{ id: `wa-${i}`, tenant_id: T, kind: "whatsapp", external_id: PHONE_ID, number_e164: `+1786555${pad(i, 4)}`, status: "active", credentials_ref: whatsapp === "own" ? `vault-ref-${i}` : null, config: {} }] : []),
    ],
    tenant_config: [{ tenant_id: T, config: brain ? { brain } : {} }],
    policies: [
      ...(mode ? [{ id: `pol-${i}`, tenant_id: T, class: "reply", mode, limits: {}, subject_type: null, subject_id: null }] : []),
      // The Autonomy pane's Booking row, when this workspace has set one.
      ...(booking ? [{ id: `pol-b-${i}`, tenant_id: T, class: "booking", mode: booking, limits: {}, subject_type: null, subject_id: null }] : []),
    ],
    // Which template this path sends is the workspace's own answer now, so a
    // world that has none is a workspace that has none.
    templates: (templates === undefined ? [BOOKING_ROW] : templates).map((t) => ({ id: `tpl-${i}-${t.name}`, tenant_id: T, ...t })),
    google_listings: [], contacts: [], conversations: [], messages: [], events: [],
  };
  const vault = whatsapp === "own" ? { [`wa-${i}`]: { access_token: TOKEN, phone_id: PHONE_ID } } : {};
  const mark = requests.length;
  let people = 0;
  let calls = 0;
  return {
    i, T, AGENT, PHONE_ID, TOKEN, workspace, tables,
    /** The database for the next ask. The stamp moves with the workspace row, as runtime_stamp's does; `rpcs` overrides for this ask. */
    open: (faults = {}, rpcs = {}) => {
      const db = fakeDb(tables, faults, {
        runtime_stamp: () => `stamp-${i}-${workspace.status}`,
        get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
        ...rpcs,
      });
      setPg(db);
      return db;
    },
    /** A number nobody else in this file uses, in E.164. */
    number: () => `+1646555${pad(i * 10 + ++people, 4)}`,
    /**
     * Someone on file: their contact, their thread and, when they have one,
     * their own receptionist mode. The wire reads the thread with its contact
     * and its workspace joined (deliver's one read); the double does not join,
     * so the thread hands both back as Postgres would, read from the rows
     * themselves at the moment of the read.
     */
    person: (phone, { consent = "opted_in", marketing = "unknown", dnc = false, mode: own = null } = {}) => {
      const contact = { id: `k-${i}-${phone.slice(-4)}`, tenant_id: T, phone_e164: phone, consent, dnc, marketing_consent: marketing, erased_at: null };
      const thread = {
        id: `conv-${i}-${phone.slice(-4)}`, tenant_id: T, contact_id: contact.id, paused_until: null,
        get contacts() { return { consent: contact.consent, dnc: contact.dnc, marketing_consent: contact.marketing_consent, erased_at: contact.erased_at }; },
        get tenants() { return { status: workspace.status }; },
      };
      tables.contacts.push(contact);
      tables.conversations.push(thread);
      if (own) tables.policies.push({ id: `pol-${contact.id}`, tenant_id: T, class: "reply", mode: own, limits: {}, subject_type: "contact", subject_id: contact.id });
      return { contact, thread };
    },
    /** The tool's call as Retell makes it: the call, and the number the agent collected when it collected one. */
    ask: (from, { spoken: collected } = {}) => ({
      call: { call_id: `call_fn_${i}_${++calls}`, agent_id: AGENT, call_type: "phone_call", direction: "inbound", from_number: from, to_number: line },
      name: "send_booking_link",
      args: collected === undefined ? {} : { phone_number: collected },
    }),
    left: () => leftSince(mark),
  };
}

/* -------------------------------------------------------------- the door */

test("the door: no header, an empty one, a wrong one and the secret on the URL are each a 401 that reads nothing and sends nothing; the header configured on the tool opens it", async () => {
  const w = world();
  const db = w.open();
  const caller = w.number();
  await listening(async (log) => {
    for (const [opts, why] of [
      [{ secret: null }, "no header at all"],
      [{ secret: "" }, "an empty header"],
      [{ secret: "not-the-secret" }, "a wrong secret"],
      [{ secret: null, url: `${DOOR}?key=${SECRET}` }, "the secret on the URL, where the webhook takes it: this door takes it in the header only"],
    ]) {
      const res = await knock(w.ask(caller), opts);
      assert.deepEqual([res.status, await res.json()], [401, { ok: false, error: "bad_secret" }], why);
    }
    // With no secret configured, nothing matches it: not a missing header, not an empty one.
    await withEnv({ RETELL_FN_SECRET: undefined }, async () => {
      for (const secret of [null, "", "anything"]) {
        assert.equal((await knock(w.ask(caller), { secret })).status, 401, `no secret configured, header ${JSON.stringify(secret)}`);
      }
    });
    // An empty secret is no secret: an empty header must not match it, as the
    // webhook door already refuses.
    await withEnv({ RETELL_FN_SECRET: "" }, async () => {
      for (const secret of [null, "", "anything"]) {
        assert.equal((await knock(w.ask(caller), { secret })).status, 401, `an empty secret configured, header ${JSON.stringify(secret)}`);
      }
    });
    assert.equal(db.seen.length, 0, "not one row read");
    assert.deepEqual(w.left().calls, [], "nothing sent");
    assert.deepEqual(log.lines, [], "and nothing said");

    assert.equal(await spoken(await knock(w.ask(caller))), SENT, "the same ask with the header: the refusals above were the door's doing");
  });
});

/* ------------------------------------------ before a workspace is known */

test("before a workspace is known: a number that is no phone is read back before anything is read; no database, no agent on the call, an agent nobody routes and a workspace with no persona each cannot send -- and nothing is sent for any of them", async () => {
  const w = world();
  const db = w.open();
  await listening(async (log) => {
    for (const [from, collected, why] of [
      ["", undefined, "no caller ID, and nothing collected"],
      ["", "12345", "no caller ID, and a short code collected"],
      ["anonymous", "555-1234", "no caller ID, and seven digits: a local number is not a phone number"],
    ]) {
      assert.equal(await spoken(await knock(w.ask(from, { spoken: collected }))), READ_IT_BACK, why);
    }
    assert.equal(log.said("retell_fn_no_number").length, 3);
    assert.equal(db.seen.length, 0, "a number that is not one is asked about before anything is read");

    setPg(null);
    assert.equal(await spoken(await knock(w.ask(w.number()))), CANNOT_SEND, "no database: nobody's number to send from");
    const again = w.open();
    const noAgent = w.ask(w.number());
    delete noAgent.call.agent_id;
    assert.equal(await spoken(await knock(noAgent)), CANNOT_SEND, "no agent on the call: no routing key, so no workspace");
    assert.deepEqual(log.fields("retell_fn_unroutable"), [{ has_db: false, agent_id: w.AGENT }, { has_db: true, agent_id: null }]);
    assert.equal(again.seen.length, 0, "and nothing read without one");

    const stranger = w.ask(w.number());
    stranger.call.agent_id = `${w.AGENT}_nobody`;
    assert.equal(await spoken(await knock(stranger)), CANNOT_SEND, "an agent no row names");
    assert.deepEqual(log.said("retell_fn_unknown_agent").map((l) => l.args.slice(1)), [[`${w.AGENT}_nobody`]]);
    assert.deepEqual(again.seen.map((q) => [q.table, q.op, q.filters]), [["tenant_channels", "select", [["eq", "kind", "voice"], ["eq", "external_id", `${w.AGENT}_nobody`]]]], "the routing answer, and nothing of any workspace");
  });

  const off = world();
  off.tables.tenant_channels[0].status = "disabled";
  const mute = world({ brain: null });
  await listening(async (log) => {
    off.open();
    assert.equal(await spoken(await knock(off.ask(off.number()))), CANNOT_SEND, "an agent whose channel is switched off");
    assert.equal(log.said("retell_fn_unknown_agent").length, 1);
    mute.open();
    assert.equal(await spoken(await knock(mute.ask(mute.number()))), CANNOT_SEND, "a workspace with no persona does not speak in a voice we invented for it");
    assert.deepEqual(log.fields("retell_fn_no_persona").map((f) => f.tenant), [mute.T]);
    assert.deepEqual([mute.tables.contacts, mute.tables.messages], [[], []], "and nobody is made a contact of it");
  });
  assert.deepEqual(w.left().calls, [], "nothing was sent for any of them");
});

/* ------------------------------------------------------------ the gate */

test("a paused workspace is refused at the gate, on the runtime's word: the caller hears WhatsApp messages are paused, the wire is never reached, and the only thing written is the refusal itself -- and once billing resumes, the stamp moves and the next ask is sent", async () => {
  const w = world({ status: "paused" });
  const caller = w.number();
  w.person(caller);
  const db = w.open();
  await listening(async (log) => {
    const ask = w.ask(caller);
    assert.equal(await spoken(await knock(ask)), refusalScript("paused", PUBLISHED), "an alternative for the caller, never our state");
    assert.deepEqual(log.fields("retell_fn_refused"), [{ call_id: ask.call.call_id, agent_id: w.AGENT, tenant: w.T, reason: "paused", mode: "auto", person_mode: null }],
      "the gate's refusal, with the workspace's mode still auto");
    assert.deepEqual(log.said("retell_fn_refused_at_wire"), [], "not left for the wire to find");
    assert.ok(!db.seen.some((q) => q.table === "conversations" && q.op === "select"), "the wire's own read never happened");
    assert.deepEqual([w.left().calls, w.tables.messages], [[], []], "nothing left this process, and the customer's thread is untouched");
    // One row does get written, and it is the point of writing it: the refusal
    // is findable afterwards without reading a log. It names the thread, not a
    // message, because the gate refused before any message row existed.
    assert.deepEqual(w.tables.events.map((e) => [e.kind, e.data.reason, e.subject_type]), [["message.send_blocked", "paused", "conversation"]]);

    // Billing resumes: the workspace row changes, and with it the runtime's stamp.
    w.workspace.status = "active";
    w.open();
    assert.equal(await spoken(await knock(w.ask(caller))), SENT, "the next ask, on a runtime reloaded because its stamp moved");
    assert.equal(w.left().graph.length, 1);
  });
});

test("the person's own receptionist mode wins over the workspace's, both ways, looked up for that person before the gate decides: Never holds a caller's link in a workspace set to auto, Veto sends one in a workspace set to ask", async () => {
  const auto = world({ mode: "auto" });
  const avoided = auto.number();
  const { contact } = auto.person(avoided, { mode: "never" });
  const autoDb = auto.open();
  await listening(async (log) => {
    assert.equal(await spoken(await knock(auto.ask(avoided))), refusalScript("policy_hold", PUBLISHED), "held, and told the business's own line");
    assert.deepEqual(log.fields("retell_fn_refused").map((f) => [f.reason, f.mode, f.person_mode]), [["policy_hold", "never", "never"]], "the mode in force is the person's");
    assert.deepEqual(auto.left().calls, [], "nothing sent to someone the owner stays away from");
    assert.deepEqual(
      autoDb.seen.filter((q) => q.table === "policies" && q.filters.some(([, col, v]) => col === "subject_type" && v === "contact")).map((q) => q.filters),
      [[["eq", "tenant_id", auto.T], ["eq", "class", "reply"], ["eq", "subject_type", "contact"], ["eq", "subject_id", contact.id]]],
      "one lookup, for this person in this workspace",
    );
  });

  const ask = world({ mode: "ask" });
  const vetoed = ask.number();
  ask.person(vetoed, { mode: "veto" });
  const plain = ask.number();
  ask.person(plain);
  ask.open();
  await listening(async (log) => {
    assert.equal(await spoken(await knock(ask.ask(vetoed))), SENT, "Veto sends the link a caller asked for: there is nothing in it to redirect");
    assert.equal(await spoken(await knock(ask.ask(plain))), refusalScript("policy_hold", PUBLISHED), "and a caller with no mode of their own is held by the workspace's ask");
    assert.deepEqual(ask.left().graph.map((g) => g.body.to), [vetoed.slice(1)]);
    assert.deepEqual(log.fields("retell_fn_refused").map((f) => [f.reason, f.mode, f.person_mode]), [["policy_hold", "ask", null]]);
  });
});

test("the booking link is a conversational message, proactive only toward someone who is not on the line: a caller with no yes to offers or to anything is sent it, a third party only on their own recorded yes, nobody who said stop, and a number nobody has on file not at all", async () => {
  const w = world();
  const caller = w.number();
  w.person(caller, { consent: "unknown", marketing: "opted_out" });
  const offersOnly = w.number();
  w.person(offersOnly, { consent: "unknown", marketing: "opted_in" });
  const agreed = w.number();
  w.person(agreed, { consent: "opted_in", marketing: "opted_out" });
  const stopped = w.number();
  w.person(stopped, { consent: "opted_out" });
  const blocked = w.number();
  w.person(blocked, { consent: "opted_in", dnc: true, marketing: "opted_in" });
  w.open();
  await listening(async (log) => {
    // The person on the line asked for this link, at the number they are
    // calling from: an answer, not outreach -- and not a promotion.
    assert.equal(await spoken(await knock(w.ask(caller))), SENT, "no yes to offers, and none to messages yet");
    // A number the caller names starts a conversation with somebody else, which
    // needs that person's own yes: to messages, not to offers.
    assert.equal(await spoken(await knock(w.ask(caller, { spoken: offersOnly }))), refusalScript("not_opted_in", PUBLISHED), "a yes to offers is not a yes to be texted what someone else asked for");
    assert.equal(await spoken(await knock(w.ask(caller, { spoken: agreed }))), SENT, "their own recorded yes");
    // Stop is stop, said on the line or by the person named.
    assert.equal(await spoken(await knock(w.ask(stopped))), refusalScript("opted_out", PUBLISHED), "a caller who said stop");
    assert.equal(await spoken(await knock(w.ask(caller, { spoken: blocked }))), refusalScript("opted_out", PUBLISHED), "do-not-contact outranks every yes");
    assert.deepEqual(w.left().graph.map((g) => g.body.to), [caller.slice(1), agreed.slice(1)], "two links: to the caller, and to the person who had said yes");
    assert.deepEqual(log.fields("retell_fn_refused").map((f) => f.reason), ["not_opted_in", "opted_out", "opted_out"]);
  });

  // A number that belongs to nobody on file: not texted, and not made a contact.
  const v = world();
  const on = v.number();
  v.person(on);
  const stranger = v.number();
  v.open();
  await listening(async (log) => {
    assert.equal(await spoken(await knock(v.ask(on, { spoken: stranger }))), CALLERS_OWN);
    assert.deepEqual(log.fields("retell_fn_refused_third_party").map((f) => f.tenant), [v.T]);
    assert.deepEqual(v.tables.contacts.map((c) => c.phone_e164), [on], "no contact is opened for a number merely spoken aloud");
    assert.deepEqual(v.left().calls, []);
  });
});

test("the number the agent collected is normalised before it is compared: the caller's own number said as ten digits is the caller's, and a number that is no phone falls back to the caller's own", async () => {
  const w = world();
  const caller = w.number();
  // No yes on record: were the collected number taken for somebody else's, the send would need one and be refused.
  w.person(caller, { consent: "unknown" });
  w.open();
  await listening(async (log) => {
    const national = `(${caller.slice(2, 5)}) ${caller.slice(5, 8)}-${caller.slice(8)}`;
    assert.equal(await spoken(await knock(w.ask(caller, { spoken: national }))), SENT, `"${national}", said the way a person says it, is the caller's own`);
    assert.equal(await spoken(await knock(w.ask(caller, { spoken: "12345" }))), SENT, "a short code is not a phone number: the send falls back to the caller, never to what was collected");
    assert.deepEqual(w.left().graph.map((g) => g.body.to), [caller.slice(1), caller.slice(1)], "both to the caller, in Graph's bare digits");
    assert.deepEqual([log.said("retell_fn_refused_third_party"), log.said("retell_fn_refused")], [[], []]);
    assert.equal(w.tables.contacts.length, 1, "and no second contact for the same person written another way");
  });
});

test("every number a caller is told is the one the resolver publishes: with none typed, the line the receptionist answers on -- in a hold and in a failed delivery -- and with no line either, sentences that offer none", async () => {
  const UNDELIVERABLE = { error: { message: "(#131026) Message undeliverable", type: "OAuthException", code: 131026 } };
  const refusedBody = JSON.stringify(UNDELIVERABLE).slice(0, 200);
  try {
    for (const [line, published] of [[LINE, PUBLISHED], [null, null]]) {
      const w = world({ line });
      const held = w.number();
      w.person(held, { mode: "never" });
      const failing = w.number();
      const { contact, thread } = w.person(failing);
      w.open();
      const why = published ? "the line, as a person says it" : "no number to give";
      await listening(async (log) => {
        graphReply = null;
        assert.equal(await spoken(await knock(w.ask(held))), published
          ? `I cannot send WhatsApp messages automatically for this business right now. Tell the caller they can book online, or reach the team on ${published}.`
          : "I cannot send WhatsApp messages automatically for this business right now. Tell the caller they can book online, and take their name.", `a hold: ${why}`);

        graphReply = (u) => (u.startsWith(GRAPH) ? json(400, UNDELIVERABLE) : json(404, {}));
        const ask = w.ask(failing);
        assert.equal(await spoken(await knock(ask)), published
          ? `The WhatsApp message could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, or reach us on ${published}.`
          : "The WhatsApp message could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, and take their name.", `a failed delivery: ${why}`);
        graphReply = null;

        // The attempt is on the record: a failed row in the caller's thread, and the event that says why.
        assert.deepEqual(w.tables.messages.map(({ id: _id, created_at: _at, ...m }) => m), [{
          tenant_id: w.T, conversation_id: thread.id, contact_id: contact.id, channel: "whatsapp", direction: "outbound", sender: "ai",
          type: "template", body: NOTE, external_id: null, status: "failed", meta: { source: SOURCE, call_id: ask.call.call_id, http_status: 400, body: refusedBody },
        }], `${why}: the business can see it tried`);
        assert.deepEqual(w.tables.events.filter((e) => e.kind === "message.send_failed").map((e) => [e.subject_id, e.data]), [[w.tables.messages[0].id, { http_status: 400, body: refusedBody, reason: "provider" }]]);
        assert.deepEqual(log.said("booking_link_send_failed").map((l) => l.args.slice(1)), [[400, refusedBody]]);
      });
    }
  } finally {
    graphReply = null;
  }
});

/* -------------------------------------------------------------- the send */

test("the send: the approved template on the workspace's own WhatsApp number and token, never the environment's pair; recorded in the caller's thread as the receptionist's, with its source and its call; the caller told it is on its way -- and a first-time caller made a contact on the way", async () => {
  const w = world();
  const returning = w.number();
  const { contact, thread } = w.person(returning);
  const first = w.number();
  w.open();
  await listening(async (log) => {
    const ask = w.ask(returning);
    assert.equal(await spoken(await knock(ask)), SENT);

    assert.deepEqual(w.left().graph, [{
      url: `${GRAPH}/${w.PHONE_ID}/messages`,
      authorization: `Bearer ${w.TOKEN}`,
      body: { messaging_product: "whatsapp", to: returning.slice(1), type: "template", template: TEMPLATE },
    }], "one template, from this workspace's own number on its own token");
    const wire = JSON.stringify(w.left().calls.map((c) => [c.url, c.init.headers, c.init.body]));
    assert.ok(!wire.includes(ENV_WHATSAPP.token) && !wire.includes(ENV_WHATSAPP.phoneId), "the environment's pair never left");

    assert.equal(w.tables.messages.length, 1);
    const { id, created_at: _at, ...row } = w.tables.messages[0];
    assert.match(row.external_id ?? "", /^wamid\.fn\.\d+$/, "the id Meta gave");
    assert.deepEqual(row, {
      tenant_id: w.T, conversation_id: thread.id, contact_id: contact.id, channel: "whatsapp", direction: "outbound", sender: "ai",
      type: "template", body: NOTE, external_id: row.external_id, status: "sent", meta: { source: SOURCE, call_id: ask.call.call_id },
    }, "in the caller's own thread, as the receptionist's, with the source the daily cap counts and the call that asked");
    assert.deepEqual(w.tables.events.map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data]), [[w.T, "message.sent", "message", id, { sender: "ai" }]]);
    assert.ok(thread.last_message_at, "the thread is stamped");
    assert.deepEqual(log.fields("retell_fn_sent"), [{ call_id: ask.call.call_id, agent_id: w.AGENT, tenant: w.T, wamid: row.external_id }]);

    // A first-time caller: made a contact with a thread of their own, and sent
    // the same. The double does not join, so the thread the door opens hands
    // the wire no contact and no workspace -- which it reads as somebody with
    // nothing recorded, in a workspace that is not paused: the facts of a
    // contact made a moment ago.
    assert.equal(await spoken(await knock(w.ask(first))), SENT, "a first call is owed the link as much as a tenth");
    const made = w.tables.contacts.find((c) => c.phone_e164 === first);
    assert.ok(made, "the caller is on file now");
    const theirs = w.tables.conversations.find((c) => c.contact_id === made.id);
    assert.deepEqual([w.tables.messages[1].contact_id, w.tables.messages[1].conversation_id], [made.id, theirs.id], "and the link is in their new thread");
    assert.deepEqual(w.left().graph.map((g) => g.body.to), [returning.slice(1), first.slice(1)]);
    const said = JSON.stringify(log.lines.map((l) => l.args));
    assert.ok(!said.includes(returning.slice(2)) && !said.includes(first.slice(2)), "neither number on a log line");
  });
});

test("the daily cap counts this thread's voice sends of the last day: a thread with three is told to check its WhatsApp, yesterday's and a broadcast's do not count, and the send the door records is the one it counts next", async () => {
  const w = world();
  const busy = w.number();
  const b = w.person(busy);
  const calm = w.number();
  const c = w.person(calm);
  const earlier = ({ contact, thread }, hoursAgo, meta) => w.tables.messages.push({
    id: `m-${thread.id}-${w.tables.messages.length}`, tenant_id: w.T, conversation_id: thread.id, contact_id: contact.id,
    channel: "whatsapp", direction: "outbound", sender: "ai", type: "template", body: NOTE, external_id: null, status: "sent",
    meta, created_at: iso(Date.now() - hoursAgo * 3_600_000),
  });
  const voice = { source: SOURCE, call_id: "call_earlier" };
  for (const h of [1, 5, 20]) earlier(b, h, voice);
  earlier(c, 2, voice);
  earlier(c, 9, voice);
  earlier(c, 25, voice);
  earlier(c, 3, { source: "broadcast" });
  w.open();
  await listening(async (log) => {
    assert.equal(await spoken(await knock(w.ask(busy))), refusalScript("daily_cap", PUBLISHED), "three today on this thread");
    assert.equal(await spoken(await knock(w.ask(calm))), SENT, "two today: yesterday's and a broadcast's are not this cap's");
    assert.equal(await spoken(await knock(w.ask(calm))), refusalScript("daily_cap", PUBLISHED), "and the link just recorded is the third");
    assert.deepEqual(log.fields("retell_fn_refused").map((f) => f.reason), ["daily_cap", "daily_cap"]);
    assert.deepEqual(w.left().graph.map((g) => g.body.to), [calm.slice(1)]);
  });
});

/* -------------------------------------------------------------- the wire */

test("the wire has the last word: a workspace paused after its runtime was kept, while the stamp could not be read, is refused there and said as the pause; a workspace holding no WhatsApp credentials is never sent on the environment's pair -- the attempt recorded, the caller told of a hold", async () => {
  const w = world();
  const caller = w.number();
  w.person(caller);
  const next = w.number();
  w.person(next);
  w.open();
  await listening(async (log) => {
    assert.equal(await spoken(await knock(w.ask(caller))), SENT, "the runtime is loaded, and kept");
    // Billing stops. The stamp that would say so does not answer, so the
    // runtime keeps what it has -- and only the wire's own read can see it.
    w.workspace.status = "paused";
    w.open({}, { runtime_stamp: () => { throw new Error("canceling statement due to statement timeout"); } });
    assert.equal(await spoken(await knock(w.ask(next))), refusalScript("paused", PUBLISHED), "said as the pause, in the caller's terms");
    assert.deepEqual(log.fields("retell_fn_refused_at_wire").map((f) => [f.tenant, f.reason]), [[w.T, "paused"]]);
    assert.deepEqual(log.said("retell_fn_refused"), [], "the gate, on the kept runtime, let it through");
    assert.equal(w.left().graph.length, 1, "the first link only");
    assert.equal(w.tables.messages.length, 1, "a refusal at the wire with no row leaves no row");
  });

  const none = world({ whatsapp: "none" });
  const from = none.number();
  const { contact, thread } = none.person(from);
  none.open();
  await listening(async (log) => {
    const ask = none.ask(from);
    assert.equal(await spoken(await knock(ask)), refusalScript("policy_hold", PUBLISHED), "the caller hears a hold, never that there is no line to send on");
    assert.deepEqual(log.fields("retell_fn_no_credentials").map((f) => f.tenant), [none.T]);
    assert.deepEqual(none.left().calls, [], "nothing left at all: not on the environment's pair, not anywhere");
    assert.deepEqual(none.tables.messages.map(({ id: _id, created_at: _at, ...m }) => m), [{
      tenant_id: none.T, conversation_id: thread.id, contact_id: contact.id, channel: "whatsapp", direction: "outbound", sender: "ai",
      type: "template", body: NOTE, external_id: null, status: "failed", meta: { source: SOURCE, call_id: ask.call.call_id, http_status: 503, body: "no_credentials" },
    }], "the attempt is on the record, with why");
    assert.deepEqual(none.tables.events.filter((e) => e.kind === "message.send_failed").map((e) => e.data), [{ http_status: 503, body: "no_credentials", reason: "no_credentials" }]);
  });
});

test("a repository call that throws is not a 500: the caller is told the WhatsApp message could not be sent, it is said, and nothing leaves", async () => {
  const w = world();
  const caller = w.number();
  w.person(caller);
  w.open({ "contacts.select": { message: "canceling statement due to statement timeout" } });
  await listening(async (log) => {
    assert.equal(await spoken(await knock(w.ask(caller))), CANNOT_SEND);
    assert.deepEqual(log.said("retell_fn_failed").map((l) => l.args.slice(1)), [["resolve_outbound_target: canceling statement due to statement timeout"]]);
    assert.deepEqual([w.left().calls, w.tables.messages], [[], []]);
  });
});


/* ------------------------------------------- the workspace's own answers */

test("a workspace that confirms its own bookings does not have the link sent for it, and the refusal is a row somebody can find", async () => {
  // Autonomy -> Booking -> "Ask me first". On WhatsApp this request already ends
  // with the link taken back out of the reply and a person handed the thread
  // (steps.ts layerTwo). This path read the REPLY row, so the same workspace
  // answered the same request two ways depending on which receptionist heard it.
  const w = world({ mode: "auto", booking: "ask" });
  const db = w.open();
  const caller = w.number();
  w.person(caller);
  const said = await listening(async (log) => {
    const out = await spoken(await knock(w.ask(caller)));
    assert.deepEqual(log.fields("retell_fn_refused").map((f) => f.reason), ["booking_needs_a_person"]);
    return out;
  });
  assert.equal(said, refusalScript("booking_needs_a_person", PUBLISHED));
  assert.match(said, /confirm/i, "the caller is told a person will confirm, which is what the workspace chose");
  assert.deepEqual(w.left().graph, [], "nothing reached Meta");

  // REGRESSION: the refusal was a line on stdout and nothing else, so a
  // customer saying "I never got the link" had no answer anywhere.
  const blocked = w.tables.events.filter((e) => e.kind === "message.send_blocked");
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].tenant_id, w.T);
  assert.equal(blocked[0].data.reason, "booking_needs_a_person");
  assert.equal(blocked[0].data.source, SOURCE);
});

test("a reply dial left on auto is not permission to book", async () => {
  const w = world({ mode: "auto", booking: "never" });
  w.open();
  const caller = w.number();
  w.person(caller);
  const said = await listening(async () => spoken(await knock(w.ask(caller))));
  assert.equal(said, refusalScript("booking_needs_a_person", PUBLISHED));
  assert.deepEqual(w.left().graph, []);
});

test("REGRESSION: a runaway guard that cannot read its own count does not open", async () => {
  // countSentToday IS the cap. It was caught to zero, so the database condition
  // most likely to accompany a runaway -- one that cannot answer "how many
  // today" -- read as "none today" and let every send through. The caller now
  // hears the truth instead, and nothing leaves.
  const w = world({ mode: "auto" });
  const caller = w.number();
  w.person(caller);
  w.open({ "messages.select": { message: "statement timeout" } });
  const said = await listening(async () => spoken(await knock(w.ask(caller))));
  assert.equal(said, CANNOT_SEND);
  assert.deepEqual(w.left().graph, [], "a send that could not be counted is a send that does not happen");
});

/* --------------------------------- which template, and whose answer it is */

test("a workspace with no approved booking template is told so, in the cause a business can act on", async () => {
  // REGRESSION: this path named booking_link_v1 by literal. That row existed in
  // exactly one workspace's database, written by hand and marked approved with
  // no meta_id -- so Meta had never seen it and the send failed there, while
  // every OTHER workspace named a row that did not exist at all. Either way the
  // caller heard "that number may not have WhatsApp", which is the wrong cause
  // and sends a business looking at the wrong thing.
  for (const [templates, why] of [
    [[], "none at all, as a newly created workspace has"],
    [[{ ...BOOKING_ROW, meta_status: "pending" }], "submitted and not yet approved"],
    [[{ ...BOOKING_ROW, meta_status: "rejected" }], "Meta said no"],
    [[{ ...BOOKING_ROW, name: "save_our_number", variables: [{ position: 1, label: "First name", example: "Dani" }, { position: 2, label: "Business name", example: "Luna" }] }], "approved, but it carries no booking link"],
    [[{ ...BOOKING_ROW, variables: [...BOOKING_ROW.variables, { position: 3, label: "Your message", example: "anything" }] }], "carries the link, but needs words nobody asked the caller for"],
  ]) {
    const w = world({ templates });
    w.open();
    const caller = w.number();
    w.person(caller);
    const said = await listening(async () => spoken(await knock(w.ask(caller))));
    assert.match(said, /has not set up its booking-link WhatsApp message/i, why);
    assert.match(said, /take their name/i, "and the agent is told what to do instead");
    assert.deepEqual(w.left().graph, [], `nothing reached Meta: ${why}`);
  }
});

test("a workspace that holds its bookings and has no approved booking template is told the hold, not that the caller can book online", async () => {
  // REGRESSION: the missing template was answered before the gate, so a
  // workspace holding bookings for a person to confirm had its caller told they
  // "can book online" -- the one thing it chose not to have said. Under the
  // hold the link would not go whichever template there was, so the hold is the
  // reason given, and it is recorded where a person can find it, as the gate's
  // own refusal is.
  for (const [templates, why] of [
    [[], "none at all"],
    [[{ ...BOOKING_ROW, meta_status: "pending" }], "submitted and not yet approved"],
  ]) {
    const w = world({ mode: "auto", booking: "ask", templates });
    w.open();
    const caller = w.number();
    w.person(caller);
    const said = await listening(async (log) => {
      const out = await spoken(await knock(w.ask(caller)));
      assert.deepEqual(log.fields("retell_fn_refused").map((f) => f.reason), ["booking_needs_a_person"], why);
      return out;
    });
    assert.equal(said, refusalScript("booking_needs_a_person", PUBLISHED), why);
    assert.doesNotMatch(said, /book online/i, why);
    assert.deepEqual(w.left().graph, [], `nothing reached Meta: ${why}`);
    assert.deepEqual(
      w.tables.events.filter((e) => e.kind === "message.send_blocked").map((e) => [e.data.reason, e.data.source]),
      [["booking_needs_a_person", SOURCE]],
      `the refusal is a row somebody can find: ${why}`,
    );
  }
});

test("the purpose is the template's own category again, so a promotion needs the offers answer and a utility message does not", async () => {
  // It was declared in the file, because the hand-written row said `marketing`
  // and purposeOfTemplate fails closed -- which would have refused the link to
  // every first-time caller. The starter shipped in its place is `utility`, so
  // the label agrees with the use and the fail-closed rule is back.
  const utility = world();
  utility.open();
  const first = utility.number();
  utility.person(first, { consent: "unknown", marketing: "unknown" });
  assert.equal(await listening(async () => spoken(await knock(utility.ask(first)))), SENT,
    "a first-time caller, who has said yes to nothing, still gets the link they just asked for");

  const promo = world({ templates: [{ ...BOOKING_ROW, category: "marketing" }] });
  promo.open();
  const caller = promo.number();
  promo.person(caller, { consent: "opted_in", marketing: "unknown" });
  const said = await listening(async () => spoken(await knock(promo.ask(caller))));
  assert.equal(said, refusalScript("no_marketing_consent", PUBLISHED),
    "a workspace whose booking template is filed as a promotion needs the yes that goes with it");
  assert.deepEqual(promo.left().graph, []);
});

test("the template's own slots are filled in the order it asks for them, not in the one this file used to assume", async () => {
  // The params were a positional pair -- business name, then link -- which held
  // only while one hand-written template was the only thing this path could
  // send. They are resolved from the slots now, as the Inbox and broadcasts
  // resolve them. A workspace that wrote its OWN booking template, rather than
  // taking the starter, is the case that proves it: the starter's name carries
  // the starter's shape, and a name we did not write is read off its labels.
  const swapped = world({
    templates: [{
      ...BOOKING_ROW,
      name: "reservar_ahora",
      body_preview: "Book here: {{1}} — that's {{2}}.",
      variables: [
        { position: 1, label: "Booking link", example: "https://booksy.com/luna-studio" },
        { position: 2, label: "Business name", example: "Luna Studio" },
      ],
    }],
  });
  swapped.open();
  const caller = swapped.number();
  swapped.person(caller);
  assert.equal(await listening(async () => spoken(await knock(swapped.ask(caller)))), SENT);
  const [sent] = swapped.left().graph;
  assert.deepEqual(sent.body.template.components[0].parameters.map((p) => p.text), ["book.example/harbor", "Harbor Moving"],
    "the link first, because this template asks for it first");
  assert.equal(swapped.tables.messages[0].body, "Book here: book.example/harbor — that's Harbor Moving.");
});
