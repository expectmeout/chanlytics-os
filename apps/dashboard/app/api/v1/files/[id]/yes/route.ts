import { z } from "zod";
import { FILE_YES_USES, UUID } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { recordYes } from "@/server/files/yes";

/**
 * POST /api/v1/files/:id/yes — `{ uses, who, thread_id? }`: a yes said to AI for this file, for each use named (post, ad,
 * reply, cold_email), by who the owner named, in the conversation it was said in (00665; the content PRD's step L4). AI's
 * card presses it where it waited for the owner; a yes said in their own words is kept as the turn is saved. The same
 * person's yes for a use that stands is not kept twice. The door asks the settings permission itself, as every change to
 * a file does. Answers what was kept, what already stood, and the file's yeses now.
 *
 * The handle is in src/server/files/yes.ts.
 */
export const POST = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  input: z.strictObject({
    uses: z.array(z.enum(FILE_YES_USES)).min(1).max(FILE_YES_USES.length),
    who: z.string().trim().min(1).max(120),
    thread_id: z.string().regex(UUID, "Which conversation?").optional(),
  }),
  handle: async ({ ctx, member, row, input }) => {
    const kept = await recordYes(ctx, member.tenantId, {
      fileId: row.id,
      uses: input.uses,
      who: input.who,
      threadId: input.thread_id ?? null,
    });
    return { kept: kept.kept, again: kept.again, yes_for: kept.yesFor, yes_back: kept.yesBack };
  },
});
