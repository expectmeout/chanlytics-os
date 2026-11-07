/** The edge's door for a workspace's files, as the dashboard knocks on it (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor } from "../shared/edge/door";

/** POST /api/admin/files/copies: the sizes a few files are kept in, and where. */
export const FILE_COPIES_DOOR = edgeDoor(
  "/api/admin/files/copies",
  z.object({ tenant_id: DOOR_ID.optional(), ids: z.array(DOOR_ID).optional() }),
);
