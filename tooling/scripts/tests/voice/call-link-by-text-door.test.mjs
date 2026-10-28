/**
 * The booking link by text, run: send_booking_link called the way Retell calls it mid-call, over a database in memory,
 * with Meta's Graph API and Twilio answered by a captured fetch (the live walk's SET-2, 28 Oct 2026).
 *
 * A call sent the link as an approved WhatsApp message and nothing else, so a caller with no WhatsApp, a workspace
 * with no approved booking-link message or no WhatsApp of its own, or a number Meta refused was offered a follow-up.
 * Now the link goes by text from the workspace's texting line in each of those cases, and when the caller says they do
 * not use WhatsApp (`by: "text"`). What is held here: each of those sends a text, on the workspace's own line, into the
 * caller's thread, in the words the carriers approved the line for; none sends one where the person, the thread or the
 * workspace said no, where Meta's answer is not known, or where there is no line the carriers approved; and what the
 * caller is told says which way the link went.
 *
 * EVERY CASE OWNS ITS IDENTIFIERS, as the door's own test explains (retell-fn-door.test.mjs): the routing and the
 * runtime are cached per agent and per workspace.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const SECRET = "fn-secret-for-the-text-file";
const MASTER = { sid: `AC${"9".repeat(32)}`, token: "the-platforms-own-twilio-token" };

// Each test file is its own process, so this is the whole environment, set before the handler is imported.
process.env.RETELL_FN_SECRET = SECRET;
process.env.TWILIO_ACCOUNT_SID = MASTER.sid;
process.env.TWILIO_AUTH_TOKEN = MASTER.token;
for (const k of [
  "WHATSAPP_PHONE_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { refusalScript } = await import(at("packages/core/src/messages/outbound-gate.ts"));
const hook = await import(at("apps/edge/api/retell-fn.ts"));

/* -------------------------------------------------------------- the wire */

const GRAPH = "https://graph.facebook.com/v25.0";
const TWILIO = "https://api.twilio.com/2010-04-01";
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Every request that leaves this process. Graph takes a template, Twilio queues a text, unless a case hands in its own
 * answer for one of them (`graphReply`, `twilioReply`).
 */
const requests = [];
let graphReply = null;
let twilioReply = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  requests.push({ url: u, init });
  if (u.startsWith(GRAPH)) {
    if (graphReply) return graphReply(u, init);
    return json(200, { messaging_product: "whatsapp", messages: [{ id: `wamid.text.${requests.length}` }] });
  }
  if (u.startsWith(TWILIO)) {
    if (twilioReply) return twilioReply(u, init);
    return json(201, { sid: `SM${String(requests.length).padStart(32, "0")}`, status: "accepted" });
  }
  return json(404, {});
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
});

/** With these answers from Meta and Twilio for the length of `fn`. */
async function answering({ graph = null, twilio = null }, fn) {
  graphReply = graph;
  twilioReply = twilio;
  try {
    return await fn();
  } finally {
    graphReply = null;
    twilioReply = null;
  }
}

/* ------------------------------------------------------------- the knock */

const DOOR = "https://chanlytics-messaging.vercel.app/api/retell-fn";
const knock = (body) =>
  hook.POST(
    new Request(DOOR, {
      method: "POST",
      headers: { "content-type": "application/json", "x-fn-secret": SECRET },
      body: JSON.stringify(body),
    }),
    { waitUntil: () => {} },
  );

/** What the voice agent is handed to say: a 200 whose one field is the sentence. */
async function spoken(res) {
  assert.equal(res.status, 200, "every answer past the door is a 200: the agent speaks it");
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ["result"]);
  return body.result;
}

/* ---------------------------------------------------- what the agent says */

const PUBLISHED = "+1 (305) 555-0100";
const TEXT_SENT =
  "Booking link sent to them by text message. Tell them it comes as a text and should be on their phone in a moment.";
const TEXT_AFTER_WHATSAPP =
  "The WhatsApp message could not be delivered, so the booking link was sent by text message instead. Tell them it comes as a text and should be on their phone in a moment.";
const NO_TEMPLATE =
  "This business has not set up its booking-link WhatsApp message yet, so I cannot send it. Tell the caller they can book online, take their name, and say someone will follow up.";
const NO_TEXT_LINE =
  "This business cannot send text messages yet, so nothing was sent. Tell the caller they can book online, and take their name, what they need, and where and when so the team can follow up.";
const NOT_ON_WHATSAPP = `The WhatsApp message could not be delivered — that number may not have WhatsApp. Tell the caller they can book online, or reach us on ${PUBLISHED}, and take their name, what they need, and where and when so the team can follow up.`;
const NOT_A_MOBILE = `The text message could not be delivered — that number may not take texts. Tell the caller they can book online, or reach us on ${PUBLISHED}, and take their name, what they need, and where and when so the team can follow up.`;
/** The words the line was approved for: the business first, the link as the owner wrote it, then how to stop. */
const TEXT_BODY =
  "Harbor Moving: here's the link to book, as you asked on the phone: https://book.example/harbor\nReply STOP to opt out.";

/* ------------------------------------------------------------- the world */

const LINE = "+13055550100";
const SOURCE = "voice_booking_link";
const BRAIN = {
  business_name: "Harbor Moving",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor Moving: brief and warm, and never guess a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  profile: { hours: { mon: { open: "09:00", close: "17:00" } }, handoff_number: "+13055550199" },
};
const BOOKING_ROW = {
  channel: "whatsapp",
  name: "booking_link",
  language: "en_US",
  category: "utility",
  meta_status: "approved",
  title: null,
  body_preview: "Hi {{1}}, it's {{2}}. Here's the link to book your appointment: {{3}} — pick any time that suits you.",
  variables: [
    { position: 1, label: "First name", example: "Dani" },
    { position: 2, label: "Business name", example: "Luna Studio" },
    { position: 3, label: "Booking link", example: "https://booksy.com/luna-studio" },
  ],
};

const pad = (n, width) => String(n).padStart(width, "0");
let seq = 0;

/**
 * One workspace answering calls on one voice agent: a WhatsApp number with its token in the vault ("own"), one with
 * none ("none"), or none at all (false); an approved booking-link message or none (`template`); and a texting line the
 * carriers approved ("active"), a test filing ("mock"), one not approved ("none"), or none at all (false).
 */
function world({ whatsapp = "own", template = true, texting = "active", booking = null } = {}) {
  const i = ++seq;
  const T = `cccccccc-0000-4000-8000-${pad(i, 12)}`;
  const AGENT = `agent_text_${i}_${crypto.randomBytes(4).toString("hex")}`;
  const PHONE_ID = String(107770000000000 + i);
  const workspace = { id: T, name: "Harbor Moving", timezone: "America/New_York", status: "active" };
  const line = texting
    ? {
        id: `line-${i}`,
        tenant_id: T,
        e164: LINE,
        provider: "twilio",
        subaccount_sid: `AC${pad(i, 32)}`,
        messaging_service_sid: `MG${pad(i, 32)}`,
        sms_state: texting === "none" ? "none" : "active",
        reg_mock: texting === "mock",
        voice_state: "answering",
        created_at: new Date(Date.now() - 86_400_000).toISOString(),
      }
    : null;
  const tables = {
    tenants: [workspace],
    tenant_channels: [
      {
        id: `voice-${i}`,
        tenant_id: T,
        kind: "voice",
        external_id: AGENT,
        number_e164: LINE,
        status: "active",
        credentials_ref: null,
        config: {},
      },
      ...(whatsapp
        ? [
            {
              id: `wa-${i}`,
              tenant_id: T,
              kind: "whatsapp",
              external_id: PHONE_ID,
              number_e164: `+1786555${pad(i, 4)}`,
              status: "active",
              credentials_ref: whatsapp === "own" ? `vault-ref-${i}` : null,
              config: {},
            },
          ]
        : []),
    ],
    tenant_config: [{ tenant_id: T, config: { brain: BRAIN } }],
    policies: [
      { id: `pol-${i}`, tenant_id: T, class: "reply", mode: "auto", limits: {}, subject_type: null, subject_id: null },
      ...(booking
        ? [
            {
              id: `pol-b-${i}`,
              tenant_id: T,
              class: "booking",
              mode: booking,
              limits: {},
              subject_type: null,
              subject_id: null,
            },
          ]
        : []),
    ],
    templates: template ? [{ id: `tpl-${i}`, tenant_id: T, ...BOOKING_ROW }] : [],
    lines: line ? [line] : [],
    google_listings: [],
    contacts: [],
    conversations: [],
    messages: [],
    events: [],
  };
  const vault = whatsapp === "own" ? { [`wa-${i}`]: { access_token: `workspace-${i}-token`, phone_id: PHONE_ID } } : {};
  const lineToken = `line-${i}-subaccount-token`;
  const mark = requests.length;
  let people = 0;
  let calls = 0;
  return {
    T,
    line,
    lineToken,
    tables,
    open: () => {
      const db = fakeDb(
        tables,
        {},
        {
          runtime_stamp: () => `stamp-text-${i}`,
          get_channel_credentials: ({ p_channel_id }) => vault[p_channel_id] ?? null,
          get_line_credentials: ({ p_line_id }) => (line && p_line_id === line.id ? { auth_token: lineToken } : {}),
        },
      );
      setPg(db);
      return db;
    },
    number: () => `+1646555${pad(i * 10 + ++people, 4)}`,
    /**
     * Someone on file. The thread's person IS the contacts row (one object), as the wire reads it joined: what the door
     * writes (a carrier's STOP) is what its next read sees.
     */
    person: (phone, { consent = "opted_in", channels = null } = {}) => {
      const contact = {
        id: `k-${i}-${phone.slice(-4)}`,
        tenant_id: T,
        phone_e164: phone,
        consent,
        dnc: false,
        marketing_consent: "unknown",
        consent_channels: channels,
        marketing_channels: null,
        erased_at: null,
      };
      const thread = {
        id: `conv-${i}-${phone.slice(-4)}`,
        tenant_id: T,
        contact_id: contact.id,
        paused_until: null,
        contacts: contact,
        tenants: { status: "active" },
      };
      tables.contacts.push(contact);
      tables.conversations.push(thread);
      return { contact, thread };
    },
    ask: (from, args = {}) => ({
      call: {
        call_id: `call_text_${i}_${++calls}`,
        agent_id: AGENT,
        call_type: "phone_call",
        direction: "inbound",
        from_number: from,
        to_number: LINE,
      },
      name: "send_booking_link",
      args,
    }),
    /** What left since the world was made: Graph's templates, and Twilio's texts as the form it was sent. */
    left: () => {
      const calls = requests.slice(mark);
      return {
        graph: calls.filter((c) => c.url.startsWith(GRAPH)).map((c) => JSON.parse(c.init.body).to),
        twilio: calls
          .filter((c) => c.url.startsWith(TWILIO))
          .map((c) => ({
            url: c.url,
            authorization: c.init.headers.Authorization,
            form: Object.fromEntries(new URLSearchParams(c.init.body)),
          })),
      };
    },
  };
}

/** The text a world's line sent to `to`, as Twilio receives it: on the workspace's own subaccount and service. */
const textFrom = (w, to) => ({
  url: `${TWILIO}/Accounts/${w.line.subaccount_sid}/Messages.json`,
  authorization: `Basic ${Buffer.from(`${w.line.subaccount_sid}:${w.lineToken}`).toString("base64")}`,
  form: {
    MessagingServiceSid: w.line.messaging_service_sid,
    To: to,
    Body: TEXT_BODY,
    StatusCallback: "https://chanlytics-messaging.vercel.app/api/sms-status",
  },
});

/** The thread's rows as the door wrote them: channel, status, and what the call stamped on them. */
const rowsOf = (w) => w.tables.messages.map((m) => [m.channel, m.status, m.meta?.by ?? null, m.meta?.after ?? null]);

/* ---------------------------------------------------------- it goes by text */

test("a caller who does not use WhatsApp is texted the link from the workspace's own line, into their thread, in the words the carriers approved", async () => {
  const w = world();
  w.open();
  const caller = w.number();
  const { contact, thread } = w.person(caller);
  const ask = w.ask(caller, { by: "text" });
  assert.equal(await spoken(await knock(ask)), TEXT_SENT);
  assert.deepEqual(w.left().graph, [], "WhatsApp is not tried for a caller who said they do not use it");
  assert.deepEqual(w.left().twilio, [textFrom(w, caller)], "one text, the caller's number given its +");
  assert.equal(w.tables.messages.length, 1);
  const { id: _id, created_at: _at, external_id, ...row } = w.tables.messages[0];
  assert.match(external_id ?? "", /^SM\d{32}$/, "the sid Twilio gave");
  assert.deepEqual(row, {
    tenant_id: w.T,
    conversation_id: thread.id,
    contact_id: contact.id,
    channel: "sms",
    direction: "outbound",
    sender: "ai",
    type: "text",
    body: TEXT_BODY,
    status: "sent",
    meta: { source: SOURCE, call_id: ask.call.call_id, by: "text", after: "caller_asked" },
  });
});

test("with no approved booking-link message, or no WhatsApp of its own, the link goes by text instead of a follow-up", async () => {
  for (const [shape, after] of [
    [{ template: false }, "no_template"],
    [{ whatsapp: "none" }, "no_whatsapp"],
  ]) {
    const w = world(shape);
    w.open();
    const caller = w.number();
    w.person(caller);
    assert.equal(await spoken(await knock(w.ask(caller))), TEXT_SENT, after);
    assert.deepEqual(w.left().graph, [], `${after}: nothing went to Meta`);
    assert.deepEqual(w.left().twilio, [textFrom(w, caller)], after);
    assert.deepEqual(rowsOf(w).at(-1), ["sms", "sent", "text", after], after);
  }
});

test("a number Meta refuses, at the send or a moment after it, is texted the link, and the caller is told it came by text", async () => {
  // Meta's no before it took anything: a 400 with its error.
  const refused = world();
  refused.open();
  const a = refused.number();
  refused.person(a);
  const said = await answering(
    { graph: () => json(400, { error: { code: 131026, message: "Message undeliverable" } }) },
    async () => spoken(await knock(refused.ask(a))),
  );
  assert.equal(said, TEXT_AFTER_WHATSAPP);
  assert.deepEqual(rowsOf(refused), [
    ["whatsapp", "failed", null, null],
    ["sms", "sent", "text", "whatsapp_refused"],
  ]);

  // Meta took it, then said in the moment after that it failed (decision 0073, R14): the receipt the wait reads.
  const later = world();
  later.open();
  const b = later.number();
  later.person(b);
  const heard = await answering(
    {
      graph: (_u, init) => {
        const wamid = `wamid.later.${JSON.parse(init.body).to}`;
        setTimeout(() => {
          const row = later.tables.messages.find((m) => m.external_id === wamid);
          if (row) row.status = "failed";
        }, 100);
        return json(200, { messaging_product: "whatsapp", messages: [{ id: wamid }] });
      },
    },
    async () => spoken(await knock(later.ask(b))),
  );
  assert.equal(heard, TEXT_AFTER_WHATSAPP);
  assert.deepEqual(later.left().twilio, [textFrom(later, b)]);
  assert.deepEqual(rowsOf(later), [
    ["whatsapp", "failed", null, null],
    ["sms", "sent", "text", "whatsapp_refused"],
  ]);
});

/* ------------------------------------------------------- it does not go */

test("where Meta's answer is not known, nothing is sent again: the caller may have it already", async () => {
  const w = world();
  w.open();
  const caller = w.number();
  w.person(caller);
  // A 503: the provider may have taken it all the same (provider-fetch `unknown`).
  const said = await answering({ graph: () => json(503, {}) }, async () => spoken(await knock(w.ask(caller))));
  assert.equal(said, NOT_ON_WHATSAPP);
  assert.deepEqual(w.left().twilio, [], "no text after a WhatsApp message that may have gone");
});

test("a person who said stop, a thread a person holds, and bookings the team confirms are refused on either channel, never texted round", async () => {
  const stopped = world();
  stopped.open();
  const a = stopped.number();
  stopped.person(a, { consent: "opted_out" });
  assert.equal(await spoken(await knock(stopped.ask(a))), refusalScript("opted_out", PUBLISHED, "whatsapp"));
  assert.equal(await spoken(await knock(stopped.ask(a, { by: "text" }))), refusalScript("opted_out", PUBLISHED, "sms"));
  assert.deepEqual(stopped.left(), { graph: [], twilio: [] });

  const held = world({ booking: "ask" });
  held.open();
  const b = held.number();
  held.person(b);
  for (const args of [{}, { by: "text" }])
    assert.equal(
      await spoken(await knock(held.ask(b, args))),
      refusalScript("booking_needs_a_person", PUBLISHED, "whatsapp"),
    );
  assert.deepEqual(held.left(), { graph: [], twilio: [] });
  assert.deepEqual(
    held.tables.events.map((e) => [e.kind, e.data.reason, e.data.channel]),
    [
      ["message.send_blocked", "booking_needs_a_person", "whatsapp"],
      ["message.send_blocked", "booking_needs_a_person", "sms"],
    ],
    "each refusal recorded, on the channel it would have gone by",
  );
});

test("a number somebody spoke aloud is texted only with that person's own yes covering texts", async () => {
  const w = world();
  w.open();
  const caller = w.number();
  const named = w.number();
  // On file, and said yes on WhatsApp alone: a text would start a conversation they never agreed to.
  w.person(named, { consent: "opted_in", channels: ["whatsapp"] });
  assert.equal(
    await spoken(await knock(w.ask(caller, { phone_number: named, by: "text" }))),
    refusalScript("not_opted_in", PUBLISHED, "sms"),
  );
  assert.deepEqual(w.left().twilio, []);
  // Their yes covers texts too: it goes.
  w.tables.contacts.find((c) => c.phone_e164 === named).consent_channels = ["whatsapp", "sms"];
  assert.equal(await spoken(await knock(w.ask(caller, { phone_number: named, by: "text" }))), TEXT_SENT);
  assert.deepEqual(w.left().twilio, [textFrom(w, named)]);
});

test("with no line the carriers approved -- none, one not approved, or a test filing -- a call says what it said before", async () => {
  for (const texting of [false, "none", "mock"]) {
    const w = world({ texting, template: false });
    w.open();
    const caller = w.number();
    w.person(caller);
    assert.equal(await spoken(await knock(w.ask(caller))), NO_TEMPLATE, `texting ${texting}`);
    assert.equal(await spoken(await knock(w.ask(caller, { by: "text" }))), NO_TEXT_LINE, `texting ${texting}`);
    assert.deepEqual(w.left(), { graph: [], twilio: [] }, `texting ${texting}: nothing sent`);
  }
});

test("the carrier's STOP is the person's: said as theirs, and recorded so nothing is sent to them again", async () => {
  const w = world();
  w.open();
  const caller = w.number();
  const { contact } = w.person(caller);
  const stop = () =>
    json(400, {
      code: 21610,
      message: "Attempt to send to unsubscribed recipient",
      more_info: "https://www.twilio.com/docs/errors/21610",
      status: 400,
    });
  const said = await answering({ twilio: stop }, async () => spoken(await knock(w.ask(caller, { by: "text" }))));
  assert.equal(said, refusalScript("opted_out", PUBLISHED, "sms"));
  assert.equal(contact.consent, "opted_out", "recorded as the person's stop");
  // The next ask is refused before anything leaves, on either channel.
  assert.equal(await spoken(await knock(w.ask(caller))), refusalScript("opted_out", PUBLISHED, "whatsapp"));
  assert.deepEqual(w.left().graph, []);
});

test("a number the carrier will not text (a landline) is said as that, with the business's number and a follow-up", async () => {
  const w = world();
  w.open();
  const caller = w.number();
  w.person(caller);
  const notMobile = () => json(400, { code: 21614, message: "'To' number is not a valid mobile number", status: 400 });
  const said = await answering({ twilio: notMobile }, async () => spoken(await knock(w.ask(caller, { by: "text" }))));
  assert.equal(said, NOT_A_MOBILE);
  assert.deepEqual(rowsOf(w), [["sms", "failed", "text", "caller_asked"]], "the try is in their thread");
});
