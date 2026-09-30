import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { callScope, recordDecision } from "@/server/verbs";
import { whisperLiveCall } from "@/server/conversations/live-call";

const MAX_CHARS = 500;

const Body = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Say something for the receptionist to use.")
    .max(MAX_CHARS, `Keep a whisper under ${MAX_CHARS} characters — it is worked into one answer.`),
  trigger: z.boolean().optional(),
});

/**
 * POST /api/v1/calls/:id/whisper — { text, trigger? }: a sentence into a
 * live call, for the phone receptionist to work into its next answer when
 * it fits (never verbatim, never forced). The call is the row (callScope):
 * visible under RLS first, then the role judged where the call lives, then
 * the provider, and the decision recorded last, once the whisper is in.
 */
export const POST = write({
  scope: callScope,
  role: "operator",
  rate: "whisper",
  input: Body,
  handle: async ({ ctx, row: call, input }) => {
    const text = input.text;
    const trigger = input.trigger === true;
    if (call.status !== "ongoing") {
      throw new AppError("conflict", "This call is not in progress — there is nobody on the line to whisper to.", 409);
    }
    const sent = await whisperLiveCall(
      call.retell_call_id,
      { text, trigger },
      { workspace: call.tenant_id, user: ctx.userId },
    );
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
  },
});

export const dynamic = "force-dynamic";
