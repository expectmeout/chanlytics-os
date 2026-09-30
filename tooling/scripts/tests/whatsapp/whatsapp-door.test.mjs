/**
 * The WhatsApp webhook, run: a delivery signed the way Meta signs it, over a
 * database in memory, with the receptionist's world handed in through
 * lib/whatsapp/ports.ts and the mail transport answered by a captured fetch.
 * Until 14 Sep 2026 this handler's text was pinned by six reads in five files
 * and no test had ever called its POST.
 *
 * The door: no app secret is a 401, a signature over anything but the bytes
 * Meta sent is a 401, and neither reads a row; the handshake echoes the
 * challenge for the verify token and for nothing else. Past it, the number
 * decides: a number the database routes runs that workspace's receptionist on
 * that workspace's wire; a number the database answers is not ours is
 * dead-lettered under the platform and the platform is told, once a window; a
 * number the database could not answer for is NOT acknowledged, the
 * environment's own number included: there is no fallback profile. The
 * account's news is routed by its WABA and never by a number. Receipts land
 * on the routed workspace's rows and nowhere else. An owner's reply from the
 * Business app pauses the receptionist for the workspace's own hours. And a
 * batch is acknowledged only when every message in it was recorded.
 *
 * EVERY CASE OWNS ITS IDENTIFIERS. The channel resolver keeps a routing answer
 * in module state (five minutes; a miss for one), the unroutable note stays
 * quiet for fifteen minutes per number, and the tenant runtime is cached per
 * workspace: a case sharing any of them with another would read the first
 * one's answer and pass while proving nothing.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { pauseMsOf } from "@chanlytics/contracts";
import { fieldsOf } from "../_log-lines.mjs";

/** The environment's own pilot line: the one number whose credentials come from the environment. */
const ENV_PHONE_ID = "109990000000001";

// The door reads its secret and its token at the knock. Each test file is its
// own process, so this is the whole environment, set before the handler is
// imported below. The platform's mailbox is set only inside the cases that
// listen for mail.
process.env.META_APP_SECRET = "meta-app-secret-for-this-file";
process.env.WHATSAPP_VERIFY_TOKEN = "verify-token-for-this-file";
process.env.WHATSAPP_PHONE_ID = ENV_PHONE_ID;
for (const k of [
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
  "ANTHROPIC_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_TEST_ALLOWLIST",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg, pg } = await import(at("apps/edge/lib/pg.ts"));
const { setInboundPorts } = await import(at("apps/edge/lib/whatsapp/ports.ts"));
const { IngestFailed } = await import(at("apps/edge/lib/whatsapp/persist.ts"));
const hook = await import(at("apps/edge/api/whatsapp.ts"));
after(() => {
  setPg(null);
  setInboundPorts(null);
});

const PLATFORM = "00000000-0000-0000-0000-000000000000";
const DOOR = "http://edge/api/whatsapp";
const GREETING = "Thanks for writing to Harbor Nails. A person will be with you shortly.";
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
const MAIL = { RESEND_API_KEY: "re_test_only", LEAD_TO: "ops@platform.test", LEAD_FROM: "Pager <pager@platform.test>" };

/* ------------------------------------------------------------- the knock */

/** Meta's header: `sha256=` and an HMAC-SHA256 of the raw bytes under the app secret. */
const sign = (raw, secret = process.env.META_APP_SECRET) =>
  "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");

/**
 * What Vercel hands a method export beside the request: its runtime wraps each
 * one with @edge-runtime/node-utils, which calls `webHandler(request, new
 * FetchEvent(request))`, and Vercel's FetchEvent carries `waitUntil`. Every
 * knock below carries one, so every case also runs the door the way
 * production calls it (ports.ts says why that decided where the seam went).
 */
const event = () => ({ waitUntil: () => {} });
const knock = (raw, headers = { "x-hub-signature-256": sign(raw) }) =>
  hook.POST(
    new Request(DOOR, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw }),
    event(),
  );
const deliver = (body) => knock(JSON.stringify(body));
const handshake = (params) => hook.GET(new Request(`${DOOR}?${new URLSearchParams(params)}`), event());
const answer = async (res) => [res.status, await res.json()];

/** Set (or with undefined, unset) variables for one call, and put them back. */
async function withEnv(patch, fn) {
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Every request that leaves, captured and answered 200: what Resend answers a delivered mail with. */
function wire() {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  return {
    calls,
    /** What Resend was asked to send, in order: { from, to, subject, text }. */
    mail: () => calls.filter((c) => c.url.includes("api.resend.com")).map((c) => JSON.parse(c.init.body)),
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

/** What the handler says on its console while `fn` runs: the only place a skipped batch or a failed message shows. */
async function listening(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  // The logger writes ONE JSON object per line, so the event and the fields
  // are read back out of it; a line that is not an envelope keeps its text.
  for (const stream of ["log", "warn", "error"])
    console[stream] = (...args) => {
      const raw = String(args[0]);
      let envelope = null;
      try {
        const o = JSON.parse(raw);
        if (o && typeof o === "object" && typeof o.event === "string") envelope = o;
      } catch {
        /* not an envelope */
      }
      const fields = envelope ? fieldsOf(envelope) : {};
      lines.push({ stream, event: envelope ? envelope.event : raw, args, fields });
    };
  try {
    return await fn({ lines, said: (name) => lines.filter((l) => l.event === name) });
  } finally {
    Object.assign(console, real);
  }
}

/* ------------------------------------------------------------- the world */

let seq = 0;
const now = () => String(Math.floor(Date.now() / 1000));
const text = (from, id, body) => ({ from, id, timestamp: now(), type: "text", text: { body } });
const kind = (tables, k) => tables.events.filter((e) => e.kind === k);

/**
 * One workspace with one WhatsApp number, every identifier its own (see the
 * header). `open(faults)` hands the door a database over these tables.
 */
function world() {
  const i = ++seq;
  const T = `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const PHONE_ID = String(106540000000000 + i);
  const WABA = String(207650000000000 + i);
  const LINE = `+1305555${2000 + i}`;
  const tables = {
    tenants: [{ id: T, name: "Harbor Nails", timezone: "America/New_York", status: "active" }],
    tenant_channels: [
      {
        id: `ch-${i}`,
        tenant_id: T,
        kind: "whatsapp",
        external_id: PHONE_ID,
        waba_id: WABA,
        status: "active",
        number_e164: LINE,
        credentials_ref: null,
        config: {},
      },
    ],
    tenant_config: [],
    policies: [],
    google_listings: [],
    contacts: [],
    conversations: [],
    messages: [],
    events: [],
    notifications: [],
  };
  let people = 0;
  return {
    i,
    T,
    PHONE_ID,
    WABA,
    LINE,
    tables,
    /** A phone number id no workspace holds. */
    stranger: String(106540000500000 + i),
    open: (faults = {}) => {
      const db = fakeDb(tables, faults, { runtime_stamp: () => `stamp-${i}` });
      setPg(db);
      return db;
    },
    /** A customer nobody else in this file writes as, in Meta's bare digits. */
    customer: () => `1646555${String(i * 100 + ++people).padStart(4, "0")}`,
    /** One change as Meta delivers it: on this workspace's number unless another is named. */
    change: (value, { field = "messages", phoneId = PHONE_ID } = {}) => ({
      object: "whatsapp_business_account",
      entry: [
        {
          id: WABA,
          changes: [
            {
              field,
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: LINE.slice(1), phone_number_id: phoneId },
                ...value,
              },
            },
          ],
        },
      ],
    }),
  };
}

const blank = () => ({ history: [], pausedUntil: 0, replies: [], repliedBefore: false });

/**
 * The receptionist's world, handed in through setInboundPorts and recording
 * what crosses it: the shape inbound-executed.test.mjs runs handleInbound
 * over, whose model throws so no model is ever reached. Its database is the
 * door's own, through pg(), exactly as realPorts() hands it over; its memory
 * -- Postgres, the only one -- is readable, so what the reply posture decides
 * is what reaches the sink.
 * `ingest(n)` runs inside the ingest, so a case can make one message's throw.
 */
function receptionist({ ingest = () => {} } = {}) {
  const seen = { runtimes: [], wires: [], ingested: [], sent: [], alerts: [], emails: [] };
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
        waCreds: { accessToken: `token-${routed.tenantId}`, phoneId: routed.externalId },
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
      ingest: async (_db, tenantId, n) => {
        seen.ingested.push({ tenantId, body: n.body });
        ingest(n);
        // Null without a workspace, as pgIngest answers: there is nobody to record it for.
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
      sink: (_db, tenantId) => ({
        on: true,
        deliver: async (to, body, meta) => {
          seen.sent.push({ tenantId, to, body, meta: meta ?? null });
          return { outcome: "sent", messageId: "m-out", externalId: "wamid.out" };
        },
        processed: async () => {},
        allowlistSkip: async () => {},
        unreachableSender: async () => {},
        noteEmail: async (address) => {
          seen.emails.push(address);
        },
        vetoFallback: async () => {},
        pause: async () => {},
        usage: async () => {},
        escalate: async () => "opened",
        media: async () => null,
      }),
      queueReply: async () => false,
    },
    alertStaff: async (thread, _said, _answered, reason) => {
      seen.alerts.push({ thread, reason });
    },
    page: async () => "sent",
    sender: (cfg) => {
      seen.wires.push(cfg);
      return async () => ({ ok: true, wamid: "wamid.never", status: 200 });
    },
    brain: async () => {
      throw new Error("the model must not be reached in this test");
    },
    env: { allowlist: "", modelKey: undefined },
  });
  return seen;
}

/* -------------------------------------------------------------- the door */

test("the door: no app secret and a wrong signature are each a 401 that reads nothing, and only the bytes Meta signed open it", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist();
  const raw = JSON.stringify(
    w.change({ messages: [text(w.customer(), `wamid.${w.i}.door`, "hi, do you take walk-ins?")] }),
  );
  await listening(async (log) => {
    // A missing secret is a configuration error, never a check skipped: even
    // the right signature is refused while the door has nothing to check it with.
    for (const secret of [undefined, ""]) {
      await withEnv({ META_APP_SECRET: secret }, async () => {
        const res = await knock(raw, { "x-hub-signature-256": sign(raw, "meta-app-secret-for-this-file") });
        assert.deepEqual(
          await answer(res),
          [401, { ok: false, error: "bad_signature" }],
          `META_APP_SECRET ${JSON.stringify(secret)}`,
        );
      });
    }
    assert.equal(log.said("wa_missing_app_secret").length, 2, "and it says so where an operator looks");

    const reserialised = JSON.stringify(JSON.parse(raw), null, 2);
    for (const [headers, why] of [
      [{}, "no signature at all"],
      [{ "x-hub-signature-256": sign(raw, "another-apps-secret") }, "another app's secret"],
      [{ "x-hub-signature-256": sign(reserialised) }, "the same JSON serialised again: Meta signs the bytes it sent"],
      [{ "x-hub-signature-256": sign(raw).slice("sha256=".length) }, "the digest without its prefix"],
      [{ "x-hub-signature-256": `sha256=${"0".repeat(64)}` }, "a guess of the right length"],
    ]) {
      assert.deepEqual(await answer(await knock(raw, headers)), [401, { ok: false, error: "bad_signature" }], why);
    }
    assert.equal(db.seen.length, 0, "not one row read before the signature holds");
    assert.deepEqual([seen.ingested, seen.sent], [[], []], "and nobody's receptionist ran");

    // A signed body that is not JSON carries nothing to route: acknowledged, and nothing read.
    assert.deepEqual(await answer(await knock("{ not json")), [200, { ok: true }]);
    assert.equal(db.seen.length, 0);

    // The same bytes, signed with the secret, open it: the refusals above were the signature's doing.
    assert.deepEqual(await answer(await knock(raw)), [200, { ok: true }]);
    assert.equal(seen.sent.length, 1);
  });
});

test("the handshake: the verify token echoes Meta's challenge, and anything else is a 403", async () => {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  const ok = await handshake({ "hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": "1158201444" });
  assert.deepEqual([ok.status, await ok.text()], [200, "1158201444"]);
  for (const [params, why] of [
    [{ "hub.mode": "subscribe", "hub.verify_token": "not-the-token", "hub.challenge": "1" }, "the wrong token"],
    [{ "hub.mode": "unsubscribe", "hub.verify_token": token, "hub.challenge": "1" }, "not a subscription"],
    [{ "hub.verify_token": token, "hub.challenge": "1" }, "no mode"],
    [{ "hub.mode": "subscribe", "hub.challenge": "1" }, "no token"],
  ]) {
    const res = await handshake(params);
    assert.deepEqual([res.status, await res.text()], [403, "verification failed"], why);
  }
  // With no token configured, a knock that sends none matches nothing either.
  await withEnv({ WHATSAPP_VERIFY_TOKEN: undefined }, async () => {
    const res = await handshake({ "hub.mode": "subscribe", "hub.challenge": "1" });
    assert.equal(res.status, 403);
  });
});

/* ----------------------------------------------------------- the routing */

test("a routed number runs its own workspace's receptionist: the channel the database named, the workspace's record, the workspace's wire", async () => {
  const w = world();
  const db = w.open();
  const seen = receptionist();
  const from = w.customer();
  const id = `wamid.${w.i}.routed`;
  await listening(async (log) => {
    const res = await deliver(
      w.change({
        contacts: [{ wa_id: from, profile: { name: "Dana" } }],
        messages: [text(from, id, "hi, do you have time tomorrow?")],
      }),
    );
    assert.deepEqual(await answer(res), [200, { ok: true }]);

    assert.deepEqual(
      db.seen.filter((q) => q.table === "tenant_channels").map((q) => q.filters),
      [
        [
          ["eq", "kind", "whatsapp"],
          ["eq", "external_id", w.PHONE_ID],
        ],
      ],
      "one read, by the provider's id for this number",
    );
    assert.deepEqual(
      seen.runtimes,
      [
        {
          channelId: `ch-${w.i}`,
          tenantId: w.T,
          kind: "whatsapp",
          externalId: w.PHONE_ID,
          numberE164: w.LINE,
          credentialsRef: null,
          config: {},
        },
      ],
      "the runtime is loaded for the channel the database named",
    );
    assert.deepEqual(
      seen.ingested,
      [{ tenantId: w.T, body: "hi, do you have time tomorrow?" }],
      "recorded under the workspace the number belongs to",
    );
    assert.deepEqual(
      seen.wires,
      [{ phoneId: w.PHONE_ID, accessToken: `token-${w.T}` }],
      "the wire is bound to that workspace's own number and token",
    );
    assert.deepEqual(
      seen.sent,
      [{ tenantId: w.T, to: from, body: GREETING, meta: { ack: true, fallback: "no_model" } }],
      "and that workspace's greeting left for the customer who wrote",
    );
    assert.equal(kind(w.tables, "ingest.unroutable").length, 0);

    const [line] = log.said("wa_inbound");
    assert.deepEqual(line.fields, { from_tail: from.slice(-4), type: "text", id }, "a tail, a type and an id");
    assert.ok(!line.args.join(" ").includes(from), "never the number");
  });
});

test("an image captioned with an address keeps nothing, and the same words typed keep it: a caption is not an answer", async () => {
  const w = world();
  w.open();
  const seen = receptionist();
  const from = w.customer();
  const words = "my email is ana@example.com";
  await listening(async () => {
    const captioned = await deliver(
      w.change({
        contacts: [{ wa_id: from, profile: { name: "Dana" } }],
        messages: [
          {
            from,
            id: `wamid.${w.i}.captioned`,
            timestamp: now(),
            type: "image",
            image: { id: `media-${w.i}`, mime_type: "image/jpeg", caption: words },
          },
        ],
      }),
    );
    assert.deepEqual(await answer(captioned), [200, { ok: true }]);
    assert.deepEqual(seen.emails, [], "a caption is not an answer");

    const typed = await deliver(
      w.change({
        contacts: [{ wa_id: from, profile: { name: "Dana" } }],
        messages: [text(from, `wamid.${w.i}.typed`, words)],
      }),
    );
    assert.deepEqual(await answer(typed), [200, { ok: true }]);
    assert.deepEqual(seen.emails, ["ana@example.com"], "the same words typed are the customer's own");
  });
});

test("a number the database answers is not ours: dead-lettered under the platform, the platform told once a window, 200, and no receptionist runs", async () => {
  const w = world();
  w.tables.tenant_channels[0].status = "disabled";
  w.open();
  const seen = receptionist();
  const line = wire();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        const off = await deliver(
          w.change({
            messages: [
              text(w.customer(), `wamid.${w.i}.off1`, "hello?"),
              text(w.customer(), `wamid.${w.i}.off2`, "anyone there?"),
            ],
          }),
        );
        assert.deepEqual(
          await answer(off),
          [200, { ok: true }],
          "a switched-off channel is a decision; Meta retrying it would change nothing",
        );
        const never = await deliver(
          w.change({ messages: [text(w.customer(), `wamid.${w.i}.never`, "hi")] }, { phoneId: w.stranger }),
        );
        assert.deepEqual(await answer(never), [200, { ok: true }], "and so is a number no row names");

        assert.deepEqual(
          kind(w.tables, "ingest.unroutable").map((e) => [
            e.tenant_id,
            e.category,
            e.subject_type,
            e.subject_id,
            e.data,
          ]),
          [
            [PLATFORM, "ingest", null, null, { channel: "whatsapp", phone_number_id: w.PHONE_ID }],
            [PLATFORM, "ingest", null, null, { channel: "whatsapp", phone_number_id: w.stranger }],
          ],
          "kept where a count can find it, under nobody's workspace",
        );

        const mail = line.mail();
        assert.equal(mail.length, 2, "one note per number");
        for (const [m, key, count] of [
          [mail[0], w.PHONE_ID, 2],
          [mail[1], w.stranger, 1],
        ]) {
          assert.equal(m.subject, "WhatsApp messages are arriving for a channel that is switched off");
          assert.deepEqual([m.from, m.to], [MAIL.LEAD_FROM, [MAIL.LEAD_TO]], "the platform's own mailbox");
          assert.ok(m.text.startsWith(`${count} message(s) just arrived for phone_number_id ${key},`), m.text);
        }
        assert.ok(
          !mail.some((m) => /hello\?|anyone there|1646555/.test(m.text)),
          "a count and an id: no customer and no words",
        );

        assert.deepEqual(
          [seen.runtimes, seen.ingested, seen.sent],
          [[], [], []],
          "nobody's receptionist ran and nothing was recorded for a workspace",
        );
        assert.equal(w.tables.notifications.length, 0, "there is no workspace whose bell could ring");
        assert.deepEqual(
          log.said("wa_skip_unroutable").map((l) => l.fields),
          [
            { phone_number_id: w.PHONE_ID, messages: 2 },
            { phone_number_id: w.stranger, messages: 1 },
          ],
        );

        // More traffic inside the window: kept again, and nobody is mailed again.
        assert.equal(
          (await deliver(w.change({ messages: [text(w.customer(), `wamid.${w.i}.off3`, "hello??")] }))).status,
          200,
        );
        assert.equal(kind(w.tables, "ingest.unroutable").length, 3, "every delivery is kept");
        assert.equal(line.mail().length, 2, "but the note is not repeated inside fifteen minutes");
      }),
    );
  } finally {
    line.restore();
  }
});

test("a number the database could not answer for is not acknowledged: 503 with the count, the platform told the control plane is unreadable, nothing handled, and Meta's redelivery lands once the read works", async () => {
  const w = world();
  w.open({ "tenant_channels.select": { message: "connection terminated unexpectedly" } });
  const seen = receptionist();
  const line = wire();
  const body = w.change({
    messages: [
      text(w.customer(), `wamid.${w.i}.blip1`, "hi"),
      text(w.customer(), `wamid.${w.i}.blip2`, "are you open?"),
    ],
  });
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        assert.deepEqual(
          await answer(await deliver(body)),
          [503, { ok: false, unrecorded: 2 }],
          "not acknowledged, so Meta redelivers",
        );
        const mail = line.mail();
        assert.equal(mail.length, 1);
        assert.equal(mail[0].subject, "WhatsApp messages are arriving and the control plane cannot be read");
        assert.ok(
          mail[0].text.startsWith(
            `2 message(s) just arrived for phone_number_id ${w.PHONE_ID} and the channel row could not be read`,
          ),
          mail[0].text,
        );
        assert.deepEqual([seen.runtimes, seen.ingested, seen.sent], [[], [], []], "nothing recorded and nothing said");
        assert.equal(
          kind(w.tables, "ingest.unroutable").length,
          0,
          "a blip is not a decision: nothing is dead-lettered",
        );
        assert.deepEqual(
          log.said("wa_routing_lookup_failed").map((l) => l.fields.phone_number_id),
          [w.PHONE_ID],
        );
        assert.deepEqual(
          log.said("wa_skip_routing_failed").map((l) => l.fields),
          [{ phone_number_id: w.PHONE_ID, messages: 2 }],
        );

        // The redelivery, with the database well. A failed lookup is never
        // cached, so the same batch routes, and both messages are handled.
        w.open();
        assert.deepEqual(await answer(await deliver(body)), [200, { ok: true }]);
        assert.deepEqual(
          seen.ingested.map((x) => x.tenantId),
          [w.T, w.T],
        );
        assert.equal(seen.sent.length, 2);
        assert.equal(line.mail().length, 1, "and the platform is not told again");
      }),
    );
  } finally {
    line.restore();
  }
});

test("the same failure on the environment's own number is no exception: not acknowledged, nothing said, the platform told", async () => {
  // There used to be a baked copy of one workspace's profile that this number
  // answered from while the database was unreadable. That copy is gone, and
  // the pilot waits for the read like every other workspace.
  const w = world();
  w.open({ "tenant_channels.select": { message: "connection terminated unexpectedly" } });
  const seen = receptionist();
  const line = wire();
  const from = w.customer();
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        const res = await deliver(
          w.change(
            { messages: [text(from, `wamid.${w.i}.env`, "hi, are you open today?")] },
            { phoneId: ENV_PHONE_ID },
          ),
        );
        assert.deepEqual(
          await answer(res),
          [503, { ok: false, unrecorded: 1 }],
          "not acknowledged, so Meta redelivers once the read works",
        );
        assert.deepEqual(
          [seen.runtimes, seen.ingested, seen.sent],
          [[], [], []],
          "nothing recorded and nothing said in anyone's voice",
        );
        assert.equal(
          kind(w.tables, "ingest.unroutable").length,
          0,
          "a blip is not a decision: nothing is dead-lettered",
        );
        assert.deepEqual(
          log.said("wa_routing_lookup_failed").map((l) => l.fields.phone_number_id),
          [ENV_PHONE_ID],
        );
        assert.deepEqual(
          log.said("wa_skip_routing_failed").map((l) => l.fields),
          [{ phone_number_id: ENV_PHONE_ID, messages: 1 }],
        );
        const mail = line.mail();
        assert.equal(mail.length, 1, "the platform is told the control plane cannot be read");
        assert.equal(mail[0].subject, "WhatsApp messages are arriving and the control plane cannot be read");
      }),
    );
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------------- the account's news */

test("the account's own news is routed by its WABA and never by a number: kept as the workspace's event, remembered on the channel, the owner's bell and mailbox told", async () => {
  const w = world();
  const OWNER = "owner@harbor.test";
  w.tables.tenant_config.push({ tenant_id: w.T, config: { notifications: { escalation_emails: [OWNER] } } });
  const db = w.open();
  const seen = receptionist();
  const line = wire();
  // Meta's account fields carry no number. This one is given the workspace's
  // routable number on purpose: were the account's branch below the routing by
  // number, that number would be looked up, and the reads below would show it.
  const quality = {
    display_phone_number: w.LINE.slice(1),
    event: "FLAGGED",
    current_limit: "TIER_1K",
    metadata: { phone_number_id: w.PHONE_ID },
  };
  const news = (entryId) => ({
    object: "whatsapp_business_account",
    entry: [
      { ...(entryId ? { id: entryId } : {}), changes: [{ field: "phone_number_quality_update", value: quality }] },
    ],
  });
  const byNumber = () =>
    db.seen.filter((q) => q.table === "tenant_channels" && q.filters.some(([, col]) => col === "external_id"));
  try {
    await withEnv(MAIL, () =>
      listening(async (log) => {
        assert.deepEqual(await answer(await deliver(news(w.WABA))), [200, { ok: true }]);

        const channelReads = db.seen.filter((q) => q.table === "tenant_channels" && q.op === "select");
        assert.deepEqual(
          channelReads[0].filters,
          [
            ["eq", "kind", "whatsapp"],
            ["eq", "waba_id", w.WABA],
            ["eq", "status", "active"],
          ],
          "routed by the account",
        );
        assert.deepEqual(byNumber(), [], "and no number was routed");
        assert.deepEqual(seen.runtimes, [], "no receptionist runs for the account's news");

        assert.deepEqual(
          kind(w.tables, "channel.phone_number_quality_update").map((e) => [
            e.tenant_id,
            e.category,
            e.subject_type,
            e.subject_id,
            e.data,
          ]),
          [[w.T, "system", "channel", `ch-${w.i}`, { waba_id: w.WABA, ...quality }]],
        );
        const cfg = w.tables.tenant_channels[0].config;
        assert.deepEqual(
          [cfg.messaging_limit, cfg.quality_event],
          ["TIER_1K", "FLAGGED"],
          "the channel row keeps the newest rating for Settings",
        );
        assert.ok(!Number.isNaN(Date.parse(cfg.quality_at)));

        assert.deepEqual(
          w.tables.notifications.map((n) => [n.tenant_id, n.kind, n.route, n.title]),
          [[w.T, "number", "admin/integrations", "WhatsApp quality rating flagged"]],
          "the workspace's bell",
        );
        const mail = line.mail();
        assert.equal(mail.length, 1);
        assert.deepEqual(
          [mail[0].to, mail[0].subject],
          [[OWNER], "WhatsApp quality rating flagged"],
          "and the workspace's own mailbox",
        );
        assert.ok(mail[0].text.includes(`Your WhatsApp number ${w.LINE} has been flagged`), mail[0].text);
        assert.deepEqual(
          log.said("wa_waba_event").map((l) => l.fields),
          [{ field: "phone_number_quality_update", waba_id: w.WABA, outcome: "alerted" }],
        );

        // No entry id: there is nothing to route the news by, so not one row is read.
        const before = db.seen.length;
        assert.deepEqual(await answer(await deliver(news(null))), [200, { ok: true }]);
        assert.equal(db.seen.length, before);
        // A WABA no workspace holds: looked up, not found, kept nowhere.
        assert.deepEqual(await answer(await deliver(news(`${w.WABA}0`))), [200, { ok: true }]);
        assert.deepEqual(
          log
            .said("wa_waba_event")
            .slice(1)
            .map((l) => l.fields),
          [
            { field: "phone_number_quality_update", waba_id: null, outcome: "unrouted" },
            { field: "phone_number_quality_update", waba_id: `${w.WABA}0`, outcome: "unrouted" },
          ],
        );
        assert.equal(kind(w.tables, "channel.phone_number_quality_update").length, 1);
        assert.equal(line.mail().length, 1);
        assert.deepEqual(byNumber(), [], "and still no number was routed");
      }),
    );
  } finally {
    line.restore();
  }
});

/* ------------------------------------------------- statuses and echoes */

test("receipts land on the routed workspace's own messages by external id, a failure with what Meta said, and a status the ledger does not keep lands nowhere", async () => {
  const w = world();
  const OTHER = "bbbbbbbb-0000-4000-8000-000000000001";
  const to = w.customer();
  const wamid = (k) => `wamid.${w.i}.out.${k}`;
  w.tables.messages.push(
    { id: "queued", tenant_id: w.T, external_id: wamid(1), status: "queued" },
    { id: "sent", tenant_id: w.T, external_id: wamid(2), status: "sent" },
    { id: "delivered", tenant_id: w.T, external_id: wamid(3), status: "delivered" },
    { id: "failing", tenant_id: w.T, external_id: wamid(4), status: "sent" },
    { id: "read", tenant_id: w.T, external_id: wamid(5), status: "read" },
    { id: "theirs", tenant_id: OTHER, external_id: wamid(1), status: "queued" },
  );
  const db = w.open();
  receptionist();
  const errors = [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message" }];
  const receipt = (k, status, over = {}) => ({ id: wamid(k), status, timestamp: now(), recipient_id: to, ...over });
  const res = await deliver(
    w.change({
      statuses: [
        receipt(1, "sent"),
        receipt(2, "delivered"),
        receipt(3, "read"),
        receipt(4, "failed", { errors }),
        receipt(5, "deleted"),
      ],
    }),
  );
  assert.deepEqual(await answer(res), [200, { ok: true }]);

  const row = (id) => w.tables.messages.find((m) => m.id === id);
  assert.deepEqual(
    ["queued", "sent", "delivered", "failing", "read"].map((id) => row(id).status),
    ["sent", "delivered", "read", "failed", "read"],
  );
  assert.deepEqual(row("failing").error, { errors }, "a failure keeps what Meta said about it");
  assert.ok(!("error" in row("sent")), "and a receipt without errors writes none");
  assert.equal(row("theirs").status, "queued", "another workspace's message under the same id is untouched");
  const writes = () => db.seen.filter((q) => q.table === "messages" && q.op === "update");
  assert.equal(writes().length, 4, "the deleted receipt is not written");
  assert.ok(
    writes().every((q) => q.filters.some(([op, col, v]) => op === "eq" && col === "tenant_id" && v === w.T)),
    "and every write names the routed workspace",
  );

  // The same receipt on a number no workspace holds: kept as a dead letter, and not one row written.
  const lost = await deliver(w.change({ statuses: [receipt(1, "read")] }, { phoneId: w.stranger }));
  assert.deepEqual(await answer(lost), [200, { ok: true }]);
  assert.equal(row("queued").status, "sent");
  assert.equal(writes().length, 4);
  assert.deepEqual(
    kind(w.tables, "ingest.unroutable").map((e) => e.data),
    [{ channel: "whatsapp", phone_number_id: w.stranger }],
  );
});

test("an owner's reply from the Business app pauses the receptionist for the workspace's own hours: recorded as a person's words, the conversation handed over, no thread touched", async () => {
  const w = world();
  w.tables.policies.push({
    id: `pol-${w.i}`,
    tenant_id: w.T,
    class: "reply",
    mode: "auto",
    subject_type: null,
    subject_id: null,
    limits: { pause_hours: 6 },
  });
  const db = w.open();
  receptionist();
  const to = w.customer();
  const echo = {
    from: w.LINE.slice(1),
    to,
    id: `wamid.${w.i}.echo`,
    timestamp: now(),
    type: "text",
    text: { body: "Hi Dana, this is Marisa. I'll call you in five minutes." },
  };
  await listening(async (log) => {
    const t0 = Date.now();
    const res = await deliver(w.change({ message_echoes: [echo] }, { field: "smb_message_echoes" }));
    const t1 = Date.now();
    assert.deepEqual(await answer(res), [200, { ok: true }]);

    assert.ok(
      db.seen.some(
        (q) =>
          q.table === "policies" && q.filters.some(([op, col, v]) => op === "eq" && col === "tenant_id" && v === w.T),
      ),
      "the hours are the workspace's own policy, read from the control plane",
    );
    assert.equal(w.tables.contacts.length, 1);
    const [contact] = w.tables.contacts;
    assert.deepEqual([contact.tenant_id, contact.phone_e164], [w.T, `+${to}`]);
    assert.equal(w.tables.conversations.length, 1);
    const [conversation] = w.tables.conversations;
    assert.deepEqual(
      [conversation.tenant_id, conversation.contact_id, conversation.state],
      [w.T, contact.id, "needs_human"],
    );
    const until = Date.parse(conversation.paused_until);
    assert.ok(
      until >= t0 + 6 * 3600_000 && until <= t1 + 6 * 3600_000,
      `paused for the six hours Settings shows, not a day: ${conversation.paused_until}`,
    );

    assert.equal(w.tables.messages.length, 1);
    const { id: _id, created_at: _at, ...kept } = w.tables.messages[0];
    assert.deepEqual(
      kept,
      {
        tenant_id: w.T,
        conversation_id: conversation.id,
        contact_id: contact.id,
        channel: "whatsapp",
        direction: "outbound",
        sender: "human",
        type: "text",
        body: echo.text.body,
        external_id: echo.id,
        status: "sent",
        meta: { echo: true },
      },
      "the owner's words, kept as a person's",
    );

    assert.deepEqual(
      log.said("echo_pause_not_persisted"),
      [],
      "with the store retired nothing tries to mirror the pause into a thread",
    );
    assert.deepEqual([log.said("echo_handling_error"), log.said("pg_echo_failed")], [[], []]);
    const [paused] = log.said("wa_paused_by_echo");
    assert.deepEqual([paused.fields.to_tail], [to.slice(-4)], "said with a tail, never the number");
  });
});

test("a workspace that never chose its hours pauses for the default day, and an echo on a number no workspace holds is recorded for nobody", async () => {
  const w = world();
  w.open();
  receptionist();
  const t0 = Date.now();
  const res = await deliver(
    w.change(
      {
        message_echoes: [
          {
            from: w.LINE.slice(1),
            to: w.customer(),
            id: `wamid.${w.i}.echo1`,
            type: "text",
            text: { body: "On my way." },
          },
        ],
      },
      { field: "smb_message_echoes" },
    ),
  );
  const t1 = Date.now();
  assert.deepEqual(await answer(res), [200, { ok: true }]);
  assert.equal(w.tables.conversations.length, 1);
  const until = Date.parse(w.tables.conversations[0].paused_until);
  const day = pauseMsOf(null);
  assert.ok(until >= t0 + day && until <= t1 + day, `the default: ${w.tables.conversations[0].paused_until}`);

  const lost = await deliver(
    w.change(
      {
        message_echoes: [
          { from: w.LINE.slice(1), to: w.customer(), id: `wamid.${w.i}.echo2`, type: "text", text: { body: "Hello?" } },
        ],
      },
      { field: "smb_message_echoes", phoneId: w.stranger },
    ),
  );
  assert.deepEqual(await answer(lost), [200, { ok: true }]);
  assert.deepEqual(
    [w.tables.contacts.length, w.tables.conversations.length, w.tables.messages.length],
    [1, 1, 1],
    "no contact, conversation or message for a number no workspace holds",
  );
});

/* ------------------------------------------------------------ the ack rule */

test("the ack rule: a message the database refused is not acknowledged, 503 with the count, while the rest of the batch is still handled; any other failure is logged and the batch keeps its 200", async () => {
  const w = world();
  w.open();
  const seen = receptionist({
    ingest: (n) => {
      if (n.body === "the refused one") throw new IngestFailed("connection reset by peer");
    },
  });
  const refused = w.customer();
  const kept = w.customer();
  await listening(async (log) => {
    const res = await deliver(
      w.change({
        messages: [
          text(refused, `wamid.${w.i}.refused`, "the refused one"),
          text(kept, `wamid.${w.i}.kept`, "the kept one"),
        ],
      }),
    );
    assert.deepEqual(await answer(res), [503, { ok: false, unrecorded: 1 }]);
    assert.deepEqual(
      seen.ingested.map((x) => x.body),
      ["the refused one", "the kept one"],
      "the message after the failure was still handled",
    );
    assert.deepEqual(
      seen.sent.map((s) => s.to),
      [kept],
      "and the customer whose words were kept was answered",
    );
    assert.deepEqual(
      seen.alerts.filter((a) => a.reason === "message not recorded").map((a) => a.thread),
      [refused],
      "a copy of the refused words went to the workspace",
    );
    assert.deepEqual(
      log.said("wa_inbound_failed").map((l) => [l.fields.id, l.fields.error]),
      [[`wamid.${w.i}.refused`, "IngestFailed: connection reset by peer"]],
    );
  });

  const v = world();
  v.open();
  const seen2 = receptionist({
    ingest: (n) => {
      if (n.body === "the broken one") throw new TypeError("cannot read properties of undefined");
    },
  });
  const broken = v.customer();
  const fine = v.customer();
  await listening(async (log) => {
    const res = await deliver(
      v.change({
        messages: [
          text(broken, `wamid.${v.i}.broken`, "the broken one"),
          text(fine, `wamid.${v.i}.fine`, "the fine one"),
        ],
      }),
    );
    assert.deepEqual(
      await answer(res),
      [200, { ok: true }],
      "a failure that is not the database's refusal is acknowledged",
    );
    assert.deepEqual(
      seen2.ingested.map((x) => x.body),
      ["the broken one", "the fine one"],
    );
    assert.deepEqual(
      seen2.sent.map((s) => s.to),
      [fine],
    );
    assert.deepEqual(
      seen2.alerts.filter((a) => a.reason === "message not recorded"),
      [],
      "and nobody is told a message went unrecorded",
    );
    assert.deepEqual(
      log.said("wa_inbound_failed").map((l) => [l.fields.id, l.fields.error]),
      [[`wamid.${v.i}.broken`, "TypeError: cannot read properties of undefined"]],
      "but it is said",
    );
  });
});
