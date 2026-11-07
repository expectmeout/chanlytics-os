/** The edge's door for a workspace's files, as the dashboard knocks on it (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor } from "../shared/edge/door";

/** POST /api/admin/files/copies: the sizes a few files are kept in, and where, and copies of pictures made for a turn. */
export const FILE_COPIES_DOOR = edgeDoor(
  "/api/admin/files/copies",
  z.object({
    tenant_id: DOOR_ID.optional(),
    ids: z.array(DOOR_ID).optional(),
    /** Pictures made for this turn, each as its bytes in base64, its type and its name, kept under the key the turn knows it by. */
    pictures: z.array(z.object({ key: z.string(), bytes: z.string(), mime: z.string(), name: z.string() })).optional(),
  }),
);
