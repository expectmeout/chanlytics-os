import { z } from "zod";
import { FILE_GOOGLE_WORDS_MAX } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { postFileToGoogle, takeFileOffGoogle } from "@/server/posts/google";
import { pullFilePost } from "@/server/posts/instagram";

/**
 * POST /api/v1/files/:id/google — `{ summary, when? }`: a kept post goes on the business's Google profile, in the business's name,
 * with those words under it. Whoever may save one, on their press alone, and it is public as soon as Google has looked at it.
 * Answers `{ name, search_url, state }`. With a `when` later than two minutes on (00616), it waits for its time: the picture is
 * drawn now, its job asks Google then, and it answers `{ name: null, search_url: null, state: "scheduled" }`.
 *
 * DELETE — `{ name }`: that post comes off the profile. It stays in Files. Or `{ post_id }`: Don't post, for one set for its time
 * (00616), up to the moment it is sent.
 *
 * The handles are in src/server/posts/google.ts.
 */
export const POST = write({
  scope: fileScope,
  role: "partner",
  rate: "file_google",
  input: z.object({
    summary: z.string().trim().min(1).max(FILE_GOOGLE_WORDS_MAX),
    when: z.iso.datetime({ offset: true }).optional(),
  }),
  handle: ({ ctx, input, member, row }) => postFileToGoogle(ctx, member, row, input),
});

export const DELETE = write({
  scope: fileScope,
  role: "partner",
  rate: "file_google",
  input: z.union([z.object({ name: z.string().min(1).max(300) }), z.object({ post_id: z.uuid() })]),
  handle: async ({ ctx, input, member, row }): Promise<{ pulled: true } | { down: true }> =>
    "post_id" in input
      ? pullFilePost(ctx, member, row, { ...input, place: "google" })
      : takeFileOffGoogle(ctx, member, row, input),
});
