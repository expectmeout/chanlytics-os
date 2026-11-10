import { z } from "zod";
import { FILE_MIMES, FILE_WORDS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { finishUpload } from "@/server/files/upload";

/** A file's name as a phone or a desk gives it; only its words are kept (contracts fileNameOf). */
const CHOSEN_NAME_MAX = 255;

/**
 * POST /api/v1/files/:id/done — `{ name, mime }`: a member's photo has been sent. Its first bytes are read and proven here, and
 * a file is made of them with its look on the ledger, or it is answered with the file it twins. Asked twice, it answers the
 * same. The id is the one files/start answered, and it names a place in this workspace's own folder, so a guess finds nothing.
 * A video's bytes are the video platform's to prove: done only says they have all gone, so its tile says it is being made ready.
 *
 * The handle is in src/server/files/upload.ts.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "file_upload",
  input: z.object({
    name: z.string().max(CHOSEN_NAME_MAX),
    mime: z.enum(FILE_MIMES, { error: FILE_WORDS.wrongType }),
  }),
  handle: ({ ctx, input, member }) => finishUpload(ctx, member, requireUuid(ctx.params.id, "file"), input),
});
