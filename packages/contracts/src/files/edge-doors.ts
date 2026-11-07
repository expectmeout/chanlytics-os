/** The edge's doors for a workspace's files, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor } from "../shared/edge/door";

/** A box in a shown picture's pixels (left, top, right, bottom), and the size it was shown at. */
const BOX = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const SIZE = z.tuple([z.number(), z.number()]);

/** POST /api/admin/files/copies: the sizes a few files are kept in, and where, and copies of pictures made for a turn. */
export const FILE_COPIES_DOOR = edgeDoor(
  "/api/admin/files/copies",
  z.object({
    tenant_id: DOOR_ID.optional(),
    ids: z.array(DOOR_ID).optional(),
    /** Pictures made for this turn, each as its bytes in base64, its type and its name, kept under the key the turn knows it by. */
    pictures: z.array(z.object({ key: z.string(), bytes: z.string(), mime: z.string(), name: z.string() })).optional(),
    /**
     * A video's moments drawn for this turn (decision 0099, stage B): a moment (`at`), a box of one (`at`, `box`, `of`), or a
     * stretch (`from`, `to`), each in seconds, kept under the key the turn knows it by.
     */
    moments: z
      .array(
        z.object({
          key: z.string(),
          id: DOOR_ID,
          at: z.number().nullable().optional(),
          from: z.number().nullable().optional(),
          to: z.number().nullable().optional(),
          box: BOX.nullable().optional(),
          of: SIZE.nullable().optional(),
        }),
      )
      .optional(),
  }),
);

/**
 * POST /api/admin/files/video-start: a reservation at the video platform for the browser's own upload, and the row with every
 * fact the browser gave (decision 0099, stage B).
 */
export const FILE_VIDEO_START_DOOR = edgeDoor(
  "/api/admin/files/video-start",
  z.object({
    tenant_id: DOOR_ID.optional(),
    id: DOOR_ID,
    name: z.string(),
    mime: z.string(),
    bytes: z.number(),
    seconds: z.number().nullable(),
    fingerprint: z.string(),
  }),
);

/** POST /api/admin/files/play: the player's address for one video, under a token for an hour. */
export const FILE_PLAY_DOOR = edgeDoor(
  "/api/admin/files/play",
  z.object({ tenant_id: DOOR_ID.optional(), id: DOOR_ID }),
);

/** POST /api/admin/files/listen: Ask's question about a stretch of a video, put to the ear. */
export const FILE_LISTEN_DOOR = edgeDoor(
  "/api/admin/files/listen",
  z.object({
    tenant_id: DOOR_ID.optional(),
    id: DOOR_ID,
    question: z.string(),
    from: z.number().nullable(),
    to: z.number().nullable(),
  }),
);
