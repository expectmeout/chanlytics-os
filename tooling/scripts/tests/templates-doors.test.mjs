/**
 * The three template doors, run: POST /api/admin/whatsapp/templates-create,
 * /templates-sync and /templates-delete over a database in memory, a vault
 * that answers the number's own credentials, and a captured wire to Meta.
 * Until 13 Sep 2026 their text was pinned by three files and no POST of
 * theirs had ever been called.
 *
 * Meta approves the words; Chanlytics writes them, submits them, reads back
 * what Meta holds, and takes one away -- each on the number's own token,
 * never the environment's. Executed here: the knock and the workspace rule
 * on each; a template written here reaching Meta as written and kept as a
 * row with the person's labels, Meta's own words back when it says no and
 * Meta's category when it recategorises; a sync that upserts what Meta
 * returns and leaves the rest exactly as it was (the hand-written booking
 * template among it), keeps the labels a person gave, hides Meta's sample
 * on first sight only, and walks every page; a delete by name AND the
 * template's own id so one language goes, that never asks Meta about a row
 * with no id but still removes it here, and reads "not found" as done.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "./_fake-db.mjs";

// The doors read these at call time; each test file is its own process. No
// environment pair, so a channel without its own credentials gets none.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.BLOB_SHADOW = "off";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"]) delete process.env[k];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { GRAPH_VERSION } = await import(at("apps/edge/lib/meta-graph.ts"));
const create = await import(at("apps/edge/api/admin/whatsapp/templates-create.ts"));
const sync = await import(at("apps/edge/api/admin/whatsapp/templates-sync.ts"));
const del = await import(at("apps/edge/api/admin/whatsapp/templates-delete.ts"));
after(() => setPg(null));

const CREATE = "/api/admin/whatsapp/templates-create";
const SYNC = "/api/admin/whatsapp/templates-sync";
const DELETE = "/api/admin/whatsapp/templates-delete";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "11111111-1111-4111-8111-111111111111";
const T1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const T2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const PHONE = "1234567890123";
const WABA = "9876543210987";
const TOKEN = "EAAB-business-token-nobody-may-see";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/* ------------------------------- the knock -------------------------------- */

const token = (aud, o = {}) => signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? aud, { workspace: "workspace" in o ? o.workspace : A, user: OWNER });
const knockAt = (door, aud) => (body, headers = { "x-edge-token": token(aud) }) =>
  door.POST(new Request(`http://edge${aud}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const knockCreate = knockAt(create, CREATE);
const knockSync = knockAt(sync, SYNC);
const knockDelete = knockAt(del, DELETE);
const answer = async (res) => [res.status, await res.json()];

/** Set variables for one call and put every one of them back afterwards; `undefined` unsets. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
/** The doors' log lines, kept instead of printed. */
function quiet() {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...a) => lines.push(a.map(String).join(" "));
  return { lines, restore: () => Object.assign(console, real) };
}

/* -------------------------------- the world ------------------------------- */

/** The workspace's WhatsApp channel: its own credentials in Vault, its WABA on the row. */
const channel = (over = {}) => ({ id: "wa-a", tenant_id: A, kind: "whatsapp", external_id: PHONE, number_e164: "+15551234567", waba_id: WABA, status: "active", credentials_ref: "wa-creds-wa-a", config: {}, ...over });
/** A row as the templates table holds it. */
const row = (over = {}) => ({
  id: T1, tenant_id: A, channel: "whatsapp", name: "spring_offer", language: "en_US", meta_status: "approved", category: "marketing", meta_id: "tpl_spring",
  components: [{ type: "BODY", text: "Hi {{1}}, {{2}} is 20% off." }], body_preview: "Hi {{1}}, {{2}} is 20% off.", variables: [{ position: 1, label: "Value 1", example: "Dani" }, { position: 2, label: "Service", example: "Balayage" }],
  quality: "GREEN", rejected_reason: null, synced_at: "2026-09-01T00:00:00Z", source: "meta", created_by: null, hidden_at: null, title: null, created_at: "2026-09-01T00:00:00Z", ...over,
});
/** The database the doors will find, and the vault answering the channel's credentials. */
function use({ channels = [channel()], templates = [] } = {}, faults = {}) {
  const tables = { tenant_channels: channels, templates };
  const db = fakeDb(tables, faults, { get_channel_credentials: ({ p_channel_id }) => ({ access_token: `${TOKEN}-for-${p_channel_id}`, phone_id: PHONE }) });
  setPg(db);
  return { tables, db };
}
const writes = (db, table) => db.seen.filter((s) => s.table === table && ["insert", "update", "upsert", "delete"].includes(s.op));
const BEARER = `Bearer ${TOKEN}-for-wa-a`;

/** Meta's templates endpoint, answered by `reply`, every request kept. */
function meta(reply) {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = { url: String(url), method: init?.method ?? "GET", headers: init?.headers ?? {}, body: typeof init?.body === "string" ? JSON.parse(init.body) : null };
    seen.push(req);
    const a = reply(req) ?? {};
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}
/** A wire nothing may reach. */
function unreachable(why) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error(why); };
  return { restore: () => { globalThis.fetch = real; } };
}
/** Meta's own refusal, as the Graph API phrases one. */
const refused = (status, message, extra = {}) => ({ status, body: { error: { message, type: "OAuthException", code: 100, ...extra } } });
const printed = (x) => JSON.stringify(x);

/** The world before Meta is reached, checked once for all three doors. */
async function refusedBeforeMeta(knock, aud, good) {
  const { db } = use();
  const net = unreachable("a refused request must not reach Meta");
  try {
    assert.deepEqual(await answer(await knock(good, { "x-edge-token": token(aud === CREATE ? SYNC : CREATE) })), [403, { ok: false, error: "token_audience" }]);
    assert.deepEqual(await answer(await knock(good, { "x-edge-token": token(aud, { secret: "not-the-secret" }) })), [403, { ok: false, error: "token_signature" }]);
    assert.deepEqual(await answer(await knock(good, {})), [403, { ok: false }]);
    assert.deepEqual(await answer(await knock({ ...good, tenant_id: B })), [403, { ok: false, error: "workspace_mismatch" }]);
    assert.equal(db.seen.length, 0, "refused before anything is read");
    setPg(null);
    assert.equal((await knock(good)).status, 503, "no database");
  } finally { net.restore(); }
}

/* ================================== create ================================= */

const draft = (over = {}) => ({
  tenant_id: A, user_id: OWNER, name: "spring_offer", language: "en_US", category: "marketing",
  components: [{ type: "BODY", text: "Hi {{1}}, {{2}} is 20% off this week at {{3}}.", example: { body_text: [["Dani", "Balayage", "Harbor"]] } }, { type: "FOOTER", text: "Reply STOP to opt out" }],
  body: "Hi {{1}}, {{2}} is 20% off this week at {{3}}.", examples: ["Dani", "Balayage", "Harbor"], labels: ["First name", "The offer"],
  ...over,
});

test("create, the door: the knock, the workspace rule, no database; what Meta would refuse at the wire is refused here first; a workspace with no active channel, no WABA on it, or no credentials of its own sends nothing", async () => {
  await refusedBeforeMeta(knockCreate, CREATE, draft());
  const { db } = use();
  const net = unreachable("a refused template must not reach Meta");
  try {
    await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: "diag-key-for-this-file" }, async () => {
      assert.deepEqual(await answer(await knockCreate(draft({ tenant_id: undefined }), { "x-diag-key": "diag-key-for-this-file" })), [400, { ok: false, error: "bad_tenant" }]);
    });
    for (const bad of [{ name: "Spring Offer" }, { name: "" }, { language: undefined }, { category: "authentication" }, { components: undefined }, { body: undefined }]) {
      assert.deepEqual(await answer(await knockCreate(draft(bad))), [400, { ok: false, error: "bad_template" }], printed(bad));
    }
    assert.equal(db.seen.length, 0);
    assert.equal((await knockCreate("not json")).status, 400, "a body that is not JSON is a bad request, not an exception");
    use({ channels: [channel({ status: "disabled" })] });
    assert.deepEqual(await answer(await knockCreate(draft())), [409, { ok: false, error: "no_channel" }]);
    use({ channels: [channel({ waba_id: null })] });
    assert.deepEqual(await answer(await knockCreate(draft())), [409, { ok: false, error: "no_waba" }]);
    use({ channels: [channel({ credentials_ref: null })] });
    assert.deepEqual(await answer(await knockCreate(draft())), [503, { ok: false, error: "no_token" }], "a channel without its own credentials gets none -- never the environment's");
  } finally { net.restore(); }
});

test("create, the whole way: the template reaches Meta as written on the number's own token, with the door to recategorise; Meta's answer is the row's status, the person's labels are kept per slot, the row says it was made here and by whom; said twice it is one row", async () => {
  const { tables, db } = use();
  const m = meta(() => ({ body: { id: "tpl_new", status: "PENDING", category: "MARKETING" } }));
  let status, body;
  try { [status, body] = await answer(await knockCreate(draft({ labels: ["First name", "The offer", "x".repeat(60)] }))); } finally { m.restore(); }
  assert.equal(status, 200, printed(body));
  assert.equal(m.seen.length, 1);
  const [req] = m.seen;
  assert.equal(req.url, `${GRAPH}/${WABA}/message_templates`);
  assert.equal(req.method, "POST");
  assert.equal(req.headers.authorization, BEARER, "the number's own credentials, from Vault");
  assert.deepEqual(req.body, { name: "spring_offer", language: "en_US", category: "MARKETING", components: draft().components, allow_category_change: true }, "as written, and Meta may recategorise instead of rejecting");
  assert.equal(tables.templates.length, 1);
  const saved = tables.templates[0];
  assert.deepEqual([saved.tenant_id, saved.channel, saved.name, saved.language, saved.meta_status, saved.category, saved.meta_id, saved.source, saved.created_by, saved.rejected_reason], [A, "whatsapp", "spring_offer", "en_US", "pending", "marketing", "tpl_new", "chanlytics", OWNER, null]);
  assert.deepEqual(saved.components, draft().components);
  assert.equal(saved.body_preview, draft().body);
  assert.deepEqual(saved.variables, [
    { position: 1, label: "First name", example: "Dani" },
    { position: 2, label: "The offer", example: "Balayage" },
    { position: 3, label: "x".repeat(40), example: "Harbor" },
  ], "the words a person gave each slot, trimmed to forty; Meta's examples beside them");
  assert.ok(Number.isFinite(Date.parse(saved.synced_at)));
  assert.deepEqual(writes(db, "templates")[0].conflict, ["tenant_id", "channel", "name", "language"], "one row per template and language");
  assert.deepEqual(body, { ok: true, id: saved.id, meta_id: "tpl_new", meta_status: "pending" });
  assert.ok(!printed(body).includes(TOKEN));

  // Submitted again: Meta approves at once this time. Still one row, brought up to date.
  const again = meta(() => ({ body: { id: "tpl_new_2", status: "APPROVED", category: "UTILITY" } }));
  try { [status, body] = await answer(await knockCreate(draft({ labels: [] }))); } finally { again.restore(); }
  assert.equal(status, 200);
  assert.equal(tables.templates.length, 1, "said twice makes one row");
  assert.deepEqual([tables.templates[0].meta_status, tables.templates[0].category, tables.templates[0].meta_id], ["approved", "utility", "tpl_new_2"], "Meta's category wins when it recategorises, and its status is the row's");
  assert.deepEqual(tables.templates[0].variables.map((v) => v.label), ["Value 1", "Value 2", "Value 3"], "no label given: a plain name for the slot");
});

test("create, Meta says no: its own words come back so the person can fix the message rather than guess, and no row is written", async () => {
  const { tables } = use();
  const m = meta(() => ({ status: 400, body: { error: { message: "Invalid parameter", error_user_msg: "The template body must not start with a variable.", code: 100 } } }));
  let status, body;
  try { [status, body] = await answer(await knockCreate(draft())); } finally { m.restore(); }
  assert.deepEqual([status, body], [502, { ok: false, error: "meta_refused", detail: "The template body must not start with a variable." }], "error_user_msg over the generic message");
  assert.equal(tables.templates.length, 0);
  const plain = meta(() => refused(400, "(#100) Invalid parameter"));
  try { [status, body] = await answer(await knockCreate(draft())); } finally { plain.restore(); }
  assert.deepEqual([status, body.detail], [502, "(#100) Invalid parameter"], "the message when there is nothing kinder");
});

/* =================================== sync ================================== */

/** A template as Meta lists it. */
const listed = (over = {}) => ({
  id: "tpl_spring", name: "spring_offer", language: "en_US", status: "APPROVED", category: "MARKETING", quality_score: { score: "GREEN" }, rejected_reason: "NONE",
  components: [{ type: "BODY", text: "Hi {{1}}, {{2}} is 20% off this week at {{3}}.", example: { body_text: [["Dani", "Balayage", "Harbor"]] } }, { type: "FOOTER", text: "Reply STOP to opt out" }],
  ...over,
});
const LIST_URL = `${GRAPH}/${WABA}/message_templates?fields=id,name,language,status,category,components,quality_score,rejected_reason&limit=100`;

test("sync, the door: the knock, the workspace rule, no database, a bad workspace id; a channel read that fails, no channel, no WABA, no credentials; Meta refusing the list -- none writes a row", async () => {
  await refusedBeforeMeta(knockSync, SYNC, { tenant_id: A });
  const net = unreachable("a refused sync must not reach Meta");
  try {
    await withEnv({ EDGE_CALL_SECRET: undefined, DIAG_KEY: "diag-key-for-this-file" }, async () => {
      assert.deepEqual(await answer(await knockSync({ tenant_id: "nope" }, { "x-diag-key": "diag-key-for-this-file" })), [400, { ok: false, error: "bad_tenant" }]);
    });
    use({}, { "tenant_channels.select": { message: "connection reset" } });
    assert.deepEqual(await answer(await knockSync({ tenant_id: A })), [500, { ok: false, error: "channel_read_failed", detail: "connection reset" }]);
    use({ channels: [] });
    assert.deepEqual(await answer(await knockSync({ tenant_id: A })), [409, { ok: false, error: "no_channel" }]);
    use({ channels: [channel({ waba_id: null })] });
    assert.deepEqual(await answer(await knockSync({ tenant_id: A })), [409, { ok: false, error: "no_waba" }]);
    use({ channels: [channel({ credentials_ref: null })] });
    assert.deepEqual(await answer(await knockSync({ tenant_id: A })), [503, { ok: false, error: "no_token" }]);
  } finally { net.restore(); }
  const { tables, db } = use({ templates: [row()] });
  const m = meta(() => refused(401, "Invalid OAuth access token - Cannot parse access token", { code: 190 }));
  let status, body;
  try { [status, body] = await answer(await knockSync({ tenant_id: A })); } finally { m.restore(); }
  assert.deepEqual([status, body], [502, { ok: false, error: "meta_failed", detail: "Invalid OAuth access token - Cannot parse access token" }]);
  assert.equal(writes(db, "templates").length, 0);
  assert.deepEqual(tables.templates, [row()], "the rows are exactly as they were");
});

test("sync, the whole way: every template Meta returns is upserted on (tenant, channel, name, language) with the labels a person gave kept where the positions match; a row Meta does not return is left exactly as it was; Meta's sample is hidden on first sight and only then; every page is walked", async () => {
  const handWritten = row({ id: T2, name: "booking_link", meta_id: null, source: "meta", meta_status: "approved", variables: [{ position: 1, label: "Business name", example: "Harbor" }, { position: 2, label: "Booking link", example: "https://b.example" }] });
  const { tables, db } = use({ templates: [row(), handWritten] });
  const page2 = `${GRAPH}/${WABA}/message_templates?after=cursor-2`;
  const m = meta((req) => {
    if (req.url === LIST_URL) return { body: { data: [listed(), listed({ id: "tpl_visit", name: "visit_reminder", language: "es", status: "PENDING", category: "UTILITY", components: [{ type: "BODY", text: "Hola {{1}}, te esperamos el {{2}}." }] })], paging: { next: page2 } } };
    if (req.url === page2) return { body: { data: [listed({ id: "tpl_hello", name: "hello_world", language: "en_US", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Welcome and congratulations!!" }] })], paging: {} } };
    throw new Error(`unexpected ${req.url}`);
  });
  const log = quiet();
  let status, body;
  try { [status, body] = await answer(await knockSync({ tenant_id: A })); } finally { log.restore(); m.restore(); }
  assert.equal(status, 200, printed(body));
  assert.deepEqual(m.seen.map((r) => [r.url, r.headers.authorization]), [[LIST_URL, BEARER], [page2, BEARER]], "the WABA on the channel, the number's own credentials, and the second page where Meta said it was");
  assert.equal(body.seen, 3);
  assert.equal(body.approved, 2);
  assert.equal(body.marketing, 1, "approved AND marketing: what needs the customer's yes");
  assert.ok(Number.isFinite(Date.parse(body.synced_at)));

  assert.equal(tables.templates.length, 4, "two updated, one added, one left alone");
  const spring = tables.templates.find((t) => t.name === "spring_offer");
  assert.equal(spring.id, T1, "the same row");
  assert.deepEqual(spring.variables, [
    { position: 1, label: "Value 1", example: "Dani" }, { position: 2, label: "Service", example: "Balayage" }, { position: 3, label: "Value 3", example: "Harbor" },
  ], "the label a person gave survives a sync; the slot Meta added is named plainly");
  assert.deepEqual([spring.meta_status, spring.category, spring.quality, spring.synced_at, spring.body_preview], ["approved", "marketing", "GREEN", body.synced_at, "Hi {{1}}, {{2}} is 20% off this week at {{3}}."]);
  assert.equal(spring.hidden_at, null, "a row on file keeps what the workspace decided");
  const visit = tables.templates.find((t) => t.name === "visit_reminder");
  assert.deepEqual([visit.language, visit.meta_status, visit.category, visit.meta_id, visit.hidden_at], ["es", "pending", "utility", "tpl_visit", undefined]);
  const hello = tables.templates.find((t) => t.name === "hello_world");
  assert.equal(hello.hidden_at, body.synced_at, "Meta's sample lives in every new account and is nobody's message: hidden from the composers on first sight");
  assert.deepEqual(tables.templates.find((t) => t.id === T2), handWritten, "the one hand-written row, which Meta does not return, is untouched -- a sync that could silence it is not a sync");
  for (const w of writes(db, "templates")) {
    assert.equal(w.op, "upsert", "no delete, no blanket status");
    assert.deepEqual(w.conflict, ["tenant_id", "channel", "name", "language"]);
  }
  assert.ok(!printed(body).includes(TOKEN) && !log.lines.some((l) => l.includes(TOKEN)));

  // The next sync: the workspace un-hid the sample meanwhile, and the sync does not hide it again.
  hello.hidden_at = null;
  const again = meta(() => ({ body: { data: [listed({ id: "tpl_hello", name: "hello_world", language: "en_US", status: "APPROVED", category: "UTILITY" })], paging: {} } }));
  try { [status] = await answer(await knockSync({ tenant_id: A })); } finally { again.restore(); }
  assert.equal(status, 200);
  assert.equal(tables.templates.find((t) => t.name === "hello_world").hidden_at, null, "only on first sight: hidden_at is not in the upsert for a row on file");
  assert.equal(tables.templates.length, 4);
});

/* ================================== delete ================================= */

test("delete, the door: the knock, the workspace rule, no database, ids that are not ids; another workspace's template is not found; no WABA, no credentials -- none reaches Meta", async () => {
  await refusedBeforeMeta(knockDelete, DELETE, { tenant_id: A, template_id: T1 });
  const net = unreachable("a refused delete must not reach Meta");
  try {
    for (const body of [{ tenant_id: A }, { tenant_id: A, template_id: "tpl_spring" }]) {
      assert.deepEqual(await answer(await knockDelete(body)), [400, { ok: false, error: "bad_request" }], printed(body));
    }
    assert.deepEqual(await answer(await knockDelete({ tenant_id: "nope", template_id: T1 }, { "x-edge-token": token(DELETE, { workspace: null }) })), [400, { ok: false, error: "bad_request" }], "a token about no workspace, and a body naming something that is not one");
    const { tables } = use({ templates: [row({ tenant_id: B })] });
    assert.deepEqual(await answer(await knockDelete({ tenant_id: A, template_id: T1 })), [404, { ok: false, error: "not_found" }], "the read is scoped to the workspace: B's template does not exist as far as A can see");
    assert.equal(tables.templates.length, 1);
    use({ channels: [channel({ waba_id: null })], templates: [row()] });
    assert.deepEqual(await answer(await knockDelete({ tenant_id: A, template_id: T1 })), [409, { ok: false, error: "no_waba" }]);
    use({ channels: [channel({ credentials_ref: null })], templates: [row()] });
    assert.deepEqual(await answer(await knockDelete({ tenant_id: A, template_id: T1 })), [503, { ok: false, error: "no_token" }]);
  } finally { net.restore(); }
});

test("delete, the whole way: by name AND the template's own id so one language goes and not every language of that name; gone at Meta is gone here; a template Meta no longer has is deleted here anyway; a refusal leaves the row", async () => {
  const { tables } = use({ templates: [row(), row({ id: T2, language: "es", meta_id: "tpl_spring_es" })] });
  const m = meta(() => ({ body: { success: true } }));
  let status, body;
  try { [status, body] = await answer(await knockDelete({ tenant_id: A, template_id: T1 })); } finally { m.restore(); }
  assert.deepEqual([status, body], [200, { ok: true, id: T1, name: "spring_offer", at_meta: true }]);
  assert.equal(m.seen.length, 1);
  const u = new URL(m.seen[0].url);
  assert.equal(`${u.origin}${u.pathname}`, `${GRAPH}/${WABA}/message_templates`);
  assert.equal(m.seen[0].method, "DELETE");
  assert.deepEqual([u.searchParams.get("name"), u.searchParams.get("hsm_id")], ["spring_offer", "tpl_spring"], "REGRESSION: ?name= alone is every language of that name, gone, with the name locked for thirty days");
  assert.equal(m.seen[0].headers.authorization, BEARER);
  assert.deepEqual(tables.templates.map((t) => t.id), [T2], "the English row is gone; the Spanish one, same name, stays");

  // Meta no longer has it: the row was the stale one.
  const stale = use({ templates: [row()] });
  const gone = meta(() => refused(400, "(#100) Unsupported get request. Object with ID 'tpl_spring' does not exist"));
  try { [status, body] = await answer(await knockDelete({ tenant_id: A, template_id: T1 })); } finally { gone.restore(); }
  assert.deepEqual([status, body], [200, { ok: true, id: T1, name: "spring_offer", at_meta: false }], "not found at Meta is a delete that already happened");
  assert.equal(stale.tables.templates.length, 0);
  const missing = use({ templates: [row()] });
  const four = meta(() => ({ status: 404, body: {} }));
  try { [status, body] = await answer(await knockDelete({ tenant_id: A, template_id: T1 })); } finally { four.restore(); }
  assert.deepEqual([status, body.at_meta, missing.tables.templates.length], [200, false, 0]);

  // Meta refuses for any other reason: the row stays, and Meta's words come back.
  const kept = use({ templates: [row()] });
  const no = meta(() => refused(400, "(#100) Invalid parameter"));
  try { [status, body] = await answer(await knockDelete({ tenant_id: A, template_id: T1 })); } finally { no.restore(); }
  assert.deepEqual([status, body], [502, { ok: false, error: "meta_refused", detail: "(#100) Invalid parameter" }]);
  assert.equal(kept.tables.templates.length, 1, "sends that name it must keep working until Meta agrees it is gone");
});

test("delete, a row that was never synced: no template id on file, so Meta is not asked -- by name alone it would take every language and lock the name -- and the row is still removed from here, because a sync can never fill in an id for a template Meta never had", async () => {
  const { tables } = use({ templates: [row({ id: T2, name: "booking_link", meta_id: null })] });
  const net = unreachable("a row with no id must never be sent to Meta by name");
  const log = quiet();
  let status, body;
  try { [status, body] = await answer(await knockDelete({ tenant_id: A, template_id: T2 })); } finally { log.restore(); net.restore(); }
  assert.deepEqual([status, body], [200, { ok: true, id: T2, name: "booking_link", at_meta: false }]);
  assert.equal(tables.templates.length, 0, "REGRESSION: refusing the local delete too left the row undeletable for ever");
  assert.ok(log.lines.some((l) => l.startsWith("wa_template_delete_unsynced") && l.includes("booking_link")), "said in the log");
});
