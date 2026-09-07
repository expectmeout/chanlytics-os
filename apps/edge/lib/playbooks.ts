/**
 * One playbook's run, the one implementation.
 *
 * The hourly sweep runs every playbook whose hour it is; "Run now" on the
 * page runs one at a person's request. Both come here. A run is a broadcast
 * for the people who became eligible since the last run — the trigger's
 * list crossed with who said yes, minus anyone who heard from this playbook
 * within its gap, minus anyone who heard from any playbook this week, the
 * longest-unheard first, at most the cap. What the run then does is the
 * class's autonomy mode: auto schedules the send now, veto schedules it half
 * an hour ahead with a Stop, ask leaves it waiting for a person, never does
 * nothing. A person who asks for a run now has decided: it sends now, unless
 * the class is set to never. Every run is recorded as an event, a run that
 * found nobody included.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent, listPolicies, type Database, type Json } from "./workspace/db.js";
import { scheduleJob } from "./workspace/jobs.js";
import { notify } from "./notify.js";
import { loadTenantNotifications } from "./tenant-runtime.js";
import {
  eligibleForPlaybook,
  indexFeed,
  localDate,
  numberHealth,
  parseTenantConfig,
  planRun,
  toPersonRowVM,
  toVisitDto,
  triggerOf,
  visitFactsFor,
  visitsIn,
  type NumberHealth,
  type ParamSpec,
  type PersonRowDto,
  type PersonRowVM,
  type PersonVisitsDto,
  type PlaybookDto,
  type RunPlan,
} from "./workspace/contracts.js";
import { feedItemsFor } from "./availability.js";

type Db = SupabaseClient<Database>;

export interface PlaybookRow {
  id: string;
  tenant_id: string;
  name: string;
  trigger: string;
  template_id: string;
  template_name: string;
  template_language: string;
  params: unknown;
  policy_class: string;
  state: string;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
  created_by: string | null;
  last_run_for: string | null;
}

export interface TenantRunContext {
  db: Db;
  tenantId: string;
  tz: string;
  now: Date;
  people: PersonRowVM[];
  modes: Map<string, string>;
  health: NumberHealth;
  touches: { byThis: Map<string, Map<string, number>>; byAny: Map<string, number> };
  /** The workspace's calendar: a visit playbook runs only when it is "ok". */
  calendar: "ok" | "unavailable" | "none";
  /** Each person's next and last visit from that calendar, for the words a visit run keeps. */
  visits: Map<string, PersonVisitsDto>;
}

/** Read once per tenant: the people, the modes, the number, the touches. */
export async function loadTenantRunContext(db: Db, tenantId: string, now: Date): Promise<TenantRunContext | { error: string }> {
  const [{ data: tenant }, { data: people, error: pErr }, policies, { data: ch }, { data: pastRuns }, { data: cfgRow }] = await Promise.all([
    db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle(),
    db.rpc("people_list", { p_tenant_id: tenantId }),
    listPolicies(db, tenantId).catch(() => []),
    db.from("tenant_channels").select("config").eq("tenant_id", tenantId).eq("kind", "whatsapp").eq("status", "active").limit(1).maybeSingle(),
    db.from("broadcasts").select("id, playbook_id, state, scheduled_for, created_at").eq("tenant_id", tenantId).not("playbook_id", "is", null),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (pErr) return { error: pErr.message };
  const cfg = (ch?.config && typeof ch.config === "object" && !Array.isArray(ch.config) ? ch.config : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
  const byThis = new Map<string, Map<string, number>>();
  const byAny = new Map<string, number>();
  // A touch is a message sent, or one on its way: a run scheduled, waiting
  // for a person or sending counts from the moment it is due, so two
  // playbooks due the same hour never both pick the same person. A run that
  // was canceled or failed touched nobody.
  const runs = (pastRuns ?? []).filter((b) => b.state !== "canceled" && b.state !== "failed");
  const runIds = runs.map((b) => b.id);
  const ofRun = new Map(runs.map((b) => [b.id, b]));
  if (runIds.length) {
    const { data: touched } = await db.from("broadcast_recipients").select("broadcast_id, contact_id, state, sent_at").in("broadcast_id", runIds).in("state", ["sent", "queued"]);
    for (const r of touched ?? []) {
      const run = ofRun.get(r.broadcast_id);
      if (!run) continue;
      const at = r.sent_at ? Date.parse(r.sent_at) : Date.parse(run.scheduled_for ?? run.created_at);
      const pid = run.playbook_id as string;
      if (pid) {
        const m = byThis.get(pid) ?? new Map<string, number>();
        m.set(r.contact_id, Math.max(m.get(r.contact_id) ?? 0, at));
        byThis.set(pid, m);
      }
      byAny.set(r.contact_id, Math.max(byAny.get(r.contact_id) ?? 0, at));
    }
  }
  // The calendar's appointments on every person, the way the People page
  // reads them: a visit playbook keys on the day, and its words come from
  // the visit itself. Read once per tenant per run.
  const tz = tenant?.timezone || "America/New_York";
  const rows = (people ?? []) as unknown as PersonRowDto[];
  const url = parseTenantConfig(cfgRow?.config ?? null)?.calendar?.ical_url ?? null;
  let calendar: TenantRunContext["calendar"] = "none";
  const visits = new Map<string, PersonVisitsDto>();
  if (url) {
    const items = await feedItemsFor(tenantId, url, tz, now);
    if (items) {
      calendar = "ok";
      const index = indexFeed(items);
      for (const r of rows) {
        const v = visitsIn(index, { id: r.id, name: r.display_name || r.wa_profile_name || "", phone: r.phone_e164 }, now.getTime());
        visits.set(r.id, { timezone: tz, source: "calendar", state: "ok", next: toVisitDto(v.next), last: toVisitDto(v.last) });
      }
    } else {
      calendar = "unavailable";
    }
  }
  return {
    db,
    tenantId,
    tz,
    now,
    people: rows.map((r) => toPersonRowVM({ ...r, visits: visits.get(r.id) ?? null }, now)),
    calendar,
    visits,
    modes: new Map(policies.map((r) => [r.class, r.mode])),
    health: numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") }),
    touches: { byThis, byAny },
  };
}

export type RunOutcome =
  | { outcome: "sent" | "held"; broadcast_id: string; eligible: number; mode: string; state: string }
  | { outcome: "empty"; eligible: 0; mode: string }
  | { outcome: "off"; mode: string; skipped: "never" | "template_not_approved" | "number_flagged" | "already_ran_today" | "no_calendar" }
  | { outcome: "failed"; error: string };

export interface RunRequest {
  /** The local day the run is for; one run per playbook per day. */
  runFor?: string;
  /** Who asked: the sweep (system) or a person (their decision, sends now unless the class is never). */
  by: { kind: "system" } | { kind: "user"; userId: string };
}

export async function runPlaybook(ctx: TenantRunContext, p: PlaybookRow, req: RunRequest): Promise<RunOutcome> {
  const { db, tenantId, now } = ctx;
  const runFor = req.runFor ?? localDate(ctx.tz, now);
  const record = async (data: Record<string, unknown>) => {
    await emitEvent(db, tenantId, "playbook.run", "message", "playbook", p.id, { run_for: runFor, by: req.by.kind, ...data } as Json).catch(() => {});
    await db.from("playbooks").update({ last_run_for: runFor, last_run_at: now.toISOString() }).eq("id", p.id);
  };
  const mode = ctx.modes.get(p.policy_class) ?? "ask";
  const plan: RunPlan = req.by.kind === "user"
    ? (mode === "never" ? { kind: "off" } : { kind: "send", state: "scheduled", at: now })
    : planRun(mode, now);
  if (plan.kind === "off") { await record({ mode, skipped: "never" }); return { outcome: "off", mode, skipped: "never" }; }

  const { data: tpl } = await db.from("templates").select("meta_status").eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("name", p.template_name).eq("language", p.template_language).maybeSingle();
  if (!tpl || tpl.meta_status !== "approved") { await record({ mode, skipped: "template_not_approved" }); return { outcome: "off", mode, skipped: "template_not_approved" }; }
  if (!ctx.health.canSend) { await record({ mode, skipped: "number_flagged" }); return { outcome: "off", mode, skipped: "number_flagged" }; }

  const { data: already } = await db.from("broadcasts").select("id").eq("playbook_id", p.id).eq("run_for", runFor).maybeSingle();
  if (already) return { outcome: "off", mode, skipped: "already_ran_today" };
  // A visit playbook without a calendar has nothing to read: off, and the run says so.
  if (triggerOf(p.trigger)?.kind === "visit" && ctx.calendar !== "ok") { await record({ mode, skipped: "no_calendar" }); return { outcome: "off", mode, skipped: "no_calendar" }; }

  let eligible = eligibleForPlaybook(ctx.people, p as unknown as PlaybookDto, { byThis: ctx.touches.byThis.get(p.id) ?? new Map(), byAny: ctx.touches.byAny }, now.getTime());
  if (ctx.health.limitPerDay !== null && eligible.length > ctx.health.limitPerDay) eligible = eligible.slice(0, Math.max(0, Math.floor(ctx.health.limitPerDay)));
  if (eligible.length === 0) { await record({ mode, eligible: 0 }); return { outcome: "empty", eligible: 0, mode }; }

  const specs: ParamSpec[] = Array.isArray(p.params) ? (p.params as ParamSpec[]) : [];
  const { data: made, error: bErr } = await db
    .from("broadcasts")
    .insert({
      tenant_id: tenantId,
      name: `${p.name} · ${runFor}`,
      template_id: p.template_id,
      template_name: p.template_name,
      template_language: p.template_language,
      params: specs as unknown as Json,
      audience: { kind: "playbook", id: p.id, label: p.name } as unknown as Json,
      state: plan.state,
      scheduled_for: plan.kind === "send" ? plan.at.toISOString() : now.toISOString(),
      recipient_count: eligible.length,
      created_by: req.by.kind === "user" ? req.by.userId : p.created_by,
      playbook_id: p.id,
      run_for: runFor,
    })
    .select("id")
    .single();
  if (bErr || !made) return { outcome: "failed", error: bErr?.message ?? "run not created" };
  // A visit run keeps each person's words on their row — the visit's time
  // and service as the calendar said them now — so the send fills the slots
  // without reading the calendar again.
  const factsOf = (r: PersonRowVM) => {
    const v = ctx.visits.get(r.id);
    return visitFactsFor(p.trigger, p.trigger === "visit_tomorrow" ? (v?.next ?? null) : (v?.last ?? null), ctx.tz);
  };
  const { error: rErr } = await db.from("broadcast_recipients").insert(eligible.map((r) => {
    const facts = factsOf(r);
    return { broadcast_id: made.id, contact_id: r.id, tenant_id: tenantId, ...(facts ? { facts: facts as unknown as Json } : {}) };
  }));
  if (rErr) {
    await db.from("broadcasts").update({ state: "failed", failure: "recipients_write_failed" }).eq("id", made.id);
    return { outcome: "failed", error: rErr.message };
  }

  if (plan.kind === "send") {
    try {
      await scheduleJob(db, { tenantId, kind: "broadcast_send", dueAt: plan.at, payload: { broadcast_id: made.id }, qstashToken: process.env.QSTASH_TOKEN! });
    } catch (e) {
      await db.from("broadcasts").update({ state: "failed", failure: "schedule_failed" }).eq("id", made.id);
      return { outcome: "failed", error: e instanceof Error ? e.message : String(e) };
    }
    // The ledger: a run the sweep sends is the system's decision under the
    // mode the owner chose; a run a person asked for is theirs.
    await db.from("decisions").insert({
      tenant_id: tenantId,
      subject_type: "broadcast",
      subject_id: made.id,
      verb: "send_broadcast",
      actor_type: req.by.kind === "user" ? "user" : "system",
      actor_user_id: req.by.kind === "user" ? req.by.userId : null,
      payload: { playbook_id: p.id, playbook: p.name, mode, recipients: eligible.length, scheduled_for: plan.at.toISOString(), run_now: req.by.kind === "user" } as unknown as Json,
    });
    await record({ mode, eligible: eligible.length, broadcast_id: made.id, state: plan.state });
    return { outcome: "sent", broadcast_id: made.id, eligible: eligible.length, mode, state: plan.state };
  }

  const target = await loadTenantNotifications(db, tenantId);
  await notify(
    { tenantId, notifications: target.notifications, isEnvDefault: target.isEnvDefault },
    {
      kind: "playbook",
      route: "outbound",
      subject: `Playbook “${p.name}” is ready: ${eligible.length} ${eligible.length === 1 ? "person" : "people"}`,
      body: `${eligible.length} ${eligible.length === 1 ? "person has" : "people have"} become eligible for “${p.name}”. Approve or skip the run on Today or in Campaigns › Playbooks. Nothing is sent until you do.`,
    },
  );
  await record({ mode, eligible: eligible.length, broadcast_id: made.id, state: plan.state });
  return { outcome: "held", broadcast_id: made.id, eligible: eligible.length, mode, state: plan.state };
}
