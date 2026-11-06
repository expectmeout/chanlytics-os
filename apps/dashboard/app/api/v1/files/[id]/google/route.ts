import { z } from "zod";
import { FILE_GOOGLE_WORDS_MAX } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { fileScope } from "@/server/files/file";
import { postFileToGoogle, takeFileOffGoogle } from "@/server/files/post/google";

/**
 * POST /api/v1/files/:id/google — `{ summary }`: a kept post goes on the business's Google profile, in the business's name, with those
 * words under it. Whoever may save one, on their press alone, and it is public as soon as Google has looked at it. Answers
 * `{ name, search_url, state }`.
 *
 * DELETE — `{ name }`: that post comes off the profile. It stays in Files.
 *
 * The handles are in src/server/files/post/google.ts.
 */
export const POST = write({
  scope: fileScope,
  role: "partner",
  rate: "file_google",
  input: z.object({ summary: z.string().trim().min(1).max(FILE_GOOGLE_WORDS_MAX) }),
  handle: ({ ctx, input, member, row }) => postFileToGoogle(ctx, member, row, input),
});

export const DELETE = write({
  scope: fileScope,
  role: "partner",
  rate: "file_google",
  input: z.object({ name: z.string().min(1).max(300) }),
  handle: ({ ctx, input, member, row }) => takeFileOffGoogle(ctx, member, row, input),
});
