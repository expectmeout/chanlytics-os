// src/events.ts
import {
  personName,
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
function dbTimed(ms) {
  (observerHolder[OBSERVER_SLOT] ?? FALLBACK).timed?.(ms);
}
var REST_PATH = /\/rest\/v1\/(rpc\/)?([a-z_][a-z0-9_]*)\/?$/;
function touchOfCall(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let path;
  try {
    path = new URL(url, "http://db.invalid").pathname;
  } catch {
    return null;
  }
  const [, rpc, name] = REST_PATH.exec(path) ?? [];
  if (!name) return null;
  if (rpc) return { table: `rpc:${name}`, how: "call" };
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return { table: name, how: "read" };
  if (method === "PATCH") return { table: name, how: "UPDATE" };
  if (method === "DELETE") return { table: name, how: "DELETE" };
  const prefer = new Headers(init?.headers).get("prefer") ?? "";
  return { table: name, how: /resolution=merge-duplicates/.test(prefer) ? "INSERT UPDATE" : "INSERT" };
}
function dbTouched(input, init) {
  const observer = observerHolder[OBSERVER_SLOT] ?? FALLBACK;
  if (!observer.touched) return;
  const touch = touchOfCall(input, init);
  if (touch) observer.touched(touch.table, touch.how);
}
function namedFetch(base) {
  return (input, init) => {
    const send = base ?? globalThis.fetch;
    const id = dbRequestId();
    if (!id) return send(input, init);
    dbTouched(input, init);
    const headers = new Headers(init?.headers);
    headers.set(DB_REQUEST_HEADER, id);
    const started = performance.now();
    const call = send(input, { ...init, headers });
    void call.then(
      () => dbTimed(performance.now() - started),
      () => dbTimed(performance.now() - started)
    );
    return call;
  };
}

// src/events.ts
var WRITES = {
  "appointment.booked": { category: "appointment", version: 1 },
  "appointment.cancelled": { category: "appointment", version: 1 },
  "appointment.moved": { category: "appointment", version: 1 },
  "billing.paid": { category: "billing", version: 1 },
  "billing.payment_failed": { category: "billing", version: 1 },
  "billing.trial_ending": { category: "billing", version: 1 },
  "billing.paused": { category: "billing", version: 1 },
  "billing.resumed": { category: "billing", version: 1 },
  "billing.updated": { category: "billing", version: 1 },
  "broadcast.sent": { category: "message", version: 1 },
  "broadcast.stopped": { category: "message", version: 1 },
  "business.recorded": { category: "setup", version: 1 },
  "capability.activated": { category: "setup", version: 1 },
  "capability.deactivated": { category: "setup", version: 1 },
  "channel.connected": { category: "system", version: 1 },
  "contact.added": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.added"] },
  "contact.consent_changed": { category: "contact", version: SHARED_EVENT_VERSIONS["contact.consent_changed"] },
  "contact.email_suppressed": { category: "contact", version: 1 },
  "contact.kept_apart": { category: "contact", version: 1 },
  "conversation.owner_replied": { category: "message", version: 1 },
  "escalation.opened": { category: "message", version: 1 },
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
  "lead.excluded": { category: "lead", version: 1 },
  "lead.kept": { category: "lead", version: 1 },
  "lead.put_back": { category: "lead", version: 1 },
  "lead.search_removed": { category: "lead", version: 1 },
  "lead.search_renamed": { category: "lead", version: 1 },
  "member.joined": { category: "system", version: 1 },
  "member.left": { category: "system", version: 1 },
  "line.answering": { category: "setup", version: 1 },
  "line.failed": { category: "setup", version: 1 },
  "line.forwarding_set": { category: "setup", version: 1 },
  "line.forwarding_verified": { category: "setup", version: 1 },
  "line.released": { category: "setup", version: 1 },
  "line.texting_approved": { category: "setup", version: 1 },
  "line.texting_on": { category: "setup", version: 1 },
  "line.texting_rejected": { category: "setup", version: 1 },
  "mailbox_connection.connected": { category: "setup", version: 1 },
  "mailbox_connection.signed_out": { category: "setup", version: 1 },
  "mailbox_connection.held": { category: "setup", version: 1 },
  "mailbox_connection.resumed": { category: "setup", version: 1 },
  "mailbox_connection.paused": { category: "setup", version: 1 },
  "mailbox_connection.unpaused": { category: "setup", version: 1 },
  "mailbox_connection.removed": { category: "setup", version: 1 },
  "message.send_blocked": { category: "message", version: 1 },
  "message.send_failed": { category: "message", version: 1 },
  "message.send_raced_cancel": { category: "message", version: 1 },
  "message.sent": { category: "message", version: 1 },
  "platform.acted": { category: "platform", version: SHARED_EVENT_VERSIONS["platform.acted"] },
  "playbook.changed": { category: "message", version: 1 },
  "playbook.run": { category: "message", version: 1 },
  "policy.changed": { category: "system", version: 1 },
  "policy.veto_window_skipped": { category: "policy", version: 1 },
  "reach_out.lead_stopped": { category: "lead", version: 1 },
  "reach_out.send_decided": { category: "lead", version: 1 },
  "settings.changed": { category: "system", version: 1 },
  "template.removed": { category: "message", version: 1 },
  "template.submitted": { category: "message", version: 1 },
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
var IDS_PER_READ = 100;
var chunks = (ids) => {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) out.push(ids.slice(i, i + IDS_PER_READ));
  return out;
};
async function readByIds(ids, read) {
  const answers = await Promise.all(chunks(ids).map((some) => read(some)));
  const out = [];
  for (const a of answers) {
    if (a.error) throw new Error(a.error.message);
    out.push(...a.data ?? []);
  }
  return out;
}
async function theirsOf(db, tenantId, idsOf) {
  const [conversation, call, deal, message, escalation, appointment] = await Promise.all([
    readByIds(
      idsOf("conversation"),
      (some) => db.from("conversations").select("id, contact_id").eq("tenant_id", tenantId).in("id", some)
    ),
    readByIds(
      idsOf("call"),
      (some) => db.from("calls").select("id, contact_id").eq("tenant_id", tenantId).in("id", some)
    ),
    readByIds(
      idsOf("deal"),
      (some) => db.from("deals").select("id, contact_id").eq("tenant_id", tenantId).in("id", some)
    ),
    readByIds(
      idsOf("message"),
      (some) => db.from("messages").select("id, contact_id, conversation_id").eq("tenant_id", tenantId).in("id", some)
    ),
    readByIds(
      idsOf("escalation"),
      (some) => db.from("escalations").select("id, conversation_id").eq("tenant_id", tenantId).in("id", some)
    ),
    readByIds(
      idsOf("appointment"),
      (some) => db.from("appointments").select("id, contact_id, client_name, starts_at").eq("tenant_id", tenantId).in("id", some)
    )
  ]);
  return { conversation, call, deal, message, escalation, appointment };
}
async function ownNames(db, tenantId, idsOf) {
  const [lists, broadcasts, playbooks, leads, searches] = await Promise.all([
    readByIds(idsOf("list"), (some) => db.from("segments").select("id, name").eq("tenant_id", tenantId).in("id", some)),
    readByIds(
      idsOf("broadcast"),
      (some) => db.from("sequence_batches").select("id, name").eq("tenant_id", tenantId).in("id", some)
    ),
    readByIds(
      idsOf("playbook"),
      (some) => db.from("sequence_steps").select("id, name").eq("tenant_id", tenantId).in("id", some)
    ),
    readByIds(
      idsOf("lead"),
      (some) => db.from("leads").select("id, business_name").eq("tenant_id", tenantId).in("id", some)
    ),
    readByIds(
      idsOf("lead_search"),
      (some) => db.from("lead_searches").select("id, name").eq("tenant_id", tenantId).in("id", some)
    )
  ]);
  const names = {};
  for (const r of lists) if (r.name) names[`list:${r.id}`] = r.name;
  for (const r of broadcasts) if (r.name) names[`broadcast:${r.id}`] = r.name;
  for (const r of playbooks) if (r.name) names[`playbook:${r.id}`] = r.name;
  for (const r of leads) if (r.business_name) names[`lead:${r.id}`] = r.business_name;
  for (const r of searches) if (r.name) names[`lead_search:${r.id}`] = r.name;
  return names;
}
async function libraryOf(db, tenantId, idsOf) {
  const rows = await readByIds(
    idsOf("template"),
    (some) => db.from("templates").select("id, name").eq("tenant_id", tenantId).is("hidden_at", null).in("id", some)
  );
  return Object.fromEntries(rows.flatMap((r) => r.name ? [[`template:${r.id}`, r.name]] : []));
}
async function activitySubjects(db, tenantId, subjects) {
  const idsOf = (type) => [...new Set(subjects.filter((s) => s.type === type).map((s) => s.id))];
  const [names, theirs, library] = await Promise.all([
    ownNames(db, tenantId, idsOf),
    theirsOf(db, tenantId, idsOf),
    libraryOf(db, tenantId, idsOf)
  ]);
  const threads = {};
  const people = {};
  const visits = {};
  const known = new Map((theirs.conversation ?? []).map((c) => [c.id, c.contact_id ?? null]));
  const asked = [
    ...new Set((theirs.escalation ?? []).map((e) => e.conversation_id).filter((id) => !!id))
  ];
  const more = await readByIds(
    asked.filter((id) => !known.has(id)),
    (some) => db.from("conversations").select("id, contact_id").eq("tenant_id", tenantId).in("id", some)
  );
  for (const c of more) known.set(c.id, c.contact_id ?? null);
  const personOf = /* @__PURE__ */ new Map();
  for (const id of idsOf("contact")) personOf.set(`contact:${id}`, id);
  for (const [type, rows2] of Object.entries(theirs))
    for (const r of rows2) {
      const key = `${type}:${r.id}`;
      if (type !== "conversation" && r.conversation_id) threads[key] = r.conversation_id;
      const person = r.contact_id ?? (r.conversation_id ? known.get(r.conversation_id) : null) ?? null;
      if (!person) continue;
      personOf.set(key, person);
      if (type === "deal") people[key] = person;
    }
  const rows = await readByIds(
    [...new Set(personOf.values())],
    (some) => db.from("contacts").select("id, display_name, wa_profile_name, phone_e164, email").eq("tenant_id", tenantId).in("id", some)
  );
  const nameOf = /* @__PURE__ */ new Map();
  for (const p of rows) {
    if (p.display_name || p.wa_profile_name || p.phone_e164 || p.email) nameOf.set(p.id, personName(p));
  }
  for (const [key, person] of personOf) {
    const name = nameOf.get(person);
    if (name) names[key] = name;
  }
  for (const a of theirs.appointment ?? []) {
    const key = `appointment:${a.id}`;
    if (!names[key] && a.client_name) names[key] = a.client_name;
    if (a.starts_at) visits[key] = a.starts_at;
  }
  return { names, threads, people, visits, library };
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
async function keepModelTurn(db, turn) {
  const { error } = await db.rpc("model_turn_keep", {
    p_tenant_id: turn.tenantId,
    p_turn_id: turn.turnId,
    p_conversation_id: turn.conversationId,
    p_prompt_hash: turn.promptHash,
    p_prompt_text: turn.promptText,
    p_request: turn.request,
    ...turn.response ? { p_response: turn.response } : {},
    ...turn.model ? { p_model: turn.model } : {},
    ...turn.latencyMs === null ? {} : { p_latency_ms: Math.max(0, Math.round(turn.latencyMs)) }
  });
  if (error) throw new Error(`model_turn_keep: ${error.message}`);
}
async function scrubModelTurns(db, tenantId, needles) {
  const { data, error } = await db.rpc("model_turns_scrub", { p_tenant_id: tenantId, p_needles: [...needles] });
  if (error && (error.code === "PGRST202" || error.code === "42883")) return 0;
  if (error) throw new Error(`model_turns_scrub: ${error.message}`);
  return data ?? 0;
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

// src/billing/events.ts
async function keepInvoiceAmount(db, eventId, amountCents, currency) {
  const { data, error } = await db.rpc("billing_event_keep_amount", {
    p_id: eventId,
    p_amount_cents: amountCents,
    p_currency: currency
  });
  if (error) throw new Error(`billing_event_keep_amount: ${error.message}`);
  return data === true;
}

// src/billing/account.ts
async function applyBilling(db, p) {
  const row = {};
  for (const [k, v] of Object.entries(p.row)) if (v !== void 0) row[k] = v;
  const { data, error } = await db.rpc("billing_apply", {
    p_tenant_id: p.tenantId,
    p_row: row,
    ...p.expect ? { p_expect: { ...p.expect } } : {},
    ...p.tenantStatus ? { p_tenant_status: p.tenantStatus } : {}
  });
  if (error) throw new Error(`billing_apply: ${error.message}`);
  return data === true;
}

// src/ops.ts
async function migrationHead(db) {
  const { data, error } = await db.rpc("migration_head");
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return { head: row?.head ?? null, applied: row?.applied ?? 0 };
}
var NAMES_PER_READ = 100;
async function platformDay(db, day) {
  const { data, error } = await db.from("platform_metrics").select("tenant_id, brain_p95_ms, job_lag_ms, duplicate_sends, dead_letters, relay_lag_ms, intake_lag_ms").eq("day", day);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.tenant_id))];
  const live = /* @__PURE__ */ new Map();
  for (let i = 0; i < ids.length; i += NAMES_PER_READ) {
    const t = await db.from("tenants").select("id, name, status").in("id", ids.slice(i, i + NAMES_PER_READ));
    if (t.error) throw new Error(t.error.message);
    for (const w of t.data ?? []) if (w.status === "active") live.set(w.id, w.name);
  }
  return rows.flatMap((r) => {
    const name = live.get(r.tenant_id);
    return name === void 0 ? [] : [
      {
        ...r,
        name,
        job_lag_ms: r.job_lag_ms,
        dead_letters: r.dead_letters,
        intake_lag_ms: r.intake_lag_ms
      }
    ];
  });
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
  leads_trigger: "leads_erase_on_contact: their lead blanked (lead_blank), its places deleted, a reach-out's opening and a preference's example cleared (00391), its drafts cleared (00429), a company's people and key cleared and its domain kept as a digest (00430), its keys kept as digests; one of several people at a business takes only their own address, number and the call's note from it (lead_person_leg, 00413); a person named at any company leaves it, its drafts to them cleared and their address kept as a digest (lead_person_forget, 00430)",
  signer_trigger: "person_signer_erase_on_contact: the name and title a reply's reading found as its signer, and what became of it, cleared (00413)",
  recipients_trigger: "sequence_sends_on_erase: the words each batch kept for them, a visit's time, service and key and a proposal's link, cleared (00391, 00440)",
  jobs_scrub: "scrubErasedJobs and erase_contact: a job's payload that carried their number or words overwritten, and its error cleared",
  ask_scrub: "scrub_ask_for_contact: the assistant's turns that name them deleted (00238)",
  deliveries_scrub: "provider_events_scrub: a kept delivery that names them deleted (00336)",
  notes_scrub: "person_notes_scrub: their numbers and addresses overwritten in other people's notes (00341)",
  turns_scrub: "model_turns_scrub: the receptionist's kept turns that name them, in anyone's thread, deleted (00401); their own went with their conversation",
  appointments_scrub: "appointments_scrub: their visits keep their time and service and lose the client's name, number, address and note; the notices that made them, and any whose subject names them, lose the name (00345)"
};
var withPerson = (by) => ({ kind: "with_person", by });
var scrubbedBy = (...by) => ({ kind: "scrubbed", by });
var byAge = (days) => ({ kind: "by_age", days });
var DIGEST = { kind: "digest" };
var WITH_WORKSPACE = { kind: "with_workspace" };
var NOT_PERSONAL = { kind: "not_personal" };
var all = (strategy, ...names) => Object.fromEntries(names.map((n) => [n, strategy]));
var ERASURE_STRATEGIES = {
  // The model ledger (00273): which model answered and a hash of the system prompt, never a customer's turn. A shadow
  // row's question and answers are labels from the question's own options; the rows go at 400 days whatever a later
  // writer puts there.
  ai_usage: {
    ...all(NOT_PERSONAL, "model", "model_asked", "prompt_hash"),
    ...all(byAge("ai_usage"), "question", "primary_answer", "shadow_answer")
  },
  ask_messages: { content: scrubbedBy("ask_scrub") },
  // A thread that one of their turns makes theirs, or whose title or scope holds their id, number or address, is
  // cleared, and removed once empty (00238). A title that names them by name alone stays, as 0036 leaves names; purge_ask
  // takes the thread at 90 days.
  ask_threads: all(scrubbedBy("ask_scrub"), "title", "scope"),
  // A voice session's page can name a person as its label, and it holds the member's sealed token: the row goes a day
  // after the token expires (sweep_voice_sessions). Its ids and its page's name are nobody's.
  ask_voice_sessions: {
    ...all(byAge("ask_voice_sessions"), "context", "scope", "token_cipher"),
    ...all(NOT_PERSONAL, "id", "conversation_id", "surface", "turn_key")
  },
  // The workspace's account with Stripe: its payer's card, and Stripe's ids and price.
  billing_accounts: {
    ...all(WITH_WORKSPACE, "card_brand", "card_last4"),
    ...all(NOT_PERSONAL, "facts", "price_id", "stripe_customer_id", "stripe_subscription_id")
  },
  billing_card_marks: { card_fingerprint: WITH_WORKSPACE },
  billing_events: all(NOT_PERSONAL, "id", "type", "currency"),
  // The workspace's carrier registration: the business, its address and tax id, and the representative it names.
  business_records: all(
    WITH_WORKSPACE,
    "about",
    "city",
    "contact_email",
    "contact_first_name",
    "contact_job_position",
    "contact_last_name",
    "contact_phone",
    "contact_title",
    "country",
    "ein",
    "industry",
    "legal_name",
    "postal_code",
    "region",
    "street",
    "street_secondary",
    "trade_name",
    "website_url"
  ),
  // The owner's note on switching a capability on.
  capability_activations: { note: NOT_PERSONAL },
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
    erased_email_hash: DIGEST,
    // The line or the ad a person came by, never the person (its column comment).
    acquired_ref: NOT_PERSONAL
  },
  conversations: all(withPerson("erase_contact"), "control_kind", "control_ref"),
  deals: {
    ...all(scrubbedBy("deals_trigger"), "note", "evidence", "proposal_url"),
    // What was sold and in what currency, kept as its stage and amount are, as a visit keeps its service. The service is
    // the team's words (80 characters): a name typed into it is the name 0036 leaves, not a number or an address.
    ...all(NOT_PERSONAL, "service", "currency")
  },
  decisions: { payload: scrubbedBy("erase_contact") },
  escalations: { details: withPerson("erase_contact") },
  // A subscriber's error: an exception of the code's own, the subscribers touching no provider.
  event_deliveries: all(NOT_PERSONAL, "subscriber", "kind", "last_error"),
  event_outbox: { kind: NOT_PERSONAL },
  events: {
    data: scrubbedBy("events_trigger"),
    ...all(NOT_PERSONAL, "kind", "category", "subject_type", "request_id")
  },
  // A note suggested from an owner's correction (00448): its key is the correction's message, in the person's thread, so
  // the row goes with it when erase_contact deletes their messages (on delete cascade). A note once kept is the business's
  // own, in its settings, and no longer a suggestion.
  fact_suggestions: all(withPerson("erase_contact"), "title", "body", "quote"),
  // A member's own Google account, connected for the workspace's profile: the row goes at disconnect, and with the
  // workspace. The profile's and Google's names and ids, and the sync's error, are nobody's.
  google_connections: {
    ...all(WITH_WORKSPACE, "google_email", "google_sub", "account_title"),
    ...all(
      NOT_PERSONAL,
      "account_name",
      "credentials_ref",
      "facts",
      "location_name",
      "location_title",
      "scopes",
      "sync_error"
    )
  },
  // The workspace's own listing, as Google's public read gives it.
  google_listings: all(
    NOT_PERSONAL,
    "address",
    "business_status",
    "check_error",
    "facts",
    "maps_uri",
    "name",
    "new_review_uri",
    "place_id"
  ),
  // A review as Google shows it: a complete read drops one Google no longer lists, and one not seen for its days goes
  // (purge_google_reviews, 00392). Its ids and language are nobody's.
  google_reviews: {
    ...all(byAge("google_reviews"), "author", "author_uri", "author_photo_uri", "body", "reply_text"),
    ...all(NOT_PERSONAL, "language_code", "maps_uri", "review_id")
  },
  idempotency_keys: all(byAge("idempotency_keys"), "key", "route", "request_hash", "response"),
  // A team invitation's address: the workspace's while it is open or expired (the Team card sends it again); one
  // accepted or taken back goes with its address 30 days later (purge_invitations, 00392).
  invitations: { email: WITH_WORKSPACE },
  jobs: {
    // A thrown error can quote the recipient a provider refused.
    ...all(scrubbedBy("jobs_scrub", "erase_contact"), "payload", "last_error"),
    // Ids only (jobs dedupeKeyOf).
    dedupe_key: NOT_PERSONAL
  },
  lead_counters: { period: NOT_PERSONAL },
  // A batch's judge: its answer, with a reason for each place, goes with the batch (purge_leads, 00140); its model and
  // the hashes of its work are nobody's.
  lead_judgments: {
    answer: byAge("lead_judgments"),
    ...all(NOT_PERSONAL, "model", "op_id", "request_hash")
  },
  // A lead's stage before and after a move, its counts, ids and a keyed hash of its place.
  lead_operations: all(NOT_PERSONAL, "before", "after"),
  lead_preferences: {
    example: scrubbedBy("leads_trigger"),
    category_key: NOT_PERSONAL
  },
  // A search's rounds and runs: the owner's plan and question, the days, the provider's and the judge's ids.
  lead_rounds: all(NOT_PERSONAL, "day", "judge_model", "month", "nearby", "plan", "platform_day", "question"),
  lead_runs: all(
    NOT_PERSONAL,
    "actor",
    "apify_run_id",
    "build",
    "claimed_by",
    "dataset_id",
    "lease_owner",
    "term",
    "webhook_token_hash"
  ),
  lead_places: all(withPerson("leads_trigger"), "place_id", "title", "street"),
  lead_search_members: {
    ...all(scrubbedBy("leads_trigger"), "judgment", "reason"),
    ...all(NOT_PERSONAL, "counted_month", "excluded_by")
  },
  // What the owner asked the finder for, and the kinds of business it suggested.
  lead_searches: all(NOT_PERSONAL, "asked", "card", "name", "plan"),
  // The ideas for a search (00398, 00399): the business line, the plans, what they were written over and what was passed on.
  lead_suggestions: all(NOT_PERSONAL, "business_line", "items", "basis", "passed"),
  lead_suppressions: { hash: DIGEST },
  leads: {
    ...all(
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
      "mark_path",
      // A company's people (their names, titles, work addresses, profiles) and its key (00430).
      "facts",
      "source_key"
    ),
    // What lead_blank keeps: the country and the stage it came from.
    ...all(NOT_PERSONAL, "country", "stage_from")
  },
  // The workspace's own numbers and the carrier's and provider's ids for them.
  lines: {
    // A member's own number a forwarding test rang from (facts.test_from), and the carrier's words on the filing that
    // names the workspace's representative.
    ...all(WITH_WORKSPACE, "facts", "last_error"),
    ...all(
      NOT_PERSONAL,
      "a2p_profile_sid",
      "brand_sid",
      "campaign_sid",
      "credential_list_sid",
      "credentials_ref",
      "e164",
      "messaging_service_sid",
      "number_sid",
      "profile_sid",
      "retell_agent_id",
      "subaccount_sid",
      "termination_uri",
      "trunk_sid"
    )
  },
  // The kinds a member's phones are not told (00372), and a member's sort and columns: the member's own settings.
  memberships: all(NOT_PERSONAL, "push_off", "views"),
  messages: all(withPerson("erase_contact"), "template_name", "media", "external_id", "content_hash", "error", "meta"),
  // A kept turn (decision 0039): the person's own go when their conversation does, by the fence's cascade, and a turn
  // about someone else that quoted them is deleted by needle; the prompt it read is the business's own facts, and
  // leaves by its clock.
  model_turns: {
    ...all(scrubbedBy("turns_scrub", "erase_contact"), "request", "response"),
    ...all(NOT_PERSONAL, "prompt_hash", "model")
  },
  model_prompts: { text: byAge("model_prompts"), prompt_hash: NOT_PERSONAL },
  // The settings as they stood (decision 0039, step 3): the business's own, as tenant_config.config is, and unlike it
  // a version leaves by its clock once it is replaced.
  tenant_config_versions: { config: byAge("tenant_config_versions") },
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
  // A mailbox a member connected to write from (00423): its address and name are the business's, kept with the
  // workspace; its token's name, its records and its clocks are not personal (its provider, state and hold are closed
  // sets, no words).
  mailbox_connections: {
    ...all(WITH_WORKSPACE, "address", "host", "from_name", "signature", "provider_account"),
    ...all(NOT_PERSONAL, "scopes", "credentials_ref", "dns", "sync_cursor", "watch_id", "last_error")
  },
  // Gmail's pending confirmation of a forward to the workspace's address (00345): the owner's own account, and
  // Google's code and link for it; the name its mail is sent from. The workspace's address on the platform's domain,
  // its reply tokens and its intake's error code are nobody's.
  mailboxes: {
    ...all(WITH_WORKSPACE, "forward_confirm_account", "from_name"),
    ...all(
      NOT_PERSONAL,
      "forward_confirm_code",
      "forward_confirm_link",
      "last_error",
      "local_part",
      "reply_token",
      "reply_token_prev"
    )
  },
  // A partner's ledger of the workspaces it brought: Stripe's ids, the code used, the sweep's checks and reasons; the
  // address a workspace is handed to, the workspace's, cleared once its new owner accepts (00392).
  partner_earnings: all(NOT_PERSONAL, "currency", "stripe_event_id", "stripe_invoice_id"),
  partner_tenants: {
    handover_email: WITH_WORKSPACE,
    ...all(NOT_PERSONAL, "checks", "code_used", "standing_why")
  },
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
  // Numbers: a day's tokens, a pause's hours (contracts config/limits.ts).
  policies: { limits: NOT_PERSONAL },
  provider_events: {
    body: scrubbedBy("deliveries_scrub"),
    ...all(byAge("provider_events"), "provider_event_id", "door", "url", "headers")
  },
  // A list's name and its rule, in the closed vocabulary; its members go by segment_members_on_erase.
  segments: all(NOT_PERSONAL, "name", "rule"),
  // A sequence (decision 0060): its name, the business's.
  sequences: { name: NOT_PERSONAL },
  // A batch's name, its audience (a list's or a step's name, a rule in the closed vocabulary), its channels, its template
  // and what fills its slots: the business's.
  sequence_batches: all(
    NOT_PERSONAL,
    "audience",
    "channels",
    "failure",
    "name",
    "params",
    "template_language",
    "template_name"
  ),
  // Someone in a sequence: why they left is a send's code or a door's word, never theirs.
  sequence_enrollments: { why: NOT_PERSONAL },
  // A reply to a sequence's send hangs on the replier's message and thread, and goes with them.
  sequence_replies: {
    ...all(withPerson("erase_contact"), "draft", "draft_why", "plan", "refer_to", "summary"),
    // Who signed it (0052): cleared when the person it names is erased, wherever the reply's thread is.
    ...all(scrubbedBy("signer_trigger"), "signer_name", "signer_title"),
    // What became of the signer's name, and the source it replaced: closed words, never the name.
    ...all(NOT_PERSONAL, "signer_state", "signer_was")
  },
  sequence_sends: {
    // A customer's send: the words its batch kept for them.
    facts: scrubbedBy("recipients_trigger"),
    // A lead's: written from the lead's record (00391).
    ...all(scrubbedBy("leads_trigger"), "opening", "angle", "hold_detail"),
    // A draft handed to its owner (00429): the business's address, name and the words written to it; lead_blank clears it.
    ...all(scrubbedBy("leads_trigger"), "draft"),
    // A digest of the words checked, the facts' keys, and the hold's, the skip's and a failure's codes.
    ...all(NOT_PERSONAL, "checked_words", "facts_used", "included_for", "reason")
  },
  // A step: its name, channels, list, template and slots, the words waiting for WhatsApp, the conditions it goes on, and
  // the team's instruction; the name it is signed with, the sender's.
  sequence_steps: {
    signed_by: WITH_WORKSPACE,
    ...all(
      NOT_PERSONAL,
      "channels",
      "hand",
      "list_key",
      "name",
      "next_params",
      "next_template_language",
      "next_template_name",
      "only_if",
      "params",
      "template_language",
      "template_name"
    )
  },
  sending_domain_days: all(NOT_PERSONAL, "held_why", "host"),
  // The workspace's sending domain and the provider's records for it; the address and the name its mail is sent as.
  sending_domains: {
    ...all(WITH_WORKSPACE, "from_local", "from_name"),
    ...all(NOT_PERSONAL, "host", "provider_domain_id", "provider_status", "records")
  },
  templates: all(
    NOT_PERSONAL,
    "body_preview",
    "components",
    "language",
    "meta_id",
    "name",
    "quality",
    "rejected_reason",
    "title",
    "variables"
  ),
  // The workspace's channels: their configuration, its own numbers and the provider's ids.
  tenant_channels: all(NOT_PERSONAL, "config", "credentials_ref", "external_id", "number_e164", "waba_id"),
  // The receptionist's configuration, which names the addresses the workspace is alerted at.
  tenant_config: { config: WITH_WORKSPACE }
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
    const last2 = rows.at(-1);
    if (rows.length < size || last2 === void 0) return out;
    after = key(last2);
  }
  onCapped(what, cap);
  return out;
}

// src/repositories/waiting-on-you.ts
import { standingOfThread } from "../../contracts/dist/index.js";
var IN_CHUNK = 200;
var THREAD_COLUMNS = "id, contact_id, state, paused_until, assignee_user_id, last_message_at";
async function threadsBy(db, tenantId, key, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await db.from("conversations").select(THREAD_COLUMNS).eq("tenant_id", tenantId).in(key, ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(`cannot read the threads: ${error.message}`);
    out.push(...data ?? []);
  }
  return out;
}
async function openHoldsOf(db, tenantId, threadIds) {
  const out = /* @__PURE__ */ new Map();
  for (let i = 0; i < threadIds.length; i += IN_CHUNK) {
    const { data, error } = await db.from("escalations").select("conversation_id, reason").eq("tenant_id", tenantId).eq("state", "open").in("conversation_id", threadIds.slice(i, i + IN_CHUNK));
    if (error) throw new Error(`cannot read the open holds: ${error.message}`);
    for (const h of data ?? []) if (h.conversation_id) out.set(h.conversation_id, h.reason);
  }
  return out;
}
async function waitingOf(db, tenantId, threads, nowMs) {
  if (!threads.length) return [];
  const holds = await openHoldsOf(
    db,
    tenantId,
    threads.map((t) => t.id)
  );
  return threads.filter(
    (t) => standingOfThread(
      { state: t.state, paused_until: t.paused_until, assignee_user_id: t.assignee_user_id },
      holds.has(t.id) ? { reason: holds.get(t.id) ?? null } : false,
      nowMs
    ).standing === "needs_you"
  );
}
async function threadIdsWaitingOnYou(db, tenantId, threadIds, nowMs) {
  if (!threadIds.length) return /* @__PURE__ */ new Set();
  const threads = await threadsBy(db, tenantId, "id", threadIds);
  return new Set((await waitingOf(db, tenantId, threads, nowMs)).map((t) => t.id));
}
async function personIdsWaitingOnYou(db, tenantId, contactIds, nowMs) {
  if (!contactIds.length) return /* @__PURE__ */ new Set();
  const latest = /* @__PURE__ */ new Map();
  for (const t of await threadsBy(db, tenantId, "contact_id", contactIds)) {
    const held = latest.get(t.contact_id);
    if (!held || (t.last_message_at ?? "") > (held.last_message_at ?? "")) latest.set(t.contact_id, t);
  }
  return new Set((await waitingOf(db, tenantId, [...latest.values()], nowMs)).map((t) => t.contact_id));
}
var CLOSED_HOLDS_MAX = 1e3;
async function lastClosedHolds(db, tenantId, conversationIds) {
  const newest = /* @__PURE__ */ new Map();
  for (let i = 0; i < conversationIds.length; i += IN_CHUNK) {
    const { data, error } = await db.from("escalations").select("conversation_id, reason, details, created_at, resolved_at").eq("tenant_id", tenantId).eq("state", "resolved").in("conversation_id", conversationIds.slice(i, i + IN_CHUNK)).order("created_at", { ascending: false }).limit(CLOSED_HOLDS_MAX);
    if (error) throw new Error(`lastClosedHolds: ${error.message}`);
    for (const r of data ?? []) if (!newest.has(r.conversation_id)) newest.set(r.conversation_id, r);
  }
  return [...newest.values()];
}

// src/repositories/people.ts
var PEOPLE_PAGE = 1e3;
var IDS_PER_READ2 = 100;
async function namesOfPeople(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ2) {
    const { data, error } = await db.from("contacts").select("id, display_name, wa_profile_name, phone_e164, email").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ2));
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
  for await (const page of everyonePages(db, tenantId)) all2.push(...page);
  return all2;
}
async function* everyonePages(db, tenantId) {
  let read = 0;
  for (let after = null; ; ) {
    const page = await peoplePage(db, tenantId, after ? { after } : { offset: read });
    read += page.length;
    yield page;
    if (page.length < PEOPLE_PAGE) return;
    after = peopleCursorOf(page[page.length - 1]);
  }
}
var COPY_READ_CAP = 5e5;
var MISSED_AT_ONCE = 10;
async function* everyoneOnceIn(db, tenantId) {
  const seen = /* @__PURE__ */ new Set();
  for await (const page of everyonePages(db, tenantId)) {
    const fresh = page.filter((p) => !seen.has(p.id));
    for (const p of fresh) seen.add(p.id);
    yield fresh;
  }
  const live = await readAllRowsByKey(
    "live people",
    (c) => c.id,
    (after, size) => {
      let q = db.from("contacts").select("id").eq("tenant_id", tenantId).is("erased_at", null).is("merged_into_contact_id", null);
      if (after) q = q.gt("id", after);
      return q.order("id").limit(size);
    },
    COPY_READ_CAP,
    (what, cap) => {
      throw new Error(`${what}: more than ${cap}; no copy is whole`);
    }
  );
  const missed = live.map((c) => c.id).filter((id) => !seen.has(id));
  for (let i = 0; i < missed.length; i += MISSED_AT_ONCE) {
    const rows = await Promise.all(missed.slice(i, i + MISSED_AT_ONCE).map((id) => personRow(db, tenantId, id)));
    yield rows.filter((r) => r !== null);
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
async function logPersonCall(db, a) {
  const { data, error } = await db.rpc("person_call_logged", {
    p_contact_id: a.contactId,
    p_outcome: a.outcome,
    p_body: a.body,
    p_tell: a.tell,
    ...a.dueOn ? { p_due_on: a.dueOn } : {},
    ...a.stepBody ? { p_step_body: a.stepBody } : {},
    ...a.lead?.stage ? { p_lead_stage: a.lead.stage } : {},
    ...a.lead?.reason ? { p_lead_reason: a.lead.reason } : {},
    ...a.lead?.note ? { p_lead_note: a.lead.note } : {},
    ...a.lead?.spokeWith ? { p_spoke_with: a.lead.spokeWith } : {},
    ...a.closesCallBack ? { p_closes_call_back: true } : {}
  });
  return { data, error };
}
async function mergePeople(db, keep, merge) {
  const { data, error } = await db.rpc("merge_people", { p_keep: keep, p_merge: merge });
  if (error) throw error;
  return mergedOf(data);
}
async function keptPersonOf(db, tenantId, contactId) {
  let at = contactId;
  for (let hop = 0; hop <= 5; hop++) {
    const { data, error } = await db.from("contacts").select("merged_into_contact_id, erased_at").eq("tenant_id", tenantId).eq("id", at).maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    if (!data || data.erased_at) return null;
    if (!data.merged_into_contact_id) return at === contactId ? null : at;
    at = data.merged_into_contact_id;
  }
  return null;
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
function nameAnswerOf(v, doneKey) {
  const o = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  return {
    done: o[doneKey] === true,
    name: typeof o.name === "string" ? o.name : null,
    why: typeof o.why === "string" ? o.why : null
  };
}
async function adoptPersonName(db, personId, messageId) {
  const { data, error } = await db.rpc("person_name_adopt", { p_contact_id: personId, p_message_id: messageId });
  if (error) throw error;
  return nameAnswerOf(data, "named");
}
async function undoPersonName(db, personId) {
  const { data, error } = await db.rpc("person_name_undo", { p_contact_id: personId });
  if (error) throw error;
  return nameAnswerOf(data, "undone");
}
async function declinePersonName(db, personId, messageId) {
  const { data, error } = await db.rpc("person_name_decline", { p_contact_id: personId, p_message_id: messageId });
  if (error) throw error;
  return nameAnswerOf(data, "declined");
}
async function joinPersonToLead(db, personId, leadId) {
  const { data, error } = await db.rpc("person_join_lead", { p_contact_id: personId, p_lead_id: leadId });
  if (error) throw error;
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return { leadId: typeof o.lead_id === "string" ? o.lead_id : leadId };
}
async function leavePersonLead(db, personId) {
  const { data, error } = await db.rpc("person_leave_lead", { p_contact_id: personId });
  if (error) throw error;
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return { left: o.left === true };
}
async function seePersonNote(db, noteId) {
  const { data, error } = await db.rpc("person_note_seen", { p_note_id: noteId });
  if (error) throw error;
  const o = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return { seen: typeof o.seen === "string", why: typeof o.error === "string" ? o.error : null };
}
var PEOPLE_AT_A_LEAD = 20;
async function peopleAtLead(db, tenantId, leadId) {
  const { data, error } = await db.from("contacts").select("id, display_name, wa_profile_name, phone_e164, email, name_source").eq("tenant_id", tenantId).eq("lead_id", leadId).is("erased_at", null).is("merged_into_contact_id", null).limit(PEOPLE_AT_A_LEAD);
  if (error) throw new Error(`peopleAtLead: ${error.message}`);
  const people = data ?? [];
  if (!people.length) return [];
  const ids = people.map((p) => p.id);
  const [moments, needs] = await Promise.all([
    db.from("person_moments").select("contact_id, in_touch_at").eq("tenant_id", tenantId).in("contact_id", ids),
    personIdsWaitingOnYou(db, tenantId, ids, Date.now())
  ]);
  if (moments.error) throw new Error(`peopleAtLead: ${moments.error.message}`);
  const touched = new Map((moments.data ?? []).map((m) => [m.contact_id, m.in_touch_at]));
  return people.map((p) => {
    const at = touched.get(p.id) ?? null;
    return { ...p, in_touch_at: at && !at.startsWith("-") ? at : null, needs_you: needs.has(p.id) };
  }).sort((a, b) => (b.in_touch_at ?? "").localeCompare(a.in_touch_at ?? ""));
}
async function signersOf(db, tenantId, personId) {
  const { data, error } = await db.from("sequence_replies").select("message_id, signer_name, signer_title, signer_state, read_at, intent, claim").eq("tenant_id", tenantId).eq("contact_id", personId).in("signer_state", ["offered", "adopted"]).is("undone_at", null).order("read_at", { ascending: false }).limit(5);
  if (error) throw new Error(`signersOf: ${error.message}`);
  return (data ?? []).flatMap(
    (r) => r.signer_name && (r.signer_state === "offered" || r.signer_state === "adopted") ? [
      {
        message_id: r.message_id,
        name: r.signer_name,
        title: r.signer_title,
        state: r.signer_state,
        read_at: r.read_at,
        intent: r.intent,
        claim: r.claim
      }
    ] : []
  );
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
  const others = await db.from("contacts").select("id, display_name, wa_profile_name, phone_e164, email").eq("tenant_id", tenantId).in("id", otherIds.slice(0, IDS_PER_READ2)).is("erased_at", null).is("merged_into_contact_id", null);
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
async function recordConsent(db, p) {
  const { data, error } = await db.rpc("record_consent", {
    p_contact_id: p.contactId,
    p_purpose: p.purpose,
    p_consent: p.consent,
    p_source: p.source,
    ...p.note ? { p_note: p.note } : {},
    ...p.messageId ? { p_message_id: p.messageId } : {},
    ...p.batch ? { p_batch: p.batch } : {},
    ...p.via ? { p_via: p.via } : {},
    ...p.undoOf ? { p_undo_of: p.undoOf } : {}
  });
  return { data, error };
}
async function addPersonByHand(db, p) {
  const { data, error } = p.email ? await db.rpc("add_person", {
    p_tenant_id: p.tenantId,
    p_phone_e164: p.phone ?? "",
    p_email: p.email,
    p_display_name: p.name,
    p_source: p.source
  }) : await db.rpc("create_person", {
    p_tenant_id: p.tenantId,
    p_phone_e164: p.phone ?? "",
    p_display_name: p.name,
    p_source: p.source
  });
  if (error) return { data: null, error };
  const o = data ?? {};
  return { data: { contact_id: String(o.contact_id), existed: o.existed === true }, error: null };
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
async function takeOverThread(db, p) {
  const { data, error } = await db.rpc("conversation_take_over", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_paused_until: p.pausedUntil,
    ...p.via ? { p_via: p.via } : {},
    ...p.undoOf ? { p_undo_of: p.undoOf } : {}
  });
  if (error) throw error;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string" || typeof data.paused_until !== "string" || typeof data.withdrawn_drafts !== "number")
    throw new Error("conversation_take_over: the door answered without its decision");
  return {
    pausedUntil: data.paused_until,
    withdrawnDrafts: data.withdrawn_drafts,
    decisionId: id,
    undoDropped: data.undo_dropped === true
  };
}
async function handBackThread(db, p) {
  const { data, error } = await db.rpc("conversation_hand_back", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    ...p.via ? { p_via: p.via } : {},
    ...p.undoOf ? { p_undo_of: p.undoOf } : {}
  });
  if (error) throw error;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string" || typeof data.resolved_escalations !== "number")
    throw new Error("conversation_hand_back: the door answered without its decision");
  return { decisionId: id, resolvedEscalations: data.resolved_escalations, undoDropped: data.undo_dropped === true };
}
async function withdrawQueued(db, p) {
  const { data, error } = await db.rpc("withdraw_queued", {
    p_tenant_id: p.tenantId,
    p_message_ids: p.messageIds,
    ...p.reason ? { p_reason: p.reason } : {}
  });
  if (error) throw new Error(`withdraw_queued: ${error.message}`);
  return Array.isArray(data) ? data : [];
}
async function withdrawAiDrafts(db, p) {
  const { data, error } = await db.rpc("withdraw_ai_drafts", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_reason: p.reason,
    ...p.keepMessageId ? { p_keep_message_id: p.keepMessageId } : {}
  });
  if (error) throw new Error(`withdraw_ai_drafts: ${error.message}`);
  return Array.isArray(data) ? data : [];
}
async function memberWithdrawDrafts(db, p) {
  const { data, error } = await db.rpc("member_withdraw_drafts", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId
  });
  if (error) throw error;
  return typeof data === "number" ? data : 0;
}
async function memberWithdrawMessage(db, p) {
  const { data, error } = await db.rpc("member_withdraw_message", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    ...p.reason ? { p_reason: p.reason } : {}
  });
  if (error) throw error;
  return data === true;
}
async function callBackMessage(db, p) {
  const { data, error } = await db.rpc("message_call_back", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    ...p.via ? { p_via: p.via } : {},
    ...p.undoOf ? { p_undo_of: p.undoOf } : {}
  });
  if (error) throw error;
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string") throw new Error("message_call_back: the door answered without its decision");
  return { decisionId: id, undoDropped: data.undo_dropped === true };
}
async function openEscalation(db, p) {
  const { data, error } = await db.rpc("escalation_open", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_reason: p.reason,
    p_details: p.details
  });
  if (error) throw new Error(`escalation_open: ${error.message}`);
  if (data !== "opened" && data !== "changed" && data !== "refreshed")
    throw new Error(`escalation_open: the door answered ${String(data)}`);
  return data;
}
async function settleByEcho(db, p) {
  if (!p.externalId) return true;
  const { error } = await db.rpc("conversation_echo_settles", {
    p_tenant_id: p.tenantId,
    p_external_id: p.externalId,
    p_reasons: [...p.settles]
  });
  if (!error) return true;
  dbLog().error("record_echo_settle_failed", { tenant_id: p.tenantId, error: error.message });
  return false;
}

// src/repositories/ingest.ts
import {
  conversationPatch,
  normalizePhone,
  HOUR_MS
} from "../../contracts/dist/index.js";

// src/repositories/campaigns/campaign-channels.ts
async function whatsappChannelFacts(db, tenantId) {
  const { data, error } = await db.from("tenant_channels").select("config, number_e164").eq("tenant_id", tenantId).eq("kind", "whatsapp").eq("status", "active").order("created_at", { ascending: true }).limit(1).maybeSingle();
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
  const { data, error } = await db.from("sequence_steps").select("channels").eq("id", playbookId).maybeSingle();
  if (error) {
    if (/channels/.test(error.message) && /does not exist|could not find/i.test(error.message)) return null;
    throw new Error(`playbook_channels: ${error.message}`);
  }
  return data?.channels ?? null;
}
async function playbookForChannels(db, tenantId, playbookId) {
  const { data, error } = await db.from("sequence_steps").select("id, name, trigger, policy_class, template_id").eq("tenant_id", tenantId).eq("id", playbookId).maybeSingle();
  if (error) throw new Error(`playbook_for_channels: ${error.message}`);
  if (!data) return null;
  const waiting = await db.from("sequence_batches").select("id").eq("tenant_id", tenantId).eq("step_id", playbookId).eq("state", "pending_approval").limit(1);
  if (waiting.error) throw new Error(`playbook_for_channels: ${waiting.error.message}`);
  return { ...data, run_waits: (waiting.data ?? []).length > 0 };
}
async function playbookForChange(db, tenantId, playbookId) {
  const { data, error } = await db.from("sequence_steps").select(
    "id, name, trigger, state, policy_class, run_hour, cap_per_run, gap_days, cadence_days, list_id, list_key, template_id, params, until, trial_until"
  ).eq("tenant_id", tenantId).eq("id", playbookId).maybeSingle();
  if (error) throw new Error(`playbook_for_change: ${error.message}`);
  if (!data) return null;
  const waiting = await db.from("sequence_batches").select("id, recipient_count").eq("tenant_id", tenantId).eq("step_id", playbookId).eq("state", "pending_approval").limit(1);
  if (waiting.error) throw new Error(`playbook_for_change: ${waiting.error.message}`);
  const [w] = waiting.data ?? [];
  return { ...data, waiting: w ? { id: w.id, recipient_count: w.recipient_count } : null };
}
async function runningTwins(db, tenantId, on) {
  const { data, error } = await db.from("sequence_steps").select("id, name, list_id, list_key").eq("tenant_id", tenantId).eq("state", "running").eq("trigger", on.trigger).eq("template_id", on.templateId);
  if (error) throw new Error(`running_twins: ${error.message}`);
  return (data ?? []).filter((p) => (p.list_id ?? null) === on.listId && (p.list_key ?? null) === on.listKey).map((p) => ({ id: p.id, name: p.name }));
}
async function followUpOnFile(db, tenantId, trigger) {
  const { data, error } = await db.from("sequence_steps").select("id").eq("tenant_id", tenantId).eq("trigger", trigger).limit(1);
  if (error) throw new Error(`follow_up_on_file: ${error.message}`);
  return (data ?? []).length > 0;
}
function noChannelColumns(error) {
  return !!error && /\b(consent_channels|marketing_channels|channel)\b/.test(error.message) && /does not exist|could not find/i.test(error.message);
}
function noRelationshipColumn(error) {
  return !!error && /\bhas_relationship\b/.test(error.message) && /does not exist|could not find/i.test(error.message);
}
async function queuedRecipients(db, p) {
  const { data, error } = await db.from("sequence_sends").select("contact_id, facts, channel, attempt:attempts").eq("tenant_id", p.tenantId).eq("batch_id", p.broadcastId).is("lead_id", null).eq("state", "queued").order("contact_id").limit(p.limit);
  if (error) throw new Error(`queued_recipients: ${error.message}`);
  return (data ?? []).flatMap((r) => r.contact_id ? [{ ...r, contact_id: r.contact_id }] : []);
}
async function runGoesByOthers(db, tenantId, broadcastId, than) {
  const of = db.from("sequence_sends").select("contact_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("batch_id", broadcastId);
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
  const skipped = [];
  for (let i = 0; i < p.contactIds.length; i += IDS_PER_READ2) {
    const { data, error } = await db.from("sequence_sends").update({ state: "skipped", reason: p.reason }).eq("tenant_id", p.tenantId).eq("batch_id", p.broadcastId).is("lead_id", null).eq("state", "queued").in("contact_id", p.contactIds.slice(i, i + IDS_PER_READ2)).select("contact_id");
    if (error) return { skipped, error: `hold_recipients: ${error.message}` };
    for (const r of data) if (r.contact_id) skipped.push(r.contact_id);
  }
  return { skipped, error: null };
}

// src/repositories/ingest.ts
var AnswerNotKept = class extends Error {
  constructor(message) {
    super(message);
    this.name = "AnswerNotKept";
  }
};
function stoppedNow(r) {
  return r?.consent === "opted_out" || r?.dnc === true;
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
  if (!out?.contact_id) return out;
  if (!out.is_new && out.processed) return out;
  const failed = [];
  const attempt = async (event, write) => {
    try {
      await write();
    } catch (e) {
      const error2 = e instanceof Error ? e.message : String(e);
      dbLog().error(event, { tenant_id: p.tenantId, contact_id: out.contact_id, error: error2 });
      failed.push(`${event}: ${error2}`);
    }
  };
  if (p.optIn) await attempt("consent_channel_write_failed", () => keepYesOnChannel(db, p, out));
  if (p.optInMarketing) await attempt("marketing_consent_write_failed", () => keepOffersYes(db, p, out));
  if (failed.length > 0 && !p.jobFollows) throw new AnswerNotKept(failed.join("; "));
  return out;
}
async function answerKept(db, p, contactId, purpose) {
  const asked = db.from("events").select("id").eq("tenant_id", p.tenantId).eq("kind", "contact.consent_changed").eq("subject_id", contactId).eq("data->>message_external_id", p.messageExternalId);
  const { data, error } = await (purpose === "marketing" ? asked.eq("data->>purpose", "marketing") : asked.is("data->>purpose", null)).limit(1);
  if (error) throw new Error(`answer_kept: ${error.message}`);
  return (data ?? []).length > 0;
}
async function keepYesOnChannel(db, p, out) {
  if (!out.is_new && await answerKept(db, p, out.contact_id, "conversational")) return;
  const { error } = await db.rpc("note_yes_on_channel", {
    p_tenant_id: p.tenantId,
    p_contact_id: out.contact_id,
    p_channel: p.channel,
    p_message_external_id: p.messageExternalId,
    p_words: (p.body ?? "").slice(0, 80)
  });
  const missing = error?.code === "PGRST202" || /Could not find the function public\.note_yes_on_channel/.test(error?.message ?? "");
  if (error && !missing) throw new Error(error.message);
}
async function keepOffersYes(db, p, out) {
  if (stoppedNow(out)) {
    dbLog().warn("offers_yes_while_stopped", { tenant_id: p.tenantId, contact_id: out.contact_id, channel: p.channel });
    return;
  }
  if (!out.is_new && await answerKept(db, p, out.contact_id, "marketing")) return;
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
  let { error } = await db.rpc("set_marketing_consent", { ...args, p_evidence: evidence });
  if (error && /p_evidence/.test(error.message)) ({ error } = await db.rpc("set_marketing_consent", args));
  if (error) throw new Error(error.message);
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
  const head = "paused_until, control_kind, control_ref, control_until, contact_id, contacts (consent, dnc, marketing_consent, ";
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
  const { data, error } = await db.from("messages").select("id, conversation_id, direction, sender, status, meta").eq("tenant_id", tenantId).eq("external_id", externalId).maybeSingle();
  if (error) throw new Error(`messageByExternalId: ${error.message}`);
  if (!data) return null;
  return {
    messageId: data.id,
    conversationId: data.conversation_id,
    direction: data.direction,
    sender: data.sender,
    status: data.status,
    meta: data.meta
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
    return false;
  }
  const { data: conv, error: verr } = await db.from("conversations").upsert({ tenant_id: p.tenantId, contact_id: contact.id }, { onConflict: "tenant_id,contact_id" }).select("id").single();
  if (verr || !conv) {
    dbLog().error("record_echo_conv_failed", { tenant_id: p.tenantId, error: verr?.message ?? "no row" });
    return false;
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
  if (error?.code === "23505" && p.externalId) return settleByEcho(db, p);
  const { error: perr } = await db.from("conversations").update(conversationPatch("owner_echo", { until: p.pausedUntilIso, now: (/* @__PURE__ */ new Date()).toISOString() })).eq("id", conv.id).eq("tenant_id", p.tenantId);
  if (perr) {
    const unwound = !error && p.externalId ? !(await db.from("messages").delete().eq("tenant_id", p.tenantId).eq("external_id", p.externalId)).error : null;
    dbLog().error("record_echo_pause_failed", {
      tenant_id: p.tenantId,
      conversation_id: conv.id,
      error: perr.message,
      unwound
    });
    return false;
  }
  await emitEvent(db, p.tenantId, "conversation.owner_replied", "conversation", conv.id, { until: p.pausedUntilIso });
  if (error) return false;
  return settleByEcho(db, p);
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
  await withdrawAiDrafts(db, {
    tenantId,
    conversationId,
    reason: { reason: "superseded_by_human" },
    keepMessageId: opts.keepMessageId ?? null
  }).catch(
    (e) => dbLog().error("pause_withdraw_drafts_failed", {
      tenant_id: tenantId,
      conversation_id: conversationId,
      error: e instanceof Error ? e.message : String(e)
    })
  );
  return true;
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
  const { data, error } = await db.from("sequence_batches").select("template_language").eq("tenant_id", p.tenantId).eq("id", p.broadcastId).maybeSingle();
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
    optIn: p.optIn ?? false
  });
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
    const yes = await setEmailOffersYes(db, {
      tenantId: p.tenantId,
      contactId: out.contact_id,
      source: "customer_message",
      messageId: out.message_id,
      evidence
    }).catch((e) => {
      dbLog().error("email_yes_not_recorded", {
        tenant_id: p.tenantId,
        contact_id: out.contact_id,
        error: e instanceof Error ? e.message : String(e)
      });
      throw e;
    });
    if (yes === "unsubscribed")
      dbLog().warn("email_yes_refused", {
        tenant_id: p.tenantId,
        contact_id: out.contact_id,
        reason: "unsubscribed"
      });
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
import { CARRIER_CONSENT_SOURCE, WHATSAPP_CONSENT_SOURCE } from "../../contracts/dist/index.js";
async function recordCarrierOptOut(db, p) {
  const { data, error } = await db.rpc("record_provider_stop", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_purpose: "conversational",
    p_channel: p.channel,
    p_source: CARRIER_CONSENT_SOURCE
  });
  if (error) throw new Error(`recording the carrier's opt-out for contact ${p.contactId}: ${error.message}`);
  return data === true;
}
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
  const { data, error } = await db.rpc("record_provider_stop", {
    p_tenant_id: p.tenantId,
    p_contact_id: contactId,
    p_purpose: "marketing",
    p_channel: "whatsapp",
    p_source: WHATSAPP_CONSENT_SOURCE,
    p_message_external_id: p.externalId
  });
  if (error) throw new Error(`recording WhatsApp's stop for contact ${contactId}: ${error.message}`);
  return data === true;
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
  const wrote = await recordCarrierOptOut(db, { tenantId: p.tenantId, contactId, channel: "sms" });
  return wrote ? "recorded" : "already_stopped";
}

// src/repositories/campaigns/stranded-runs.ts
import { DEFAULT_TIMEZONE, RUN_GOING_STATES as RUN_GOING_STATES2, isReachOutRun } from "../../contracts/dist/index.js";

// src/repositories/reach-out-sheet.ts
import { RUN_GOING_STATES, versionWords } from "../../contracts/dist/index.js";
var STEP_COLUMNS = "id, name, state, trigger, lead_search_id, after_playbook_id:after_step_id, after_days, gap_minutes, mailbox_ids, owner_sends, signed_by, include_unconfirmed, template_id, hand, run_hour, last_run_for, created_at";
async function reachOutStepsOf(db, tenantId) {
  const { data, error } = await db.from("sequence_steps").select(STEP_COLUMNS).eq("tenant_id", tenantId).eq("kind", "reach_out");
  if (error) throw new Error(`cannot read the reach-outs: ${error.message}`);
  return data ?? [];
}
async function reachOutRootOf(db, id) {
  const { data, error } = await db.from("sequence_steps").select("id, tenant_id, name, state, trigger, lead_search_id").eq("id", id).eq("kind", "reach_out").eq("trigger", "lead_first").maybeSingle();
  if (error) throw new Error(`cannot read the reach-out: ${error.message}`);
  return data;
}
async function reachOutSendRefOf(db, id) {
  const { data, error } = await db.from("sequence_sends").select("id, tenant_id, broadcast_id:batch_id, state, reason, attempts").eq("id", id).maybeSingle();
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
async function searchesByIds(db, tenantId, ids) {
  if (ids.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("lead_searches").select("id, name, via").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw new Error(`cannot read the searches: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id, { name: s.name, via: s.via }]));
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
async function saveReachOutChain(db, p) {
  const { data, error } = await db.rpc("reach_out_save", {
    p_tenant_id: p.tenantId,
    p_user_id: p.userId,
    p_chain: p.chain,
    p_decision: p.decision?.payload ?? null,
    ...p.decision?.via ? { p_via: p.decision.via } : {},
    ...p.decision?.undoOf ? { p_undo_of: p.decision.undoOf } : {}
  });
  if (error) return { data: null, error: { code: error.code, message: error.message } };
  const saved = data;
  if (!saved || typeof saved.root_id !== "string")
    return { data: null, error: { message: "reach_out_save: no chain" } };
  if (p.decision && typeof saved.decision_id !== "string")
    return { data: null, error: { message: "reach_out_save: the door answered without its decision" } };
  return { data: saved, error: null };
}
async function runsWaitingOf(db, tenantId) {
  const { data, error } = await db.from("sequence_batches").select("id, audience").eq("tenant_id", tenantId).eq("state", "pending_approval");
  if (error) throw new Error(`cannot read the runs waiting: ${error.message}`);
  return data ?? [];
}
async function reachOutRunSendsOf(db, tenantId, runId) {
  const { data, error } = await db.from("sequence_sends").select(
    "id, lead_id, state, reason, hold_detail, opening, angle, send_at, checked_at, created_at, mailbox_id, draft, drafted_at, lead:leads(business_name, email, city, kind, source, facts)"
  ).eq("tenant_id", tenantId).eq("batch_id", runId).not("lead_id", "is", null);
  if (error) throw new Error(`cannot read the run's emails: ${error.message}`);
  return (data ?? []).flatMap((r) => r.lead_id ? [{ ...r, lead_id: r.lead_id }] : []);
}
async function stampReachOutStep(db, id, p) {
  const { error } = await db.from("sequence_steps").update({ last_run_at: p.at.toISOString(), ...p.runFor ? { last_run_for: p.runFor } : {} }).eq("id", id);
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
  let sends = db.from("sequence_sends").select("tenant_id, broadcast_id:batch_id, reason").not("lead_id", "is", null).eq("state", "held").gte("updated_at", p.since).limit(p.limit);
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
  const runs = await db.from("sequence_batches").select("id, tenant_id, name, state, audience, updated_at").in("id", [...byRun.keys()]).in("state", [...RUN_GOING_STATES]);
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
  let q = db.from("sequence_batches").update({ audience: { ...p.audience, held_notice: { ...p.mark } } }).eq("tenant_id", p.tenantId).eq("id", p.id);
  if (p.ifUpdatedAt) q = q.eq("updated_at", p.ifUpdatedAt);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`cannot mark the run: ${error.message}`);
  return (data ?? []).length === 1;
}
async function runWaitingCounts(db, p) {
  const out = /* @__PURE__ */ new Map();
  if (p.runIds.length === 0) return out;
  const rows = await readAllRows(
    "cannot count the runs' waiting emails",
    (from, to) => db.from("sequence_sends").select("broadcast_id:batch_id, state").eq("tenant_id", p.tenantId).in("batch_id", [...p.runIds]).in("state", ["held", "drafted"]).order("id").range(from, to)
  );
  for (const r of rows) {
    const c = out.get(r.broadcast_id) ?? { held: 0, drafted: 0 };
    if (r.state === "held") c.held += 1;
    else c.drafted += 1;
    out.set(r.broadcast_id, c);
  }
  return out;
}

// src/repositories/campaigns/stranded-runs.ts
async function strandedRuns(db, p) {
  const { data, error } = await db.from("sequence_batches").select("id, tenant_id, name, playbook_id:step_id, audience, scheduled_for").eq("state", "scheduled").gt("scheduled_for", p.since.toISOString()).lt("scheduled_for", p.before.toISOString()).or("audience->>kind.is.null,audience->>kind.neq.reach_out").order("scheduled_for", { ascending: true }).limit(p.limit);
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
  const { data, error } = await db.from("sequence_batches").update({ state: "failed", failure: "run_interrupted", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.id).eq("tenant_id", p.tenantId).eq("state", "scheduled").select("id");
  if (error) throw new Error(`stranded runs: cannot mark run ${p.id} not sent: ${error.message}`);
  if (!(data ?? []).length) return false;
  await emitEvent(db, p.tenantId, "broadcast.stopped", "broadcast", p.id, { failure: "run_interrupted", sent: 0 });
  return true;
}
async function waitingPlaybookRuns(db, p) {
  const { data, error } = await db.from("sequence_batches").select("id, tenant_id, name, state, playbook_id:step_id, run_for, audience").eq("state", "pending_approval").not("step_id", "is", null).not("run_for", "is", null).or("audience->>kind.is.null,audience->>kind.neq.reach_out").order("run_for", { ascending: true }).order("created_at", { ascending: true }).limit(p.limit);
  if (error) throw new Error(`waiting runs: cannot read the runs waiting for approval: ${error.message}`);
  const runs = (data ?? []).filter((r) => !isReachOutRun(r.audience));
  if (!runs.length) return [];
  const zones = await db.from("tenants").select("id, timezone").in("id", [...new Set(runs.map((r) => r.tenant_id))]);
  if (zones.error) throw new Error(`waiting runs: cannot read their workspaces' zones: ${zones.error.message}`);
  const zoneOf = new Map((zones.data ?? []).map((t) => [t.id, t.timezone]));
  return runs.flatMap(
    (r) => r.playbook_id && r.run_for ? [
      {
        id: r.id,
        tenant_id: r.tenant_id,
        name: r.name,
        state: r.state,
        playbook_id: r.playbook_id,
        run_for: r.run_for,
        audience: r.audience,
        timezone: zoneOf.get(r.tenant_id) || DEFAULT_TIMEZONE
      }
    ] : []
  );
}
async function cancelBroadcastFrom(db, p) {
  const { data, error } = await db.from("sequence_batches").update({ state: "canceled" }).eq("id", p.id).eq("tenant_id", p.tenantId).eq("state", p.from).select("id");
  if (error) throw new Error(`waiting runs: cannot end run ${p.id}: ${error.message}`);
  return (data ?? []).length > 0;
}
async function recordSystemDecision(db, p) {
  const { data, error } = await db.from("decisions").insert({
    tenant_id: p.tenantId,
    subject_type: p.subjectType,
    subject_id: p.subjectId,
    verb: p.verb,
    actor_type: "system",
    actor_user_id: null,
    payload: p.payload
  }).select("id").single();
  if (error) throw new Error(`cannot record the system's decision: ${error.message}`);
  return data.id;
}
var WAITING_RUN_COLUMNS = "id, name, state, playbook_id:step_id, run_for, audience, recipient_count, created_at";
async function waitingRunsOf(db, tenantId) {
  const [pending, going] = await Promise.all([
    db.from("sequence_batches").select(WAITING_RUN_COLUMNS).eq("tenant_id", tenantId).eq("state", "pending_approval").order("created_at", { ascending: false }).limit(200),
    db.from("sequence_batches").select(WAITING_RUN_COLUMNS).eq("tenant_id", tenantId).in("state", [...RUN_GOING_STATES2]).order("created_at", { ascending: false }).limit(200)
  ]);
  if (pending.error) throw new Error(`cannot read the runs waiting for approval: ${pending.error.message}`);
  if (going.error) throw new Error(`cannot read the going runs: ${going.error.message}`);
  const reaching = (going.data ?? []).filter((r) => isReachOutRun(r.audience));
  const runIds = reaching.map((r) => r.id);
  const waiting = reaching.length ? await runWaitingCounts(db, { tenantId, runIds }) : null;
  const holding = reaching.flatMap((r) => {
    const w = waiting?.get(r.id);
    return w ? [{ ...r, held: w.held, drafted: w.drafted }] : [];
  });
  return [...pending.data ?? [], ...holding].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
async function runsNamed(db, tenantId, ids) {
  if (!ids.length) return [];
  const { data, error } = await db.from("sequence_batches").select(WAITING_RUN_COLUMNS).eq("tenant_id", tenantId).in("id", [...ids]);
  if (error) throw new Error(`cannot read the runs the notices name: ${error.message}`);
  const rows = data ?? [];
  const reaching = rows.filter(
    (r) => isReachOutRun(r.audience) && RUN_GOING_STATES2.includes(r.state)
  );
  const waiting = reaching.length ? await runWaitingCounts(db, { tenantId, runIds: reaching.map((r) => r.id) }) : null;
  return rows.map((r) => {
    const w = waiting?.get(r.id);
    return w ? { ...r, held: w.held, drafted: w.drafted } : r;
  });
}

// src/repositories/mailboxes/connections.ts
async function mailboxConnectionsOf(db, tenantId) {
  const { data, error } = await db.from("mailbox_connections").select("*").eq("tenant_id", tenantId).neq("state", "removed").order("connected_at", { ascending: true });
  if (error) throw new Error(`cannot read the workspace's mailboxes: ${error.message}`);
  return data ?? [];
}
async function mailboxConnectionOf(db, tenantId, id) {
  const { data, error } = await db.from("mailbox_connections").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw new Error(`cannot read the mailbox: ${error.message}`);
  return data;
}
async function liveMailboxByAddress(db, address) {
  const { data, error } = await db.from("mailbox_connections").select("*").eq("address", address.trim().toLowerCase()).neq("state", "removed").maybeSingle();
  if (error) throw new Error(`cannot read the mailbox: ${error.message}`);
  return data;
}
async function liveMailboxByWatch(db, watchId) {
  const { data, error } = await db.from("mailbox_connections").select("*").eq("watch_id", watchId).neq("state", "removed").maybeSingle();
  if (error) throw new Error(`cannot read the mailbox: ${error.message}`);
  return data;
}
async function mailboxesToTend(db, limit, skip = []) {
  let q = db.from("mailbox_connections").select("*").in("state", ["connected", "paused", "held"]).order("synced_at", { ascending: true, nullsFirst: true }).limit(limit);
  const done = [...skip];
  if (done.length) q = q.not("id", "in", `(${done.join(",")})`);
  const { data, error } = await q;
  if (error) throw new Error(`cannot read the mailboxes to tend: ${error.message}`);
  return data ?? [];
}
async function connectMailbox(db, p) {
  const { data, error } = await db.rpc("mailbox_connection_connect", {
    p_tenant_id: p.tenantId,
    p_user_id: p.userId,
    p_provider: p.provider,
    p_account: p.account,
    p_address: p.address,
    p_from_name: p.fromName,
    p_scopes: p.scopes,
    p_customer_domain: p.customerDomain
  });
  if (error) {
    const hint = error.hint ?? "";
    if (hint === "taken" || hint === "too_many" || hint === "too_many_on_domain") return { ok: false, refused: hint };
    throw new Error(`cannot connect the mailbox: ${error.message}`);
  }
  const r = data ?? {};
  if (!r.id) throw new Error("cannot connect the mailbox: no row came back");
  return { ok: true, id: r.id, made: r.made === true, state: String(r.state ?? "connected") };
}
async function patchMailboxConnection(db, p) {
  let q = db.from("mailbox_connections").update(p.patch).eq("tenant_id", p.tenantId).eq("id", p.id);
  if (p.from?.length) q = q.in("state", [...p.from]);
  const { data, error } = await q.select("*");
  if (error) throw new Error(`cannot change the mailbox: ${error.message}`);
  return data?.[0] ?? null;
}
async function putMailboxCredentials(db, p) {
  const { error } = await db.rpc("put_mailbox_credentials", {
    p_connection_id: p.id,
    p_secret: p.secret,
    ...p.ifRefreshToken ? { p_if_refresh_token: p.ifRefreshToken } : {}
  });
  if (error) {
    if (error.code === "40001") return "changed";
    throw new Error(`cannot store the mailbox's token: ${error.message}`);
  }
  return "stored";
}
async function getMailboxCredentials(db, id) {
  const { data, error } = await db.rpc("get_mailbox_credentials", { p_connection_id: id });
  if (error) throw new Error(`cannot read the mailbox's token: ${error.message}`);
  return data ?? null;
}
async function dropMailboxCredentials(db, id) {
  const { data, error } = await db.rpc("drop_mailbox_credentials", { p_connection_id: id });
  if (error) throw new Error(`cannot drop the mailbox's token: ${error.message}`);
  return data === true;
}
async function mailboxCountsOf(db, id, since) {
  const { data, error } = await db.rpc("mailbox_connection_counts", { p_mailbox_id: id, p_since: since });
  if (error) throw new Error(`cannot count the mailbox's emails: ${error.message}`);
  const c = data ?? {};
  const n = (k) => Math.max(0, Number(c[k] ?? 0) || 0);
  if (typeof c.sent !== "number") throw new Error("cannot count the mailbox's emails: the database answered no count");
  return { sent: n("sent"), bounced: n("bounced"), complained: n("complained"), unsubscribed: n("unsubscribed") };
}
async function stampEmailFromMailbox(db, p) {
  const { data, error } = await db.rpc("stamp_email_from_mailbox", {
    p_tenant_id: p.tenantId,
    p_message_id: p.messageId,
    p_provider_id: p.providerId,
    p_rfc_message_id: p.rfcMessageId,
    p_thread_id: p.threadId,
    p_mailbox_id: p.mailboxId
  });
  if (error) throw new Error(`cannot stamp the email the mailbox sent: ${error.message}`);
  return data === true;
}

// src/repositories/mailboxes/sync.ts
async function takeMailboxSync(db, id, at, leaseMs) {
  const until = new Date(at.getTime() + leaseMs).toISOString();
  const { data, error } = await db.from("mailbox_connections").update({ sync_lease_until: until }).eq("id", id).neq("state", "removed").or(`sync_lease_until.is.null,sync_lease_until.lt.${at.toISOString()}`).select("id");
  if (error) throw new Error(`cannot take the mailbox's sync: ${error.message}`);
  return (data ?? []).length > 0;
}
async function endMailboxSync(db, p) {
  const { error } = await db.from("mailbox_connections").update({
    ...p.cursor !== null ? { sync_cursor: p.cursor } : {},
    synced_at: p.at.toISOString(),
    sync_lease_until: null,
    ...p.error !== void 0 ? { last_error: p.error, last_error_at: p.error ? p.at.toISOString() : null } : {}
  }).eq("id", p.id);
  if (error) throw new Error(`cannot end the mailbox's sync: ${error.message}`);
}
async function keepMailboxWatch(db, p) {
  const { error } = await db.from("mailbox_connections").update({
    watch_id: p.watchId,
    watch_expires_at: p.expiresAt.toISOString(),
    ...p.cursor ? { sync_cursor: p.cursor } : {}
  }).eq("id", p.id);
  if (error) throw new Error(`cannot keep the mailbox's watch: ${error.message}`);
}
async function mailboxConnectionById(db, id) {
  const { data, error } = await db.from("mailbox_connections").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`cannot read the mailbox: ${error.message}`);
  return data;
}
async function sentEmailIdByMessageId(db, tenantId, rfcMessageId) {
  const { data, error } = await db.from("messages").select("id").eq("tenant_id", tenantId).eq("channel", "email").eq("direction", "outbound").eq("meta->email->>message_id", rfcMessageId).limit(1);
  if (error) throw new Error(`cannot find the email the report is about: ${error.message}`);
  return data?.[0]?.id ?? null;
}
async function knownThreads(db, tenantId, threadIds) {
  if (threadIds.length === 0) return /* @__PURE__ */ new Set();
  const { data, error } = await db.rpc("mailbox_threads_known", {
    p_tenant_id: tenantId,
    p_thread_ids: [...new Set(threadIds)]
  });
  if (error) throw new Error(`cannot read which threads are the workspace's: ${error.message}`);
  return new Set(data ?? []);
}

// src/repositories/outreach.ts
import { conversationPatch as conversationPatch2 } from "../../contracts/dist/index.js";

// src/repositories/mailboxes/day.ts
async function mailboxCapacityOf(db, mailboxId, at) {
  const { data, error } = await db.rpc("mailbox_capacity", { p_mailbox_id: mailboxId, p_at: at.toISOString() });
  if (error) throw new Error(`cannot read the mailbox's day: ${error.message}`);
  return mailboxCapacityFrom(data);
}
function mailboxCapacityFrom(data) {
  const c = data ?? {};
  if (typeof c.used !== "number" || typeof c.sent_days !== "number" || typeof c.daily_cap !== "number")
    throw new Error("cannot read the mailbox's day: the database answered without its counts");
  return {
    state: String(c.state ?? ""),
    clean_since: typeof c.clean_since === "string" ? c.clean_since : null,
    resting_until: typeof c.resting_until === "string" ? c.resting_until : null,
    daily_cap: c.daily_cap,
    customer_domain: c.customer_domain === true,
    sent_days: c.sent_days,
    sent_today: Math.max(0, Number(c.sent_today ?? 0) || 0),
    used: c.used,
    recent: Array.isArray(c.recent) ? c.recent.map(Number).filter(Number.isFinite) : [],
    last_sent_at: typeof c.last_sent_at === "string" ? c.last_sent_at : null
  };
}
async function dueMailboxes(db, at, limit, opts = {}) {
  const { data, error } = await db.rpc("reach_out_due_mailboxes", {
    p_at: at.toISOString(),
    p_limit: limit,
    ...opts.tenantId ? { p_tenant_id: opts.tenantId } : {},
    p_skip_tenants: [...opts.skipTenants ?? []],
    p_skip_mailboxes: [...opts.skipMailboxes ?? []]
  });
  if (error) throw new Error(`cannot read the mailboxes with sends due: ${error.message}`);
  return data ?? [];
}

// src/repositories/outreach.ts
async function outreachFactsOf(db, p) {
  const { data, error } = await db.rpc("outreach_mailbox_facts", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_to: p.to,
    p_from: p.from,
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
    mailbox: f.mailbox && typeof f.mailbox === "object" && typeof f.mailbox.id === "string" ? {
      id: f.mailbox.id,
      address: typeof f.mailbox.address === "string" ? f.mailbox.address : "",
      ...mailboxCapacityFrom(f.mailbox)
    } : null
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
    received_at: receivedAt,
    cited: o.cited === true,
    from_name: textOf(o.from_name),
    not_names: [textOf(o.workspace), ...Array.isArray(o.team) ? o.team.map(textOf) : []].filter(
      (x) => !!x
    )
  };
}
async function replyReadingOf(db, p) {
  const { data, error } = await db.from("sequence_replies").select(
    "intent, claim, summary, unread, rereads, plan, told_at, undone_at, draft, draft_state, draft_why, signer_name, signer_state"
  ).eq("tenant_id", p.tenantId).eq("message_id", p.messageId).maybeSingle();
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
  let q = db.from("sequence_replies").select(REPLY_LIST_COLUMNS).eq("tenant_id", p.tenantId).gte("read_at", p.since);
  if (p.conversationId) q = q.eq("conversation_id", p.conversationId);
  const { data, error } = await q.order("read_at", { ascending: false }).limit(p.limit);
  if (error) throw new Error(`cannot read the replies: ${error.message}`);
  const rows = data ?? [];
  const ids = (k) => [...new Set(rows.map((r) => r[k]).filter((v) => !!v))];
  const [leads, sends] = await Promise.all([
    ids("lead_id").length ? db.from("leads").select("id, business_name").eq("tenant_id", p.tenantId).in("id", ids("lead_id")) : Promise.resolve({ data: [], error: null }),
    ids("send_id").length ? db.from("sequence_sends").select("id, playbook_id:step_id, root_id:sequence_id").eq("tenant_id", p.tenantId).in("id", ids("send_id")) : Promise.resolve({ data: [], error: null })
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
  const { data, error } = await db.from("sequence_replies").select("message_id, tenant_id").eq("message_id", messageId).maybeSingle();
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
function leadSends(rows) {
  return (rows ?? []).flatMap((r) => r.lead_id ? [{ ...r, lead_id: r.lead_id }] : []);
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
    throw new Error(`cannot claim the mailbox's due sends: a cap and a limit are whole numbers (${p.cap}, ${p.limit})`);
  const { data, error } = await db.rpc("sequence_claim_from", {
    p_mailbox_id: p.mailboxId,
    p_cap: p.cap,
    p_at: p.at.toISOString(),
    p_limit: p.limit
  });
  if (error) throw new Error(`cannot claim the mailbox's due sends: ${error.message}`);
  return leadSends(data);
}
async function moveSend(db, p) {
  const { data, error } = await db.from("sequence_sends").update(p.patch).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", p.from).select("id");
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
  const { data, error } = await db.rpc("sequence_queued_outcomes", {
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the queued sends: ${error.message}`);
  return data ?? [];
}
async function stuckClaims(db, before, limit, tenantId) {
  let q = db.from("sequence_sends").select("*").not("lead_id", "is", null).eq("state", "claimed");
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q.lt("claimed_at", before.toISOString()).order("claimed_at", { ascending: true }).limit(limit);
  if (error) throw new Error(`cannot read the claimed sends: ${error.message}`);
  return leadSends(data);
}
async function staleSends(db, before, limit, tenantId) {
  const { data, error } = await db.rpc("sequence_stale_sends", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the stale sends: ${error.message}`);
  return leadSends(data);
}
async function closedRunSends(db, stuckBefore, limit, tenantId) {
  const { data, error } = await db.rpc("sequence_closed_sends", {
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
  const withdrawn = await withdrawQueued(db, {
    tenantId: p.tenantId,
    messageIds: [p.id],
    reason: { reason: p.reason }
  });
  return withdrawn.length > 0;
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
    db.from("sequence_batches").select("state").eq("tenant_id", s.tenant_id).eq("id", s.batch_id).maybeSingle(),
    db.from("sequence_steps").select("id, state, template_id, after_step_id, signed_by, owner_sends").eq("tenant_id", s.tenant_id).in("id", [s.step_id ?? s.sequence_id, s.sequence_id])
  ]);
  if (run.error) throw new Error(`cannot read the send's run: ${run.error.message}`);
  if (chain.error) throw new Error(`cannot read the send's chain: ${chain.error.message}`);
  const step = s.step_id ? (chain.data ?? []).find((p) => p.id === s.step_id) : void 0;
  return {
    run: run.data?.state ?? null,
    step: step?.template_id ? { state: step.state, template_id: step.template_id, after_step_id: step.after_step_id } : null,
    root: (chain.data ?? []).find((p) => p.id === s.sequence_id)?.state ?? null,
    signedBy: (chain.data ?? []).find((p) => p.id === s.sequence_id)?.signed_by ?? null,
    ownerSends: (chain.data ?? []).find((p) => p.id === s.sequence_id)?.owner_sends === true
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
  const { data, error } = await db.from("leads").select("business_name, city, email, email_state, kind, source, facts").eq("tenant_id", tenantId).eq("id", leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead: ${error.message}`);
  return data;
}
async function contactEmailOf(db, tenantId, contactId) {
  const { data, error } = await db.from("contacts").select("email").eq("tenant_id", tenantId).eq("id", contactId).maybeSingle();
  if (error) throw new Error(`cannot read the person: ${error.message}`);
  return data?.email ?? null;
}
async function sendNow(db, p) {
  const { data, error } = await db.from("sequence_sends").select("state, message_id").eq("tenant_id", p.tenantId).eq("id", p.id).maybeSingle();
  if (error) throw new Error(`cannot read the send: ${error.message}`);
  return data;
}
async function runHanded(db, p) {
  const { error } = await db.from("sequence_batches").update({ state: "sending", updated_at: p.at.toISOString() }).eq("tenant_id", p.tenantId).eq("id", p.id).in("state", ["scheduled", "sending"]);
  if (error) throw new Error(`cannot mark the run handed over: ${error.message}`);
}
async function runSending(db, p) {
  const { error } = await db.from("sequence_batches").update({ state: "sending" }).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", "scheduled");
  if (error) throw new Error(`cannot start the run: ${error.message}`);
}
async function parentEmailOf(db, p) {
  const { data: sends, error } = await db.from("sequence_sends").select("message_id, said_at").eq("tenant_id", p.tenantId).eq("sequence_id", p.rootId).eq("lead_id", p.leadId).eq("step_id", p.stepId).eq("state", "sent").order("sent_at", { ascending: false }).limit(1);
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
    subject: typeof subject === "string" ? subject : null,
    ownerSent: sends?.[0]?.said_at != null
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
  const { data: lead, error } = await db.from("leads").select("stage, version, contacted_at, blanked_at, erased_at").eq("tenant_id", p.tenantId).eq("id", p.leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead a send wrote to: ${error.message}`);
  if (!lead || lead.blanked_at || lead.erased_at) return false;
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
async function recordCheck(db, p) {
  const { data, error } = await db.from("sequence_sends").update({ ...p.patch, check_started_at: null }).eq("tenant_id", p.tenantId).eq("id", p.id).eq("state", "planned").is("checked_at", null).eq("check_gen", p.gen).select("id");
  if (error) throw new Error(`cannot record the send's check: ${error.message}`);
  return (data ?? []).length === 1;
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

// src/repositories/campaigns/reach-out-leads.ts
import { isLeadList } from "../../contracts/dist/index.js";
var answer = (data, error) => error ? { data: null, error: { code: error.code, message: error.message } } : { data, error: null };
async function reachOutAdd(db, p) {
  const { data, error } = await db.rpc("reach_out_add", { p_root_id: p.rootId, p_lead_ids: p.leadIds, p_dry: p.dry });
  return answer(data, error);
}
async function leadMemberLater(db, p) {
  const { data, error } = await db.rpc("lead_member_later", { p_search_id: p.searchId, p_lead_id: p.leadId });
  return answer(data, error);
}
async function leadPileCounts(db, p) {
  const { data, error } = await db.rpc("lead_pile_counts", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    ...p.listId ? { p_list_id: p.listId } : {},
    ...p.cls ? { p_class: p.cls } : {}
  });
  return answer(data, error);
}
async function reachOutChainPeople(db, p) {
  const { data, error } = await db.rpc("reach_out_chain_people", {
    p_tenant_id: p.tenantId,
    p_root_id: p.rootId,
    ...p.limit ? { p_limit: p.limit } : {}
  });
  return answer(data, error);
}
async function reachOutFedByOf(db, tenantId, searchId) {
  if (!searchId) return "search";
  const { data, error } = await db.from("lead_searches").select("via").eq("tenant_id", tenantId).eq("id", searchId).maybeSingle();
  if (error) throw new Error(`cannot read the chain's search: ${error.message}`);
  return isLeadList(data) ? "list" : "search";
}
async function leadsBackToday(db, tenantId) {
  const { data, error } = await db.rpc("leads_back_today", { p_tenant_id: tenantId });
  return answer(data, error);
}
async function reachOutLeaveOut(db, p) {
  const { data, error } = await db.rpc("reach_out_leave_out", { p_root_id: p.rootId, p_lead_id: p.leadId });
  return answer(data, error);
}
async function reachOutSources(db, tenantId) {
  const { data, error } = await db.rpc("reach_out_sources", { p_tenant_id: tenantId });
  return answer(data, error);
}
async function reachOutPeopleCounts(db, tenantId) {
  try {
    const { data, error } = await db.rpc("reach_out_people_counts", { p_tenant_id: tenantId });
    const r = answer(data, error);
    return r.error ? null : r.data;
  } catch {
    return null;
  }
}

// src/repositories/campaigns/reach-out-drafts.ts
async function claimDrafts(db, p) {
  if (!Number.isInteger(p.limit) || Number.isNaN(p.at.getTime()))
    throw new Error(`cannot claim the drafts due: a limit is a whole number (${p.limit})`);
  const { data, error } = await db.rpc("sequence_claim_drafts", {
    p_at: p.at.toISOString(),
    p_limit: p.limit,
    ...p.tenantId ? { p_tenant_id: p.tenantId } : {}
  });
  if (error) throw new Error(`cannot claim the drafts due: ${error.message}`);
  return leadSends(data);
}
async function chainDraftLoad(db, p) {
  const [runs, open] = await Promise.all([
    db.from("sequence_batches").select("id").eq("tenant_id", p.tenantId).eq("audience->>kind", "reach_out").eq("audience->>root_id", p.rootId).eq("run_for", p.runFor),
    db.from("sequence_sends").select("id", { count: "exact", head: true }).eq("tenant_id", p.tenantId).eq("sequence_id", p.rootId).not("lead_id", "is", null).in("state", ["planned", "held", "claimed", "drafted"])
  ]);
  if (runs.error) throw new Error(`cannot read the reach-out's runs of the day: ${runs.error.message}`);
  if (open.error) throw new Error(`cannot count the reach-out's emails waiting: ${open.error.message}`);
  const ids = (runs.data ?? []).map((r) => r.id);
  if (ids.length === 0) return { today: 0, open: open.count ?? 0 };
  const { count: count2, error } = await db.from("sequence_sends").select("id", { count: "exact", head: true }).eq("tenant_id", p.tenantId).in("batch_id", ids).neq("state", "skipped");
  if (error) throw new Error(`cannot count the reach-out's emails of the day: ${error.message}`);
  return { today: count2 ?? 0, open: open.count ?? 0 };
}
async function draftFactsOf(db, tenantId, leadId) {
  const { data, error } = await db.rpc("reach_out_draft_facts", { p_tenant_id: tenantId, p_lead_id: leadId });
  if (error) throw new Error(`cannot read the draft's lead: ${error.message}`);
  return data ?? null;
}
async function draftsWaiting(db, p) {
  const { data, error } = await db.rpc("reach_out_drafts_waiting", {
    p_limit: p.limit,
    ...p.tenantId ? { p_tenant_id: p.tenantId } : {},
    ...p.runId ? { p_run_id: p.runId } : {},
    ...p.after ? { p_after_at: p.after.drafted_at, p_after_id: p.after.id } : {}
  });
  if (error) throw new Error(`cannot read the drafts waiting: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, facts: r.facts ?? null }));
}
async function ownerSendFactsOf(db, p) {
  if (p.sendIds.length === 0) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("sequence_sends").select("id, batch_id, state, said_at").eq("tenant_id", p.tenantId).in("id", [...p.sendIds]);
  if (error) throw new Error(`cannot read the owner's sends: ${error.message}`);
  return new Map(
    (data ?? []).map((r) => [
      r.id,
      { runId: r.state === "drafted" ? r.batch_id : null, said: r.state === "sent" && r.said_at !== null }
    ])
  );
}
async function sendSaid(db, p) {
  const { data, error } = await db.rpc("reach_out_send_said", {
    p_send_id: p.sendId,
    p_outcome: p.outcome,
    ...p.reason ? { p_reason: p.reason } : {}
  });
  return answer(data, error);
}
async function replySaid(db, p) {
  const { data, error } = await db.rpc("reach_out_reply_said", {
    p_tenant_id: p.tenantId,
    p_user_id: p.userId,
    p_lead_id: p.leadId,
    p_reading: p.reading,
    p_plan: p.plan,
    p_note: p.note
  });
  return answer(data, error);
}
async function leadReplyFactsOf(db, p) {
  const { data, error } = await db.from("leads").select("business_name, email, website_host, website_root").eq("tenant_id", p.tenantId).eq("id", p.leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead: ${error.message}`);
  return data ? { ...data, business_name: data.business_name ?? "" } : null;
}

// src/repositories/campaigns/reach-out-check.ts
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
    email_domain_shared: r.email_domain_shared === true,
    reviews_dist: r.reviews_dist ?? null,
    claimed: typeof r.claimed === "boolean" ? r.claimed : null
  };
}
async function uncheckedSends(db, p) {
  const { data, error } = await db.rpc("sequence_unchecked", {
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
      template_language: text(r.template_language) ?? "en",
      signed_by: text(r.signed_by),
      included_for: Array.isArray(r.included_for) ? r.included_for.filter((x) => typeof x === "string") : [],
      record: recordOf(r)
    };
  });
}
async function uncheckedWaiting(db, tenantId) {
  let q = db.from("sequence_sends").select("id").not("lead_id", "is", null).eq("state", "planned").is("checked_at", null);
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
async function heldStale(db, before, limit, tenantId) {
  const { data, error } = await db.rpc("sequence_held_stale", {
    p_before: before.toISOString(),
    p_limit: limit,
    ...tenantId ? { p_tenant_id: tenantId } : {}
  });
  if (error) throw new Error(`cannot read the held sends: ${error.message}`);
  return leadSends(data);
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
  return (await heldMessageOf(db, tenantId, name, language))?.slots ?? null;
}
async function heldMessageOf(db, tenantId, name, language) {
  const { data, error } = await db.from("templates").select("channel, language, category, variables").eq("tenant_id", tenantId).eq("name", name);
  if (error) throw new Error(`heldMessageOf: ${error.message}`);
  const rows = (data ?? []).slice().sort((a, b) => {
    const wa = Number(b.channel === "whatsapp") - Number(a.channel === "whatsapp");
    return wa || Number(b.language === language) - Number(a.language === language);
  });
  const row = rows[0];
  return row ? { category: row.category, slots: variablesSlotCount(row.variables) } : null;
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
var ReportWindowNotReadable = class extends Error {
  constructor(door) {
    super(`${door}: this database cannot read a report of days that ended before today (00360)`);
    this.name = "ReportWindowNotReadable";
  }
};
var windowArgs = (tenantId, w) => w.end === null ? { p_tenant_id: tenantId, p_days: w.days } : { p_tenant_id: tenantId, p_days: w.days, p_end: w.end };
var notReadable = (w, error) => w.end !== null && isMissingDoor({ code: error.code ?? null });
async function reportSeries(db, tenantId, window) {
  const { data, error } = await db.rpc("report_series", windowArgs(tenantId, window));
  if (error) {
    if (notReadable(window, error)) throw new ReportWindowNotReadable("report_series");
    throw new Error(`report_series: ${error.message}`);
  }
  return data;
}
async function campaignSeries(db, tenantId, window) {
  const { data, error } = await db.rpc("campaign_series", windowArgs(tenantId, window));
  if (error) {
    if (notReadable(window, error)) throw new ReportWindowNotReadable("campaign_series");
    throw new Error(`campaign_series: ${error.message}`);
  }
  return data;
}
async function reviewsLedger(db, tenantId, window) {
  const { data, error } = await db.rpc("reviews_ledger", windowArgs(tenantId, window));
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`reviews_ledger: ${error.message}`);
  }
  return data;
}
async function receptionistSeries(db, tenantId, window) {
  const { data, error } = await db.rpc("receptionist_series", windowArgs(tenantId, window));
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`receptionist_series: ${error.message}`);
  }
  return data;
}
async function peopleSeries(db, tenantId, window) {
  const { data, error } = await db.rpc("people_series", windowArgs(tenantId, window));
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`people_series: ${error.message}`);
  }
  return data;
}
async function campaignLedger(db, tenantId, window) {
  const { data, error } = await db.rpc("campaign_ledger", windowArgs(tenantId, window));
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`campaign_ledger: ${error.message}`);
  }
  return data;
}
async function campaignStuck(db, tenantId) {
  const { data, error } = await db.rpc("campaign_stuck", { p_tenant_id: tenantId });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new Error(`campaign_stuck: ${error.message}`);
  }
  return data;
}
async function reachOutReport(db, tenantId, window) {
  const { data, error } = await db.rpc("reach_out_report", windowArgs(tenantId, window));
  if (error) {
    if (notReadable(window, error)) throw new ReportWindowNotReadable("reach_out_report");
    return { ok: false, code: error.code ?? "", message: error.message };
  }
  return { ok: true, data };
}
function answerOrMissing(name, data, error) {
  if (error) {
    if (isMissingDoor(error)) return "missing";
    throw new Error(`${name}: ${error.message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(`${name}: answered no object`);
  return data;
}
async function playbookTotals(db, tenantId, history) {
  const { data, error } = await db.rpc("playbook_totals", { p_tenant_id: tenantId, p_history: history });
  return answerOrMissing("playbook_totals", data, error);
}
async function runCounts(db, tenantId, runIds) {
  const { data, error } = await db.rpc("run_counts", { p_tenant_id: tenantId, p_run_ids: [...runIds] });
  return answerOrMissing("run_counts", data, error);
}
async function templateSends(db, tenantId) {
  const { data, error } = await db.rpc("template_sends", { p_tenant_id: tenantId });
  return answerOrMissing("template_sends", data, error);
}
async function reachOutChainTotals(db, tenantId, window) {
  const { data, error } = await db.rpc("reach_out_chain_totals", windowArgs(tenantId, window));
  return answerOrMissing("reach_out_chain_totals", data, error);
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

// src/repositories/reports/page-vitals.ts
async function notePageVitals(db, load) {
  const { data, error } = await db.rpc("note_page_vitals", {
    p_page: load.page,
    p_vitals: load.vitals,
    ...load.device ? { p_device: load.device } : {},
    ...load.build ? { p_build: load.build } : {}
  });
  return { data, error };
}
async function pageVitalsP75(db, window) {
  const { data, error } = await db.rpc("page_vitals_p75", { p_days: window.days, p_most: window.most });
  return { data, error };
}
async function pageSpeed(db, window) {
  const { data, error } = await db.rpc("page_speed", { p_days: window.days, p_most: window.most });
  return { data, error };
}
async function pageSpots(db, window) {
  const { data, error } = await db.rpc("page_spots", { p_days: window.days, p_most: window.most });
  return { data, error };
}

// src/repositories/notices/notifications.ts
import {
  BELL_WINDOW_DAYS,
  CATCH_UP_VISITS,
  DAY_MS as DAY_MS2,
  HOUR_MS as HOUR_MS2,
  isForReader,
  MIN_MS,
  SAME_VISIT_MS,
  sameVisitOnRecord,
  sightingStands,
  unreadFor
} from "../../contracts/dist/index.js";

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
  disclosureFacts,
  pickCurrentDeal,
  proposalLinkOf
} from "../../contracts/dist/index.js";
var DELIVERED = ["sent", "delivered", "read"];
var IMPORTED_CALL_NOTE = /^\[voice call note /;
var isBackfill = (m) => !!m.meta && typeof m.meta === "object" && m.meta.backfill === true;
var isAcknowledgement = (m) => !!m.meta && typeof m.meta === "object" && m.meta.ack === true;
var effectiveAt = (m) => new Date(m.channel_ts ?? m.created_at).getTime();
function keptTurns(rows) {
  const kept = rows.filter((m) => {
    const body = (m.body ?? "").trim();
    if (!body) return false;
    if (m.direction === "outbound" && !DELIVERED.includes(String(m.status))) return false;
    if (isBackfill(m) && IMPORTED_CALL_NOTE.test(body)) return false;
    return true;
  });
  return kept.sort((a, b) => effectiveAt(a) - effectiveAt(b));
}
function assembleHistory(rows, limit) {
  return keptTurns(rows).map((m) => ({
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
async function readLeadContext(db, tenantId, phoneE164, historyLimit = 16, answering) {
  const withAnswer = await db.from("contacts").select(
    "id, display_name, wa_profile_name, name_source, last_seen_at, consent, dnc, notes, proposal_url, email, marketing_consent, marketing_channels, offers_asked_at, tenants(sells_by)"
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
  const { history, lastTurnAt } = conv ? await turnsBefore(db, tenantId, conv.id, historyLimit, answering) : { history: [], lastTurnAt: null };
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
    standIn: contact.name_source === "lead" && !!contact.display_name,
    // the business's own name (0052)
    // Having said anything at all is what makes someone returning — not merely
    // existing as a row, which an outbound-only contact would also satisfy.
    returning: history.length > 0,
    lastSeenAt: answering ? lastTurnAt : contact.last_seen_at ?? null,
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
async function turnsBefore(db, tenantId, conversationId, limit, answering) {
  const { data: rows, error } = await db.from("messages").select(`id, ${HISTORY_COLUMNS}`).eq("tenant_id", tenantId).eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(answering ? Math.max(limit * 3, 24) + 1 : limit * 3);
  if (error) throw new Error(`readLeadContext/history: ${error.message}`);
  const before = (rows ?? []).filter((m) => m.id !== answering);
  const newest = keptTurns(before).at(-1);
  const lastTurnAt = newest ? new Date(effectiveAt(newest)).toISOString() : null;
  return { history: assembleHistory(before, limit), lastTurnAt };
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
  const theirs = lead.standIn ? " That is the business they are at, not their own name: never call them by it, and ask who you are speaking with if it helps." : "";
  bits.push(name ? `Name on record: ${fencedInline("profile_name", name)}.${theirs}` : "No name on record.");
  if (lead.hasEmail === true) bits.push("Their email address is on file.");
  else if (lead.hasEmail === false) bits.push("No email address on file.");
  bits.push(
    ...offersFacts(lead, channel, now, tz),
    ...disclosureFacts({ returning: lead.returning, lastTurnAt: lead.lastSeenAt }, channel, now)
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
  for (let i = 0; i < ids.length; i += IDS_PER_READ2) {
    const { data, error } = await db.from("messages").select("id, error").eq("tenant_id", tenantId).eq("status", "failed").in("id", ids.slice(i, i + IDS_PER_READ2));
    if (error) throw new Error(`failedMessageErrors: ${error.message}`);
    for (const r of data ?? [])
      if (r.error !== null && typeof r.error === "object" && !Array.isArray(r.error))
        out.push({ id: r.id, error: r.error });
  }
  return out;
}
async function messageSenders(db, tenantId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ2) {
    const { data, error } = await db.from("messages").select("id, sender, status, type").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ2));
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

// src/repositories/notices/notifications.ts
async function forgetNotification(db, p) {
  const { error } = await db.from("notifications").delete().eq("tenant_id", p.tenantId).eq("id", p.id);
  if (error) throw new Error(`cannot take the notification back: ${error.message}`);
}
async function noticeFor(db, p) {
  const base = db.from("notifications").select("id, kind, mail_due_at").eq("tenant_id", p.tenantId);
  const found = p.sourceEvent ? await base.eq("source_event", p.sourceEvent).limit(1) : p.subjectType && p.subjectId && p.title ? await base.eq("kind", p.kind).eq("subject_type", p.subjectType).eq("subject_id", p.subjectId).eq("title", p.title).not("mail_due_at", "is", null).order("created_at", { ascending: false }).limit(1) : null;
  if (!found) return null;
  if (found.error) throw new Error(`cannot read what the workspace was told: ${found.error.message}`);
  const row = (found.data ?? [])[0];
  return row ? { id: row.id, kind: row.kind, mailOwed: row.mail_due_at !== null } : null;
}
async function mailSent(db, p) {
  const { error } = await db.from("notifications").update({
    mail_due_at: null,
    ...p.words ? { title: p.words.title.slice(0, 200), body: p.words.body.slice(0, 4e3) } : {}
  }).eq("tenant_id", p.tenantId).eq("id", p.id);
  if (error) throw new Error(`cannot record that the notice was mailed: ${error.message}`);
}
async function noticeKept(db, p) {
  const { data, error } = await db.from("notifications").select("id").eq("tenant_id", p.tenantId).eq("kind", p.kind).eq("subject_type", p.subjectType).eq("subject_id", p.subjectId).limit(1);
  if (error) throw new Error(`cannot read what the workspace was told: ${error.message}`);
  return (data ?? []).length > 0;
}
var ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function reviewsNamed(db, tenantId, ids) {
  if (!ids.length) return [];
  const rowIds = ids.filter((id) => ROW_ID.test(id));
  const read = (column, values) => db.from("google_reviews").select("id, review_id, reply_text").eq("tenant_id", tenantId).in(column, [...values]);
  const [byRow, byGoogle] = await Promise.all([
    rowIds.length ? read("id", rowIds) : Promise.resolve({ data: [], error: null }),
    read("review_id", ids)
  ]);
  const error = byRow.error ?? byGoogle.error;
  if (error) throw new Error(`cannot read the reviews the notices name: ${error.message}`);
  const seen = /* @__PURE__ */ new Map();
  for (const r of [...byRow.data ?? [], ...byGoogle.data ?? []])
    seen.set(r.id, { id: r.id, reviewId: r.review_id, replied: !!r.reply_text?.trim() });
  return [...seen.values()];
}
async function reviewRowsByGoogleId(db, tenantId, googleIds) {
  if (!googleIds.length) return /* @__PURE__ */ new Map();
  const { data, error } = await db.from("google_reviews").select("id, review_id").eq("tenant_id", tenantId).in("review_id", [...googleIds]);
  if (error) throw new Error(`cannot read the reviews on record: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.review_id, r.id]));
}
var oneOr = (r, what) => {
  if (r.error) throw new Error(`cannot read ${what}: ${r.error.message}`);
  return r.data?.[0] ?? null;
};
async function holdFactsOf(db, tenantId, ref, nowMs) {
  const holds = db.from("escalations").select("id, conversation_id, reason, details").eq("tenant_id", tenantId).eq("state", "open");
  const hold = oneOr(
    await ("conversationId" in ref ? holds.eq("conversation_id", ref.conversationId) : holds.eq("id", ref.escalationId)).limit(1),
    "the hold"
  );
  if (!hold) return null;
  const thread = oneOr(
    await db.from("conversations").select("contact_id, paused_until").eq("tenant_id", tenantId).eq("id", hold.conversation_id).limit(1),
    "the thread"
  );
  if (!thread) return null;
  const person = oneOr(
    await db.from("contacts").select("display_name, wa_profile_name, phone_e164, email, erased_at, erasing_since").eq("tenant_id", tenantId).eq("id", thread.contact_id).limit(1),
    "the person"
  );
  const theirs = oneOr(
    await db.from("messages").select("body, channel, created_at").eq("tenant_id", tenantId).eq("conversation_id", hold.conversation_id).eq("direction", "inbound").eq("sender", "customer").order("created_at", { ascending: false }).limit(1),
    "their words"
  );
  const reply = theirs ? oneOr(
    await db.from("messages").select("body").eq("tenant_id", tenantId).eq("conversation_id", hold.conversation_id).eq("direction", "outbound").eq("sender", "ai").in("status", DELIVERED).gte("created_at", theirs.created_at).order("created_at", { ascending: false }).limit(1),
    "the receptionist's reply"
  ) : null;
  const pausedMs = thread.paused_until ? Date.parse(thread.paused_until) - nowMs : 0;
  return {
    conversationId: hold.conversation_id,
    reason: hold.reason,
    details: hold.details,
    who: person?.display_name ?? person?.wa_profile_name ?? null,
    address: person?.phone_e164 ?? person?.email ?? null,
    channel: theirs?.channel ?? null,
    customerWords: theirs?.body ?? null,
    replyWords: reply?.body ?? null,
    pausedHours: pausedMs > 0 ? Math.max(1, Math.round(pausedMs / HOUR_MS2)) : null,
    erased: !person || !!person.erased_at || !!person.erasing_since
  };
}
async function holdTold(db, p) {
  const answered = await db.from("notifications").select("id").eq("tenant_id", p.tenantId).eq("source_event", p.eventId).is("mail_due_at", null).limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  if ((answered.data ?? []).length) return true;
  const since = new Date(Date.parse(p.at) - MIN_MS).toISOString();
  const inline = await db.from("notifications").select("id").eq("tenant_id", p.tenantId).eq("kind", "handoff").eq("subject_type", "conversation").eq("subject_id", p.conversationId).is("source_event", null).gte("created_at", since).limit(1);
  if (inline.error) throw new Error(`cannot read what the workspace was told: ${inline.error.message}`);
  return (inline.data ?? []).length > 0;
}
async function personFactsOf(db, tenantId, contactId) {
  const person = oneOr(
    await db.from("contacts").select("display_name, wa_profile_name, phone_e164, email, erased_at, erasing_since").eq("tenant_id", tenantId).eq("id", contactId).limit(1),
    "the person"
  );
  if (!person) return null;
  return {
    who: person.display_name ?? person.wa_profile_name ?? null,
    address: person.phone_e164 ?? person.email ?? null,
    erased: !!person.erased_at || !!person.erasing_since
  };
}
async function optOutTold(db, p) {
  const answered = await db.from("notifications").select("id").eq("tenant_id", p.tenantId).eq("source_event", p.eventId).is("mail_due_at", null).limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  if ((answered.data ?? []).length) return true;
  const since = new Date(Date.parse(p.at) - MIN_MS).toISOString();
  const twin = await db.from("notifications").select("id").eq("tenant_id", p.tenantId).eq("kind", "opted_out").eq("subject_type", "contact").eq("subject_id", p.contactId).neq("source_event", p.eventId).gte("created_at", since).limit(1);
  if (twin.error) throw new Error(`cannot read what the workspace was told: ${twin.error.message}`);
  return (twin.data ?? []).length > 0;
}
async function eventTold(db, p) {
  const answered = await db.from("notifications").select("id").eq("tenant_id", p.tenantId).eq("source_event", p.eventId).is("mail_due_at", null).limit(1);
  if (answered.error) throw new Error(`cannot read what the workspace was told: ${answered.error.message}`);
  return (answered.data ?? []).length > 0;
}
var BOOKING_SOURCES = ["booking_email", "booking_tool", "calendar_feed"];
async function bookedVisitsOf(db, tenantId, ids, nowMs, status = "booked") {
  if (ids.length === 0) return [];
  const { data, error } = await db.from("appointments").select("id, starts_at, ends_at, all_day, timezone, source, client_name, service, contact_id").eq("tenant_id", tenantId).in("id", [...ids]).eq("status", status).is("vanished_at", null).in("source", [...BOOKING_SOURCES]).gt("starts_at", new Date(nowMs).toISOString());
  if (error) throw new Error(`cannot read the visits: ${error.message}`);
  const visits = (data ?? []).filter((v) => v.source !== "calendar_feed" || v.contact_id);
  const personIds = [...new Set(visits.flatMap((v) => v.contact_id ? [v.contact_id] : []))];
  const people = /* @__PURE__ */ new Map();
  if (personIds.length) {
    const found = await db.from("contacts").select("id, display_name, wa_profile_name, erased_at, erasing_since").eq("tenant_id", tenantId).in("id", personIds);
    if (found.error) throw new Error(`cannot read the people of the visits: ${found.error.message}`);
    for (const c of found.data ?? [])
      people.set(c.id, {
        name: c.display_name ?? c.wa_profile_name ?? null,
        erased: !!c.erased_at || !!c.erasing_since
      });
  }
  return visits.map((v) => {
    const person = v.contact_id ? people.get(v.contact_id) : void 0;
    const who = person?.erased ? null : v.client_name?.trim() || person?.name || null;
    return {
      id: v.id,
      start: v.starts_at,
      end: v.ends_at,
      allDay: v.all_day,
      timezone: v.timezone,
      who,
      service: v.service?.trim() || null,
      via: v.source
    };
  });
}
async function feedAdditionsWith(db, tenantId, event) {
  const { data, error } = await db.from("events").select("id, subject_id, data").eq("tenant_id", tenantId).eq("kind", "appointment.changed").eq("created_at", event.at).eq("data->>source", "calendar_feed").eq("data->>change", "added").order("id").limit(CATCH_UP_VISITS + 1);
  if (error) throw new Error(`cannot read the calendar's additions: ${error.message}`);
  return (data ?? []).flatMap(
    (e) => e.subject_id ? [{ eventId: e.id, appointmentId: e.subject_id, data: e.data }] : []
  );
}
var BOOKING_ROWS = ["booking_email", "booking_tool"];
async function twinTold(db, tenantId, appointmentId) {
  const visit = oneOr(
    await db.from("appointments").select("source, contact_id, starts_at").eq("tenant_id", tenantId).eq("id", appointmentId).limit(1),
    "the visit"
  );
  if (!visit?.contact_id) return false;
  const others = visit.source === "calendar_feed" ? BOOKING_ROWS : ["calendar_feed"];
  const at = Date.parse(visit.starts_at);
  const sightings = await db.from("appointments").select("id, contact_id, starts_at, status, vanished_at").eq("tenant_id", tenantId).in("source", [...others]).eq("contact_id", visit.contact_id).gte("starts_at", new Date(at - SAME_VISIT_MS).toISOString()).lte("starts_at", new Date(at + SAME_VISIT_MS).toISOString());
  if (sightings.error) throw new Error(`cannot read the visit's other sightings: ${sightings.error.message}`);
  const ids = (sightings.data ?? []).filter((c) => sightingStands(c) && sameVisitOnRecord(visit, c)).map((c) => c.id);
  if (!ids.length) return false;
  const arrived = await db.from("events").select("id, data").eq("tenant_id", tenantId).eq("kind", "appointment.changed").in("subject_id", ids);
  if (arrived.error) throw new Error(`cannot read how the visit arrived: ${arrived.error.message}`);
  const events = (arrived.data ?? []).flatMap((e) => {
    const change = e.data && typeof e.data === "object" && !Array.isArray(e.data) ? e.data.change : null;
    return change === "added" || change === "confirmed" ? [e.id] : [];
  });
  if (!events.length) return false;
  const told = await db.from("notifications").select("id").eq("tenant_id", tenantId).in("source_event", events).limit(1);
  if (told.error) throw new Error(`cannot read what the workspace was told: ${told.error.message}`);
  return (told.data ?? []).length > 0;
}
async function memberJoinedOf(db, tenantId, invitationId) {
  const invite = oneOr(
    await db.from("invitations").select("id, email, role").eq("tenant_id", tenantId).eq("id", invitationId).limit(1),
    "the invitation"
  );
  return invite ? { invitationId: invite.id, email: invite.email, role: invite.role } : null;
}
async function memberEmailOf(db, userId) {
  const who = await db.auth.admin.getUserById(userId);
  if (who.error) {
    if (who.error.status === 404) return null;
    throw new Error(`cannot read who left: ${who.error.message}`);
  }
  return who.data.user?.email ?? null;
}
var BELL_READ_PAGE = 1e3;
var BELL_IN_BATCH = 100;
async function unreadOfReaders(db, p) {
  const { rows, seen, marks } = await bellRowsOf(db, p);
  const out = /* @__PURE__ */ new Map();
  for (const u of p.readers) out.set(u, unreadForReader(rows, seen, marks, u).length);
  return out;
}
async function olderUnreadFor(db, p) {
  const { rows, seen, marks } = await bellRowsOf(db, { ...p, readers: [p.reader] });
  const mine = unreadForReader(rows, seen, marks, p.reader);
  const holdThreads = mine.filter((r) => p.holdKinds.includes(r.kind) && r.subject_type === "conversation" && r.subject_id).map((r) => r.subject_id);
  return { unread: mine.length, holdThreads: [...new Set(holdThreads)] };
}
function unreadForReader(rows, seen, marks, reader) {
  const seenAt = seen.find((s) => s.user_id === reader)?.seen_at ?? null;
  const own = marks.filter((m) => m.user_id === reader);
  return rows.filter((r) => isForReader(r, reader) && unreadFor([r], seenAt, own) === 1);
}
async function bellRowsOf(db, p) {
  const rows = [];
  for (let from = 0; ; from += BELL_READ_PAGE) {
    let q = db.from("notifications").select("id, created_at, recipient_user_id, closed_at, kind, subject_type, subject_id").eq("tenant_id", p.tenantId).gte("created_at", p.fromIso);
    if (p.throughIso) q = q.lte("created_at", p.throughIso);
    const page = await q.order("created_at", { ascending: true }).range(from, from + BELL_READ_PAGE - 1);
    if (page.error) throw new Error(`cannot read the bell: ${page.error.message}`);
    rows.push(...(page.data ?? []).filter((r) => !p.leaving?.has(r.id)));
    if ((page.data ?? []).length < BELL_READ_PAGE) break;
  }
  const seen = await db.from("notification_reads").select("user_id, seen_at").eq("tenant_id", p.tenantId).in("user_id", [...p.readers]);
  if (seen.error) throw new Error(`cannot read when the bell was opened: ${seen.error.message}`);
  const batches = [];
  for (let i = 0; i < rows.length; i += BELL_IN_BATCH) batches.push(rows.slice(i, i + BELL_IN_BATCH).map((r) => r.id));
  const reads = await Promise.all(
    batches.map(
      (ids) => db.from("notification_marks").select("notification_id, user_id, read_at, dismissed_at").in("user_id", [...p.readers]).in("notification_id", ids)
    )
  );
  const marks = [];
  for (const r of reads) {
    if (r.error) throw new Error(`cannot read the bell's marks: ${r.error.message}`);
    marks.push(...r.data ?? []);
  }
  return { rows, seen: seen.data ?? [], marks };
}
var bellWindowFrom = (nowMs) => new Date(nowMs - BELL_WINDOW_DAYS * DAY_MS2).toISOString();
async function closeMendedNotices(db, p) {
  let closed = 0;
  for (const w of p.warnings) {
    if (w.sameSubject && !p.subject) continue;
    let q = db.from("notifications").select("id, title").eq("tenant_id", p.tenantId).eq("kind", w.kind).is("closed_at", null).gte("created_at", bellWindowFrom(p.nowMs));
    if (w.sameSubject && p.subject) q = q.eq("subject_type", p.subject.type).eq("subject_id", p.subject.id);
    const found = await q;
    if (found.error) throw new Error(`cannot read the warnings a mend closes: ${found.error.message}`);
    const ids = (found.data ?? []).filter((r) => r.id !== p.keptId && w.title.test(r.title)).map((r) => r.id);
    if (!ids.length) continue;
    const up = await db.from("notifications").update({ closed_at: new Date(p.nowMs).toISOString() }).eq("tenant_id", p.tenantId).in("id", ids).is("closed_at", null).select("id");
    if (up.error) throw new Error(`cannot close the mended warnings: ${up.error.message}`);
    closed += (up.data ?? []).length;
  }
  return closed;
}

// src/repositories/notices/member-alerts.ts
async function activityTokensOf(db, tenantId, roles) {
  const { data: members, error: me } = await db.from("memberships").select("user_id, push_off").eq("tenant_id", tenantId).in("role", [...roles]);
  if (me) throw new Error(`cannot read who is in the workspace: ${me.message}`);
  const people = (members ?? []).filter((m) => !(m.push_off ?? []).includes("call")).map((m) => m.user_id);
  if (!people.length) return [];
  const { data: devices, error: de } = await db.from("push_devices").select("activity_token").in("user_id", people).not("activity_token", "is", null);
  if (de) throw new Error(`cannot read the phones: ${de.message}`);
  return [...new Set((devices ?? []).map((d) => d.activity_token).filter((t) => !!t))];
}
async function forgetEveryPhone(db) {
  const { data, error } = await db.rpc("push_devices_forget_all");
  if (error) {
    if (error.code === "PGRST202") return null;
    throw new Error(`cannot forget the phones: ${error.message}`);
  }
  const forgotten = data?.forgotten;
  return typeof forgotten === "number" ? forgotten : 0;
}
async function forgetActivityTokens(db, tokens) {
  if (!tokens.length) return;
  const { error } = await db.from("push_devices").update({ activity_token: null }).in("activity_token", [...tokens]);
  if (error) throw new Error(`cannot forget the gone activity tokens: ${error.message}`);
}
var UNDEFINED_COLUMN = "42703";
async function memberAlertsOf(db, p) {
  const [mine, phones] = await Promise.all([
    db.from("memberships").select("push_off").eq("tenant_id", p.tenantId).eq("user_id", p.userId).maybeSingle(),
    db.from("push_devices").select("platform, app_version, last_seen_at").eq("user_id", p.userId).order("last_seen_at", { ascending: false, nullsFirst: false })
  ]);
  if (phones.error) throw new Error(`cannot read your phones: ${phones.error.message}`);
  if (mine.error && mine.error.code !== UNDEFINED_COLUMN)
    throw new Error(`cannot read your alert choices: ${mine.error.message}`);
  return {
    pushOff: mine.error ? [] : mine.data?.push_off ?? [],
    phones: (phones.data ?? []).map((d) => ({
      platform: d.platform,
      app_version: d.app_version,
      last_seen_at: d.last_seen_at
    })),
    choosable: !mine.error
  };
}
async function setMemberPushOff(db, p) {
  const { data, error } = await db.rpc("member_push_off_set", { p_tenant_id: p.tenantId, p_kinds: [...p.kinds] });
  if (error) throw error;
  return data ?? [];
}
async function membersPushedFor(db, p) {
  if (p.userIds && !p.userIds.length) return [];
  const ids = p.userIds ? [...p.userIds] : null;
  const chosen = ids ? await db.from("memberships").select("user_id, push_off").eq("tenant_id", p.tenantId).in("user_id", ids) : await db.from("memberships").select("user_id, push_off").eq("tenant_id", p.tenantId);
  if (!chosen.error)
    return (chosen.data ?? []).filter((m) => !(m.push_off ?? []).includes(p.kind)).map((m) => m.user_id);
  if (chosen.error.code !== UNDEFINED_COLUMN)
    throw new Error(`cannot read who is in the workspace: ${chosen.error.message}`);
  if (ids) return ids;
  const all2 = await db.from("memberships").select("user_id").eq("tenant_id", p.tenantId);
  if (all2.error) throw new Error(`cannot read who is in the workspace: ${all2.error.message}`);
  return (all2.data ?? []).map((m) => m.user_id);
}
async function pushNamesFor(db, p) {
  if (!p.userIds.length) return { inMany: /* @__PURE__ */ new Set(), business: null };
  const [members, tenant] = await Promise.all([
    db.from("memberships").select("user_id, tenant_id").in("user_id", [...p.userIds]),
    db.from("tenants").select("name").eq("id", p.tenantId).maybeSingle()
  ]);
  if (members.error) throw new Error(`cannot read whose workspaces these are: ${members.error.message}`);
  if (tenant.error) throw new Error(`cannot read the workspace's name: ${tenant.error.message}`);
  const workspaces = /* @__PURE__ */ new Map();
  for (const m of members.data ?? []) {
    const own = workspaces.get(m.user_id) ?? /* @__PURE__ */ new Set();
    own.add(m.tenant_id);
    workspaces.set(m.user_id, own);
  }
  return {
    inMany: new Set([...workspaces].filter(([, own]) => own.size > 1).map(([user]) => user)),
    business: tenant.data?.name?.trim() || null
  };
}
async function memberViewsOf(db, p) {
  const { data, error } = await db.from("memberships").select("views").eq("tenant_id", p.tenantId).eq("user_id", p.userId).maybeSingle();
  if (error) throw new Error(error.message);
  const views = data?.views;
  return views && typeof views === "object" && !Array.isArray(views) ? views : {};
}
async function setMemberView(db, p) {
  const { error } = await db.rpc("member_view_set", { p_tenant_id: p.tenantId, p_page: p.page, p_view: p.view });
  if (error) throw new Error(error.message);
}
async function ownAddressIn(db, p) {
  const { data, error } = await db.from("memberships").select("user_id").eq("tenant_id", p.tenantId).eq("user_id", p.userId).maybeSingle();
  if (error) throw new Error(`cannot read who is in the workspace: ${error.message}`);
  return data ? memberEmailOf(db, p.userId) : null;
}

// src/repositories/campaigns/workspace.ts
async function workspacePaused(db, tenantId) {
  const { data, error } = await db.from("tenants").select("status").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the workspace: ${error.message}`);
  return data?.status === "paused";
}
async function reviewLinkOf(db, tenantId) {
  const { data, error } = await db.from("google_listings").select("new_review_uri").eq("tenant_id", tenantId).maybeSingle();
  if (error && error.code === "42703" && error.message.includes("new_review_uri")) return null;
  if (error) throw new Error(`cannot read the workspace's review link: ${error.message}`);
  return data?.new_review_uri?.trim() || null;
}

// src/repositories/campaigns/calendar-runs.ts
import { DAY_MS as DAY_MS3 } from "../../contracts/dist/index.js";
var RUN_COLUMNS = "id, name, state, scheduled_for, started_at, finished_at, run_for, playbook_id:step_id, audience, recipient_count";
var SEND_LEAD_MS = 2 * DAY_MS3;
async function runsInSpan(db, tenantId, span) {
  const sendsFrom = new Date(Date.parse(span.fromIso) - SEND_LEAD_MS).toISOString();
  const [runs, sends] = await Promise.all([
    readAllRows(
      "calendar_runs_campaign",
      (from, to) => db.from("sequence_batches").select(RUN_COLUMNS).eq("tenant_id", tenantId).not("step_id", "is", null).gte("run_for", span.fromDay).lte("run_for", span.toDay).order("run_for", { ascending: true }).order("id", { ascending: true }).range(from, to)
    ),
    readAllRows(
      "calendar_runs_send",
      (from, to) => db.from("sequence_batches").select(RUN_COLUMNS).eq("tenant_id", tenantId).is("step_id", null).gte("scheduled_for", sendsFrom).lt("scheduled_for", span.toIso).order("scheduled_for", { ascending: true }).order("id", { ascending: true }).range(from, to)
    )
  ]);
  return [...runs, ...sends];
}
async function momentSchedules(db, tenantId) {
  return readAllRows(
    "calendar_moment_schedules",
    (from, to) => db.from("sequence_steps").select("id, name, trigger, state, policy_class, run_hour, last_run_for, until, trial_until").eq("tenant_id", tenantId).order("id", { ascending: true }).range(from, to)
  );
}

// src/repositories/campaigns/sequences.ts
import { CONSENT_CHANNELS, isLeadList as isLeadList2 } from "../../contracts/dist/index.js";
async function followUpsDue(db, stepId, runFor) {
  const { data, error } = await db.rpc("sequence_follow_ups_due", { p_step_id: stepId, p_run_for: runFor });
  if (error) throw new Error(`cannot read who the step is due to: ${error.message}`);
  return (data ?? []).flatMap(
    (r) => r.enrollment_id && r.contact_id ? [{ enrollment_id: r.enrollment_id, contact_id: r.contact_id, sent_at: r.sent_at ?? null }] : []
  );
}
async function leaveSequence(db, p) {
  if (p.enrollmentIds.length === 0) return 0;
  const { data, error } = await db.rpc("sequence_enrollments_leave", {
    p_tenant_id: p.tenantId,
    p_ids: [...p.enrollmentIds],
    p_why: p.why,
    ...p.by ? { p_by: p.by } : {}
  });
  if (error) throw new Error(`cannot take them out of the sequence: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
async function sequencesOfPerson(db, tenantId, contactId) {
  const { data, error } = await db.from("sequence_enrollments").select("sequence_id, place, next_at").eq("tenant_id", tenantId).eq("contact_id", contactId).eq("state", "in").order("next_at", { ascending: true, nullsFirst: false }).limit(20);
  if (error) throw new Error(`cannot read the sequences they are in: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const names = await db.from("sequences").select("id, name").in(
    "id",
    rows.map((r) => r.sequence_id)
  );
  if (names.error) throw new Error(`cannot read the sequences they are in: ${names.error.message}`);
  const nameOf = new Map((names.data ?? []).map((q) => [q.id, q.name]));
  return rows.flatMap((r) => {
    const name = nameOf.get(r.sequence_id);
    return name ? [{ id: r.sequence_id, name, place: r.place, next_at: r.next_at }] : [];
  });
}
async function sequenceRow(db, id) {
  const own = await sequenceById(db, id);
  if (own) return own;
  const [step, batch] = await Promise.all([
    db.from("sequence_steps").select("sequence_id").eq("id", id).maybeSingle(),
    db.from("sequence_batches").select("sequence_id").eq("id", id).maybeSingle()
  ]);
  if (step.error) throw new Error(`cannot read the sequence's step: ${step.error.message}`);
  if (batch.error) throw new Error(`cannot read the sequence's batch: ${batch.error.message}`);
  const of = step.data?.sequence_id ?? batch.data?.sequence_id ?? null;
  return of ? sequenceById(db, of) : null;
}
async function sequenceById(db, id) {
  const { data, error } = await db.from("sequences").select("id, tenant_id, name, starts, state").eq("id", id).maybeSingle();
  if (error) throw new Error(`cannot read the sequence: ${error.message}`);
  return data;
}
function readerRowsOf(data) {
  return Array.isArray(data) ? data.filter((r) => typeof r === "object" && r !== null) : [];
}
async function sequenceOverview(db, tenantId, sequenceId) {
  const { data, error } = await db.rpc("sequence_overview", {
    p_tenant_id: tenantId,
    ...sequenceId ? { p_sequence_id: sequenceId } : {}
  });
  if (error) throw new Error(`cannot read the sequences: ${error.message}`);
  return readerRowsOf(data);
}
async function sequenceOfPart(db, tenantId, id) {
  const [batch, step] = await Promise.all([
    db.from("sequence_batches").select("sequence_id").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    db.from("sequence_steps").select("sequence_id").eq("tenant_id", tenantId).eq("id", id).maybeSingle()
  ]);
  if (batch.error) throw new Error(`cannot read the batch's sequence: ${batch.error.message}`);
  if (step.error) throw new Error(`cannot read the step's sequence: ${step.error.message}`);
  const of = (r) => {
    const v = r && typeof r === "object" ? r.sequence_id : null;
    return typeof v === "string" ? v : null;
  };
  return of(batch.data) ?? of(step.data);
}
async function stepLastRunFor(db, tenantId, stepId) {
  const { data, error } = await db.from("sequence_steps").select("last_run_for").eq("tenant_id", tenantId).eq("id", stepId).maybeSingle();
  if (error) throw new Error(`cannot read when the step last ran: ${error.message}`);
  return data?.last_run_for ?? null;
}
async function oneOffMessageOf(db, tenantId, batchId) {
  const [batch, ...by] = await Promise.all([
    db.from("sequence_batches").select("template_name, template_language, params").eq("tenant_id", tenantId).eq("id", batchId).maybeSingle(),
    ...CONSENT_CHANNELS.map(
      (channel) => db.from("sequence_sends").select("id").eq("tenant_id", tenantId).eq("batch_id", batchId).is("lead_id", null).eq("channel", channel).neq("state", "skipped").limit(1)
    )
  ]);
  if (batch.error) throw new Error(`cannot read the one-off's message: ${batch.error.message}`);
  const failed = by.find((r) => r.error);
  if (failed?.error) throw new Error(`cannot read how the one-off goes: ${failed.error.message}`);
  if (!batch.data) return null;
  return {
    template_name: batch.data.template_name,
    template_language: batch.data.template_language,
    params: batch.data.params,
    channels: CONSENT_CHANNELS.filter((_, i) => (by[i]?.data ?? []).length > 0)
  };
}
async function leadsFedBy(db, tenantId, searchId) {
  const { data, error } = await db.from("lead_searches").select("via").eq("tenant_id", tenantId).eq("id", searchId).maybeSingle();
  if (error) throw new Error(`cannot read what the sequence writes to: ${error.message}`);
  return isLeadList2(data) ? "list" : "search";
}
async function runningStepsOn(db, tenantId, triggers) {
  if (triggers.length === 0) return [];
  const { data, error } = await db.from("sequence_steps").select("id, name, trigger").eq("tenant_id", tenantId).eq("state", "running").in("trigger", [...triggers]);
  if (error) throw new Error(`cannot read what runs at this moment: ${error.message}`);
  return data ?? [];
}
async function sequenceNamesOf(db, tenantId) {
  const { data, error } = await db.from("sequences").select("id, name").eq("tenant_id", tenantId);
  if (error) throw new Error(`cannot read the sequences' names: ${error.message}`);
  return data ?? [];
}
async function sequenceStepsOf(db, tenantId, sequenceId) {
  const { data, error } = await db.rpc("sequence_steps_of", { p_tenant_id: tenantId, p_sequence_id: sequenceId });
  if (error) throw new Error(`cannot read the sequence's steps: ${error.message}`);
  return readerRowsOf(data);
}
var REPLIES_IN_CHUNK = 200;
async function leadRepliesOfBatches(db, tenantId, batchIds) {
  const out = /* @__PURE__ */ new Set();
  for (let i = 0; i < batchIds.length; i += REPLIES_IN_CHUNK) {
    const chunk = batchIds.slice(i, i + REPLIES_IN_CHUNK);
    const sends = await db.from("sequence_sends").select("id").eq("tenant_id", tenantId).not("lead_id", "is", null).in("batch_id", [...chunk]);
    if (sends.error) throw new Error(`cannot read the batches' emails: ${sends.error.message}`);
    const ids = (sends.data ?? []).map((s) => s.id);
    for (let j = 0; j < ids.length; j += REPLIES_IN_CHUNK) {
      const replies = await db.from("sequence_replies").select("conversation_id").eq("tenant_id", tenantId).in("send_id", ids.slice(j, j + REPLIES_IN_CHUNK)).in("claim", ["person", "owner"]).is("undone_at", null);
      if (replies.error) throw new Error(`cannot read the replies: ${replies.error.message}`);
      for (const r of replies.data ?? []) out.add(r.conversation_id);
    }
  }
  return [...out];
}
async function sequencePeopleOf(db, p) {
  const { data, error } = await db.rpc("sequence_people", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    ...p.limit ? { p_limit: p.limit } : {}
  });
  if (error) throw new Error(`cannot read who is in the sequence: ${error.message}`);
  const got = data ?? {};
  return { counts: got.counts ?? {}, rows: Array.isArray(got.rows) ? got.rows : [] };
}
async function sequenceHistoryOf(db, p) {
  const { data, error } = await db.rpc("sequence_history", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    ...p.before ? { p_before: p.before } : {},
    ...p.limit ? { p_limit: p.limit } : {}
  });
  if (error) throw new Error(`cannot read what the sequence sent: ${error.message}`);
  const got = data ?? {};
  return { batches: Array.isArray(got.batches) ? got.batches : [], more: got.more === true };
}
var decided = (d) => ({
  ...d.decision !== void 0 ? { p_decision: d.decision } : {},
  ...d.via ? { p_via: d.via } : {},
  ...d.undoOf ? { p_undo_of: d.undoOf } : {}
});
async function saveSequenceStep(db, p) {
  const { data, error } = await db.rpc("sequence_step_save", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    p_step: p.step,
    ...decided(p)
  });
  return answer(data, error);
}
async function removeSequenceStep(db, p) {
  const { data, error } = await db.rpc("sequence_step_remove", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    ...decided(p)
  });
  return answer(data, error);
}
async function setSequenceStepWords(db, p) {
  const { data, error } = await db.rpc("sequence_step_words", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_template_id: p.templateId,
    ...p.params !== void 0 ? { p_params: p.params } : {},
    ...decided(p)
  });
  return answer(data, error);
}
async function takeOutOfSequence(db, p) {
  const { data, error } = await db.rpc("sequence_leave", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    p_enrollment_ids: [...p.enrollmentIds],
    ...p.why ? { p_why: p.why } : {},
    ...decided(p)
  });
  return answer(data, error);
}
async function putBackInSequence(db, p) {
  const { data, error } = await db.rpc("sequence_return", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    ...decided(p)
  });
  return answer(data, error);
}
async function makeSequence(db, p) {
  const { data, error } = await db.rpc("sequence_create", {
    p_tenant_id: p.tenantId,
    p_first: p.first,
    p_then: p.then,
    p_start: p.start,
    ...decided(p)
  });
  return answer(data, error);
}
async function discardSequence(db, p) {
  const { data, error } = await db.rpc("sequence_discard", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    ...decided(p)
  });
  return answer(data, error);
}
async function cancelSequenceBatch(db, p) {
  const { data, error } = await db.rpc("sequence_batch_cancel", {
    p_tenant_id: p.tenantId,
    p_batch_id: p.batchId,
    p_from: p.from
  });
  if (error) throw new Error(`cannot cancel the batch: ${error.message}`);
  return data === true;
}

// src/repositories/routing.ts
import { MIN_MS as MIN_MS2 } from "../../contracts/dist/index.js";
var POS_TTL_MS = 5 * MIN_MS2;
var NEG_TTL_MS = MIN_MS2;
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
  const routed = data && data.status === "active" ? routedOf(data) : null;
  cache.set(key, { v: routed, exp: Date.now() + (routed ? POS_TTL_MS : NEG_TTL_MS) });
  return { channel: routed, lookupFailed: false };
}
var ROUTED_COLUMNS = "id, tenant_id, kind, number_e164, credentials_ref, config, external_id";
function routedOf(row) {
  return {
    channelId: row.id,
    tenantId: row.tenant_id,
    kind: row.kind,
    externalId: row.external_id,
    numberE164: row.number_e164,
    credentialsRef: row.credentials_ref,
    config: row.config
  };
}
async function oldestActiveChannel(db, tenantId, kind) {
  const { data, error } = await db.from("tenant_channels").select(ROUTED_COLUMNS).eq("tenant_id", tenantId).eq("kind", kind).eq("status", "active").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(`cannot read the workspace's ${kind} channel: ${error.message}`);
  return data ? routedOf(data) : null;
}
async function resolveChannel(db, kind, externalId) {
  return (await resolveChannelDetailed(db, kind, externalId)).channel;
}
async function activeWhatsappNumbers(db, tenantId) {
  const { data, error } = await db.from("tenant_channels").select("id, credentials_ref, external_id").eq("tenant_id", tenantId).eq("kind", "whatsapp").eq("status", "active").order("created_at", { ascending: true });
  if (error) throw new Error(`cannot read the workspace's WhatsApp numbers: ${error.message}`);
  return data ?? [];
}
async function whatsappLineOf(db, tenantId, conversationId) {
  const { data, error } = await db.from("messages").select("meta").eq("tenant_id", tenantId).eq("conversation_id", conversationId).eq("channel", "whatsapp").eq("direction", "inbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`cannot read the WhatsApp number this thread was written to: ${error.message}`);
  const meta = data?.meta;
  const line = meta && typeof meta === "object" && !Array.isArray(meta) ? meta.line : null;
  return typeof line === "string" && line ? line : null;
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
  for (let i = 0; i < ids.length; i += IDS_PER_READ2) {
    const { data, error } = await db.from("calls").select("id, from_e164, from_raw").eq("tenant_id", tenantId).in("id", ids.slice(i, i + IDS_PER_READ2));
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
async function callsOwedAnAnalysis(db, p) {
  const { data, error } = await db.from("calls").select("id, tenant_id, retell_call_id").in("status", ["ended", "error"]).is("notified_at", null).not("conversation_id", "is", null).gte("duration_ms", p.minMs).lt("ended_at", new Date(p.nowMs - p.fromMs).toISOString()).gt("ended_at", new Date(p.nowMs - p.toMs).toISOString()).or("summary.is.null,outcome.eq.callback_needed").order("ended_at", { ascending: true }).limit(p.limit);
  if (error) throw new Error(`cannot read the calls owed an analysis: ${error.message}`);
  return data ?? [];
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
  const { data, error } = await db.from("jobs").select("id, kind, state, payload, created_at, spoke_at").eq("id", jobId).eq("tenant_id", tenantId).maybeSingle();
  if (error && NO_SUCH_COLUMN.has(error.code)) {
    const older = await db.from("jobs").select("id, kind, state, payload, created_at").eq("id", jobId).eq("tenant_id", tenantId).maybeSingle();
    if (older.error) throw new Error(`read_job: ${older.error.message}`);
    return older.data ? { ...older.data, spoke_at: null } : null;
  }
  if (error) throw new Error(`read_job: ${error.message}`);
  return data;
}
async function hasNewerCopy(db, tenantId, job) {
  const { data, error } = await db.from("jobs").select("id").eq("tenant_id", tenantId).eq("kind", job.kind).filter("payload", "eq", JSON.stringify(job.payload)).neq("state", "failed").gt("created_at", job.created_at).limit(1);
  if (error) throw new Error(`read_job_copies: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function assembleBroadcast(db, args) {
  const { decision } = args;
  const { data, error } = await db.rpc("assemble_broadcast", {
    p_tenant: args.tenantId,
    p_run: args.run,
    p_recipients: args.recipients,
    p_decision: decision?.payload ?? null,
    ...args.sendAt ? { p_send_at: args.sendAt.toISOString() } : {},
    ...decision?.actor ? { p_actor: decision.actor } : {},
    ...decision?.via ? { p_via: decision.via } : {},
    ...decision?.undoOf ? { p_undo_of: decision.undoOf } : {}
  });
  if (error) throw new Error(error.message);
  if (data === null || typeof data !== "object" || Array.isArray(data) || typeof data.id !== "string")
    throw new Error("broadcast not created");
  const decisionId = typeof data.decision_id === "string" ? data.decision_id : null;
  if (decision && decisionId === null) throw new Error("assemble_broadcast: the door answered without its decision");
  return { id: data.id, decisionId, undoDropped: data.undo_dropped === true };
}
var NO_SUCH_COLUMN = /* @__PURE__ */ new Set(["PGRST204", "42703"]);
async function claimQueuedSend(db, tenantId, messageId) {
  const { data, error } = await db.from("messages").update({ sending_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", messageId).eq("tenant_id", tenantId).eq("status", "queued").is("sending_at", null).select("id");
  if (error && NO_SUCH_COLUMN.has(error.code)) return true;
  if (error) throw new Error(`claim_queued_send: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
async function releaseQueuedSend(db, tenantId, messageId) {
  const { error } = await db.from("messages").update({ sending_at: null }).eq("id", messageId).eq("tenant_id", tenantId).eq("status", "queued");
  if (error && !NO_SUCH_COLUMN.has(error.code)) throw new Error(`release_queued_send: ${error.message}`);
}
async function approveBroadcast(db, args) {
  const { data, error } = await db.rpc("approve_broadcast", {
    p_tenant_id: args.tenantId,
    p_broadcast_id: args.broadcastId,
    p_send_at: args.sendAt.toISOString(),
    p_job: args.job,
    p_decision: args.decision,
    ...args.via ? { p_via: args.via } : {},
    ...args.undoOf ? { p_undo_of: args.undoOf } : {}
  });
  if (error) throw new Error(`approve_broadcast: ${error.message}`);
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const id = data.decision_id;
  if (typeof id !== "string") throw new Error("approve_broadcast: the door answered without its decision");
  return { decisionId: id, undoDropped: data.undo_dropped === true };
}
async function failQueuedSend(db, p) {
  const { data, error } = await db.from("messages").update({ status: "failed", error: p.error }).eq("id", p.messageId).eq("tenant_id", p.tenantId).eq("status", "queued").select("conversation_id, sender, channel, meta");
  if (error) return { row: null, error: error.message };
  const row = data?.[0];
  if (!row) return { row: null, error: null };
  const meta = row.meta !== null && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : null;
  const email = meta?.email;
  const request = email !== null && typeof email === "object" && !Array.isArray(email) ? email.request : void 0;
  return {
    row: {
      conversation_id: row.conversation_id,
      sender: row.sender,
      channel: row.channel,
      meta: request === void 0 ? null : { email: { request } }
    },
    error: null
  };
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

// src/repositories/control-plane.ts
import {
  hasPublicPages,
  openToCustomersOf
} from "../../contracts/dist/index.js";
async function getTenantConfig(db, tenantId) {
  const { data, error } = await db.from("tenant_config").select("tenant_id, config, version, updated_at, updated_by").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`getTenantConfig: ${error.message}`);
  return data;
}
async function getTenantConfigAsMember(db, tenantId) {
  const row = await getTenantConfig(db, tenantId);
  if (row) return { ...row, feed_hidden: false };
  const { data, error } = await db.rpc("tenant_config_read", { p_tenant_id: tenantId }).maybeSingle();
  if (error && isMissingDoor(error)) return null;
  if (error) throw new Error(`getTenantConfigAsMember: ${error.message}`);
  return data;
}
async function putTenantConfig(db, tenantId, config, expectedVersion, updatedBy) {
  const { data, error } = await db.from("tenant_config").update({ config, version: expectedVersion + 1, ...updatedBy ? { updated_by: updatedBy } : {} }).eq("tenant_id", tenantId).eq("version", expectedVersion).select("tenant_id, config, version, updated_at, updated_by").maybeSingle();
  if (error) throw new Error(`putTenantConfig: ${error.message}`);
  if (data) return { ok: true, row: data };
  const door = await db.rpc("tenant_config_write", { p_tenant_id: tenantId, p_config: config, p_version: expectedVersion }).maybeSingle();
  if (!door.error) {
    const w = door.data;
    if (w?.outcome === "saved")
      return {
        ok: true,
        row: { tenant_id: tenantId, config, version: w.version, updated_at: w.updated_at, updated_by: w.updated_by }
      };
    if (w?.outcome === "stale" || w?.outcome === "missing") return { ok: false, reason: w.outcome };
    throw new Error("putTenantConfig: the door answered without an outcome");
  }
  if (!isMissingDoor(door.error)) throw new Error(`putTenantConfig: ${door.error.message}`);
  const existing = await getTenantConfig(db, tenantId);
  return { ok: false, reason: existing ? "stale" : "missing" };
}
async function markCalendarFeedKept(db, tenantId, now) {
  const { error } = await db.from("tenant_config").update({ calendar_feed_kept_at: now.toISOString() }).eq("tenant_id", tenantId).is("calendar_feed_kept_at", null);
  if (error) throw new Error(`stamping the calendar's first read: ${error.message}`);
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
var MODE_IDS_AT_ONCE = 200;
async function personReplyModes(db, tenantId, contactIds) {
  const out = /* @__PURE__ */ new Map();
  for (let i = 0; i < contactIds.length; i += MODE_IDS_AT_ONCE) {
    const { data, error } = await db.from("policies").select("subject_id, mode").eq("tenant_id", tenantId).eq("class", "reply").eq("subject_type", "contact").in("subject_id", contactIds.slice(i, i + MODE_IDS_AT_ONCE));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.subject_id) out.set(r.subject_id, r.mode);
  }
  return out;
}
async function setPersonReplyMode(db, tenantId, contactId, mode) {
  if (mode === null) {
    const { data, error: error2 } = await db.from("policies").delete().eq("tenant_id", tenantId).eq("class", "reply").eq("subject_type", "contact").eq("subject_id", contactId).select("mode");
    if (error2) throw new Error(error2.message);
    return data?.[0]?.mode ?? null;
  }
  const { data: was, error: readError } = await db.from("policies").select("mode").eq("tenant_id", tenantId).eq("class", "reply").eq("subject_type", "contact").eq("subject_id", contactId).maybeSingle();
  if (readError) throw new Error(readError.message);
  const { error } = await db.from("policies").upsert(
    { tenant_id: tenantId, class: "reply", mode, subject_type: "contact", subject_id: contactId },
    { onConflict: "tenant_id,class,subject_type,subject_id" }
  );
  if (error) throw new Error(error.message);
  return was?.mode ?? null;
}
var billingPlanOf = (row) => row ? { mode: row.mode, status: row.status } : null;
async function workspaceOpenToCustomers(db, tenantId) {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status, left_empty_at").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  const plan = billingPlanOf(billing.data);
  return {
    open: openToCustomersOf({
      paused: tenant.data?.status === "paused",
      ended: !!tenant.data?.left_empty_at,
      billing: plan
    }),
    billing: plan
  };
}
async function workspaceAnswersOnItsOwn(db, tenantId) {
  return (await workspaceOpenToCustomers(db, tenantId)).open === "open";
}
var PUBLIC_RECORD_COLUMNS = "legal_name, trade_name, street, street_secondary, city, region, postal_code, country, contact_email, website_url, about, industry";
var publicRecordOf = (db, tenantId) => db.from("business_records").select(PUBLIC_RECORD_COLUMNS).eq("tenant_id", tenantId).maybeSingle();
async function publicWorkspaceBySlug(db, slug) {
  const t = await db.from("tenants").select("id, name, slug, status, left_empty_at").eq("slug", slug).maybeSingle();
  if (t.error) throw new Error(`reading the workspace: ${t.error.message}`);
  if (!t.data) return null;
  const id = t.data.id;
  const [billing, record, sole, cfg, channels] = await Promise.all([
    db.from("billing_accounts").select("mode, status").eq("tenant_id", id).maybeSingle(),
    publicRecordOf(db, id),
    db.rpc("sole_proprietor_of", { p_tenant_id: id }),
    db.from("tenant_config").select("config").eq("tenant_id", id).maybeSingle(),
    db.from("tenant_channels").select("kind, number_e164").eq("tenant_id", id).eq("status", "active").order("created_at", { ascending: true })
  ]);
  if (billing.error) throw new Error(`reading the workspace's billing: ${billing.error.message}`);
  if (record.error) throw new Error(`reading the business on record: ${record.error.message}`);
  if (sole.error) throw new Error(`reading whether the business is a sole proprietor: ${sole.error.message}`);
  if (cfg.error) throw new Error(`reading the workspace's configuration: ${cfg.error.message}`);
  if (channels.error) throw new Error(`reading the workspace's channels: ${channels.error.message}`);
  return {
    id,
    name: t.data.name,
    slug: t.data.slug,
    status: t.data.status,
    open: openToCustomersOf({
      paused: t.data.status === "paused",
      ended: !!t.data.left_empty_at,
      billing: billingPlanOf(billing.data)
    }),
    record: record.data ?? null,
    soleProprietor: sole.data === true,
    config: cfg.data?.config ?? null,
    channels: channels.data ?? []
  };
}
async function workspacePublicSlug(db, tenantId) {
  const { data, error } = await db.from("tenants").select("slug, status, left_empty_at").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the workspace: ${error.message}`);
  if (!data) return null;
  const open = openToCustomersOf({ paused: data.status === "paused", ended: !!data.left_empty_at, billing: null });
  return hasPublicPages(data.status, open) ? data.slug : null;
}
async function workspaceNamed(db, tenantId) {
  const { data, error } = await db.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the workspace: ${error.message}`);
  return data ? { name: data.name, slug: data.slug } : null;
}
async function workspaceZoneOf(db, tenantId) {
  const { data, error } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the workspace's zone: ${error.message}`);
  return data?.timezone ?? null;
}
async function membershipCountOf(db, userId) {
  const { count: count2, error } = await db.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw new Error(`memberships_count: ${error.message}`);
  return count2 ?? 0;
}
async function workspaceIdsOf(db, userId) {
  const { data, error } = await db.from("memberships").select("tenant_id").eq("user_id", userId);
  if (error) throw new Error(`memberships_of: ${error.message}`);
  return (data ?? []).map((m) => m.tenant_id);
}
async function createWorkspaceFn(db, args) {
  return db.rpc("create_workspace", args).single();
}
async function lineForwardingSet(db, args) {
  return db.rpc("line_forwarding_set", args);
}
async function setWorkspaceLogo(db, tenantId, path) {
  return db.rpc("set_workspace_logo", { p_tenant_id: tenantId, p_logo_path: path });
}
async function updatePlaybook(db, id, patch) {
  const { error } = await db.from("sequence_steps").update(patch).eq("id", id);
  return { error };
}
async function removePlaybook(db, id) {
  const { error, count: count2 } = await db.from("sequence_steps").delete({ count: "exact" }).eq("id", id);
  return { error, count: count2 };
}
async function startPlaybook(db, p) {
  const { data, error } = await db.rpc("start_playbook", {
    p_tenant_id: p.tenantId,
    p_playbook: p.playbook,
    p_decision: p.decision,
    ...p.via ? { p_via: p.via } : {},
    ...p.undoOf ? { p_undo_of: p.undoOf } : {}
  });
  if (error) return { data: null, error };
  const made = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (typeof made.id !== "string" || typeof made.decision_id !== "string")
    throw new Error("start_playbook: the door answered without its row and its decision");
  return { data: { id: made.id, decisionId: made.decision_id }, error: null };
}
async function writePlaybookChange(db, p) {
  const { data, error } = await db.rpc("change_playbook", {
    p_tenant_id: p.tenantId,
    p_playbook_id: p.playbookId,
    p_set: p.set,
    p_decision: p.decision,
    ...p.via ? { p_via: p.via } : {},
    ...p.undoOf ? { p_undo_of: p.undoOf } : {}
  });
  if (error) return isMissingDoor(error) ? "missing" : { data: null, error };
  const made = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  const was = made.was !== null && typeof made.was === "object" && !Array.isArray(made.was) ? made.was : {};
  const decisionId = typeof made.decision_id === "string" ? made.decision_id : null;
  if (typeof made.id !== "string" || decisionId === null && Object.keys(was).length > 0)
    throw new Error("change_playbook: the door answered without its row, or a change without its decision");
  return { data: { id: made.id, was, decisionId }, error: null };
}

// src/repositories/lists.ts
var missingColumn = (message, column) => new RegExp(`\\b${column}\\b`).test(message) && /does not exist|could not find/i.test(message);
var LIST_COLUMNS = ["rule, archived_at", "rule", ""];
async function readWithFallback(read, base) {
  let last2 = null;
  for (const extra of LIST_COLUMNS) {
    try {
      return await read(extra ? `${base}, ${extra}` : base);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!missingColumn(message, "archived_at") && !missingColumn(message, "rule")) throw e;
      last2 = e;
    }
  }
  throw last2;
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
  const { data, error } = await db.from("sequence_steps").select("id, name, state").eq("tenant_id", tenantId).eq("list_id", listId).order("name");
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
import {
  DEFAULT_TIMEZONE as DEFAULT_TIMEZONE2,
  PLAYBOOK_BREATH_MS,
  followUpKey,
  heardWithin,
  localDate,
  parseParamSpecs
} from "../../contracts/dist/index.js";
var RUN_IDS_PER_QUERY = 200;
var STOPPED = /* @__PURE__ */ new Set(["canceled", "failed"]);
async function touchesSince(db, tenantId, since, now) {
  return touchesOf(db, tenantId, since, now, false);
}
async function recentTouches(db, tenantId, now) {
  const touched = {};
  for (const t of await touchesSince(db, tenantId, new Date(now.getTime() - PLAYBOOK_BREATH_MS), now))
    (touched[t.contact_id] ??= []).push(t.at);
  for (const times of Object.values(touched)) times.sort((a, b) => Date.parse(a) - Date.parse(b));
  return touched;
}
async function followUpTouchesSince(db, tenantId, since, now) {
  return touchesOf(db, tenantId, since, now, true);
}
var FOLLOW_UP_PARAMS = '[{"kind":"proposal_link"}]';
var runsSince = (since) => {
  const s = since.toISOString();
  return `created_at.gte.${s},scheduled_for.gte.${s},finished_at.gte.${s},state.eq.sending`;
};
async function touchesOf(db, tenantId, since, now, followUpsOnly) {
  const [all2, zone] = await Promise.all([
    readAllRows("broadcasts", (from, to) => {
      const q = db.from("sequence_batches").select("id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params").eq("tenant_id", tenantId).or(runsSince(since));
      return (followUpsOnly ? q.contains("params", FOLLOW_UP_PARAMS) : q).order("id").range(from, to);
    }),
    db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle().then(
      (r) => r.error ? null : r.data?.timezone || DEFAULT_TIMEZONE2,
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
      (from, to) => db.from("sequence_sends").select(
        "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id"
      ).eq("tenant_id", tenantId).is("lead_id", null).in("batch_id", ids.slice(i, i + RUN_IDS_PER_QUERY)).in("state", ["sent", "queued"]).order("batch_id").order("contact_id").range(from, to)
    );
    for (const r of rows) {
      const run = ofRun.get(r.broadcast_id);
      if (!run || !r.contact_id) continue;
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
function touchIndex(touches, now) {
  const byThis = /* @__PURE__ */ new Map();
  const byAny = /* @__PURE__ */ new Map();
  const followUps = /* @__PURE__ */ new Map();
  const followUpKeys = /* @__PURE__ */ new Map();
  const breath = heardWithin(now.getTime(), now.getTime());
  for (const t of touches) {
    const at = Date.parse(t.at);
    if (t.playbook_id) {
      const m = byThis.get(t.playbook_id) ?? /* @__PURE__ */ new Map();
      m.set(t.contact_id, Math.max(m.get(t.contact_id) ?? 0, at));
      byThis.set(t.playbook_id, m);
    }
    if (breath(at)) byAny.set(t.contact_id, Math.max(byAny.get(t.contact_id) ?? 0, at));
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
async function recordDeal(db, p) {
  const { data, error } = await db.rpc("record_deal", {
    p_contact_id: p.contactId,
    p_stage: p.stage,
    p_move: p.move,
    ...p.via ? { p_via: p.via } : {},
    ...p.undoOf ? { p_undo_of: p.undoOf } : {}
  });
  return { data, error };
}

// src/repositories/workspace-export.ts
async function sectionRows(q) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}
var last = (offset, limit) => offset + limit - 1;
var NOTE_COLUMNS = "id, contact_id, body, author_kind, author_user_id, for_user_id, team_only, state, source, due_on, done_at, done_by, deal_id, created_at, updated_at";
var DEAL_COLUMNS = "id, contact_id, lead_id, service, stage, proposed_at, decided_at, ended_at, amount_cents, per, currency, note, evidence, source, proposal_url, valid_until, lost_reason, created_by, created_at, updated_at";
var BOOKING_COLUMNS = "id, contact_id, lead_id, source, tool, external_id, status, starts_at, ends_at, all_day, timezone, title, service, staff, price, note, client_name, client_phone, client_email, consultation, vanished_at, created_by, created_at, updated_at";
var SEGMENT_COLUMNS = "id, name, rule, archived_at, created_by, created_at, updated_at";
var SEGMENT_MEMBER_COLUMNS = "segment_id, contact_id, added_by, added_at";
var HOLD_COLUMNS2 = "id, conversation_id, reason, details, state, resolved_by_user_id, resolved_at, created_at, updated_at";
var RULE_COLUMNS = "id, class, mode, subject_type, subject_id, limits, updated_at";
var LEAD_COLUMNS = "id, business_name, category, street, city, region, postal_code, country, neighborhood, phone_e164, email, website_host, instagram_url, facebook_url, linkedin_url, tiktok_url, maps_url, rating, reviews, about, price, stage, closed_reason, last_outcome, last_note, contacted_at, booked_at, converted_at, contact_id, found_at";
var REPLY_COLUMNS = "message_id, conversation_id, contact_id, lead_id, intent, claim, summary, named_day, refer_to, until_at, draft, draft_state, signer_name, signer_title, read_at, undone_at";
function recordSections(db, tenantId) {
  return {
    // The notes kept and suggested, and the steps with their due day and who did them.
    notes_and_steps: (offset, limit) => sectionRows(
      db.from("person_notes").select(NOTE_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    deals: (offset, limit) => sectionRows(
      db.from("deals").select(DEAL_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    // The business's own details as saved: its facts, hours and services, what the receptionist may say, its alerts, its
    // calendar and its booking tool. One row.
    business: async (offset) => offset > 0 ? [] : sectionRows(db.from("tenant_config").select("config, updated_at, updated_by").eq("tenant_id", tenantId)),
    bookings: (offset, limit) => sectionRows(
      db.from("appointments").select(BOOKING_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    lists: (offset, limit) => sectionRows(
      db.from("segments").select(SEGMENT_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    // Who is on each list kept by hand (a list with a rule is its rule, in lists).
    list_members: (offset, limit) => sectionRows(
      db.from("segment_members").select(SEGMENT_MEMBER_COLUMNS).eq("tenant_id", tenantId).order("segment_id", { ascending: true }).order("contact_id", { ascending: true }).range(offset, last(offset, limit))
    ),
    campaigns: (offset, limit) => sectionRows(
      db.from("sequence_steps").select(
        "id, name, kind, trigger, state, template_id, template_name, template_language, params, hand, policy_class, channels, run_hour, cap_per_run, gap_days, cadence_days, gap_minutes, until, list_id, list_key, lead_search_id, after_playbook_id:after_step_id, after_days, signed_by, include_unconfirmed, last_run_for, last_run_at, created_by, created_at, updated_at"
      ).eq("tenant_id", tenantId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    )
  };
}
function sendSections(db, tenantId) {
  return {
    // Each run of a campaign and each one-off send: who it was for, when it went and how many it reached.
    sends: (offset, limit) => sectionRows(
      db.from("sequence_batches").select(
        "id, name, playbook_id:step_id, run_for, template_id, template_name, template_language, params, audience, channels, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_by, created_at, updated_at"
      ).eq("tenant_id", tenantId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    templates: (offset, limit) => sectionRows(
      db.from("templates").select(
        "id, channel, name, title, language, category, meta_status, quality, rejected_reason, body_preview, variables, components, source, hidden_at, created_by, created_at, updated_at"
      ).eq("tenant_id", tenantId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    // What was handed to a person, why, and how it was settled.
    holds: (offset, limit) => sectionRows(
      db.from("escalations").select(HOLD_COLUMNS2).eq("tenant_id", tenantId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    // What the receptionist may do on its own, asks first or leaves alone, for the workspace and for a list or a person.
    rules: (offset, limit) => sectionRows(
      db.from("policies").select(RULE_COLUMNS).eq("tenant_id", tenantId).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    // The Google reviews as the mirror last saw them, with the reply.
    reviews: (offset, limit) => sectionRows(
      db.from("google_reviews").select(
        "id, origin, rating, author, author_uri, body, language_code, published_at, reply_text, replied_at, maps_uri, first_seen_at, last_seen_at"
      ).eq("tenant_id", tenantId).order("first_seen_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    // The businesses the finder found, and how far each came; one erased at a person's request holds nothing to export.
    leads: (offset, limit) => sectionRows(
      db.from("leads").select(LEAD_COLUMNS).eq("tenant_id", tenantId).is("erased_at", null).order("found_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    // How each answer to a reach-out was read: what they meant, the day they named, the draft made for it and who signed.
    reach_out_replies: (offset, limit) => sectionRows(
      db.from("sequence_replies").select(REPLY_COLUMNS).eq("tenant_id", tenantId).order("read_at", { ascending: true }).order("message_id", { ascending: true }).range(offset, last(offset, limit))
    )
  };
}
function exportSectionPages(db, tenantId) {
  return { ...recordSections(db, tenantId), ...sendSections(db, tenantId) };
}
function keptRead(read) {
  let held = null;
  return () => held ??= read();
}
async function columnIds(q, key) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r[key]);
}
function personRecordSections(db, tenantId, contactId) {
  const theirLists = keptRead(
    () => columnIds(
      db.from("segment_members").select("segment_id").eq("tenant_id", tenantId).eq("contact_id", contactId),
      "segment_id"
    )
  );
  return {
    notes_and_steps: (offset, limit) => sectionRows(
      db.from("person_notes").select(NOTE_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", contactId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    deals: (offset, limit) => sectionRows(
      db.from("deals").select(DEAL_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", contactId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    bookings: (offset, limit) => sectionRows(
      db.from("appointments").select(BOOKING_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", contactId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    lists: async (offset, limit) => {
      const ids = await theirLists();
      if (ids.length === 0) return [];
      return sectionRows(
        db.from("segments").select(SEGMENT_COLUMNS).eq("tenant_id", tenantId).in("id", ids).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
      );
    },
    list_members: (offset, limit) => sectionRows(
      db.from("segment_members").select(SEGMENT_MEMBER_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", contactId).order("segment_id", { ascending: true }).range(offset, last(offset, limit))
    )
  };
}
function personSendSections(db, tenantId, contactId) {
  const theirThreads = keptRead(
    () => columnIds(db.from("conversations").select("id").eq("tenant_id", tenantId).eq("contact_id", contactId), "id")
  );
  const worksAt = keptRead(async () => {
    const { data, error } = await db.from("contacts").select("lead_id").eq("tenant_id", tenantId).eq("id", contactId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.lead_id ?? null;
  });
  return {
    // Each campaign run that named them: what became of their line (sent, skipped and why, failed), on which channel,
    // the words it filled in for them, and the run it was. A run names a person once (sequence_sends_person_once), so the
    // run's id orders them. The file keeps the names it has always had (broadcast_id, broadcasts, playbook_id).
    sends: (offset, limit) => sectionRows(
      db.from("sequence_sends").select(
        "broadcast_id:batch_id, state, reason, channel, sent_at, message_id, facts, broadcasts:sequence_batches (name, playbook_id:step_id, run_for, template_name, template_language, scheduled_for, started_at)"
      ).eq("tenant_id", tenantId).eq("contact_id", contactId).is("lead_id", null).order("batch_id", { ascending: true }).range(offset, last(offset, limit))
    ),
    holds: async (offset, limit) => {
      const threads = await theirThreads();
      if (threads.length === 0) return [];
      return sectionRows(
        db.from("escalations").select(HOLD_COLUMNS2).eq("tenant_id", tenantId).in("conversation_id", threads).order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
      );
    },
    // The receptionist's rules set for them alone; the workspace's own are its copy's.
    rules: (offset, limit) => sectionRows(
      db.from("policies").select(RULE_COLUMNS).eq("tenant_id", tenantId).eq("subject_type", "contact").eq("subject_id", contactId).order("id", { ascending: true }).range(offset, last(offset, limit))
    ),
    // The business they work at, and a lead that became them; one erased at a person's request holds nothing to export.
    leads: async (offset, limit) => {
      const lead = await worksAt();
      return sectionRows(
        db.from("leads").select(LEAD_COLUMNS).eq("tenant_id", tenantId).is("erased_at", null).or(lead ? `contact_id.eq.${contactId},id.eq.${lead}` : `contact_id.eq.${contactId}`).order("found_at", { ascending: true }).order("id", { ascending: true }).range(offset, last(offset, limit))
      );
    },
    reach_out_replies: (offset, limit) => sectionRows(
      db.from("sequence_replies").select(REPLY_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", contactId).order("read_at", { ascending: true }).order("message_id", { ascending: true }).range(offset, last(offset, limit))
    )
  };
}
function personExportPages(db, tenantId, contactId) {
  return { ...personRecordSections(db, tenantId, contactId), ...personSendSections(db, tenantId, contactId) };
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
var ONE_LEAD_COLUMNS = "id, tenant_id, place_id, business_name, category, street, city, region, postal_code, neighborhood, lat, lng, mark_path, website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, email_checked_at, rating, reviews, stage, closed_reason, last_outcome, last_note, about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank, contact_id, contacted_at, converted_at, exported_at, found_at, version, blanked_at, erased_at, kind, source, facts";
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
async function readIdeaHistory(db, tenantId) {
  const { data, error } = await db.rpc("lead_suggest_history", { p_tenant_id: tenantId });
  if (error) throw new Error(`lead_suggest_history: ${error.message}`);
  return data;
}
async function writeIdeas(db, args) {
  const { data, error } = await db.rpc("lead_suggestions_write", args);
  if (error) throw new Error(`lead_suggestions_write(${args.p_act}): ${error.message}`);
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}
async function claimIdeas(db, tenantId, line) {
  const got = await writeIdeas(db, { p_tenant_id: tenantId, p_act: "claim", p_line: line });
  return typeof got.claim === "string" && got.claim ? got.claim : null;
}
async function keepIdeas(db, tenantId, claim, row) {
  const got = await writeIdeas(db, {
    p_tenant_id: tenantId,
    p_act: "keep",
    p_claim: claim,
    p_line: row.business_line,
    p_by_owner: row.by_owner,
    p_items: row.items,
    // A keep always has a basis ("" where no round has ended); null is the owner's line, saved apart.
    p_basis: row.basis ?? "",
    p_passed: row.passed
  });
  return got.kept === true;
}
async function failIdeas(db, tenantId, claim) {
  await writeIdeas(db, { p_tenant_id: tenantId, p_act: "fail", p_claim: claim });
}
async function saveIdeasLine(db, tenantId, line) {
  await writeIdeas(db, { p_tenant_id: tenantId, p_act: "line", p_line: line });
}
async function ideasClockAndLanguage(db, tenantId) {
  const { data, error } = await db.from("tenants").select("timezone, locale").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`tenants: ${error.message}`);
  return data;
}
async function ideasBasis(db, tenantId) {
  const { data, error } = await db.from("lead_rounds").select("ended_at").eq("tenant_id", tenantId).eq("state", "ended").not("ended_at", "is", null).order("ended_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`lead_rounds: ${error.message}`);
  return data ? data.ended_at : null;
}
async function leadCardsLive(db) {
  const { data, error } = await db.rpc("lead_cards_live");
  if (error) throw new Error(`cannot read which cards find leads: ${error.message}`);
  return data ?? ["local_businesses"];
}
async function leadPeopleSearchCreate(db, p) {
  const { data, error } = await db.rpc("lead_people_search_create", {
    p_tenant_id: p.tenantId,
    p_plan: p.plan,
    p_via: p.via,
    p_estimate_usd: p.estimateUsd,
    ...p.threadId ? { p_thread_id: p.threadId } : {}
  });
  if (error) throw new Error(`lead_people_search_create: ${error.message}`);
  return data ?? {};
}
async function leadAddresseeChoose(db, p) {
  const { data, error } = await db.rpc("lead_addressee_choose", { p_lead_id: p.leadId, p_person: p.person });
  if (error) return { data: null, error };
  return { data: data ?? { error: "no_answer" }, error: null };
}
async function leadCompanyUpsert(db, roundId, companies) {
  const { data, error } = await db.rpc("lead_company_upsert", { p_round_id: roundId, p_companies: companies });
  if (error) throw new Error(`lead_company_upsert: ${error.message}`);
  const r = data ?? {};
  return { made: r.made ?? 0, held: r.held ?? 0, left_out: r.left_out ?? 0 };
}
async function leadCountriesOf(db, ids) {
  const out = /* @__PURE__ */ new Map();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await db.from("leads").select("id, country").in("id", unique.slice(i, i + 100));
    if (error) throw new Error(`cannot read the leads' countries: ${error.message}`);
    for (const r of data ?? []) out.set(r.id, r.country?.trim().toUpperCase() || null);
  }
  return out;
}

// src/lines.ts
import { LINE_FILED_NAMES } from "../../contracts/dist/index.js";
async function ownLineOf(db, tenantId) {
  const { data, error } = await db.from("lines").select("id, tenant_id, e164, provider, subaccount_sid, messaging_service_sid, sms_state, voice_state").eq("tenant_id", tenantId).neq("provider", "carrier").neq("voice_state", "failed").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(`cannot read the workspace's own line: ${error.message}`);
  return data;
}
async function businessOnRecordOf(db, tenantId) {
  const { data, error } = await db.from("business_records").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the business on record: ${error.message}`);
  return data;
}
async function filedNamesOf(db, tenantId) {
  const { data, error } = await db.from("lines").select("facts").eq("tenant_id", tenantId).neq("provider", "carrier").order("created_at", { ascending: true });
  if (error) throw new Error(`cannot read the names the workspace filed: ${error.message}`);
  const named = (key) => {
    for (const row of data ?? []) {
      const facts = row.facts && typeof row.facts === "object" && !Array.isArray(row.facts) ? row.facts : null;
      const value = facts ? facts[key] : null;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return { campaign: named(LINE_FILED_NAMES.campaign), brand: named(LINE_FILED_NAMES.brand) };
}

// src/realtime.ts
var EVERY = ["INSERT", "UPDATE", "DELETE"];
var INSERTS_AND_UPDATES = ["INSERT", "UPDATE"];
var UPDATES = ["UPDATE"];
var WATCHED = [
  { table: "messages", events: INSERTS_AND_UPDATES },
  // arrivals, then a send's ticks and a failure written late: an update is told with its statuses (00327)
  { table: "conversations", events: EVERY },
  // the pause and snooze clocks, other tabs
  { table: "escalations", events: EVERY },
  // opened by the edge, resolved elsewhere
  { table: "calls", events: EVERY },
  // a call starting, each live turn, its end, its analysis: told with its statuses
  // an alert the edge kept, or one closed when what it asked for ended (00421, told when closed_at moved): the bell repaints
  { table: "notifications", events: INSERTS_AND_UPDATES },
  // a line's saga step, its failure, its answer, its release: Setup, the channels read (Connections, the Library, Live, the
  // composers) and People repaint. The hourly carriers' sweep writes a line only when its answer moved (a2p-sync.ts).
  { table: "lines", events: EVERY },
  { table: "google_listings", events: EVERY },
  // the listing linked, read, or removed: Setup and Reports repaint
  // a review seen for the first time, and one answered, by the receptionist, a teammate or on Google: Today's Google line,
  // the bell and Reports' Reviews repaint. The update is told when the reply moved (00431), never for the sync's stamp.
  { table: "google_reviews", events: INSERTS_AND_UPDATES },
  { table: "billing_accounts", events: EVERY },
  // Stripe's answer, applied by the webhook: Billing and Setup repaint
  // a channel connected, switched off, flagged by Meta, or written by a line's saga: Setup and the channels read
  // (Connections' WhatsApp and phone rows, the Library, Live, the composers) repaint (00117)
  { table: "tenant_channels", events: EVERY },
  { table: "capability_activations", events: EVERY },
  // the owner's act, in another tab: Setup repaints (00108)
  { table: "business_records", events: EVERY },
  // the record the carriers read, saved on Connections: Setup repaints (00075)
  { table: "google_connections", events: EVERY },
  // the profile connected, synced or failing by the hourly sweep: Connections repaints (00070)
  { table: "mailbox_connections", events: EVERY },
  // a mailbox connected, signed out, held, paused or removed, its day or records when they moved: Connections and the sheet repaint (00423)
  // a round's page committed, a check landed, a class changed: the Leads scope repaints (00140). A round's update is told
  // when its state, its question, its wait or its ending moved (00431), never for the counters each batch moves.
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
  // a reply to a sequence read, drafted or undone: the Inbox's strip and chip repaint (00222; sequence_replies since 00440)
  { table: "sequence_replies", events: EVERY },
  // a batch made by the sweep, approved, stopped, sending or finished: Today's Approve and Stop rows and Campaigns
  // repaint (00321; sequence_batches since 00440). Its sends are not watched: a batch's page reads them when it opens.
  { table: "sequence_batches", events: EVERY },
  // a sequence made, paused, resumed, renamed or ended, and a step changed by a teammate or stamped by the sweep's run:
  // Campaigns' rows and their acts repaint (00376; the sequence tables since 00440, decision 0060)
  { table: "sequences", events: EVERY },
  { table: "sequence_steps", events: EVERY },
  // a booking that arrived by email written, moved or withdrawn by the booking_read job: the Calendar repaints (00345)
  { table: "appointments", events: EVERY },
  // The records no page was told of (00408, 0047). A person made, or renamed, answered, stopped, merged or erased by a
  // teammate, a job or the customer's own link: People, the Inbox's thread heads and Campaigns' counts repaint. Their
  // updates are told when an identity or an answer moved; a message's stamp on last_seen_at is not one.
  { table: "contacts", events: INSERTS_AND_UPDATES },
  // The settings saved in another tab or by a teammate: Settings, the Calendar, Setup and the composers repaint. Told
  // when the version moved, so the hourly stamp on calendar_checked_at tells nothing. The receptionist's stamp reads it.
  { table: "tenant_config", events: UPDATES },
  // The Autonomy matrix, and a person's or a list's own rule: the chips beside every approval repaint. Read by the stamp.
  { table: "policies", events: EVERY },
  // Meta's answer to a template, a sync, a hide, a template made or removed: the Library and the composers repaint. The
  // update is told when its status, rejection, quality, category, visibility or words moved.
  { table: "templates", events: EVERY },
  // A mailbox made (Today's email line, Start's and Connections' Email row), and offers by email paused by the gate or
  // resumed by the back office (Campaigns' head line and send tick, People), its address or sender renamed, the code Gmail
  // mails to confirm a forward (the Calendar's Business tab) and its intake's error set or cleared (Connections). The
  // update is told when one of those moved (00431), never for the stamp every email puts on it.
  { table: "mailboxes", events: INSERTS_AND_UPDATES },
  // A booking email the reader held for a look, or settled: the Business tab's held list repaints.
  { table: "appointment_notices", events: INSERTS_AND_UPDATES },
  // A seat taken, changed or left, and an invitation sent, renewed, accepted or revoked: the Team pane and the workspace
  // list repaint, and a member whose own role moved is told. A seat's update is told when its role moved, never for the
  // member's own saved views.
  { table: "memberships", events: EVERY },
  { table: "invitations", events: EVERY },
  // The workspace paused or resumed (billing, the back office), renamed, its zone, buying model or logo changed: the
  // shell, the sidebar and Today's band repaint. Told when one of those moved (00431). The receptionist's stamp reads the row.
  { table: "tenants", events: UPDATES }
];
var NARROWED_UPDATES = {
  // A notice closed when what it asked for ended (00421): the bell reads it as read, on every tab.
  notifications: ["closed_at"],
  // The identity, the answers, the merge and the erasure of a person, and where they work and where their name came from
  // (0052). Not last_seen_at, offers_asked_at or the first-touch stamps, which a message writes.
  contacts: [
    "display_name",
    "wa_profile_name",
    "phone_e164",
    "email",
    "notes",
    "proposal_url",
    "consent",
    "consent_source",
    "consent_updated_at",
    "dnc",
    "marketing_consent",
    "marketing_consent_source",
    "marketing_consent_updated_at",
    "email_marketing",
    "email_marketing_source",
    "email_marketing_updated_at",
    "consent_channels",
    "marketing_channels",
    "email_suppressed_at",
    "email_suppressed_reason",
    "merged_into_contact_id",
    "erased_at",
    "lead_id",
    "name_source"
  ],
  tenant_config: null,
  // Meta's answer and why, its quality and category, whether the workspace hid it, and the words. Not synced_at.
  templates: [
    "meta_status",
    "rejected_reason",
    "quality",
    "category",
    "hidden_at",
    "title",
    "body_preview",
    "components",
    "variables"
  ],
  // Its address, sender and reply mode, the pause on offers, Gmail's forwarding code and the intake's error. Not
  // last_received_at, which every email writes (00431).
  mailboxes: [
    "local_part",
    "from_name",
    "reply_mode",
    "offers_paused_at",
    "offers_paused_reason",
    "offers_resumed_at",
    "forward_confirm_account",
    "forward_confirm_code",
    "forward_confirm_link",
    "forward_confirm_at",
    "last_error"
  ],
  // A mailbox the business connected (00423): what Connections draws, never the sync's cursor, its watch or a send's stamp.
  mailbox_connections: [
    "state",
    "held_why",
    "resting_until",
    "daily_cap",
    "customer_domain",
    "sent_days",
    "dns",
    "last_error",
    "from_name",
    "signature",
    "address"
  ],
  // A seat's role. Not the member's saved views or push choices, which are their own.
  memberships: ["role"],
  // The workspace's status, name, zone, buying model and logo (00431).
  tenants: ["status", "name", "timezone", "sells_by", "logo_path"],
  // A review answered (00431). Not last_seen_at, which the sync stamps on every review.
  google_reviews: ["reply_text", "replied_at"],
  // What a round is and what it waits on (00431). Not its allowance, cost or judge's tokens and model.
  lead_rounds: [
    "state",
    "ending",
    "ending_pending",
    "question",
    "answered",
    "target",
    "nearby",
    "waiting_since",
    "ended_at",
    "plan_version"
  ]
};
function narrowedUpdates() {
  return Object.fromEntries(Object.entries(NARROWED_UPDATES).map(([t, cols]) => [t, cols ? [...cols] : null]));
}
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
  const at = typeof notice.at === "string" ? notice.at : void 0;
  const statuses = Array.isArray(notice.statuses) ? notice.statuses : [void 0];
  for (const listener of [...hearing.listeners])
    for (const status of statuses)
      listener.onChange({ tenant_id: tenantId, ...typeof status === "string" ? { status } : {} }, table, event, at);
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
  const { data, error } = await db.rpc("sequence_steps_due", {
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
    rows: rows.map((r) => ({ step: r.step, timezone: r.timezone })),
    remaining: remainingOf(rows)
  };
}
async function stampPlaybooksTried(db, tenantId, p) {
  if (p.ids.length === 0) return;
  const { error } = await db.from("sequence_steps").update({ last_run_at: p.at.toISOString() }).eq("tenant_id", tenantId).in("id", p.ids);
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
    rows: rows.map((r) => ({
      tenant_id: r.tenant_id,
      config: r.config,
      timezone: r.timezone,
      // A database before 00435 answers no such column: left out, so the sweep knows to write no stamp.
      ..."failed_since" in r ? { failed_since: r.failed_since ?? null } : {}
    })),
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
  APPOINTMENT_STATUSES,
  recordIdOf,
  recordKeyOf
} from "../../contracts/dist/index.js";
var LIVE_STATUSES = ["proposed", "booked"];
var unexpired = (now = /* @__PURE__ */ new Date()) => `expires_at.is.null,expires_at.gt.${now.toISOString()}`;
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
async function openBookingRequest(db, p) {
  const { data, error } = await db.rpc("booking_request_open", {
    p_tenant_id: p.tenantId,
    p_conversation_id: p.conversationId,
    p_contact_id: p.contactId,
    p_starts_at: p.startsAt,
    p_ends_at: p.endsAt,
    p_service: p.service ?? "",
    p_timezone: p.timezone,
    p_words: p.words
  });
  if (error) throw new Error(`booking_request_open: ${error.message}`);
  const said = data ?? {};
  if (said.error === "too_soon") return { error: "too_soon" };
  const hold = said.hold;
  const id = said.appointment?.id;
  if (hold !== "opened" && hold !== "changed" && hold !== "refreshed" || typeof id !== "string")
    throw new Error(`booking_request_open: the door answered ${JSON.stringify(data)}`);
  return { hold, appointmentId: id };
}
async function answerBookingRequest(db, p) {
  const { data, error } = await db.rpc("booking_request_answer", {
    p_appointment_id: p.appointmentId,
    p_booked: p.booked,
    ...p.via ? { p_via: p.via } : {},
    ...p.replyWords ? { p_reply_words: p.replyWords } : {}
  });
  return { data, error };
}
async function openRequestOfThread(db, conversationId) {
  const { data, error } = await db.from("appointments").select("*").eq("conversation_id", conversationId).eq("source", "receptionist").eq("status", "proposed").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`open_request_of_thread: ${error.message}`);
  return data ?? null;
}
async function appointmentsBetween(db, tenantId, fromIso, toIso) {
  const { data, error } = await db.from("appointments").select("*").eq("tenant_id", tenantId).in("status", [...LIVE_STATUSES]).neq("source", "calendar_feed").or(unexpired()).gt("ends_at", fromIso).lt("starts_at", toIso).order("starts_at", { ascending: true }).limit(SPAN_MAX);
  if (error) throw new Error(`appointments_between: ${error.message}`);
  return data ?? [];
}
async function visitsOver(db, tenantId, fromIso, toIso) {
  const [noted, feed] = await Promise.all([
    readAllRows(
      "visits_over_noted",
      (from, to) => db.from("appointments").select("*").eq("tenant_id", tenantId).neq("source", "calendar_feed").or(unexpired()).gt("ends_at", fromIso).lt("starts_at", toIso).order("starts_at", { ascending: true }).order("id", { ascending: true }).range(from, to)
    ),
    readAllRows(
      "visits_over_feed",
      (from, to) => db.from("appointments").select("id, status, external_id, starts_at, lead_id").eq("tenant_id", tenantId).eq("source", "calendar_feed").is("vanished_at", null).gt("ends_at", fromIso).lt("starts_at", toIso).order("starts_at", { ascending: true }).order("id", { ascending: true }).range(from, to)
    )
  ]);
  return { noted, feed };
}
async function visitOrigins(db, tenantId, leadIds) {
  const ids = [...new Set(leadIds)];
  if (!ids.length) return [];
  const [leads, enrolled] = await Promise.all([
    db.from("leads").select("id, business_name").eq("tenant_id", tenantId).in("id", ids).is("erased_at", null).is("blanked_at", null),
    db.from("sequence_enrollments").select("lead_id, sequence_id, entered_at").eq("tenant_id", tenantId).in("lead_id", ids).order("entered_at", { ascending: false })
  ]);
  if (leads.error) throw new Error(`visit_origins_leads: ${leads.error.message}`);
  if (enrolled.error) throw new Error(`visit_origins_enrolled: ${enrolled.error.message}`);
  const newest = /* @__PURE__ */ new Map();
  for (const e of enrolled.data ?? []) if (e.lead_id && !newest.has(e.lead_id)) newest.set(e.lead_id, e.sequence_id);
  const sequenceIds = [...new Set(newest.values())];
  const named = /* @__PURE__ */ new Map();
  if (sequenceIds.length) {
    const seqs = await db.from("sequences").select("id, name").eq("tenant_id", tenantId).in("id", sequenceIds);
    if (seqs.error) throw new Error(`visit_origins_sequences: ${seqs.error.message}`);
    for (const q of seqs.data ?? []) named.set(q.id, q.name);
  }
  return (leads.data ?? []).filter((l) => l.business_name.trim()).map((l) => {
    const sequence = newest.get(l.id) ?? null;
    const name = sequence ? named.get(sequence) ?? null : null;
    return {
      lead_id: l.id,
      lead_name: l.business_name.trim(),
      sequence_id: name ? sequence : null,
      sequence_name: name
    };
  });
}
var SAID_STATUSES = ["kept", "missed", "cancelled"];
async function feedWordsOver(db, tenantId, fromIso, toIso) {
  return readAllRows(
    "appointments_feed_words",
    (from, to) => db.from("appointments").select("id, status, external_id, starts_at").eq("tenant_id", tenantId).eq("source", "calendar_feed").is("vanished_at", null).in("status", [...SAID_STATUSES]).gt("ends_at", fromIso).lt("starts_at", toIso).order("starts_at", { ascending: true }).order("id", { ascending: true }).range(from, to)
  );
}
async function recordOver(db, tenantId, fromIso, toIso) {
  const [noted, feed] = await Promise.all([
    notedOver(db, tenantId, fromIso, toIso),
    feedWordsOver(db, tenantId, fromIso, toIso)
  ]);
  return { noted, feed };
}
async function notedOver(db, tenantId, fromIso, toIso) {
  return readAllRows(
    "appointments_noted",
    (from, to) => db.from("appointments").select("*").eq("tenant_id", tenantId).neq("source", "calendar_feed").or(unexpired()).gt("ends_at", fromIso).lt("starts_at", toIso).order("starts_at", { ascending: true }).order("id", { ascending: true }).range(from, to)
  );
}
async function appointmentWorkspace(db, id) {
  const { data, error } = await db.from("appointments").select("id, tenant_id").eq("id", id).maybeSingle();
  if (error) throw new Error(`appointment_workspace: ${error.message}`);
  return data ?? null;
}
async function markVisit(db, p) {
  const { data, error } = await db.rpc("mark_visit", {
    p_appointment_id: p.appointmentId,
    p_status: p.status,
    ...p.via ? { p_via: p.via } : {},
    ...p.undoOf ? { p_undo_of: p.undoOf } : {}
  });
  return { data, error };
}
async function appointmentsForClient(db, tenantId, who, fromIso) {
  const or = clientFilter(who);
  if (!or) return [];
  const { data, error } = await db.from("appointments").select("*").eq("tenant_id", tenantId).neq("source", "calendar_feed").gt("ends_at", fromIso).or(or).order("starts_at", { ascending: true }).limit(50);
  if (error) throw new Error(`appointments_for_client: ${error.message}`);
  return data ?? [];
}
var EARLIER_ROWS_MAX = 1e3;
async function earlierVisitRows(db, tenantId, who, beforeIso) {
  const or = [`contact_id.eq.${who.id}`, clientFilter(who)].filter(Boolean).join(",");
  let capped = false;
  const rows = await readAllRows(
    "appointments_earlier",
    (from, to) => db.from("appointments").select("id, status, starts_at").eq("tenant_id", tenantId).in("status", ["kept", "missed", "booked"]).is("vanished_at", null).lte("ends_at", beforeIso).or(or).order("starts_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
    EARLIER_ROWS_MAX,
    () => {
      capped = true;
    }
  );
  return { rows, capped };
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
      contact_id: r.contact_id,
      series: r.series,
      twin: r.twin
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
    stale: o.stale === true ? 1 : 0,
    first: o.first === true ? 1 : 0
  };
}
var KEYS_PER_READ = 25;
var isStatus = (s) => APPOINTMENT_STATUSES.includes(s);
async function appointmentStates(db, tenantId, keys) {
  const out = /* @__PURE__ */ new Map();
  const put = (key, r) => {
    if (key && isStatus(r.status))
      out.set(key, { status: r.status, starts_at: r.starts_at, vanished_at: r.vanished_at, updated_at: r.updated_at });
  };
  const ids = keys.flatMap((k) => recordIdOf(k) ?? []);
  const feedKeys = keys.filter((k) => recordIdOf(k) === null);
  for (let i = 0; i < feedKeys.length; i += KEYS_PER_READ) {
    const { data, error } = await db.from("appointments").select("external_id, status, starts_at, vanished_at, updated_at").eq("tenant_id", tenantId).eq("source", "calendar_feed").in("external_id", feedKeys.slice(i, i + KEYS_PER_READ));
    if (error && (error.code === "PGRST205" || error.code === "42P01")) return out;
    if (error) throw new Error(`appointments: ${error.message}`);
    for (const r of data ?? []) put(r.external_id, r);
  }
  for (let i = 0; i < ids.length; i += KEYS_PER_READ) {
    const { data, error } = await db.from("appointments").select("id, status, starts_at, vanished_at, updated_at").eq("tenant_id", tenantId).in("id", ids.slice(i, i + KEYS_PER_READ));
    if (error) throw new Error(`appointments: ${error.message}`);
    for (const r of data ?? []) put(recordKeyOf(r.id), r);
  }
  return out;
}
async function reachOutBookedFrom(db, tenantId, appointmentId) {
  const { data, error } = await db.rpc("reach_out_booked_from", {
    p_tenant_id: tenantId,
    p_appointment_id: appointmentId
  });
  if (error) throw new Error(`reach_out_booked_from: ${error.message}`);
  return typeof data === "number" ? data : 0;
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
  const [latest, held] = await Promise.all([
    db.from("appointment_notices").select("tool, received_at").eq("tenant_id", tenantId).in("outcome", ["booked", "changed", "cancelled"]).order("received_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("appointment_notices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("outcome", "held")
  ]);
  if (latest.error) throw new Error(`appointment_notices_latest: ${latest.error.message}`);
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
var HELD_KEYS_CAP = 1e3;
async function heldNoticeKeys(db, tenantId) {
  const { data, error } = await db.from("appointment_notices").select("id, notice_id").eq("tenant_id", tenantId).eq("outcome", "held").order("received_at", { ascending: false }).order("id", { ascending: true }).limit(HELD_KEYS_CAP);
  if (error) throw new Error(`appointment_notices_held_keys: ${error.message}`);
  const rows = data ?? [];
  if (rows.length >= HELD_KEYS_CAP) return null;
  return new Set(rows.flatMap((r) => [r.id, r.notice_id]));
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

// src/repositories/facts/fact-suggestions.ts
var texts = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "") : [];
async function factCorrectionsBatch(db, limit) {
  const { data, error } = await db.rpc("fact_candidates", { p_limit: limit });
  if (error) throw new Error(`fact_candidates: ${error.message}`);
  return (data ?? []).flatMap(
    (r) => r.source === "steer" || r.source === "reply" ? [
      {
        id: r.id,
        tenant_id: r.tenant_id,
        conversation_id: r.conversation_id ?? null,
        source: r.source,
        words: r.words ?? "",
        said: r.said ?? null,
        asked: texts(r.asked),
        known: texts(r.known),
        notes_count: r.notes_count ?? 0,
        workspace_today: r.workspace_today ?? 0
      }
    ] : []
  );
}
async function suggestFact(db, p) {
  const { data, error } = await db.rpc("fact_suggest", {
    p_id: p.id,
    p_title: p.title,
    p_body: p.body,
    p_quote: p.quote
  });
  if (error) throw new Error(`fact_suggest: ${error.message}`);
  const refused = data?.error;
  return { refused: typeof refused === "string" ? refused : null };
}
var WAITING_MAX = 20;
async function factSuggestionsWaiting(db, tenantId) {
  const { data, error } = await db.from("fact_suggestions").select("id, source, title, body, quote, conversation_id, created_at").eq("tenant_id", tenantId).eq("state", "suggested").order("created_at", { ascending: false }).limit(WAITING_MAX);
  if (error) throw new Error(`fact_suggestions_waiting: ${error.message}`);
  return (data ?? []).flatMap(
    (r) => (r.source === "steer" || r.source === "reply") && r.title && r.body && r.quote ? [{ ...r, source: r.source, title: r.title, body: r.body, quote: r.quote }] : []
  );
}
async function factSuggestionById(db, id) {
  const { data, error } = await db.from("fact_suggestions").select("id, tenant_id, state, source, title, body, quote, conversation_id, created_at").eq("id", id).maybeSingle();
  if (error) throw new Error(`fact_suggestion_by_id: ${error.message}`);
  if (!data || data.source !== "steer" && data.source !== "reply" || !data.title || !data.body || !data.quote)
    return null;
  return { ...data, source: data.source, title: data.title, body: data.body, quote: data.quote };
}
async function answerFactSuggestion(db, p) {
  const { data, error } = await db.rpc("fact_suggestion_answer", {
    p_id: p.id,
    p_keep: p.keep,
    ...p.configVersion !== null ? { p_config_version: p.configVersion } : {}
  });
  return { data, error };
}

// src/repositories/facts/held-drafts.ts
async function heldDraftsByIntent(db, tenantId, days) {
  const { data, error } = await db.rpc("held_drafts_by_intent", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`held_drafts_by_intent: ${error.message}`);
  return (data ?? []).map((r) => ({
    intent: r.intent ?? "other",
    held: r.held ?? 0,
    sent: r.sent ?? 0,
    steered: r.steered ?? 0,
    canceled: r.canceled ?? 0,
    person_first: r.person_first ?? 0
  }));
}
export {
  AnswerNotKept,
  CALL_CONTROL_S,
  DB_REQUEST_HEADER,
  DEFAULT_ROW_CAP,
  ERASURE_LEGS,
  ERASURE_STRATEGIES,
  HISTORY_COLUMNS,
  IDS_PER_READ2 as IDS_PER_READ,
  MAX_ROWS,
  PEOPLE_PAGE,
  PERSON_FORGOTTEN,
  ReportWindowNotReadable,
  acceptHandover,
  acceptPartnerInvite,
  activeWhatsappNumbers,
  activitySubjects,
  activityTokensOf,
  addPersonByHand,
  addPersonNote,
  addToList,
  addToWaitlist,
  addressesSuppressed,
  adoptPersonName,
  aiFailuresHour,
  answerBookingRequest,
  answerFactSuggestion,
  answeredReachOutEmail,
  applyBilling,
  applyReplyReading,
  appointmentByClientStart,
  appointmentByKey,
  appointmentNoticeById,
  appointmentNoticeOf,
  appointmentNoticesOf,
  appointmentStates,
  appointmentWorkspace,
  appointmentsBetween,
  appointmentsForClient,
  appointmentsScrub,
  approveBroadcast,
  archiveConversation,
  archiveList,
  assembleBroadcast,
  assembleHistory,
  becomePartner,
  bookedVisitsOf,
  businessOnRecordOf,
  callBackMessage,
  callerNameOf,
  callersOf,
  callsOwedAnAnalysis,
  campaignLedger,
  campaignMonthSent,
  campaignSeries,
  campaignStuck,
  cancelBroadcastFrom,
  cancelSequenceBatch,
  chainDraftLoad,
  claimCallActivity,
  claimCallNotification,
  claimControl,
  claimDrafts,
  claimIdeas,
  claimIdempotencyKey,
  claimQueuedSend,
  claimReplyTell,
  claimReplyTurn,
  claimSends,
  claimVoiceTurn,
  clearForwardingConfirmation,
  closeMendedNotices,
  closedRunSends,
  connectMailbox,
  contactEmailOf,
  contactIdByEmail,
  contactIdByPhone,
  contactSeen,
  countSentToday,
  createList,
  createMessageVersion,
  createServiceClient,
  createWorkspaceFn,
  createWorkspaceForBusiness,
  declineHandover,
  declinePartnerInvite,
  declinePersonName,
  deleteList,
  deleteSecondFactor,
  deliveryOf,
  describeLead,
  discardSequence,
  dismissAppointmentNotice,
  dismissPersonDoubt,
  doubtOn,
  draftFactsOf,
  draftsWaiting,
  dropFromList,
  dropMailboxCredentials,
  dueCalendars,
  dueMailboxes,
  duePlaybooks,
  earlierVisitRows,
  emailOfferCounts,
  emailOffersPause,
  emailWordsByTemplate,
  emailWordsFrom,
  emailWordsOf,
  emitEvent,
  endMailboxSync,
  endVoiceSession,
  erasureDigests,
  eventOfDelivery,
  eventTold,
  everyoneIn,
  everyoneOnceIn,
  exportSectionPages,
  factCorrectionsBatch,
  factSuggestionById,
  factSuggestionsWaiting,
  failIdeas,
  failQueuedSend,
  failStrandedRun,
  failedMessageErrors,
  feedAdditionsWith,
  feedWordsOver,
  filedNamesOf,
  finishableRuns,
  firstReplies,
  followUpOnFile,
  followUpTouchesSince,
  followUpsDue,
  forgetActivityTokens,
  forgetEveryPhone,
  forgetNotification,
  getHandoverInvite,
  getMailboxCredentials,
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
  getTenantConfigAsMember,
  getWorkspacePartner,
  handBackThread,
  handRun,
  hasNewerCopy,
  heldDraftsByIntent,
  heldMessageOf,
  heldNoticeDue,
  heldNoticeKeys,
  heldNoticesOf,
  heldStale,
  holdFactsOf,
  holdRecipients,
  holdTold,
  holdsReplyTurn,
  ideasBasis,
  ideasClockAndLanguage,
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
  joinPersonToLead,
  keepAppointmentNotice,
  keepChannelQuality,
  keepChannelStanding,
  keepForwardingConfirmation,
  keepIdeas,
  keepIdempotencyReceipt,
  keepInvoiceAmount,
  keepMailboxWatch,
  keepMessageCost,
  keepModelTurn,
  keepProviderEvent,
  keptPersonOf,
  knownThreads,
  lastClosedHolds,
  lastInboundEmail,
  lastOutboundEmailSubject,
  leadAddressBounced,
  leadAddresseeChoose,
  leadCardsLive,
  leadCompanyUpsert,
  leadCountriesOf,
  leadMemberLater,
  leadNamesByIds,
  leadPeopleSearchCreate,
  leadPileCounts,
  leadRepliesOfBatches,
  leadReplyFactsOf,
  leadSlotsOf,
  leadWritten,
  leadsBackToday,
  leadsFedBy,
  leavePersonLead,
  leaveSequence,
  lineForwardingSet,
  linkCallMessage,
  listMemberIds,
  listPolicies,
  listRow,
  listSecondFactors,
  liveMailboxByAddress,
  liveMailboxByWatch,
  logPersonCall,
  mailSent,
  mailboxById,
  mailboxCapacityFrom,
  mailboxCapacityOf,
  mailboxConnectionById,
  mailboxConnectionOf,
  mailboxConnectionsOf,
  mailboxCountsOf,
  mailboxFor,
  mailboxOfTenant,
  mailboxesToTend,
  makeSequence,
  markCalendarFeedKept,
  markContact,
  markHeldNotice,
  markPartnerPaid,
  markProcessed,
  markReplyDraft,
  markReplyTold,
  markVisit,
  markWaitlistInvited,
  memberAlertsOf,
  memberEmailOf,
  memberHasAddress,
  memberJoinedOf,
  memberViewsOf,
  memberWithdrawDrafts,
  memberWithdrawMessage,
  membersPushedFor,
  membershipCountOf,
  mergePeople,
  messageByExternalId,
  messageSenders,
  messageSlots,
  messageVersionRowsOf,
  migrationHead,
  momentSchedules,
  monthSent,
  moveSend,
  moveVoiceSessionContext,
  namedFetch,
  namesOfPeople,
  narrowedUpdates,
  notePageVitals,
  notedOver,
  notesForReceptionist,
  noticeFor,
  noticeKept,
  observeDb,
  offerLanguageOf,
  offersAnswerOf,
  offersEmailReach,
  olderUnreadFor,
  oldestActiveChannel,
  oneOffMessageOf,
  openBookingRequest,
  openConversation,
  openDoubtsOf,
  openEscalation,
  openRequestOfThread,
  optOutTold,
  ourLastWire,
  outreachFactsOf,
  outreachModeOf,
  ownAddressIn,
  ownLineOf,
  ownVersionsFiled,
  ownerSendFactsOf,
  pageSpeed,
  pageSpots,
  pageVitalsP75,
  parentEmailOf,
  patchMailboxConnection,
  pauseConversation,
  pauseEmailOffers,
  peopleAtLead,
  peopleCursorOf,
  peoplePage,
  peopleSeries,
  personDecisions,
  personExportPages,
  personFactsOf,
  personReplyMode,
  personReplyModes,
  personRow,
  platformDay,
  platformWide,
  playbookChannels,
  playbookForChange,
  playbookForChannels,
  playbookTotals,
  playbooksOnList,
  providerEventOf,
  publicWorkspaceBySlug,
  purgeAiUsage,
  pushNamesFor,
  putBackInSequence,
  putMailboxCredentials,
  putTenantConfig,
  queuedOutcomes,
  queuedRecipients,
  reachOutAdd,
  reachOutAudience,
  reachOutBookedFrom,
  reachOutChainPeople,
  reachOutChainTotals,
  reachOutDayDue,
  reachOutFedByOf,
  reachOutFollowers,
  reachOutLeaveOut,
  reachOutPeopleCounts,
  reachOutPerson,
  reachOutRecord,
  reachOutReplyOf,
  reachOutReport,
  reachOutRootOf,
  reachOutRunSendsOf,
  reachOutSendRefOf,
  reachOutSources,
  reachOutStepsOf,
  readAllRows,
  readAllRowsByKey,
  readDealForPhone,
  readIdeaHistory,
  readJobToRequeue,
  readLeadContext,
  readLeadOne,
  readThreadState,
  readVoiceSession,
  readVoiceSessionByConversation,
  recentTouches,
  receptionistSeries,
  recheckSends,
  recordActivation,
  recordCallNote,
  recordCarrierOptOut,
  recordCheck,
  recordConsent,
  recordDeal,
  recordEchoAndPause,
  recordEmailNo,
  recordEmailStatus,
  recordEvent,
  recordLateCarrierOptOut,
  recordModelUsage,
  recordOutbound,
  recordOver,
  recordPartnerSecondFactorReset,
  recordStatusByExternalId,
  recordSystemDecision,
  recordWhatsAppOffersStop,
  refreshWaitlistRow,
  relayEvents,
  releaseControl,
  releaseIdempotencyKey,
  releaseQueuedSend,
  releaseUnavailableHolds,
  removePlaybook,
  removeSequenceStep,
  removeTemplateVersion,
  renameList,
  repliedTo,
  repliesFor,
  replyReadingOf,
  replyReadingRefOf,
  replySaid,
  replyUndoableOf,
  reportSeries,
  resendHandover,
  resolveChannel,
  resolveChannelDetailed,
  resolveEscalationByReason,
  resolveOutboundTarget,
  resolveOutboundTargetForContact,
  resolvePerson,
  reviewLinkOf,
  reviewRowsByGoogleId,
  reviewsLedger,
  reviewsNamed,
  runCounts,
  runGoesByOthers,
  runHanded,
  runSending,
  runWaitingCounts,
  runningStepsOn,
  runningTwins,
  runsInSpan,
  runsNamed,
  runsWaitingOf,
  saveIdeasLine,
  saveReachOutChain,
  saveSequenceStep,
  saveTemplateVersion,
  savedListFor,
  savedListsFor,
  scrubModelTurns,
  scrubPersonNotes,
  scrubProviderEvents,
  searchMessages,
  searchesByIds,
  seePersonNote,
  sendJobScheduled,
  sendNow,
  sendSaid,
  sendStanding,
  sentEmailIdByMessageId,
  sentEmailOf,
  sentEmailWithMessageId,
  sequenceHistoryOf,
  sequenceNamesOf,
  sequenceOfPart,
  sequenceOverview,
  sequencePeopleOf,
  sequenceRow,
  sequenceStepsOf,
  sequencesOfPerson,
  sessionHoldsPartnerSeat,
  setCallRecording,
  setEmailOffersYes,
  setEmailUnsubscribed,
  setListRule,
  setMemberPushOff,
  setMemberView,
  setPartnerLetters,
  setPartnerStanding,
  setPartnerStatus,
  setPersonReplyMode,
  setPolicyMode,
  setSequenceStepWords,
  setTemplateQuality,
  setWorkspaceLogo,
  settleDelivery,
  signUpOnPublicKey,
  signersOf,
  staleSends,
  stampEmailComplaint,
  stampEmailFromMailbox,
  stampEmailLeftAs,
  stampEmailSent,
  stampHandled,
  stampMailboxReceived,
  stampPlaybooksTried,
  stampReachOutStep,
  startPlaybook,
  stepLastRunFor,
  stopAllMessages,
  strandedRuns,
  stuckClaims,
  subjectsWith,
  subscribeWorkspaceChanges,
  subscriptionPaused,
  suggestFact,
  suppressEmailOf,
  syncFeedAppointments,
  takeCheckAttempt,
  takeIdempotencyKey,
  takeMailboxSync,
  takeOutOfSequence,
  takeOverThread,
  takeReplyRead,
  templateIdOf,
  templateSends,
  templateStatusOf,
  templatesFor,
  templatesNamed,
  templatesToSend,
  tenantDb,
  tenantZoneOf,
  textLineFacts,
  textReached,
  threadIdsWaitingOnYou,
  touchIndex,
  touchOfCall,
  touchesSince,
  twinTold,
  uncheckedSends,
  uncheckedWaiting,
  undoPersonName,
  undoReplyReading,
  unreadOfReaders,
  updateAppointment,
  updatePlaybook,
  usageMonth,
  visitOrigins,
  visitsOver,
  waitingPlaybookRuns,
  waitingRunsOf,
  waitlistWaiting,
  watchedEvents,
  watchedTables,
  whatsappChannelFacts,
  whatsappLineOf,
  whatsappNumberOf,
  whatsappNumbersToRead,
  wireRowOf,
  withdrawAiDrafts,
  withdrawEmail,
  withdrawPartnerInvite,
  withdrawQueued,
  workspaceAbout,
  workspaceAnswersOnItsOwn,
  workspaceIdsOf,
  workspaceMaySpend,
  workspaceMayUseModels,
  workspaceNameAndConfig,
  workspaceNamed,
  workspaceOpenToCustomers,
  workspacePaused,
  workspacePublicSlug,
  workspaceZoneOf,
  writePlaybookChange,
  writtenEmail,
  writtenEmails,
  yesesSince
};
