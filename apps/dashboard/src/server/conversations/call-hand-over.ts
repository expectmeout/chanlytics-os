/**
 * Passing a call in progress to the business's own line (app/api/v1/calls/:id/hand-over). The call is the row the route
 * loaded (callScope); here are the checks on it, the line the workspace has, the provider's transfer (live-call.ts) and
 * the decision recorded last. The route declares who may and how often.
 */
import { AppError, parseTenantConfigResult } from "@chanlytics/contracts";
import { configRowOf } from "@/server/workspace/config-row";
import { recordDecision, type VerbCall } from "@/server/verbs";
import { handOverLiveCall } from "@/server/conversations/live-call";
import type { RouteContext } from "@/server/with-route";

export async function passCallToOwnerLine(ctx: RouteContext, call: VerbCall) {
  if (call.status !== "ongoing") {
    throw new AppError("conflict", "This call is not in progress — there is nobody on the line to pass to you.", 409);
  }
  const row = await configRowOf(ctx.supabase, call.tenant_id);
  const parsed = parseTenantConfigResult(row?.config);
  const line = parsed.ok ? (parsed.config.brain?.profile?.handoff_number ?? null) : null;
  if (!line) {
    throw new AppError(
      "conflict",
      "This workspace has no line to pass calls to. Add the business's own number under Settings, and the receptionist can hand calls over.",
      409,
    );
  }
  const sent = await handOverLiveCall(call.retell_call_id, line, { workspace: call.tenant_id, user: ctx.userId });
  if (!sent.ok) {
    throw new AppError(
      "upstream_retell",
      sent.reason === "preview"
        ? "Calls can only be passed over from the production dashboard."
        : `The phone provider did not take the hand-over (${sent.reason}). The call may have just ended.`,
      502,
    );
  }
  const decision_id = await recordDecision(ctx, call.tenant_id, "call", call.id, "take_over", {
    how: "transfer",
    line,
  });
  return { ok: true, decision_id, line };
}
