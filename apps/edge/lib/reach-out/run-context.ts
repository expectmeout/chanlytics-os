/**
 * A reach-out step's run, on the edge (Reach out, Part 3): the ports core's runReachOut asks, over the database. The
 * rules are core's (packages/core/src/campaigns/run-reach-out.ts); this is the reading and writing they need. The
 * playbooks sweep comes here for each reach-out step due today.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  chainDraftLoad,
  emitEvent,
  handRun,
  leadNamesByIds,
  leadsLeaveSequence,
  reachOutAudience,
  reachOutFedByOf,
  reachOutFollowers,
  sequenceModesOf,
  workspaceMaySpend,
  type Database,
  type Json,
} from "../packages/db.js";
import type { HandStep, HandStepPorts, ReachOutRunPorts, ReachOutStep } from "../packages/core.js";
import { handOf, waitEndsWords, runRoute } from "../packages/contracts.js";
import { stepSenders } from "./senders.js";
import { notify } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { logger } from "../log.js";

type Db = SupabaseClient<Database>;
export type ReachOutRow = Database["public"]["Tables"]["sequence_steps"]["Row"];

/** When the first email of a run goes, in the workspace's words: "Monday 9:30 AM". */
const firstWords = (tz: string, atMs: number): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", hour: "numeric", minute: "2-digit" }).format(
    new Date(atMs),
  );

/**
 * The step as the verb reads it: its sequence's first step (the root, whose id is the sequence's, 00440), the chain's
 * state (a paused root pauses every step of it), what feeds it (the root's search: a list of via chosen or import, else
 * the finder's, 00426), and who sends it (the root's owner_sends, 00429). A hand step (00228) has its hand and no
 * template. Null when its root cannot be found, or the row is neither.
 */
async function stepOf(db: Db, row: ReachOutRow): Promise<ReachOutStep | HandStep | null> {
  let root = row;
  if (row.sequence_id !== row.id) {
    const { data, error } = await db
      .from("sequence_steps")
      .select("*")
      .eq("tenant_id", row.tenant_id)
      .eq("id", row.sequence_id)
      .maybeSingle();
    if (error) throw new Error(`cannot read the step's chain: ${error.message}`);
    if (!data) return null;
    root = data;
  }
  if (root.after_step_id) return null;
  const fedBy = await reachOutFedByOf(db, row.tenant_id, root.lead_search_id);
  const common: Omit<HandStep, "hand"> = {
    id: row.id,
    root_id: root.id,
    tenant_id: row.tenant_id,
    name: row.name,
    trigger: row.trigger === "after_step" ? "after_step" : "lead_first",
    state: row.state === "running" && root.state === "running" ? "running" : "paused",
    lead_search_id: row.lead_search_id,
    fed_by: fedBy,
    include_unconfirmed: root.include_unconfirmed === true,
    after_playbook_id: row.after_step_id,
    after_days: row.after_days,
    gap_minutes: row.gap_minutes ?? 0,
    mailbox_ids: row.mailbox_ids ?? [],
    owner_sends: root.owner_sends === true,
    cap_per_run: row.cap_per_run,
    words_ok_at: row.words_ok_at,
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
  // The leads it refuses for good, passed over: their places end with why (00455).
  passOver: (rootId, leads) => leadsLeaveSequence(db, { tenantId, sequenceId: rootId, leads }),
});

/**
 * Everything one step's run reads once: the workspace's zone, its sequence's mode, whether it may spend. A read that
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
    // Its sequence's mode (decision 0064), the one reading the dashboard's chains take too. Cold email never sends on
    // its own, so a mode it cannot take reads as ask.
    sequenceModesOf(db, row.tenant_id, [row.sequence_id]).then(
      (modes) => ({ mode: modes.get(row.sequence_id) === "veto" ? ("veto" as const) : ("ask" as const), error: null }),
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
        .from("sequence_batches")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("step_id", stepId)
        .eq("run_for", runFor)
        .maybeSingle();
      if (error) throw new Error(`cannot read the step's runs: ${error.message}`);
      return !!data;
    },
    // A run waiting for its owner holds the chain, whichever run it is: under ask they would pile up unanswered.
    chainWaits: async (rootId) => {
      const { data, error } = await db
        .from("sequence_batches")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("audience->>kind", "reach_out")
        .eq("audience->>root_id", rootId)
        .eq("state", "pending_approval")
        .limit(1);
      if (error) throw new Error(`cannot read the chain's runs: ${error.message}`);
      return (data ?? []).length > 0;
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
    // The step's mailboxes and those its later leads keep, with their days (senders.ts, as the replan reads them).
    mailboxes: (s, also) => stepSenders(db, { tenantId, named: s.mailbox_ids, also, at: now }),
    // What a reach-out its owner sends holds, of the day and in all: its day's share and its owner's pile.
    draftLoad: (rootId, runFor) => chainDraftLoad(db, { tenantId, rootId, runFor }),
    planRun: async (run, sends) => {
      const { data, error } = await db.rpc("reach_out_plan_run", {
        p_run: run as unknown as Json,
        p_sends: sends as unknown as Json,
      });
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
        { tenantId, ...target },
        {
          kind: "playbook",
          // The row opens the run it is about, where its emails are approved (as a playbook's does, playbooks.ts notify).
          route: runRoute(runId),
          about: { type: "broadcast", id: runId },
          subject: `A reach-out waits for you: ${row.name}`,
          // How its wait ends is the wait rule's (contracts waitEndsWords, leads_batch): it has no day to pass.
          body: `${planned} ${planned === 1 ? "email" : "emails"} to businesses your search found, from ${firstWords(tz, firstAt)}. Approve them in Sent, or skip the run. ${waitEndsWords("leads_batch")}.`,
        },
      );
    },
  };
  return { step: step.s, ports };
}
