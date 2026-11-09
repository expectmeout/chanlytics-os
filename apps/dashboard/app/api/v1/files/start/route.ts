import { z } from "zod";
import { FILE_MIMES, FILE_VIDEO_BYTES_MAX, FILE_VIDEO_SECONDS_MAX, FILE_WORDS } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { startUpload } from "@/server/files/upload";

/** A file's name as a phone or a desk gives it; only its words are kept (contracts fileNameOf). */
const CHOSEN_NAME_MAX = 255;

/**
 * POST /api/v1/files/start — `{ mime, bytes }`, and for a video `{ name, seconds, fingerprint }` besides: a member's photo or
 * video about to be sent, and where to send it. Whoever may change the workspace's settings; the door asks too, and says when the
 * workspace is full. A photo is no file yet, and what is said here is only a claim: POST files/[id]/done proves it from the
 * bytes. A video is sent to the video platform, which proves it: everything the browser knows goes now, so the platform's word
 * alone can finish it, and a clip already here is answered as one before a byte goes.
 *
 * The handle is in src/server/files/upload.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "file_upload",
  input: z.object({
    mime: z.enum(FILE_MIMES, { error: FILE_WORDS.wrongType }),
    // A photo's is held to its own cap where it is read (upload.ts): this is a video's, the larger.
    bytes: z.number().int().positive().max(FILE_VIDEO_BYTES_MAX, { error: FILE_WORDS.video.tooBig }),
    name: z.string().max(CHOSEN_NAME_MAX).optional(),
    seconds: z
      .number()
      .positive()
      .max(FILE_VIDEO_SECONDS_MAX, { error: FILE_WORDS.video.tooLong })
      .nullable()
      .optional(),
    fingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  }),
  handle: ({ ctx, input, member }) => startUpload(ctx, member, input),
});
