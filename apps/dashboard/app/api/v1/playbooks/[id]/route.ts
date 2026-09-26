import { AppError, PLAYBOOK_STATES, REACH_OUT_IS_NOT_A_MOMENT, triggerOf } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { write } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { playbookScope, recordDecision } from "@/server/verbs";
import { checkPlaybookInput, playbookWriteError, refuseOnArchivedList } from "@/server/playbooks";

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
      if (!(PLAYBOOK_STATES as readonly string[]).includes(state))
        throw new AppError("validation", "A playbook is running or paused.");
      if (state === p.state) return { id, state };
      // A playbook on an archived list stays paused until its list is restored or it is moved (decision 0009).
      if (state === "running") await refuseOnArchivedList(ctx, p);
      const { error } = await ctx.supabase.from("playbooks").update({ state }).eq("id", id);
      if (error) throw new Error(error.message);
      const decisionId = await recordDecision(
        ctx,
        p.tenant_id,
        "playbook",
        id,
        state === "running" ? "start_playbook" : "pause_playbook",
        { name: p.name },
      );
      return { id, state, decision_id: decisionId };
    }

    // A reach-out step is edited on its own sheet (Part 4); here it may only be paused or resumed, above.
    if (triggerOf(p.trigger)?.kind === "reach_out") throw new AppError("conflict", REACH_OUT_IS_NOT_A_MOMENT, 409);
    const v = await checkPlaybookInput(ctx, p.tenant_id, body);
    const { error } = await ctx.supabase
      .from("playbooks")
      .update({
        name: v.name,
        trigger: v.trigger,
        // A playbook moved off a list leaves it (both null); one never on a list names no column 00155 or 00168 adds. A
        // playbook on a list names exactly one of the two (playbooks_one_list).
        ...(v.list_id || v.list_key || p.trigger === "saved_list" ? { list_id: v.list_id, list_key: v.list_key } : {}),
        template_id: v.template_id,
        template_name: v.template_name,
        template_language: v.template_language,
        params: v.params as unknown as Json,
        policy_class: v.policy_class,
        run_hour: v.run_hour,
        cap_per_run: v.cap_per_run,
        gap_days: v.gap_days,
        cadence_days: v.cadence_days,
      })
      .eq("id", id);
    if (error) throw playbookWriteError(error);
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
    const decisionId = await recordDecision(ctx, p.tenant_id, "playbook", id, "pause_playbook", {
      name: p.name,
      deleted: true,
    });
    return { deleted: true, id, decision_id: decisionId };
  },
});
