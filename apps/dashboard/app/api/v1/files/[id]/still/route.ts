import { z } from "zod";
import { FILE_VIDEO_SECONDS_MAX } from "@chanlytics/contracts";
import { read, write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { keepStill, viewStill } from "@/server/files/still";

/** A moment of a video, in seconds from its start: never past the longest a video may be. */
const Moment = z.coerce.number().min(0).max(FILE_VIDEO_SECONDS_MAX);

/**
 * GET /api/v1/files/:id/still?at= — the picture of one moment of a video that is ready, as a still of it would be kept: what
 * the panel that saves a still shows (the content redesign's stage 3). The edge cuts it once; every later look reads Storage.
 *
 * POST — `{ at }`: that moment kept as a photo of the library, as one added by hand would be. Whoever may add photos.
 *
 * The handles are in src/server/files/still.ts.
 */
export const GET = read({
  scope: fileScope,
  query: z.object({ at: Moment }),
  handle: ({ ctx, member, row, input }) => viewStill(ctx, member, row, input.at),
});

export const POST = write({
  scope: fileScope,
  role: "operator",
  rate: "file_upload",
  input: z.object({ at: Moment }),
  handle: ({ ctx, member, row, input }) => keepStill(ctx, member, row, input),
});
