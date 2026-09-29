/**
 * A reach-out step's run, on the edge (Reach out, Part 3): the ports core's runReachOut asks, over the database. The
 * rules are core's (packages/core/src/campaigns/run-reach-out.ts); this is the reading and writing they need. The
 * playbooks sweep comes here for each reach-out step due today.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  domainCapacityOf,
  emitEvent,
  handRun,
  leadNamesByIds,
  outreachModeOf,
  reachOutAudience,
  reachOutFollowers,
  workspaceMaySpend,
  type Database,
  type Json,
} from "../packages/db.js";
import type { HandStep, HandStepPorts, ReachOutRunPorts, ReachOutStep } from "../packages/core.js";
import { domainDailyCap, handOf, reachOutSendsFrom, type TimetableDomain } from "../packages/contracts.js";
import { notify } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { logger } from "../log.js";

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
 * The step as the verb reads it: its chain's root, and the chain's state (a paused root pauses every step of it). A
 * hand step (00228) has its hand and no template. Null when its root cannot be found within a chain's length, or the
 * row is neither.
 */
async function stepOf(db: Db, row: ReachOutRow): Promise<ReachOutStep | HandStep | null> {
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
  const common: Omit<HandStep, "hand"> = {
    id: row.id,
    root_id: root.id,
    tenant_id: row.tenant_id,
    name: row.name,
    trigger: row.trigger === "after_step" ? "after_step" : "lead_first",
    state: row.state === "running" && root.state === "running" ? "running" : "paused",
    lead_search_id: row.lead_search_id,
    include_unconfirmed: root.include_unconfirmed === true,
    after_playbook_id: row.after_playbook_id,
    after_days: row.after_days,
    gap_minutes: row.gap_minutes ?? 0,
    domain_ids: row.domain_ids ?? [],
    cap_per_run: row.cap_per_run,
  };
  const hand = handOf(row.hand);
  if (hand) return { ...common, hand };
  const { template_id, template_name, template_language } = row;
  return template_id && template_name && template_language
    ? { ...common, template_id, template_name, template_language }
    : null;
}

/**
 * What a later step reads and writes, an email step's or a hand step's: its followers (the one reach), and for a hand
 * step the businesses' names and its run, written whole (00228).
 */
const laterStepPorts = (db: Db, tenantId: string): HandStepPorts => ({
  followers: (s) =>
    reachOutFollowers(db, {
      tenantId,
      stepId: s.id,
      parentId: s.after_playbook_id ?? "",
      afterDays: s.after_days ?? 0,
      limit: s.cap_per_run,
    }),
  businessNames: (leadIds) => leadNamesByIds(db, tenantId, leadIds),
  handRun: (p) => handRun(db, { tenantId, ...p }),
});

/**
 * Everything one step's run reads once: the workspace's zone, its outreach mode, whether it may spend. A read that
 * fails is this step's error for the tick (the sweep counts it failed and carries on), never a guess that sends.
 */
export async function reachOutRunContext(
  db: Db,
  row: ReachOutRow,
  now: Date,
): Promise<{ step: ReachOutStep | HandStep; ports: ReachOutRunPorts & HandStepPorts } | { error: string }> {
  const [tenant, billing, policies, step] = await Promise.all([
    db.from("tenants").select("timezone, status").eq("id", row.tenant_id).maybeSingle(),
    // The one reading of "may this workspace spend on reach-out" (the check asks it too).
    workspaceMaySpend(db, row.tenant_id).then(
      (spend) => ({ spend, error: null as string | null }),
      (e: unknown) => ({ spend: false, error: e instanceof Error ? e.message : String(e) }),
    ),
    // The one reading of the outreach row (the dashboard's chains ask it too).
    outreachModeOf(db, row.tenant_id).then(
      (mode) => ({ mode, error: null as string | null }),
      (e: unknown) => ({ mode: "ask" as const, error: e instanceof Error ? e.message : String(e) }),
    ),
    stepOf(db, row).then(
      (s) => ({ s, error: null as string | null }),
      (e: unknown) => ({ s: null, error: e instanceof Error ? e.message : String(e) }),
    ),
  ]);
  if (tenant.error) return { error: `tenant: ${tenant.error.message}` };
  if (billing.error) return { error: `billing: ${billing.error}` };
  if (policies.error) return { error: `policies: ${policies.error}` };
  if (step.error) return { error: step.error };
  if (!step.s) return { error: "chain_broken" };
  // A paused workspace runs nothing, as the moments do not.
  if (tenant.data?.status === "paused") return { error: "paused" };
  const tz = tenant.data?.timezone || "America/New_York";
  const mode = policies.mode;
  // No billing row is not permission (every workspace is given one at creation): it may not spend.
  const spend = billing.spend;
  const tenantId = row.tenant_id;

  const ports: ReachOutRunPorts & HandStepPorts = {
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
      // A run waiting for its owner holds the chain, whichever run it is: under ask they would pile up unanswered.
      if (states.includes("pending_approval")) return "waiting";
      return states.length > 0 ? "approved" : "none";
    },
    // Twice the step's share: a lead the run skips (no open hour all week) leaves room for the next, not a short day.
    audience: (s) =>
      reachOutAudience(db, {
        tenantId,
        searchId: s.lead_search_id ?? "",
        limit: s.cap_per_run * 2,
        includeUnconfirmed: s.include_unconfirmed,
      }),
    ...laterStepPorts(db, tenantId),
    domains: async (s) => {
      let q = db.from("sending_domains").select("id, state, clean_since").eq("tenant_id", tenantId);
      if (s.domain_ids.length > 0) q = q.in("id", s.domain_ids);
      const { data, error } = await q;
      if (error) throw new Error(`cannot read the workspace's domains: ${error.message}`);
      const out: TimetableDomain[] = [];
      for (const d of (data ?? []).filter((r) => reachOutSendsFrom(r, s.domain_ids))) {
        const c = await domainCapacityOf(db, d.id, now);
        out.push({ id: d.id, cap: c.clean_since ? domainDailyCap(c.sent_days) : 0, recent: c.recent });
      }
      return out;
    },
    planRun: async (run, sends) => {
      const { data, error } = await db.rpc("reach_out_plan_run", {
        p_run: run as unknown as Json,
        p_sends: sends as unknown as Json,
      } as never);
      if (error) throw new Error(`cannot plan the step's run: ${error.message}`);
      const r = (data ?? {}) as { id?: string; exists?: boolean };
      if (r.exists) return "exists";
      if (!r.id) throw new Error("cannot plan the step's run: no run came back");
      return { id: r.id };
    },
    recordRun: async (run, counts) => {
      const data = { run_for: run.run_for, broadcast_id: run.id, state: run.state, ...counts, reach_out: true };
      await emitEvent(db, tenantId, "playbook.run", "playbook", run.playbook_id, data).catch(() => {});
      // Scheduled without its owner's yes: the system's decision, under the mode the owner chose (veto).
      if (run.state === "scheduled") {
        const { error } = await db.from("decisions").insert({
          tenant_id: tenantId,
          subject_type: "broadcast",
          subject_id: run.id,
          verb: "send_broadcast",
          actor_type: "system",
          actor_user_id: null,
          payload: {
            name: run.name,
            playbook_id: run.playbook_id,
            recipients: run.recipient_count,
            mode: mode,
            reach_out: true,
          } as Json,
        });
        // The run is whole already: a decision that could not be written is said, never the run's failure.
        if (error)
          logger({ tenant_id: tenantId }).error("reach_out_decision_unwritten", {
            broadcast_id: run.id,
            error: error.message,
          });
      }
    },
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
