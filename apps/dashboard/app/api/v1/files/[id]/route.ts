import { z } from "zod";
import { FILE_NAME_MAX, FILE_SHOWS, POST_CAPTION_MAX } from "@chanlytics/contracts";
import { read, write } from "@/server/shared/route";
import { fileScope, removeFile } from "@/server/files/file";
import { changePiece } from "@/server/posts/caption";
import { readFileRecord } from "@/server/posts/record";

/**
 * GET /api/v1/files/:id — one file, and for a post the photo it came from and what it was asked to be. Every member reads it.
 *
 * PATCH /api/v1/files/:id — `{ name?, shows?, who_in_it?, status?, caption? }`: what a person says of a file. What they name
 * and shelve stays when the look runs again. Who is in it is a person's word: no one, or they agreed. A caption is a made
 * piece's, written where it stands, and kept with how it was made.
 *
 * DELETE — it goes from every page at once, and its bytes, Anthropic's copy and its row by the file_purge job. Only its
 * fingerprint stays, so an import does not bring it back.
 *
 * The handles are in src/server/files/file.ts.
 */
export const GET = read({
  scope: fileScope,
  handle: ({ ctx, member, row }) => readFileRecord(ctx, member, row),
});

export const PATCH = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  input: z.object({
    name: z
      .string()
      .max(FILE_NAME_MAX * 2)
      .optional(),
    shows: z.enum(FILE_SHOWS).optional(),
    who_in_it: z.enum(["no_one", "agreed"]).optional(),
    status: z.enum(["filed", "set_aside"]).optional(),
    caption: z
      .string()
      .max(POST_CAPTION_MAX * 2)
      .optional(),
  }),
  handle: ({ ctx, input, member, row }) => changePiece(ctx, member, row, input),
});

export const DELETE = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member, row }) => removeFile(ctx, member, row),
});
