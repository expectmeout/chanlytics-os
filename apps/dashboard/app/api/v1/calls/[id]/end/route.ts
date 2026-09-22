import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { callScope, recordDecision } from "@/server/verbs";
import { stopLiveCall } from "@/server/service";

/**
 * POST /api/v1/calls/:id/end — end a call in progress. The call is the row
 * (callScope): visible under RLS first, then the role judged where the call
 * lives, then the provider, and the decision recorded last, once the call is
 * down. A ledger that cannot take the row after the call is gone is said in
 * the log and in the answer, never as a failure the page would report as
 * "not ended" over a dead line — a row for an end that did not happen would
 * be the worse lie.
 */
export const POST = write({
  scope: callScope,
  role: "operator",
  rate: "call_control",
  handle: async ({ ctx, row: call }) => {
    if (call.status !== "ongoing") {
      throw new AppError("conflict", "This call is not in progress — there is nobody on the line to end.", 409);
    }
    const done = await stopLiveCall(call.retell_call_id);
    if (!done.ok) {
      throw new AppError(
        "upstream_retell",
        done.reason === "preview"
          ? "Calls can only be ended from the production dashboard."
          : `The phone provider did not end the call (${done.reason}). It may have just ended on its own.`,
        502,
      );
    }
    let decision_id: string | null = null;
    try {
      decision_id = await recordDecision(ctx, call.tenant_id, "call", call.id, "end_call", {});
    } catch (e) {
      console.error(
        "end_call_unrecorded",
        JSON.stringify({ call: call.id, error: e instanceof Error ? e.message : String(e) }),
      );
    }
    return { ok: true, decision_id };
  },
});

export const dynamic = "force-dynamic";
