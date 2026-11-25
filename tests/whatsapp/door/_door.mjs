/**
 * The world the tests of door/ share. Split by behaviour from whatsapp-door.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The WhatsApp webhook, run: a delivery signed the way Meta signs it, over a
 * database in memory, with the receptionist's world handed in through
 * lib/inbound/ports.ts and the mail transport answered by a captured fetch.
 * Until 14 Sep 2026 this handler's text was pinned by six reads in five files
 * and no test had ever called its POST.
 *
 * The door: no app secret is a 401, a signature over anything but the bytes
 * Meta sent is a 401, and neither reads a row; the handshake echoes the
 * challenge for the verify token and for nothing else. Past it, the number
 * decides: a number the database routes runs that workspace's receptionist on
 * that workspace's wire; a number the database answers is not ours is
 * dead-lettered under the platform and the platform is told, once a window; a
 * number the database could not answer for is NOT acknowledged: there is no
 * fallback profile. The
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
import { after } from "node:test";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { fieldsOf } from "../../_log-lines.mjs";

// The door reads its secret and its token at the knock. Each test file is its
// own process, so this is the whole environment, set before the handler is
// imported below. The platform's mailbox is set only inside the cases that
// listen for mail.
process.env.META_APP_SECRET = "meta-app-secret-for-this-file";

process.env.WHATSAPP_VERIFY_TOKEN = "verify-token-for-this-file";

for (const k of [
  "RESEND_API_KEY",
  "LEAD_TO",
  "LEAD_FROM",
  "ANTHROPIC_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  delete process.env[k];

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { setPg, pg } = await import(at("apps/edge/lib/shared/pg.ts"));

export const { setInboundPorts, realPorts } = await import(at("apps/edge/lib/inbound/ports.ts"));

export const { IngestFailed } = await import(at("apps/edge/lib/inbound/persist.ts"));

export const hook = await import(at("apps/edge/api/whatsapp.ts"));

export const later = await import(at("apps/edge/lib/intake/answer-job.ts"));

after(() => {
  setPg(null);
  setInboundPorts(null);
});

export const PLATFORM = "00000000-0000-0000-0000-000000000000";

export const DOOR = "http://edge/api/whatsapp";

export const GREETING = "Thanks for writing to Harbor Nails. A person will be with you shortly.";

export const NOTIFICATIONS = () => ({
  escalation_emails: ["owner@riverside.example"],
  from: "Riverside Studio <hello@platform.test>",
});

export const BRAIN = () => ({
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

export const MAIL = {
  RESEND_API_KEY: "re_test_only",
  LEAD_TO: "ops@platform.test",
  LEAD_FROM: "Pager <pager@platform.test>",
};

/* ------------------------------------------------------------- the knock */

/** Meta's header: `sha256=` and an HMAC-SHA256 of the raw bytes under the app secret. */
export const sign = (raw, secret = process.env.META_APP_SECRET) =>
  "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");

/**
 * What Vercel hands a method export beside the request: its runtime wraps each
 * one with @edge-runtime/node-utils, which calls `webHandler(request, new
 * FetchEvent(request))`, and Vercel's FetchEvent carries `waitUntil`. Every
 * knock below carries one, so every case also runs the door the way
 * production calls it (ports.ts says why that decided where the seam went).
 */
export const event = () => ({ waitUntil: () => {} });

export const knock = (raw, headers = { "x-hub-signature-256": sign(raw) }) =>
  hook.POST(
    new Request(DOOR, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw }),
    event(),
  );

export const deliver = (body) => knock(JSON.stringify(body));

export const handshake = (params) => hook.GET(new Request(`${DOOR}?${new URLSearchParams(params)}`), event());

export const answer = async (res) => [res.status, await res.json()];

/** Set (or with undefined, unset) variables for one call, and put them back. */
export async function withEnv(patch, fn) {
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
export function wire() {
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
export async function listening(fn) {
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

export let seq = 0;

export const now = () => String(Math.floor(Date.now() / 1000));

export const text = (from, id, body) => ({ from, id, timestamp: now(), type: "text", text: { body } });

export const kind = (tables, k) => tables.events.filter((e) => e.kind === k);

/**
 * One workspace with one WhatsApp number, every identifier its own (see the
 * header). `open(faults, rpcs)` hands the door a database over these tables, with the
 * functions a case needs beside the two every case has.
 */
export function world() {
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
    jobs: [],
  };
  let people = 0;
  let costRefused = false;
  return {
    i,
    T,
    PHONE_ID,
    WABA,
    LINE,
    tables,
    /** A phone number id no workspace holds. */
    stranger: String(106540000500000 + i),
    /** The cost door (00319) refuses from now on, as a database ahead of its migration, or one that is down, does. */
    refuseCost: () => {
      costRefused = true;
    },
    open: (faults = {}, rpcs = {}) => {
      const db = fakeDb(tables, faults, {
        ...rpcs,
        runtime_stamp: () => `stamp-${i}`,
        message_keep_cost: ({ p_tenant_id, p_external_id, p_pricing }) => {
          if (costRefused) throw new Error("function message_keep_cost does not exist");
          const row = tables.messages.find((m) => m.tenant_id === p_tenant_id && m.external_id === p_external_id);
          if (!row || row.meta?.pricing) return false;
          row.meta = { ...(row.meta ?? {}), pricing: p_pricing };
          return true;
        },
      });
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

export const blank = () => ({ history: [], pausedUntil: 0, replies: [], textedBefore: false });

/**
 * The receptionist's world, handed in through setInboundPorts and recording
 * what crosses it: the shape inbound/phases/ runs handleInbound
 * over, whose model throws so no model is ever reached. Its database is the
 * door's own, through pg(), exactly as realPorts() hands it over; its memory
 * -- Postgres, the only one -- is readable, so what the reply posture decides
 * is what reaches the sink.
 * `ingest(n)` runs inside the ingest, so a case can make one message's throw.
 */
export function receptionist({ ingest = () => {} } = {}) {
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
              message_id: `m-${n.externalId}`,
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
    env: { modelKey: undefined },
  });
  return seen;
}

/**
 * The tick's half: every answer job the door wrote, taken up as the ledger takes it (lib/intake/answer-job.ts), in the
 * order written, once. The door answers nobody: a message is recorded and its job answers it (decision 0031, Phase 3).
 */
export async function runAnswers(w, db) {
  for (const job of w.tables.jobs.filter((j) => j.kind === "inbound_answer" && j.state !== "done")) {
    await later.answerInboundJob(db, {
      id: job.id,
      tenant_id: job.tenant_id,
      kind: job.kind,
      payload: job.payload,
      attempts: 1,
    });
    job.state = "done";
  }
}

/* ------------------------------------- a partner's notice names the account it is about */

/**
 * A partner's notice as Meta delivers it (webhooks reference, account_update): addressed to the PARTNER's business portfolio
 * (`entry.id`), with the customer's WhatsApp account in `value.waba_info`. On 6 October twelve of them arrived addressed so, and
 * every one was dropped as unroutable. The partner's portfolio and the customer's business are made up, and each case's own.
 */
export const PORTFOLIO = (w) => String(307650000000000 + w.i);

export const partnerNotice = (w, event, waba, entryId = PORTFOLIO(w)) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: entryId,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: "account_update",
          value: {
            event,
            waba_info: {
              waba_id: waba,
              owner_business_id: String(407650000000000 + w.i),
              partner_app_id: "108340000000001",
            },
          },
        },
      ],
    },
  ],
});

/* ------------------------------------- Meta's decision on the display name */

/** What Meta delivers when it decides a display name (webhooks reference, phone_number_name_update): entry.id is the WABA. */
export const nameNotice = (w, decision, over = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: w.WABA,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: "phone_number_name_update",
          value: {
            display_phone_number: w.LINE.slice(1),
            decision,
            requested_verified_name: "Harbor Moving",
            rejection_reason: null,
            ...over,
          },
        },
      ],
    },
  ],
});

/** What the edge kept about the number at its last read: its display name in review, the business not verified. */
export const HELD = {
  can_send: "LIMITED",
  problems: [],
  notes: [],
  name: "Harbor Nails",
  name_status: "PENDING_REVIEW",
  verification: "not_verified",
  limit: "TIER_250",
  has_payment_method: true,
  owner_business_id: "410540000000001",
  waba_id: "205540000000001",
};

/** The keeping door as the database answers it for this workspace's channel: the whole standing and its moment onto the config. */
export function keeper(w) {
  const kept = [];
  return {
    kept,
    rpcs: {
      channel_keep_standing: ({ p_tenant_id, p_channel_id, p_standing }) => {
        kept.push({ p_tenant_id, p_channel_id, p_standing });
        const row = w.tables.tenant_channels.find((c) => c.id === p_channel_id && c.tenant_id === p_tenant_id);
        if (!row) return "gone";
        const was = row.config.standing?.can_send;
        row.config = { ...row.config, standing: p_standing, standing_read_at: new Date().toISOString() };
        return was === undefined ? "first" : was === p_standing.can_send ? "same" : "changed";
      },
    },
  };
}

/** A workspace whose number was read: its standing and a rating on the config, and its owner's mailbox. */
export function readWorld() {
  const w = world();
  w.tables.tenant_channels[0].config = {
    quality_rating: "GREEN",
    standing: HELD,
    standing_read_at: "2026-10-06T08:00:00.000Z",
  };
  w.tables.tenant_config.push({
    tenant_id: w.T,
    config: { notifications: { escalation_emails: ["owner@harbor.test"] } },
  });
  return w;
}

/* ---------------------------- a failure Meta reports later raises its hand ---------------------------- */

/** One reply of ours Meta accepted, and the receipt that says it then failed. */
export function accepted(w, over = {}) {
  const wamid = `wamid.${w.i}.late`;
  const row = {
    id: `late-${w.i}`,
    tenant_id: w.T,
    conversation_id: `cv-${w.i}`,
    contact_id: null,
    direction: "outbound",
    sender: "human",
    channel: "whatsapp",
    external_id: wamid,
    status: "sent",
    error: null,
    meta: {},
    ...over,
  };
  w.tables.messages.push(row);
  const errors = [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message" }];
  const failed = (status = "failed") =>
    w.change({ statuses: [{ id: wamid, status, timestamp: now(), recipient_id: w.customer(), errors }] });
  return { row, wamid, errors, failed };
}

export const holds = (w) => (w.tables.escalations ?? []).filter((e) => e.state !== "resolved");

/** The events that tell the owner of a hold: owner_notice rings the bell from them, after the commit (decision 0043). */
export const told = (w) =>
  (w.tables.events ?? []).filter((e) => e.kind === "escalation.opened" || e.kind === "escalation.changed");

/* ------------------------- a receipt or an echo the database did not keep comes again ------------------------- */

/** One owner's reply from the Business app, as Meta echoes it on this workspace's number. */
export const echoed = (w, to, id, body = "On my way.") =>
  w.change(
    { message_echoes: [{ from: w.LINE.slice(1), to, id, timestamp: now(), type: "text", text: { body } }] },
    { field: "smb_message_echoes" },
  );

/* ------------------------------------------------- what a kept WhatsApp Business app shares (decision 0073, R21) */

/** The key the intake ledger keeps a delivery under: the body's digest (shared/keep-event.ts digestId). */
export const digestOf = (raw) => "sha256:" + crypto.createHash("sha256").update(raw).digest("hex");
