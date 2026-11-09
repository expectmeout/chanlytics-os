/** The edge's door for a lead's preview, as the dashboard knocks on it (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor, PLAIN_ANSWER } from "../shared/edge/door";

/** POST /api/admin/previews/make: a lead's preview of what the receptionist would be, made. */
export const PREVIEW_MAKE_DOOR = edgeDoor(
  "/api/admin/previews/make",
  z.object({ tenant_id: DOOR_ID.optional(), lead_id: DOOR_ID.optional() }),
  PLAIN_ANSWER,
);
