import { z } from "zod";
import { FILE_NAME_MAX, FILE_SHOWS } from "@chanlytics/contracts";
import { read, write } from "@/server/shared/route";
import { changeFile, fileScope, removeFile } from "@/server/files/file";
import { fileRecord } from "@/server/files/post/record";

/**
 * GET /api/v1/files/:id — one file, and for a post the photo it came from and what it was asked to be. Every member reads it.
 *
 * PATCH /api/v1/files/:id — `{ name?, shows?, who_in_it?, status? }`: what a person says of a file. What they name and shelve
 * stays when the look runs again. Who is in it is a person's word: no one, or they agreed.
 *
 * DELETE — it goes from every page at once, and its bytes, Anthropic's copy and its row by the file_purge job. Only its
 * fingerprint stays, so an import does not bring it back.
 *
 * The handles are in src/server/files/file.ts.
 */
export const GET = read({
  scope: fileScope,
  handle: ({ ctx, member, row }) => fileRecord(ctx, member, row),
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
  }),
  handle: ({ ctx, input, member, row }) => changeFile(ctx, member, row, input),
});

export const DELETE = write({
  scope: fileScope,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member, row }) => removeFile(ctx, member, row),
});
