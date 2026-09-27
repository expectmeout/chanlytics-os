/**
 * The SMS door, run: a text posted the way Twilio posts one, signed with the
 * line's own subaccount token, over a database in memory, with the
 * receptionist's world handed in through lib/whatsapp/ports.ts and every
 * request that leaves the process captured. Until 14 Sep 2026 this handler's
 * binding was held by two reads of its text and no test had ever called its
 * POST; what it decides was already run, in sms-ingress.test.mjs.
 *
 * What runs here is the wire around that decision. The form is read before
 * anything else, so a body that is not a message is a 400 that asks nothing of
 * the database, and no database is a 503. The signature is checked over the
 * URL Twilio called, every field and the line's own token, and a forged one is
 * a 403 that pages nobody. Every other refusal is heard as its own status, said
 * at its own level, and told to the platform naming the number, once a window
 * -- once for the whole class when no line carries the number, because that
 * number is whatever the caller wrote. An accepted text reaches the
 * receptionist on the routed workspace's sms channel with the line as its
 * carrier: held for a person while the carriers have not approved the line,
 * answered on the line's own subaccount once they have, and never taken for
 * the environment's own number. After the receptionist throws, only a text the
 * database did not keep is refused. Every answer is an empty TwiML.
 *
 * EVERY CASE OWNS ITS IDENTIFIERS. The channel resolver keeps a routing answer
 * in module state (five minutes; a miss for one), and the platform's note stays
 * quiet for fifteen minutes per number: a case sharing either with another
 * would read the first one's answer and pass while proving nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { twilioSignature, SMS_FOOTER, SMS_HELD_REASON, SMS_HELD_DETAILS } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

const MAIL = { RESEND_API_KEY: "re_test_only", LEAD_TO: "ops@platform.test", LEAD_FROM: "Pager <pager@platform.test>" };
/** The platform's own Twilio account: what makes the texting provider Twilio's, and never what a line answers with. */
const MASTER = { sid: "ACplatformmasteraccountforthisfile", token: "platform-master-token-for-this-file" };

// Each test file is its own process, so this is the whole environment, set
// before the handler is imported below. The environment's own WhatsApp pair is
// present, so a text taken for the environment's number would show; the
// platform's mailbox is configured, so what is not mailed below is not mailed
// by decision, never for want of an address.
process.env.TWILIO_ACCOUNT_SID = MASTER.sid;
process.env.TWILIO_AUTH_TOKEN = MASTER.token;
process.env.WHATSAPP_PHONE_ID = "109990000000002";
process.env.WHATSAPP_ACCESS_TOKEN = "the-environments-own-whatsapp-token";
Object.assign(process.env, MAIL);
for (const k of [
  "ANTHROPIC_API_KEY",
  "WHATSAPP_TEST_ALLOWLIST",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LINES_DRY_RUN",
  "VERCEL_ENV",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg, pg } = await import(at("apps/edge/lib/pg.ts"));
const { setInboundPorts } = await import(at("apps/edge/lib/whatsapp/ports.ts"));
const { IngestFailed } = await import(at("apps/edge/lib/whatsapp/persist.ts"));
const { smsSenderFor } = await import(at("apps/edge/lib/sms/sms.ts"));
const { deliver } = await import(at("packages/core/dist/index.js"));
const hook = await import(at("apps/edge/api/inbound-sms.ts"));

/* -------------------------------------------------------------- the wire */

const TWILIO = "https://api.twilio.com/2010-04-01";
const RESEND = "https://api.resend.com/";

/**
 * Every request that leaves this process, captured for the whole file rather
 * than per case: an approved line's text is answered on Twilio, and a case that
 * forgot to listen must not reach a real provider. Twilio's message API
 * answers as it answers a message it accepted -- or, for a number a case has
 * put on `optedOutAtCarrier`, as it refuses a text to somebody who replied
 * STOP to the number (21610, its error body as documented); anything else
 * (Resend) as a delivered mail.
 */
const requests = [];
const optedOutAtCarrier = new Set();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  requests.push({ url: u, init });
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (!u.startsWith(TWILIO)) return json(200, {});
  const to = u.endsWith("/Messages.json") ? new URLSearchParams(init?.body ?? "").get("To") : null;
  return to && optedOutAtCarrier.has(to)
    ? json(400, {
        code: 21610,
        message: "Attempt to send to unsubscribed recipient",
        more_info: "https://www.twilio.com/docs/errors/21610",
        status: 400,
      })
    : json(201, { sid: `SM${String(requests.length).padStart(32, "0")}`, status: "accepted" });
};
after(() => {
  globalThis.fetch = realFetch;
  setPg(null);
  setInboundPorts(null);
});

/** What left after `mark`: the mail Resend was asked to send, and the texts Twilio was asked to send. */
function leftSince(mark) {
  const calls = requests.slice(mark);
  return {
    calls,
    mail: calls.filter((c) => c.url.startsWith(RESEND)).map((c) => JSON.parse(c.init.body)),
    texts: calls
      .filter((c) => c.url.startsWith(TWILIO))
      .map((c) => ({
        url: c.url,
        authorization: c.init.headers.Authorization,
        form: Object.fromEntries(new URLSearchParams(c.init.body)),
      })),
  };
}

/* ------------------------------------------------------------- the knock */

const DOOR = "https://chanlytics-messaging.vercel.app/api/inbound-sms";
const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

/**
 * What Vercel hands a method export beside the request: its runtime calls
 * `webHandler(request, new FetchEvent(request))`, and Vercel's FetchEvent
 * carries `waitUntil`. Every knock below carries one, so every case runs the
 * door the way production calls it (ports.ts says why that decided where the
 * seam went).
 */
const event = () => ({ waitUntil: () => {} });
const post = (body, headers = {}, url = DOOR) =>
  hook.POST(
    new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body,
    }),
    event(),
  );
/** A text as Twilio posts it: the fields as a form, signed over the URL and every field with `token` (null signs nothing). */
const text = async (fields, token, { url = DOOR, signedUrl = url } = {}) =>
  post(
    new URLSearchParams(fields).toString(),
    token ? { "x-twilio-signature": await twilioSignature(token, signedUrl, fields) } : {},
    url,
  );
/** What Twilio hears: the status, the type and the body. */
const heard = async (res) => [res.status, res.headers.get("content-type"), await res.text()];
const twiml = (status) => [status, "text/xml", EMPTY_TWIML];

/** What the door and the handler say on the console while `fn` runs: one structured line each. */
async function listening(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const stream of ["log", "warn", "error"]) {
    console[stream] = (...args) => {
      let line = null;
      try {
        line = JSON.parse(args[0]);
      } catch {}
      lines.push(
        line && typeof line === "object" && line.event ? { stream, ...line } : { stream, event: String(args[0]), args },
      );
    };
  }
  try {
    return await fn({ lines, said: (name) => lines.filter((l) => l.event === name) });
  } finally {
    Object.assign(console, real);
  }
}

/* ------------------------------------------------------------- the world */

const GREETING = "Thanks for texting Harbor Nails. A person will be with you shortly.";
const NOTIFICATIONS = () => ({
  escalation_emails: ["owner@riverside.example"],
  from: "Riverside Studio <hello@platform.test>",
});
const BRAIN = () => ({
  business_name: "Harbor Nails",
  booking_link: "https://booking.example/riverside",
  system_prompt:
    "You are the assistant for Harbor Nails, answering inbound customer messages. Be warm, brief and honest, and offer to have a person follow up.",
  fallbacks: {
    greeting: GREETING,
    error: "Thanks for writing to Harbor Nails! A member of the team will reply here soon.",
    non_text: "Thanks for your message! A member of the team will take a look and reply here soon.",
  },
});
const SAID = "Are you open Saturday?";
const pad = (n, width) => String(n).padStart(width, "0");
let seq = 0;

/**
 * One workspace with one approved texting line, every identifier its own (see
 * the header). A case changes `line`, `channel` or `vault` before `open(faults)`
 * hands the door a database over them.
 */
function world() {
  const i = ++seq;
  const T = `dddddddd-0000-4000-8000-${pad(i, 12)}`;
  const LINE = `+1305555${3000 + i}`;
  const SUB = `AC${pad(i, 32)}`;
  const SERVICE = `MG${pad(i, 32)}`;
  const TOKEN = `subaccount-token-${i}`;
  const line = {
    id: `eeeeeeee-0000-4000-8000-${pad(i, 12)}`,
    tenant_id: T,
    e164: LINE,
    provider: "twilio",
    subaccount_sid: SUB,
    messaging_service_sid: SERVICE,
    sms_state: "active",
    voice_state: "active",
  };
  const channel = {
    id: `sms-ch-${i}`,
    tenant_id: T,
    kind: "sms",
    external_id: LINE,
    number_e164: LINE,
    credentials_ref: null,
    config: {},
    status: "active",
  };
  const tables = { lines: [line], tenant_channels: [channel] };
  const vault = { [line.id]: { auth_token: TOKEN } };
  const mark = requests.length;
  let people = 0;
  let texts = 0;
  return {
    i,
    T,
    LINE,
    SUB,
    SERVICE,
    TOKEN,
    line,
    channel,
    tables,
    vault,
    open: (faults = {}) => {
      const db = fakeDb(tables, faults, { get_line_credentials: ({ p_line_id }) => vault[p_line_id] ?? {} });
      setPg(db);
      return db;
    },
    /** A customer nobody else in this file texts as, in E.164 as Twilio sends it. */
    customer: () => `+1646555${pad(i * 10 + ++people, 4)}`,
    /** One inbound text's fields, as Twilio posts them to this line. */
    form: (from, over = {}) => ({
      MessageSid: `SM${pad(i * 100 + ++texts, 32)}`,
      AccountSid: SUB,
      MessagingServiceSid: SERVICE,
      From: from,
      To: LINE,
      Body: SAID,
      NumMedia: "0",
      ...over,
    }),
    /** Everything that left the process since this world was made. */
    left: () => leftSince(mark),
  };
}

const blank = () => ({ history: [], pausedUntil: 0, replies: [], repliedBefore: false });

/**
 * The receptionist's world, handed in through setInboundPorts and recording
 * what crosses it: the shape inbound-executed.test.mjs runs handleInbound over,
 * whose model is never reached. The door passes handleInbound no ports, so this
 * is what realPorts() answers with. Its sink sends on the wire handleInbound
 * builds for the message, as the real sink's door does, so an answer on a text
 * goes through the carrier the door made from the line and the vault.
 * `ingest` and `escalate` run inside those steps, so a case can make either throw.
 */
function receptionist({ allowlist = "", ingest = () => {}, escalate = () => {} } = {}) {
  const seen = {
    runtimes: [],
    ingested: [],
    sent: [],
    escalations: [],
    alerts: [],
    whatsappWires: [],
    allowlistSkips: 0,
    processed: 0,
    emails: [],
  };
  setInboundPorts({
    db: pg,
    runtime: async (_db, routed) => {
      seen.runtimes.push(routed);
      return {
        tenantId: routed.tenantId,
        brain: BRAIN(),
        notifications: NOTIFICATIONS(),
        calendar: null,
        features: null,
        policy: { reply: { mode: "auto", limits: {} } },
        // A workspace that texts: no WhatsApp credentials of its own, and not the environment's number.
        waCreds: null,
        envNumber: false,
        paused: false,
        loadFailed: false,
        configBroken: false,
      };
    },
    leads: { read: async () => ({ name: null }), personReplyMode: async () => null },
    calendar: { openings: async () => null, visits: async () => null },
    budget: { tokensLast24h: async () => 0 },
    persist: {
      thread: async () => blank(),
      ingest: async (_db, tenantId, n, channel) => {
        seen.ingested.push({ tenantId, channel, body: n.body });
        ingest(n);
        return tenantId
          ? {
              message_id: "m-in",
              conversation_id: "conv-1",
              contact_id: "k-1",
              is_new: true,
              consent: "unknown",
              dnc: false,
              paused_until: null,
            }
          : null;
      },
      sink: (_db, tenantId, _ing, _rt, channel, wires) => ({
        on: true,
        deliver: async (to, body, meta) => {
          const r = await wires[channel](to, { body });
          seen.sent.push({ tenantId, channel, to, body, meta: meta ?? null });
          return r.ok
            ? { outcome: "sent", messageId: "m-out", externalId: r.wamid }
            : { outcome: "failed", reason: "provider", status: r.status, errorBody: null, messageId: null };
        },
        processed: async () => {
          seen.processed += 1;
        },
        allowlistSkip: async () => {
          seen.allowlistSkips += 1;
        },
        unreachableSender: async () => {},
        noteEmail: async (address) => {
          seen.emails.push(address);
        },
        vetoFallback: async () => {},
        pause: async () => {},
        usage: async () => {},
        escalate: async (reason, details) => {
          escalate(reason);
          seen.escalations.push({ reason, details });
          return "opened";
        },
        media: async () => null,
      }),
      queueReply: async () => false,
    },
    alertStaff: async (thread, _said, _answered, reason, ctx) => {
      seen.alerts.push({ thread, reason, channel: ctx.channel, envDefault: ctx.target.isEnvDefault });
    },
    page: async () => "sent",
    sender: (cfg) => {
      seen.whatsappWires.push(cfg);
      return async () => {
        throw new Error("a text must not be answered on WhatsApp");
      };
    },
    brain: async () => {
      throw new Error("the model must not be reached in this test");
    },
    env: { allowlist, modelKey: undefined },
  });
  return seen;
}

/* -------------------------------------------------------------- the door */

test("a body that is not a message is a 400 in an empty TwiML, read before anything else: nothing is asked of the database, with one or without", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist();
  const whole = w.form(w.customer());
  for (const [body, why] of [
    ["", "no body at all"],
    [JSON.stringify(whole), "JSON, not a form"],
    [new URLSearchParams({ ...whole, MessageSid: "" }).toString(), "no MessageSid"],
    [new URLSearchParams({ ...whole, From: "" }).toString(), "no From"],
    [new URLSearchParams({ ...whole, To: "" }).toString(), "no To"],
  ]) {
    assert.deepEqual(await heard(await post(body, { "x-twilio-signature": "anything" })), twiml(400), why);
  }
  assert.equal(db.seen.length, 0, "not one row read");

  setPg(null);
  assert.deepEqual(await heard(await post("")), twiml(400), "the form answers before the database is asked for");
  assert.deepEqual([seen.ingested, w.left().calls], [[], []], "no receptionist ran and nothing left");
});

test("no database: a well-formed text is a 503 in an empty TwiML, and nothing is handled", async () => {
  const w = world();
  setPg(null);
  const seen = receptionist();
  assert.deepEqual(await heard(await text(w.form(w.customer()), w.TOKEN)), twiml(503));
  assert.deepEqual([seen.runtimes, seen.ingested, seen.sent], [[], [], []]);
  assert.deepEqual(w.left().calls, [], "and nothing left the process");
});

test("a signature that does not hold is a 403 that pages nobody, and only the URL Twilio called, every field and the line's own token open the door", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist();
  const fields = w.form(w.customer());
  await listening(async (log) => {
    for (const [knock, why] of [
      [() => text(fields, null), "no signature at all"],
      [() => text(fields, "another-subaccounts-token"), "another subaccount's token"],
      [() => text(fields, MASTER.token), "the platform's own master token: a line is proven by its own"],
      [
        () => text(fields, w.TOKEN, { signedUrl: `${DOOR}?attempt=2` }),
        "signed for another URL: Twilio signs the one it called",
      ],
      [
        async () =>
          post(new URLSearchParams({ ...fields, Body: "Are you open Sunday?" }).toString(), {
            "x-twilio-signature": await twilioSignature(w.TOKEN, DOOR, fields),
          }),
        "a field changed after signing",
      ],
    ]) {
      assert.deepEqual(await heard(await knock()), twiml(403), why);
    }
    assert.deepEqual(
      log.said("sms_bad_signature").map((l) => l.stream),
      ["warn", "warn", "warn", "warn", "warn"],
      "a warning each: this is what a probe of a public URL looks like",
    );
    assert.deepEqual(w.left().mail, [], "and nobody is paged for one");
    assert.deepEqual([seen.runtimes, seen.ingested], [[], []]);
    assert.ok(!db.seen.some((q) => q.table === "tenant_channels"), "nothing is routed for a text that is not proven");

    // The same fields, signed the way Twilio signs them: the refusals above were the signature's doing.
    assert.deepEqual(await heard(await text(fields, w.TOKEN)), twiml(200));
    assert.deepEqual(
      seen.ingested.map((x) => x.tenantId),
      [w.T],
    );
  });
});

test("every other refusal is heard as its own status in an empty TwiML, said at its own level, and told to the platform naming the number, once a window", async () => {
  for (const c of [
    {
      why: "a line whose token is not in the vault",
      status: 503,
      level: "error",
      log: "sms_line_without_account",
      alert: "the line has no subaccount or no token in the vault",
      arrange: (w) => {
        w.vault[w.line.id] = {};
      },
    },
    {
      why: "a line that could not be read",
      status: 503,
      level: "error",
      log: "sms_line_unreadable",
      alert: "the line or its token could not be read",
      faults: { "lines.select": { message: "connection reset" } },
    },
    {
      why: "an sms channel row switched off: an answer, so Twilio stops asking",
      status: 200,
      level: "error",
      log: "sms_unroutable",
      alert: "the sms channel row is missing or not active",
      arrange: (w) => {
        w.channel.status = "disabled";
      },
    },
    {
      why: "an sms channel row that could not be read: ours to retry",
      status: 503,
      level: "error",
      log: "sms_routing_lookup_failed",
      alert: "the sms channel row could not be read",
      faults: { "tenant_channels.select": { message: "canceling statement due to statement timeout" } },
    },
  ]) {
    const w = world();
    c.arrange?.(w);
    w.open(c.faults);
    const seen = receptionist();
    const from = w.customer();
    const fields = w.form(from);
    await listening(async (log) => {
      assert.deepEqual(await heard(await text(fields, w.TOKEN)), twiml(c.status), c.why);
      assert.deepEqual(
        log.said(c.log).map((l) => [l.stream, l.sid, l.from_tail, l.to_tail]),
        [[c.level, fields.MessageSid, from.slice(-4), w.LINE.slice(-4)]],
        `${c.why}: said at ${c.level}, with tails`,
      );

      const mail = w.left().mail;
      assert.equal(mail.length, 1, `${c.why}: the platform is told`);
      assert.equal(mail[0].subject, "A text arrived on a line the platform could not handle");
      assert.deepEqual([mail[0].from, mail[0].to], [MAIL.LEAD_FROM, [MAIL.LEAD_TO]], "the platform's own mailbox");
      assert.ok(
        mail[0].text.startsWith(`1 text(s) just arrived for ${w.LINE} and could not be handled. Reason: ${c.alert}.`),
        mail[0].text,
      );
      assert.ok(
        !mail[0].text.includes(from.slice(2)) && !mail[0].text.includes(SAID),
        "the line's number and a reason: never who wrote, or what they said",
      );

      // Another text inside the window: heard the same, and the platform is not told again.
      assert.deepEqual(await heard(await text(w.form(w.customer()), w.TOKEN)), twiml(c.status), `${c.why}, again`);
      assert.equal(w.left().mail.length, 1, `${c.why}: one note a window`);
      assert.deepEqual(
        [seen.runtimes, seen.ingested, w.left().texts],
        [[], [], []],
        "no receptionist ran, and nothing was answered",
      );
    });
  }
});

test("a number no line carries is a 404, told to the platform once for the whole class, because the number is whatever the caller wrote", async () => {
  const a = world();
  a.tables.lines.length = 0;
  a.open();
  const seen = receptionist();
  await listening(async (log) => {
    assert.deepEqual(await heard(await text(a.form(a.customer()), a.TOKEN)), twiml(404));
    const mail = a.left().mail;
    assert.equal(mail.length, 1);
    assert.ok(
      mail[0].text.startsWith(
        `1 text(s) just arrived for ${a.LINE} and could not be handled. Reason: no line row carries this number.`,
      ),
      `the note names the number: ${mail[0].text}`,
    );

    // A POST loop that writes a different To each time is the same alert, already sent.
    const b = world();
    b.tables.lines.length = 0;
    b.open();
    assert.deepEqual(await heard(await text(b.form(b.customer()), b.TOKEN)), twiml(404));
    assert.equal(a.left().mail.length, 1, "one note for the class, not one per number");
    assert.deepEqual(
      log.said("sms_unknown_line").map((l) => [l.stream, l.to_tail]),
      [
        ["warn", a.LINE.slice(-4)],
        ["warn", b.LINE.slice(-4)],
      ],
      "and each is still said",
    );
    assert.deepEqual([seen.ingested, a.left().texts], [[], []]);
  });
});

/* ---------------------------------------------------- the accepted text */

test("a text on a line the carriers have not approved reaches the receptionist held: kept on the workspace's sms channel, handed to a person for the carriers, the owner told it is a text, nothing answered", async () => {
  const w = world();
  w.line.sms_state = "registering";
  w.open();
  const seen = receptionist();
  const from = w.customer();
  const fields = w.form(from);
  await listening(async (log) => {
    assert.deepEqual(
      await heard(await text(fields, w.TOKEN)),
      twiml(200),
      "acknowledged: the text is kept, so Twilio need not send it again",
    );

    assert.deepEqual(
      seen.runtimes,
      [
        {
          channelId: w.channel.id,
          tenantId: w.T,
          kind: "sms",
          externalId: w.LINE,
          numberE164: w.LINE,
          credentialsRef: null,
          config: {},
        },
      ],
      "the workspace's runtime, for the sms channel its number routes to",
    );
    assert.deepEqual(
      seen.ingested,
      [{ tenantId: w.T, channel: "sms", body: SAID }],
      "kept under that workspace, as a text",
    );
    assert.deepEqual(
      seen.escalations,
      [{ reason: SMS_HELD_REASON, details: SMS_HELD_DETAILS }],
      "held for a person, with the hold's own reason",
    );
    assert.deepEqual(
      seen.alerts.map((a) => [a.thread, a.reason, a.channel]),
      [[from.slice(1), "carriers", "sms"]],
      "and the owner is told a TEXT is waiting",
    );
    assert.deepEqual([seen.sent, w.left().texts], [[], []], "nothing answered, and nothing left on the line");
    assert.equal(seen.processed, 1);

    const [line] = log.said("sms_inbound");
    assert.deepEqual([line.stream, line.held, line.opt, line.media], ["log", true, null, 0]);
    assert.deepEqual(
      [line.sid, line.from_tail, line.to_tail],
      [fields.MessageSid, from.slice(-4), w.LINE.slice(-4)],
      "a sid and two tails",
    );
    assert.ok(!JSON.stringify(line).includes(from.slice(2)), "never the number");
  });
});

test("a text on an approved line is answered on that line: the subaccount's own token from the vault, the line's Messaging Service, the customer in E.164, the footer on a first reply", async () => {
  const w = world();
  w.open();
  const seen = receptionist();
  const from = w.customer();
  await listening(async (log) => {
    assert.deepEqual(
      await heard(await text(w.form(from), w.TOKEN)),
      twiml(200),
      "Twilio hears nothing from here: the answer goes out as its own message",
    );

    assert.deepEqual(
      w.left().texts,
      [
        {
          url: `${TWILIO}/Accounts/${w.SUB}/Messages.json`,
          authorization: `Basic ${Buffer.from(`${w.SUB}:${w.TOKEN}`).toString("base64")}`,
          form: {
            MessagingServiceSid: w.SERVICE,
            To: from,
            Body: `${GREETING}\n${SMS_FOOTER}`,
            StatusCallback: "https://chanlytics-messaging.vercel.app/api/sms-status",
          },
        },
      ],
      "one text, on this workspace's own line and account, never the platform's master",
    );
    assert.deepEqual(
      seen.sent.map((s) => [s.tenantId, s.channel, s.to]),
      [[w.T, "sms", from.slice(1)]],
      "the answer went through the workspace's sms wire",
    );
    assert.deepEqual(
      seen.escalations.map((e) => e.reason),
      ["brain_error"],
      "and with no model it is the greeting, handed to a person as everywhere else",
    );
    assert.equal(log.said("sms_inbound")[0].held, false);
    assert.deepEqual(w.left().mail, [], "nobody is paged for a text that was answered");
  });
});

test("Twilio's 21610 on a text we send is the person's STOP: the line's sender says so, the door records it and refuses, nobody is paged, and Twilio is not asked about that person again", async () => {
  // The carrier's no on the way out, through the real sender the door makes
  // from the line and the vault, and the real send door over a database in
  // memory: the person replied STOP to the number before we heard (the STOP
  // went to the carrier, or came before the line's webhook pointed here).
  // Until now this was a failed send like any other -- said as a failure,
  // the owner told a delivery failed, nothing recorded -- and the next text to
  // that person did it all again.
  const w = world();
  const from = w.customer();
  optedOutAtCarrier.add(from);
  const k = { id: `k-${w.i}`, tenant_id: w.T, consent: "opted_in", dnc: false, marketing_consent: "unknown" };
  // The thread's person IS the contacts row (one object): what the door writes is what its next read sees.
  const conv = { id: `conv-${w.i}`, tenant_id: w.T, contact_id: k.id, paused_until: null, contacts: k };
  Object.assign(w.tables, { contacts: [k], conversations: [{ ...conv, tenants: { status: "active" } }], events: [] });
  const db = w.open();
  const sender = smsSenderFor(w.line, { sid: w.SUB, token: w.TOKEN });
  const ports = { db, wire: { sms: (to, body) => sender.send(to, body.body) } };
  const send = (body) =>
    deliver(ports, {
      tenantId: w.T,
      conversationId: conv.id,
      contactId: k.id,
      to: from,
      channel: "sms",
      sender: "ai",
      purpose: "conversational",
      proactive: false,
      body,
    });
  await listening(async (log) => {
    assert.deepEqual(await send("We open at 9."), { outcome: "refused", reason: "opted_out", messageId: null });
    assert.deepEqual(
      w.left().texts.map((t) => [t.url, t.form.To]),
      [[`${TWILIO}/Accounts/${w.SUB}/Messages.json`, from]],
      "asked once, on the line's own account",
    );
    assert.deepEqual(
      [k.consent, k.dnc, k.consent_source],
      ["opted_out", true, "carrier"],
      "recorded as ingest_inbound records a STOP it heard, with the carrier as the source",
    );
    assert.deepEqual(
      w.tables.events.map((e) => [e.kind, e.subject_id, e.data]),
      [
        [
          "contact.consent_changed",
          k.id,
          { consent: "opted_out", previous: "opted_in", source: "carrier", channel: "sms" },
        ],
      ],
      "one ledger row",
    );
    assert.deepEqual(
      log.said("sms_send_refused").map((l) => [l.stream, l.tenant_id, l.line_id, l.to_tail, l.code]),
      [["log", w.T, w.line.id, from.slice(-4), 21610]],
      "said as the person's refusal, with tails",
    );
    assert.deepEqual(log.said("sms_send_failed"), [], "never as a failure of ours");
    assert.deepEqual(w.left().mail, [], "nobody is paged");

    // The next text to that person, whoever writes it: refused before Twilio is asked.
    assert.deepEqual(await send("Still there?"), { outcome: "refused", reason: "opted_out", messageId: null });
    assert.equal(w.left().texts.length, 1, "Twilio is not asked again about a person who opted out");
    assert.equal(w.tables.events.length, 1, "and the ledger keeps its one row");
  });
});

test("a text that is an address and nothing else is kept on the person before anything is answered; two addresses, or someone else's, are not", async () => {
  const w = world();
  w.open();
  const seen = receptionist();
  const from = w.customer();
  await listening(async () => {
    assert.deepEqual(await heard(await text(w.form(from, { Body: "Ana.Ruiz@Example.com" }), w.TOKEN)), twiml(200));
    assert.deepEqual(seen.emails, ["ana.ruiz@example.com"], "kept in its stored spelling");
    assert.deepEqual(
      await heard(await text(w.form(from, { Body: "ana@example.com or bob@example.com" }), w.TOKEN)),
      twiml(200),
    );
    assert.deepEqual(seen.emails, ["ana.ruiz@example.com"], "two addresses: nothing kept");
  });
});

test("a text is never gated by the pilot allowlist or answered as the environment's own number: the door says the line is not the environment's", async () => {
  const w = world();
  w.open();
  // The environment's tester list, and a customer who is not on it. The list
  // gates the environment's own WhatsApp number and nothing else: a text taken
  // for that number would be recorded, skipped and never answered. The flag
  // beside it -- that routing failed -- speaks only for the environment's own
  // number too (reply-posture.ts), so this is what both of them decide.
  const seen = receptionist({ allowlist: "+19175550100" });
  await listening(async () => {
    assert.deepEqual(await heard(await text(w.form(w.customer()), w.TOKEN)), twiml(200));
    assert.equal(seen.allowlistSkips, 0, "no allowlist skip is recorded for a text");
    assert.equal(w.left().texts.length, 1, "and the customer is answered");
    assert.deepEqual(
      seen.whatsappWires,
      [null],
      "the environment's WhatsApp pair is set, and is not this message's wire",
    );
    assert.ok(
      seen.alerts.length > 0 && seen.alerts.every((a) => a.envDefault === false),
      "and the owner's note is not addressed as the environment's own workspace",
    );
  });
});

/* ------------------------------------------------------ after a throw */

test("after the receptionist throws, only a text the database did not keep is refused: 503 and the platform told; anything later is acknowledged, said, and pages nobody", async () => {
  const w = world();
  w.open();
  const refused = receptionist({
    ingest: () => {
      throw new IngestFailed("connection reset by peer");
    },
  });
  await listening(async (log) => {
    assert.deepEqual(
      await heard(await text(w.form(w.customer()), w.TOKEN)),
      twiml(503),
      "refused, so Twilio's own log carries it",
    );
    const mail = w.left().mail;
    assert.equal(mail.length, 1);
    assert.equal(mail[0].subject, "A text arrived on a line the platform could not handle");
    assert.ok(
      mail[0].text.startsWith(
        `1 text(s) just arrived for ${w.LINE} and could not be handled. Reason: the text could not be recorded.`,
      ),
      mail[0].text,
    );
    assert.deepEqual(
      refused.alerts.map((a) => [a.reason, a.channel]),
      [["message not recorded", "sms"]],
      "and a copy of the words went to the workspace",
    );
    assert.deepEqual(w.left().texts, [], "nothing is said to a customer whose words were not kept");
    assert.deepEqual(
      log.said("sms_inbound_failed").map((l) => [l.stream, l.error]),
      [["error", "connection reset by peer"]],
    );
  });

  // The words were kept and answered; the handoff after the answer threw. A
  // redelivery would only answer the same text twice.
  const v = world();
  v.open();
  receptionist({
    escalate: () => {
      throw new TypeError("cannot read properties of undefined (reading 'id')");
    },
  });
  await listening(async (log) => {
    assert.deepEqual(
      await heard(await text(v.form(v.customer()), v.TOKEN)),
      twiml(200),
      "acknowledged, so Twilio does not ask again",
    );
    assert.equal(v.left().texts.length, 1, "the customer was answered once");
    assert.deepEqual(v.left().mail, [], "and nobody is paged");
    assert.deepEqual(
      log.said("sms_inbound_failed").map((l) => [l.stream, l.error]),
      [["error", "cannot read properties of undefined (reading 'id')"]],
      "but it is said",
    );
  });
});
