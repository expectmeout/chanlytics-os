import { z } from "zod";
import { FILE_NAME_MAX, FILE_SHOWS, HAND_LINK_MAX, POST_CAPTION_MAX } from "@chanlytics/contracts";
import { read, write } from "@/server/shared/route";
import { readerContext } from "@/server/shared/reader";
import { readPieceAd } from "@/server/content/ad-pictures";
import { fileScope, removeFile } from "@/server/files/file";
import { changePiece } from "@/server/posts/caption";
import { readFileRecord, readPieceStanding } from "@/server/posts/record";

/**
 * GET /api/v1/files/:id — one file, and for a post the photo it came from and what it was asked to be. Every member reads it.
 * For a made piece, where Ads is on, it says too whether the piece may run as an ad (`ad`: Content's Run as an ad); and
 * for every made piece who is in it (`people`) and its newest take-down (`take_down`).
 *
 * PATCH /api/v1/files/:id — `{ name?, shows?, who_in_it?, status?, caption?, posted? }`: what a person says of a file. What
 * they name and shelve stays when the look runs again. Who is in it is a person's word that no one is (a yes is POST
 * files/:id/yes). A caption is a made piece's, written where it stands, and kept with how it was made. `posted` is their
 * word that they put a made piece up themselves (`{ link? }`), or that they did not after all (null).
 *
 * DELETE — it goes from every page at once, and its bytes, Anthropic's copy and its row by the file_purge job. Only its
 * fingerprint stays, so an import does not bring it back.
 *
 * The handles are in src/server/files/file.ts.
 */
export const GET = read({
  scope: fileScope,
  handle: async ({ ctx, member, row }) => {
    const [record, ad] = await Promise.all([
      readFileRecord(ctx, member, row),
      readPieceAd(readerContext(ctx, member), row),
    ]);
    // Who is in a made piece, and its newest take-down (00681, 00682): read once its posts are known.
    const standing = await readPieceStanding(ctx, member, row, record.posts ?? []);
    return { ...record, ...(ad === null ? {} : { ad }), ...(standing ?? {}) };
  },
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
    who_in_it: z.enum(["no_one"]).optional(),
    status: z.enum(["filed", "set_aside"]).optional(),
    caption: z
      .string()
      .max(POST_CAPTION_MAX * 2)
      .optional(),
    // "I posted it" (00620): the owner's word that a made piece is up by their own hand, with its link or none; null takes
    // it back.
    posted: z
      .object({
        link: z
          .string()
          .trim()
          .max(HAND_LINK_MAX)
          .regex(/^https:\/\/\S+$/i)
          .nullable()
          .optional(),
      })
      .nullable()
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
