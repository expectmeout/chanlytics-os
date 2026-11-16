/** The edge's door for a lead's preview, as the dashboard knocks on it (decision 0109). */
import { z } from "zod";
import { answerFields, DOOR_ID, edgeDoor, NO_BODY, PLAIN_ANSWER } from "../shared/edge/door";

/** POST /api/admin/previews/make: a lead's preview of what the receptionist would be, made. */
export const PREVIEW_MAKE_DOOR = edgeDoor(
  "/api/admin/previews/make",
  z.object({ tenant_id: DOOR_ID.optional(), lead_id: DOOR_ID.optional() }),
  PLAIN_ANSWER,
);

/**
 * GET /api/admin/previews/standing: whether a lead's preview is made at all just now (the edge's switch), so the lead
 * sheet says an email will wait before it does. A door of its own, never a flag on the make door: an older edge would
 * read a body it does not know as a press, and make one.
 */
export const PREVIEWS_STANDING_DOOR = edgeDoor(
  "/api/admin/previews/standing",
  NO_BODY,
  answerFields({ on: z.boolean() }),
);
