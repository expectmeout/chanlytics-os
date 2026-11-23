import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { pressVersion, versionInput } from "@/server/posts/version";

/**
 * POST /api/v1/files/:id/version — `{ to }`: a made video's version pressed (00708; the version board). `approve`: this
 * version approved for every place its piece was set for, at each one's time and with its words, the posts still waiting
 * let go in the same step ("Approve version 2", and "Post this one instead" on an older version). `again`: a new version
 * that could not be made drawn once more ("Try again"). Whoever may save a post, on their press alone: the press is the
 * approval, of these bytes and these words. Answers `{ fate }`.
 *
 * The handle is in src/server/posts/version.ts.
 */
export const POST = write({
  scope: fileScope,
  role: "partner",
  rate: "file_instagram",
  input: versionInput,
  handle: ({ ctx, input, member, row }) => pressVersion(ctx, member, row, input),
});
