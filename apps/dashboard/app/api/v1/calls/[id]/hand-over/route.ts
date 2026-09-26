import { AppError, parseTenantConfigResult } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { callScope, recordDecision } from "@/server/verbs";
import { handOverLiveCall } from "@/server/conversations/live-call";

/**
 * POST /api/v1/calls/:id/hand-over — pass a call in progress to the
 * business's own line. The receptionist is told the owner is picking up and
 * transfers the caller with the tool it already has; the owner's phone rings,
 * the way it does when a caller asks for a person. The call is the row
 * (callScope): visible under RLS first, then the role judged where the call
 * lives, then the line the workspace has (none is said plainly, with the
 * fix), then the provider, and the decision recorded last — take_over, the
 * verb the Inbox uses for the same intent on a thread.
 */
export const POST = write({
  scope: callScope,
  role: "operator",
  rate: "call_control",
  handle: async ({ ctx, row: call }) => {
    if (call.status !== "ongoing") {
      throw new AppError("conflict", "This call is not in progress — there is nobody on the line to pass to you.", 409);
    }
    const { data, error } = await ctx.supabase
      .from("tenant_config")
      .select("config")
      .eq("tenant_id", call.tenant_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const parsed = parseTenantConfigResult(data?.config);
    const line = parsed.ok ? (parsed.config.brain?.profile?.handoff_number ?? null) : null;
    if (!line) {
      throw new AppError(
        "conflict",
        "This workspace has no line to pass calls to. Add the business's own number under Settings, and the receptionist can hand calls over.",
        409,
      );
    }
    const sent = await handOverLiveCall(call.retell_call_id, line);
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
  },
});

export const dynamic = "force-dynamic";
