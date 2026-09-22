/**
 * The voice webhook's harness -- the knock, the wire and the world -- for the
 * file that RUNS apps/edge/api/retell-webhook.ts: retell-webhook-door.
 *
 * It was shared by two files, because the receptionist's memory was a Vercel
 * Blob store whose flag was read once per process, and the handler's note to
 * the caller's thread had to be proved under both settings. The store is gone
 * and the call_summary row IS the note, so there is one environment now.
 *
 * ORDER STILL MATTERS. Set process.env first, then `await openDoor()`: it
 * imports the handler, which reads its keys at import, so the environment at
 * that moment is the one the whole file runs under.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const PLATFORM = "00000000-0000-0000-0000-000000000000";
export const DOOR = "http://edge/api/retell-webhook";
/** The receptionist's line, and the person calling it. */
export const LINE = "+13055550100";
export const CALLER = "+16465550123";
export const NOW = Date.now();
export const iso = (ms) => new Date(ms).toISOString();

/* ------------------------------------------------------------- the knock */

export const hmac = (body, key, ms) =>
  crypto
    .createHmac("sha256", key)
    .update(body + String(ms))
    .digest("hex");
/** Retell's header: `v=<ms>,d=<hex>` over rawBody + ms, keyed by the badged key. */
export const sign = (body, { key = process.env.RETELL_WEBHOOK_KEY, ms = Date.now() } = {}) =>
  `v=${ms},d=${hmac(body, key, ms)}`;

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

/* -------------------------------------------------------------- the wire */

/**
 * Every request the handler makes, captured and answered: the recording CDN
 * with a few bytes of audio, and Resend and Retell's live-call API with 200.
 *
 * Each captured call also carries `budgetMs`: how long the signal it rode
 * was given. Every bounded fetch in this codebase is bounded the same way,
 * `AbortSignal.timeout(ms)`, and the signal itself never says how long -- so
 * the static is wrapped for the wire's lifetime and each signal remembers its
 * budget. That is what lets a test tell the webhook's six seconds from the
 * sweep's twenty.
 */
export function wire() {
  const calls = [];
  const real = globalThis.fetch;
  const realTimeout = AbortSignal.timeout;
  const budgets = new WeakMap();
  AbortSignal.timeout = (ms) => {
    const s = realTimeout.call(AbortSignal, ms);
    budgets.set(s, ms);
    return s;
  };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init, budgetMs: init?.signal ? (budgets.get(init.signal) ?? null) : null });
    if (u.includes("cdn.retell.test"))
      return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "content-type": "audio/wav" } });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const to = (part) => calls.filter((c) => c.url.includes(part));
  return {
    calls,
    to,
    /** What Resend was asked to send, in order. */
    mail: () => to("api.resend.com").map((c) => JSON.parse(c.init.body)),
    restore: () => {
      globalThis.fetch = real;
      AbortSignal.timeout = realTimeout;
    },
  };
}

/* ------------------------------------------------------------- the world */

/** Retell's lifecycle ranks; the upsert is forward-only on them. */
const RANK = { registered: 0, ongoing: 1 };
const rank = (s) => RANK[s] ?? 2;

/**
 * ingest_call, over the tables: the caller becomes a contact with a
 * conversation, the call converges on ONE row per (tenant, retell_call_id),
 * an event ranked below the row's status is declined and reported as
 * `skipped`, and the answer carries the recording state the row already
 * holds. The metering and the `call.recorded` event the real function also
 * writes are not modelled: nothing here reads them.
 */
function ingestCallRpc(tables) {
  return (a) => {
    let contact = null;
    let conversation = null;
    if (a.p_from_e164) {
      contact = tables.contacts.find((c) => c.tenant_id === a.p_tenant_id && c.phone_e164 === a.p_from_e164);
      if (!contact) {
        contact = { id: crypto.randomUUID(), tenant_id: a.p_tenant_id, phone_e164: a.p_from_e164 };
        tables.contacts.push(contact);
      }
      conversation = tables.conversations.find((c) => c.tenant_id === a.p_tenant_id && c.contact_id === contact.id);
      if (!conversation) {
        conversation = {
          id: crypto.randomUUID(),
          tenant_id: a.p_tenant_id,
          contact_id: contact.id,
          state: "open",
          paused_until: null,
        };
        tables.conversations.push(conversation);
      }
    }
    const prior = tables.calls.find((c) => c.tenant_id === a.p_tenant_id && c.retell_call_id === a.p_retell_call_id);
    const rec = prior?.recording ?? null;
    const known = {
      recording_state: rec?.fetch_state ?? null,
      recording_attempts: rec?.attempts ?? null,
      contact_id: contact?.id ?? prior?.contact_id ?? null,
      conversation_id: conversation?.id ?? prior?.conversation_id ?? null,
    };
    if (prior && rank(a.p_status) < rank(prior.status))
      return { call_id: prior.id, is_new: false, skipped: true, ...known };
    const row = prior ?? {
      id: crypto.randomUUID(),
      tenant_id: a.p_tenant_id,
      retell_call_id: a.p_retell_call_id,
      notified_at: null,
      message_id: null,
      recording: null,
    };
    Object.assign(row, {
      agent_id: a.p_agent_id ?? row.agent_id ?? null,
      status: a.p_status,
      direction: a.p_direction,
      from_e164: a.p_from_e164,
      to_e164: a.p_to_e164,
      started_at: a.p_started_at,
      ended_at: a.p_ended_at,
      duration_ms: a.p_duration_ms ?? row.duration_ms ?? null,
      summary: a.p_summary ?? row.summary ?? null,
      transcript_object: a.p_transcript_obj ?? row.transcript_object ?? null,
      analysis: a.p_analysis ?? row.analysis ?? null,
      contact_id: known.contact_id,
      conversation_id: known.conversation_id,
      recording: row.recording ?? a.p_recording ?? null,
    });
    if (!prior) tables.calls.push(row);
    return { call_id: row.id, is_new: !prior, skipped: false, ...known };
  };
}

let seq = 0;

export const kind = (tables, k) => tables.events.filter((e) => e.kind === k);
export const ingests = (db) => db.seen.filter((q) => q.rpc === "ingest_call");
/** What Postgres says to a second insert under a unique index. */
export const DUPLICATE = (index) => ({
  message: `duplicate key value violates unique constraint "${index}"`,
  code: "23505",
});

/**
 * Import the handler under the environment the caller has set, and hand back
 * the helpers that need it: the knock (which calls its POST) and the world
 * (which hands the database to `setPg`).
 */
export async function openDoor() {
  const { setPg } = await import(at("apps/edge/lib/pg.ts"));
  const hook = await import(at("apps/edge/api/retell-webhook.ts"));

  function knock(raw, { signature = null, key = undefined } = {}) {
    const url = key === undefined ? DOOR : `${DOOR}?key=${encodeURIComponent(key)}`;
    const headers = { "content-type": "application/json", ...(signature ? { "x-retell-signature": signature } : {}) };
    return hook.POST(new Request(url, { method: "POST", headers, body: raw }));
  }

  /** A delivery as Retell sends it: `{ event, call, ...top }`, signed over its raw bytes. */
  function deliver(event, call, top = {}) {
    const raw = JSON.stringify({ event, call, ...top });
    return knock(raw, { signature: sign(raw) });
  }

  /**
   * One world per case -- its own workspace, agent and calls -- because the
   * routing cache (five minutes) and the runtime cache (ten) live in module
   * state and are keyed on exactly these.
   */
  function world() {
    const i = ++seq;
    const T = `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const AGENT = `agent_${i}_${crypto.randomBytes(4).toString("hex")}`;
    const tables = {
      tenants: [{ id: T, name: "Harbor Moving", timezone: "America/New_York", status: "active" }],
      tenant_channels: [
        {
          id: `ch_${i}`,
          tenant_id: T,
          kind: "voice",
          external_id: AGENT,
          status: "active",
          number_e164: LINE,
          credentials_ref: null,
          config: {},
        },
      ],
      tenant_config: [],
      policies: [],
      google_listings: [],
      lines: [],
      calls: [],
      contacts: [],
      conversations: [],
      messages: [],
      escalations: [],
      events: [],
      notifications: [],
    };
    const uploads = [];
    /** The database for the next knock: the same tables, with faults and rpc overrides for this delivery. */
    const open = (faults = {}, rpcs = {}) => {
      const db = fakeDb(tables, faults, {
        ingest_call: ingestCallRpc(tables),
        runtime_stamp: () => `stamp-${i}`,
        get_channel_credentials: () => null,
        ...rpcs,
      });
      // The private bucket. The double models tables; the recording copy also
      // needs storage.from("media").upload, so the bucket is a list here.
      db.storage = {
        from: (bucket) => ({
          upload: async (p, bytes, opts) => {
            uploads.push({ bucket, path: p, bytes: bytes.byteLength, ...opts });
            return { data: { path: p }, error: null };
          },
        }),
      };
      setPg(db);
      return db;
    };
    return {
      T,
      AGENT,
      tables,
      uploads,
      open,
      callId: (tag) => `call_${i}_${tag}`,
      /** The provider's call object, as the live account shapes it. */
      call: (id, over = {}) => ({
        call_id: id,
        agent_id: AGENT,
        call_type: "phone_call",
        direction: "inbound",
        from_number: CALLER,
        to_number: LINE,
        ...over,
      }),
      /** A finished call with its analysis: two minutes, Rosa, a quote. */
      analysed: (id, over = {}) => ({
        call_id: id,
        agent_id: AGENT,
        call_type: "phone_call",
        direction: "inbound",
        from_number: CALLER,
        to_number: LINE,
        call_status: "ended",
        start_timestamp: NOW - 130_000,
        end_timestamp: NOW - 5_000,
        duration_ms: 125_000,
        disconnection_reason: "user_hangup",
        transcript: "Agent: Thank you for calling Harbor Moving!\nUser: I need a quote for a move on Tuesday.",
        transcript_object: [
          { role: "agent", content: "Thank you for calling Harbor Moving!" },
          { role: "user", content: "I need a quote for a move on Tuesday." },
        ],
        call_analysis: {
          call_summary: "Rosa asked for a moving quote for Tuesday.",
          user_sentiment: "Positive",
          call_successful: true,
          in_voicemail: false,
          custom_analysis_data: {
            caller_name: "Rosa",
            caller_wanted: "a quote for a move on Tuesday",
            outcome: "answered",
            follow_up: "",
          },
        },
        recording_url: `https://cdn.retell.test/recording/${id}.wav`,
        ...over,
      }),
    };
  }

  return { setPg, hook, knock, deliver, world };
}
