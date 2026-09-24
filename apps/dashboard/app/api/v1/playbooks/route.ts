import type { Json } from "@chanlytics/db";
import { dealPaceOf, dealsAreOn } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { recordDecision } from "@/server/verbs";
import { tenantFacts } from "@/server/tenant";
import { checkPlaybookInput, listPlaybooks, playbookWriteError, recentTouches, triggerPools } from "@/server/playbooks";
import { dealPaceRead, sellsByOf } from "@/server/deals";

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
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const tenantId = member.tenantId;
    const now = new Date();
    const [playbooks, facts, touched, sellsBy, paceRead] = await Promise.all([
      listPlaybooks(ctx, tenantId),
      tenantFacts(ctx.supabase, tenantId),
      recentTouches(ctx, tenantId, now),
      sellsByOf(ctx, tenantId),
      // The pace the edge's sweep reads (packages/db yesesSince): the follow-up's pool is the run's own.
      dealPaceRead(ctx, tenantId, now),
    ]);
    const dealsOn = dealsAreOn(sellsBy);
    const { pools, calendar, lists, people } = await triggerPools(ctx, tenantId, touched, facts.timezone, now, {
      on: dealsOn,
      pace: dealsOn ? dealPaceOf(paceRead) : null,
    });
    return {
      playbooks,
      timezone: facts.timezone,
      touched,
      pools,
      calendar,
      lists,
      people_lists: people,
      deals_on: dealsOn,
    };
  },
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
