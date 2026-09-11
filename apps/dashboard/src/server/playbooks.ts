import "server-only";
import { parseParamSpec, type PlaybookDto, type PlaybookPolicyClass, type PlaybookTrigger } from "@chanlytics/contracts";
import { checkPlaybook, type PlaybookInput } from "@chanlytics/core";
import type { RouteContext } from "@/server/with-route";
import { listBroadcasts } from "@/server/broadcasts";
import { templateValuePorts } from "@/server/campaign-ports";

/**
 * Playbooks, read and checked.
 *
 * A playbook row plus what its runs earned: sent, delivered and replied
 * summed over the recent runs (the broadcasts that carry its id), the last
 * run's state, and a run waiting for a person if there is one. The checks
 * are the send route's own, so a playbook can never name a template a
 * broadcast could not send or a slot the workspace cannot fill.
 */
const COLUMNS = "id, name, trigger, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at";

export interface PlaybookTotals {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  lastRun: { id: string; state: string; run_for: string | null; recipient_count: number } | null;
  waiting: { id: string; recipient_count: number; name: string } | null;
}

export type PlaybookListRow = PlaybookDto & { totals: PlaybookTotals };

export async function listPlaybooks(ctx: RouteContext, tenantId: string): Promise<PlaybookListRow[]> {
  const [{ data: rows, error }, runs] = await Promise.all([
    ctx.supabase.from("playbooks").select(COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    listBroadcasts(ctx, tenantId),
  ]);
  if (error) throw new Error(error.message);
  const totals = new Map<string, PlaybookTotals>();
  for (const b of runs) {
    if (!b.playbook_id) continue;
    const t = totals.get(b.playbook_id) ?? { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null };
    t.runs += 1;
    t.sent += b.counts.sent;
    t.delivered += b.counts.delivered;
    t.replied += b.counts.replied;
    t.held += b.counts.skipped + b.counts.failed;
    if (!t.lastRun) t.lastRun = { id: b.id, state: b.state, run_for: b.run_for, recipient_count: b.recipient_count };
    if (b.state === "pending_approval" && !t.waiting) t.waiting = { id: b.id, recipient_count: b.recipient_count, name: b.name };
    totals.set(b.playbook_id, t);
  }
  return (rows ?? []).map((r) => ({
    ...(r as unknown as Omit<PlaybookDto, "params" | "trigger" | "policy_class" | "state">),
    trigger: r.trigger as PlaybookTrigger,
    policy_class: r.policy_class as PlaybookPolicyClass,
    state: r.state as PlaybookDto["state"],
    params: Array.isArray(r.params) ? (r.params as unknown[]).map((p) => parseParamSpec(p) ?? { kind: "text" as const, value: String(p) }) : [],
    totals: totals.get(r.id) ?? { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null },
  }));
}

export type { PlaybookInput };

/** Everything a playbook names, checked the way the send route checks a broadcast: core's checkPlaybook over this workspace's template and link. */
export async function checkPlaybookInput(ctx: RouteContext, tenantId: string, body: Record<string, unknown> | null): Promise<PlaybookInput> {
  return checkPlaybook(templateValuePorts(ctx, tenantId), body);
}
