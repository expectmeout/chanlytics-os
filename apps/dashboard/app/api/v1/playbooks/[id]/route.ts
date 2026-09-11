import { AppError, PLAYBOOK_STATES } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { write } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { playbookScope, recordDecision } from "@/server/verbs";
import { checkPlaybookInput } from "@/server/playbooks";

/**
 * One playbook.
 *
 * PUT    /api/v1/playbooks/:id — { state } pauses or resumes (the ledger
 *        records which); any other field re-checks the whole playbook the
 *        way a new one is checked and rewrites it.
 * DELETE /api/v1/playbooks/:id — the rule goes; its runs stay as broadcasts
 *        with their numbers. Recorded as a pause with `deleted`.
 *
 * Owner or operator; the playbook is the row (playbookScope), found under
 * RLS, so one the caller cannot see is 404, and the role judged where it
 * lives.
 */
export const PUT = write({
  scope: playbookScope,
  role: "operator",
  rate: "playbook",
  handle: async ({ ctx, req, row: p }) => {
    const id = p.id;
    const body = (await jsonBody(req)) as Record<string, unknown> | null;

    const onlyState = body && Object.keys(body).length === 1 && typeof body.state === "string";
    if (onlyState) {
      const state = body!.state as string;
      if (!(PLAYBOOK_STATES as readonly string[]).includes(state)) throw new AppError("validation", "A playbook is running or paused.");
      if (state === p.state) return { id, state };
      const { error } = await ctx.supabase.from("playbooks").update({ state }).eq("id", id);
      if (error) throw new Error(error.message);
      const decisionId = await recordDecision(ctx, p.tenant_id, "playbook", id, state === "running" ? "start_playbook" : "pause_playbook", { name: p.name });
      return { id, state, decision_id: decisionId };
    }

    const v = await checkPlaybookInput(ctx, p.tenant_id, body);
    const { error } = await ctx.supabase
      .from("playbooks")
      .update({
        name: v.name, trigger: v.trigger, template_id: v.template_id, template_name: v.template_name, template_language: v.template_language,
        params: v.params as unknown as Json, policy_class: v.policy_class, run_hour: v.run_hour, cap_per_run: v.cap_per_run, gap_days: v.gap_days, cadence_days: v.cadence_days,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { id, name: v.name, state: p.state };
  },
});

export const DELETE = write({
  scope: playbookScope,
  role: "operator",
  rate: "playbook",
  handle: async ({ ctx, row: p }) => {
    const id = p.id;
    const { error, count } = await ctx.supabase.from("playbooks").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(error.message);
    if (!count) throw new AppError("not_found", "Playbook not found.", 404);
    const decisionId = await recordDecision(ctx, p.tenant_id, "playbook", id, "pause_playbook", { name: p.name, deleted: true });
    return { deleted: true, id, decision_id: decisionId };
  },
});
