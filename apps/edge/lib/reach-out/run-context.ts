/**
 * A reach-out step's run, on the edge (Reach out, Part 3): the ports core's runReachOut asks, over the database. The
 * rules are core's (packages/core/src/campaigns/run-reach-out.ts); this is the reading and writing they need. The
 * playbooks sweep comes here for each reach-out step due today.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  domainCapacityOf,
  listPolicies,
  planSends,
  reachOutAudience,
  reachOutFollowers,
  type Database,
  type Json,
} from "../packages/db.js";
import type { ReachOutRunPorts, ReachOutStep } from "../packages/core.js";
import {
  domainDailyCap,
  maySpend,
  type BillingMode,
  type BillingStatus,
  type TimetableDomain,
} from "../packages/contracts.js";
import { notify } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";

type Db = SupabaseClient<Database>;
export type ReachOutRow = Database["public"]["Tables"]["playbooks"]["Row"];

/** A chain is short (Part 4's sheet makes a few steps); a longer walk is a loop in the rows, never a chain. */
const CHAIN_MAX = 10;

/** When the first email of a run goes, in the workspace's words: "Monday 9:30 AM". */
const firstWords = (tz: string, atMs: number): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", hour: "numeric", minute: "2-digit" }).format(
    new Date(atMs),
  );

/**
 * The step as the verb reads it: its chain's root, and the chain's state (a paused root pauses every step of it).
 * Null when its root cannot be found within a chain's length.
 */
async function stepOf(db: Db, row: ReachOutRow): Promise<ReachOutStep | null> {
  let root = row;
  for (let i = 0; root.after_playbook_id && i < CHAIN_MAX; i += 1) {
    const { data, error } = await db
      .from("playbooks")
      .select("*")
      .eq("tenant_id", row.tenant_id)
      .eq("id", root.after_playbook_id)
      .maybeSingle();
    if (error) throw new Error(`cannot read the step's chain: ${error.message}`);
    if (!data) return null;
    root = data;
  }
  if (root.after_playbook_id) return null;
  return {
    id: row.id,
    root_id: root.id,
    tenant_id: row.tenant_id,
    name: row.name,
    trigger: row.trigger === "after_step" ? "after_step" : "lead_first",
    state: row.state === "running" && root.state === "running" ? "running" : "paused",
    lead_search_id: row.lead_search_id,
    after_playbook_id: row.after_playbook_id,
    after_days: row.after_days,
    gap_minutes: row.gap_minutes ?? 0,
    domain_ids: row.domain_ids ?? [],
    cap_per_run: row.cap_per_run,
    template_id: row.template_id,
    template_name: row.template_name,
    template_language: row.template_language,
  };
}

/**
 * Everything one step's run reads once: the workspace's zone, its outreach mode, whether it may spend. A read that
 * fails is this step's error for the tick (the sweep counts it failed and carries on), never a guess that sends.
 */
export async function reachOutRunContext(
  db: Db,
  row: ReachOutRow,
  now: Date,
): Promise<{ step: ReachOutStep; ports: ReachOutRunPorts } | { error: string }> {
  const [tenant, billing, policies, step] = await Promise.all([
    db.from("tenants").select("timezone, status").eq("id", row.tenant_id).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", row.tenant_id).maybeSingle(),
    listPolicies(db, row.tenant_id).then(
      (rows) => ({ rows, error: null as string | null }),
      (e: unknown) => ({ rows: [], error: e instanceof Error ? e.message : String(e) }),
    ),
    stepOf(db, row).then(
      (s) => ({ s, error: null as string | null }),
      (e: unknown) => ({ s: null, error: e instanceof Error ? e.message : String(e) }),
    ),
  ]);
  if (tenant.error) return { error: `tenant: ${tenant.error.message}` };
  if (billing.error) return { error: `billing: ${billing.error.message}` };
  if (policies.error) return { error: `policies: ${policies.error}` };
  if (step.error) return { error: step.error };
  if (!step.s) return { error: "chain_broken" };
  // A paused workspace runs nothing, as the moments do not.
  if (tenant.data?.status === "paused") return { error: "paused" };
  const tz = tenant.data?.timezone || "America/New_York";
  // The outreach row every workspace has (00183); none read as "ask", so a missing row can only wait for its owner.
  const said = policies.rows.find((p) => p.class === "outreach")?.mode;
  const mode = said === "veto" || said === "never" ? said : "ask";
  // No billing row is not permission (every workspace is given one at creation): it may not spend.
  const spend = billing.data ? maySpend(billing.data.mode as BillingMode, billing.data.status as BillingStatus) : false;
  const tenantId = row.tenant_id;

  const ports: ReachOutRunPorts = {
    now: () => now.getTime(),
    workspaceZone: tz,
    mode,
    maySpend: spend,
    alreadyRan: async (stepId, runFor) => {
      const { data, error } = await db
        .from("broadcasts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("playbook_id", stepId)
        .eq("run_for", runFor)
        .maybeSingle();
      if (error) throw new Error(`cannot read the step's runs: ${error.message}`);
      return !!data;
    },
    chainState: async (rootId) => {
      const { data, error } = await db
        .from("broadcasts")
        .select("state")
        .eq("tenant_id", tenantId)
        .eq("audience->>kind", "reach_out")
        .eq("audience->>root_id", rootId)
        .in("state", ["pending_approval", "scheduled", "sending", "sent"]);
      if (error) throw new Error(`cannot read the chain's runs: ${error.message}`);
      const states = (data ?? []).map((r) => r.state);
      if (states.some((s) => s !== "pending_approval")) return "approved";
      return states.length > 0 ? "waiting" : "none";
    },
    audience: (s) =>
      reachOutAudience(db, { tenantId, searchId: s.lead_search_id ?? "", rootId: s.root_id, limit: s.cap_per_run }),
    followers: (s) =>
      reachOutFollowers(db, {
        tenantId,
        stepId: s.id,
        parentId: s.after_playbook_id ?? "",
        afterDays: s.after_days ?? 0,
        limit: s.cap_per_run,
      }),
    domains: async (s) => {
      let q = db.from("sending_domains").select("id").eq("tenant_id", tenantId).eq("state", "verified");
      if (s.domain_ids.length > 0) q = q.in("id", s.domain_ids);
      const { data, error } = await q;
      if (error) throw new Error(`cannot read the workspace's domains: ${error.message}`);
      const out: TimetableDomain[] = [];
      for (const d of data ?? []) {
        const c = await domainCapacityOf(db, d.id, now);
        out.push({ id: d.id, cap: c.clean_since ? domainDailyCap(c.sent_days) : 0, recent: c.recent });
      }
      return out;
    },
    createRun: async (run) => {
      const { data, error } = await db
        .from("broadcasts")
        .insert({ ...run, audience: run.audience as unknown as Json })
        .select("id")
        .single();
      // broadcasts_playbook_run: one run per step per day. Another tick made it first.
      if (error?.code === "23505") return "exists";
      if (error || !data) throw new Error(`cannot make the step's run: ${error?.message ?? "no row"}`);
      return { id: data.id };
    },
    planSends: (rows) => planSends(db, rows),
    notifyWaiting: async (runId, planned, firstAt) => {
      const target = await loadTenantNotifications(db, tenantId);
      await notify(
        { tenantId, notifications: target.notifications, isEnvDefault: target.isEnvDefault },
        {
          kind: "playbook",
          route: "broadcasts",
          about: { type: "broadcast", id: runId },
          subject: `A reach-out waits for you: ${row.name}`,
          body: `${planned} ${planned === 1 ? "email" : "emails"} to businesses your search found, from ${firstWords(tz, firstAt)}. Approve them on Broadcasts, or skip the run.`,
        },
      );
    },
  };
  return { step: step.s, ports };
}
