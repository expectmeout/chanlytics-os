/**
 * The world the tests of doors-b/ share. Split by behaviour from cron-doors-b.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Four sweeps that reach a provider, run: POST /api/cron/calls, /google,
 * /lines and /registrations over a database in memory and a captured wire to
 * Retell, Google, Twilio and the mail transport. Until 13 Sep 2026 these four
 * handlers' text was pinned by eight assertions in eight files and no POST of
 * theirs had ever been called.
 *
 * The door once, for all four: no database, a key Vault cannot give, a wrong
 * key. Then each sweep's consequence -- what it asked the provider, what it
 * wrote on the row, who it told:
 *
 *   calls          a call left 'ongoing' is asked about and the provider's word
 *                  is written; a pending recording copy is retried on the
 *                  sweep's budget with a fresh URL, three times, then left;
 *                  a provider that cannot answer leaves every row as it was
 *                  and counts nothing, a refused key does the same and is a
 *                  503 for the sweep's watcher;
 *                  recordings past their retention are removed, and a removal
 *                  that fails is a 500 once the other legs have run; a call
 *                  that ended -- or errored -- without an analysis gets its
 *                  line in the thread, once.
 *   google         listings not read for twenty hours, never-read first, each
 *                  workspace's handed a job; a read writes the listing, the day (by the workspace's
 *                  own clock), the reviews, and rings the bell; a connected
 *                  profile is synced as the owner with a token refreshed from
 *                  Vault; a refusal stays on its row.
 *   lines          a saga stuck past its deadline is taken and resumed by a
 *                  line_provision job, two a tick, and the platform hears once;
 *                  past three automatic tries the line is handed to a person.
 *   registrations  both waiting states, least recently asked first; the answer
 *                  written to the row, moved or not; a line with no credentials
 *                  written to so it cannot starve the queue; an approved brand's
 *                  campaign filed from this deployment's own pages.
 */
import { after } from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { emptyBusinessRecord, newReceptionistDefaults } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { resetBreakers } from "@chanlytics/channels/shared";

// Each test file is its own process, so this is the whole environment. Every
// variable is declared in apps/edge/.env.example except VERCEL_ENV, which the
// platform sets (deleted here, set in one lines case). The dry line provider
// (LINES_DRY_RUN) makes no network calls; the registration sweep needs the
// real one, and sets the master credentials per case. No workspace is the
// environment's own, and the only database is the one handed to setPg.
process.env.RETELL_API_KEY = "retell-key-for-this-file";

process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";

process.env.LINES_DRY_RUN = "1";

process.env.DASHBOARD_ORIGIN = "https://dash.test";

process.env.GOOGLE_PLACES_API_KEY = "places-key-for-this-file";

process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client-for-this-file";

process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret-for-this-file";

process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://dash.test/api/v1/google/callback";

process.env.RESEND_API_KEY = "re_test_only";

process.env.LEAD_TO = "ops@platform.test";

process.env.LEAD_FROM = "Pager <pager@platform.test>";

for (const k of [
  "VERCEL_ENV",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PRIMARY_PROFILE_SID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  delete process.env[k];

/* -------------------------------------------------------------- the wire */

/**
 * Every request any sweep makes, captured and answered by the case's `answer`.
 *
 * Installed BEFORE the handlers are imported, on purpose: lib/shared/google/places.ts binds
 * `const http = placesFetch()` at module scope, which captures `fetch` as it
 * is at that moment. A wire installed per test would never see a Places call.
 *
 * Each captured call carries `budgetMs`: how long the signal it rode was given.
 * Every bounded fetch in this codebase is `AbortSignal.timeout(ms)`, and the
 * signal itself never says how long, so the static is wrapped and each signal
 * remembers its budget -- which is how a test tells the sweep's twenty seconds
 * from the webhook's six.
 */
export const wire = { answer: null, calls: [] };

{
  const realFetch = globalThis.fetch;
  const realTimeout = AbortSignal.timeout;
  const budgets = new WeakMap();
  AbortSignal.timeout = (ms) => {
    const s = realTimeout.call(AbortSignal, ms);
    budgets.set(s, ms);
    return s;
  };
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? init.body : null,
      budgetMs: init?.signal ? (budgets.get(init.signal) ?? null) : null,
    };
    wire.calls.push(req);
    if (!wire.answer) throw new Error(`nothing on the wire answers ${req.method} ${req.url}`);
    const a = await wire.answer(req);
    if (a instanceof Response) return a;
    // A 204 carries no body, and Node's Response enforces it.
    const body = a.status === 204 ? null : typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? {});
    return new Response(body, {
      status: a.status ?? 200,
      headers: a.headers ?? { "content-type": "application/json" },
    });
  };
  after(() => {
    globalThis.fetch = realFetch;
    AbortSignal.timeout = realTimeout;
  });
}

/**
 * The wire for one case: `answer` decides, and what was asked is read back. Each case meets the providers afresh: a wait
 * an earlier case's answer named, or a breaker its faults opened, is the provider door's to keep (channels
 * provider-fetch), and no part of this one.
 */
export function wired(answer) {
  resetBreakers();
  wire.calls = [];
  wire.answer = answer;
  const to = (part) => wire.calls.filter((c) => c.url.includes(part));
  return {
    get calls() {
      return wire.calls;
    },
    to,
    /** What Resend was asked to send, in order. */
    mail: () => to("api.resend.com").map((c) => JSON.parse(c.body)),
  };
}

/** A wire nothing may reach. */
export const silent = (why = "this case must not reach a provider") =>
  wired((req) => {
    throw new Error(`${why}: ${req.method} ${req.url}`);
  });

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// Every module is imported before the first test: Node's runner runs a file's top-level `after` hooks once the tests
// registered so far are done, so an import awaited between two tests took the wire down under the rest (23 Nov 2026).
export const { setPg, pg } = await import(at("apps/edge/lib/shared/pg.ts"));

export const { googleReader } = await import(at("apps/edge/lib/google/sweep.ts"));

export const { SWEEP_COPY_TIMEOUT_MS, RECORDING_MAX_ATTEMPTS, RECORDING_DEFER_LIMIT_MS, copyRecording } = await import(
  at("apps/edge/lib/voice/call-recording.ts")
);

export const SWEEPS = {
  calls: await import(at("apps/edge/api/cron/calls.ts")),
  google: await import(at("apps/edge/api/cron/google.ts")),
  lines: await import(at("apps/edge/api/cron/lines.ts")),
  registrations: await import(at("apps/edge/api/cron/registrations.ts")),
};

after(() => setPg(null));

/* ------------------------------------------------------------- the knock */

export const KEY = "sweep-key-for-this-file";

export const knock = (sweep, key = KEY) =>
  SWEEPS[sweep].POST(
    new Request(`http://edge/api/cron/${sweep}`, { method: "POST", headers: key == null ? {} : { "x-cron-key": key } }),
  );

export const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
export async function withEnv(vars, fn) {
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

/* ------------------------------------------------------------- the world */

export const NOW = Date.now();

export const MIN = 60_000;

export const HOUR = 60 * MIN;

export const DAY = 24 * HOUR;

export const iso = (ms) => new Date(ms).toISOString();

export const ago = (ms) => iso(NOW - ms);

/** Every case its own workspace. */
export const tenant = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const uuid = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const tenantRow = (id, over = {}) => ({
  id,
  name: "Harbor Moving",
  slug: "harbor-moving",
  timezone: "America/New_York",
  status: "active",
  ...over,
});

/** YYYY-MM-DD as a clock in `tz` has it -- Intl's own reading, not the helper the code under test calls. */
export const dayIn = (tz, at) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/**
 * The database the sweep will find, with the bucket beside it. The double
 * models tables; the calls sweep also needs storage.from("media").remove and
 * .upload, so the bucket is two lists here.
 */
export function use(tables, rpcs = {}, faults = {}) {
  const db = fakeDb(tables, faults, { get_cron_sweep_key: () => KEY, ...rpcs });
  const bucket = { removed: [], uploads: [] };
  db.storage = {
    from: (name) => ({
      remove: async (paths) => {
        bucket.removed.push(...paths);
        return { data: paths.map((p) => ({ name: p })), error: null };
      },
      upload: async (p, bytes, opts) => {
        bucket.uploads.push({ bucket: name, path: p, bytes: bytes.byteLength, ...opts });
        return { data: { path: p }, error: null };
      },
    }),
  };
  db.bucket = bucket;
  setPg(db);
  return db;
}

export const rpcs = (db, name) => db.seen.filter((s) => s.rpc === name);

export const updatesOf = (db, table) => db.seen.filter((s) => s.table === table && s.op === "update");

/* ------------------------------------------------------------------ calls */

/** A row as the database holds it: the columns the sweep reads. */
export const callRow = (T, id, over = {}) => ({
  id,
  tenant_id: T,
  retell_call_id: `call_${id}`,
  agent_id: "agent_x",
  direction: "inbound",
  call_type: "phone_call",
  status: "ongoing",
  started_at: ago(12 * MIN),
  ended_at: null,
  updated_at: ago(10 * MIN),
  duration_ms: null,
  summary: null,
  in_voicemail: null,
  recording: null,
  conversation_id: null,
  contact_id: null,
  message_id: null,
  ...over,
});

/** The provider's call object, as the live account shapes it. */
export const retellCall = (id, over = {}) => ({
  call_id: `call_${id}`,
  agent_id: "agent_x",
  call_type: "phone_call",
  direction: "inbound",
  from_number: "+16465550123",
  to_number: "+13055550100",
  ...over,
});

/**
 * A wire on which the provider has analysed no call yet: the sweep asks after a call that ended unanalysed and whose
 * owner was never told (calls-sweep.ts, leg 4), and is told it has ended, nothing more. Anything else on the wire fails
 * the case.
 */
export const unanalysed = () =>
  wired((req) => {
    const m = /\/v2\/get-call\/call_(\w+)$/.exec(req.url);
    if (!m) throw new Error(`only the provider's read of a call is expected here: ${req.method} ${req.url}`);
    return { status: 200, body: retellCall(m[1], { call_status: "ended" }) };
  });

/**
 * ingest_call, as the double: the upsert writes what the provider reported
 * onto the row and answers the envelope the repository reads. The assertions
 * below are on the ARGUMENTS the sweep handed it -- that is the boundary --
 * and on the rows only where the sweep itself wrote them.
 */
export function ingestRpc(tables) {
  return (a) => {
    const row = tables.calls.find((c) => c.tenant_id === a.p_tenant_id && c.retell_call_id === a.p_retell_call_id);
    if (row)
      Object.assign(row, {
        status: a.p_status,
        ended_at: a.p_ended_at,
        duration_ms: a.p_duration_ms,
        summary: a.p_summary,
        updated_at: iso(NOW),
      });
    return {
      call_id: row?.id ?? uuid(999),
      is_new: !row,
      recording_state: row?.recording?.fetch_state ?? null,
      contact_id: null,
      conversation_id: row?.conversation_id ?? null,
    };
  };
}

/** The provider's read endpoint, as every case below addresses it. */
export const GET_CALL_URL = "https://api.retellai.com/v2/get-call/";

/** A row still owed a copy: ended, settled, its count where the case says. */
export const pendingCopy = (T, id, attempts, over = {}) =>
  callRow(T, id, {
    status: "ended",
    ended_at: ago(20 * MIN),
    updated_at: ago(10 * MIN),
    recording: { fetch_state: "pending", attempts },
    ...over,
  });

/** The provider on its feet: every call ended, with a recording to copy; the CDN answers with a WAV. */
export const providerUp = (req) => {
  const m = /\/v2\/get-call\/call_(\w+)$/.exec(req.url);
  if (m)
    return {
      status: 200,
      body: retellCall(m[1], {
        call_status: "ended",
        start_timestamp: NOW - 12 * MIN,
        end_timestamp: NOW - 9 * MIN,
        recording_url: `https://cdn.retell.test/call_${m[1]}.wav`,
      }),
    };
  if (req.url.startsWith("https://cdn.retell.test/"))
    return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "content-type": "audio/wav" } });
  throw new Error(`unexpected ${req.method} ${req.url}`);
};

/* ----------------------------------------------------------------- google */

/**
 * The clock's knock, then what it handed out, run as the ledger runs it (decision 0115): each google_read in the order written,
 * under one deadline as one tick's are, taken off the ledger, and what they came to added up.
 */
export async function googleHour() {
  const [status, body] = await answer(await knock("google"));
  if (status !== 200) return [status, body];
  const db = pg();
  const { data: handed } = await db.from("jobs").select("*").eq("kind", "google_read");
  const total = {
    ok: true,
    listings_due: 0,
    listings_read: 0,
    profiles_due: 0,
    profiles_synced: 0,
    fresh: 0,
    counted: 0,
    failed: 0,
    remaining: 0,
  };
  const deadline = Date.now() + 45_000;
  for (const job of handed ?? []) {
    const came = await googleReader(db).read(job, deadline);
    await db.from("jobs").delete().eq("id", job.id);
    if ("skipped" in came) continue;
    const { read } = came;
    for (const k of Object.keys(total)) if (k !== "ok" && k !== "remaining") total[k] += read[k];
    total.remaining += read.left;
  }
  return [200, total];
}

export const listing = (T, n, over = {}) => ({
  tenant_id: T,
  place_id: `ChIJ${String(n).padStart(20, "0")}`,
  name: `Listing ${n}`,
  address: "1 Main St",
  maps_uri: null,
  business_status: "OPERATIONAL",
  rating: 4.5,
  review_count: 10,
  linked_by: null,
  linked_at: ago(30 * DAY),
  checked_at: null,
  check_error: null,
  ...over,
});

/** A place as Places (New) answers it. */
export const place = (id, over = {}) => ({
  id,
  displayName: { text: "Harbor Moving", languageCode: "en" },
  formattedAddress: "1 Main St, Brooklyn",
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
  rating: 4.6,
  userRatingCount: 10,
  reviews: [],
  ...over,
});

export const placeIdOf = (url) =>
  decodeURIComponent(url.slice("https://places.googleapis.com/v1/places/".length).split("?")[0]);

/* ------------------------------------------------------------------ lines */

/** A row as the database holds it: the columns the sweep, the take and the report read. */
export const lineRow = (T, id, over = {}) => ({
  id,
  tenant_id: T,
  e164: "+13055550100",
  kind: "chanlytics",
  provider: "dry",
  area_code: 305,
  subaccount_sid: "ACsub0000000000000000000000000000",
  number_sid: "PN0001",
  trunk_sid: null,
  credential_list_sid: null,
  termination_uri: null,
  messaging_service_sid: null,
  retell_agent_id: null,
  credentials_ref: null,
  voice_state: "provisioning",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: "trunk",
  last_error: null,
  state_since: ago(30 * MIN),
  created_at: ago(DAY),
  updated_at: ago(30 * MIN),
  profile_sid: null,
  a2p_profile_sid: null,
  brand_sid: null,
  campaign_sid: null,
  reg_mock: false,
  reg_sole_prop: false,
  reg_step: null,
  facts: {},
  ...over,
});

/** The sweep's second half with no workspace that stopped paying: nothing ended, and (the grace unset) only reporting. */
export const NONE_ENDED = { ended: 0, due: 0, warned: 0, undelivered: 0, released: 0, failed: 0, report_only: true };

/** The trial check and the chosen numbers with nothing to do (decisions 0090, 0091): the lines sweep's other two halves. */
export const NONE_TRIALS = { looked: 0, near: 0, started: 0, failed: 0, unreadable: 0 };

export const NONE_OWED = { looked: 0, started: 0, failed: 0 };

/* ------------------------------------- lines: a number whose subscription ended */

/**
 * A workspace that stopped paying 40 days ago, with its own number (answering, imported into Retell, routed), its
 * office phone forwarding to it, and an address for its alerts. Beside it, every workspace whose number is never
 * ours to give back: one that pays, one on a direct arrangement, one put back on by hand, and a ported number.
 */
export function endedWorld(n) {
  const T = tenant(n);
  const [paying, direct, handOn] = [tenant(n + 1), tenant(n + 2), tenant(n + 3)];
  const own = uuid(n * 10);
  const answering = { voice_state: "answering", step: null, state_since: ago(60 * DAY) };
  const bill = (tenant_id, over) => ({
    tenant_id,
    mode: "stripe",
    status: "canceled",
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    last_payment_failed_at: null,
    updated_at: ago(DAY),
    ...over,
  });
  const tables = {
    tenants: [
      tenantRow(T, { status: "paused" }),
      tenantRow(paying, { slug: "paying" }),
      tenantRow(direct, { slug: "direct" }),
      tenantRow(handOn, { slug: "hand-on" }),
    ],
    billing_accounts: [
      bill(T, { current_period_end: ago(40 * DAY), trial_end: ago(70 * DAY), updated_at: ago(40 * DAY) }),
      bill(paying, { status: "active", current_period_end: iso(NOW + 9 * DAY) }),
      bill(direct, { mode: "direct", status: "none", updated_at: ago(400 * DAY) }),
      bill(handOn, { current_period_end: ago(90 * DAY) }),
    ],
    tenant_config: [
      {
        tenant_id: T,
        config: {
          brain: { business_name: "Harbor Moving", ...newReceptionistDefaults("Harbor Moving") },
          notifications: { escalation_emails: ["owner@example.com"] },
        },
      },
    ],
    tenant_channels: [
      {
        id: "ch-voice",
        tenant_id: T,
        kind: "voice",
        status: "active",
        external_id: "agent_x",
        number_e164: "+13055550100",
      },
    ],
    lines: [
      lineRow(T, own, { ...answering, facts: { retell_imported: true, channel_id: "ch-voice", trunk_ready: true } }),
      // The office phone that forwards to it: the owner's own, read only to tell them.
      lineRow(T, uuid(n * 10 + 1), {
        ...answering,
        kind: "forwarded",
        provider: "carrier",
        e164: "+13055550111",
        voice_state: "none",
        forwarding_state: "verified",
        subaccount_sid: null,
        number_sid: null,
        facts: { carrier: "tmobile", mode: "unanswered", destination_e164: "+13055550100" },
      }),
      // A number the business brought with it: never ours to give back.
      lineRow(T, uuid(n * 10 + 2), { ...answering, kind: "ported", e164: "+13055550122", number_sid: "PNported" }),
      lineRow(paying, uuid(n * 10 + 3), { ...answering, e164: "+13055550133" }),
      lineRow(direct, uuid(n * 10 + 4), { ...answering, e164: "+13055550144" }),
      lineRow(handOn, uuid(n * 10 + 5), { ...answering, e164: "+13055550155" }),
    ],
    jobs: [],
    notifications: [],
    events: [],
  };
  return { T, own, tables };
}

export const VAULT_TOKEN = {
  get_line_credentials: () => ({ auth_token: "sub-token" }),
  drop_line_credentials: () => true,
};

/* ---------------------------------------------------------- registrations */

/** The master account: `lineProviderFromEnv` chooses Twilio over the dry provider the moment both credentials exist; a filing also needs our approved primary profile. */
export const FILING = {
  TWILIO_ACCOUNT_SID: "ACmaster0000000000000000000000000",
  TWILIO_AUTH_TOKEN: "master-token",
  TWILIO_PRIMARY_PROFILE_SID: "BUprimary",
};

export const SUB = "ACsub0000000000000000000000000000";

export const basic = (sid, token) => `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;

export const SUB_AUTH = basic(SUB, "sub-token");

/** The vault, answering the subaccount's token for any line. */
export const VAULT = { get_line_credentials: () => ({ auth_token: "sub-token" }), drop_line_credentials: () => true };

/** A line the carriers hold: a brand filed under the workspace's own profiles, no campaign yet. */
export const waiting = (T, id, over = {}) =>
  lineRow(T, id, {
    voice_state: "answering",
    step: null,
    trunk_sid: "TK0001",
    messaging_service_sid: "MG0001",
    sms_state: "registering",
    profile_sid: "BUcust",
    a2p_profile_sid: "BUa2p",
    brand_sid: "BN0001",
    campaign_sid: null,
    facts: {
      a2p_business_sid: "ITbiz",
      a2p_representative_sid: "ITrep",
      a2p_address_sid: "ADaddr",
      a2p_document_sid: "RDdoc",
      a2p_primary_assigned: true,
      a2p_profile_submitted: true,
    },
    state_since: ago(3 * DAY),
    updated_at: ago(2 * HOUR),
    ...over,
  });

/** The business on record, complete for the standard registration and named as the workspace is: a filing the pre-flight passes. */
export const RECORD = {
  ...emptyBusinessRecord({ websiteUrl: "https://harbormoving.example", email: "ada@example.com" }),
  legal_name: "Harbor Moving LLC",
  about:
    "A moving company in Brooklyn: homes and small offices across New York, packing and storage. Customers book a free estimate and pay per move.",
  trade_name: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave",
  city: "Brooklyn",
  region: "NY",
  postal_code: "11207",
  country: "US",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "+19175550123",
  updated_at: ago(3 * DAY),
};

export const twilioPath = (url) => url.split("/v1/")[1] ?? url.split("/2010-04-01/")[1] ?? url;
