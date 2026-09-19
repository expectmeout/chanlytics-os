/**
 * Every tenant table keeps its tenancy -- on a real Postgres with real
 * sessions.
 *
 * Forty tables carry a tenant_id, and each got its policies when it was
 * built; four suites prove four of them with real sessions and the rest were
 * proved by reading SQL. This is the proof across the schema: for every
 * table, a member of the workspace reads what the policy says a member reads
 * (the workspace's rows, their own rows, or nothing -- the service role's
 * tables), a member of another workspace reads none of it and can neither
 * change, remove nor add a row in it, and a viewer changes nothing anywhere.
 * For the service role's tables "nothing" is the privilege itself refused
 * (42501), not an empty list: RLS with no policy and a forgotten revoke read
 * the same until someone grants the second one something.
 * The list of tables is checked against the database's own description of
 * itself (PostgREST's OpenAPI root), so a tenant table nobody added a proof
 * for fails here by name.
 *
 * The sessions are real: users are made with the admin API and sign in with
 * a password through the anon key, so RLS judges them as the dashboard's
 * client would. Runs the way activations.db.test.mjs does, against the
 * database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite makes users and rows in every table"
    : !ANON
      ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
      : false;

let db;
let A; // the workspace under test
let B; // another workspace
const users = [];
const ctx = {}; // ids the fixtures need
let viewer; // a member of A who may only read
let owner; // another member of A: for the own-rows tables, someone else
let stranger; // an owner of B
const probes = []; // service-only rows to remove after

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant) {
  const email = `tenancy-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

async function seed(table, row, pick = "id") {
  const q = db.from(table).insert(row);
  const r = pick ? await q.select(pick).single() : await q;
  assert.equal(r.error, null, `seeding ${table}: ${r.error?.message}`);
  return pick ? r.data[pick] : null;
}

/** Rows some tables get from the workspace's own creation (00017 provisions them). */
async function ensure(table, row) {
  const has = await db.from(table).select("tenant_id").eq("tenant_id", A).limit(1);
  assert.equal(has.error, null, `${table}: ${has.error?.message}`);
  if (has.data.length === 0) await seed(table, row, null);
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const a = await db.from("tenants").insert({ slug: `tenancy-${Date.now()}`, name: "Tenancy" }).select("id").single();
  assert.equal(a.error, null, a.error?.message);
  A = a.data.id;
  const b = await db.from("tenants").insert({ slug: `tenancy-other-${Date.now()}`, name: "Other" }).select("id").single();
  assert.equal(b.error, null, b.error?.message);
  B = b.data.id;
  viewer = await memberClient("viewer", A);
  owner = await memberClient("owner", A);
  stranger = await memberClient("owner", B);
  ctx.viewerId = viewer.userId;
  ctx.ownerId = owner.userId;
  ctx.strangerId = stranger.userId;

  // One row per tenant table, in dependency order. A second contact and
  // conversation exist so a stranger's attempted insert is refused by RLS,
  // never by a unique index on the first.
  ctx.contact = await seed("contacts", { tenant_id: A, phone_e164: "+15550001001" });
  ctx.contact2 = await seed("contacts", { tenant_id: A, phone_e164: "+15550001002" });
  await seed("contact_identities", { tenant_id: A, contact_id: ctx.contact, channel: "whatsapp", external_id: "15550001001" });
  ctx.conversation = await seed("conversations", { tenant_id: A, contact_id: ctx.contact });
  ctx.conversation2 = await seed("conversations", { tenant_id: A, contact_id: ctx.contact2 });
  await seed("messages", { tenant_id: A, conversation_id: ctx.conversation, contact_id: ctx.contact, channel: "whatsapp", direction: "outbound", sender: "human", type: "text", body: "tenancy probe", status: "queued" });
  await seed("calls", { tenant_id: A, retell_call_id: "call_tenancy_1" });
  await seed("escalations", { tenant_id: A, conversation_id: ctx.conversation, reason: "manual", details: "tenancy" });
  await seed("decisions", { tenant_id: A, actor_type: "system", subject_type: "conversation", subject_id: ctx.conversation, verb: "archive" });
  await seed("events", { tenant_id: A, kind: "message.received" });
  ctx.notification = await seed("notifications", { tenant_id: A, kind: "alert", title: "tenancy", body: "probe" });
  await seed("notification_reads", { tenant_id: A, user_id: ctx.viewerId }, null);
  await seed("notification_marks", { notification_id: ctx.notification, user_id: ctx.viewerId }, null);
  ctx.thread = await seed("ask_threads", { tenant_id: A, user_id: ctx.viewerId });
  await seed("ask_messages", { tenant_id: A, thread_id: ctx.thread, user_id: ctx.viewerId, role: "user", content: { text: "hi" } });
  await seed("invitations", { tenant_id: A, email: "invited-1@example.com", invited_by: ctx.ownerId, role: "viewer" });
  ctx.template = await seed("templates", { tenant_id: A, channel: "whatsapp", name: "tenancy_tpl_1", language: "en_US" });
  ctx.broadcast = await seed("broadcasts", { tenant_id: A, name: "tenancy run", template_id: ctx.template, template_name: "tenancy_tpl_1", template_language: "en_US", scheduled_for: new Date().toISOString() });
  await seed("broadcast_recipients", { tenant_id: A, broadcast_id: ctx.broadcast, contact_id: ctx.contact }, null);
  await seed("playbooks", { tenant_id: A, name: "tenancy playbook", policy_class: "reengage", template_id: ctx.template, template_language: "en_US", template_name: "tenancy_tpl_1", trigger: "quiet_30" });
  ctx.segment = await seed("segments", { tenant_id: A, name: "tenancy segment" });
  await seed("segment_members", { tenant_id: A, segment_id: ctx.segment, contact_id: ctx.contact }, null);
  await ensure("policies", { tenant_id: A, class: "reply", mode: "auto" });
  await ensure("tenant_config", { tenant_id: A });
  await ensure("billing_accounts", { tenant_id: A });
  await seed("billing_events", { id: `evt_tenancy_${Date.now()}`, type: "invoice.paid", tenant_id: A }, null);
  await seed("business_records", { tenant_id: A, legal_name: "Tenancy LLC", street: "1 Main St", city: "Brooklyn", region: "NY", postal_code: "11201", contact_first_name: "M", contact_last_name: "S", contact_email: "m@example.com", contact_phone: "+16460000000", website_url: "https://example.com" }, null);
  await seed("capability_activations", { tenant_id: A, capability: "voice" }, null);
  await seed("lines", { tenant_id: A, provider: "dry", kind: "chanlytics", e164: "+15550002001" });
  await seed("mailboxes", { tenant_id: A, local_part: `tenancy-${Date.now().toString(36)}`, reply_token: "t".repeat(24), from_name: "Tenancy" });
  await seed("tenant_channels", { tenant_id: A, kind: "whatsapp", external_id: "tenancy-wa-1" });
  await seed("google_connections", { tenant_id: A, account_name: "accounts/tenancy" }, null);
  await seed("google_listings", { tenant_id: A, place_id: "ChIJtenancy1", name: "Tenancy Salon" }, null);
  await seed("google_listing_days", { tenant_id: A, day: "2026-09-01", review_count: 1 }, null);
  await seed("google_reviews", { tenant_id: A, review_id: "tenancy-review-1" }, null);
  await seed("idempotency_keys", { tenant_id: A, key: "tenancy-key-1", route: "POST /x" }, null);
  await seed("jobs", { tenant_id: A, kind: "blob_thread_erase", due_at: new Date().toISOString(), payload: {} });

  // The lead finder (00139), in dependency order. The round is the search's
  // first (the guard allows one live round, and seq 1 needs no session).
  ctx.leadSearch = await seed("lead_searches", { tenant_id: A, via: "people", card: "local_businesses", name: "tenancy search", asked: "tenancy", plan: {} });
  ctx.leadRound = await seed("lead_rounds", { tenant_id: A, search_id: ctx.leadSearch, seq: 1, purpose: "probe", plan: {}, plan_version: 1, target: 5, month: "2026-09", day: "2026-09-19" });
  await seed("lead_runs", { tenant_id: A, round_id: ctx.leadRound, purpose: "discover", actor: "card-a", build: "1", webhook_token_hash: "tenancy" });
  await seed("lead_judgments", { tenant_id: A, round_id: ctx.leadRound, op_id: `tenancy-${Date.now()}`, answer: {} }, null);
  ctx.lead = await seed("leads", { tenant_id: A, place_id: "ChIJtenancy0001", business_name: "Tenancy Salon" });
  await seed("lead_places", { tenant_id: A, lead_id: ctx.lead, place_id: "ChIJtenancy0002" }, null);
  await seed("lead_search_members", { tenant_id: A, search_id: ctx.leadSearch, lead_id: ctx.lead, round_id: ctx.leadRound, class: "review" }, null);
  await seed("lead_counters", { tenant_id: A, kind: "allowance", period: "2026-09" }, null);
  await seed("lead_operations", { tenant_id: A, kind: "keep", search_id: ctx.leadSearch, lead_ids: [ctx.lead], version: 1 }, null);
  await seed("lead_preferences", { tenant_id: A, kind: "chain" }, null);
  await seed("lead_suppressions", { tenant_id: A, kind: "place", hash: "tenancy", what: "customer" }, null);

  // The service role's own tables, seeded so "a member reads nothing" is not
  // proved on an empty table. A platform admin is a user who is nobody's
  // member, so the grant widens no session this suite signs in with.
  const nobody = await db.auth.admin.createUser({ email: `tenancy-nobody-${Date.now()}@example.com`, password: `pw-${Math.random().toString(36).slice(2)}-Aa1!`, email_confirm: true });
  assert.equal(nobody.error, null, nobody.error?.message);
  users.push(nobody.data.user.id);
  ctx.nobodyId = nobody.data.user.id;
  const key = `tenancy-${Date.now()}`;
  await seed("operator_pages", { key }, null); probes.push(["operator_pages", "key", key]);
  await seed("platform_admins", { user_id: ctx.nobodyId }, null); probes.push(["platform_admins", "user_id", ctx.nobodyId]);
  await seed("rate_hits", { actor: key, bucket: "tenancy" }, null); probes.push(["rate_hits", "actor", key]);
  await seed("waitlist", { email: `${key}@example.com` }, null); probes.push(["waitlist", "email", `${key}@example.com`]);
  // The lead finder's platform tables: the switch row is 00139's own; a prior is seeded and removed.
  const prior = `tenancy_${Date.now()}`;
  await seed("lead_niche_priors", { category_key: prior }, null); probes.push(["lead_niche_priors", "category_key", prior]);
});

after(async () => {
  if (skip) return;
  for (const [table, col, val] of probes) await db.from(table).delete().eq(col, val);
  if (A) await db.from("tenants").delete().eq("id", A);
  if (B) await db.from("tenants").delete().eq("id", B);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/**
 * What a member may read of each tenant table:
 *   member  the workspace's rows
 *   acting  the workspace's rows, for an operator or an owner; a viewer reads nothing
 *   own     their own rows only (user_id = auth.uid()); another member of the same workspace sees none of theirs
 *   none    nothing: the service role's table
 * And a second insert each, for the stranger's attempt: unique on the first row must not be what refuses it.
 * The partitions of events (events_default, a month's events_YYYY_MM) are events: PostgREST does not
 * describe them, and a row written to events is read through events.
 */
const TENANT_TABLES = {
  contacts: ["member", () => ({ tenant_id: A, phone_e164: "+15550001003" })],
  contact_identities: ["member", () => ({ tenant_id: A, contact_id: ctx.contact2, channel: "whatsapp", external_id: "15550001002" })],
  conversations: ["member", () => ({ tenant_id: A, contact_id: ctx.contact2 })],
  messages: ["member", () => ({ tenant_id: A, conversation_id: ctx.conversation2, contact_id: ctx.contact2, channel: "whatsapp", direction: "outbound", sender: "human", type: "text", body: "stranger", status: "queued" })],
  calls: ["member", () => ({ tenant_id: A, retell_call_id: "call_tenancy_2" })],
  escalations: ["member", () => ({ tenant_id: A, conversation_id: ctx.conversation2, reason: "manual", details: "stranger" })],
  decisions: ["member", () => ({ tenant_id: A, actor_type: "system", subject_type: "conversation", subject_id: ctx.conversation2, verb: "archive" })],
  events: ["member", () => ({ tenant_id: A, kind: "message.received" })],
  notifications: ["member", () => ({ tenant_id: A, kind: "alert", title: "stranger", body: "probe" })],
  notification_reads: ["own", () => ({ tenant_id: A, user_id: ctx.strangerId })],
  ask_threads: ["own", () => ({ tenant_id: A, user_id: ctx.strangerId })],
  ask_messages: ["own", () => ({ tenant_id: A, thread_id: ctx.thread, user_id: ctx.strangerId, role: "user", content: { text: "stranger" } })],
  memberships: ["own", () => ({ tenant_id: A, user_id: ctx.strangerId, role: "viewer" })],
  invitations: ["member", () => ({ tenant_id: A, email: "invited-2@example.com", invited_by: ctx.strangerId, role: "viewer" })],
  templates: ["member", () => ({ tenant_id: A, channel: "whatsapp", name: "tenancy_tpl_2", language: "en_US" })],
  broadcasts: ["member", () => ({ tenant_id: A, name: "stranger run", template_id: ctx.template, template_name: "tenancy_tpl_1", template_language: "en_US", scheduled_for: new Date().toISOString() })],
  broadcast_recipients: ["member", () => ({ tenant_id: A, broadcast_id: ctx.broadcast, contact_id: ctx.contact2 })],
  playbooks: ["member", () => ({ tenant_id: A, name: "stranger playbook", policy_class: "reengage", template_id: ctx.template, template_language: "en_US", template_name: "tenancy_tpl_1", trigger: "new_week" })],
  segments: ["member", () => ({ tenant_id: A, name: "stranger segment" })],
  segment_members: ["member", () => ({ tenant_id: A, segment_id: ctx.segment, contact_id: ctx.contact2 })],
  policies: ["member", () => ({ tenant_id: A, class: "faq", mode: "auto", subject_type: "contact", subject_id: ctx.contact2 })],
  tenant_config: ["member", () => ({ tenant_id: A })],
  billing_accounts: ["member", () => ({ tenant_id: A })],
  billing_events: ["none", () => ({ id: `evt_stranger_${Date.now()}`, type: "invoice.paid", tenant_id: A })],
  business_records: ["member", () => ({ tenant_id: A, legal_name: "Stranger LLC", street: "2 Main St", city: "Brooklyn", region: "NY", postal_code: "11201", contact_first_name: "S", contact_last_name: "T", contact_email: "s@example.com", contact_phone: "+16460000001", website_url: "https://example.org" })],
  capability_activations: ["member", () => ({ tenant_id: A, capability: "sms" })],
  lines: ["member", () => ({ tenant_id: A, provider: "dry", kind: "chanlytics", e164: "+15550002002" })],
  // One mailbox per workspace, so this insert would meet the unique index too; row-level security refuses it first, which is the proof.
  mailboxes: ["member", () => ({ tenant_id: A, local_part: `stranger-${Date.now().toString(36)}`, reply_token: "s".repeat(24), from_name: "Stranger" })],
  tenant_channels: ["member", () => ({ tenant_id: A, kind: "sms", external_id: "tenancy-sms-2" })],
  google_connections: ["member", () => ({ tenant_id: A, account_name: "accounts/stranger" })],
  google_listings: ["member", () => ({ tenant_id: A, place_id: "ChIJstranger", name: "Stranger Salon" })],
  google_listing_days: ["member", () => ({ tenant_id: A, day: "2026-09-02", review_count: 1 })],
  google_reviews: ["member", () => ({ tenant_id: A, review_id: "stranger-review" })],
  idempotency_keys: ["acting", () => ({ tenant_id: A, key: "stranger-key", route: "POST /x" })],
  jobs: ["none", () => ({ tenant_id: A, kind: "blob_thread_erase", due_at: new Date().toISOString(), payload: {} })],
  // The lead finder (00139): members read, nobody signed in writes a row; the
  // judgments and the counters are the service role's. The view runs under
  // the reader's own row security (security_invoker), and is not writable.
  lead_searches: ["member", () => ({ tenant_id: A, via: "people", card: "local_businesses", name: "stranger search", asked: "stranger", plan: {} })],
  lead_rounds: ["member", () => ({ tenant_id: A, search_id: ctx.leadSearch, seq: 2, purpose: "topup", plan: {}, plan_version: 1, target: 1, month: "2026-09", day: "2026-09-19" })],
  lead_runs: ["member", () => ({ tenant_id: A, round_id: ctx.leadRound, purpose: "discover", actor: "card-a", build: "1", webhook_token_hash: "stranger" })],
  lead_judgments: ["none", () => ({ tenant_id: A, round_id: ctx.leadRound, op_id: "stranger", answer: {} })],
  leads: ["member", () => ({ tenant_id: A, place_id: "ChIJstranger0001", business_name: "Stranger" })],
  lead_places: ["member", () => ({ tenant_id: A, lead_id: ctx.lead, place_id: "ChIJstranger0002" })],
  lead_search_members: ["member", () => ({ tenant_id: A, search_id: ctx.leadSearch, lead_id: ctx.lead, class: "review" })],
  lead_counters: ["none", () => ({ tenant_id: A, kind: "budget", period: "2026-09" })],
  lead_operations: ["member", () => ({ tenant_id: A, kind: "exclude", search_id: ctx.leadSearch, lead_ids: [ctx.lead], version: 1 })],
  lead_preferences: ["member", () => ({ tenant_id: A, kind: "too_far" })],
  lead_suppressions: ["member", () => ({ tenant_id: A, kind: "email", hash: "stranger", what: "email_opt_out" })],
  lead_searches_view: ["member", () => ({ tenant_id: A, via: "people", card: "local_businesses", name: "stranger", asked: "stranger", plan: {} })],
};

/** Tables without a tenant_id: scoped by the user, or the service role's, or the workspace row itself. */
const OTHER_TABLES = {
  tenants: "workspace", // read by membership on id; owners update their own
  notification_marks: "own",
  profiles: "people", // a person's own row, and the rows of people who share a workspace with them: not tenancy
  operator_pages: "none",
  platform_admins: "none",
  rate_hits: "none",
  sweep_status: "none",
  waitlist: "none",
  lead_platform: "none", // the switch, one row; read through lead_searches_on()
  lead_niche_priors: "none", // platform-wide priors; read through lead_niche_prior()
};

const seen = async (client, table, filter) => {
  let q = client.from(table).select("*").limit(5);
  for (const [col, val] of filter) q = q.eq(col, val);
  const r = await q;
  return r.error ? `error: ${r.error.message}` : r.data.length;
};
const nothing = (x) => x === 0 || (typeof x === "string" && x.startsWith("error:"));

/**
 * How a select was refused, for the service role's tables: the Postgres error
 * code, or what came back instead. A sibling of seen(), not a change to it:
 * seen() answers "how many rows" for every other table and every other check
 * here; this answers "was the privilege itself refused".
 */
const refusedWith = async (client, table, filter) => {
  let q = client.from(table).select("*").limit(5);
  for (const [col, val] of filter) q = q.eq(col, val);
  const r = await q;
  if (!r.error) return `${r.data.length} rows`;
  return r.error.code ?? `an error without a code: ${r.error.message}`;
};
/**
 * The service role's tables must refuse the PRIVILEGE, not only the rows. RLS
 * on with no policy answers a member with an empty list, and so does a table
 * that turned RLS on and forgot the revoke: the two read as equally safe until
 * someone grants the second one something. 42501 (insufficient_privilege) is
 * the only answer that says the grant itself is gone, so it is what every
 * "none" table is required to say -- to a viewer, an owner and a stranger
 * alike. Four tables (billing_events, jobs, platform_admins, sweep_status)
 * answered [] until 00120; this is the assertion that would have named them.
 */
const PRIVILEGE_REFUSED = "42501";
const notRefused = (who, how) => `the service role's table did not refuse ${who} the privilege (${PRIVILEGE_REFUSED}); it answered ${how}`;

test("the list of tenant tables is the database's own", { skip }, async () => {
  const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  assert.equal(res.status, 200, `PostgREST's root answered ${res.status}`);
  const spec = await res.json();
  const defs = spec.definitions ?? {};
  const names = Object.keys(defs).filter((n) => !/^events_/.test(n)); // a partition of events is events
  assert.ok(names.length > 30, `the database describes ${names.length} tables`);
  const missing = [];
  const spare = [];
  for (const n of names) {
    const tenantScoped = Boolean(defs[n].properties?.tenant_id);
    if (tenantScoped && !TENANT_TABLES[n]) missing.push(n);
    if (!tenantScoped && !OTHER_TABLES[n]) spare.push(n);
  }
  assert.deepEqual(missing, [], "a table with a tenant_id and no tenancy proof: add it to TENANT_TABLES with its fixture");
  assert.deepEqual(spare, [], "a table without a tenant_id that this suite does not know: say in OTHER_TABLES what scopes it");
  for (const n of Object.keys(TENANT_TABLES)) assert.ok(defs[n], `${n} is in the suite but not in the database`);
});

test("every tenant table: a member reads what the policy says, a stranger reads nothing, and neither a stranger nor a viewer writes", { skip }, async () => {
  const offences = [];
  const note = (table, what) => offences.push(`${table}: ${what}`);
  for (const [table, [mode, fixture]] of Object.entries(TENANT_TABLES)) {
    const before = await db.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", A);
    if (before.error) { note(table, `the service role could not count: ${before.error.message}`); continue; }
    if (!(before.count >= 1)) note(table, "nothing was seeded, so the proof would be vacuous");

    // Reads.
    const asViewer = await seen(viewer.client, table, [["tenant_id", A]]);
    const asStranger = await seen(stranger.client, table, [["tenant_id", A]]);
    if (mode === "member" && !(asViewer >= 1)) note(table, `a member (viewer) should read the workspace's rows, read ${asViewer}`);
    if (mode === "acting") {
      const asOwner = await seen(owner.client, table, [["tenant_id", A]]);
      if (!(asOwner >= 1)) note(table, `an acting member (owner) should read the workspace's rows, read ${asOwner}`);
      if (!nothing(asViewer)) note(table, `a viewer read an acting members' table (${asViewer})`);
    }
    if (mode === "own") {
      const mine = await seen(viewer.client, table, [["tenant_id", A], ["user_id", ctx.viewerId]]);
      const theirs = await seen(owner.client, table, [["tenant_id", A], ["user_id", ctx.viewerId]]);
      if (!(mine >= 1)) note(table, `a person should read their own rows, read ${mine}`);
      if (!nothing(theirs)) note(table, `another member of the workspace read a person's own rows (${theirs})`);
    }
    if (mode === "none" && !nothing(asViewer)) note(table, `the service role's table was readable by a member (${asViewer})`);
    if (!nothing(asStranger)) note(table, `a member of another workspace read ${asStranger}`);
    if (mode === "none") {
      // Empty is not enough for the service role's table (see PRIVILEGE_REFUSED): the grant must be gone.
      for (const [who, c] of [["a member (viewer)", viewer.client], ["a member of another workspace", stranger.client]]) {
        const how = await refusedWith(c, table, [["tenant_id", A]]);
        if (how !== PRIVILEGE_REFUSED) note(table, notRefused(who, how));
      }
    }

    if (mode === "own") {
      // A person's own rows stay in the workspace they were made in. The own
      // policies check who wrote a row, not where it lives, so the column grant
      // is what holds tenant_id (00121); before it, a person could re-file their
      // own Ask threads and messages under any workspace id.
      const moved = await viewer.client.from(table).update({ tenant_id: B }).eq("tenant_id", A).eq("user_id", ctx.viewerId).select("tenant_id");
      if (!moved.error && moved.data.length > 0) note(table, `a person moved ${moved.data.length} of their own rows to a workspace they are not in`);
    }

    // The stranger's writes, and then the viewer's: nothing changes.
    for (const [who, c, tag] of [["stranger", stranger.client, "a member of another workspace"], ["viewer", viewer.client, "a viewer"]]) {
      if (who === "viewer" && mode === "own") continue; // a person writes their own ask threads and marks; the own policies say so
      const upd = await c.from(table).update({ tenant_id: B }).eq("tenant_id", A).select("tenant_id");
      if (!upd.error && upd.data.length > 0) note(table, `${tag} moved ${upd.data.length} rows to another workspace`);
      const del = await c.from(table).delete().eq("tenant_id", A).select("tenant_id");
      if (!del.error && del.data.length > 0) note(table, `${tag} deleted ${del.data.length} rows`);
      const ins = await c.from(table).insert(fixture());
      if (!ins.error) note(table, `${tag} inserted a row into the workspace`);
    }
    const afterwards = await db.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", A);
    if (afterwards.count !== before.count) note(table, `the workspace's rows went from ${before.count} to ${afterwards.count} under a stranger's and a viewer's hands`);
  }
  assert.deepEqual(offences, [], "tenancy holds on every table");
});

test("the tables without a tenant_id: the workspace row is a member's to read and a stranger's to miss; a person's marks are their own; the service role's tables show a member nothing", { skip }, async () => {
  const offences = [];
  const note = (table, what) => offences.push(`${table}: ${what}`);

  const mine = await seen(viewer.client, "tenants", [["id", A]]);
  const notMine = await seen(stranger.client, "tenants", [["id", A]]);
  if (mine !== 1) note("tenants", `a member should read the workspace row, read ${mine}`);
  if (!nothing(notMine)) note("tenants", `a stranger read the workspace row (${notMine})`);
  const renamed = await stranger.client.from("tenants").update({ name: "taken" }).eq("id", A).select("id");
  if (!renamed.error && renamed.data.length > 0) note("tenants", "a stranger renamed the workspace");
  const viewerRenamed = await viewer.client.from("tenants").update({ name: "taken" }).eq("id", A).select("id");
  if (!viewerRenamed.error && viewerRenamed.data.length > 0) note("tenants", "a viewer renamed the workspace");
  const gone = await stranger.client.from("tenants").delete().eq("id", A).select("id");
  if (!gone.error && gone.data.length > 0) note("tenants", "a stranger deleted the workspace");

  const marks = await seen(viewer.client, "notification_marks", [["notification_id", ctx.notification]]);
  const theirMarks = await seen(owner.client, "notification_marks", [["notification_id", ctx.notification]]);
  const strangerMarks = await seen(stranger.client, "notification_marks", [["notification_id", ctx.notification]]);
  if (marks !== 1) note("notification_marks", `a person should read their own mark, read ${marks}`);
  if (!nothing(theirMarks)) note("notification_marks", `another member read a person's mark (${theirMarks})`);
  if (!nothing(strangerMarks)) note("notification_marks", `a stranger read a person's mark (${strangerMarks})`);

  for (const table of Object.keys(OTHER_TABLES).filter((t) => OTHER_TABLES[t] === "none")) {
    const counted = await db.from(table).select("*", { count: "exact", head: true });
    if (counted.error) { note(table, `the service role could not count: ${counted.error.message}`); continue; }
    if (!(counted.count >= 1)) note(table, "nothing to read, so the proof would be vacuous");
    const asViewer = await seen(viewer.client, table, []);
    const asOwner = await seen(owner.client, table, []);
    if (!nothing(asViewer)) note(table, `the service role's table was readable by a member (${asViewer})`);
    if (!nothing(asOwner)) note(table, `the service role's table was readable by an owner (${asOwner})`);
    // Empty is not enough for the service role's table (see PRIVILEGE_REFUSED): the grant must be gone.
    for (const [who, c] of [["a member (viewer)", viewer.client], ["an owner", owner.client], ["a member of another workspace", stranger.client]]) {
      const how = await refusedWith(c, table, []);
      if (how !== PRIVILEGE_REFUSED) note(table, notRefused(who, how));
    }
  }
  assert.deepEqual(offences, [], "the other tables keep their scope");
});
