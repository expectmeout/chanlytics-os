import type { Json } from "@chanlytics/db";
import { read, write, workspace } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { recordDecision } from "@/server/verbs";
import { checkPlaybookInput, playbookWriteError } from "@/server/campaigns/playbooks";
import { load, readerContext } from "@/server/readers";
import { playbooks } from "@/server/readers/playbooks";

/**
 * Playbooks: a standing rule that sends one approved template to newly
 * eligible people who said yes, under the workspace's autonomy mode.
 *
 * GET  /api/v1/playbooks — the workspace's playbooks with what their runs
 *      earned, the business's clock (the hours are its), who any broadcast
 *      reached this week (the breath the page shows), each trigger's pool
 *      over everyone, counted the way a run counts it, and the workspace's
 *      lists a playbook may run on, each with its own pool ("list:<id>"), and
 *      whether deals are on here (`deals_on`, 0008): the proposal follow-up is
 *      offered, and counted by the workspace's pace, only where they are (0006).
 * POST /api/v1/playbooks — { name?, trigger, template_id, params, run_hour?,
 *      cap_per_run?, gap_days?, cadence_days? }. Owner or operator. Checked
 *      the way the send route checks a broadcast (checkPlaybookInput, in its
 *      own words, so the body is the route's own to read); starts running;
 *      the ledger records the start.
 *
 * The GET's body is its reader's (readers/playbooks.ts), which Ask's campaigns.playbooks reads too.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), playbooks, undefined)).data,
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "playbook",
  handle: async ({ ctx, req, member }) => {
    const body = (await jsonBody(req)) as Record<string, unknown> | null;
    const v = await checkPlaybookInput(ctx, member.tenantId, body);
    const { data: made, error } = await ctx.supabase
      .from("playbooks")
      .insert({
        tenant_id: member.tenantId,
        name: v.name,
        trigger: v.trigger,
        // Named only when there is a list: a database 00155 (or 00168) has not reached takes every other playbook as
        // before.
        ...(v.list_id ? { list_id: v.list_id } : {}),
        ...(v.list_key ? { list_key: v.list_key } : {}),
        template_id: v.template_id,
        template_name: v.template_name,
        template_language: v.template_language,
        params: v.params as unknown as Json,
        policy_class: v.policy_class,
        state: "running",
        run_hour: v.run_hour,
        cap_per_run: v.cap_per_run,
        gap_days: v.gap_days,
        cadence_days: v.cadence_days,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) throw playbookWriteError(error);
    if (!made) throw new Error("playbook not created");
    const decisionId = await recordDecision(ctx, member.tenantId, "playbook", made.id, "start_playbook", {
      name: v.name,
      trigger: v.trigger,
      template: `${v.template_name}/${v.template_language}`,
      policy_class: v.policy_class,
      run_hour: v.run_hour,
      cap_per_run: v.cap_per_run,
    });
    return { id: made.id, name: v.name, state: "running", decision_id: decisionId };
  },
});
