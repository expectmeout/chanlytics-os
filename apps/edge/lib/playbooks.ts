/**
 * One playbook's run: the rules are core's (packages/core/src/campaigns/
 * run-playbook.ts); this file is the edge's side of them. It reads the
 * workspace once per tenant — the people, the modes, the number, the
 * touches, the calendar — and builds the run's ports over the edge's
 * database and services. The hourly sweep and "Run now" on the page both
 * come here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent, listPolicies, type Database, type Json } from "./workspace/db.js";
import { scheduleJob } from "./workspace/jobs.js";
import { runPlaybook as runOverPorts, type PlaybookRow, type RunBy, type RunContext, type RunOutcome } from "./workspace/core.js";
import { notify } from "./notify.js";
import { loadTenantNotifications } from "./tenant-runtime.js";
import {
  indexFeed,
  numberHealth,
  parseTenantConfig,
  toPersonRowVM,
  toVisitDto,
  visitsIn,
  type PersonRowDto,
  type PersonVisitsDto,
} from "./workspace/contracts.js";
import { feedItemsFor } from "./availability.js";

type Db = SupabaseClient<Database>;

export type { PlaybookRow, RunOutcome };

/** The run's context, with the client and the tenant the ports close over. */
/**
 * Everyone in People, a page at a time: people_list answers at most a
 * thousand rows, and the pool a run picks from is never one page of it. The
 * page arguments are named only past the first page, so a database that has
 * not been given 00112 yet answers the first page as it always has.
 */
export async function allPeople(db: Db, tenantId: string): Promise<{ data: PersonRowDto[] | null; error: { message: string } | null }> {
  const all: PersonRowDto[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.rpc("people_list", offset ? { p_tenant_id: tenantId, p_offset: offset, p_limit: 1000 } : { p_tenant_id: tenantId });
    if (error) return { data: null, error };
    const page = (data ?? []) as unknown as PersonRowDto[];
    all.push(...page);
    if (page.length < 1000) break;
  }
  return { data: all, error: null };
}

export interface TenantRunContext extends RunContext {
  db: Db;
  tenantId: string;
}

/** Read once per tenant: the people, the modes, the number, the touches. */
export async function loadTenantRunContext(db: Db, tenantId: string, now: Date): Promise<TenantRunContext | { error: string }> {
  const [{ data: tenant }, { data: people, error: pErr }, policies, { data: ch }, { data: pastRuns }, { data: cfgRow }] = await Promise.all([
    db.from("tenants").select("timezone, status").eq("id", tenantId).maybeSingle(),
    allPeople(db, tenantId),
    listPolicies(db, tenantId).catch(() => []),
    db.from("tenant_channels").select("config").eq("tenant_id", tenantId).eq("kind", "whatsapp").eq("status", "active").limit(1).maybeSingle(),
    // Every broadcast, not only the playbooks' runs: a message sent by hand is
    // a touch too, and the week's breath is one message per person across all
    // of them. byThis (the gap) still keys on the playbook that sent it.
    db.from("broadcasts").select("id, playbook_id, state, scheduled_for, created_at").eq("tenant_id", tenantId),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (pErr) return { error: pErr.message };
  // A paused workspace runs nothing: the sweep counts it off, and says so once, quietly.
  if (tenant?.status === "paused") return { error: "paused" };
  const cfg = (ch?.config && typeof ch.config === "object" && !Array.isArray(ch.config) ? ch.config : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
  const byThis = new Map<string, Map<string, number>>();
  const byAny = new Map<string, number>();
  // A touch is a message sent, or one on its way: a run scheduled, waiting
  // for a person or sending counts from the moment it is due, so two
  // playbooks due the same hour never both pick the same person. A run that
  // was canceled or failed touched nobody. A broadcast the owner sent by hand
  // counts for the breath (byAny) and for no playbook's gap.
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

export interface RunRequest {
  /** The local day the run is for; one run per playbook per day. */
  runFor?: string;
  /** Who asked: the sweep (system) or a person (their decision, sends now unless the class is never). */
  by: RunBy;
}

/** The run over this runtime's ports: the rules are core's. */
export async function runPlaybook(ctx: TenantRunContext, p: PlaybookRow, req: RunRequest): Promise<RunOutcome> {
  const { db, tenantId } = ctx;
  return runOverPorts(
    {
      template: async (name, language) => {
        const { data } = await db.from("templates").select("meta_status").eq("tenant_id", tenantId).eq("channel", "whatsapp").eq("name", name).eq("language", language).maybeSingle();
        return data ?? null;
      },
      alreadyRan: async (playbookId, runFor) => {
        const { data } = await db.from("broadcasts").select("id").eq("playbook_id", playbookId).eq("run_for", runFor).maybeSingle();
        return !!data;
      },
      record: async (playbookId, runFor, at, data) => {
        await emitEvent(db, tenantId, "playbook.run", "message", "playbook", playbookId, data as Json).catch(() => {});
        await db.from("playbooks").update({ last_run_for: runFor, last_run_at: at.toISOString() }).eq("id", playbookId);
      },
      create: async (row) => {
        const { data, error } = await db
          .from("broadcasts")
          .insert({ tenant_id: tenantId, ...row, params: row.params as unknown as Json, audience: row.audience as unknown as Json })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "run not created");
        return data.id;
      },
      enrol: async (id, rows) => {
        const { error } = await db.from("broadcast_recipients").insert(rows.map((r) => ({ broadcast_id: id, contact_id: r.contact_id, tenant_id: tenantId, ...(r.facts ? { facts: r.facts as unknown as Json } : {}) })));
        if (error) throw new Error(error.message);
      },
      fail: async (id, failure) => {
        await db.from("broadcasts").update({ state: "failed", failure }).eq("id", id);
      },
      schedule: async (id, at) => {
        await scheduleJob(db, { tenantId, kind: "broadcast_send", dueAt: at, payload: { broadcast_id: id } });
      },
      // The ledger: a run the sweep sends is the system's decision under the
      // mode the owner chose; a run a person asked for is theirs.
      decide: async ({ broadcastId, by, payload }) => {
        await db.from("decisions").insert({
          tenant_id: tenantId,
          subject_type: "broadcast",
          subject_id: broadcastId,
          verb: "send_broadcast",
          actor_type: by.kind === "user" ? "user" : "system",
          actor_user_id: by.kind === "user" ? by.userId : null,
          payload: payload as unknown as Json,
        });
      },
      notify: async (subject, body) => {
        const target = await loadTenantNotifications(db, tenantId);
        await notify({ tenantId, notifications: target.notifications, isEnvDefault: target.isEnvDefault }, { kind: "playbook", route: "outbound", subject, body });
      },
    },
    { playbook: p, ctx, runFor: req.runFor, by: req.by },
  );
}
