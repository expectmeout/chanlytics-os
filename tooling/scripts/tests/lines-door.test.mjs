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
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken, LINE_COSTS, twilioUrls, LOW_VOLUME_USECASE } from "@chanlytics/channels";
import { emptyBusinessRecord, whyCannotSpend, PROVISIONING_DEADLINE_MS } from "@chanlytics/contracts";
import { fakeDb } from "./_fake-db.mjs";

// The door reads all of these from the environment; each test file is its own
// process, so they are set before the import. The dry provider (LINES_DRY_RUN)
// is what every case runs over unless it says otherwise; the master Twilio
// credentials are set per case, only where a request must reach the carrier.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.LINES_DRY_RUN = "1";
process.env.RETELL_API_KEY = "retell-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.DASHBOARD_ORIGIN = "https://dash.test";
for (const k of ["VERCEL_ENV", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PRIMARY_PROFILE_SID", "LEAD_TO", "DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/lines.ts"));
after(() => setPg(null));

const AUD = "/api/admin/lines";
/** Harbor Moving: the workspace every token below is about. */
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
/** Another workspace, whose rows a token about A must never reach. */
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINE = "11111111-1111-4111-8111-111111111111";
const B_LINE = "22222222-2222-4222-8222-222222222222";
const SECOND = "33333333-3333-4333-8333-333333333333";
const NUMBER = "+13055550100";

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) => signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, { workspace: "workspace" in o ? o.workspace : A, user: "u1" });
const knock = (body, headers = { "x-edge-token": token() }) =>
  door.POST(new Request(`http://edge${AUD}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) }));
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
/** The master account: `lineProviderFromEnv` chooses Twilio over the dry provider the moment both credentials exist. */
const TWILIO = { TWILIO_ACCOUNT_SID: "ACmaster0000000000000000000000000", TWILIO_AUTH_TOKEN: "master-token" };
/** What a filing needs on top of that: our approved primary profile and the platform's mailbox. */
const FILING = { ...TWILIO, TWILIO_PRIMARY_PROFILE_SID: "BUprimary", LEAD_TO: "platform@chanlytics.example" };

/* -------------------------------- the world ------------------------------- */

const tenants = () => [
  { id: A, name: "Harbor Moving", slug: "harbor-moving", status: "active" },
  { id: B, name: "Billing probe", slug: "billing-probe", status: "active" },
];
const billing = (status, mode = "stripe", tenant_id = A) => ({ tenant_id, mode, status });
/** The business on record, complete for the standard registration and named as the workspace is: a filing the pre-flight passes. */
const RECORD = {
  tenant_id: A,
  ...emptyBusinessRecord({ websiteUrl: "https://harbormoving.example", email: "ada@example.com" }),
  legal_name: "Harbor Moving LLC", trade_name: "Harbor Moving", ein: "12-3456789",
  street: "193 Jamaica Ave", city: "Brooklyn", region: "NY", postal_code: "11207", country: "US",
  contact_first_name: "Ada", contact_last_name: "Lovelace", contact_email: "ada@example.com", contact_phone: "+19175550123",
  updated_at: "2026-09-10T00:00:00Z",
};
/** A row as the database holds it. */
const lineRow = (over = {}) => ({
  id: LINE, tenant_id: A, e164: NUMBER, kind: "chanlytics", provider: "dry", area_code: 305,
  subaccount_sid: null, number_sid: null, trunk_sid: null, credential_list_sid: null, termination_uri: null, messaging_service_sid: null, retell_agent_id: null, credentials_ref: null,
  voice_state: "answering", sms_state: "none", whatsapp_state: "none", port_state: "none", forwarding_state: "none",
  step: null, last_error: null, state_since: "2026-09-10T00:00:00Z", created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
  profile_sid: null, a2p_profile_sid: null, brand_sid: null, campaign_sid: null, reg_mock: false, reg_sole_prop: false, reg_step: null,
  facts: {},
  ...over,
});
/** A line that answers and texts through its own Messaging Service, not yet registered. */
const unfiled = (over = {}) => lineRow({ subaccount_sid: "ACsub0000000000000000000000000000", number_sid: "PN0001", trunk_sid: "TK0001", messaging_service_sid: "MG0001", ...over });
/** The same line with a brand and a campaign on file, the carriers' vetting done. */
const filed = (over = {}) => unfiled({
  profile_sid: "BUcust", a2p_profile_sid: "BUa2p", brand_sid: "BN0001", campaign_sid: "QE0001", sms_state: "approved",
  facts: { a2p_business_sid: "ITbiz", a2p_representative_sid: "ITrep", a2p_address_sid: "ADaddr", a2p_document_sid: "RDdoc", a2p_primary_assigned: true, a2p_profile_submitted: true },
  ...over,
});
const REASON = "invalid campaign description (30886 · USE_CASE_DESCRIPTION)";
const rejected = (over = {}) => filed({ sms_state: "rejected", last_error: REASON, ...over });
const rehearsal = (over = {}) => filed({ reg_mock: true, ...over });

function world(over = {}) {
  return {
    tenants: tenants(), billing_accounts: [billing("trialing")],
    lines: [], business_records: [], tenant_channels: [], jobs: [], events: [], notifications: [],
    ...over,
  };
}
/** The database the door will find, over these tables. */
function use(tables, rpcs = {}, faults = {}) {
  const db = fakeDb(tables, faults, rpcs);
  setPg(db);
  return db;
}
/** The vault, answering the subaccount's token for any line. */
const VAULT = { get_line_credentials: () => ({ auth_token: "sub-token" }) };
const SUB_AUTH = `Basic ${Buffer.from("ACsub0000000000000000000000000000:sub-token").toString("base64")}`;
const reads = (db, table) => db.seen.filter((s) => s.table === table && s.op === "select");
const writes = (db, table) => db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));

/** Every request to a provider, captured and answered by `reply`; a 204 carries no body, and Node's Response enforces it. */
function wire(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = { url: String(url), method: init?.method ?? "GET", headers: init?.headers ?? {}, body: typeof init?.body === "string" ? init.body : null };
    seen.push(req);
    const a = reply(req);
    return new Response(a.status === 204 ? null : JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}
/** A wire nothing may reach: the dry provider makes no calls, and a refusal must make none. */
const unreachable = (why) => wire(() => { throw new Error(why); });
const form = (req) => new URLSearchParams(req.body);
const path1 = (url) => url.split("/v1/")[1] ?? url;
/** The flow names the sign-up page and its paper form as `(url), public:` -- the whole URL, delimited, so a slug with one letter too many is not a prefix match. */
const namesPage = (flow, url) => flow.includes(`(${url}), public:`) && flow.includes(`(${url}/form), public:`);

/* -------------------------------- the door -------------------------------- */

test("the door: a token for another door, a forgery and a bad token beside the right key all get 403 — no falling back; without the secret the key decides", async () => {
  const db = use(world());
  const other = await knock({ op: "status" }, { "x-edge-token": token({ aud: "/api/admin/whisper" }) });
  assert.deepEqual(await answer(other), [403, { ok: false, error: "token_audience" }], "a token for another door opens nothing here");
  const forged = await knock({ op: "status" }, { "x-edge-token": token({ secret: "not-the-secret" }) });
  assert.deepEqual(await answer(forged), [403, { ok: false, error: "token_signature" }]);
  const nobody = await knock({ op: "status" }, {});
  assert.deepEqual(await answer(nobody), [403, { ok: false }]);

  const minted = token();
  await withEnv({ DIAG_KEY: "diag-key-for-this-file" }, async () => {
    // The right key beside a bad token: the token decides, and it says no.
    const both = await knock({ op: "status" }, { "x-edge-token": "garbage", "x-diag-key": "diag-key-for-this-file" });
    assert.deepEqual(await answer(both), [403, { ok: false, error: "token_malformed" }], "there is no falling back from a bad token to the key");
    await withEnv({ EDGE_CALL_SECRET: undefined }, async () => {
      // Before the edge has the secret, a token is ignored and the key decides
      // -- so the dashboard may be given the secret before or after the edge.
      const keyed = await knock({ op: "status" }, { "x-diag-key": "diag-key-for-this-file" });
      assert.equal(keyed.status, 200);
      const early = await knock({ op: "status" }, { "x-edge-token": minted, "x-diag-key": "diag-key-for-this-file" });
      assert.equal(early.status, 200, "a token ahead of the secret is not held against the caller");
      const wrong = await knock({ op: "status" }, { "x-edge-token": minted, "x-diag-key": "diag-key-for-this-file-but-longer" });
      assert.deepEqual(await answer(wrong), [403, { ok: false }], "and a token ahead of the secret opens nothing on its own");
    });
  });
  assert.equal(db.seen.length, 0, "nothing was read for any of it: the door refuses before the database");
});

test("the workspace: a token naming one refuses a body naming another; the token's own is acted on with or without a body; a key-holder's body is believed", async () => {
  const tables = world({ lines: [lineRow({ voice_state: "failed", step: "import" }), lineRow({ id: B_LINE, tenant_id: B, voice_state: "failed", step: "trunk" })] });
  const db = use(tables);
  const crossed = await knock({ op: "retry", tenant_id: B, line_id: B_LINE });
  assert.deepEqual(await answer(crossed), [403, { ok: false, error: "workspace_mismatch" }]);
  assert.equal(db.seen.length, 0, "refused before anything is read");

  // A token about A reaches A's rows and nobody else's, whether or not the body says so.
  const theirs = await knock({ op: "retry", line_id: B_LINE });
  assert.deepEqual(await answer(theirs), [404, { ok: false, error: "no such line" }], "B's line does not exist as far as A can see");
  assert.equal(tables.lines[1].voice_state, "failed", "and it was not touched");
  const named = await knock({ op: "retry", tenant_id: A, line_id: LINE, by: "owner" });
  assert.equal(named.status, 202, "the body naming the token's own workspace is fine");
  assert.deepEqual(tables.jobs.map((j) => [j.tenant_id, j.payload.line_id]), [[A, LINE]]);

  // A key holder is about no workspace, so the body's is believed -- which is
  // exactly why the spend rule below is asked on this side of the wire.
  await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: "diag-key-for-this-file" }, async () => {
    const support = await knock({ op: "retry", tenant_id: B, line_id: B_LINE }, { "x-diag-key": "diag-key-for-this-file" });
    assert.equal(support.status, 202);
    assert.deepEqual(tables.jobs.at(-1).payload, { line_id: B_LINE, by: "support" }, "unnamed, a retry came from somebody holding the key");
    const nowhere = await knock({ op: "retry", line_id: B_LINE }, { "x-diag-key": "diag-key-for-this-file" });
    assert.deepEqual(await answer(nowhere), [400, { ok: false, error: "tenant_id (a workspace id) is required" }]);
    const nonsense = await knock({ op: "retry", tenant_id: "not-a-workspace", line_id: B_LINE }, { "x-diag-key": "diag-key-for-this-file" });
    assert.equal(nonsense.status, 400);
  });
  // A token about a workspace that does not exist.
  const ghost = await knock({ op: "retry", line_id: LINE }, { "x-edge-token": token({ workspace: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }) });
  assert.deepEqual(await answer(ghost), [404, { ok: false, error: "no such workspace" }]);
});

test("the writing ops need the receptionist's provider and a database; status and search need neither; an unknown op is named back", async () => {
  const db = use(world());
  await withEnv({ RETELL_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock({ op: "buy", number: NUMBER })), [503, { ok: false, error: "no_provider_key" }]);
    assert.equal((await knock({ op: "status" })).status, 200);
    assert.equal((await knock({ op: "search", area_code: 305 })).status, 200);
  });
  await withEnv({ RETELL_FN_SECRET: undefined }, async () => {
    assert.deepEqual(await answer(await knock({ op: "buy", number: NUMBER })), [503, { ok: false, error: "no_fn_secret" }]);
  });
  setPg(null);
  assert.deepEqual(await answer(await knock({ op: "buy", number: NUMBER })), [503, { ok: false, error: "no_database" }]);
  setPg(db);
  assert.equal(db.seen.length, 0);
  const unknown = await knock({ op: "dance" });
  assert.equal(unknown.status, 400);
  assert.match((await unknown.json()).error, /^op must be status, search, buy, retry, release, record, register or registration-status$/);
  const noOp = await knock({});
  assert.equal(noOp.status, 400);
});

/* ----------------------------- status and search -------------------------- */

test("status says whether this deployment can get lines and with which provider; without one the writing ops say what to set", async () => {
  const db = use(world());
  assert.deepEqual(await answer(await knock({ op: "status" })), [200, { ok: true, ready: true, provider: "dry", costs: LINE_COSTS }]);
  await withEnv({ LINES_DRY_RUN: undefined }, async () => {
    assert.deepEqual(await answer(await knock({ op: "status" })), [200, { ok: true, ready: false, provider: null, costs: LINE_COSTS }], "nothing to fake with and no credentials: Setup keeps 'we set it up with you'");
    const [status, body] = await answer(await knock({ op: "buy", number: NUMBER }));
    assert.equal(status, 503);
    assert.equal(body.error, "no_line_provider");
    assert.match(body.hint, /TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, or LINES_DRY_RUN=1 outside production/);
  });
  await withEnv({ VERCEL_ENV: "production" }, async () => {
    assert.equal((await (await knock({ op: "status" })).json()).provider, null, "production never fakes a line");
  });
  await withEnv(TWILIO, async () => {
    assert.equal((await (await knock({ op: "status" })).json()).provider, "twilio", "real credentials win, and asking costs no request");
  });
  assert.equal(db.seen.length, 0, "status reads nothing");
});

test("search validates the area code and answers local numbers with the monthly cost, reading no database", async () => {
  const db = use(world());
  const net = unreachable("the dry provider never reaches the network");
  try {
    for (const bad of [{}, { area_code: "30" }, { area_code: 1305 }, { area_code: "abc" }, { area_code: 199 }]) {
      const [status, body] = await answer(await knock({ op: "search", ...bad }));
      assert.equal(status, 400, JSON.stringify(bad));
      assert.equal(body.error, "area_code must be three digits, like 305");
    }
    const [status, body] = await answer(await knock({ op: "search", area_code: "305" }));
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.provider, "dry");
    assert.equal(body.area_code, 305, "a string of three digits is the number it spells");
    assert.equal(body.cost_month_usd, LINE_COSTS.local_number_month_usd);
    assert.equal(body.cost_month_usd, 1.15, "the price the Setup page quotes");
    assert.equal(body.numbers.length, 8, "eight to choose from");
    assert.ok(body.numbers.every((n) => n.e164.startsWith("+1305") && n.capabilities.voice && n.capabilities.sms), "in the area code asked for, able to call and text");
    assert.deepEqual(Object.keys(body.numbers[0]).sort(), ["capabilities", "e164", "friendly", "locality", "region"]);
    const asNumber = await (await knock({ op: "search", area_code: 917 })).json();
    assert.ok(asNumber.numbers.every((n) => n.e164.startsWith("+1917")));
  } finally { net.restore(); }
  assert.equal(db.seen.length, 0, "a search is a question to the provider, not to the database");
});

/* ----------------------------------- buy ---------------------------------- */

test("buy is refused for a workspace that may not spend, with the reason and where to go, before a row is written", async () => {
  const net = unreachable("a refused purchase must not reach a provider");
  try {
    for (const status of ["none", "incomplete", "past_due", "canceled", "unpaid", "paused", "incomplete_expired"]) {
      const tables = world({ billing_accounts: [billing(status)] });
      const db = use(tables);
      const res = await knock({ op: "buy", number: NUMBER });
      assert.equal(res.status, 402, status);
      const body = await res.json();
      assert.deepEqual(body, { ok: false, error: "payment_required", detail: whyCannotSpend("stripe", status), status }, status);
      assert.match(body.detail, /Billing|checkout|card/i, `${status}: a refusal names a destination`);
      assert.equal(tables.lines.length, 0, `${status}: no row`);
      assert.equal(tables.jobs.length, 0, `${status}: no saga`);
      assert.deepEqual(writes(db, "lines").length + writes(db, "jobs").length, 0);
    }
    // No billing row at all is 402 too: the fix is a card, not a different account.
    const db = use(world({ billing_accounts: [] }));
    assert.deepEqual(await answer(await knock({ op: "buy", number: NUMBER })), [402, { ok: false, error: "no_billing_record" }]);
    assert.equal(writes(db, "lines").length, 0);
    // A workspace invoiced by hand is never asked for a card.
    const direct = world({ billing_accounts: [billing("none", "direct")] });
    use(direct);
    assert.equal((await knock({ op: "buy", number: NUMBER })).status, 202, "direct: the question does not apply");
    assert.equal(direct.jobs.length, 1);
  } finally { net.restore(); }
});

test("buy for a workspace that may spend writes a provisioning row and schedules the saga as a line_provision job — it is not run here", async () => {
  const tables = world();
  const db = use(tables);
  const net = unreachable("the door schedules the saga; it does not run it");
  try {
    const bad = await knock({ op: "buy", number: "3055550100" });
    assert.deepEqual(await answer(bad), [400, { ok: false, error: "number must be E.164, like +13055550100" }]);
    assert.equal(tables.lines.length, 0);

    const startedAt = Date.now();
    const [status, body] = await answer(await knock({ op: "buy", number: NUMBER }));
    assert.equal(status, 202, "accepted, not done");
    assert.equal(body.ok, true);
    assert.equal(body.queued, true);
    assert.equal(body.provider, "dry");
    // What the page sees: the row's public face, and never a SID.
    assert.equal(body.line.e164, NUMBER);
    assert.equal(body.line.voice_state, "provisioning");
    assert.equal(body.line.step, "subaccount");
    assert.equal(body.line.area_code, 305, "read off the number when the body did not say");
    assert.equal(body.line.registered, false);
    assert.ok(!Object.keys(body.line).some((k) => k.endsWith("_sid")), "no provider SID reaches the page");

    const row = tables.lines[0];
    assert.equal(tables.lines.length, 1);
    assert.deepEqual([row.tenant_id, row.kind, row.provider, row.e164, row.voice_state, row.step], [A, "chanlytics", "dry", NUMBER, "provisioning", "subaccount"]);
    assert.ok(Date.parse(row.state_since) >= startedAt, "the clock the deadline reads starts now");
    assert.equal(row.subaccount_sid, undefined, "nothing was provisioned inline: the receipts are the saga's to write");
    assert.equal(tables.jobs.length, 1);
    const job = tables.jobs[0];
    assert.equal(job.kind, "line_provision");
    assert.equal(job.tenant_id, A);
    assert.deepEqual(job.payload, { line_id: row.id, by: "owner" });
    assert.ok(Date.parse(job.due_at) <= Date.now(), "due now: claimed under a lease within seconds");
    const order = db.seen.map((s) => `${s.table}.${s.op}`);
    assert.ok(order.indexOf("billing_accounts.select") < order.indexOf("lines.insert"), "the spend rule is asked before the row exists");

    // One line per workspace in v1: a second buy is refused while one is live,
    // and a failed one is answered with the row to retry rather than a new purchase.
    const again = await knock({ op: "buy", number: "+13055550101", area_code: 305 });
    const [s2, b2] = await answer(again);
    assert.equal(s2, 409);
    assert.equal(b2.error, "line_exists");
    assert.equal(b2.line.id, row.id);
    row.voice_state = "failed";
    const [s3, b3] = await answer(await knock({ op: "buy", number: "+13055550101" }));
    assert.deepEqual([s3, b3.error, b3.line.id], [409, "line_failed_retry", row.id]);
    assert.equal(tables.lines.length, 1);
    assert.equal(tables.jobs.length, 1, "neither refusal scheduled anything");
  } finally { net.restore(); }

  // The ledger refusing the job is answered as such, with the row it left.
  const broken = world();
  use(broken, {}, { "jobs.insert": { message: "permission denied for table jobs" } });
  const [s4, b4] = await answer(await knock({ op: "buy", number: NUMBER }));
  assert.equal(s4, 503);
  assert.match(b4.error, /schedule_job: permission denied/);
  assert.equal(b4.line.voice_state, "provisioning", "the row stands; the lines sweep picks it up past the deadline");
});

/* ------------------------------ retry and release ------------------------- */

test("retry resumes only the named row of the named workspace at its own step, records who asked, and refuses a line that cannot be retried in words", async () => {
  const NOW = Date.now();
  const tables = world({
    lines: [
      lineRow({ voice_state: "failed", step: "import", last_error: "Retell 422: bad trunk", subaccount_sid: "ACsub", number_sid: "PN0001", trunk_sid: "TK0001", facts: { automatic_resumes: 3, trunk_ready: true } }),
      lineRow({ id: B_LINE, tenant_id: B, voice_state: "failed", step: "trunk" }),
      lineRow({ id: SECOND, voice_state: "answering" }),
    ],
  });
  const db = use(tables);
  const net = unreachable("a retry is scheduled, never run at the door");
  try {
    assert.deepEqual(await answer(await knock({ op: "retry", line_id: "nope" })), [400, { ok: false, error: "line_id is required" }]);
    assert.deepEqual(await answer(await knock({ op: "retry" })), [400, { ok: false, error: "line_id is required" }]);
    assert.deepEqual(await answer(await knock({ op: "retry", line_id: B_LINE })), [404, { ok: false, error: "no such line" }], "another workspace's row is not ours to resume");

    // The rule is `lineRetryRefusal`: each refusal names the state a person can act on.
    const [s1, b1] = await answer(await knock({ op: "retry", line_id: SECOND }));
    assert.deepEqual([s1, b1.error, b1.line.id], [409, "the line is answering, not failed", SECOND]);
    tables.lines.push(lineRow({ id: "44444444-4444-4444-8444-444444444444", voice_state: "provisioning", step: "trunk", state_since: new Date(NOW - 60_000).toISOString() }));
    const [s2, b2] = await answer(await knock({ op: "retry", line_id: "44444444-4444-4444-8444-444444444444" }));
    assert.equal(s2, 409);
    assert.match(b2.error, /still setting up/);
    assert.match(b2.error, /retried automatically after that/, "so nobody sits refreshing");
    tables.lines.push(lineRow({ id: "55555555-5555-4555-8555-555555555555", voice_state: "failed", step: "number", last_error: "reading the line's credentials: permission denied" }));
    const [s3, b3] = await answer(await knock({ op: "retry", line_id: "55555555-5555-4555-8555-555555555555" }));
    assert.equal(s3, 409);
    assert.match(b3.error, /credentials could not be kept/, "a retry cannot help until a person restores them, and the button says so");
    assert.equal(tables.jobs.length, 0, "no refusal scheduled anything");

    // The failed line, by the owner: taken, cleared, scheduled at its step.
    const [status, body] = await answer(await knock({ op: "retry", line_id: LINE, by: "owner" }));
    assert.equal(status, 202);
    assert.deepEqual([body.ok, body.queued, body.provider], [true, true, "dry"]);
    assert.equal(body.line.voice_state, "provisioning");
    assert.equal(body.line.last_error, null);
    assert.equal(body.line.step, "import", "the page sees it resume where it stopped");
    const row = tables.lines[0];
    assert.equal(row.voice_state, "provisioning", "the take is visible on the row");
    assert.equal(row.last_error, null);
    assert.ok(Date.parse(row.state_since) >= NOW, "with a clock that restarts now");
    assert.deepEqual(row.facts, { automatic_resumes: 0, trunk_ready: true }, "a person's Retry clears the automatic count and keeps every receipt");
    assert.deepEqual([row.step, row.number_sid, row.trunk_sid], ["import", "PN0001", "TK0001"], "nothing is bought or built twice: the saga derives its plan from these");
    assert.deepEqual(tables.jobs.map((j) => [j.kind, j.tenant_id, j.payload]), [["line_provision", A, { line_id: LINE, by: "owner" }]]);
    const claim = writes(db, "lines").find((w) => w.op === "update");
    assert.ok(claim.filters.some(([op, col, val]) => op === "eq" && col === "voice_state" && val === "failed"), "the take is a compare-and-swap on the state the caller saw");

    // A line the wall killed is retryable past the deadline, and the same take applies.
    const stuck = lineRow({ id: "66666666-6666-4666-8666-666666666666", voice_state: "provisioning", step: "trunk", state_since: new Date(NOW - PROVISIONING_DEADLINE_MS - 60_000).toISOString() });
    tables.lines.push(stuck);
    const [s4, b4] = await answer(await knock({ op: "retry", line_id: stuck.id }));
    assert.equal(s4, 202);
    assert.equal(b4.line.step, "trunk");
    assert.equal(tables.jobs.at(-1).payload.by, "support", "unnamed, it came from somebody holding the key");
    const took = writes(db, "lines").filter((w) => w.op === "update").at(-1);
    assert.ok(took.filters.some(([op, col]) => op === "lt" && col === "state_since"), "taken only if still past the deadline at the moment of the take");
  } finally { net.restore(); }
});

test("release gives the number and the trunk back, switches both routing rows off, forgets the line, and writes the ledger — as the workspace's subaccount", async () => {
  const asked = [];
  const tables = world({
    lines: [
      unfiled({ facts: { channel_id: "ch-voice", sms_channel_id: "ch-sms", trunk_ready: true } }),
      lineRow({ id: B_LINE, tenant_id: B, subaccount_sid: "ACother", number_sid: "PN0099" }),
    ],
    tenant_channels: [
      { id: "ch-voice", tenant_id: A, kind: "voice", status: "active", external_id: "agent_x", number_e164: NUMBER },
      { id: "ch-sms", tenant_id: A, kind: "sms", status: "active", external_id: NUMBER, number_e164: NUMBER },
    ],
  });
  use(tables, { get_line_credentials: (args) => { asked.push(args); return { auth_token: "sub-token" }; } });
  const net = unreachable("the dry provider never reaches the network");
  try {
    assert.deepEqual(await answer(await knock({ op: "release", line_id: B_LINE })), [404, { ok: false, error: "no such line" }]);
    assert.equal(tables.lines.length, 2, "another workspace's number is not ours to give back");

    const [status, body] = await answer(await knock({ op: "release", line_id: LINE }));
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, released: { number: "PN0001", trunk: "TK0001", channel_disabled: "ch-voice", sms_channel_disabled: "ch-sms" } }, "what came off at the provider, by receipt");
  } finally { net.restore(); }
  assert.deepEqual(asked, [{ p_line_id: LINE }], "the subaccount's token, from the vault, for this line");
  assert.deepEqual(tables.lines.map((l) => l.id), [B_LINE], "the line is forgotten");
  assert.equal(tables.tenant_channels.find((c) => c.id === "ch-voice").status, "disabled", "switched off, never deleted: calls keep their history");
  // The texting row the saga recorded under `facts.sms_channel_id` goes off
  // with it, rather than staying active beside a number nobody holds.
  assert.equal(tables.tenant_channels.find((c) => c.id === "ch-sms").status, "disabled", "and the texting row, the same way");
  assert.equal(tables.events.length, 1);
  const ev = tables.events[0];
  assert.deepEqual([ev.tenant_id, ev.kind, ev.category, ev.subject_type, ev.subject_id], [A, "line.released", "setup", "line", LINE]);
  assert.deepEqual(ev.data, { e164: NUMBER, provider: "dry", number: "PN0001", trunk: "TK0001", channel_disabled: "ch-voice", sms_channel_disabled: "ch-sms" });
});

test("release finds a number the row lost the receipt for and gives it back — at the carrier, over the wire; a refused lookup is not 'we do not own it'", async () => {
  // The window is real: `number_sid` is written after the purchase answers, so a
  // saga killed between the two left the number bought and the row silent. This
  // used to skip straight to deleting the row, and we paid for it every month.
  const tables = world({ lines: [unfiled({ provider: "twilio", voice_state: "failed", step: "number", number_sid: null, trunk_sid: null })] });
  use(tables, VAULT);
  const sub = "ACsub0000000000000000000000000000";
  const carrier = wire((req) => {
    if (req.method === "GET" && req.url.startsWith(twilioUrls.incomingNumbers(sub))) return { status: 200, body: { incoming_phone_numbers: [{ sid: "PNlost", phone_number: NUMBER }] } };
    if (req.method === "DELETE") return { status: 204 };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    await withEnv(TWILIO, async () => {
      assert.deepEqual(await answer(await knock({ op: "release", line_id: LINE })), [200, { ok: true, released: { number: "PNlost", number_found_by_lookup: true } }], "and says so, because it means a saga was killed mid-purchase");
    });
  } finally { carrier.restore(); }
  assert.deepEqual(carrier.seen.map((r) => [r.method, r.url]), [
    ["GET", `${twilioUrls.incomingNumbers(sub)}?PhoneNumber=%2B13055550100&PageSize=1`],
    ["DELETE", twilioUrls.incomingNumber(sub, "PNlost")],
  ], "looked up by the number, released by the SID it answered");
  assert.ok(carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH), "as the workspace's subaccount, never the master");
  assert.equal(tables.lines.length, 0);

  // Honestly absent: nothing to release, and the row still goes.
  const none = world({ lines: [unfiled({ provider: "twilio", number_sid: null, trunk_sid: null })] });
  use(none, VAULT);
  const empty = wire(() => ({ status: 200, body: { incoming_phone_numbers: [] } }));
  try {
    await withEnv(TWILIO, async () => {
      assert.deepEqual(await answer(await knock({ op: "release", line_id: LINE })), [200, { ok: true, released: {} }]);
    });
  } finally { empty.restore(); }
  assert.equal(none.lines.length, 0);

  // A lookup the carrier refuses is a provider error, and the row stays: deleting
  // it would be paying for a number with nothing left pointing at it.
  const kept = world({ lines: [unfiled({ provider: "twilio", number_sid: null, trunk_sid: null })] });
  use(kept, VAULT);
  const refused = wire(() => ({ status: 500, body: { code: 20500, message: "internal error" } }));
  try {
    await withEnv(TWILIO, async () => {
      const [status, body] = await answer(await knock({ op: "release", line_id: LINE }));
      assert.equal(status, 502);
      assert.match(body.error, /^releasing at the provider: list owned numbers: internal error \(Twilio 20500\)/);
      assert.deepEqual(body.released, {});
    });
  } finally { refused.restore(); }
  assert.equal(kept.lines.length, 1, "the row stands until the carrier answers");
  assert.equal(kept.events.length, 0);
});

/* ---------------------------------- record -------------------------------- */

/** The form as the dashboard sends it: the owner's words, some of them untidy. */
const FORM = {
  legal_name: " Harbor Moving LLC ", trade_name: "Harbor Moving", ein: "12-3456789",
  street: "193 Jamaica Ave", street_secondary: "", city: "Brooklyn", region: "NY", postal_code: "11207", website_url: "",
  industry: "PROFESSIONAL", business_type: "Limited Liability Corporation", company_type: "private",
  contact_first_name: "Ada", contact_last_name: "Lovelace", contact_email: "ada@example.com", contact_phone: "+1 917 555 0123", contact_title: "",
};

test("record validates the row it is about to write and reports the first problem in the owner's words; a good one is kept once per workspace and the ledger says so", async () => {
  const tables = world();
  const db = use(tables);
  assert.deepEqual(await answer(await knock({ op: "record" })), [400, { ok: false, error: "record is required" }]);
  assert.deepEqual(await answer(await knock({ op: "record", record: "Harbor Moving" })), [400, { ok: false, error: "record is required" }]);
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, legal_name: "" } })), [400, { ok: false, error: "Legal name is needed." }]);
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, ein: "12345" } })), [400, { ok: false, error: "A tax ID is nine digits, like 12-3456789." }]);
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, contact_email: "ada" } })), [400, { ok: false, error: "That does not look like an email address." }]);
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, legal_name: "", region: "New York" } })), [400, { ok: false, error: "Legal name is needed." }], "missing before malformed, in the order the form asks");
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, country: "MX" } })), [400, { ok: false, error: "The carriers register US and Canadian businesses only. Ours is not a door we can open." }]);
  assert.equal(writes(db, "business_records").length, 0, "nothing written until it validates");
  assert.equal(tables.events.length, 0);

  const [status, body] = await answer(await knock({ op: "record", record: FORM, path: "standard" }));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual([body.record.legal_name, body.record.path, body.record.sole_proprietor], ["Harbor Moving LLC", "standard", false]);
  assert.equal(tables.business_records.length, 1);
  const row = tables.business_records[0];
  assert.equal(row.tenant_id, A);
  assert.equal(row.legal_name, "Harbor Moving LLC", "trimmed");
  assert.equal(row.ein, "12-3456789");
  assert.equal(row.industry, "PROFESSIONAL_SERVICES", "Twilio's enum, not the word typed: 'PROFESSIONAL' is refused at the evaluation");
  assert.deepEqual([row.street_secondary, row.country, row.contact_title, row.contact_job_position], [null, "US", "Owner", "Director"], "blanks become null or the default the carriers accept");
  assert.equal(row.website_url, "", "no site: the page we publish is filed instead");
  assert.equal(row.contact_phone, "+1 917 555 0123");
  assert.deepEqual(tables.events.map((e) => [e.kind, e.category, e.subject_type, e.subject_id, e.data]), [["business.recorded", "setup", "tenant", A, { legal_name: "Harbor Moving LLC", path: "standard" }]]);

  // Said twice makes one row.
  const [again, moved] = await answer(await knock({ op: "record", record: { ...FORM, city: "Queens" }, path: "standard" }));
  assert.equal(again, 200);
  assert.equal(moved.record.legal_name, "Harbor Moving LLC");
  assert.equal(tables.business_records.length, 1);
  assert.equal(tables.business_records[0].city, "Queens");
  const up = writes(db, "business_records");
  assert.ok(up.every((w) => w.op === "upsert" && w.conflict.join() === "tenant_id"), "an upsert on the workspace, never a second row");
});

test("record: which registration is said, not inferred — a sole proprietor is stored with no tax id and reads back on that path; derived only when the caller did not say", async () => {
  const tables = world({ lines: [lineRow()] });
  use(tables);
  // Asked for the sole-proprietor path with a tax id typed anyway: stored as
  // that path files it, so it reads back on it for ever.
  const [status, body] = await answer(await knock({ op: "record", path: "sole_proprietor", record: { ...FORM, ein: "12-3456789" } }));
  assert.equal(status, 200);
  assert.deepEqual([body.record.path, body.record.sole_proprietor], ["sole_proprietor", true]);
  assert.equal(tables.business_records[0].ein, null, "a sole-proprietor record keeps NO tax id");
  assert.equal(tables.events.at(-1).data.path, "sole_proprietor");

  // The one thing that path cannot proceed without is THEIR handset, not ours.
  const [ours, why] = await answer(await knock({ op: "record", path: "sole_proprietor", record: { ...FORM, contact_phone: NUMBER } }));
  assert.equal(ours, 400);
  assert.match(why.error, /This is the number Chanlytics answers for you\. The carriers need YOUR handset/);
  assert.deepEqual(await answer(await knock({ op: "record", path: "sole_proprietor", record: { ...FORM, contact_phone: "" } })), [400, { ok: false, error: "Your mobile is needed." }], "in that path's own words");
  // And the standard path's demands are not made of them: no legal form, no tax id.
  const [thin] = await answer(await knock({ op: "record", path: "sole_proprietor", record: { ...FORM, ein: "", business_type: "", company_type: "" } }));
  assert.equal(thin, 200);

  // Derived from the tax id when the caller did not say, or said nonsense.
  const [d1, standard] = await answer(await knock({ op: "record", record: FORM }));
  assert.deepEqual([d1, standard.record.path], [200, "standard"]);
  const [d2, sole] = await answer(await knock({ op: "record", record: { ...FORM, ein: "" }, path: "the-other-one" }));
  assert.deepEqual([d2, sole.record.path], [200, "sole_proprietor"]);
  assert.deepEqual(await answer(await knock({ op: "record", record: { ...FORM, ein: "" }, path: "standard" })), [400, { ok: false, error: "Tax ID (EIN) is needed." }], "a caller that says standard is held to it");
});

/* --------------------------------- register ------------------------------- */

test("register: the gate asks what the filing will COST, off the row — a first filing, a rehearsal made real and a refused campaign replaced all spend, so a workspace that may not is refused before the record is read", async () => {
  const lapsed = billing("past_due");
  const net = unreachable("a refused filing must not reach the carriers");
  try {
    for (const [what, row, flags] of [
      ["a first filing", unfiled(), {}],
      ["a rehearsal made real", rehearsal(), { refile: true }],
      ["a refused campaign replaced", rejected(), { refile: true, replace: true }],
      ["a refused campaign replaced, whatever else the body says", rejected(), { refile: true, replace: true, mock: true }],
    ]) {
      const tables = world({ billing_accounts: [lapsed], lines: [row], business_records: [RECORD] });
      const db = use(tables, VAULT);
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, ...flags }));
      assert.equal(status, 402, what);
      assert.deepEqual(body, { ok: false, error: "payment_required", detail: whyCannotSpend("stripe", "past_due"), status: "past_due" }, what);
      assert.equal(reads(db, "business_records").length, 0, `${what}: refused before the record is even read`);
      assert.equal(writes(db, "lines").length, 0, `${what}: the row is untouched`);
      assert.deepEqual(tables.lines[0], row);
    }
    const none = world({ billing_accounts: [], lines: [unfiled()], business_records: [RECORD] });
    use(none, VAULT);
    assert.deepEqual(await answer(await knock({ op: "register", line_id: LINE })), [402, { ok: false, error: "no_billing_record" }]);
  } finally { net.restore(); }
});

test("register: the one free path — a campaign the carriers sent back, corrected in place — files without asking the spend rule: the SAME campaign is edited, as the subaccount, with the workspace's current name", async () => {
  // A workspace whose card lapsed mid-review must still be able to answer the
  // carriers: Twilio assesses the vetting fee once per campaign, at its first
  // decision, so editing that same resource costs nothing.
  const tables = world({ billing_accounts: [billing("past_due")], lines: [rejected()], business_records: [RECORD] });
  const db = use(tables, VAULT);
  const carrier = wire((req) => {
    if (req.method === "POST" && req.url === "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p/QE0001") return { status: 200, body: { sid: "QE0001", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    const [status, body] = await answer(await knock({ op: "register", line_id: LINE, refile: true }));
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual([body.ok, body.resubmitted, body.smsState], [true, true, "registering"]);
    assert.deepEqual([body.line.sms_state, body.line.registered, body.line.last_error], ["registering", true, null], "what the page sees: back with the carriers, still registered");
  } finally { carrier.restore(); }
  assert.equal(reads(db, "billing_accounts").length, 0, "the spend rule was not consulted: this edit costs nothing");
  assert.equal(reads(db, "tenants").length, 1, "the workspace's name comes from the read this request already made, not a second one");
  assert.equal(carrier.seen.length, 1, "one request: the edit");
  const [req] = carrier.seen;
  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p/QE0001", "the INSTANCE: the same campaign, edited, not a new one");
  assert.equal(req.headers.Authorization, SUB_AUTH, "as the workspace's own subaccount");
  const f = form(req);
  assert.match(f.get("Description"), /^Messages are sent by Harbor Moving \(Harbor Moving LLC\) to its own customers/, "the workspace's CURRENT name, beside the registered one -- the corrections are the point");
  assert.ok(namesPage(f.get("MessageFlow"), "https://dash.test/yes/harbor-moving"), "the opt-in page, from this deployment's origin and the workspace's slug");
  assert.equal(f.get("PrivacyPolicyUrl"), "https://dash.test/b/harbor-moving", "the page we publish for them, on the same domain as the opt-in page");
  assert.equal(f.get("TermsAndConditionsUrl"), "https://dash.test/b/harbor-moving/terms");
  const samples = f.getAll("MessageSamples");
  assert.equal(samples.length, 4);
  assert.ok(samples.some((s) => s.includes("+1 (305) 555-0100")), "the workspace's own line in the sample that shows a number");
  assert.ok(samples.every((s) => s.includes("Harbor Moving")));
  for (const never of ["OptInMessage", "OptInKeywords", "BrandRegistrationSid", "UsAppToPersonUsecase"]) assert.equal(f.get(never), null, `${never}: not editable by anyone, so not sent`);
  const row = tables.lines[0];
  assert.deepEqual([row.sms_state, row.reg_step, row.last_error, row.brand_sid, row.campaign_sid], ["registering", null, null, "BN0001", "QE0001"], "the row is with the carriers again, under the same receipts");
  assert.notEqual(row.state_since, "2026-09-10T00:00:00Z", "the clock the page counts from restarts");
});

test("register: a filing that stands is final, refile or not; a rehearsal and a refusal each say what they are and what to send; no record means no filing and the row says so", async () => {
  const net = unreachable("nothing here reaches the carriers");
  try {
    let tables = world({ lines: [filed()], business_records: [RECORD] });
    use(tables, VAULT);
    for (const flags of [{}, { refile: true }, { refile: true, replace: true }]) {
      assert.deepEqual(await answer(await knock({ op: "register", line_id: LINE, ...flags })), [409, { ok: false, error: "already_registered", brand_sid: "BN0001", campaign_sid: "QE0001" }], JSON.stringify(flags));
    }
    assert.deepEqual(tables.lines[0], filed(), "a real filing that stands is not touched: it cost money and the carriers vetted it");

    tables = world({ lines: [rehearsal()], business_records: [RECORD] });
    use(tables, VAULT);
    const [s1, mock] = await answer(await knock({ op: "register", line_id: LINE }));
    assert.equal(s1, 409);
    assert.deepEqual([mock.error, mock.brand_sid, mock.campaign_sid], ["mock_registration", "BN0001", "QE0001"]);
    assert.match(mock.hint, /test registry, which routes nothing; send refile: true to file a real one/);

    tables = world({ lines: [rejected()], business_records: [RECORD] });
    use(tables, VAULT);
    const [s2, sent] = await answer(await knock({ op: "register", line_id: LINE }));
    assert.equal(s2, 409);
    assert.equal(sent.error, "campaign_rejected");
    assert.equal(sent.reason, REASON, "the carriers' own words");
    assert.match(sent.hint, /refile: true to resubmit it \(an edit, so no second vetting fee\)/);
    assert.match(sent.hint, /refile: true with replace: true to delete it and file a new one.*\(a second vetting fee\)/);
    assert.deepEqual([tables.lines[0].sms_state, tables.lines[0].last_error], ["rejected", REASON], "the verdict stays on the row");

    tables = world({ lines: [unfiled()] });
    use(tables, VAULT);
    assert.deepEqual(await answer(await knock({ op: "register", line_id: LINE })), [409, { ok: false, error: "no_business_record", hint: "op 'record' first" }]);
    assert.equal(tables.lines[0].sms_state, "needs_record", "and the row says what it is waiting on");
    assert.deepEqual(await answer(await knock({ op: "register", line_id: B_LINE })), [404, { ok: false, error: "no such line" }]);
    assert.deepEqual(await answer(await knock({ op: "register" })), [400, { ok: false, error: "line_id is required" }]);
  } finally { net.restore(); }
});

test("register: refile with replace deletes the refused campaign and the saga files ONE new one under the kept brand — a second vetting fee, so the spend rule is asked", async () => {
  const tables = world({ lines: [rejected()], business_records: [RECORD] });
  const db = use(tables, VAULT);
  const carrier = wire((req) => {
    if (req.method === "DELETE") return { status: 204 };
    if (req.method === "POST" && req.url === "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p") return { status: 201, body: { sid: "QE0002", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, refile: true, replace: true }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual([body.ok, body.mock, body.smsState], [true, false, "registering"]);
      assert.deepEqual([body.state.brandSid, body.state.campaignSid, body.state.profileSid], ["BN0001", "QE0002", "BUcust"]);
      assert.deepEqual([body.line.sms_state, body.line.registered], ["registering", true]);
    });
  } finally { carrier.restore(); }
  assert.deepEqual(carrier.seen.map((r) => [r.method, path1(r.url)]), [
    ["DELETE", "Services/MG0001/Compliance/Usa2p/QE0001"],
    ["POST", "Services/MG0001/Compliance/Usa2p"],
  ], "the refused campaign comes off, one new one goes on; the brand and both profiles are not redone");
  assert.ok(carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH));
  const f = form(carrier.seen[1]);
  assert.equal(f.get("BrandRegistrationSid"), "BN0001", "under the brand that was approved on its own -- the expensive half, kept");
  assert.equal(f.get("UsAppToPersonUsecase"), LOW_VOLUME_USECASE);
  assert.match(f.get("OptInMessage"), /Harbor Moving/, "the field no edit can reach is what a replacement is for");
  assert.deepEqual(f.getAll("OptInKeywords"), ["START", "UNSTOP", "RESUME"], "the appointment keywords only: no marketing keyword on the texting number");
  assert.equal(f.get("Mock"), null);
  const row = tables.lines[0];
  assert.deepEqual([row.brand_sid, row.campaign_sid, row.sms_state, row.reg_mock, row.reg_step, row.last_error], ["BN0001", "QE0002", "registering", false, null, null]);
  assert.equal(reads(db, "billing_accounts").length, 1, "a replacement spends, so the workspace was asked whether it may");
});

test("register: a rehearsal made real — refile takes the mock campaign off, changes the messaging profile so the carriers accept a second brand, keeps the customer profile and its four receipts, and files a real brand", async () => {
  const tables = world({ lines: [rehearsal()], business_records: [RECORD] });
  use(tables, VAULT);
  let n = 0;
  const carrier = wire((req) => {
    if (req.method === "DELETE") return { status: 204 };
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    return { status: 201, body: { sid: `NEW${String(++n).padStart(4, "0")}` } };
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, refile: true, mock: true }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.equal(body.ok, true);
      assert.equal(body.mock, false, "a refile is never itself a rehearsal, whatever the body says");
      assert.deepEqual([body.line.reg_mock, body.line.sms_state, body.line.registered], [false, "registering", true]);
    });
  } finally { carrier.restore(); }
  const calls = carrier.seen.map((r) => [r.method, path1(r.url)]);
  assert.deepEqual(calls[0], ["DELETE", "Services/MG0001/Compliance/Usa2p/QE0001"], "the mock campaign comes off first: a service holds one");
  assert.deepEqual(calls.slice(1).map(([, u]) => u), [
    "TrustProducts",
    "EndUsers",
    "TrustProducts/NEW0001/EntityAssignments",
    "TrustProducts/NEW0001/EntityAssignments",
    "TrustProducts/NEW0001/Evaluations",
    "TrustProducts/NEW0001",
    "a2p/BrandRegistrations",
    "Services/MG0001/Compliance/Usa2p",
  ], "resumed at the messaging profile: a fresh bundle, the brand, the campaign -- no customer profile, business, representative, address or document redone");
  const brand = form(carrier.seen.find((r) => r.url.endsWith("/BrandRegistrations")));
  assert.equal(brand.get("Mock"), null, "real");
  assert.equal(brand.get("CustomerProfileBundleSid"), "BUcust", "the kept customer profile");
  assert.equal(brand.get("A2PProfileBundleSid"), "NEW0001", "the fresh messaging profile: the pair changed, which is what lets a second brand be saved");
  assert.equal(brand.get("SkipAutomaticSecVet"), "true", "no vetting a low-volume campaign cannot use");
  const attached = carrier.seen.filter((r) => r.url.endsWith("/TrustProducts/NEW0001/EntityAssignments")).map((r) => form(r).get("ObjectSid"));
  assert.deepEqual(attached, ["NEW0002", "BUcust"], "the company-type end user and the SAME customer profile");
  const row = tables.lines[0];
  assert.deepEqual([row.reg_mock, row.profile_sid, row.a2p_profile_sid, row.brand_sid, row.campaign_sid, row.sms_state, row.reg_step, row.last_error], [false, "BUcust", "NEW0001", "NEW0006", "NEW0007", "registering", null, null]);
  assert.deepEqual(row.facts, rehearsal().facts, "the four receipts that cost a person's time survive");
});

test("register: a first real filing walks the whole registration as the workspace's subaccount from this deployment's pages, and the row ends with every receipt; mock files against the test registry and says so on the row", async () => {
  const tables = world({ lines: [unfiled()], business_records: [RECORD] });
  const db = use(tables, VAULT);
  let n = 0;
  const carrier = wire((req) => {
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    return { status: 201, body: { sid: `XX${String(++n).padStart(4, "0")}` } };
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual([body.ok, body.mock, body.smsState], [true, false, "registering"]);
      assert.deepEqual([body.line.registered, body.line.sms_state, body.line.reg_mock, body.line.reg_sole_prop], [true, "registering", false, false]);
    });
  } finally { carrier.restore(); }
  assert.equal(reads(db, "billing_accounts").length, 1, "a first filing spends");
  assert.ok(carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH), "filed as the workspace's own subaccount, never the master");
  const urls = carrier.seen.map((r) => path1(r.url));
  assert.equal(urls[0], "CustomerProfiles", "the customer profile first");
  assert.equal(urls.at(-1), "Services/MG0001/Compliance/Usa2p", "the campaign last");
  assert.ok(urls.indexOf("a2p/BrandRegistrations") > urls.indexOf("TrustProducts"), "the brand after both profiles");
  assert.ok(carrier.seen.some((r) => r.url.endsWith("/EntityAssignments") && form(r).get("ObjectSid") === "BUprimary"), "our approved primary profile is attached: the declaration that this business is ours");
  const address = carrier.seen.find((r) => r.url.includes("/Addresses.json"));
  assert.ok(address.url.startsWith("https://api.twilio.com/2010-04-01/Accounts/ACsub0000000000000000000000000000/"), "the address under the subaccount too");
  assert.equal(form(address).get("Region"), "NY");
  const business = carrier.seen.find((r) => r.url.endsWith("/EndUsers") && form(r).get("Type") === "customer_profile_business_information");
  assert.equal(JSON.parse(form(business).get("Attributes")).business_registration_number, "12-3456789", "the record on file, as the carriers ask it");
  const brand = form(carrier.seen.find((r) => r.url.endsWith("/BrandRegistrations")));
  assert.deepEqual([brand.get("Mock"), brand.get("BrandType"), brand.get("SkipAutomaticSecVet")], [null, "STANDARD", "true"], "real, a company, and no vetting a low-volume campaign cannot use");
  const campaign = form(carrier.seen.at(-1));
  assert.ok(namesPage(campaign.get("MessageFlow"), "https://dash.test/yes/harbor-moving"), "the flow names this workspace's sign-up page and its paper form");
  assert.equal(campaign.get("PrivacyPolicyUrl"), "https://dash.test/b/harbor-moving");
  assert.equal(campaign.get("TermsAndConditionsUrl"), "https://dash.test/b/harbor-moving/terms");
  assert.equal(campaign.get("UsAppToPersonUsecase"), LOW_VOLUME_USECASE);
  const row = tables.lines[0];
  for (const k of ["profile_sid", "a2p_profile_sid", "brand_sid", "campaign_sid"]) assert.match(row[k], /^XX/, k);
  for (const k of ["a2p_business_sid", "a2p_representative_sid", "a2p_address_sid", "a2p_document_sid"]) assert.match(row.facts[k], /^XX/, k);
  assert.deepEqual([row.facts.a2p_primary_assigned, row.facts.a2p_profile_submitted], [true, true]);
  assert.deepEqual([row.sms_state, row.reg_step, row.last_error, row.reg_mock, row.reg_sole_prop], ["registering", null, null, false, false]);

  // A rehearsal, asked for by name: the brand says Mock, and so does the row.
  const dry = world({ lines: [unfiled()], business_records: [RECORD] });
  use(dry, VAULT);
  const rehearsed = wire((req) => (req.url.endsWith("/Evaluations") ? { status: 201, body: { status: "compliant" } } : { status: 201, body: { sid: `MK${String(++n).padStart(4, "0")}` } }));
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, mock: true }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual([body.mock, body.line.reg_mock], [true, true]);
    });
  } finally { rehearsed.restore(); }
  assert.equal(form(rehearsed.seen.find((r) => r.url.endsWith("/BrandRegistrations"))).get("Mock"), "true");
  assert.equal(dry.lines[0].reg_mock, true);

  // Without the master credentials nothing can be filed, and the door says which credential.
  const nothing = world({ lines: [unfiled()], business_records: [RECORD] });
  use(nothing, VAULT);
  const [s, b] = await answer(await knock({ op: "register", line_id: LINE }));
  assert.deepEqual([s, b.error, b.smsState], [502, "no_provider", "none"], "the dry provider can buy a fake number; it cannot register one");
  await withEnv(TWILIO, async () => {
    const [s2, b2] = await answer(await knock({ op: "register", line_id: LINE }));
    assert.deepEqual([s2, b2.error], [502, "no_primary_profile"], "nothing is filed without our own approved profile");
  });
});

test("register: a filing the pre-flight refuses is a 409 about this workspace with the owner's sentences — on every door to the carriers, before the vault or the wire", async () => {
  // The campaign states the WORKSPACE'S name and the brand registers the
  // RECORD'S. A live campaign went to the carriers describing a business called
  // "Billing probe"; the refile door then sent the same mismatch out again.
  const renamed = () => [{ id: A, name: "Billing probe", slug: "harbor-moving", status: "active" }];
  const net = unreachable("a refused filing must not reach the carriers");
  const vault = [];
  const rpcs = { get_line_credentials: () => { vault.push("read"); return { auth_token: "sub-token" }; } };
  try {
    for (const [what, row, flags] of [["resubmit", rejected(), { refile: true }], ["replace", rejected(), { refile: true, replace: true }], ["rehearsal made real", rehearsal(), { refile: true }]]) {
      const tables = world({ tenants: renamed(), lines: [row], business_records: [RECORD] });
      use(tables, rpcs);
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, ...flags }));
      assert.equal(status, 409, what);
      assert.equal(body.error, "record_incomplete", what);
      assert.ok(body.problems.some((p) => /Billing probe/.test(p) && /Harbor Moving/.test(p)), `${what}: what is wrong, in sentences`);
      assert.deepEqual(tables.lines[0], row, `${what}: the row keeps the carriers' verdict -- our pre-check must not overwrite the only record of what they said`);
    }
    // The first filing draws the same line, and this row HAS no verdict yet, so it says what it is waiting on.
    const first = world({ tenants: renamed(), lines: [unfiled()], business_records: [RECORD] });
    use(first, rpcs);
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
      assert.equal(status, 409);
      assert.equal(body.error, "record_incomplete");
      assert.ok(body.problems.some((p) => /Billing probe/.test(p)));
      assert.equal(body.smsState, "needs_record");
    });
    assert.equal(first.lines[0].sms_state, "needs_record", "the owner's to fix");
    assert.match(first.lines[0].last_error, /Billing probe/, "on the row the page reads");
    // And the door tells the pre-flight whether anybody can say yes. The flow
    // filed with the carriers says customers opt in by texting this business,
    // which has to be true of a workspace before it is said about one: a line
    // with no number and no active texting row cannot be filed.
    const nowhere = world({ lines: [unfiled({ e164: null })], business_records: [RECORD] });
    use(nowhere, rpcs);
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
      assert.equal(status, 409);
      assert.ok(body.problems.some((p) => /has to be true/.test(p)), "somewhere for a customer to say yes");
    });
    // And every refile door is handed the SAME answer -- gathered above the
    // branch, off the same read -- so a line the carriers sent back is refused
    // the same way whichever way it is being sent again: corrected in place,
    // replaced, or a rehearsal taken off for a real one. It used to be looked up
    // on the first-filing path only, and a resubmit went out saying customers
    // opt in by texting a number the workspace did not have.
    for (const [what, row, flags] of [
      ["resubmit", rejected({ e164: null }), { refile: true }],
      ["replace", rejected({ e164: null }), { refile: true, replace: true }],
      ["rehearsal made real", rehearsal({ e164: null }), { refile: true }],
    ]) {
      const tables = world({ lines: [row], business_records: [RECORD], tenant_channels: [] });
      const db = use(tables, rpcs);
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, ...flags }));
      assert.equal(status, 409, `${what}: ${JSON.stringify(body)}`);
      assert.equal(body.error, "record_incomplete", what);
      assert.ok(body.problems.some((p) => /has to be true/.test(p)), `${what}: nobody can say yes, and this door said so too`);
      assert.ok(!body.problems.some((p) => /Billing probe/.test(p)), `${what}: the name is right -- this refusal is about the number alone`);
      assert.deepEqual(tables.lines[0], row, `${what}: the row keeps the carriers' verdict`);
      assert.equal(reads(db, "tenant_channels").length, 1, `${what}: the door looked for a texting row before answering`);
    }
  } finally { net.restore(); }
  assert.deepEqual(vault, [], "no refusal reached for a credential");
  assert.equal(net.seen.length, 0);

  // An active texting row of this workspace beside that same line is enough, and the filing goes.
  const says = world({
    lines: [unfiled({ e164: null })], business_records: [RECORD],
    tenant_channels: [{ id: "ch-wa", tenant_id: A, kind: "whatsapp", status: "active", external_id: "wa-1", number_e164: "+13055550199" }, { id: "ch-old", tenant_id: A, kind: "sms", status: "disabled", external_id: "+13055550188" }],
  });
  const db = use(says, VAULT);
  let n = 0;
  const carrier = wire((req) => (req.url.endsWith("/Evaluations") ? { status: 201, body: { status: "compliant" } } : { status: 201, body: { sid: `YES${String(++n).padStart(4, "0")}` } }));
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
      assert.equal(status, 200, JSON.stringify(body));
    });
  } finally { carrier.restore(); }
  const asked = reads(db, "tenant_channels")[0];
  assert.ok(asked.filters.some(([op, col, val]) => op === "eq" && col === "tenant_id" && val === A), "this workspace's rows");
  assert.ok(asked.filters.some(([op, col, val]) => op === "eq" && col === "status" && val === "active"), "active ones");
  assert.ok(asked.filters.some(([op, col, val]) => op === "in" && col === "kind" && [...val].sort().join() === "sms,whatsapp"), "of either texting kind");
  assert.match(form(carrier.seen.at(-1)).getAll("MessageSamples").at(-1), /Reply here and we will pick it up/, "and the sample that would show the line's number does not invent one");

  // The mirror on the free door: the same active texting row beside a refused
  // campaign with no number of its own is enough, and the correction goes out
  // -- one edit of the instance, under a lapsed card, with the sample that
  // would show a number not inventing one. This is the read above the branch
  // reaching the refile path; `!!row.data.e164` on its own would have refused it.
  const corrected = world({
    billing_accounts: [billing("past_due")],
    lines: [rejected({ e164: null })], business_records: [RECORD],
    tenant_channels: [{ id: "ch-wa", tenant_id: A, kind: "whatsapp", status: "active", external_id: "wa-1", number_e164: "+13055550199" }],
  });
  const free = use(corrected, VAULT);
  const edit = wire((req) => {
    if (req.method === "POST" && req.url === "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p/QE0001") return { status: 200, body: { sid: "QE0001", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    const [status, body] = await answer(await knock({ op: "register", line_id: LINE, refile: true }));
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual([body.resubmitted, body.smsState], [true, "registering"]);
  } finally { edit.restore(); }
  assert.deepEqual(edit.seen.map((r) => [r.method, path1(r.url)]), [["POST", "Services/MG0001/Compliance/Usa2p/QE0001"]], "the same campaign, edited");
  assert.match(form(edit.seen[0]).getAll("MessageSamples").at(-1), /Reply here and we will pick it up/);
  assert.equal(reads(free, "tenant_channels").length, 1, "the texting row is what let it through");
  assert.equal(reads(free, "billing_accounts").length, 0, "and it is still the free door");
  assert.equal(corrected.lines[0].sms_state, "registering");
});

/* ---------------------------- registration-status ------------------------- */

test("registration-status reads where the carriers stand without asking the spend rule, writes the verdict to the row, and rings the bell once on the change", async () => {
  const tables = world({ billing_accounts: [billing("past_due")], lines: [filed({ sms_state: "registering" })] });
  const db = use(tables, VAULT);
  const reply = (req) => {
    if (req.url === "https://messaging.twilio.com/v1/a2p/BrandRegistrations/BN0001") return { status: 200, body: { status: "APPROVED", failure_reason: null } };
    if (req.url === "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p") return { status: 200, body: { compliance: [{ campaign_status: "VERIFIED", mock: false, errors: [] }], meta: {} } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  };
  const carrier = wire(reply);
  try {
    await withEnv(TWILIO, async () => {
      assert.deepEqual(await answer(await knock({ op: "registration-status", line_id: LINE })), [200, { ok: true, smsState: "active", brand: "APPROVED", campaign: "VERIFIED", told: true }]);
    });
  } finally { carrier.restore(); }
  assert.equal(reads(db, "billing_accounts").length, 0, "a read costs nothing, so a lapsed card does not stop it");
  assert.deepEqual(carrier.seen.map((r) => [r.method, path1(r.url)]), [["GET", "a2p/BrandRegistrations/BN0001"], ["GET", "Services/MG0001/Compliance/Usa2p"]], "two reads, nothing filed");
  assert.ok(carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH));
  const row = tables.lines[0];
  assert.deepEqual([row.sms_state, row.last_error, row.reg_mock], ["active", null, false], "a verified campaign IS the permission: the inbound path stops holding texts");
  assert.notEqual(row.state_since, "2026-09-10T00:00:00Z", "the clock restarts because the state moved");
  assert.equal(tables.notifications.length, 1);
  const bell = tables.notifications[0];
  assert.deepEqual([bell.tenant_id, bell.kind, bell.title, bell.route, bell.subject_type, bell.subject_id], [A, "number", "Texting is on: +1 (305) 555-0100", "admin/integrations", "line", LINE]);
  assert.deepEqual(tables.events.map((e) => [e.kind, e.subject_id, e.data]), [["line.texting_on", LINE, { e164: NUMBER, from: "registering", to: "active", mock: false }]]);

  // Asked again with nothing changed: the row is confirmed, nobody is told twice.
  const again = wire(reply);
  try {
    await withEnv(TWILIO, async () => {
      assert.deepEqual(await answer(await knock({ op: "registration-status", line_id: LINE })), [200, { ok: true, smsState: "active", brand: "APPROVED", campaign: "VERIFIED", told: false }]);
    });
  } finally { again.restore(); }
  assert.equal(tables.notifications.length, 1);
  assert.equal(tables.events.length, 1);

  // Refused: the carriers' reasons, from the side that refused, in their words.
  const sent = world({ lines: [filed({ sms_state: "registering" })] });
  use(sent, VAULT);
  const refused = wire((req) => (req.url.includes("/BrandRegistrations/")
    ? { status: 200, body: { status: "APPROVED" } }
    : { status: 200, body: { compliance: [{ campaign_status: "FAILED", mock: false, errors: [{ description: "The campaign submission has been reviewed and it was rejected because of invalid campaign description.", error_code: 30886, fields: ["USE_CASE_DESCRIPTION"] }] }] } }));
  try {
    await withEnv(TWILIO, async () => {
      const [status, body] = await answer(await knock({ op: "registration-status", line_id: LINE }));
      assert.deepEqual([status, body.smsState, body.told], [200, "rejected", true]);
    });
  } finally { refused.restore(); }
  assert.equal(sent.lines[0].sms_state, "rejected");
  assert.equal(sent.lines[0].last_error, "invalid campaign description (30886 · USE_CASE_DESCRIPTION)", "the cause, without the preamble, on the row the back office reads");
  assert.equal(sent.events[0].kind, "line.texting_rejected");

  // A question we could not ask is reported as such, never as an answer.
  const unasked = world({ lines: [filed({ sms_state: "registering" })] });
  use(unasked, VAULT);
  const [s, b] = await answer(await knock({ op: "registration-status", line_id: LINE }));
  assert.deepEqual([s, b], [502, { ok: false, smsState: "registering", error: "no_provider" }], "the dry provider cannot ask the carriers");
  assert.equal(unasked.lines[0].sms_state, "registering", "and the row is not moved by a question that was not asked");
});

test("registration-status: once the carriers approve the brand, the campaign they were holding is filed by the next check — the wait finishes by itself, and the owner hears the brand is through", async () => {
  const tables = world({ billing_accounts: [billing("past_due")], lines: [filed({ sms_state: "registering", campaign_sid: null })], business_records: [RECORD] });
  const db = use(tables, VAULT);
  const carrier = wire((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "APPROVED" } };
    if (req.method === "GET" && req.url.endsWith("/Compliance/Usa2p")) return { status: 200, body: { compliance: [], meta: {} } };
    if (req.method === "POST" && req.url.endsWith("/Compliance/Usa2p")) return { status: 201, body: { sid: "QE0009", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "registration-status", line_id: LINE }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual([body.ok, body.smsState, body.brand, body.campaign, body.told, body.campaign_filed, body.campaign_sid], [true, "approved", "APPROVED", undefined, true, true, "QE0009"]);
    });
  } finally { carrier.restore(); }
  assert.deepEqual(carrier.seen.map((r) => [r.method, path1(r.url)]), [
    ["GET", "a2p/BrandRegistrations/BN0001"],
    ["GET", "Services/MG0001/Compliance/Usa2p"],
    ["POST", "Services/MG0001/Compliance/Usa2p"],
  ], "read both, then file the one thing that was waiting");
  const auto = form(carrier.seen[2]);
  assert.equal(auto.get("BrandRegistrationSid"), "BN0001");
  // The same pages as a filing made at `register`: this is the one filing that
  // finishes with nobody watching, and 30907 asks that the privacy policy be on
  // the opt-in page's domain -- the hosted page for this workspace, not ours.
  assert.equal(auto.get("PrivacyPolicyUrl"), "https://dash.test/b/harbor-moving");
  assert.equal(auto.get("TermsAndConditionsUrl"), "https://dash.test/b/harbor-moving/terms");
  assert.ok(namesPage(auto.get("MessageFlow"), "https://dash.test/yes/harbor-moving"), "the flow names this workspace's sign-up page and its paper form");
  assert.equal(auto.get("UsAppToPersonUsecase"), LOW_VOLUME_USECASE);
  assert.ok(carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH), "read and filed as the workspace's subaccount");
  const row = tables.lines[0];
  assert.equal(row.campaign_sid, "QE0009");
  assert.equal(row.reg_mock, false, "the campaign filed for an approved real brand is real: the row keeps saying so");
  assert.equal(row.sms_state, "registering", "with the carriers again, for the campaign this time");
  assert.equal(tables.notifications.length, 1);
  assert.equal(tables.notifications[0].title, "Your business is approved by the carriers");
  assert.deepEqual(tables.events.map((e) => [e.kind, e.data.from, e.data.to, e.data.mock]), [["line.texting_approved", "registering", "approved", false]]);
  // Documented, not endorsed: the campaign filed from HERE is the paid half of a
  // filing already gated at `register`, so this op asks the spend rule of nobody.
  assert.equal(reads(db, "billing_accounts").length, 0);

  // A rehearsal's brand approved: the campaign held for it is filed as a
  // rehearsal too -- the row's word, not a constant, decides which registry.
  const staged = world({ lines: [rehearsal({ sms_state: "registering", campaign_sid: null })], business_records: [RECORD] });
  use(staged, VAULT);
  const mockWire = wire((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "APPROVED" } };
    if (req.method === "GET" && req.url.endsWith("/Compliance/Usa2p")) return { status: 200, body: { compliance: [], meta: {} } };
    if (req.method === "POST" && req.url.endsWith("/Compliance/Usa2p")) return { status: 201, body: { sid: "QE0010", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "registration-status", line_id: LINE }));
      assert.deepEqual([status, body.campaign_filed, body.campaign_sid], [200, true, "QE0010"], JSON.stringify(body));
    });
  } finally { mockWire.restore(); }
  assert.equal(mockWire.seen.filter((r) => r.method === "POST").length, 1, "one campaign filed");
  assert.deepEqual([staged.lines[0].campaign_sid, staged.lines[0].reg_mock, staged.lines[0].sms_state], ["QE0010", true, "registering"], "still a rehearsal, on the row the next sync reads");
  assert.deepEqual(staged.events.map((e) => [e.kind, e.data.mock]), [["line.texting_approved", true]]);
});
