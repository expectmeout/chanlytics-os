import { z } from "zod";
import { FILE_YES_USES } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { takeBackYes } from "@/server/files/yes";

/**
 * POST /api/v1/files/:id/yes/back — `{ uses? }`: a yes for this file taken back, for the uses named or every use (00663;
 * the content PRD's section 8). In the same transaction every post of the file, and of every piece drawn from it, that
 * is still waiting is held, and every one already up or on its way is answered, for the owner to take down where it is.
 * AI's card presses it where it waited for the owner, and a yes's Undo presses it too. Answers what was held and what is
 * up.
 *
 * The handle is in src/server/files/yes.ts.
 */
export const POST = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  input: z.strictObject({
    uses: z.array(z.enum(FILE_YES_USES)).max(FILE_YES_USES.length).optional(),
  }),
  handle: ({ ctx, member, row, input }) =>
    takeBackYes(ctx, member.tenantId, { fileId: row.id, uses: input.uses ?? null }),
});
