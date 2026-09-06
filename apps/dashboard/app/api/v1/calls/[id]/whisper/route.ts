import { withRoute } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { requireOperator, recordDecision } from "@/server/verbs";
import { whisperLiveCall } from "@/server/service";
import { requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";

/** One answer's worth. The edge enforces the same cap. */
const MAX_CHARS = 500;

/**
 * POST /api/v1/calls/:id/whisper — {text, trigger?}.
 *
 * A sentence for the phone receptionist, heard by it alone and worked into
 * its next answer. Operator or owner, on a call that is IN PROGRESS: the
 * provider refuses a whisper into an ended call, and so does this route,
 * with a sentence instead of a 4xx from upstream.
 *
 * Order: RLS proves the call is visible → the role door is checked against
 * the call's OWN workspace → the provider takes the words → only then is the
 * decision recorded. A ledger row for a whisper nobody heard would be a
 * record of something that did not happen.
 */
export const POST = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "call");
  await takeRate(ctx.userId, "whisper");
  const body = (await req.json().catch(() => null)) as { text?: unknown; trigger?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) throw new AppError("validation", "Say something for the receptionist to use.");
  if (text.length > MAX_CHARS) {
    throw new AppError("validation", `Keep a whisper under ${MAX_CHARS} characters — it is worked into one answer.`);
  }
  const trigger = body?.trigger === true;

  const { data: call, error } = await ctx.supabase
    .from("calls")
    .select("id, tenant_id, retell_call_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!call) throw new AppError("not_found", "Call not found.", 404);
  await requireOperator(ctx, call.tenant_id);
  if (call.status !== "ongoing") {
    throw new AppError("conflict", "This call is not in progress — there is nobody on the line to whisper to.", 409);
  }

  const sent = await whisperLiveCall(call.retell_call_id, text, trigger);
  if (!sent.ok) {
    throw new AppError(
      "upstream_retell",
      sent.reason === "preview"
        ? "Whispers only work on the production dashboard."
        : `The phone provider did not take the whisper (${sent.reason}). The call may have just ended.`,
      502,
    );
  }
  const decisionId = await recordDecision(ctx, call.tenant_id, "call", call.id, "whisper", { text, trigger });
  return { ok: true, decision_id: decisionId };
});

export const dynamic = "force-dynamic";
