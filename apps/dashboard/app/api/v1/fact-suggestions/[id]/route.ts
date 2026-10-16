import { z } from "zod";
import { write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { answerFactOf } from "@/server/receptionist/fact-notes";

/**
 * POST /api/v1/fact-suggestions/:id — { keep: boolean }
 *
 * A member answers a note suggested from an owner's correction (decision 0063): Keep adds it to what the receptionist
 * reads through the settings' own write (the version check, the history, settings.changed), then marks it kept; Dismiss
 * marks it dismissed (00448 fact_suggestion_answer). A change to the settings, so the settings' role and rate: the owner
 * and a partner. One of another workspace is not found.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({ keep: z.boolean() }).strict(),
  handle: ({ ctx, member, input }) => answerFactOf(ctx, member, requireUuid(ctx.params.id, "suggestion"), input.keep),
});
