// src/events.ts
import {
  SHARED_EVENT_VERSIONS
} from "../../contracts/dist/index.js";

// src/observe.ts
var DB_REQUEST_HEADER = "x-chanlytics-request-id";
var OBSERVER_SLOT = /* @__PURE__ */ Symbol.for("chanlytics.db.observer");
var observerHolder = globalThis;
function fallbackLine(level, event, fields = {}) {
  const text2 = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(text2);
  else if (level === "warn") console.warn(text2);
  else console.log(text2);
}
var FALLBACK = {
  log: {
    info: (event, fields) => fallbackLine("info", event, fields),
    warn: (event, fields) => fallbackLine("warn", event, fields),
    error: (event, fields) => fallbackLine("error", event, fields)
  },
  requestId: () => null
};
function observeDb(observer) {
  observerHolder[OBSERVER_SLOT] = observer;
}
function dbLog() {
  return (observerHolder[OBSERVER_SLOT] ?? FALLBACK).log;
}
function dbRequestId() {
  return (observerHolder[OBSERVER_SLOT] ?? FALLBACK).requestId();
}
function namedFetch(base) {
  return (input, init) => {
    const send = base ?? globalThis.fetch;
    const id = dbRequestId();
    if (!id) return send(input, init);
    const headers = new Headers(init?.headers);
    headers.set(DB_REQUEST_HEADER, id);
    return send(input, { ...init, headers });
  };
}

// src/events.ts
var WRITES = {
  "billing.paused": { category: "billing", version: 1 },
  "billing.resumed": { category: "billing", version: 1 },
  "billing.updated": { category: "billing", version: 1 },
  "broadcast.sent": { category: "message", version: 1 },
  "broadcast.stopped": { category: "message", version: 1 },
  "business.recorded": { category: "setup", version: 1 },
  "channel.connected": { category: "system", version: 1 },
  "contact.added": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.added"] },
  "contact.consent_changed": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.consent_changed"] },
  "contact.email_suppressed": { category: "contact", version: 1 },
  "google.connected": { category: "google", version: 1 },
  "google.disconnected": { category: "google", version: 1 },
  "google.linked": { category: "google", version: 1 },
  "google.replied": { category: "google", version: 1 },
  "google.reply_held": { category: "google", version: 1 },
  "google.reviews": { category: "google", version: 1 },
  "google.unlinked": { category: "google", version: 1 },
  "ingest.allowlist_skip": { category: "ingest", version: 1 },
  "ingest.unreachable_sender": { category: "ingest", version: 1 },
  "ingest.unroutable": { category: "ingest", version: 1 },
  "lead.emailed": { category: "lead", version: 1 },
  "line.answering": { category: "setup", version: 1 },
  "line.failed": { category: "setup", version: 1 },
  "line.forwarding_verified": { category: "setup", version: 1 },
  "line.released": { category: "setup", version: 1 },
  "line.texting_approved": { category: "setup", version: 1 },
  "line.texting_on": { category: "setup", version: 1 },
  "line.texting_rejected": { category: "setup", version: 1 },
  "message.send_blocked": { category: "message", version: 1 },
  "message.send_failed": { category: "message", version: 1 },
  "message.send_raced_cancel": { category: "message", version: 1 },
  "message.sent": { category: "message", version: 1 },
  "platform.acted": { category: "platform", version: SHARED_EVENT_VERSIONS["platform.acted"] },
  "playbook.run": { category: "message", version: 1 },
  "policy.changed": { category: "system", version: 1 },
  "policy.veto_window_skipped": { category: "policy", version: 1 },
  "sending_domain.added": { category: "setup", version: 1 },
  "sending_domain.held": { category: "setup", version: 1 },
  "sending_domain.released": { category: "setup", version: 1 },
  "sending_domain.removed": { category: "setup", version: 1 },
  "sending_domain.resumed": { category: "setup", version: 1 },
  "sending_domain.verified": { category: "setup", version: 1 },
  "settings.changed": { category: "system", version: 1 },
  "usage.ask_tokens": { category: "usage", version: 1 },
  "usage.llm_tokens": { category: "usage", version: 1 },
  "voice.provisioned": { category: "setup", version: 1 },
  "webhook.auth": { category: "ingest", version: 1 },
  "webhook.delivery": { category: "ingest", version: 1 },
  "workspace.activated": { category: "setup", version: 1 }
};
var WABA_WRITE = { category: "system", version: 1 };
function rowOf(tenantId, kind, subjectType, subjectId, data) {
  const write = kind in WRITES ? WRITES[kind] : WABA_WRITE;
  const requestId = dbRequestId();
  return {
    tenant_id: tenantId,
    kind,
    category: write.category,
    version: write.version,
    subject_type: subjectType,
    subject_id: subjectId,
    data,
    ...requestId ? { request_id: requestId } : {}
  };
}
async function recordEvent(db, tenantId, kind, subjectType, subjectId, data) {
  const row = rowOf(tenantId, kind, subjectType, subjectId, data);
  let { error } = await db.from("events").insert(row);
  if (error?.code === "PGRST204" && "request_id" in row) {
    const { request_id: _name, ...unnamed } = row;
    ({ error } = await db.from("events").insert(unnamed));
  }
  return { error: error?.message ?? null };
}
async function emitEvent(db, tenantId, kind, subjectType, subjectId, data) {
  const { error } = await recordEvent(db, tenantId, kind, subjectType, subjectId, data);
  if (error) dbLog().error("emit_event_failed", { tenant_id: tenantId, kind, error });
}
async function subjectsWith(db, tenantId, kind, subjectIds) {
  if (!subjectIds.length) return /* @__PURE__ */ new Set();
  const { data, error } = await db.from("events").select("subject_id").eq("tenant_id", tenantId).eq("kind", kind).in("subject_id", subjectIds);
  if (error) throw new Error(`events: ${error.message}`);
  return new Set((data ?? []).map((r) => r.subject_id).filter((id) => typeof id === "string"));
}
async function recordActivation(db, tenantId, milestone, via) {
  const { data, error } = await db.from("events").select("id").eq("tenant_id", tenantId).eq("kind", "workspace.activated").eq("data->>milestone", milestone).limit(1);
  if (error) {
    dbLog().error("activation_read_failed", { tenant_id: tenantId, milestone, error: error.message });
    return false;
  }
  if (data && data.length) return false;
  const w = await recordEvent(db, tenantId, "workspace.activated", "workspace", tenantId, { milestone, via });
  if (w.error) dbLog().error("emit_event_failed", { tenant_id: tenantId, kind: "workspace.activated", error: w.error });
  return !w.error;
}
async function relayEvents(db, limit) {
  const { data, error } = await db.rpc("relay_events", { p_limit: limit });
  if (error) throw new Error(`relay_events: ${error.message}`);
  return data ?? 0;
}
async function eventOfDelivery(db, tenantId, eventId) {
  const { data, error } = await db.from("events").select("id, tenant_id, kind, subject_type, subject_id, data, created_at, version, aggregate_version, causation_id").eq("tenant_id", tenantId).eq("id", eventId).maybeSingle();
  if (error) throw new Error(`events: ${error.message}`);
  return data;
}
async function subscriptionPaused(db, kind, subscriber) {
  const { data, error } = await db.from("event_subscriptions").select("paused").eq("kind", kind).eq("subscriber", subscriber).maybeSingle();
  if (error) throw new Error(`event_subscriptions: ${error.message}`);
  return data ? data.paused : true;
}
async function deliveryOf(db, tenantId, eventId, subscriber) {
  const { data, error } = await db.from("event_deliveries").select("state, attempts").eq("tenant_id", tenantId).eq("event_id", eventId).eq("subscriber", subscriber).maybeSingle();
  if (error) throw new Error(`event_deliveries: ${error.message}`);
  return data;
}
async function settleDelivery(db, d) {
  const { error } = await db.from("event_deliveries").update({ state: d.state, attempts: d.attempts, last_error: d.error }).eq("tenant_id", d.tenantId).eq("event_id", d.eventId).eq("subscriber", d.subscriber);
  if (error) throw new Error(`event_deliveries: ${error.message}`);
}

// src/ai-usage.ts
import { mayUseModels, RETENTION_DAYS } from "../../contracts/dist/index.js";
async function recordModelUsage(db, rows) {
  const { error } = await db.from("ai_usage").insert(rows);
  if (error) throw new Error(`ai_usage: ${error.message}`);
}
async function workspaceMayUseModels(db, tenantId) {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status, left_empty_at").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  if (!tenant.data || !billing.data) return false;
  return mayUseModels(billing.data.mode, billing.data.status, {
    paused: tenant.data.status === "paused",
    ended: !!tenant.data.left_empty_at
  });
}
async function aiFailuresHour(db, min) {
  const { data, error } = await db.rpc("ai_failures_hour", { p_min: min });
  if (error) throw new Error(`ai_failures_hour: ${error.message}`);
  return (data ?? []).map((r) => ({
    tenant_id: r.tenant_id,
    failed_calls: Number(r.failed_calls) || 0,
    brain_errors: Number(r.brain_errors) || 0
  }));
}
async function purgeAiUsage(db) {
  const { data, error } = await db.rpc("ai_usage_purge", { p_keep: `${RETENTION_DAYS.ai_usage} days` });
  if (error) throw new Error(`ai_usage_purge: ${error.message}`);
  return Number(data) || 0;
}
async function usageMonth(db, tenantId, month) {
  const { data, error } = await db.rpc("ai_usage_month", { p_tenant_id: tenantId, p_month: month });
  if (error) throw new Error(`ai_usage_month: ${error.message}`);
  const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  return (data ?? []).map((r) => ({
    meter: r.meter,
    purpose: r.purpose ?? null,
    model: r.model ?? null,
    uses: n(r.uses),
    quantity: n(r.quantity),
    input_tokens: n(r.input_tokens),
    output_tokens: n(r.output_tokens),
    cache_read_tokens: n(r.cache_read_tokens),
    cache_write_tokens: n(r.cache_write_tokens),
    usd: r.usd === null || r.usd === void 0 ? null : n(r.usd)
  }));
}

// src/billing-events.ts
async function keepInvoiceAmount(db, eventId, amountCents, currency) {
  const { data, error } = await db.rpc("billing_event_keep_amount", {
    p_id: eventId,
    p_amount_cents: amountCents,
    p_currency: currency
  });
  if (error) throw new Error(`billing_event_keep_amount: ${error.message}`);
  return data === true;
}

// src/ops.ts
async function migrationHead(db) {
  const { data, error } = await db.rpc("migration_head");
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { head: row?.head ?? null, applied: row?.applied ?? 0 };
}

// src/erasure-registry.ts
var ERASURE_LEGS = {
  erase_contact: "erase_contact: the person's calls, messages, conversations and identities deleted, scheduled jobs and decision payloads scrubbed, the tombstone written (00027, 00151)",
  notes_trigger: "person_notes_erase_on_contact: their own notes deleted, the old notes field cleared, a note_for_you about them removed (00158)",
  events_trigger: "contact_events_on_erase: an event that named them cut to who did it and from where (00131)",
  consent_trigger: "erase_marketing_consent, consent_channels_on_erase, email_marketing_on_erase: their answers and where they came from cleared (00101)",
  email_trigger: "contact_email_on_erase: the address and why it was suppressed cleared (00125)",
  proposal_trigger: "contact_proposal_on_erase: the proposal's link cleared",
  deals_trigger: "deals_erase_on_contact: a deal's note, evidence and link cleared",
  leads_trigger: "leads_erase_on_contact: their lead blanked (lead_blank), its places deleted, its keys kept as digests",
  jobs_scrub: "scrubErasedJobs and erase_contact: a job's payload that carried their number or words overwritten",
  ask_scrub: "scrub_ask_for_contact: the assistant's turns that name them deleted (00238)",
  deliveries_scrub: "provider_events_scrub: a kept delivery that names them deleted (00336)",
  notes_scrub: "person_notes_scrub: their numbers and addresses overwritten in other people's notes (00341)",
  appointments_scrub: "appointments_scrub: their visits keep their time and service and lose the client's name, number, address and note; the notices that made them, and any whose subject names them, lose the name (00345)"
};
var withPerson = (by) => ({ kind: "with_person", by });
var scrubbedBy = (...by) => ({ kind: "scrubbed", by });
var byAge = (days) => ({ kind: "by_age", days });
var DIGEST = { kind: "digest" };
var NOT_PERSONAL = { kind: "not_personal" };
var all = (strategy, ...names) => Object.fromEntries(names.map((n) => [n, strategy]));
var ERASURE_STRATEGIES = {
  ask_messages: { content: scrubbedBy("ask_scrub") },
  calls: all(
    withPerson("erase_contact"),
    "retell_call_id",
    "agent_id",
    "call_type",
    "from_e164",
    "to_e164",
    "from_raw",
    "disconnection_reason",
    "sentiment",
    "summary",
    "transcript",
    "transcript_object",
    "recording",
    "public_log_url",
    "cost",
    "latency",
    "raw",
    "wanted",
    "follow_up",
    "caller_name",
    "analysis"
  ),
  contact_identities: all(withPerson("erase_contact"), "external_id", "raw"),
  contacts: {
    phone_e164: scrubbedBy("erase_contact"),
    display_name: scrubbedBy("erase_contact"),
    wa_profile_name: scrubbedBy("erase_contact"),
    consent_source: scrubbedBy("erase_contact"),
    notes: scrubbedBy("notes_trigger", "erase_contact"),
    marketing_consent_source: scrubbedBy("consent_trigger"),
    email_marketing_source: scrubbedBy("consent_trigger"),
    consent_channels: scrubbedBy("consent_trigger"),
    marketing_channels: scrubbedBy("consent_trigger"),
    email: scrubbedBy("email_trigger"),
    email_suppressed_reason: scrubbedBy("email_trigger"),
    proposal_url: scrubbedBy("proposal_trigger"),
    erased_phone_hash: DIGEST,
    erased_email_hash: DIGEST
  },
  conversations: all(withPerson("erase_contact"), "control_kind", "control_ref"),
  deals: all(scrubbedBy("deals_trigger"), "note", "evidence", "proposal_url"),
  decisions: { payload: scrubbedBy("erase_contact") },
  escalations: { details: withPerson("erase_contact") },
  event_deliveries: all(NOT_PERSONAL, "subscriber", "kind"),
  event_outbox: { kind: NOT_PERSONAL },
  events: {
    data: scrubbedBy("events_trigger"),
    ...all(NOT_PERSONAL, "kind", "category", "subject_type", "request_id")
  },
  idempotency_keys: all(byAge("idempotency_keys"), "key", "route", "request_hash", "response"),
  jobs: { payload: scrubbedBy("jobs_scrub", "erase_contact") },
  lead_places: all(withPerson("leads_trigger"), "place_id", "title", "street"),
  lead_search_members: all(scrubbedBy("leads_trigger"), "judgment", "reason"),
  lead_suppressions: { hash: DIGEST },
  leads: all(
    scrubbedBy("leads_trigger"),
    "place_id",
    "business_name",
    "category",
    "street",
    "city",
    "region",
    "postal_code",
    "website_host",
    "instagram_url",
    "phone_e164",
    "email",
    "email_alternates",
    "last_outcome",
    "last_note",
    "about",
    "hours",
    "image_url",
    "price",
    "reviews_dist",
    "facebook_url",
    "linkedin_url",
    "tiktok_url",
    "maps_url",
    "neighborhood",
    "logo_url",
    "mark_path"
  ),
  messages: all(withPerson("erase_contact"), "template_name", "media", "external_id", "content_hash", "error", "meta"),
  notifications: {
    ...all(byAge("notifications"), "title", "body"),
    ...all(NOT_PERSONAL, "route", "subject_type", "subject_id")
  },
  // A visit is the business's fact; the client in it is the person's (00345, docs/plans/2026-10-07-bookings-arrive-by-email.md).
  appointments: {
    ...all(
      scrubbedBy("appointments_scrub"),
      "client_name",
      "client_phone",
      "client_email",
      "note",
      "title",
      "external_id"
    ),
    ...all(NOT_PERSONAL, "tool", "service", "staff", "price", "timezone")
  },
  appointment_notices: {
    subject: scrubbedBy("appointments_scrub"),
    // The tool's own sender and its id for the delivery: nobody's.
    ...all(NOT_PERSONAL, "notice_id", "tool", "from_address")
  },
  // Gmail's pending confirmation of a forward to the workspace's address (00345): the owner's own account, and
  // Google's code and link for it. The workspace's, never a person's.
  mailboxes: all(NOT_PERSONAL, "forward_confirm_account", "forward_confirm_code", "forward_confirm_link"),
  person_notes: { body: scrubbedBy("notes_scrub", "notes_trigger") },
  platform_metrics: all(
    NOT_PERSONAL,
    "messages_in",
    "messages_out",
    "provider_failures",
    "handled",
    "topics",
    "ai_tokens",
    "ai_usd",
    "job_lag_ms",
    "first_answer_ms",
    "dead_letters",
    "intake_lag_ms"
  ),
  provider_events: {
    body: scrubbedBy("deliveries_scrub"),
    ...all(byAge("provider_events"), "provider_event_id", "door", "url", "headers")
  }
};

// src/auth.ts
import {
  createClient
} from "@supabase/supabase-js";
async function signUpOnPublicKey(cfg, args) {
  if (!cfg.url || !cfg.anonKey) {
    throw new Error("public_client_unconfigured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  const anon = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return anon.auth.signUp({ email: args.email, password: args.password, options: { data: args.userData } });
}
async function inviteUserByEmail(db, email) {
  return db.auth.admin.inviteUserByEmail(email);
}
async function listSecondFactors(db, userId) {
  return db.auth.admin.mfa.listFactors({ userId });
}
async function deleteSecondFactor(db, userId, factorId) {
  return db.auth.admin.mfa.deleteFactor({ id: factorId, userId });
}

// src/waitlist.ts
async function addToWaitlist(db, row) {
  return db.from("waitlist").insert(row);
}
async function refreshWaitlistRow(db, email, said) {
  return db.from("waitlist").update(said).eq("email", email).is("invited_at", null);
}
async function waitlistWaiting(db, limit) {
  return db.from("waitlist").select("id, email, business, source, created_at", { count: "exact" }).is("invited_at", null).order("created_at", { ascending: true }).limit(limit);
}
async function markWaitlistInvited(db, id, by, at) {
  return db.from("waitlist").update({ invited_at: at, invited_by: by }).eq("id", id).is("invited_at", null).select("id");
}

// src/service-client.ts
import { createClient as createClient2 } from "@supabase/supabase-js";
var SERVICE_FETCH_TIMEOUT_MS = 4e4;
function boundedFetch(ms, base) {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/rest/v1/")) return base(input, init);
    const bound = AbortSignal.timeout(ms);
    try {
      return await base(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, bound]) : bound });
    } catch (e) {
      if (!bound.aborted || init?.signal?.aborted) throw e;
      const said = new Error(`the database did not answer within ${ms} ms (timeout)`, { cause: e });
      said.name = "AbortError";
      throw said;
    }
  };
}
function createServiceClient(cfg) {
  return createClient2(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: boundedFetch(cfg.fetchTimeoutMs ?? SERVICE_FETCH_TIMEOUT_MS, namedFetch(cfg.fetch)) }
  });
}

// src/tenant-db.ts
function builderOf(db, table) {
  return db.from(table);
}
var FILTERED = ["select", "update", "delete"];
var STAMPED = ["insert", "upsert"];
function stamped(row, tenantId) {
  if (typeof row !== "object" || row === null) return row;
  const named = Reflect.get(row, "tenant_id");
  if (named !== void 0 && named !== tenantId) throw new Error("tenantDb: a row names another workspace");
  return { ...row, tenant_id: tenantId };
}
function unmoved(patch, tenantId) {
  if (typeof patch !== "object" || patch === null) return;
  const named = Reflect.get(patch, "tenant_id");
  if (named !== void 0 && named !== tenantId) throw new Error("tenantDb: a patch names another workspace");
}
function conflictsOnWorkspace(options) {
  const on = typeof options === "object" && options !== null ? Reflect.get(options, "onConflict") : void 0;
  const columns = typeof on === "string" ? on.split(",").map((c) => c.trim()) : [];
  if (!columns.includes("tenant_id")) throw new Error("tenantDb: an upsert must conflict on tenant_id as well");
}
function scoped(builder, tenantId) {
  for (const verb of FILTERED) {
    const build = Reflect.get(builder, verb);
    if (typeof build !== "function") continue;
    Object.defineProperty(builder, verb, {
      value: (...args) => {
        if (verb === "update") unmoved(args[0], tenantId);
        const statement = Reflect.apply(build, builder, args);
        const eq = statement && Reflect.get(statement, "eq");
        if (typeof eq !== "function") throw new Error(`tenantDb: ${verb} built nothing to filter`);
        const filtered = Reflect.apply(eq, statement, ["tenant_id", tenantId]);
        return filtered;
      }
    });
  }
  for (const verb of STAMPED) {
    const build = Reflect.get(builder, verb);
    if (typeof build !== "function") continue;
    Object.defineProperty(builder, verb, {
      value: (rows, ...rest) => {
        if (verb === "upsert") conflictsOnWorkspace(rest[0]);
        const statement = Reflect.apply(build, builder, [
          Array.isArray(rows) ? rows.map((r) => stamped(r, tenantId)) : stamped(rows, tenantId),
          ...rest
        ]);
        return statement;
      }
    });
  }
  return builder;
}
function tenantDb(db, tenantId) {
  if (!tenantId) throw new Error("tenantDb: a workspace is required");
  return {
    tenantId,
    from: (table) => scoped(builderOf(db, table), tenantId)
  };
}
function platformWide(db) {
  return db;
}

// src/repositories/people.ts
import {
  openDealsFromJson
} from "../../contracts/dist/index.js";
var PEOPLE_PAGE = 1e3;
var IDS_PER_READ = 100;
async function namesOfPeople(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db.from("contacts").select("id, display_name, wa_profile_name, phone_e164, email").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`namesOfPeople: ${error.message}`);
    out.push(...data ?? []);
  }
  return out;
}
var PERSON_DECISIONS = 500;
async function personDecisions(db, tenantId, contactId, conversationIds) {
  const { data, error } = await db.from("decisions").select("id, verb, subject_type, subject_id, actor_type, actor_user_id, created_at, payload").eq("tenant_id", tenantId).in("subject_type", ["contact", "conversation"]).in("subject_id", [contactId, ...conversationIds]).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PERSON_DECISIONS);
  if (error) throw new Error(`person decisions: ${error.message}`);
  return (data ?? []).map((d) => ({ ...d, payload: d.payload }));
}
function peopleCursorOf(row) {
  return row?.in_touch_at && row.added_at ? { at: row.in_touch_at, added: row.added_at, id: row.id } : null;
}
async function peoplePage(db, tenantId, page = {}) {
  const offset = page.offset ?? 0;
  const limit = page.limit ?? PEOPLE_PAGE;
  const after = page.after ?? null;
  const { data, error } = await db.rpc("people_list", {
    p_tenant_id: tenantId,
    ...page.q ? { p_query: page.q } : {},
    ...offset > 0 ? { p_offset: offset } : {},
    ...limit !== PEOPLE_PAGE ? { p_limit: limit } : {},
    ...after ? { p_after_at: after.at, p_after_added: after.added, p_after_id: after.id } : {}
  });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return (data ?? []).map(rowOfPeopleList);
}
function rowOfPeopleList({ open_deals, ...row }) {
  const deals = openDealsFromJson(open_deals);
  return deals === void 0 ? row : { ...row, open_deals: deals };
}
async function personRow(db, tenantId, contactId) {
  const { data, error } = await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: contactId });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const first = (data ?? [])[0];
  return first ? rowOfPeopleList(first) : null;
}
async function everyoneIn(db, tenantId) {
  const all2 = [];
  for (let after = null; ; ) {
    const page = await peoplePage(db, tenantId, after ? { after } : { offset: all2.length });
    all2.push(...page);
    if (page.length < PEOPLE_PAGE) return all2;
    after = peopleCursorOf(page[page.length - 1]);
  }
}
async function erasureDigests(db, tenantId, values) {
  const asked = [...new Set(values.filter((v) => v !== ""))];
  if (asked.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.rpc("erasure_digests", { p_tenant_id: tenantId, p_values: asked });
  if (error) throw new Error(`cannot make the erasure digests: ${error.message}`);
  const digests = data ?? [];
  if (digests.length !== asked.length) throw new Error("the erasure digests came back short");
  const out = /* @__PURE__ */ new Map();
  for (const [i, value] of asked.entries()) {
    const digest = digests[i];
    if (digest === void 0) throw new Error("the erasure digests came back short");
    out.set(value, digest);
  }
  return out;
}
async function scrubPersonNotes(db, tenantId, contactId, needles) {
  const { data, error } = await db.rpc("person_notes_scrub", {
    p_tenant_id: tenantId,
    p_contact_id: contactId,
    p_needles: [...needles]
  });
  if (error && (error.code === "PGRST202" || error.code === "42883")) return 0;
  if (error) throw new Error(`person_notes_scrub: ${error.message}`);
  return data ?? 0;
}
async function addPersonNote(db, contactId, body, teamOnly) {
  const { data, error } = await db.rpc("person_note_add", {
    p_contact_id: contactId,
    p_body: body,
    p_team_only: teamOnly
  });
  return { data, error };
}
async function mergePeople(db, keep, merge) {
  const { data, error } = await db.rpc("merge_people", { p_keep: keep, p_merge: merge });
  if (error) throw error;
  return mergedOf(data);
}
function mergedOf(v) {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const word = (k) => typeof o[k] === "string" ? o[k] : "";
  if (!word("contact_id") || !word("merged")) throw new Error("merge_people answered without the two records");
  const counts = o.counts && typeof o.counts === "object" && !Array.isArray(o.counts) ? o.counts : {};
  const out = {};
  for (const [k, n] of Object.entries(counts)) if (typeof n === "number" || typeof n === "string") out[k] = n;
  return {
    contact_id: word("contact_id"),
    merged: word("merged"),
    tenant_id: word("tenant_id"),
    decision_id: word("decision_id"),
    consent: word("consent"),
    marketing_consent: word("marketing_consent"),
    email_marketing: word("email_marketing"),
    counts: out
  };
}
async function resolvePerson(db, p) {
  const { data, error } = await db.rpc("resolve_person", {
    p_tenant_id: p.tenantId,
    p_channel: p.channel ?? "",
    p_external: p.external ?? "",
    p_phone: p.phone ?? "",
    p_email: p.email ?? "",
    p_name: p.name ?? "",
    p_assurance: p.assurance,
    p_source: p.source,
    p_detail: p.detail ?? {}
  });
  if (error) throw Object.assign(new Error(`resolve_person: ${error.message}`), { code: error.code });
  const o = data ?? {};
  if (typeof o.contact_id !== "string") throw new Error("resolve_person answered without a person");
  return {
    contact_id: o.contact_id,
    outcome: o.outcome === "new" || o.outcome === "filled" ? o.outcome : "matched",
    existed: o.existed === true,
    matched_by: typeof o.matched_by === "string" ? o.matched_by : null,
    email: typeof o.email === "string" ? o.email : null,
    filled: Array.isArray(o.filled) ? o.filled.filter((x) => typeof x === "string") : [],
    identity: typeof o.identity === "string" ? o.identity : null,
    doubt: typeof o.doubt === "string" ? o.doubt : null,
    doubt_seen: typeof o.doubt_seen === "string" ? o.doubt_seen : null
  };
}
var PERSON_FORGOTTEN = "PE001";
async function openDoubtsOf(db, tenantId, contactId) {
  const { data, error } = await db.from("person_doubts").select("id, contact_id, other_id, seen, created_at").eq("tenant_id", tenantId).is("settled_at", null).or(`contact_id.eq.${contactId},other_id.eq.${contactId}`).order("created_at");
  if (error && (error.code === "PGRST205" || error.code === "42P01")) return [];
  if (error) throw new Error(`person_doubts: ${error.message}`);
  const rows = data ?? [];
  if (!rows.length) return [];
  const otherIds = [...new Set(rows.map((r) => r.contact_id === contactId ? r.other_id : r.contact_id))];
  const others = await db.from("contacts").select("id, display_name, wa_profile_name, phone_e164, email").eq("tenant_id", tenantId).in("id", otherIds.slice(0, IDS_PER_READ)).is("erased_at", null).is("merged_into_contact_id", null);
  if (others.error) throw new Error(`person_doubts: ${others.error.message}`);
  const byId = new Map((others.data ?? []).map((c) => [c.id, c]));
  const out = [];
  for (const r of rows) {
    const other = byId.get(r.contact_id === contactId ? r.other_id : r.contact_id);
    if (!other) continue;
    out.push({ id: r.id, seen: r.seen, created_at: r.created_at, other });
  }
  return out;
}
async function doubtOn(db, tenantId, contactId, doubtId) {
  const { data, error } = await db.from("person_doubts").select("id, contact_id, other_id, settled_as").eq("tenant_id", tenantId).eq("id", doubtId).or(`contact_id.eq.${contactId},other_id.eq.${contactId}`).maybeSingle();
  if (error) throw new Error(`person_doubts: ${error.message}`);
  return data;
}
async function dismissPersonDoubt(db, doubtId) {
  const { data, error } = await db.rpc("person_doubt_dismiss", { p_doubt_id: doubtId });
  if (error) throw error;
  const o = data ?? {};
  return {
    doubt_id: typeof o.doubt_id === "string" ? o.doubt_id : doubtId,
    settled_as: typeof o.settled_as === "string" ? o.settled_as : null
  };
}
var stampOf = (v) => typeof v === "string" ? v : null;
async function contactSeen(db, tenantId, contactIds) {
  const { data, error } = await db.rpc("contact_seen", { p_tenant_id: tenantId, p_contact_ids: [...contactIds] });
  if (error) throw error;
  const o = data ?? {};
  const marks = Array.isArray(o.marks) ? o.marks : [];
  return {
    floor_at: stampOf(o.floor_at),
    marks: marks.filter((m) => typeof m.contact_id === "string").map((m) => ({
      contact_id: m.contact_id,
      seen_at: stampOf(m.seen_at),
      unread_at: stampOf(m.unread_at),
      marked_at: stampOf(m.marked_at)
    }))
  };
}
async function markContact(db, contactId, mark) {
  const { data, error } = await db.rpc("contact_mark", {
    p_contact_id: contactId,
    p_seen: mark.seen,
    ...mark.heardAt ? { p_heard_at: mark.heardAt } : {}
  });
  if (error) throw error;
  const o = data ?? {};
  return {
    contact_id: contactId,
    seen_at: stampOf(o.seen_at),
    unread_at: stampOf(o.unread_at),
    marked_at: stampOf(o.marked_at)
  };
}

// src/repositories/ingest.ts
import {
  CARRIER_CONSENT_SOURCE,
  conversationPatch,
  normalizePhone,
  HOUR_MS
} from "../../contracts/dist/index.js";

// src/repositories/campaigns/campaign-channels.ts
async function whatsappChannelFacts(db, tenantId) {
  const { data, error } = await db.from("tenant_channels").select("config, number_e164").eq("tenant_id", tenantId).eq("kind", "whatsapp").eq("status", "active").limit(1).maybeSingle();
  if (error) throw new Error(`whatsapp_channel_config: ${error.message}`);
  if (!data) return null;
  const cfg = data.config;
  return {
    config: cfg && typeof cfg === "object" && !Array.isArray(cfg) ? cfg : {},
    number: data.number_e164 ?? null
  };
}
async function textLineFacts(db, tenantId) {
  const { data, error } = await db.from("lines").select("sms_state, reg_mock").eq("tenant_id", tenantId).not("messaging_service_sid", "is", null).neq("voice_state", "failed").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`text_line_facts: ${error.message}`);
  return data ?? null;
}
async function playbookChannels(db, playbookId) {
  const { data, error } = await db.from("playbooks").select("channels").eq("id", playbookId).maybeSingle();
  if (error) {
    if (/channels/.test(error.message) && /does not exist|could not find/i.test(error.message)) return null;
    throw new Error(`playbook_channels: ${error.message}`);
  }
  return data?.channels ?? null;
}
async function playbookForChannels(db, tenantId, playbookId) {
  const { data, error } = await db.from("playbooks").select("id, name, trigger, policy_class, template_id").eq("tenant_id", tenantId).eq("id", playbookId).maybeSingle();
  if (error) throw new Error(`playbook_for_channels: ${error.message}`);
  if (!data) return null;
  const waiting = await db.from("broadcasts").select("id").eq("tenant_id", tenantId).eq("playbook_id", playbookId).eq("state", "pending_approval").limit(1);
  if (waiting.error) throw new Error(`playbook_for_channels: ${waiting.error.message}`);
  return { ...data, run_waits: (waiting.data ?? []).length > 0 };
}
function noChannelColumns(error) {
  return !!error && /\b(consent_channels|marketing_channels|channel)\b/.test(error.message) && /does not exist|could not find/i.test(error.message);
}
function noRelationshipColumn(error) {
  return !!error && /\bhas_relationship\b/.test(error.message) && /does not exist|could not find/i.test(error.message);
}
var UNDEFINED_COLUMN = "42703";
async function queuedRecipients(db, p) {
  const withAttempt = await db.from("broadcast_recipients").select("contact_id, facts, channel, attempt").eq("tenant_id", p.tenantId).eq("broadcast_id", p.broadcastId).eq("state", "queued").order("contact_id").limit(p.limit);
  if (!withAttempt.error) return withAttempt.data ?? [];
  if (withAttempt.error.code !== UNDEFINED_COLUMN) throw new Error(`queued_recipients: ${withAttempt.error.message}`);
  const withChannel = await db.from("broadcast_recipients").select("contact_id, facts, channel").eq("tenant_id", p.tenantId).eq("broadcast_id", p.broadcastId).eq("state", "queued").order("contact_id").limit(p.limit);
  if (!withChannel.error) return withChannel.data ?? [];
  if (withChannel.error.code !== UNDEFINED_COLUMN) throw new Error(`queued_recipients: ${withChannel.error.message}`);
  const bare = await db.from("broadcast_recipients").select("contact_id, facts").eq("tenant_id", p.tenantId).eq("broadcast_id", p.broadcastId).eq("state", "queued").order("contact_id").limit(p.limit);
  if (bare.error) throw new Error(`queued_recipients: ${bare.error.message}`);
  return bare.data ?? [];
}
async function runGoesByOthers(db, tenantId, broadcastId, than) {
  const of = db.from("broadcast_recipients").select("contact_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("broadcast_id", broadcastId);
  const { count: count2, error } = await (than === "whatsapp" ? of.in("channel", ["sms", "email"]) : of.or("channel.is.null,channel.eq.whatsapp,channel.eq.sms"));
  if (noChannelColumns(error)) return than === "email";
  if (error) throw new Error(`run_goes_by_others: ${error.message}`);
  return (count2 ?? 0) > 0;
}
async function campaignMonthSent(db, tenantId, channel, at) {
  const { data, error } = await db.rpc("campaign_month_sent", {
    p_tenant_id: tenantId,
    p_channel: channel,
    ...at ? { p_at: at.toISOString() } : {}
  });
  if (error) throw new Error(`cannot count the month's ${channel} campaign messages: ${error.message}`);
  if (typeof data !== "number")
    throw new Error(`cannot count the month's ${channel} campaign messages: the database answered no count`);
  return data;
}
async function holdRecipients(db, p) {
  for (let i = 0; i < p.contactIds.length; i += IDS_PER_READ) {
    const { error } = await db.from("broadcast_recipients").update({ state: "skipped", reason: p.reason }).eq("tenant_id", p.tenantId).eq("broadcast_id", p.broadcastId).eq("state", "queued").in("contact_id", p.contactIds.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`hold_recipients: ${error.message}`);
  }
}

// src/repositories/ingest.ts
function stoppedNow(r) {
  return r?.consent === "opted_out" || r?.dnc === true;
}
async function noteYesOnChannel(db, p, contactId) {
  const failed = (error) => dbLog().error("consent_channel_write_failed", { tenant_id: p.tenantId, contact_id: contactId, error });
  try {
    const { error } = await db.rpc("note_yes_on_channel", {
      p_tenant_id: p.tenantId,
      p_contact_id: contactId,
      p_channel: p.channel,
      p_message_external_id: p.messageExternalId,
      p_words: (p.body ?? "").slice(0, 80)
    });
    const missing = error?.code === "PGRST202" || /Could not find the function public\.note_yes_on_channel/.test(error?.message ?? "");
    if (error && !missing) failed(error.message);
  } catch (e) {
    failed(e instanceof Error ? e.message : String(e));
  }
}
async function ingestInbound(db, p) {
  const { data, error } = await db.rpc("ingest_inbound", {
    p_tenant_id: p.tenantId,
    p_channel: p.channel,
    p_identity_external_id: p.identityExternalId,
    p_phone_e164: p.phoneE164,
    p_wa_profile_name: p.waProfileName,
    p_message_external_id: p.messageExternalId,
    p_type: p.type,
    p_body: p.body,
    p_channel_ts: p.channelTs,
    p_media: p.media ?? null,
    p_meta: p.meta ?? {},
    p_opt_out: p.optOut ?? false,
    p_opt_in: p.optIn ?? false
  });
  if (error) throw new Error(`ingest_inbound: ${error.message}`);
  const out = data;
  if (p.optIn && out?.contact_id) await noteYesOnChannel(db, p, out.contact_id);
  if (p.optInMarketing && out?.contact_id && stoppedNow(out)) {
    dbLog().warn("offers_yes_while_stopped", { tenant_id: p.tenantId, contact_id: out.contact_id, channel: p.channel });
  } else if (p.optInMarketing && out?.contact_id) {
    const args = {
      p_tenant_id: p.tenantId,
      p_contact_id: out.contact_id,
      p_consent: "opted_in",
      p_source: "customer_message",
      p_note: null
    };
    const evidence = {
      channel: p.channel,
      message_external_id: p.messageExternalId,
      words: (p.body ?? "").slice(0, 80) || null
    };
    let { error: mErr } = await db.rpc("set_marketing_consent", { ...args, p_evidence: evidence });
    if (mErr && /p_evidence/.test(mErr.message))
      ({ error: mErr } = await db.rpc("set_marketing_consent", args));
    if (mErr) {
      dbLog().error("marketing_consent_write_failed", {
        tenant_id: p.tenantId,
        contact_id: out.contact_id,
        error: mErr.message
      });
    }
  }
  return out;
}
async function recordCarrierOptOut(db, p) {
  const { data, error } = await db.from("contacts").update({
    consent: "opted_out",
    dnc: true,
    consent_source: CARRIER_CONSENT_SOURCE,
    consent_updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", p.contactId).eq("tenant_id", p.tenantId).neq("consent", "opted_out").select("id");
  if (error) throw new Error(`recording the carrier's opt-out for contact ${p.contactId}: ${error.message}`);
  if (!data || data.length === 0) return false;
  const change = { consent: "opted_out", previous: p.previous, source: CARRIER_CONSENT_SOURCE, channel: p.channel };
  await emitEvent(db, p.tenantId, "contact.consent_changed", "contact", p.contactId, change);
  return true;
}
async function markProcessed(db, tenantId, messageId) {
  const { error } = await db.rpc("mark_processed", {
    p_tenant_id: tenantId,
    p_message_id: messageId
  });
  if (error) throw new Error(`mark_processed: ${error.message}`);
}
async function stampHandled(db, tenantId, messageId, handled, intent) {
  const { error } = await db.rpc("message_stamp_handled", {
    p_tenant_id: tenantId,
    p_message_id: messageId,
    p_handled: handled,
    ...intent ? { p_intent: intent } : {}
  });
  if (error) throw new Error(`message_stamp_handled: ${error.message}`);
}
async function recordOutbound(db, p) {
  if (p.channel === "email")
    throw new Error("record_outbound: an email's row is written before it is sent, never after");
  const { data, error } = await db.from("messages").insert({
    tenant_id: p.tenantId,
    conversation_id: p.conversationId,
    contact_id: p.contactId,
    channel: p.channel ?? "whatsapp",
    direction: "outbound",
    sender: p.sender,
    type: p.type ?? "text",
    body: p.body,
    external_id: p.externalId,
    status: p.status ?? "sent",
    meta: p.meta ?? {}
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`record_outbound: ${error.message}`);
  }
  const status = p.status ?? "sent";
  await Promise.all([
    db.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.conversationId),
    status === "sent" ? emitEvent(db, p.tenantId, "message.sent", "message", data.id, { sender: p.sender }) : Promise.resolve()
  ]);
  return data.id;
}
async function getOrCreateContact(db, tenantId, phoneE164) {
  const made = await resolvePerson(db, {
    tenantId,
    channel: "voice",
    external: phoneE164,
    phone: phoneE164,
    assurance: "observed",
    source: "call"
  });
  const { data, error } = await db.from("contacts").select("id, consent, dnc, marketing_consent").eq("tenant_id", tenantId).eq("id", made.contact_id).single();
  if (error || !data) throw new Error(`get_or_create_contact reselect: ${error?.message}`);
  return data;
}
async function resolveOutboundTarget(db, p) {
  const phone = normalizePhone(p.phoneE164);
  if (!phone) return null;
  const first = await db.from("contacts").select("id, consent, dnc, marketing_consent, consent_channels, marketing_channels").eq("tenant_id", p.tenantId).eq("phone_e164", phone).maybeSingle();
  const { data: existing, error: selErr } = noChannelColumns(first.error) ? await db.from("contacts").select("id, consent, dnc, marketing_consent").eq("tenant_id", p.tenantId).eq("phone_e164", phone).maybeSingle() : first;
  if (selErr) throw new Error(`resolve_outbound_target: ${selErr.message}`);
  let contact = existing;
  if (!contact) {
    if (!p.create) return null;
    contact = await getOrCreateContact(db, p.tenantId, phone);
  }
  return threadOf(db, p.tenantId, contact, p.touch);
}
async function threadOf(db, tenantId, contact, touch) {
  const { data: conv, error: cErr } = await db.from("conversations").upsert(
    {
      tenant_id: tenantId,
      contact_id: contact.id,
      ...touch === false ? {} : { last_message_at: (/* @__PURE__ */ new Date()).toISOString() }
    },
    { onConflict: "tenant_id,contact_id" }
  ).select("id, paused_until").single();
  if (cErr || !conv) throw new Error(`resolve_outbound_target conversation: ${cErr?.message}`);
  return {
    contactId: contact.id,
    conversationId: conv.id,
    pausedUntil: conv.paused_until ?? null,
    consent: contact.consent ?? null,
    dnc: contact.dnc ?? false,
    marketing_consent: contact.marketing_consent ?? null,
    consent_channels: contact.consent_channels ?? null,
    marketing_channels: contact.marketing_channels ?? null
  };
}
async function resolveOutboundTargetForContact(db, p) {
  const first = await db.from("contacts").select(
    "id, consent, dnc, marketing_consent, consent_channels, marketing_channels, erased_at, merged_into_contact_id"
  ).eq("tenant_id", p.tenantId).eq("id", p.contactId).maybeSingle();
  const { data, error } = noChannelColumns(first.error) ? await db.from("contacts").select("id, consent, dnc, marketing_consent, erased_at, merged_into_contact_id").eq("tenant_id", p.tenantId).eq("id", p.contactId).maybeSingle() : first;
  if (error) throw new Error(`resolve_outbound_target_for_contact: ${error.message}`);
  if (!data || data.erased_at || data.merged_into_contact_id) return null;
  return threadOf(db, p.tenantId, data, p.touch);
}
async function wireRowOf(db, p) {
  const head = "paused_until, control_kind, control_until, contact_id, contacts (consent, dnc, marketing_consent, ";
  const tail = "email_marketing, erased_at, erasing_since, email, email_suppressed_at), tenants (status)";
  const read = (columns) => db.from("conversations").select(`${head}${columns}${tail}`).eq("id", p.conversationId).eq("tenant_id", p.tenantId).maybeSingle();
  const full = await read(`consent_channels, marketing_channels, ${p.relationship ? "has_relationship, " : ""}`);
  if (!noRelationshipColumn(full.error) && !noChannelColumns(full.error)) return full;
  const withChannels = noRelationshipColumn(full.error) ? await read("consent_channels, marketing_channels, ") : full;
  return noChannelColumns(withChannels.error) ? read("") : withChannels;
}
async function countSentToday(db, p) {
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();
  const { count: count2, error } = await db.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", p.tenantId).eq("conversation_id", p.conversationId).eq("direction", "outbound").gte("created_at", since).contains("meta", { source: p.source });
  if (error) throw new Error(`count_sent_today: ${error.message}`);
  return count2 ?? 0;
}
async function recordStatusByExternalId(db, tenantId, externalId, status, errorDetail) {
  const patch = { status };
  if (errorDetail) patch.error = errorDetail;
  const { error } = await db.from("messages").update(patch).eq("tenant_id", tenantId).eq("external_id", externalId);
  if (error && !/monotone|terminal/.test(error.message)) {
    dbLog().error("record_status_failed", { tenant_id: tenantId, external_id: externalId, error: error.message });
  }
}
async function messageByExternalId(db, tenantId, externalId) {
  const { data, error } = await db.from("messages").select("id, conversation_id, direction, sender, channel, status, meta, contacts (phone_e164, email)").eq("tenant_id", tenantId).eq("external_id", externalId).maybeSingle();
  if (error) throw new Error(`messageByExternalId: ${error.message}`);
  if (!data) return null;
  return {
    messageId: data.id,
    conversationId: data.conversation_id,
    direction: data.direction,
    sender: data.sender,
    status: data.status,
    meta: data.meta,
    to: (data.channel === "email" ? data.contacts?.email : data.contacts?.phone_e164) ?? null
  };
}
async function keepMessageCost(db, tenantId, externalId, pricing) {
  const { data, error } = await db.rpc("message_keep_cost", {
    p_tenant_id: tenantId,
    p_external_id: externalId,
    p_pricing: pricing
  });
  if (error) throw new Error(`message_keep_cost: ${error.message}`);
  return data === true;
}
async function recordEchoAndPause(db, p) {
  const phone = `+${p.customerPhoneDigits.replace(/^\+/, "")}`;
  let contact;
  try {
    contact = await getOrCreateContact(db, p.tenantId, phone);
  } catch (e) {
    dbLog().error("record_echo_contact_failed", {
      tenant_id: p.tenantId,
      error: e instanceof Error ? e.message : String(e)
    });
    return;
  }
  const { data: conv, error: verr } = await db.from("conversations").upsert({ tenant_id: p.tenantId, contact_id: contact.id }, { onConflict: "tenant_id,contact_id" }).select("id").single();
  if (verr || !conv) {
    dbLog().error("record_echo_conv_failed", { tenant_id: p.tenantId, error: verr?.message ?? "no row" });
    return;
  }
  const { error } = await db.from("messages").insert({
    tenant_id: p.tenantId,
    conversation_id: conv.id,
    contact_id: contact.id,
    channel: "whatsapp",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: p.body,
    external_id: p.externalId,
    status: "sent",
    meta: { echo: true }
  });
  if (error && error.code !== "23505")
    dbLog().error("record_echo_failed", { tenant_id: p.tenantId, conversation_id: conv.id, error: error.message });
  if (error?.code === "23505" && p.externalId) return;
  const { error: perr } = await db.from("conversations").update(conversationPatch("owner_echo", { until: p.pausedUntilIso, now: (/* @__PURE__ */ new Date()).toISOString() })).eq("id", conv.id).eq("tenant_id", p.tenantId);
  if (perr)
    dbLog().error("record_echo_pause_failed", { tenant_id: p.tenantId, conversation_id: conv.id, error: perr.message });
}
async function pauseConversation(db, tenantId, conversationId, pausedUntilIso, opts = {}) {
  const { data, error } = await db.from("conversations").update(conversationPatch("hand_off", { until: pausedUntilIso })).eq("id", conversationId).eq("tenant_id", tenantId).select("id");
  if (error) {
    dbLog().error("pause_conversation_failed", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error: error.message
    });
    return false;
  }
  if (!data || data.length === 0) {
    dbLog().error("pause_conversation_noop", { tenant_id: tenantId, conversation_id: conversationId });
    return false;
  }
  let withdraw = db.from("messages").update({ status: "canceled", error: { reason: "superseded_by_human" } }).eq("conversation_id", conversationId).eq("tenant_id", tenantId).eq("sender", "ai").eq("status", "queued");
  if (opts.keepMessageId) withdraw = withdraw.neq("id", opts.keepMessageId);
  const { error: wErr } = await withdraw;
  if (wErr)
    dbLog().error("pause_withdraw_drafts_failed", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error: wErr.message
    });
  return true;
}
async function claimReplyTurn(db, tenantId, conversationId, messageId) {
  const { data, error } = await db.rpc("claim_reply_turn", {
    p_tenant: tenantId,
    p_conversation: conversationId,
    p_message: messageId
  });
  if (error) throw new Error(`claim_reply_turn: ${error.message}`);
  return data !== false;
}
async function holdsReplyTurn(db, conversationId, messageId) {
  const { data, error } = await db.rpc("holds_reply_turn", { p_conversation: conversationId, p_message: messageId });
  if (error) throw new Error(`holds_reply_turn: ${error.message}`);
  return data !== false;
}

// src/repositories/campaigns/email-offers.ts
import { offerPauseOf } from "../../contracts/dist/index.js";
function noColumn(error, ...columns) {
  return !!error && error.code === "42703" && columns.some((c) => error.message.includes(c));
}
function noFunction(error, name) {
  return !!error && (error.code === "PGRST202" || error.code === "42883") && error.message.includes(name);
}
async function emailOffersPause(db, tenantId) {
  const { data, error } = await db.from("mailboxes").select("offers_paused_at, offers_paused_reason").eq("tenant_id", tenantId).maybeSingle();
  if (noColumn(error, "offers_paused_at", "offers_paused_reason")) return null;
  if (error) throw new Error(`cannot read whether offers by email are paused: ${error.message}`);
  return offerPauseOf(data?.offers_paused_at, data?.offers_paused_reason);
}
async function pauseEmailOffers(db, p) {
  const { data, error } = await db.rpc("pause_email_offers", {
    p_tenant_id: p.tenantId,
    p_reason: p.reason,
    p_counts: {
      complaint_sample: p.counts.complaintSample,
      complaints: p.counts.complaints,
      bounce_sample: p.counts.bounceSample,
      bounces: p.counts.bounces
    }
  });
  if (error) throw new Error(`cannot pause offers by email: ${error.message}`);
  return data === true;
}
async function emailOfferCounts(db, p) {
  const { data, error } = await db.rpc("email_offer_counts", { p_tenant_id: p.tenantId, p_host: p.host });
  if (error) throw new Error(`cannot count the offers by email: ${error.message}`);
  const c = data ?? {};
  const n = (k) => typeof c[k] === "number" ? c[k] : 0;
  return {
    complaintSample: n("complaint_sample"),
    complaints: n("complaints"),
    bounceSample: n("bounce_sample"),
    bounces: n("bounces")
  };
}
async function setEmailOffersYes(db, p) {
  const { data, error } = await db.rpc("set_email_offers_yes", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_source: p.source,
    ...p.messageId ? { p_message_id: p.messageId } : {},
    p_evidence: p.evidence
  });
  if (error) throw new Error(`cannot record the yes to offers by email: ${error.message}`);
  const said = data ?? null;
  if (said?.changed === true) return "recorded";
  return said?.refused === "unsubscribed" ? "unsubscribed" : "unchanged";
}
async function offerLanguageOf(db, p) {
  const { data, error } = await db.from("broadcasts").select("template_language").eq("tenant_id", p.tenantId).eq("id", p.broadcastId).maybeSingle();
  if (error) throw new Error(`cannot read the language the offer was sent in: ${error.message}`);
  return data?.template_language ?? null;
}
async function setEmailUnsubscribed(db, p) {
  const { data, error } = await db.rpc("set_email_marketing", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_state: "opted_out",
    p_source: "unsubscribe",
    ...p.messageId ? { p_message_id: p.messageId } : {},
    p_evidence: p.evidence
  });
  if (error) throw new Error(`cannot record the unsubscribe: ${error.message}`);
  const said = data ?? null;
  return { business: typeof said?.business === "string" ? said.business : null, changed: said?.changed === true };
}
async function stopAllMessages(db, p) {
  const { data, error } = await db.rpc("stop_all_messages", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    ...p.messageId ? { p_message_id: p.messageId } : {}
  });
  if (error) throw new Error(`cannot record that all messages stop: ${error.message}`);
  const said = data ?? null;
  return { business: typeof said?.business === "string" ? said.business : null, changed: said?.changed === true };
}
async function offersEmailReach(db, tenantId) {
  const { data, error } = await db.rpc("offers_email_reach", { p_tenant_id: tenantId });
  if (noFunction(error, "offers_email_reach")) return null;
  if (error) throw new Error(`cannot count who an offer by email reaches: ${error.message}`);
  return typeof data === "number" ? data : null;
}

// src/repositories/email.ts
async function mailboxById(db, id) {
  const { data, error } = await db.from("mailboxes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}
async function mailboxFor(db, to) {
  const q = db.from("mailboxes").select("*");
  const { data, error } = to.kind === "mailbox" ? await q.eq("local_part", to.localPart).maybeSingle() : await q.or(`reply_token.eq.${to.token},reply_token_prev.eq.${to.token}`).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}
async function ingestInboundEmail(db, p) {
  const known = await db.from("contacts").select("id").eq("tenant_id", p.tenantId).eq("email", p.address).is("erased_at", null).is("merged_into_contact_id", null).maybeSingle();
  if (known.error) throw new Error(`ingest_email: cannot read who has this address: ${known.error.message}`);
  if (known.data) {
    const { error } = await db.from("contact_identities").upsert(
      { tenant_id: p.tenantId, contact_id: known.data.id, channel: "email", external_id: p.address },
      { onConflict: "tenant_id,channel,external_id", ignoreDuplicates: true }
    );
    if (error) throw new Error(`ingest_email: cannot name the person this address belongs to: ${error.message}`);
  }
  let optIn = p.optIn ?? false;
  if (optIn) {
    const held = await db.from("messages").select("id").eq("tenant_id", p.tenantId).eq("external_id", p.receivedId).limit(1);
    if (held.error)
      throw new Error(`ingest_email: cannot read whether the email is already held: ${held.error.message}`);
    optIn = (held.data ?? []).length === 0;
  }
  const out = await ingestInbound(db, {
    tenantId: p.tenantId,
    channel: "email",
    identityExternalId: p.address,
    phoneE164: null,
    waProfileName: null,
    messageExternalId: p.receivedId,
    type: "text",
    body: p.body,
    channelTs: p.channelTs,
    meta: p.meta,
    optOut: p.optOut ?? false,
    optIn
  });
  {
    const { error } = await db.from("contacts").update({ email: p.address }).eq("id", out.contact_id).eq("tenant_id", p.tenantId).is("email", null);
    if (error && error.code !== "23505")
      throw new Error(`ingest_email: cannot record the person's address: ${error.message}`);
    if (error) dbLog().error("ingest_email_address_taken", { tenant_id: p.tenantId, contact_id: out.contact_id });
  }
  if (p.fromThemProven && !out.processed) {
    const { error } = await db.from("contacts").update({ email_suppressed_at: null, email_suppressed_reason: null }).eq("id", out.contact_id).eq("tenant_id", p.tenantId).eq("email", p.address).eq("email_suppressed_reason", "hard_bounce");
    if (error) throw new Error(`ingest_email: cannot lift the bounce from the address: ${error.message}`);
  }
  const evidence = { channel: "email", message_external_id: p.receivedId, words: (p.words ?? "").slice(0, 80) || null };
  if (p.unsubscribe && !out.processed)
    await setEmailUnsubscribed(db, {
      tenantId: p.tenantId,
      contactId: out.contact_id,
      messageId: out.message_id,
      evidence: { ...evidence, via: "reply" }
    });
  if (p.optInOffers && !out.processed && stoppedNow(out)) {
    dbLog().warn("offers_yes_while_stopped", { tenant_id: p.tenantId, contact_id: out.contact_id, channel: "email" });
  } else if (p.optInOffers && !out.processed) {
    try {
      const yes = await setEmailOffersYes(db, {
        tenantId: p.tenantId,
        contactId: out.contact_id,
        source: "customer_message",
        messageId: out.message_id,
        evidence
      });
      if (yes === "unsubscribed")
        dbLog().warn("email_yes_refused", {
          tenant_id: p.tenantId,
          contact_id: out.contact_id,
          reason: "unsubscribed"
        });
    } catch (e) {
      dbLog().error("email_yes_not_recorded", {
        tenant_id: p.tenantId,
        contact_id: out.contact_id,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }
  return out;
}
async function sentEmailWithMessageId(db, tenantId, rfcMessageId) {
  const { data, error } = await db.from("messages").select("id").eq("tenant_id", tenantId).eq("channel", "email").eq("direction", "outbound").eq("meta->email->>message_id", rfcMessageId).limit(1);
  if (error) throw new Error(`ingest_email: cannot read the ledger of sent emails: ${error.message}`);
  return (data ?? []).length > 0;
}
async function stampMailboxReceived(db, mailboxId, at) {
  const { error } = await db.from("mailboxes").update({ last_received_at: at, last_error: null }).eq("id", mailboxId);
  if (error) dbLog().error("mailbox_stamp_failed", { mailbox_id: mailboxId, error: error.message });
}
async function mailboxOfTenant(db, tenantId) {
  const { data, error } = await db.from("mailboxes").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`mailbox: ${error.message}`);
  return data;
}
async function keepForwardingConfirmation(db, mailboxId, p) {
  const { error } = await db.from("mailboxes").update({
    forward_confirm_account: p.account,
    forward_confirm_code: p.code,
    forward_confirm_link: p.link,
    forward_confirm_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", mailboxId);
  if (error) throw new Error(`forwarding_confirmation_keep: ${error.message}`);
}
async function clearForwardingConfirmation(db, mailboxId) {
  const { error } = await db.from("mailboxes").update({
    forward_confirm_account: null,
    forward_confirm_code: null,
    forward_confirm_link: null,
    forward_confirm_at: null
  }).eq("id", mailboxId).not("forward_confirm_code", "is", null);
  if (error) throw new Error(`forwarding_confirmation_clear: ${error.message}`);
}
async function lastInboundEmail(db, tenantId, conversationId) {
  const { data, error } = await db.from("messages").select("id, meta").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("channel", "email").eq("direction", "inbound").order("channel_ts", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (error) throw new Error(`email: cannot read the email being answered: ${error.message}`);
  if (!data) return null;
  const e = data.meta?.email ?? {};
  const str = (v) => typeof v === "string" && v ? v : null;
  return {
    messageId: data.id,
    from: str(e.from),
    rfcMessageId: str(e.message_id),
    references: Array.isArray(e.references) ? e.references.filter((r) => typeof r === "string") : [],
    subject: str(e.subject)
  };
}
async function lastOutboundEmailSubject(db, tenantId, conversationId) {
  const { data, error } = await db.from("messages").select("meta").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("channel", "email").eq("direction", "outbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`email: cannot read the last email sent: ${error.message}`);
  const subject = data?.meta?.email?.subject;
  return typeof subject === "string" && subject.trim() ? subject : null;
}
var ANSWERED_LOOKBACK = 50;
async function answeredReachOutEmail(db, p) {
  const { data, error } = await db.from("messages").select("id, meta, status").eq("tenant_id", p.tenantId).eq("conversation_id", p.conversationId).eq("channel", "email").eq("direction", "outbound").order("created_at", { ascending: false }).limit(ANSWERED_LOOKBACK);
  if (error) throw new Error(`email: cannot read the reach-out being answered: ${error.message}`);
  const left = /* @__PURE__ */ new Set(["sent", "delivered", "read"]);
  const sent = (data ?? []).flatMap((m) => {
    const meta = m.meta ?? {};
    if (meta.source !== "reach_out" || !left.has(String(m.status))) return [];
    const req = meta.email?.request ?? {};
    const replyTo = Array.isArray(req.reply_to) && typeof req.reply_to[0] === "string" ? req.reply_to[0] : null;
    return [
      {
        messageId: m.id,
        rfc: typeof meta.email?.message_id === "string" ? meta.email.message_id : null,
        from: typeof req.from === "string" ? req.from : null,
        replyTo
      }
    ];
  });
  const named = new Set(p.references);
  const hit = sent.find((e) => e.rfc !== null && named.has(e.rfc)) ?? sent[0];
  return hit ? { messageId: hit.messageId, from: hit.from, replyTo: hit.replyTo } : null;
}
async function stampEmailSent(db, p) {
  const { data, error } = await db.rpc("stamp_email_sent", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_provider_id: p.providerId,
    p_rfc_message_id: p.rfcMessageId
  });
  if (error) throw new Error(`stamp_email_sent: ${error.message}`);
  const row = data?.[0];
  return row ? { status: row.status, conversationId: row.conversation_id } : null;
}
async function stampEmailLeftAs(db, p) {
  const { data, error } = await db.rpc("stamp_email_left_as", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_left_as: p.leftAs,
    p_why: p.why
  });
  if (error) throw new Error(`stamp_email_left_as: ${error.message}`);
  return data === true;
}
async function sentEmailOf(db, p) {
  const { data, error } = await db.from("messages").select("meta").eq("id", p.messageId).eq("tenant_id", p.tenantId).eq("channel", "email").eq("direction", "outbound").maybeSingle();
  if (error) throw new Error(`sent email request: ${error.message}`);
  if (!data) return null;
  const meta = data.meta ?? null;
  const lead = meta?.reach_out?.lead_id;
  return { request: meta?.email?.request ?? null, leadId: typeof lead === "string" && lead ? lead : null };
}
async function stampEmailComplaint(db, p) {
  const { data, error } = await db.rpc("stamp_email_complaint", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_at: p.at
  });
  if (error) throw new Error(`stamp_email_complaint: ${error.message}`);
  return data === true;
}
async function recordEmailNo(db, p) {
  const { data, error } = await db.from("messages").select("contact_id, meta").eq("id", p.messageId).eq("tenant_id", p.tenantId).eq("channel", "email").eq("direction", "outbound").maybeSingle();
  if (error) throw new Error(`email receipt: cannot read message ${p.messageId}: ${error.message}`);
  const meta = data?.meta ?? {};
  const from = typeof meta.email?.request?.from === "string" ? meta.email.request.from : null;
  const contactId = data?.contact_id ?? null;
  if (!contactId) return { contactId: null, from };
  const r = await db.rpc("set_email_marketing", {
    p_tenant_id: p.tenantId,
    p_contact_id: contactId,
    p_state: "opted_out",
    p_source: p.source,
    p_message_id: p.messageId,
    p_evidence: { channel: "email", via: p.source }
  });
  if (r.error) throw new Error(`email receipt: cannot record the ${p.source} as a no: ${r.error.message}`);
  return { contactId, from };
}
async function recordEmailStatus(db, p) {
  const { error } = await db.from("messages").update({ status: p.status, ...p.error ? { error: p.error } : {} }).eq("id", p.messageId).eq("tenant_id", p.tenantId).eq("channel", "email").eq("direction", "outbound");
  if (error && !/monotone|terminal/.test(error.message))
    throw new Error(`email receipt: cannot move message ${p.messageId}: ${error.message}`);
}
async function suppressEmailOf(db, p) {
  if (!p.addresses.length) return null;
  const sent = await db.from("messages").select("contact_id").eq("id", p.messageId).eq("tenant_id", p.tenantId).maybeSingle();
  if (sent.error)
    throw new Error(`email receipt: cannot read who message ${p.messageId} went to: ${sent.error.message}`);
  if (!sent.data?.contact_id) return null;
  const { data, error } = await db.from("contacts").update({ email_suppressed_at: p.at, email_suppressed_reason: p.reason }).eq("id", sent.data.contact_id).eq("tenant_id", p.tenantId).in("email", p.addresses).is("email_suppressed_at", null).select("id");
  if (error) throw new Error(`email receipt: cannot stop sends to the address: ${error.message}`);
  return data?.[0]?.id ?? null;
}

// src/repositories/campaigns/offers-answer.ts
import { WHATSAPP_CONSENT_SOURCE } from "../../contracts/dist/index.js";
async function offersAnswerOf(db, tenantId, contactId) {
  const { data, error } = await db.from("contacts").select("marketing_consent, marketing_consent_source").eq("tenant_id", tenantId).eq("id", contactId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { marketingConsent: data.marketing_consent, marketingConsentSource: data.marketing_consent_source } : null;
}
async function recordWhatsAppOffersStop(db, p) {
  const sent = await db.from("messages").select("contact_id").eq("tenant_id", p.tenantId).eq("external_id", p.externalId).maybeSingle();
  if (sent.error) throw new Error(`reading the message WhatsApp refused (${p.externalId}): ${sent.error.message}`);
  const contactId = sent.data?.contact_id;
  if (!contactId) return false;
  const who = await db.from("contacts").select("marketing_consent, erased_at").eq("id", contactId).eq("tenant_id", p.tenantId).maybeSingle();
  if (who.error) throw new Error(`reading contact ${contactId} for WhatsApp's stop: ${who.error.message}`);
  if (!who.data || who.data.erased_at || who.data.marketing_consent === "opted_out") return false;
  const { data, error } = await db.from("contacts").update({
    marketing_consent: "opted_out",
    marketing_consent_source: WHATSAPP_CONSENT_SOURCE,
    marketing_consent_updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", contactId).eq("tenant_id", p.tenantId).neq("marketing_consent", "opted_out").select("id");
  if (error) throw new Error(`recording WhatsApp's stop for contact ${contactId}: ${error.message}`);
  if (!data || data.length === 0) return false;
  await emitEvent(db, p.tenantId, "contact.consent_changed", "contact", contactId, {
    purpose: "marketing",
    consent: "opted_out",
    previous: who.data.marketing_consent,
    source: WHATSAPP_CONSENT_SOURCE,
    channel: "whatsapp",
    message_external_id: p.externalId
  });
  return true;
}
async function recordLateCarrierOptOut(db, p) {
  const sent = await db.from("messages").select("contact_id, conversation_id, direction, channel, created_at").eq("tenant_id", p.tenantId).eq("external_id", p.externalId).maybeSingle();
  if (sent.error) throw new Error(`reading the text the carrier refused (${p.externalId}): ${sent.error.message}`);
  const text2 = sent.data;
  if (!text2 || text2.direction !== "outbound" || text2.channel !== "sms") return "not_our_text";
  let contactId = text2.contact_id;
  if (!contactId) {
    const thread = await db.from("conversations").select("contact_id").eq("id", text2.conversation_id).eq("tenant_id", p.tenantId).maybeSingle();
    if (thread.error) throw new Error(`reading the thread of the text the carrier refused: ${thread.error.message}`);
    contactId = thread.data?.contact_id ?? null;
  }
  if (!contactId) return "no_person";
  const who = await db.from("contacts").select("consent, consent_updated_at, erased_at").eq("id", contactId).eq("tenant_id", p.tenantId).maybeSingle();
  if (who.error) throw new Error(`reading contact ${contactId} for the carrier's stop: ${who.error.message}`);
  if (!who.data || who.data.erased_at) return "no_person";
  if (who.data.consent === "opted_out") return "already_stopped";
  if (who.data.consent_updated_at && who.data.consent_updated_at > text2.created_at) return "newer_answer";
  const wrote = await recordCarrierOptOut(db, {
    tenantId: p.tenantId,
    contactId,
    channel: "sms",
    previous: who.data.consent
  });
  return wrote ? "recorded" : "already_stopped";
}

// src/repositories/campaigns/stranded-runs.ts
import { isReachOutRun } from "../../contracts/dist/index.js";
async function strandedRuns(db, p) {
  const { data, error } = await db.from("broadcasts").select("id, tenant_id, name, playbook_id, audience, scheduled_for").eq("state", "scheduled").gt("scheduled_for", p.since.toISOString()).lt("scheduled_for", p.before.toISOString()).or("audience->>kind.is.null,audience->>kind.neq.reach_out").order("scheduled_for", { ascending: true }).limit(p.limit);
  if (error) throw new Error(`stranded runs: cannot read the scheduled runs: ${error.message}`);
  const runs = (data ?? []).filter((r) => !isReachOutRun(r.audience));
  if (!runs.length) return [];
  const jobs = await db.from("jobs").select("payload").eq("kind", "broadcast_send").in("state", ["scheduled", "fired"]).in(
    "payload->>broadcast_id",
    runs.map((r) => r.id)
  );
  if (jobs.error) throw new Error(`stranded runs: cannot read their jobs: ${jobs.error.message}`);
  const live = new Set(
    (jobs.data ?? []).map((j) => {
      const id = j.payload?.broadcast_id;
      return typeof id === "string" ? id : "";
    })
  );
  return runs.filter((r) => !live.has(r.id));
}
async function failStrandedRun(db, p) {
  const { data, error } = await db.from("broadcasts").update({ state: "failed", failure: "run_interrupted", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.id).eq("tenant_id", p.tenantId).eq("state", "scheduled").select("id");
  if (error) throw new Error(`stranded runs: cannot mark run ${p.id} not sent: ${error.message}`);
  if (!(data ?? []).length) return false;
  await emitEvent(db, p.tenantId, "broadcast.stopped", "broadcast", p.id, { failure: "run_interrupted", sent: 0 });
  return true;
}

// src/repositories/sending-domains.ts
var must = (what, r) => {
  if (r.error) throw new Error(`sending_domains: ${what}: ${r.error.message}`);
  return r.data;
};
async function sendingDomainsOf(db, tenantId) {
  return must(
    "read a workspace's domains",
    await db.from("sending_domains").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true })
  ) ?? [];
}
async function sendingDomainOf(db, tenantId, id) {
  return must(
    "read a domain",
    await db.from("sending_domains").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle()
  );
}
async function sendingDomainByHost(db, tenantId, host) {
  return must(
    "read a domain by host",
    await db.from("sending_domains").select("*").eq("tenant_id", tenantId).eq("host", host.trim().toLowerCase()).maybeSingle()
  );
}
async function dueSendingDomains(db, limit) {
  return must(
    "read the due domains",
    await db.from("sending_domains").select("*").in("state", ["verifying", "verified", "held"]).or("held_why.is.null,held_why.neq.complaint").order("checked_at", { ascending: true, nullsFirst: true }).limit(limit)
  ) ?? [];
}
async function coldReceiptsOwed(db, from, to) {
  return must(
    "count the receipts owed",
    await db.rpc("cold_receipts_owed", { p_from: from.toISOString(), p_to: to.toISOString() })
  ) ?? [];
}
async function countSendingDomains(db, tenantId) {
  const r = await db.from("sending_domains").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (r.error) throw new Error(`sending_domains: count a workspace's domains: ${r.error.message}`);
  return r.count ?? 0;
}
async function reserveSendingDomain(db, i) {
  const r = await db.from("sending_domains").insert({
    tenant_id: i.tenantId,
    host: i.host,
    from_local: i.fromLocal,
    from_name: i.fromName,
    created_by: i.by,
    // Where every domain starts: its records to publish. Said, not left to the column's default.
    state: "records"
  }).select("*").single();
  const code = r.error?.code;
  if (code === "P0001" && r.error.hint === "too_many") return { ok: false, reason: "too_many" };
  if (code === "23505") {
    const holder = must(
      "read who holds a host",
      await db.from("sending_domains").select("id, tenant_id, state, created_at, provider_domain_id, provider_status, updated_at, records").eq("host", i.host).maybeSingle()
    );
    return { ok: false, reason: "taken", holder: holder ?? null };
  }
  return { ok: true, row: must("reserve a domain", r) };
}
async function touchSendingDomain(db, row) {
  return must(
    "touch a domain",
    await db.from("sending_domains").update({ checked_at: row.checked_at }).eq("id", row.id).eq("tenant_id", row.tenant_id).select("*").maybeSingle()
  );
}
async function recordProviderDomain(db, id, p) {
  return must(
    "record the provider's domain",
    await db.from("sending_domains").update({ provider_domain_id: p.providerDomainId, records: p.records, provider_status: p.providerStatus }).eq("id", id).select("*").single()
  );
}
async function applyDomainCheck(db, row, patch) {
  const r = await db.from("sending_domains").update(patch).eq("id", row.id).eq("updated_at", row.updated_at).select("*").maybeSingle();
  return must("write a domain's check", r);
}
async function sendingDomainCounts(db, tenantId, host, since) {
  const r = await db.rpc("sending_domain_counts", { p_tenant_id: tenantId, p_host: host, p_since: since });
  const c = must("count a domain's sends", r) ?? {};
  const n = (k) => typeof c[k] === "number" ? c[k] : Number(c[k] ?? 0) || 0;
  return {
    sent: n("sent"),
    bounced: n("bounced"),
    complained: n("complained"),
    unsubscribed: n("unsubscribed"),
    // A count from before 00188 says none apart: every complaint is taken as new, as it was.
    complained_new: "complained_new" in c ? n("complained_new") : n("complained")
  };
}
async function reputationHoldsSince(db, p) {
  const r = await db.from("events").select("id").eq("tenant_id", p.tenantId).eq("kind", "sending_domain.held").gte("created_at", p.sinceIso).eq("data->>host", p.host).in("data->>why", [...p.whys]).limit(20);
  if (r.error) throw new Error(`sending_domains: read a domain's reputation holds: ${r.error.message}`);
  return (r.data ?? []).length;
}
async function platformHoldStands(db, p) {
  const r = await db.from("events").select("kind, data, created_at").eq("tenant_id", p.tenantId).in("kind", ["sending_domain.held", "sending_domain.resumed"]).gte("created_at", p.sinceIso).eq("data->>host", p.host).order("created_at", { ascending: false }).limit(20);
  if (r.error) throw new Error(`sending_domains: read a domain's platform holds: ${r.error.message}`);
  for (const e of r.data ?? []) {
    const d = e.data ?? {};
    if (e.kind === "sending_domain.held" && d.resume_by === "platform") return true;
    if (e.kind === "sending_domain.resumed" && d.by === "platform") return false;
  }
  return false;
}
async function deleteSendingDomainAsRead(db, row) {
  const r = must(
    "remove a domain as it was read",
    await db.from("sending_domains").delete().eq("tenant_id", row.tenant_id).eq("id", row.id).eq("updated_at", row.updated_at).select("id")
  );
  return (r ?? []).length > 0;
}
async function domainHeldSince(db, tenantId, domainId, sinceIso, whys) {
  const r = await db.from("events").select("data").eq("tenant_id", tenantId).eq("kind", "sending_domain.held").eq("subject_id", domainId).gte("created_at", sinceIso).limit(20);
  if (r.error) throw new Error(`sending_domains: read a domain's holds: ${r.error.message}`);
  return (r.data ?? []).some((e) => whys.includes(String(e.data?.why ?? "")));
}
async function deleteSendingDomain(db, tenantId, id) {
  const r = must(
    "remove a domain",
    await db.from("sending_domains").delete().eq("tenant_id", tenantId).eq("id", id).select("id")
  );
  return (r ?? []).length > 0;
}

// src/repositories/outreach.ts
import { conversationPatch as conversationPatch2 } from "../../contracts/dist/index.js";
async function outreachFactsOf(db, p) {
  const { data, error } = await db.rpc("outreach_facts", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_to: p.to,
    p_host: p.host,
    p_since: p.since,
    // Named only when there is a lead: a database before 00184 knows five arguments, and a sixth it has never heard of
    // would fail every cold send rather than answer as it did.
    ...p.leadId ? { p_lead_id: p.leadId } : {}
  });
  if (error) throw new Error(`cannot read the outreach facts: ${error.message}`);
  const f = data ?? {};
  if (typeof f.wrote_back !== "boolean")
    throw new Error("cannot read the outreach facts: the database did not say whether this person wrote back");
  return {
    lead_stage: typeof f.lead_stage === "string" ? f.lead_stage : null,
    suppressed: f.suppressed === true,
    wrote_back: f.wrote_back,
    // Absent before 00226: not away, as it was.
    away: f.away === true,
    // Absent before 00241: not stopped. The stop still holds without it: its planned and held sends are skipped, and
    // the followers leave the lead out, both in SQL.
    stopped: f.stopped === true,
    domain: f.domain && typeof f.domain === "object" && typeof f.domain.state === "string" ? {
      state: f.domain.state,
      from_local: String(f.domain.from_local ?? ""),
      clean_since: typeof f.domain.clean_since === "string" ? f.domain.clean_since : null,
      // A database before 00184 says nothing of it: no days sent, the ramp's first step.
      sent_days: Math.max(0, Number(f.domain.sent_days ?? 0) || 0)
    } : null,
    sent_since: Number(f.sent_since ?? 0) || 0
  };
}
async function addressesSuppressed(db, tenantId, addresses) {
  const asked = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter((a) => a !== ""))];
  if (!asked.length) return /* @__PURE__ */ new Set();
  const { data, error } = await db.rpc("lead_addresses_suppressed", { p_tenant_id: tenantId, p_addresses: asked });
  if (error && missingDoor(error)) return addressesHeldBefore00220(db, tenantId, asked);
  if (error) throw new Error(`cannot read the never-again list: ${error.message}`);
  return new Set((data ?? []).filter((a) => typeof a === "string"));
}
var missingDoor = (e) => e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message);
async function addressesHeldBefore00220(db, tenantId, asked) {
  const byHash = new Map([...await erasureDigests(db, tenantId, asked)].map(([a, h]) => [h, a]));
  const { data, error } = await db.from("lead_suppressions").select("hash").eq("tenant_id", tenantId).eq("kind", "email").in("hash", [...byHash.keys()]);
  if (error) throw new Error(`cannot read the never-again list: ${error.message}`);
  return new Set((data ?? []).flatMap((r) => byHash.get(r.hash) ?? []));
}
var textOf = (v) => typeof v === "string" && v !== "" ? v : null;
async function reachOutReplyOf(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_of", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_days: p.days
  });
  if (error && missingDoor(error)) return null;
  if (error) throw new Error(`cannot read whose reply this is: ${error.message}`);
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : null;
  const sendId = textOf(o?.send_id);
  const leadId = textOf(o?.lead_id);
  const conversationId = textOf(o?.conversation_id);
  const receivedAt = textOf(o?.received_at);
  if (!o || !sendId || !leadId || !conversationId || !receivedAt) return null;
  const claim = o.claim === "auto_reply" || o.claim === "automated" ? o.claim : "person";
  return {
    send_id: sendId,
    lead_id: leadId,
    lead_contact_id: textOf(o.lead_contact_id),
    lead_email: textOf(o.lead_email),
    lead_website: textOf(o.lead_website),
    lead_website_root: typeof o.lead_website_root === "boolean" ? o.lead_website_root : null,
    answered_message_id: textOf(o.answered_message_id),
    answered_text: textOf(o.answered_text),
    business: textOf(o.business) ?? "",
    chain: textOf(o.chain),
    signed_by: textOf(o.signed_by),
    tz: textOf(o.tz),
    conversation_id: conversationId,
    contact_id: textOf(o.contact_id),
    claim,
    from: textOf(o.from),
    subject: textOf(o.subject),
    text: textOf(o.text),
    received_at: receivedAt
  };
}
async function replyReadingOf(db, p) {
  const { data, error } = await db.from("reach_out_replies").select("intent, claim, summary, unread, rereads, plan, told_at, undone_at, draft, draft_state, draft_why").eq("tenant_id", p.tenantId).eq("message_id", p.messageId).maybeSingle();
  if (error) throw new Error(`cannot read the reply's reading: ${error.message}`);
  return data ?? null;
}
async function markReplyDraft(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_draft", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_state: p.state,
    p_draft: p.draft,
    p_why: p.why
  });
  if (error) throw new Error(`cannot mark the reply's draft: ${error.message}`);
  return data === true;
}
async function takeReplyRead(db, p) {
  const { data, error } = await db.rpc("reach_out_read_take", {
    p_tenant_id: p.tenantId,
    p_cap: p.cap,
    p_at: p.at.toISOString()
  });
  if (error) throw new Error(`cannot take the day's read: ${error.message}`);
  return data === true;
}
async function applyReplyReading(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_apply", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_reading: p.reading,
    p_plan: p.plan,
    p_reread: p.reread,
    p_days: p.days
  });
  if (error) throw new Error(`cannot apply the reply's reading: ${error.message}`);
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return o.applied === true;
}
async function claimReplyTell(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_tell_claim", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_stale_before: p.staleBefore.toISOString()
  });
  if (error) throw new Error(`cannot claim the reply's notice: ${error.message}`);
  return typeof data === "string" && data !== "" ? data : null;
}
async function markReplyTold(db, p) {
  const { error } = await db.rpc("reach_out_reply_told", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_claimed_at: p.claim
  });
  if (error) throw new Error(`cannot mark the reply's notice told: ${error.message}`);
}
async function resolveEscalationByReason(db, p) {
  const { data, error } = await db.from("escalations").update({ state: "resolved" }).eq("tenant_id", p.tenantId).eq("conversation_id", p.conversationId).eq("reason", p.reason).eq("state", "open").select("id");
  if (error) throw new Error(`cannot resolve the thread's flag: ${error.message}`);
  return !!data && data.length > 0;
}
async function archiveConversation(db, p) {
  const { data, error } = await db.from("conversations").update(conversationPatch2("archive")).eq("tenant_id", p.tenantId).eq("id", p.conversationId).neq("state", "archived").select("id");
  if (error) throw new Error(`cannot archive the thread: ${error.message}`);
  return !!data && data.length > 0;
}
var REPLY_LIST_COLUMNS = "message_id, conversation_id, read_at, intent, claim, summary, named_day, refer_to, unread, rereads, undone_at, draft, draft_state, draft_why, plan, until_at, lead_id, send_id";
async function repliesFor(db, p) {
  let q = db.from("reach_out_replies").select(REPLY_LIST_COLUMNS).eq("tenant_id", p.tenantId).gte("read_at", p.since);
  if (p.conversationId) q = q.eq("conversation_id", p.conversationId);
  const { data, error } = await q.order("read_at", { ascending: false }).limit(p.limit);
  if (error) throw new Error(`cannot read the replies: ${error.message}`);
  const rows = data ?? [];
  const ids = (k) => [...new Set(rows.map((r) => r[k]).filter((v) => !!v))];
  const [leads, sends] = await Promise.all([
    ids("lead_id").length ? db.from("leads").select("id, business_name").eq("tenant_id", p.tenantId).in("id", ids("lead_id")) : Promise.resolve({ data: [], error: null }),
    ids("send_id").length ? db.from("reach_out_sends").select("id, playbook_id, root_id").eq("tenant_id", p.tenantId).in("id", ids("send_id")) : Promise.resolve({ data: [], error: null })
  ]);
  if (leads.error) throw new Error(`cannot read the replies' leads: ${leads.error.message}`);
  if (sends.error) throw new Error(`cannot read the replies' emails: ${sends.error.message}`);
  const business = new Map((leads.data ?? []).map((l) => [l.id, l.business_name]));
  const step = new Map((sends.data ?? []).map((s) => [s.id, s]));
  return rows.map(({ lead_id, send_id, ...r }) => ({
    ...r,
    business: lead_id && business.get(lead_id) || null,
    playbook_id: send_id && step.get(send_id)?.playbook_id || null,
    root_id: send_id && step.get(send_id)?.root_id || null
  }));
}
async function replyReadingRefOf(db, messageId) {
  const { data, error } = await db.from("reach_out_replies").select("message_id, tenant_id").eq("message_id", messageId).maybeSingle();
  if (error) throw new Error(`cannot read the reply: ${error.message}`);
  return data ? { id: data.message_id, tenant_id: data.tenant_id } : null;
}
async function replyUndoableOf(db, messageId) {
  const { data, error } = await db.rpc("reach_out_reply_undoable", { p_message_id: messageId });
  if (error) throw new Error(`cannot ask whether the reply can be undone: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}
async function undoReplyReading(db, messageId) {
  const { data, error } = await db.rpc("reach_out_reply_undo", { p_message_id: messageId });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}
async function reachOutDayDue(db, now, limit) {
  const { data, error } = await db.rpc("reach_out_day_due", { p_now: now.toISOString(), p_limit: limit });
  if (error) throw new Error(`cannot read the day's reach-out numbers: ${error.message}`);
  return (data ?? []).map((r) => {
    const n = r.numbers && typeof r.numbers === "object" ? r.numbers : {};
    const num2 = (k) => Number(n[k] ?? 0) || 0;
    return {
      tenant_id: r.tenant_id,
      day: r.day,
      numbers: {
        written: num2("written"),
        wrote_back: num2("wrote_back"),
        interested: num2("interested"),
        said_no: num2("said_no"),
        bounced: num2("bounced"),
        held: num2("held")
      }
    };
  });
}

// src/repositories/reach-out.ts
import { maySpend } from "../../contracts/dist/index.js";

// src/repositories/reach-out-sheet.ts
import { versionWords } from "../../contracts/dist/index.js";
var STEP_COLUMNS = "id, name, state, trigger, lead_search_id, after_playbook_id, after_days, gap_minutes, domain_ids, signed_by, include_unconfirmed, template_id, hand, run_hour, last_run_for, created_at";
async function reachOutStepsOf(db, tenantId) {
  const { data, error } = await db.from("playbooks").select(STEP_COLUMNS).eq("tenant_id", tenantId).eq("kind", "reach_out");
  if (error) throw new Error(`cannot read the reach-outs: ${error.message}`);
  return data ?? [];
}
async function reachOutRootOf(db, id) {
  const { data, error } = await db.from("playbooks").select("id, tenant_id, name, state, trigger, lead_search_id").eq("id", id).eq("kind", "reach_out").eq("trigger", "lead_first").maybeSingle();
  if (error) throw new Error(`cannot read the reach-out: ${error.message}`);
  return data;
}
async function reachOutSendRefOf(db, id) {
  const { data, error } = await db.from("reach_out_sends").select("id, tenant_id, broadcast_id, state, reason").eq("id", id).maybeSingle();
  if (error) throw new Error(`cannot read the email: ${error.message}`);
  return data;
}
function emailWordsFrom(row) {
  const words = versionWords({ channel: "email", components: row.components, body_preview: row.body_preview });
  return words.body.trim() ? words : null;
}
async function emailWordsByTemplate(db, tenantId, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("templates").select("id, components, body_preview").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw new Error(`cannot read the reach-outs' words: ${error.message}`);
  return new Map((data ?? []).map((t) => [t.id, emailWordsFrom(t)]));
}
async function searchNamesByIds(db, tenantId, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("lead_searches").select("id, name").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw new Error(`cannot read the searches: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}
async function leadNamesByIds(db, tenantId, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("leads").select("id, business_name").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw new Error(`cannot read the leads' names: ${error.message}`);
  return new Map((data ?? []).map((l) => [l.id, l.business_name]));
}
async function handRun(db, p) {
  const { data, error } = await db.rpc("reach_out_hand_run", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_run_id: p.runId,
    p_day: p.day,
    p_items: p.items
  });
  if (error) throw new Error(`cannot write the hand step's run: ${error.message}`);
  const r = data ?? {};
  return { made: r.made ?? 0, already: r.already ?? 0 };
}
async function runsWaitingOf(db, tenantId) {
  const { data, error } = await db.from("broadcasts").select("id, audience").eq("tenant_id", tenantId).eq("state", "pending_approval");
  if (error) throw new Error(`cannot read the runs waiting: ${error.message}`);
  return data ?? [];
}
async function reachOutRunSendsOf(db, tenantId, runId) {
  const { data, error } = await db.from("reach_out_sends").select(
    "id, lead_id, state, reason, hold_detail, opening, angle, send_at, checked_at, created_at, domain_id, lead:leads(business_name, email, city)"
  ).eq("tenant_id", tenantId).eq("broadcast_id", runId);
  if (error) throw new Error(`cannot read the run's emails: ${error.message}`);
  return data ?? [];
}
async function stampReachOutStep(db, id, p) {
  const { error } = await db.from("playbooks").update({ last_run_at: p.at.toISOString(), ...p.runFor ? { last_run_for: p.runFor } : {} }).eq("id", id);
  if (error) throw new Error(`cannot stamp the step's day: ${error.message}`);
}
async function recheckSends(db, p) {
  if (p.ids.length === 0) return 0;
  const { data, error } = await db.rpc("reach_out_recheck", {
    p_send_ids: p.ids,
    p_tenant_id: p.tenantId,
    ...p.fromState ? { p_from_state: p.fromState } : {}
  });
  if (error) throw new Error(`cannot put the sends back to be checked: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
async function outreachModeOf(db, tenantId) {
  const { data, error } = await db.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "outreach").is("subject_type", null).maybeSingle();
  if (error) throw new Error(`cannot read the outreach mode: ${error.message}`);
  const said = data?.mode;
  return said === "veto" || said === "never" ? said : "ask";
}
async function tenantZoneOf(db, tenantId) {
  const { data, error } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
  return error ? null : data?.timezone ?? null;
}
var markOf = (v) => v && typeof v === "object" && !Array.isArray(v) && typeof v.claimed_at === "string" ? { claimed_at: v.claimed_at, ...typeof v.sent_at === "string" ? { sent_at: v.sent_at } : {} } : null;
async function heldNoticeDue(db, p) {
  let sends = db.from("reach_out_sends").select("tenant_id, broadcast_id, reason").eq("state", "held").gte("updated_at", p.since).limit(p.limit);
  if (p.tenantId) sends = sends.eq("tenant_id", p.tenantId);
  const held = await sends;
  if (held.error) throw new Error(`cannot read the held: ${held.error.message}`);
  const byRun = /* @__PURE__ */ new Map();
  for (const s of held.data ?? []) {
    if (!s.broadcast_id) continue;
    const r = byRun.get(s.broadcast_id) ?? { held: 0, reasons: /* @__PURE__ */ new Set() };
    r.held += 1;
    if (s.reason) r.reasons.add(s.reason);
    byRun.set(s.broadcast_id, r);
  }
  if (byRun.size === 0) return [];
  const runs = await db.from("broadcasts").select("id, tenant_id, name, state, audience, updated_at").in("id", [...byRun.keys()]).in("state", ["scheduled", "sending"]);
  if (runs.error) throw new Error(`cannot read the held's runs: ${runs.error.message}`);
  return (runs.data ?? []).flatMap((b) => {
    const audience = b.audience && typeof b.audience === "object" && !Array.isArray(b.audience) ? b.audience : {};
    if (audience.kind !== "reach_out") return [];
    const mark = markOf(audience.held_notice);
    if (mark && (mark.sent_at || mark.claimed_at >= p.staleBefore)) return [];
    const r = byRun.get(b.id);
    return [
      {
        id: b.id,
        tenant_id: b.tenant_id,
        name: b.name,
        audience,
        updated_at: b.updated_at,
        held: r.held,
        reasons: [...r.reasons]
      }
    ];
  });
}
async function markHeldNotice(db, p) {
  let q = db.from("broadcasts").update({ audience: { ...p.audience, held_notice: { ...p.mark } } }).eq("tenant_id", p.tenantId).eq("id", p.id);
  if (p.ifUpdatedAt) q = q.eq("updated_at", p.ifUpdatedAt);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`cannot mark the run: ${error.message}`);
  return (data ?? []).length === 1;
}

// src/repositories/reach-out.ts
async function domainCapacityOf(db, domainId, at) {
  const { data, error } = await db.rpc("sending_domain_capacity", {
    p_domain_id: domainId,
    p_at: at.toISOString()
  });
  if (error) throw new Error(`cannot read the domain's capacity: ${error.message}`);
  const c = data ?? {};
  if (typeof c.used !== "number" || typeof c.sent_days !== "number")
    throw new Error("cannot read the domain's capacity: the database answered without its counts");
  return {
    state: String(c.state ?? ""),
    clean_since: typeof c.clean_since === "string" ? c.clean_since : null,
    sent_days: c.sent_days,
    used: c.used,
    recent: Array.isArray(c.recent) ? c.recent.map(Number).filter(Number.isFinite) : [],
    last_sent_at: typeof c.last_sent_at === "string" ? c.last_sent_at : null
  };
}
async function reachOutAudience(db, p) {
  const { data, error } = await db.rpc("reach_out_audience", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    p_limit: p.limit,
    p_include_unconfirmed: p.includeUnconfirmed
  });
  if (error) throw new Error(`cannot read who a reach-out may write to: ${error.message}`);
  return data ?? [];
}
async function reachOutPerson(db, tenantId, leadId) {
  const { data, error } = await db.rpc("reach_out_person", { p_tenant_id: tenantId, p_lead_id: leadId });
  if (error) throw new Error(`cannot make the person this send is for: ${error.message}`);
  const r = data ?? {};
  if (r.refused === "lead_gone" || r.refused === "lead_closed" || r.refused === "no_address" || r.refused === "already_yours" || r.refused === "erased")
    return { ok: false, refused: r.refused };
  if (!r.contact_id || !r.conversation_id)
    throw new Error("cannot make the person this send is for: no person came back");
  return { ok: true, contactId: r.contact_id, conversationId: r.conversation_id, made: r.made === true };
}
async function claimSends(db, p) {
  if (!Number.isInteger(p.cap) || !Number.isInteger(p.limit) || Number.isNaN(p.at.getTime()))
    throw new Error(`cannot claim the domain's due sends: a cap and a limit are whole numbers (${p.cap}, ${p.limit})`);
  const { data, error } = await db.rpc("reach_out_claim", {
    p_domain_id: p.domainId,
    p_cap: p.cap,
    p_at: p.at.toISOString(),
    p_limit: p.limit
  });
  if (error) throw new Error(`cannot claim the domain's due sends: ${error.message}`);
  return data ?? [];
}
async function moveSend(db, p) {
  const { data, error } = await db.from("reach_out_sends").update(p.patch).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", p.from).select("id");
  if (error) throw new Error(`cannot move the send: ${error.message}`);
  return (data ?? []).length === 1;
}
async function reachOutFollowers(db, p) {
  const { data, error } = await db.rpc("reach_out_followers", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_parent_id: p.parentId,
    p_after_days: p.afterDays,
    p_limit: p.limit
  });
  if (error) throw new Error(`cannot read who a step may write to: ${error.message}`);
  const rows = data ?? [];
  for (const r of rows)
    if (typeof r.facts?.wrote_back !== "boolean")
      throw new Error("cannot read who a step may write to: the database did not say whether they wrote back");
  return rows;
}
async function queuedOutcomes(db, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_queued_outcomes", {
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the queued sends: ${error.message}`);
  return data ?? [];
}
async function stuckClaims(db, before, limit, tenantId) {
  let q = db.from("reach_out_sends").select("*").eq("state", "claimed");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.lt("claimed_at", before.toISOString()).order("claimed_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`cannot read the claimed sends: ${error.message}`);
  return data ?? [];
}
async function staleSends(db, before, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_stale_sends", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the stale sends: ${error.message}`);
  return data ?? [];
}
async function closedRunSends(db, stuckBefore, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_closed_sends", {
    p_stuck_before: stuckBefore.toISOString(),
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the closed runs' sends: ${error.message}`);
  return data ?? [];
}
async function finishableRuns(db, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_finishable", {
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the runs to finish: ${error.message}`);
  return (data ?? []).map(
    (r) => typeof r === "string" ? r : String(r.reach_out_finishable ?? "")
  );
}
async function writtenEmails(db, ids) {
  const out = /* @__PURE__ */ new Set();
  const all2 = [...new Set(ids)];
  for (let i = 0; i < all2.length; i += 100) {
    const { data, error } = await db.from("messages").select("id").in("id", all2.slice(i, i + 100));
    if (error) throw new Error(`cannot read the sends' emails: ${error.message}`);
    for (const m of data ?? []) out.add(m.id);
  }
  return out;
}
async function withdrawEmail(db, p) {
  const why = { reason: p.reason };
  const { data, error } = await db.from("messages").update({ status: "canceled", error: why }).eq("tenant_id", p.tenantId).eq("id", p.id).eq("status", "queued").select("id");
  if (error) throw new Error(`cannot withdraw the email: ${error.message}`);
  return (data ?? []).length > 0;
}
async function dueDomains(db, at, limit, opts = {}) {
  const { data, error } = await db.rpc("reach_out_due_domains", {
    p_at: at.toISOString(),
    p_limit: limit,
    ...opts.tenantId ? { p_tenant_id: opts.tenantId } : {},
    p_skip_tenants: [...opts.skipTenants ?? []],
    p_skip_domains: [...opts.skipDomains ?? []]
  });
  if (error) throw new Error(`cannot read the domains with sends due: ${error.message}`);
  return data ?? [];
}
async function monthSent(db, tenantId, at) {
  const { data, error } = await db.rpc("reach_out_month_sent", {
    p_tenant_id: tenantId,
    p_at: at.toISOString()
  });
  if (error) throw new Error(`cannot count the month's cold emails: ${error.message}`);
  if (typeof data !== "number") throw new Error("cannot count the month's cold emails: the database answered no count");
  return data;
}
async function insertQueuedEmail(db, row) {
  const { error } = await db.from("messages").insert(row);
  if (!error) return "written";
  if (error.code === "23505") return "exists";
  throw new Error(`cannot write the email: ${error.message}`);
}
async function writtenEmail(db, p) {
  const { data, error } = await db.from("messages").select("conversation_id, contact_id, status, meta").eq("tenant_id", p.tenantId).eq("id", p.id).maybeSingle();
  if (error) throw new Error(`cannot read the written email: ${error.message}`);
  if (!data) return null;
  const to = data.meta?.email?.request?.to;
  return {
    conversation_id: data.conversation_id,
    contact_id: data.contact_id,
    status: data.status,
    to: Array.isArray(to) && typeof to[0] === "string" ? to[0] : null
  };
}
async function sendJobScheduled(db, p) {
  const { data, error } = await db.from("jobs").select("id").eq("tenant_id", p.tenantId).eq("kind", "outbound_send").eq("payload->>message_id", p.messageId).limit(1);
  if (error) throw new Error(`cannot read the email's job: ${error.message}`);
  return (data ?? []).length > 0;
}
async function sendStanding(db, s) {
  const [run, chain] = await Promise.all([
    db.from("broadcasts").select("state").eq("tenant_id", s.tenant_id).eq("id", s.broadcast_id).maybeSingle(),
    db.from("playbooks").select("id, state, template_id, after_playbook_id, signed_by").eq("tenant_id", s.tenant_id).in("id", [s.playbook_id ?? s.root_id, s.root_id])
  ]);
  if (run.error) throw new Error(`cannot read the send's run: ${run.error.message}`);
  if (chain.error) throw new Error(`cannot read the send's chain: ${chain.error.message}`);
  const step = s.playbook_id ? (chain.data ?? []).find((p) => p.id === s.playbook_id) : void 0;
  return {
    run: run.data?.state ?? null,
    step: step?.template_id ? { state: step.state, template_id: step.template_id, after_playbook_id: step.after_playbook_id } : null,
    root: (chain.data ?? []).find((p) => p.id === s.root_id)?.state ?? null,
    signedBy: (chain.data ?? []).find((p) => p.id === s.root_id)?.signed_by ?? null
  };
}
async function emailWordsOf(db, tenantId, templateId) {
  const { data, error } = await db.from("templates").select("components, body_preview").eq("tenant_id", tenantId).eq("id", templateId).eq("channel", "email").maybeSingle();
  if (error) throw new Error(`cannot read the step's words: ${error.message}`);
  return data ? emailWordsFrom(data) : null;
}
async function workspaceNameAndConfig(db, tenantId) {
  const [t, cfg] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (t.error) throw new Error(`cannot read the workspace: ${t.error.message}`);
  if (cfg.error) throw new Error(`cannot read the workspace's configuration: ${cfg.error.message}`);
  return { name: t.data?.name ?? null, config: cfg.data?.config ?? null };
}
async function leadSlotsOf(db, tenantId, leadId) {
  const { data, error } = await db.from("leads").select("business_name, city").eq("tenant_id", tenantId).eq("id", leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead: ${error.message}`);
  return data;
}
async function contactEmailOf(db, tenantId, contactId) {
  const { data, error } = await db.from("contacts").select("email").eq("tenant_id", tenantId).eq("id", contactId).maybeSingle();
  if (error) throw new Error(`cannot read the person: ${error.message}`);
  return data?.email ?? null;
}
async function sendNow(db, p) {
  const { data, error } = await db.from("reach_out_sends").select("state, message_id").eq("tenant_id", p.tenantId).eq("id", p.id).maybeSingle();
  if (error) throw new Error(`cannot read the send: ${error.message}`);
  return data;
}
async function runSending(db, p) {
  const { error } = await db.from("broadcasts").update({ state: "sending" }).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", "scheduled");
  if (error) throw new Error(`cannot start the run: ${error.message}`);
}
async function parentEmailOf(db, p) {
  const { data: sends, error } = await db.from("reach_out_sends").select("message_id").eq("tenant_id", p.tenantId).eq("root_id", p.rootId).eq("lead_id", p.leadId).eq("playbook_id", p.stepId).eq("state", "sent").order("sent_at", { ascending: false }).limit(1);
  if (error) throw new Error(`cannot read the step before's send: ${error.message}`);
  const id = sends?.[0]?.message_id;
  if (!id) return null;
  const { data: m, error: me } = await db.from("messages").select("id, meta").eq("tenant_id", p.tenantId).eq("id", id).maybeSingle();
  if (me) throw new Error(`cannot read the step before's email: ${me.message}`);
  if (!m) return null;
  const e = m.meta?.email ?? {};
  const refs = e.request?.headers?.References;
  const subject = typeof e.subject === "string" ? e.subject : e.request?.subject;
  return {
    messageId: m.id,
    rfcMessageId: typeof e.message_id === "string" && e.message_id ? e.message_id : null,
    references: typeof refs === "string" ? refs.split(/\s+/).filter(Boolean) : [],
    subject: typeof subject === "string" ? subject : null
  };
}
async function leadAddressBounced(db, p) {
  const { data: lead, error } = await db.from("leads").select("version, email_state, erased_at, blanked_at").eq("tenant_id", p.tenantId).eq("id", p.leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead whose address bounced: ${error.message}`);
  if (!lead || lead.erased_at || lead.blanked_at || lead.email_state === "invalid") return false;
  const { data: moved, error: e2 } = await db.from("leads").update({ email_state: "invalid", email_checked_at: p.at, version: lead.version + 1 }).eq("tenant_id", p.tenantId).eq("id", p.leadId).eq("version", lead.version).select("id");
  if (e2) throw new Error(`cannot mark the lead's address bounced: ${e2.message}`);
  if ((moved ?? []).length === 0) {
    if (p.retried) throw new Error("the lead whose address bounced moved while it was marked");
    return leadAddressBounced(db, { ...p, retried: true });
  }
  return true;
}
async function leadWritten(db, p) {
  const { data: lead, error } = await db.from("leads").select("stage, version, contacted_at").eq("tenant_id", p.tenantId).eq("id", p.leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead a send wrote to: ${error.message}`);
  if (!lead) return false;
  const { data: moved, error: e2 } = await db.from("leads").update({
    stage: lead.stage === "ready" ? "nurture" : lead.stage,
    contacted_at: lead.contacted_at ?? p.at,
    last_outcome: "emailed",
    version: lead.version + 1
  }).eq("tenant_id", p.tenantId).eq("id", p.leadId).eq("version", lead.version).select("id");
  if (e2) throw new Error(`cannot record the lead as written to: ${e2.message}`);
  if ((moved ?? []).length === 0) return p.retried ? false : leadWritten(db, { ...p, retried: true });
  const said = { by: "reach_out", send_id: p.sendId };
  const { error: e3 } = await recordEvent(db, p.tenantId, "lead.emailed", "lead", p.leadId, said);
  if (e3) throw new Error(`cannot record the lead's email: ${e3}`);
  return true;
}
var num = (v) => v === null || v === void 0 || v === "" ? null : Number(v);
var text = (v) => typeof v === "string" ? v : null;
function recordOf(r) {
  return {
    business_name: text(r.business_name),
    category: text(r.category),
    city: text(r.city),
    region: text(r.region),
    rating: num(r.rating),
    reviews: num(r.reviews),
    website_host: text(r.website_host),
    hours: r.hours ?? null,
    about: text(r.about),
    email: text(r.email),
    why_it_fits: text(r.why_it_fits),
    what_you_asked: text(r.what_you_asked),
    site_listings: Number(r.site_listings ?? 0),
    name_listings: Number(r.name_listings ?? 0),
    email_domain_shared: r.email_domain_shared === true
  };
}
async function uncheckedSends(db, p) {
  const { data, error } = await db.rpc("reach_out_unchecked", {
    p_limit: p.limit,
    p_per_workspace: p.perWorkspace,
    p_ahead_minutes: p.aheadMinutes,
    ...p.tenantId ? { p_tenant_id: p.tenantId } : {}
  });
  if (error) throw new Error(`cannot read the sends to check: ${error.message}`);
  return (data ?? []).map((r) => {
    const send = r.send;
    return {
      send,
      check_gen: Number(r.check_gen ?? send.check_gen ?? 0),
      template_id: String(r.template_id),
      template_language: String(r.template_language ?? "en"),
      signed_by: text(r.signed_by),
      included_for: Array.isArray(r.included_for) ? r.included_for.filter((x) => typeof x === "string") : [],
      record: recordOf(r)
    };
  });
}
async function uncheckedWaiting(db, tenantId) {
  let q = db.from("reach_out_sends").select("id").eq("state", "planned").is("checked_at", null);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.limit(1);
  if (error) throw new Error(`cannot read the sends to check: ${error.message}`);
  return (data ?? []).length > 0;
}
async function reachOutRecord(db, p) {
  const { data, error } = await db.rpc("reach_out_record", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    p_lead_id: p.leadId
  });
  if (error) throw new Error(`cannot read the business's record: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? recordOf(row) : null;
}
async function recordCheck(db, p) {
  const { data, error } = await db.from("reach_out_sends").update({ ...p.patch, check_started_at: null }).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", "planned").is("checked_at", null).eq("check_gen", p.gen).select("id");
  if (error) throw new Error(`cannot record the send's check: ${error.message}`);
  return (data ?? []).length === 1;
}
async function heldStale(db, before, limit, tenantId) {
  const { data, error } = await db.rpc("reach_out_held_stale", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the held sends: ${error.message}`);
  return data ?? [];
}
async function releaseUnavailableHolds(db, p) {
  const { data, error } = await db.rpc("reach_out_release_unavailable", {
    p_before: p.before.toISOString(),
    ...p.tenantId ? { p_tenant_id: p.tenantId } : {}
  });
  if (error) throw new Error(`cannot put the holds back to be checked: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
async function takeCheckAttempt(db, p) {
  const { data, error } = await db.rpc("reach_out_check_take", {
    p_tenant_id: p.tenantId,
    p_cap: p.cap,
    p_at: p.at.toISOString()
  });
  if (error) throw new Error(`cannot take the check's attempt: ${error.message}`);
  return data === true;
}
async function workspaceMaySpend(db, tenantId) {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  if (tenant.data?.status === "paused" || !billing.data) return false;
  return maySpend(billing.data.mode, billing.data.status);
}
async function workspaceAbout(db, tenantId) {
  const { data, error } = await db.from("business_records").select("about").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the business record: ${error.message}`);
  return data?.about?.trim() || null;
}

// src/repositories/templates.ts
import {
  isReachOutRow,
  variablesSlotCount
} from "../../contracts/dist/index.js";
async function templatesFor(db, tenantId, channel = "whatsapp") {
  const ofTenant = db.from("templates").select("id, channel, name, language, category, meta_status, body_preview, title, variables").eq("tenant_id", tenantId);
  const { data, error } = await (channel === null ? ofTenant : ofTenant.eq("channel", channel));
  if (error) throw new Error(`templatesFor: ${error.message}`);
  return data ?? [];
}
async function templatesToSend(db, tenantId, channel = "whatsapp") {
  const { data, error } = await db.from("templates").select("name, language, category, meta_status, body_preview, title, variables, components").eq("tenant_id", tenantId).eq("channel", channel);
  if (error) throw new Error(`templatesToSend: ${error.message}`);
  return data ?? [];
}
async function messageSlots(db, tenantId, name, language) {
  const { data, error } = await db.from("templates").select("channel, language, variables").eq("tenant_id", tenantId).eq("name", name);
  if (error) throw new Error(`messageSlots: ${error.message}`);
  const rows = (data ?? []).slice().sort((a, b) => {
    const wa = Number(b.channel === "whatsapp") - Number(a.channel === "whatsapp");
    return wa || Number(b.language === language) - Number(a.language === language);
  });
  const row = rows[0];
  return row ? variablesSlotCount(row.variables) : null;
}
async function messageOfVersion(db, tenantId, id) {
  const { data, error } = await db.from("templates").select("name, language").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(`messageVersionRowsOf: ${error.message}`);
  return data;
}
var MESSAGE_COLUMNS = "id, channel, name, language, meta_status, category, variables, hidden_at, title, source, components, body_preview, rejected_reason";
async function messageVersionRowsOf(db, tenantId, by) {
  const message = "id" in by ? await messageOfVersion(db, tenantId, by.id) : by;
  if (message === null || isReachOutRow(message)) return [];
  const { data, error } = await db.from("templates").select(MESSAGE_COLUMNS).eq("tenant_id", tenantId).eq("name", message.name).eq("language", message.language);
  if (error) throw new Error(`messageVersionRowsOf: ${error.message}`);
  return data ?? [];
}
async function ownVersionsFiled(db, tenantId, names) {
  if (names.length === 0) return [];
  const { data, error } = await db.from("templates").select("channel, name, language").eq("tenant_id", tenantId).in("channel", ["email", "sms"]).in("name", names);
  if (error) throw new Error(`ownVersionsFiled: ${error.message}`);
  return data ?? [];
}
function versionRefOf(data) {
  const v = data;
  return v && typeof v.id === "string" && typeof v.channel === "string" && typeof v.name === "string" && typeof v.language === "string" ? { id: v.id, channel: v.channel, name: v.name, language: v.language } : null;
}
async function saveTemplateVersion(db, p) {
  const { data, error } = await db.rpc("save_template_version", {
    p_tenant_id: p.tenantId,
    p_name: p.name,
    p_language: p.language,
    p_channel: p.channel,
    p_subject: p.subject ?? "",
    p_body: p.body
  });
  if (error) return { ok: false, error: { code: error.code ?? null, message: error.message } };
  const version = versionRefOf(data);
  if (!version) throw new Error("saveTemplateVersion: the door answered without the version it wrote");
  return { ok: true, version };
}
async function createMessageVersion(db, p) {
  const { data, error } = await db.rpc("create_message_version", {
    p_tenant_id: p.tenantId,
    p_user: p.userId,
    p_name: p.name,
    p_language: p.language,
    p_channel: p.channel,
    p_subject: p.subject ?? "",
    p_body: p.body,
    p_category: p.category,
    p_variables: p.variables,
    p_title: p.title ?? ""
  });
  if (error) return { ok: false, error: { code: error.code ?? null, message: error.message } };
  const version = versionRefOf(data);
  if (!version) throw new Error("createMessageVersion: the door answered without the version it wrote");
  return { ok: true, version };
}
function isMissingDoor(error) {
  return error.code === "PGRST202" || error.code === "42883";
}
async function removeTemplateVersion(db, templateId) {
  const { data, error } = await db.rpc("remove_template_version", { p_template_id: templateId });
  if (error) return { ok: false, error: { code: error.code ?? null, message: error.message } };
  const version = versionRefOf(data);
  if (!version) throw new Error("removeTemplateVersion: the door answered without the version it removed");
  return { ok: true, version };
}
async function templateIdOf(db, tenantId, name, language) {
  const { data, error } = await db.from("templates").select("id").eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("name", name).eq("language", language).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
async function templatesNamed(db, tenantId, names) {
  const { data, error } = await db.from("templates").select("name, language, meta_status").eq("tenant_id", tenantId).eq("channel", "whatsapp").in("name", names);
  if (error) throw new Error(error.message);
  return data ?? [];
}
async function templateStatusOf(db, tenantId, name, language) {
  const { data } = await db.from("templates").select("meta_status").eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("name", name).eq("language", language).maybeSingle();
  return data;
}
async function setTemplateQuality(db, p) {
  const { error } = await db.from("templates").update({ quality: p.quality }).eq("tenant_id", p.tenantId).eq("channel", "whatsapp").eq("name", p.name).eq("language", p.language);
  if (error) throw new Error(`setTemplateQuality: ${error.message}`);
}

// src/repositories/reports/report-series.ts
async function reportSeries(db, tenantId, days) {
  const { data, error } = await db.rpc("report_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`report_series: ${error.message}`);
  return data;
}
async function campaignSeries(db, tenantId, days) {
  const { data, error } = await db.rpc("campaign_series", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`campaign_series: ${error.message}`);
  return data;
}
async function reviewsLedger(db, tenantId, days) {
  const { data, error } = await db.rpc("reviews_ledger", { p_tenant_id: tenantId, p_days: days });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`reviews_ledger: ${error.message}`);
  }
  return data;
}
async function reachOutReport(db, tenantId, days) {
  const { data, error } = await db.rpc("reach_out_report", { p_tenant_id: tenantId, p_days: days });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, data };
}

// src/repositories/reports/first-replies.ts
async function firstReplies(db, tenantId, since) {
  const { data, error } = await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since.toISOString() });
  if (error) throw new Error(`first_replies: ${error.message}`);
  return (data ?? []).flatMap(
    (r) => Number.isFinite(r.ai_seconds) ? [
      {
        asked_at: r.asked_at,
        s: Math.round(r.ai_seconds),
        hold: Number.isFinite(r.ai_hold_s) ? Math.round(r.ai_hold_s) : 0
      }
    ] : []
  );
}

// src/repositories/notifications.ts
async function forgetNotification(db, p) {
  const { error } = await db.from("notifications").delete().eq("tenant_id", p.tenantId).eq("id", p.id);
  if (error) throw new Error(`cannot take the notification back: ${error.message}`);
}
async function noticeKept(db, p) {
  const { data, error } = await db.from("notifications").select("id").eq("tenant_id", p.tenantId).eq("kind", p.kind).eq("subject_type", p.subjectType).eq("subject_id", p.subjectId).limit(1);
  if (error) throw new Error(`cannot read what the workspace was told: ${error.message}`);
  return (data ?? []).length > 0;
}
async function activityTokensOf(db, tenantId, roles) {
  const { data: members, error: me } = await db.from("memberships").select("user_id").eq("tenant_id", tenantId).in("role", [...roles]);
  if (me) throw new Error(`cannot read who is in the workspace: ${me.message}`);
  const people = (members ?? []).map((m) => m.user_id);
  if (!people.length) return [];
  const { data: devices, error: de } = await db.from("push_devices").select("activity_token").in("user_id", people).not("activity_token", "is", null);
  if (de) throw new Error(`cannot read the phones: ${de.message}`);
  return [...new Set((devices ?? []).map((d) => d.activity_token).filter((t) => !!t))];
}
async function forgetActivityTokens(db, tokens) {
  if (!tokens.length) return;
  const { error } = await db.from("push_devices").update({ activity_token: null }).in("activity_token", [...tokens]);
  if (error) throw new Error(`cannot forget the gone activity tokens: ${error.message}`);
}

// src/repositories/campaigns/workspace.ts
async function workspacePaused(db, tenantId) {
  const { data, error } = await db.from("tenants").select("status").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the workspace: ${error.message}`);
  return data?.status === "paused";
}

// src/repositories/routing.ts
import { MIN_MS } from "../../contracts/dist/index.js";
var POS_TTL_MS = 5 * MIN_MS;
var NEG_TTL_MS = MIN_MS;
var cache = /* @__PURE__ */ new Map();
async function resolveChannelDetailed(db, kind, externalId) {
  const key = `${kind}:${externalId}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return { channel: hit.v, lookupFailed: false };
  const { data, error } = await db.from("tenant_channels").select("id, tenant_id, kind, status, number_e164, credentials_ref, config, external_id").eq("kind", kind).eq("external_id", externalId).maybeSingle();
  if (error) {
    dbLog().error("resolve_channel_failed", { kind, error: error.message });
    if (hit?.v) return { channel: hit.v, lookupFailed: false };
    return { channel: null, lookupFailed: true };
  }
  const routed = data && data.status === "active" ? {
    channelId: data.id,
    tenantId: data.tenant_id,
    kind: data.kind,
    externalId: data.external_id,
    numberE164: data.number_e164,
    credentialsRef: data.credentials_ref,
    config: data.config
  } : null;
  cache.set(key, { v: routed, exp: Date.now() + (routed ? POS_TTL_MS : NEG_TTL_MS) });
  return { channel: routed, lookupFailed: false };
}
async function resolveChannel(db, kind, externalId) {
  return (await resolveChannelDetailed(db, kind, externalId)).channel;
}

// src/repositories/calls.ts
async function ingestCall(db, tenantId, n, raw) {
  const { data, error } = await db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: n.retellCallId,
    p_agent_id: n.agentId,
    p_from_e164: n.fromE164,
    p_from_raw: n.fromRaw,
    p_to_e164: n.toE164,
    p_direction: n.direction,
    p_call_type: n.callType,
    p_status: n.status,
    p_started_at: n.startedAtIso,
    p_ended_at: n.endedAtIso,
    p_duration_ms: n.durationMs,
    p_disconnection: n.disconnectionReason,
    p_sentiment: n.sentiment,
    p_successful: n.callSuccessful,
    p_in_voicemail: n.inVoicemail,
    p_summary: n.summary,
    p_transcript: n.transcript,
    p_transcript_obj: n.transcriptObject ?? null,
    // The provider URL is NOT written to the row: calls is in the realtime
    // publication, so every column reaches every member's browser, and the
    // REST layer's care in stripping it was being undone one layer down. A
    // retry asks the provider for a fresh URL by call id.
    p_recording: n.recordingUrl ? { fetch_state: "pending" } : null,
    p_public_log_url: n.publicLogUrl,
    p_cost: n.cost ?? null,
    p_latency: n.latency ?? null,
    p_raw: raw ?? {},
    p_analysis: n.analysis ?? null
  });
  if (error) throw new Error(`ingest_call: ${error.message}`);
  return data;
}
async function linkCallMessage(db, tenantId, callId, messageId) {
  const { data, error } = await db.from("calls").update({ message_id: messageId }).eq("id", callId).eq("tenant_id", tenantId).select("id");
  if (error) dbLog().error("link_call_message_failed", { tenant_id: tenantId, call_id: callId, error: error.message });
  else if (!data || data.length === 0)
    dbLog().error("link_call_message_noop", { tenant_id: tenantId, call_id: callId });
}
async function callersOf(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db.from("calls").select("id, from_e164, from_raw").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`callersOf: ${error.message}`);
    out.push(...data ?? []);
  }
  return out;
}
async function setCallRecording(db, tenantId, callId, recording) {
  const { data, error } = await db.from("calls").update({ recording }).eq("id", callId).eq("tenant_id", tenantId).select("id");
  if (error) dbLog().error("set_call_recording_failed", { tenant_id: tenantId, call_id: callId, error: error.message });
  else if (!data || data.length === 0)
    dbLog().error("set_call_recording_noop", { tenant_id: tenantId, call_id: callId });
}
async function recordCallNote(db, p) {
  const { data, error } = await db.from("messages").insert({
    tenant_id: p.tenantId,
    conversation_id: p.conversationId,
    contact_id: p.contactId,
    channel: "voice",
    direction: "inbound",
    sender: "system",
    type: "call_summary",
    body: p.body,
    external_id: p.externalId,
    channel_ts: p.channelTsIso,
    status: "received"
  }).select("id").single();
  if (error) {
    if (error.code === "23505") {
      const { data: prior } = await db.from("messages").select("id").eq("tenant_id", p.tenantId).eq("external_id", p.externalId).maybeSingle();
      return prior?.id ?? null;
    }
    dbLog().error("record_call_note_failed", { tenant_id: p.tenantId, error: error.message });
    return null;
  }
  return data.id;
}
async function claimCallNotification(db, tenantId, callId) {
  const { data, error } = await db.from("calls").update({ notified_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", callId).eq("tenant_id", tenantId).is("notified_at", null).select("id");
  if (error) throw new Error(`claim_call_notification: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function claimCallActivity(db, tenantId, callId) {
  const { data, error } = await db.from("calls").update({ activity_started_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", callId).eq("tenant_id", tenantId).is("activity_started_at", null).select("id");
  if (error) throw new Error(`claim_call_activity: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function callerNameOf(db, tenantId, contactId) {
  const { data, error } = await db.from("contacts").select("display_name, wa_profile_name").eq("tenant_id", tenantId).eq("id", contactId).maybeSingle();
  if (error) throw new Error(`caller_name: ${error.message}`);
  return (data?.display_name || data?.wa_profile_name || "").trim() || null;
}
async function isWorkspaceCall(db, tenantId, retellCallId) {
  const { data, error } = await tenantDb(db, tenantId).from("calls").select("id").eq("retell_call_id", retellCallId).limit(1).maybeSingle();
  if (error) return null;
  return data !== null;
}

// src/repositories/thread.ts
import {
  fencedInline,
  promptSafeName,
  clockDate,
  DAY_MS,
  dealIsOpen,
  dealSentence,
  dealsAreOn,
  offersFacts,
  pickCurrentDeal,
  proposalLinkOf
} from "../../contracts/dist/index.js";
var DELIVERED = ["sent", "delivered", "read"];
var IMPORTED_CALL_NOTE = /^\[voice call note /;
var isBackfill = (m) => !!m.meta && typeof m.meta === "object" && m.meta.backfill === true;
var isAcknowledgement = (m) => !!m.meta && typeof m.meta === "object" && m.meta.ack === true;
var effectiveAt = (m) => new Date(m.channel_ts ?? m.created_at).getTime();
function assembleHistory(rows, limit) {
  const kept = rows.filter((m) => {
    const body = (m.body ?? "").trim();
    if (!body) return false;
    if (m.direction === "outbound" && !DELIVERED.includes(String(m.status))) return false;
    if (isBackfill(m) && IMPORTED_CALL_NOTE.test(body)) return false;
    return true;
  });
  kept.sort((a, b) => effectiveAt(a) - effectiveAt(b));
  return kept.map((m) => ({
    // A call note is the customer's own history on another channel — one
    // agent, so it counts the same as a message.
    role: m.sender === "customer" ? "user" : "assistant",
    content: (m.body ?? "").trim()
  })).slice(-limit);
}
var HISTORY_COLUMNS = "body, sender, direction, type, status, created_at, channel_ts, meta";
async function readThreadState(db, tenantId, conversationId, pausedUntilIso, historyLimit = 16) {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [recent, replies, texted] = await Promise.all([
    db.from("messages").select(HISTORY_COLUMNS).eq("tenant_id", tenantId).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(historyLimit * 3),
    // headroom: duplicates and blanks drop out below
    db.from("messages").select("created_at, meta").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("sender", "ai").eq("direction", "outbound").in("status", DELIVERED).gte("created_at", since),
    // One row is the answer: a text of ours that left, at any time. Not read off `recent`, which is the last few
    // rows of every wire: a long thread's first text would fall out of it, and a campaign by WhatsApp or email is in it.
    db.from("messages").select("id").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("direction", "outbound").eq("channel", "sms").in("status", DELIVERED).limit(1)
  ]);
  if (recent.error) throw new Error(`readThreadState/history: ${recent.error.message}`);
  if (replies.error) throw new Error(`readThreadState/replies: ${replies.error.message}`);
  if (texted.error) throw new Error(`readThreadState/texted: ${texted.error.message}`);
  const history = assembleHistory(recent.data ?? [], historyLimit);
  return {
    history,
    textedBefore: (texted.data ?? []).length > 0,
    pausedUntil: pausedUntilIso ? new Date(pausedUntilIso).getTime() : 0,
    // Imported rows carry the timestamp of the IMPORT, not of a send. Counting
    // them would let a backfill silence the bot for a day against a cap it
    // never actually spent.
    replies: (replies.data ?? []).filter((r) => !isBackfill(r) && !isAcknowledgement(r)).map((r) => new Date(r.created_at).getTime())
  };
}
function sellsByOf(embedded) {
  const t = Array.isArray(embedded) ? embedded[0] : embedded;
  const v = t && typeof t === "object" ? t.sells_by : null;
  return typeof v === "string" ? v : null;
}
var noSellsBy = (message) => /\bsells_by\b/.test(message) && /does not exist|could not find/i.test(message);
var noOffersColumns = (message) => /\b(offers_asked_at|marketing_channels)\b/.test(message) && /does not exist|could not find/i.test(message);
var EMPTY_LEAD = {
  contactId: null,
  conversationId: null,
  name: null,
  returning: false,
  lastSeenAt: null,
  history: [],
  optedOut: false
};
async function readLeadContext(db, tenantId, phoneE164, historyLimit = 16) {
  const withAnswer = await db.from("contacts").select(
    "id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email, marketing_consent, marketing_channels, offers_asked_at, tenants(sells_by)"
  ).eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
  let contact = withAnswer.data ? { ...withAnswer.data, sellsBy: sellsByOf(withAnswer.data.tenants) } : null;
  let cErr = withAnswer.error;
  if (cErr && noOffersColumns(cErr.message)) {
    const unasked = await db.from("contacts").select(
      "id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email, marketing_consent, tenants(sells_by)"
    ).eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
    contact = unasked.data ? { ...unasked.data, sellsBy: sellsByOf(unasked.data.tenants) } : null;
    cErr = unasked.error;
  }
  if (cErr && noSellsBy(cErr.message)) {
    const older = await db.from("contacts").select(
      "id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email, marketing_consent"
    ).eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
    contact = older.data ? { ...older.data, sellsBy: null } : null;
    cErr = older.error;
  }
  if (cErr) throw new Error(`readLeadContext/contact: ${cErr.message}`);
  if (!contact) return EMPTY_LEAD;
  const dealsOn = dealsAreOn(contact.sellsBy);
  const { data: conv, error: vErr } = await db.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", contact.id).maybeSingle();
  if (vErr) throw new Error(`readLeadContext/conversation: ${vErr.message}`);
  let history = [];
  if (conv) {
    const { data: rows, error: hErr } = await db.from("messages").select(HISTORY_COLUMNS).eq("tenant_id", tenantId).eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(historyLimit * 3);
    if (hErr) throw new Error(`readLeadContext/history: ${hErr.message}`);
    history = assembleHistory(rows ?? [], historyLimit);
  }
  const { data: dealRows } = dealsOn ? await db.from("deals").select("stage, service, proposed_at, decided_at, ended_at, created_at, proposal_url").eq("tenant_id", tenantId).eq("contact_id", contact.id).order("created_at", { ascending: false }) : { data: [] };
  const current = pickCurrentDeal(dealRows ?? []);
  const others = (dealRows ?? []).filter((d) => d !== current && dealIsOpen(d));
  const { data: noteRows, error: nErr } = await db.from("person_notes").select("body, created_at").eq("tenant_id", tenantId).eq("contact_id", contact.id).eq("state", "kept").eq("team_only", false).order("created_at", { ascending: false }).limit(NOTES_READ);
  return {
    contactId: contact.id,
    conversationId: conv?.id ?? null,
    // display_name is what a human typed; wa_profile_name is what WhatsApp
    // reports. The human's version wins, and neither is invented.
    name: contact.display_name || contact.wa_profile_name || null,
    // Having said anything at all is what makes someone returning — not merely
    // existing as a row, which an outbound-only contact would also satisfy.
    returning: history.length > 0,
    lastSeenAt: contact.last_seen_at ?? null,
    history,
    optedOut: contact.consent === "opted_out" || contact.dnc === true,
    hasEmail: !!contact.email,
    marketingConsent: contact.marketing_consent,
    marketingChannels: contact.marketing_channels,
    // Undefined where the column could not be read: not null, which says "never asked".
    offersAskedAt: contact.offers_asked_at,
    notes: contact.notes ?? null,
    noteList: nErr ? null : (noteRows ?? []).map((n) => ({ body: n.body, at: n.created_at })),
    proposalUrl: dealsOn ? proposalLinkOf(current, contact.proposal_url) : null,
    deal: current ? dealRowFacts(current) : null,
    otherDeals: others.map((d) => ({ ...dealRowFacts(d), proposal_url: d.proposal_url }))
  };
}
function dealRowFacts(d) {
  return {
    stage: d.stage,
    service: d.service,
    proposed_at: d.proposed_at,
    decided_at: d.decided_at,
    ended_at: d.ended_at
  };
}
async function readDealForPhone(db, tenantId, phoneE164) {
  const { data: c } = await db.from("contacts").select("id, tenants(sells_by)").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).maybeSingle();
  if (!c || !dealsAreOn(sellsByOf(c.tenants))) return null;
  const { data } = await db.from("deals").select("stage, service, proposed_at, decided_at, ended_at, created_at").eq("tenant_id", tenantId).eq("contact_id", c.id).order("created_at", { ascending: false });
  const d = (data ?? []).find((x) => x.stage === "won") ?? pickCurrentDeal(data ?? []);
  return d ? dealRowFacts(d) : null;
}
var NOTES_READ = 12;
var NOTES_BUDGET = 1200;
function notesForReceptionist(lead, now = /* @__PURE__ */ new Date(), tz = "UTC") {
  if (Array.isArray(lead.noteList)) {
    const parts = [];
    let used = 0;
    for (const n of lead.noteList) {
      const body = n.body.replace(/\s+/g, " ").trim();
      if (!body) continue;
      const t = Date.parse(n.at);
      const part = Number.isFinite(t) ? `(${clockDate(t, tz, now.getTime())}) ${body}` : body;
      if (parts.length && used + part.length > NOTES_BUDGET) break;
      parts.push(part);
      used += part.length + 2;
    }
    return parts.length ? `Notes from the team about them, newest first (use as facts, never read aloud or quoted): ${parts.join("; ")}` : null;
  }
  const notes = (lead.notes ?? "").replace(/\s+/g, " ").trim();
  return notes ? `Notes from the owner about them (use as facts, never read aloud or quoted): ${notes}` : null;
}
function describeLead(lead, now = /* @__PURE__ */ new Date(), tz = "UTC", channel) {
  if (!lead.contactId) return "New contact \u2014 no prior history on record.";
  const bits = [];
  const name = promptSafeName(lead.name);
  bits.push(name ? `Name on record: ${fencedInline("profile_name", name)}.` : "No name on record.");
  if (lead.hasEmail === true) bits.push("Their email address is on file.");
  else if (lead.hasEmail === false) bits.push("No email address on file.");
  bits.push(
    ...offersFacts(
      {
        marketingConsent: lead.marketingConsent,
        marketingChannels: lead.marketingChannels,
        offersAskedAt: lead.offersAskedAt,
        optedOut: lead.optedOut
      },
      channel,
      now,
      tz
    )
  );
  if (lead.returning) {
    const days = lead.lastSeenAt ? Math.floor((now.getTime() - new Date(lead.lastSeenAt).getTime()) / DAY_MS) : null;
    const when = days === null ? "" : days <= 0 ? " Last in touch today." : days === 1 ? " Last in touch yesterday." : ` Last in touch ${days} days ago.`;
    bits.push(`Returning contact.${when}`);
  } else {
    bits.push("First time reaching out.");
  }
  if (lead.optedOut) bits.push("They have asked not to receive messages.");
  const notes = notesForReceptionist(lead, now, tz);
  if (notes) bits.push(notes);
  const deal = dealSentence(lead.deal ?? null, now.getTime(), tz, { hasLink: !!(lead.proposalUrl ?? "").trim() });
  if (deal) bits.push(deal);
  const others = lead.otherDeals ?? [];
  for (const d of others) {
    const said = dealSentence(d, now.getTime(), tz, { hasLink: !!(d.proposal_url ?? "").trim() });
    if (said) bits.push(said);
  }
  const links = proposalLinkWords(lead);
  if (links) bits.push(links);
  return bits.join(" ");
}
function proposalLinkWords(lead) {
  const others = lead.otherDeals ?? [];
  const links = [
    { url: (lead.proposalUrl ?? "").trim(), service: lead.deal?.service ?? null },
    ...others.filter((d) => d.stage === "proposed").map((d) => ({ url: (d.proposal_url ?? "").trim(), service: d.service }))
  ].filter((x) => x.url);
  const [first] = links;
  if (!first) return null;
  if (!others.length)
    return `The owner has a proposal ready for them at ${first.url}. If they ask about price, a quote or the proposal, send that link and state none of its figures; on a call, never read the address out \u2014 say it is being sent to them in writing.`;
  const rest = "and state none of its figures; a question about any other deal of theirs follows that deal's own sentence; on a call, never read an address out \u2014 say it is being sent to them in writing.";
  if (links.length === 1)
    return `The owner has a proposal${first.service ? ` for ${first.service}` : ""} ready for them at ${first.url}. If they ask about that proposal, its price or a quote for it, send that link ${rest}`;
  const named = links.map((x) => x.service ? `${x.service} at ${x.url}` : x.url).join("; ");
  return `The owner has proposals ready for them: ${named}. If they ask about one of these, its price or a quote for it, send the link for the one they mean (ask which, if it is not clear) ${rest}`;
}
function hitKind(kind) {
  if (kind === "message" || kind === "call") return kind;
  throw new Error(`searchMessages: unknown kind ${kind}`);
}
async function searchMessages(db, tenantId, words, since, limit) {
  const { data, error } = await db.rpc("search_messages", {
    p_tenant: tenantId,
    p_words: words,
    p_since: since.toISOString(),
    p_limit: limit
  });
  if (error) throw new Error(`searchMessages: ${error.message}`);
  return (data ?? []).map((r) => ({
    kind: hitKind(r.kind),
    id: r.id,
    conversationId: r.conversation_id ?? null,
    contactId: r.contact_id ?? null,
    channel: r.channel ?? null,
    direction: r.direction,
    at: r.at,
    snippet: r.snippet ?? ""
  }));
}
async function failedMessageErrors(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db.from("messages").select("id, error").eq("tenant_id", tenantId).eq("status", "failed").in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`failedMessageErrors: ${error.message}`);
    for (const r of data ?? [])
      if (r.error !== null && typeof r.error === "object" && !Array.isArray(r.error))
        out.push({ id: r.id, error: r.error });
  }
  return out;
}
async function messageSenders(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db.from("messages").select("id, sender, status, type").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`messageSenders: ${error.message}`);
    out.push(...data ?? []);
  }
  return out;
}
async function repliedTo(db, tenantId, conversationId, messageId) {
  const { data, error } = await db.from("messages").select("id").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("direction", "outbound").eq("meta->>reply_to", messageId).limit(1);
  if (error) throw new Error(`repliedTo: ${error.message}`);
  return (data ?? []).length > 0;
}
async function textReached(db, tenantId, conversationId) {
  const { data, error } = await db.from("messages").select("id").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("direction", "outbound").eq("channel", "sms").in("status", DELIVERED).limit(1);
  if (error) throw new Error(`textReached: ${error.message}`);
  return (data ?? []).length > 0;
}
async function openConversation(db, tenantId, contactId) {
  const { data, error } = await db.rpc("conversation_open", { p_tenant_id: tenantId, p_contact_id: contactId });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("conversation_open: the door answered no thread");
  return data;
}
async function ourLastWire(db, tenantId, conversationId) {
  const { data, error } = await db.from("messages").select("channel").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("direction", "outbound").in("type", ["text", "template", "media"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`reading the last outbound: ${error.message}`);
  return data?.channel ?? null;
}

// src/ask-voice-session.ts
import { isVoiceEndReason } from "../../contracts/dist/index.js";
var VOICE_SESSION_COLUMNS = "id, tenant_id, user_id, thread_id, conversation_id, token_cipher, token_expires_at, surface, scope, context, language, turn_key, turn_started_at, duration_s, created_at, ended_at, end_reason, connect_ms, first_audio_ms";
function voiceRowOf(r) {
  return { ...r, end_reason: isVoiceEndReason(r.end_reason) ? r.end_reason : null };
}
async function insertVoiceSession(db, row) {
  const { error } = await db.from("ask_voice_sessions").insert(row);
  if (error) throw new Error(`ask voice session: ${error.message}`);
}
async function readVoiceSession(db, id) {
  const { data, error } = await db.from("ask_voice_sessions").select(VOICE_SESSION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`ask voice session: ${error.message}`);
  return data ? voiceRowOf(data) : null;
}
async function readVoiceSessionByConversation(db, conversationId) {
  const { data, error } = await db.from("ask_voice_sessions").select(VOICE_SESSION_COLUMNS).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`ask voice session by conversation: ${error.message}`);
  return data ? voiceRowOf(data) : null;
}
async function claimVoiceTurn(db, id, turnKey, now, staleMs) {
  const stale = new Date(now.getTime() - staleMs).toISOString();
  const { data, error } = await db.from("ask_voice_sessions").update({ turn_key: turnKey, turn_started_at: now.toISOString() }).eq("id", id).or(`turn_key.is.null,turn_key.neq.${turnKey},turn_started_at.lt.${stale}`).select("id");
  if (error) throw new Error(`ask voice session claim: ${error.message}`);
  return (data ?? []).length > 0;
}
async function endVoiceSession(db, id, fields) {
  const { data, error } = await db.from("ask_voice_sessions").update({
    ended_at: fields.endedAt,
    ...fields.durationS === void 0 ? {} : { duration_s: fields.durationS },
    ...fields.endReason === void 0 ? {} : { end_reason: fields.endReason },
    ...fields.connectMs === void 0 ? {} : { connect_ms: fields.connectMs },
    ...fields.firstAudioMs === void 0 ? {} : { first_audio_ms: fields.firstAudioMs }
  }).eq("id", id).select("id");
  if (error) throw new Error(`ask voice session end: ${error.message}`);
  return (data ?? []).length > 0;
}
async function moveVoiceSessionContext(db, id, fields) {
  const { data, error } = await db.from("ask_voice_sessions").update({ context: fields.context, surface: fields.surface }).eq("id", id).select("id");
  if (error) throw new Error(`ask voice session context: ${error.message}`);
  return (data ?? []).length > 0;
}

// src/repositories/idempotency.ts
var HOLD_COLUMNS = "response, created_at, request_hash";
async function claimIdempotencyKey(db, p) {
  const claimed = await db.from("idempotency_keys").upsert(
    {
      tenant_id: p.tenantId,
      key: p.key,
      route: p.route,
      request_hash: p.requestHash,
      response: null,
      created_at: p.nowIso
    },
    { onConflict: "tenant_id,key", ignoreDuplicates: true }
  ).select("key");
  if (claimed.error) throw new Error(`idempotency claim: ${claimed.error.message}`);
  if ((claimed.data ?? []).length > 0) return { won: true };
  const held = await db.from("idempotency_keys").select(HOLD_COLUMNS).eq("tenant_id", p.tenantId).eq("key", p.key).maybeSingle();
  if (held.error) throw new Error(`idempotency lookup: ${held.error.message}`);
  return { won: false, held: held.data };
}
async function takeIdempotencyKey(db, p) {
  const taken = await db.from("idempotency_keys").update({ request_hash: p.requestHash, response: null, created_at: p.nowIso }).eq("tenant_id", p.tenantId).eq("key", p.key).eq("created_at", p.from).select("key");
  if (taken.error) throw new Error(`idempotency take: ${taken.error.message}`);
  return (taken.data ?? []).length > 0;
}
async function releaseIdempotencyKey(db, p) {
  const released = await db.from("idempotency_keys").delete().eq("tenant_id", p.tenantId).eq("key", p.key).eq("created_at", p.nowIso);
  if (released.error) throw new Error(`idempotency release: ${released.error.message}`);
}
async function keepIdempotencyReceipt(db, p) {
  const kept = await db.from("idempotency_keys").update({ request_hash: p.requestHash, response: p.response }).eq("tenant_id", p.tenantId).eq("key", p.key).eq("created_at", p.stamp).select("key");
  if (kept.error) throw new Error(`idempotency receipt: ${kept.error.message}`);
  return (kept.data ?? []).length > 0;
}

// src/jobs.ts
async function readJobToRequeue(db, tenantId, jobId) {
  const { data, error } = await db.from("jobs").select("id, kind, state, payload, created_at").eq("id", jobId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`read_job: ${error.message}`);
  return data;
}
async function hasNewerCopy(db, tenantId, job) {
  const { data, error } = await db.from("jobs").select("id").eq("tenant_id", tenantId).eq("kind", job.kind).filter("payload", "eq", JSON.stringify(job.payload)).neq("state", "failed").gt("created_at", job.created_at).limit(1);
  if (error) throw new Error(`read_job_copies: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function assembleBroadcast(db, args) {
  const { data, error } = await db.rpc("assemble_broadcast", {
    p_tenant: args.tenantId,
    p_run: args.run,
    p_recipients: args.recipients,
    ...args.sendAt ? { p_send_at: args.sendAt.toISOString() } : {}
  });
  if (error || !data) throw new Error(error?.message ?? "broadcast not created");
  return data;
}

// src/provider-events.ts
async function keepProviderEvent(db, d) {
  const { error } = await db.from("provider_events").upsert(
    { ...d, headers: d.headers, verified: true },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: true }
  );
  return { error: error?.message ?? null };
}
async function providerEventOf(db, provider, providerEventId) {
  const { data, error } = await db.from("provider_events").select("provider, provider_event_id, door, url, tenant_id, verified, headers, body, received_at").eq("provider", provider).eq("provider_event_id", providerEventId).maybeSingle();
  if (error) throw new Error(`provider_events: ${error.message}`);
  return data ? { ...data, provider, headers: headersOf(data.headers) } : null;
}
function headersOf(v) {
  const out = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, s] of Object.entries(v)) if (typeof s === "string") out[k] = s;
  }
  return out;
}
async function scrubProviderEvents(db, tenantId, needles) {
  const { data, error } = await db.rpc("provider_events_scrub", { p_tenant_id: tenantId, p_needles: [...needles] });
  if (error && (error.code === "PGRST202" || error.code === "42883")) return 0;
  if (error) throw new Error(`provider_events_scrub: ${error.message}`);
  return data ?? 0;
}

// src/repositories/control.ts
var CALL_CONTROL_S = 15 * 60;
async function claimControl(db, p) {
  const { data, error } = await db.rpc("claim_conversation_control", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_kind: p.holder.kind,
    p_by: p.holder.kind === "person" ? p.holder.userId : null,
    p_ref: p.holder.kind === "call" ? p.holder.callId : null,
    p_seconds: p.seconds
  });
  if (error) throw new Error(`claim_conversation_control: ${error.message}`);
  return data;
}
async function releaseControl(db, p) {
  const { data, error } = await db.rpc("release_conversation_control", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_kind: p.holder.kind,
    p_by: p.holder.kind === "person" ? p.holder.userId : null,
    p_ref: p.holder.kind === "call" ? p.holder.callId : null
  });
  if (error) throw new Error(`release_conversation_control: ${error.message}`);
  return data === true;
}

// src/repositories/control-plane.ts
import { receptionistOn } from "../../contracts/dist/index.js";
async function getTenantConfig(db, tenantId) {
  const { data, error } = await db.from("tenant_config").select("tenant_id, config, version, updated_at, updated_by").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`getTenantConfig: ${error.message}`);
  return data;
}
async function putTenantConfig(db, tenantId, config, expectedVersion, updatedBy) {
  const { data, error } = await db.from("tenant_config").update({ config, version: expectedVersion + 1, ...updatedBy ? { updated_by: updatedBy } : {} }).eq("tenant_id", tenantId).eq("version", expectedVersion).select("tenant_id, config, version, updated_at, updated_by").maybeSingle();
  if (error) throw new Error(`putTenantConfig: ${error.message}`);
  if (data) return { ok: true, row: data };
  const existing = await getTenantConfig(db, tenantId);
  return { ok: false, reason: existing ? "stale" : "missing" };
}
async function listPolicies(db, tenantId) {
  const { data, error } = await db.from("policies").select("id, class, mode, subject_type, subject_id, limits, updated_at").eq("tenant_id", tenantId).is("subject_type", null).order("class");
  if (error) throw new Error(`listPolicies: ${error.message}`);
  return data ?? [];
}
async function setPolicyMode(db, tenantId, policyClass, mode, limits) {
  let merged;
  if (limits && Object.keys(limits).length) {
    const { data: current } = await db.from("policies").select("limits").eq("tenant_id", tenantId).eq("class", policyClass).is("subject_type", null).maybeSingle();
    merged = { ...current?.limits ?? {}, ...limits };
  }
  const { data, error } = await db.from("policies").update(merged ? { mode, limits: merged } : { mode }).eq("tenant_id", tenantId).eq("class", policyClass).is("subject_type", null).select("id, class, mode, subject_type, subject_id, limits, updated_at").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function personReplyMode(db, tenantId, contactId) {
  const { data, error } = await db.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "reply").eq("subject_type", "contact").eq("subject_id", contactId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.mode ?? null;
}
async function setPersonReplyMode(db, tenantId, contactId, mode) {
  if (mode === null) {
    const { error: error2 } = await db.from("policies").delete().eq("tenant_id", tenantId).eq("class", "reply").eq("subject_type", "contact").eq("subject_id", contactId);
    if (error2) throw new Error(error2.message);
    return;
  }
  const { error } = await db.from("policies").upsert(
    { tenant_id: tenantId, class: "reply", mode, subject_type: "contact", subject_id: contactId },
    { onConflict: "tenant_id,class,subject_type,subject_id" }
  );
  if (error) throw new Error(error.message);
}
async function workspaceAnswersOnItsOwn(db, tenantId) {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status, left_empty_at").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  if (tenant.data?.status === "paused" || tenant.data?.left_empty_at) return false;
  return !(billing.data?.mode === "stripe" && !receptionistOn(billing.data.status));
}
async function membershipCountOf(db, userId) {
  const { count: count2, error } = await db.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw new Error(`memberships_count: ${error.message}`);
  return count2 ?? 0;
}
async function createWorkspaceFn(db, args) {
  return db.rpc("create_workspace", args).single();
}
async function lineForwardingSet(db, args) {
  return db.rpc("line_forwarding_set", args);
}
async function setPlaybookState(db, id, state) {
  const { error } = await db.from("playbooks").update({ state }).eq("id", id);
  return { error };
}
async function updatePlaybook(db, id, patch) {
  const { error } = await db.from("playbooks").update(patch).eq("id", id);
  return { error };
}
async function removePlaybook(db, id) {
  const { error, count: count2 } = await db.from("playbooks").delete({ count: "exact" }).eq("id", id);
  return { error, count: count2 };
}

// src/paged.ts
var MAX_ROWS = 1e3;
var DEFAULT_ROW_CAP = 2e4;
async function readAllRows(what, page, cap = DEFAULT_ROW_CAP, onCapped = (w, c) => dbLog().error("paged_read_capped", { what: w, cap: c })) {
  const out = [];
  while (out.length < cap) {
    const size = Math.min(MAX_ROWS, cap - out.length);
    const { data, error } = await page(out.length, out.length + size - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
  onCapped(what, cap);
  return out;
}
async function readAllRowsByKey(what, key, page, cap = DEFAULT_ROW_CAP, onCapped = (w, c) => dbLog().error("paged_read_capped", { what: w, cap: c })) {
  const out = [];
  let after = null;
  while (out.length < cap) {
    const size = Math.min(MAX_ROWS, cap - out.length);
    const { data, error } = await page(after, size);
    if (error) throw new Error(`${what}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    const last = rows.at(-1);
    if (rows.length < size || last === void 0) return out;
    after = key(last);
  }
  onCapped(what, cap);
  return out;
}

// src/repositories/lists.ts
var missingColumn = (message, column) => new RegExp(`\\b${column}\\b`).test(message) && /does not exist|could not find/i.test(message);
var LIST_COLUMNS = ["rule, archived_at", "rule", ""];
async function readWithFallback(read, base) {
  let last = null;
  for (const extra of LIST_COLUMNS) {
    try {
      return await read(extra ? `${base}, ${extra}` : base);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!missingColumn(message, "archived_at") && !missingColumn(message, "rule")) throw e;
      last = e;
    }
  }
  throw last;
}
async function listRows(db, tenantId) {
  const rows = await readWithFallback(
    (columns) => readAllRows(
      "segments",
      (from, to) => (
        // The columns are chosen at run time, past the client's typed parser: the rows are the columns named.
        db.from("segments").select(columns).eq("tenant_id", tenantId).order("name").order("id").range(from, to)
      )
    ),
    "id, name"
  );
  return rows.map((l) => ({ id: l.id, name: l.name, rule: l.rule ?? null, archived_at: l.archived_at ?? null }));
}
async function savedListsFor(db, tenantId) {
  const [lists, members] = await Promise.all([
    listRows(db, tenantId),
    readAllRows(
      "segment_members",
      (from, to) => db.from("segment_members").select("segment_id, contact_id").eq("tenant_id", tenantId).order("segment_id").order("contact_id").range(from, to)
    )
  ]);
  const byList = /* @__PURE__ */ new Map();
  for (const m of members) {
    const ids = byList.get(m.segment_id) ?? [];
    ids.push(m.contact_id);
    byList.set(m.segment_id, ids);
  }
  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    ids: byList.get(l.id) ?? [],
    rule: l.rule ?? null,
    archived_at: l.archived_at
  }));
}
async function listMemberIds(db, listId) {
  const rows = await readAllRows(
    "segment_members",
    (from, to) => db.from("segment_members").select("contact_id").eq("segment_id", listId).order("contact_id").range(from, to)
  );
  return rows.map((m) => m.contact_id);
}
async function savedListFor(db, tenantId, id) {
  const data = await readWithFallback(async (columns) => {
    const { data: data2, error } = await db.from("segments").select(columns).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new Error(`segments: ${error.message}`);
    return data2;
  }, "id, name");
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    ids: data.rule == null ? await listMemberIds(db, data.id) : [],
    rule: data.rule ?? null,
    archived_at: data.archived_at ?? null
  };
}
async function listRow(db, id) {
  const data = await readWithFallback(async (columns) => {
    const { data: data2, error } = await db.from("segments").select(columns).eq("id", id).maybeSingle();
    if (error) throw new Error(`segments: ${error.message}`);
    return data2;
  }, "id, tenant_id, name");
  return data ? {
    id: data.id,
    tenant_id: data.tenant_id,
    name: data.name,
    rule: data.rule ?? null,
    archived_at: data.archived_at ?? null
  } : null;
}
async function createList(db, tenantId, name, userId, rule = null) {
  const { data, error } = await db.from("segments").insert({ tenant_id: tenantId, name, created_by: userId, ...rule ? { rule } : {} }).select("id, name").single();
  return error ? { list: null, error } : { list: { id: data.id, name: data.name }, error: null };
}
async function renameList(db, id, name) {
  const { error } = await db.from("segments").update({ name }).eq("id", id);
  return { error };
}
async function setListRule(db, id, rule) {
  const { error } = await db.from("segments").update({ rule }).eq("id", id);
  return { error };
}
async function addToList(db, list, contactIds, userId) {
  const rows = contactIds.map((contact_id) => ({
    segment_id: list.id,
    contact_id,
    tenant_id: list.tenant_id,
    added_by: userId
  }));
  const { error } = await db.from("segment_members").upsert(rows, { onConflict: "segment_id,contact_id", ignoreDuplicates: true });
  return { error };
}
async function dropFromList(db, listId, contactIds) {
  const { error } = await db.from("segment_members").delete().eq("segment_id", listId).in("contact_id", [...contactIds]);
  return { error };
}
async function archiveList(db, id, at, name) {
  const { data, error } = await db.from("segments").update({ archived_at: at ? at.toISOString() : null, ...name ? { name } : {} }).eq("id", id).select("id");
  return { error, count: data?.length ?? 0 };
}
async function playbooksOnList(db, tenantId, listId) {
  const { data, error } = await db.from("playbooks").select("id, name, state").eq("tenant_id", tenantId).eq("list_id", listId).order("name");
  if (error) {
    if (missingColumn(error.message, "list_id")) return [];
    throw new Error(`playbooks: ${error.message}`);
  }
  return data ?? [];
}
async function deleteList(db, id) {
  const { error, count: count2 } = await db.from("segments").delete({ count: "exact" }).eq("id", id);
  return { error, count: count2 };
}

// src/repositories/touches.ts
import { DEFAULT_TIMEZONE, followUpKey, localDate, parseParamSpecs } from "../../contracts/dist/index.js";
var RUN_IDS_PER_QUERY = 200;
var STOPPED = /* @__PURE__ */ new Set(["canceled", "failed"]);
async function touchesSince(db, tenantId, since, now) {
  return touchesOf(db, tenantId, since, now, false);
}
async function followUpTouchesSince(db, tenantId, since, now) {
  return touchesOf(db, tenantId, since, now, true);
}
var FOLLOW_UP_PARAMS = '[{"kind":"proposal_link"}]';
async function touchesOf(db, tenantId, since, now, followUpsOnly) {
  const [all2, zone] = await Promise.all([
    readAllRows("broadcasts", (from, to) => {
      const q = db.from("broadcasts").select("id, playbook_id, state, scheduled_for, created_at, run_for, params").eq("tenant_id", tenantId).gte("created_at", since.toISOString());
      return (followUpsOnly ? q.contains("params", FOLLOW_UP_PARAMS) : q).order("id").range(from, to);
    }),
    db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle().then(
      (r) => r.error ? null : r.data?.timezone || DEFAULT_TIMEZONE,
      () => null
    )
  ]);
  const today = zone ? localDate(zone, now) : null;
  const runs = all2.filter(
    (b) => !(b.state === "pending_approval" && today !== null && b.run_for !== null && b.run_for < today)
  );
  const ofRun = new Map(runs.map((b) => [b.id, b]));
  const followUp = new Set(
    runs.filter((b) => parseParamSpecs(b.params).some((s) => s.kind === "proposal_link")).map((b) => b.id)
  );
  const ids = runs.map((b) => b.id);
  const out = [];
  const sinceMs = since.getTime();
  for (let i = 0; i < ids.length; i += RUN_IDS_PER_QUERY) {
    const rows = await readAllRows(
      "broadcast_recipients",
      (from, to) => db.from("broadcast_recipients").select(
        "broadcast_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id"
      ).eq("tenant_id", tenantId).in("broadcast_id", ids.slice(i, i + RUN_IDS_PER_QUERY)).in("state", ["sent", "queued"]).order("broadcast_id").order("contact_id").range(from, to)
    );
    for (const r of rows) {
      const run = ofRun.get(r.broadcast_id);
      if (!run) continue;
      if (STOPPED.has(run.state) && r.state !== "sent") continue;
      const at = r.sent_at ?? run.scheduled_for ?? run.created_at;
      if (Date.parse(at) < sinceMs) continue;
      out.push({
        contact_id: r.contact_id,
        playbook_id: run.playbook_id,
        at,
        sent: r.state === "sent",
        held: run.state === "pending_approval",
        follow_up: followUp.has(run.id),
        // As the run wrote them from the deal (contracts proposalFactsFor), so they are compared as they are.
        deal: followUp.has(run.id) ? factString(r.proposal_deal) : null,
        link: followUp.has(run.id) ? factString(r.proposal_link) : null
      });
    }
  }
  return out;
}
var factString = (v) => typeof v === "string" && v ? v : null;
function touchIndex(touches) {
  const byThis = /* @__PURE__ */ new Map();
  const byAny = /* @__PURE__ */ new Map();
  const followUps = /* @__PURE__ */ new Map();
  const followUpKeys = /* @__PURE__ */ new Map();
  for (const t of touches) {
    const at = Date.parse(t.at);
    if (t.playbook_id) {
      const m = byThis.get(t.playbook_id) ?? /* @__PURE__ */ new Map();
      m.set(t.contact_id, Math.max(m.get(t.contact_id) ?? 0, at));
      byThis.set(t.playbook_id, m);
    }
    byAny.set(t.contact_id, Math.max(byAny.get(t.contact_id) ?? 0, at));
    if (t.follow_up) followUps.set(t.contact_id, Math.max(followUps.get(t.contact_id) ?? 0, at));
    if (t.follow_up) {
      const m = followUpKeys.get(t.contact_id) ?? /* @__PURE__ */ new Map();
      const key = followUpKey(t);
      m.set(key, Math.max(m.get(key) ?? 0, at));
      followUpKeys.set(t.contact_id, m);
    }
  }
  return { byThis, byAny, followUps, followUpKeys };
}

// src/repositories/deals.ts
async function yesesSince(db, tenantId, since) {
  const rows = await readAllRows(
    "deals",
    (from, to) => db.from("deals").select("id, stage, proposed_at, decided_at").eq("tenant_id", tenantId).in("stage", ["won", "ended"]).gte("decided_at", since.toISOString()).order("id").range(from, to)
  );
  return rows.map((r) => ({ stage: r.stage, proposed_at: r.proposed_at, decided_at: r.decided_at }));
}

// src/repositories/partner.ts
var PARTNER_COLUMNS = "id, code, status, share_bp, terms_accepted_at, created_at";
var noTable = (message) => /\bpartners\b/.test(message) && /does not exist|could not find|schema cache/i.test(message);
async function getOwnPartner(db) {
  const { data, error } = await db.from("partners").select(PARTNER_COLUMNS).maybeSingle();
  if (error) {
    if (noTable(error.message)) return null;
    throw new Error(`getOwnPartner: ${error.message}`);
  }
  return data;
}
async function sessionHoldsPartnerSeat(db) {
  try {
    const { data, error } = await db.rpc("session_has_partner_seat");
    return !error && data === true;
  } catch {
    return false;
  }
}
async function getPartnerBroughtCount(db, partnerId) {
  const of = () => db.from("partner_tenants").select("tenant_id", { count: "exact", head: true }).eq("partner_id", partnerId);
  const r = await of().or("origin.eq.link,origin.eq.invite,handover_accepted_at.not.is.null");
  if (!r.error) return r.count ?? 0;
  if (!/\b(origin|handover_accepted_at)\b/.test(r.error.message)) return null;
  const older = await of();
  return older.error ? null : older.count ?? 0;
}
async function getPartnerBalance(db) {
  const { data, error } = await db.rpc("partner_balance");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message))
      return [];
    throw new Error(`getPartnerBalance: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    currency: r.currency,
    state: r.state,
    earned_cents: Number(r.earned_cents),
    next_payable_at: r.next_payable_at ?? null
  }));
}
async function getPartnerLetters(db) {
  const { data, error } = await db.from("partners").select("letters").maybeSingle();
  if (error || !data) return null;
  return typeof data.letters === "boolean" ? data.letters : null;
}
async function setPartnerLetters(db, on) {
  const { data, error } = await db.rpc("partner_letters_set", { p_on: on });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, letters: data === true };
}
async function becomePartner(db, code) {
  const { data, error } = await db.rpc("partner_become", { p_code: code });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, row: data };
}
var noFunction2 = (e) => e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message);
async function getPartnerWorkspaces(db) {
  const [o, m] = await Promise.all([db.rpc("partner_overview"), db.rpc("partner_workspace_money")]);
  for (const r of [o, m]) {
    if (r.error && !noFunction2(r.error)) throw new Error(`getPartnerWorkspaces: ${r.error.message}`);
  }
  return {
    overview: o.error ? [] : o.data ?? [],
    money: m.error ? [] : (m.data ?? []).map((r) => ({
      ...r,
      held_cents: Number(r.held_cents),
      payable_cents: Number(r.payable_cents),
      paid_cents: Number(r.paid_cents),
      month_cents: Number(r.month_cents)
    }))
  };
}
async function getPlatformPartners(db) {
  const [b, w] = await Promise.all([db.rpc("platform_partner_balances"), db.rpc("platform_partner_workspaces")]);
  for (const r of [b, w]) {
    if (r.error && !noFunction2(r.error)) throw Object.assign(new Error(r.error.message), { code: r.error.code });
  }
  return {
    balances: b.error ? [] : (b.data ?? []).map((r) => ({
      ...r,
      held_cents: Number(r.held_cents),
      payable_cents: Number(r.payable_cents),
      paid_cents: Number(r.paid_cents)
    })),
    workspaces: w.error ? [] : w.data ?? []
  };
}
async function setPartnerStanding(db, tenantId, standing, why) {
  const { data, error } = await db.rpc("partner_standing_set", {
    p_tenant: tenantId,
    p_standing: standing,
    p_why: why
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return {
    ok: true,
    value: data
  };
}
async function markPartnerPaid(db, partnerId, currency, reference, expectedCents) {
  const { data, error } = await db.rpc("partner_payout_mark", {
    p_partner: partnerId,
    p_currency: currency,
    p_reference: reference,
    ...expectedCents === void 0 ? {} : { p_expected_cents: expectedCents }
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data;
  return { ok: true, value: { ...v, total_cents: Number(v.total_cents) } };
}
async function setPartnerStatus(db, partnerId, status, why) {
  const { data, error } = await db.rpc("partner_status_set", { p_partner: partnerId, p_status: status, p_why: why });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: data };
}
async function recordPartnerSecondFactorReset(db, partnerId, why) {
  const { data, error } = await db.rpc("partner_second_factor_reset", { p_partner: partnerId, p_why: why });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: String(data) };
}
async function createWorkspaceForBusiness(db, input) {
  const { data, error } = await db.rpc("create_workspace_for_business", {
    p_name: input.name,
    p_timezone: input.timezone ?? "",
    p_owner_email: input.ownerEmail
  });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "", message: "The workspace was not made." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name } };
}
async function resendHandover(db, tenantId, email) {
  const { data, error } = await db.rpc("partner_handover_resend", { p_tenant: tenantId, p_email: email });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data ?? {};
  return {
    ok: true,
    value: { email: String(v.email ?? email), sentAt: String(v.sent_at ?? ""), expiresAt: String(v.expires_at ?? "") }
  };
}
async function getOpenHandovers(db) {
  const { data, error } = await Promise.resolve().then(() => db.rpc("handovers_mine")).catch((e) => ({ data: null, error: { code: "", message: e instanceof Error ? e.message : String(e) } }));
  if (error) return { handovers: [], error: noFunction2(error) ? null : error.message };
  return {
    handovers: (data ?? []).map((r) => ({
      tenantId: r.tenant_id,
      workspace: r.workspace,
      partnerCode: r.partner_code,
      expiresAt: r.expires_at
    })),
    error: null
  };
}
async function acceptHandover(db, tenantId) {
  const { data, error } = await db.rpc("handover_accept", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "P0002", message: "There is no workspace waiting for you there." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name } };
}
async function declineHandover(db, tenantId) {
  const { error } = await db.rpc("handover_decline", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}
async function getPartnerHandovers(db) {
  const { data, error } = await db.from("partner_tenants").select(
    "tenant_id, handover_email, handover_sent_at, handover_expires_at, handover_accepted_at, handover_declined_at, tenants(name)"
  ).eq("origin", "handover").order("handover_sent_at", { ascending: false });
  if (error) {
    if (/\b(origin|handover_\w+)\b/.test(error.message) && /does not exist|could not find/i.test(error.message))
      return [];
    throw new Error(`getPartnerHandovers: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    tenantId: r.tenant_id,
    name: r.tenants?.name ?? null,
    email: r.handover_email ?? "",
    sentAt: r.handover_sent_at ?? "",
    expiresAt: r.handover_expires_at ?? "",
    acceptedAt: r.handover_accepted_at,
    declinedAt: r.handover_declined_at
  }));
}
async function getHandoverInvite(db, tenantId) {
  const { data, error } = await db.from("partner_tenants").select(
    "handover_email, handover_expires_at, handover_accepted_at, handover_declined_at, tenants(name), partners(code)"
  ).eq("tenant_id", tenantId).eq("origin", "handover").maybeSingle();
  if (error) throw new Error(`getHandoverInvite: ${error.message}`);
  if (!data?.handover_email || !data.handover_expires_at) return null;
  if (data.handover_accepted_at || data.handover_declined_at) return null;
  if (Date.parse(data.handover_expires_at) <= Date.now()) return null;
  return {
    email: data.handover_email,
    workspace: data.tenants?.name ?? "",
    partnerCode: data.partners?.code ?? "",
    expiresAt: data.handover_expires_at
  };
}
async function invitePartner(db, tenantId, code) {
  const { data, error } = await db.rpc("partner_invite", { p_tenant: tenantId, p_code: code });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data ?? {};
  return {
    ok: true,
    value: { code: String(v.code ?? code), sentAt: String(v.sent_at ?? ""), expiresAt: String(v.expires_at ?? "") }
  };
}
async function withdrawPartnerInvite(db, tenantId) {
  const { error } = await db.rpc("partner_invite_withdraw", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}
async function getWorkspacePartner(db, tenantId) {
  const { data, error } = await db.rpc("workspace_partner", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const v = data ?? {};
  const p = v.partner ?? null;
  const i = v.invitation ?? null;
  return {
    ok: true,
    value: {
      partner: p ? {
        code: String(p.code ?? ""),
        origin: String(p.origin ?? ""),
        since: String(p.since ?? ""),
        seated: p.seated === true
      } : null,
      invitation: i ? {
        code: String(i.code ?? ""),
        sentAt: String(i.sent_at ?? ""),
        expiresAt: String(i.expires_at ?? ""),
        declinedAt: i.declined_at ? String(i.declined_at) : null
      } : null
    }
  };
}
async function getPartnerInvitations(db) {
  const { data, error } = await db.rpc("partner_invitations_mine");
  if (error) {
    if (noFunction2(error)) return [];
    throw new Error(`getPartnerInvitations: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    tenantId: r.tenant_id,
    workspace: r.workspace,
    sentAt: r.sent_at,
    expiresAt: r.expires_at
  }));
}
async function acceptPartnerInvite(db, tenantId) {
  const { data, error } = await db.rpc("partner_invite_accept", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, code: "P0002", message: "There is no invitation for you there." };
  return { ok: true, value: { id: row.id, slug: row.slug, name: row.name, earns: row.earns } };
}
async function declinePartnerInvite(db, tenantId) {
  const { error } = await db.rpc("partner_invite_decline", { p_tenant: tenantId });
  if (error) return { ok: false, code: error.code ?? "", message: error.message };
  return { ok: true, value: null };
}
async function getPartnerInviteMail(db, tenantId) {
  const { data, error } = await db.from("partner_invitations").select("expires_at, declined_at, tenants(name), partners(code, user_id)").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`getPartnerInviteMail: ${error.message}`);
  if (!data || data.declined_at || Date.parse(data.expires_at) <= Date.now()) return null;
  const userId = data.partners?.user_id;
  if (!userId) return null;
  const who = await db.auth.admin.getUserById(userId);
  if (who.error) throw new Error(`getPartnerInviteMail: ${who.error.message}`);
  const email = who.data.user?.email;
  if (!email) return null;
  return {
    email,
    workspace: data.tenants?.name ?? "",
    partnerCode: data.partners?.code ?? "",
    expiresAt: data.expires_at
  };
}

// src/repositories/leads.ts
var ONE_LEAD_COLUMNS = "id, tenant_id, place_id, business_name, category, street, city, region, postal_code, neighborhood, lat, lng, mark_path, website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, email_checked_at, rating, reviews, stage, closed_reason, last_outcome, last_note, about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank, contact_id, contacted_at, converted_at, exported_at, found_at, version, blanked_at, erased_at";
var jsonString = (v) => typeof v === "string" ? v : null;
function memberOf(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = jsonString(data.id);
  const searchId = jsonString(data.search_id);
  const cls = jsonString(data.class);
  if (!id || !searchId || !cls) return null;
  return {
    id,
    search_id: searchId,
    class: cls,
    excluded_by: jsonString(data.excluded_by),
    fit: jsonString(data.fit),
    reason: jsonString(data.reason) ?? "",
    distance_m: typeof data.distance_m === "number" ? data.distance_m : null,
    counted: data.counted === true,
    judgment: data.judgment ?? null
  };
}
async function readLeadOne(db, tenantId, leadId, searchId) {
  const [l, m, places] = await Promise.all([
    db.from("leads").select(ONE_LEAD_COLUMNS).eq("id", leadId).eq("tenant_id", tenantId).maybeSingle(),
    db.rpc("lead_member_of", {
      p_tenant_id: tenantId,
      p_lead_id: leadId,
      ...searchId ? { p_search_id: searchId } : {}
    }),
    db.from("lead_places").select("id", { count: "exact", head: true }).eq("lead_id", leadId)
  ]);
  if (l.error) throw new Error(`readLeadOne: ${l.error.message}`);
  if (m.error) throw new Error(`lead_member_of: ${m.error.message}`);
  if (places.error) throw new Error(`readLeadOne: ${places.error.message}`);
  const lead = l.data;
  const member = memberOf(m.data);
  if (!lead || lead.tenant_id !== tenantId || lead.blanked_at || lead.erased_at || !member) return null;
  return { lead, member, places: places.count ?? 1 };
}

// src/lines.ts
async function ownLineOf(db, tenantId) {
  const { data, error } = await db.from("lines").select("id, tenant_id, e164, provider, subaccount_sid, messaging_service_sid, sms_state, voice_state").eq("tenant_id", tenantId).neq("provider", "carrier").neq("voice_state", "failed").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(`cannot read the workspace's own line: ${error.message}`);
  return data;
}

// src/realtime.ts
var EVERY = ["INSERT", "UPDATE", "DELETE"];
var INSERTS = ["INSERT"];
var INSERTS_AND_UPDATES = ["INSERT", "UPDATE"];
var WATCHED = [
  { table: "messages", events: INSERTS_AND_UPDATES },
  // arrivals, then a send's ticks and a failure written late: an update is told with its statuses (00327)
  { table: "conversations", events: EVERY },
  // the pause and snooze clocks, other tabs
  { table: "escalations", events: EVERY },
  // opened by the edge, resolved elsewhere
  { table: "calls", events: EVERY },
  // a call starting, each live turn, its end, its analysis: told with its statuses
  { table: "notifications", events: INSERTS },
  // an alert the edge kept: the bell repaints
  { table: "lines", events: EVERY },
  // a line's saga step, its failure, its answer, its release: Setup repaints
  { table: "google_listings", events: EVERY },
  // the listing linked, read, or removed: Setup and Reports repaint
  { table: "google_reviews", events: INSERTS },
  // a review seen for the first time
  { table: "billing_accounts", events: EVERY },
  // Stripe's answer, applied by the webhook: Billing and Setup repaint
  { table: "tenant_channels", events: EVERY },
  // a channel connected, switched off, or written by a line's saga: Setup and Connections repaint (00117)
  { table: "capability_activations", events: EVERY },
  // the owner's act, in another tab: Setup repaints (00108)
  { table: "business_records", events: EVERY },
  // the record the carriers read, saved on Connections: Setup repaints (00075)
  { table: "google_connections", events: EVERY },
  // the profile connected, synced or failing by the hourly sweep: Connections repaints (00070)
  { table: "sending_domains", events: EVERY },
  // a domain added, checked, verified, held or removed: Connections repaints (00175)
  // a round's page committed, a check landed, a class changed: the Leads scope repaints (00140)
  { table: "leads", events: EVERY },
  { table: "lead_searches", events: EVERY },
  { table: "lead_rounds", events: EVERY },
  { table: "lead_search_members", events: EVERY },
  // a deal recorded or moved by a teammate, or by a payment: People (and its Pipeline) repaints (00156, 0008)
  { table: "deals", events: EVERY },
  // a note written, a step set or done, or a note removed by a teammate: People's next steps and a person's page repaint (00157, 00166)
  { table: "person_notes", events: EVERY },
  // a list made, renamed, archived, or people put on and taken off by a teammate: People's rail repaints (00169)
  { table: "segments", events: EVERY },
  { table: "segment_members", events: EVERY },
  // a reply to a reach-out read, drafted or undone: the Inbox's strip and chip repaint (00222)
  { table: "reach_out_replies", events: EVERY },
  // a run made by the sweep, approved, stopped, sending or finished: Today's Approve and Stop rows and Campaigns
  // repaint (00321). Its people are not watched: a run's page reads them when it opens.
  { table: "broadcasts", events: EVERY },
  // a booking that arrived by email written, moved or withdrawn by the booking_read job: the Calendar repaints (00345)
  { table: "appointments", events: EVERY }
];
function watchedTables() {
  return WATCHED.map((w) => w.table);
}
function watchedEvents() {
  return WATCHED.map((w) => ({ table: w.table, events: [...w.events] }));
}
var hearings = /* @__PURE__ */ new WeakMap();
function subscribeWorkspaceChanges(client, onChange, opts = {}) {
  const tenantId = opts.tenantId;
  if (!tenantId) return () => {
  };
  const topic = `workspace:${tenantId}:changes`;
  let byTopic = hearings.get(client);
  if (!byTopic) hearings.set(client, byTopic = /* @__PURE__ */ new Map());
  const heard = byTopic;
  let h = heard.get(topic);
  if (!h) {
    h = { listeners: /* @__PURE__ */ new Set(), channel: null, status: null, joining: null, leaving: Promise.resolve() };
    heard.set(topic, h);
  }
  const hearing = h;
  const listener = { onChange, onStatus: opts.onStatus };
  hearing.listeners.add(listener);
  const status = hearing.channel ? hearing.status : null;
  if (status) queueMicrotask(() => hearing.listeners.has(listener) && report(listener, topic, status));
  else if (!hearing.channel && !hearing.joining)
    hearing.joining = join(client, tenantId, topic, hearing, heard).catch(() => {
      hearing.joining = null;
      for (const l of [...hearing.listeners]) report(l, topic, "CHANNEL_ERROR");
    });
  let left = false;
  return () => {
    if (left) return;
    left = true;
    hearing.listeners.delete(listener);
    if (hearing.listeners.size || !hearing.channel) return;
    const channel = hearing.channel;
    hearing.channel = null;
    hearing.status = null;
    hearing.leaving = client.removeChannel(channel).then(
      () => void 0,
      () => void 0
    );
    void hearing.leaving.then(() => forget(heard, topic, hearing));
  };
}
async function join(client, tenantId, topic, hearing, heard) {
  await hearing.leaving;
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (token) await client.realtime.setAuth(token);
  hearing.joining = null;
  if (!hearing.listeners.size) return forget(heard, topic, hearing);
  const channel = client.channel(topic, { config: { private: true } }).on("broadcast", { event: "*" }, (message) => tell(hearing, tenantId, message));
  hearing.channel = channel;
  channel.subscribe((status) => {
    if (hearing.channel !== channel) return;
    hearing.status = status;
    for (const listener of [...hearing.listeners]) report(listener, topic, status);
  });
}
function forget(heard, topic, hearing) {
  if (hearing.listeners.size || hearing.channel || hearing.joining || heard.get(topic) !== hearing) return;
  heard.delete(topic);
}
function report(listener, topic, status) {
  if (listener.onStatus) listener.onStatus(status);
  else if (status !== "SUBSCRIBED") console.warn("realtime_status", topic, status);
}
function tell(hearing, tenantId, message) {
  const notice = message.payload ?? {};
  if (typeof notice.table !== "string") return;
  const table = notice.table;
  const event = message.event ?? "*";
  const statuses = Array.isArray(notice.statuses) ? notice.statuses : [void 0];
  for (const listener of [...hearing.listeners])
    for (const status of statuses)
      listener.onChange({ tenant_id: tenantId, ...typeof status === "string" ? { status } : {} }, table, event);
}

// src/sweeps.ts
import { PLAYBOOK_HOURS } from "../../contracts/dist/index.js";
function remainingOf(rows) {
  const first = rows[0];
  if (first === void 0) return 0;
  const total = first.due_total;
  if (typeof total !== "number") throw new Error("the database answered without its count of what is due");
  return Math.max(0, total - rows.length);
}
async function duePlaybooks(db, p) {
  const { data, error } = await db.rpc("playbooks_due", {
    p_kind: p.kind,
    p_at: p.at.toISOString(),
    p_last_hour: PLAYBOOK_HOURS.max,
    p_limit: p.limit,
    ...p.tenantId ? { p_tenant_id: p.tenantId } : {}
  });
  if (error) throw new Error(`cannot read the playbooks due: ${error.message}`);
  const rows = data ?? [];
  return {
    // The row as to_jsonb wrote it: the table's own shape, every column a JSON value.
    rows: rows.map((r) => ({ playbook: r.playbook, timezone: r.timezone })),
    remaining: remainingOf(rows)
  };
}
async function stampPlaybooksTried(db, tenantId, p) {
  if (p.ids.length === 0) return;
  const { error } = await db.from("playbooks").update({ last_run_at: p.at.toISOString() }).eq("tenant_id", tenantId).in("id", p.ids);
  if (error) throw new Error(`cannot move the moments to the back of the page: ${error.message}`);
}
async function dueCalendars(db, p) {
  const { data, error } = await db.rpc("calendars_due", {
    p_before: p.before.toISOString(),
    p_limit: p.limit,
    ...p.tenantId ? { p_tenant_id: p.tenantId } : {}
  });
  if (error) throw new Error(`cannot read the calendars due: ${error.message}`);
  const rows = data ?? [];
  return {
    rows: rows.map((r) => ({ tenant_id: r.tenant_id, config: r.config, timezone: r.timezone })),
    remaining: remainingOf(rows)
  };
}
function readAtOf(config) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) return null;
  const at = config.quality_read_at;
  return typeof at === "string" ? at : null;
}
async function whatsappNumbersToRead(db, limit) {
  const { data, error } = await db.from("tenant_channels").select("id, tenant_id, external_id, waba_id, number_e164, config").eq("kind", "whatsapp").eq("status", "active").order("config->>quality_read_at", { ascending: true, nullsFirst: true }).limit(limit);
  if (error) throw new Error(`cannot read the WhatsApp numbers: ${error.message}`);
  return (data ?? []).map((r) => ({
    channel_id: r.id,
    tenant_id: r.tenant_id,
    phone_number_id: r.external_id,
    waba_id: r.waba_id,
    number_e164: r.number_e164,
    read_at: readAtOf(r.config)
  }));
}
async function whatsappNumberOf(db, tenantId) {
  const { data, error } = await db.from("tenant_channels").select("id, tenant_id, external_id, waba_id, number_e164, config").eq("tenant_id", tenantId).eq("kind", "whatsapp").eq("status", "active").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(`cannot read the workspace's WhatsApp number: ${error.message}`);
  if (!data) return null;
  return {
    channel_id: data.id,
    tenant_id: data.tenant_id,
    phone_number_id: data.external_id,
    waba_id: data.waba_id,
    number_e164: data.number_e164,
    read_at: readAtOf(data.config)
  };
}
var KEPT_ANSWERS = ["first", "changed", "same", "gone"];
async function keepChannelQuality(db, tenantId, channelId, rating) {
  const { data, error } = await db.rpc("channel_keep_quality", {
    p_tenant_id: tenantId,
    p_channel_id: channelId,
    p_rating: rating
  });
  if (error) throw new Error(`channel_keep_quality: ${error.message}`);
  const kept = KEPT_ANSWERS.find((a) => a === data);
  if (kept === void 0) throw new Error(`channel_keep_quality: answered ${JSON.stringify(data)}`);
  return kept;
}
async function keepChannelStanding(db, tenantId, channelId, standing) {
  const { data, error } = await db.rpc("channel_keep_standing", {
    p_tenant_id: tenantId,
    p_channel_id: channelId,
    p_standing: standing
  });
  if (error) throw new Error(`channel_keep_standing: ${error.message}`);
  const kept = KEPT_ANSWERS.find((a) => a === data);
  if (kept === void 0) throw new Error(`channel_keep_standing: answered ${JSON.stringify(data)}`);
  return kept;
}

// src/repositories/calendar/appointments.ts
import {
  APPOINTMENT_STATUSES
} from "../../contracts/dist/index.js";
var LIVE_STATUSES = ["proposed", "booked"];
var SPAN_MAX = 2e3;
function clientFilter(client) {
  const parts = [
    client.phone ? `client_phone.eq.${client.phone}` : "",
    client.email ? `client_email.eq.${client.email}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(",") : null;
}
async function appointmentByKey(db, tenantId, source, externalId) {
  const { data, error } = await db.from("appointments").select("*").eq("tenant_id", tenantId).eq("source", source).eq("external_id", externalId).maybeSingle();
  if (error) throw new Error(`appointment_by_key: ${error.message}`);
  return data;
}
async function appointmentByClientStart(db, tenantId, client, startMs, withinMs) {
  const who = clientFilter(client);
  if (!who) return null;
  const { data, error } = await db.from("appointments").select("*").eq("tenant_id", tenantId).in("status", [...LIVE_STATUSES]).gte("starts_at", new Date(startMs - withinMs).toISOString()).lte("starts_at", new Date(startMs + withinMs).toISOString()).or(who).order("starts_at", { ascending: true }).limit(10);
  if (error) throw new Error(`appointment_by_client_start: ${error.message}`);
  const rows = data ?? [];
  rows.sort((a, b) => Math.abs(Date.parse(a.starts_at) - startMs) - Math.abs(Date.parse(b.starts_at) - startMs));
  return rows[0] ?? null;
}
async function insertAppointment(db, row) {
  const { data, error } = await db.from("appointments").insert(row).select("id").single();
  if (error || !data)
    throw Object.assign(new Error(`appointment_insert: ${error?.message ?? "no row"}`), { code: error?.code ?? null });
  return { id: data.id };
}
async function updateAppointment(db, tenantId, id, patch) {
  const { error } = await db.from("appointments").update(patch).eq("tenant_id", tenantId).eq("id", id);
  if (!error) return "updated";
  if (error.code === "23514") return "refused";
  throw new Error(`appointment_update: ${error.message}`);
}
async function appointmentsBetween(db, tenantId, fromIso, toIso) {
  const { data, error } = await db.from("appointments").select("*").eq("tenant_id", tenantId).in("status", [...LIVE_STATUSES]).neq("source", "calendar_feed").gt("ends_at", fromIso).lt("starts_at", toIso).order("starts_at", { ascending: true }).limit(SPAN_MAX);
  if (error) throw new Error(`appointments_between: ${error.message}`);
  return data ?? [];
}
async function appointmentsForClient(db, tenantId, who, fromIso) {
  const or = clientFilter(who);
  if (!or) return [];
  const { data, error } = await db.from("appointments").select("*").eq("tenant_id", tenantId).in("status", [...LIVE_STATUSES]).gt("ends_at", fromIso).or(or).order("starts_at", { ascending: true }).limit(50);
  if (error) throw new Error(`appointments_for_client: ${error.message}`);
  return data ?? [];
}
async function appointmentsScrub(db, p) {
  const { data, error } = await db.rpc("appointments_scrub", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_needles: [...p.needles]
  });
  if (error) throw new Error(`appointments_scrub: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
async function contactIdByPhone(db, tenantId, phone) {
  const { data, error } = await db.from("contacts").select("id").eq("tenant_id", tenantId).eq("phone_e164", phone).is("erased_at", null).is("merged_into_contact_id", null).limit(1).maybeSingle();
  if (error) throw new Error(`contact_by_phone: ${error.message}`);
  return data?.id ?? null;
}
async function contactIdByEmail(db, tenantId, email) {
  const { data, error } = await db.from("contacts").select("id").eq("tenant_id", tenantId).eq("email", email).is("erased_at", null).is("merged_into_contact_id", null).limit(1).maybeSingle();
  if (error) throw new Error(`contact_by_email: ${error.message}`);
  return data?.id ?? null;
}
var count = (o, k) => typeof o[k] === "number" ? o[k] : 0;
async function syncFeedAppointments(db, p) {
  const { data, error } = await db.rpc("appointments_feed_sync", {
    p_tenant_id: p.tenantId,
    p_timezone: p.timezone,
    p_rows: p.rows.map((r) => ({
      external_id: r.external_id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      all_day: r.all_day,
      service: r.service,
      consultation: r.consultation,
      contact_id: r.contact_id
    })),
    p_from: p.window.from.toISOString(),
    p_to: p.window.to.toISOString(),
    p_now: (p.now ?? /* @__PURE__ */ new Date()).toISOString()
  });
  if (error) throw Object.assign(new Error(`appointments_feed_sync: ${error.message}`), { code: error.code });
  const o = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  return {
    added: count(o, "added"),
    moved: count(o, "moved"),
    back: count(o, "back"),
    vanished: count(o, "vanished"),
    seen: count(o, "seen"),
    stale: o.stale === true ? 1 : 0
  };
}
var KEYS_PER_READ = 25;
var isStatus = (s) => APPOINTMENT_STATUSES.includes(s);
async function appointmentStates(db, tenantId, keys) {
  const out = /* @__PURE__ */ new Map();
  for (let i = 0; i < keys.length; i += KEYS_PER_READ) {
    const { data, error } = await db.from("appointments").select("external_id, status, starts_at, vanished_at, updated_at").eq("tenant_id", tenantId).eq("source", "calendar_feed").in("external_id", keys.slice(i, i + KEYS_PER_READ));
    if (error && (error.code === "PGRST205" || error.code === "42P01")) return out;
    if (error) throw new Error(`appointments: ${error.message}`);
    for (const r of data ?? []) {
      if (r.external_id && isStatus(r.status))
        out.set(r.external_id, {
          status: r.status,
          starts_at: r.starts_at,
          vanished_at: r.vanished_at,
          updated_at: r.updated_at
        });
    }
  }
  return out;
}

// src/repositories/calendar/notices.ts
async function appointmentNoticeOf(db, tenantId, noticeId) {
  const { data, error } = await db.from("appointment_notices").select("*").eq("tenant_id", tenantId).eq("notice_id", noticeId).maybeSingle();
  if (error) throw new Error(`appointment_notice: ${error.message}`);
  return data;
}
async function keepAppointmentNotice(db, row) {
  const { error } = await db.from("appointment_notices").upsert({ ...row, read_at: (/* @__PURE__ */ new Date()).toISOString() }, { onConflict: "tenant_id,notice_id" });
  if (error) throw new Error(`appointment_notice_keep: ${error.message}`);
}
async function appointmentNoticesOf(db, tenantId) {
  const latest = await db.from("appointment_notices").select("tool, received_at").eq("tenant_id", tenantId).in("outcome", ["booked", "changed", "cancelled"]).order("received_at", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error(`appointment_notices_latest: ${latest.error.message}`);
  const held = await db.from("appointment_notices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("outcome", "held");
  if (held.error) throw new Error(`appointment_notices_held: ${held.error.message}`);
  return { tool: latest.data?.tool ?? null, last_at: latest.data?.received_at ?? null, held: held.count ?? 0 };
}
async function memberHasAddress(db, tenantId, address) {
  const { data, error } = await db.rpc("member_has_address", { p_tenant_id: tenantId, p_address: address });
  if (error) throw new Error(`member_has_address: ${error.message}`);
  return data === true;
}
var HELD_MAX = 20;
async function heldNoticesOf(db, tenantId) {
  const { data, error } = await db.from("appointment_notices").select("*").eq("tenant_id", tenantId).eq("outcome", "held").order("received_at", { ascending: false }).limit(HELD_MAX);
  if (error) throw new Error(`appointment_notices_held_list: ${error.message}`);
  return data ?? [];
}
async function appointmentNoticeById(db, tenantId, id) {
  const { data, error } = await db.from("appointment_notices").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(`appointment_notice_by_id: ${error.message}`);
  return data;
}
async function dismissAppointmentNotice(db, tenantId, id) {
  const { data, error } = await db.from("appointment_notices").update({ outcome: "dismissed" }).eq("tenant_id", tenantId).eq("id", id).eq("outcome", "held").select("id");
  if (error) throw new Error(`appointment_notice_dismiss: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
export {
  CALL_CONTROL_S,
  DB_REQUEST_HEADER,
  DEFAULT_ROW_CAP,
  ERASURE_LEGS,
  ERASURE_STRATEGIES,
  HISTORY_COLUMNS,
  IDS_PER_READ,
  MAX_ROWS,
  PEOPLE_PAGE,
  PERSON_FORGOTTEN,
  acceptHandover,
  acceptPartnerInvite,
  activityTokensOf,
  addPersonNote,
  addToList,
  addToWaitlist,
  addressesSuppressed,
  aiFailuresHour,
  answeredReachOutEmail,
  applyDomainCheck,
  applyReplyReading,
  appointmentByClientStart,
  appointmentByKey,
  appointmentNoticeById,
  appointmentNoticeOf,
  appointmentNoticesOf,
  appointmentStates,
  appointmentsBetween,
  appointmentsForClient,
  appointmentsScrub,
  archiveConversation,
  archiveList,
  assembleBroadcast,
  assembleHistory,
  becomePartner,
  callerNameOf,
  callersOf,
  campaignMonthSent,
  campaignSeries,
  claimCallActivity,
  claimCallNotification,
  claimControl,
  claimIdempotencyKey,
  claimReplyTell,
  claimReplyTurn,
  claimSends,
  claimVoiceTurn,
  clearForwardingConfirmation,
  closedRunSends,
  coldReceiptsOwed,
  contactEmailOf,
  contactIdByEmail,
  contactIdByPhone,
  contactSeen,
  countSendingDomains,
  countSentToday,
  createList,
  createMessageVersion,
  createServiceClient,
  createWorkspaceFn,
  createWorkspaceForBusiness,
  declineHandover,
  declinePartnerInvite,
  deleteList,
  deleteSecondFactor,
  deleteSendingDomain,
  deleteSendingDomainAsRead,
  deliveryOf,
  describeLead,
  dismissAppointmentNotice,
  dismissPersonDoubt,
  domainCapacityOf,
  domainHeldSince,
  doubtOn,
  dropFromList,
  dueCalendars,
  dueDomains,
  duePlaybooks,
  dueSendingDomains,
  emailOfferCounts,
  emailOffersPause,
  emailWordsByTemplate,
  emailWordsFrom,
  emailWordsOf,
  emitEvent,
  endVoiceSession,
  erasureDigests,
  eventOfDelivery,
  everyoneIn,
  failStrandedRun,
  failedMessageErrors,
  finishableRuns,
  firstReplies,
  followUpTouchesSince,
  forgetActivityTokens,
  forgetNotification,
  getHandoverInvite,
  getOpenHandovers,
  getOwnPartner,
  getPartnerBalance,
  getPartnerBroughtCount,
  getPartnerHandovers,
  getPartnerInvitations,
  getPartnerInviteMail,
  getPartnerLetters,
  getPartnerWorkspaces,
  getPlatformPartners,
  getTenantConfig,
  getWorkspacePartner,
  handRun,
  hasNewerCopy,
  heldNoticeDue,
  heldNoticesOf,
  heldStale,
  holdRecipients,
  holdsReplyTurn,
  ingestCall,
  ingestInbound,
  ingestInboundEmail,
  insertAppointment,
  insertQueuedEmail,
  insertVoiceSession,
  invitePartner,
  inviteUserByEmail,
  isMissingDoor,
  isWorkspaceCall,
  keepAppointmentNotice,
  keepChannelQuality,
  keepChannelStanding,
  keepForwardingConfirmation,
  keepIdempotencyReceipt,
  keepInvoiceAmount,
  keepMessageCost,
  keepProviderEvent,
  lastInboundEmail,
  lastOutboundEmailSubject,
  leadAddressBounced,
  leadNamesByIds,
  leadSlotsOf,
  leadWritten,
  lineForwardingSet,
  linkCallMessage,
  listMemberIds,
  listPolicies,
  listRow,
  listSecondFactors,
  mailboxById,
  mailboxFor,
  mailboxOfTenant,
  markContact,
  markHeldNotice,
  markPartnerPaid,
  markProcessed,
  markReplyDraft,
  markReplyTold,
  markWaitlistInvited,
  memberHasAddress,
  membershipCountOf,
  mergePeople,
  messageByExternalId,
  messageSenders,
  messageSlots,
  messageVersionRowsOf,
  migrationHead,
  monthSent,
  moveSend,
  moveVoiceSessionContext,
  namedFetch,
  namesOfPeople,
  notesForReceptionist,
  noticeKept,
  observeDb,
  offerLanguageOf,
  offersAnswerOf,
  offersEmailReach,
  openConversation,
  openDoubtsOf,
  ourLastWire,
  outreachFactsOf,
  outreachModeOf,
  ownLineOf,
  ownVersionsFiled,
  parentEmailOf,
  pauseConversation,
  pauseEmailOffers,
  peopleCursorOf,
  peoplePage,
  personDecisions,
  personReplyMode,
  personRow,
  platformHoldStands,
  platformWide,
  playbookChannels,
  playbookForChannels,
  playbooksOnList,
  providerEventOf,
  purgeAiUsage,
  putTenantConfig,
  queuedOutcomes,
  queuedRecipients,
  reachOutAudience,
  reachOutDayDue,
  reachOutFollowers,
  reachOutPerson,
  reachOutRecord,
  reachOutReplyOf,
  reachOutReport,
  reachOutRootOf,
  reachOutRunSendsOf,
  reachOutSendRefOf,
  reachOutStepsOf,
  readAllRows,
  readAllRowsByKey,
  readDealForPhone,
  readJobToRequeue,
  readLeadContext,
  readLeadOne,
  readThreadState,
  readVoiceSession,
  readVoiceSessionByConversation,
  recheckSends,
  recordActivation,
  recordCallNote,
  recordCarrierOptOut,
  recordCheck,
  recordEchoAndPause,
  recordEmailNo,
  recordEmailStatus,
  recordEvent,
  recordLateCarrierOptOut,
  recordModelUsage,
  recordOutbound,
  recordPartnerSecondFactorReset,
  recordProviderDomain,
  recordStatusByExternalId,
  recordWhatsAppOffersStop,
  refreshWaitlistRow,
  relayEvents,
  releaseControl,
  releaseIdempotencyKey,
  releaseUnavailableHolds,
  removePlaybook,
  removeTemplateVersion,
  renameList,
  repliedTo,
  repliesFor,
  replyReadingOf,
  replyReadingRefOf,
  replyUndoableOf,
  reportSeries,
  reputationHoldsSince,
  resendHandover,
  reserveSendingDomain,
  resolveChannel,
  resolveChannelDetailed,
  resolveEscalationByReason,
  resolveOutboundTarget,
  resolveOutboundTargetForContact,
  resolvePerson,
  reviewsLedger,
  runGoesByOthers,
  runSending,
  runsWaitingOf,
  saveTemplateVersion,
  savedListFor,
  savedListsFor,
  scrubPersonNotes,
  scrubProviderEvents,
  searchMessages,
  searchNamesByIds,
  sendJobScheduled,
  sendNow,
  sendStanding,
  sendingDomainByHost,
  sendingDomainCounts,
  sendingDomainOf,
  sendingDomainsOf,
  sentEmailOf,
  sentEmailWithMessageId,
  sessionHoldsPartnerSeat,
  setCallRecording,
  setEmailOffersYes,
  setEmailUnsubscribed,
  setListRule,
  setPartnerLetters,
  setPartnerStanding,
  setPartnerStatus,
  setPersonReplyMode,
  setPlaybookState,
  setPolicyMode,
  setTemplateQuality,
  settleDelivery,
  signUpOnPublicKey,
  staleSends,
  stampEmailComplaint,
  stampEmailLeftAs,
  stampEmailSent,
  stampHandled,
  stampMailboxReceived,
  stampPlaybooksTried,
  stampReachOutStep,
  stopAllMessages,
  strandedRuns,
  stuckClaims,
  subjectsWith,
  subscribeWorkspaceChanges,
  subscriptionPaused,
  suppressEmailOf,
  syncFeedAppointments,
  takeCheckAttempt,
  takeIdempotencyKey,
  takeReplyRead,
  templateIdOf,
  templateStatusOf,
  templatesFor,
  templatesNamed,
  templatesToSend,
  tenantDb,
  tenantZoneOf,
  textLineFacts,
  textReached,
  touchIndex,
  touchSendingDomain,
  touchesSince,
  uncheckedSends,
  uncheckedWaiting,
  undoReplyReading,
  updateAppointment,
  updatePlaybook,
  usageMonth,
  waitlistWaiting,
  watchedEvents,
  watchedTables,
  whatsappChannelFacts,
  whatsappNumberOf,
  whatsappNumbersToRead,
  wireRowOf,
  withdrawEmail,
  withdrawPartnerInvite,
  workspaceAbout,
  workspaceAnswersOnItsOwn,
  workspaceMaySpend,
  workspaceMayUseModels,
  workspaceNameAndConfig,
  workspacePaused,
  writtenEmail,
  writtenEmails,
  yesesSince
};
