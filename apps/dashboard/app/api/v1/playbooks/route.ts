import type { Json } from "@chanlytics/db";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody } from "@/server/request-guards";
import { recordDecision } from "@/server/verbs";
import { takeRate } from "@/server/rate-limit";
import { tenantFacts } from "@/server/tenant";
import { checkPlaybookInput, listPlaybooks } from "@/server/playbooks";

/**
 * Playbooks: a standing rule that sends one approved template to newly
 * eligible people who said yes, under the workspace's autonomy mode.
 *
 * GET  /api/v1/playbooks — the workspace's playbooks with what their runs
 *      earned, and the business's clock (the hours are its).
 * POST /api/v1/playbooks — { name?, trigger, template_id, params, run_hour?,
 *      cap_per_run?, gap_days?, cadence_days? }. Owner or operator. Checked
 *      the way the send route checks a broadcast; starts running; the
 *      ledger records the start.
 */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const [playbooks, facts] = await Promise.all([listPlaybooks(ctx, tenantId), tenantFacts(ctx.supabase, tenantId)]);
  return { playbooks, timezone: facts.timezone };
});

export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  takeRate(ctx.userId, "playbook");
  const body = (await jsonBody(req)) as Record<string, unknown> | null;
  const v = await checkPlaybookInput(ctx, member.tenantId, body);
  const { data: made, error } = await ctx.supabase
    .from("playbooks")
    .insert({
      tenant_id: member.tenantId,
      name: v.name,
      trigger: v.trigger,
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
  if (error || !made) throw new Error(error?.message ?? "playbook not created");
  const decisionId = await recordDecision(ctx, member.tenantId, "playbook", made.id, "start_playbook", {
    name: v.name, trigger: v.trigger, template: `${v.template_name}/${v.template_language}`, policy_class: v.policy_class, run_hour: v.run_hour, cap_per_run: v.cap_per_run,
  });
  return { id: made.id, name: v.name, state: "running", decision_id: decisionId };
});
