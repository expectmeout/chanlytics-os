import { z } from "zod";
import { INSTAGRAM_POST_KINDS, OwnersFactSchema, POST_CAPTION_MAX, PostAboutSchema } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { postFileToInstagram, pullFilePost } from "@/server/posts/instagram";

/**
 * POST /api/v1/files/:id/instagram — `{ as, caption?, when?, about?, facts? }`: a made post approved for the business's
 * Instagram, as a post or a story, or a made video as a reel, now or at the time given. Whoever may save one, on their press
 * alone: the press is the approval, of these bytes and these words (00690). `about` is what AI's card said the words are
 * about (a day, an offer, a service), and `facts` what the owner said themselves. It answers at once, `{ post_id, status }`,
 * and the post goes up a minute or two later, after a recheck right before the send.
 *
 * DELETE — `{ post_id }`: Don't post, up to the moment it is sent.
 *
 * The handles are in src/server/posts/instagram.ts.
 */
export const POST = write({
  scope: fileScope,
  role: "partner",
  rate: "file_instagram",
  input: z.object({
    as: z.enum(INSTAGRAM_POST_KINDS),
    caption: z.string().max(POST_CAPTION_MAX).optional(),
    when: z.iso.datetime({ offset: true }).optional(),
    about: PostAboutSchema.optional(),
    facts: z.array(OwnersFactSchema).max(5).optional(),
  }),
  handle: ({ ctx, input, member, row }) => postFileToInstagram(ctx, member, row, input),
});

export const DELETE = write({
  scope: fileScope,
  role: "partner",
  rate: "file_instagram",
  input: z.object({ post_id: z.uuid() }),
  handle: ({ ctx, input, member, row }) => pullFilePost(ctx, member, row, { ...input, place: "instagram" }),
});
