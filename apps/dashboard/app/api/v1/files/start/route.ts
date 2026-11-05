import { z } from "zod";
import { FILE_BYTES_MAX, FILE_MIMES, FILE_WORDS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { startUpload } from "@/server/files";

/**
 * POST /api/v1/files/start — `{ mime, bytes }`: a member's photo about to be sent, and where to send it. Whoever may change
 * the workspace's settings; the door asks too, and says when the workspace is full. There is no file yet, and what is said
 * here is only a claim: POST files/[id]/done proves it from the bytes.
 *
 * The handle is in src/server/files.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "file_upload",
  input: z.object({
    mime: z.enum(FILE_MIMES, { error: FILE_WORDS.wrongType }),
    bytes: z.number().int().positive().max(FILE_BYTES_MAX, { error: FILE_WORDS.tooBig }),
  }),
  handle: ({ ctx, input, member }) => startUpload(ctx, member, input),
});
