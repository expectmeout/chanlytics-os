/**
 * The world the tests of door/ share. Split by behaviour from lines-door.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * The lines door, run: POST /api/admin/lines over a database in memory, the
 * dry line provider, and a captured wire to the carriers where the dry
 * provider does not reach (registration, and a number the row lost the
 * receipt for).
 *
 * This is the door that spends a workspace's money on Chanlytics' own Twilio
 * account -- a number is $1.15 a month for as long as it is held, a
 * registration is $19.50 one time and non-refundable, a replaced campaign a
 * second vetting fee -- and it is reachable with the diagnostic key alone, so
 * it must not take the dashboard's word for whether the workspace may spend.
 * Until 13 Sep 2026 its text was pinned by twelve assertions in seven files
 * and its POST had never been called.
 *
 * Executed here: the knock (a token minted for THIS door, a key only while
 * there is no secret, a body that may not name another workspace than the
 * token); every op -- status, search, buy, retry, release, record, register,
 * registration-status -- with the spend rule proven on the two that spend,
 * including the one path through `register` that is free (a campaign the
 * carriers sent back, corrected in place); and what each op leaves behind
 * for the dashboard, the owner and the carrier: the status, the body, the
 * rows, the requests.
 */
import { after } from "node:test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels/tokens";
import { emptyBusinessRecord } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

// The door reads all of these from the environment; each test file is its own
// process, so they are set before the import. The dry provider (LINES_DRY_RUN)
// is what every case runs over unless it says otherwise; the master Twilio
// credentials are set per case, only where a request must reach the carrier.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

process.env.LINES_DRY_RUN = "1";

process.env.RETELL_API_KEY = "retell-key-for-this-file";

process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";

process.env.DASHBOARD_ORIGIN = "https://dash.test";

for (const k of [
  "VERCEL_ENV",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PRIMARY_PROFILE_SID",
  "LEAD_TO",
  "DIAG_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  delete process.env[k];

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));

export const door = await import(at("apps/edge/api/admin/lines.ts"));

after(() => setPg(null));

export const AUD = "/api/admin/lines";

/** Harbor Moving: the workspace every token below is about. */
export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Another workspace, whose rows a token about A must never reach. */
export const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const LINE = "11111111-1111-4111-8111-111111111111";

export const B_LINE = "22222222-2222-4222-8222-222222222222";

export const SECOND = "33333333-3333-4333-8333-333333333333";

export const NUMBER = "+13055550100";

/* ------------------------------- the knock -------------------------------- */

export const token = (o = {}) => {
  const secret = o.secret ?? process.env.EDGE_CALL_SECRET;
  const claims = { workspace: "workspace" in o ? o.workspace : A, user: "u1" };
  return (body) => signEdgeToken(secret, o.aud ?? AUD, { ...claims, body });
};

/** The headers a knock sends, each token minted for the body it rides with: the edge refuses a token that names none. */
export const minted = (headers, raw) =>
  Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, typeof v === "function" ? v(raw) : v]));

export const knock = (body, headers = { "x-edge-token": token() }) => {
  const raw = JSON.stringify(body);
  const sent = minted({ ...headers, "content-type": "application/json" }, raw);
  return door.POST(new Request(`http://edge${AUD}`, { method: "POST", headers: sent, body: raw }));
};

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

/** The master account: `lineProviderFromEnv` chooses Twilio over the dry provider the moment both credentials exist. */
export const TWILIO = { TWILIO_ACCOUNT_SID: "ACmaster0000000000000000000000000", TWILIO_AUTH_TOKEN: "master-token" };

/** What a filing needs on top of that: our approved primary profile and the platform's mailbox. */
export const FILING = { ...TWILIO, TWILIO_PRIMARY_PROFILE_SID: "BUprimary", LEAD_TO: "platform@chanlytics.example" };

/* -------------------------------- the world ------------------------------- */

export const tenants = () => [
  { id: A, name: "Harbor Moving", slug: "harbor-moving", status: "active" },
  { id: B, name: "Billing probe", slug: "billing-probe", status: "active" },
];

export const billing = (status, mode = "stripe", tenant_id = A) => ({ tenant_id, mode, status });

/** The business on record, complete for the standard registration and named as the workspace is: a filing the pre-flight passes. */
export const RECORD = {
  tenant_id: A,
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
  updated_at: "2026-09-10T00:00:00Z",
};

/** A row as the database holds it. */
export const lineRow = (over = {}) => ({
  id: LINE,
  tenant_id: A,
  e164: NUMBER,
  kind: "chanlytics",
  provider: "dry",
  area_code: 305,
  subaccount_sid: null,
  number_sid: null,
  trunk_sid: null,
  credential_list_sid: null,
  termination_uri: null,
  messaging_service_sid: null,
  retell_agent_id: null,
  credentials_ref: null,
  voice_state: "answering",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: "2026-09-10T00:00:00Z",
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
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

/** A line that answers and texts through its own Messaging Service, not yet registered. */
export const unfiled = (over = {}) =>
  lineRow({
    subaccount_sid: "ACsub0000000000000000000000000000",
    number_sid: "PN0001",
    trunk_sid: "TK0001",
    messaging_service_sid: "MG0001",
    ...over,
  });

/** The same line with a brand and a campaign on file, the carriers' vetting done. */
export const filed = (over = {}) =>
  unfiled({
    profile_sid: "BUcust",
    a2p_profile_sid: "BUa2p",
    brand_sid: "BN0001",
    campaign_sid: "QE0001",
    sms_state: "approved",
    facts: {
      a2p_business_sid: "ITbiz",
      a2p_representative_sid: "ITrep",
      a2p_address_sid: "ADaddr",
      a2p_document_sid: "RDdoc",
      a2p_primary_assigned: true,
      a2p_profile_submitted: true,
    },
    ...over,
  });

export const REASON = "invalid campaign description (30886 · USE_CASE_DESCRIPTION)";

export const rejected = (over = {}) => filed({ sms_state: "rejected", last_error: REASON, ...over });

export const rehearsal = (over = {}) => filed({ reg_mock: true, ...over });

export function world(over = {}) {
  return {
    tenants: tenants(),
    billing_accounts: [billing("active")],
    lines: [],
    business_records: [],
    tenant_channels: [],
    jobs: [],
    events: [],
    notifications: [],
    ...over,
  };
}

/**
 * The two unique indexes `lines` keeps, as the database keeps them: one live line per workspace
 * (lines_one_live_per_tenant_idx, 00195) and one live line per number (lines_e164_live_idx, 00066).
 */
export const LINES_INDEXES = [
  {
    table: "lines",
    name: "lines_one_live_per_tenant_idx",
    columns: ["tenant_id"],
    where: (r) => r.voice_state === "provisioning" || r.voice_state === "answering",
  },
  {
    table: "lines",
    name: "lines_e164_live_idx",
    columns: ["e164"],
    where: (r) => r.e164 != null && r.voice_state !== "failed",
  },
];

/** The database the door will find, over these tables. */
export function use(tables, rpcs = {}, faults = {}) {
  const db = fakeDb(tables, faults, rpcs, { uniqueIndexes: LINES_INDEXES });
  setPg(db);
  return db;
}

/** The vault, answering the subaccount's token for any line. */
export const VAULT = { get_line_credentials: () => ({ auth_token: "sub-token" }), drop_line_credentials: () => true };

export const SUB_AUTH = `Basic ${Buffer.from("ACsub0000000000000000000000000000:sub-token").toString("base64")}`;

export const reads = (db, table) => db.seen.filter((s) => s.table === table && s.op === "select");

export const writes = (db, table) =>
  db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));

/** Every request to a provider, captured and answered by `reply`; a 204 carries no body, and Node's Response enforces it. */
export function wire(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: typeof init?.body === "string" ? init.body : null,
    };
    seen.push(req);
    const a = reply(req);
    return new Response(a.status === 204 ? null : JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

/** A wire nothing may reach: the dry provider makes no calls, and a refusal must make none. */
export const unreachable = (why) =>
  wire(() => {
    throw new Error(why);
  });

export const form = (req) => new URLSearchParams(req.body);

export const path1 = (url) => url.split("/v1/")[1] ?? url;

/** The flow names the sign-up page and its paper form as `(url), public:` -- the whole URL, delimited, so a slug with one letter too many is not a prefix match. */
export const namesPage = (flow, url) => flow.includes(`(${url}), public:`) && flow.includes(`(${url}/form), public:`);

/* ---------------------------------- record -------------------------------- */

/** The form as the dashboard sends it: the owner's words, some of them untidy. */
export const FORM = {
  legal_name: " Harbor Moving LLC ",
  about:
    "A moving company in Brooklyn: homes and small offices across New York, packing and storage. Customers book a free estimate and pay per move.",
  trade_name: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave",
  street_secondary: "",
  city: "Brooklyn",
  region: "NY",
  postal_code: "11207",
  website_url: "",
  industry: "PROFESSIONAL",
  business_type: "Limited Liability Corporation",
  company_type: "private",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "+1 917 555 0123",
  contact_title: "",
};
