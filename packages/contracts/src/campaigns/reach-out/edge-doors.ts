/** The edge's doors for reach-outs, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import { DOOR_ID, answerFields, edgeDoor, PLAIN_ANSWER } from "../../shared/edge/door";
import { ReachOutPreviewSchema } from "./schemas";

/**
 * POST /api/admin/reach-out-preview: one business's email as the chain would write it. The body is the route's own
 * input (POST reach-outs/preview), with the workspace and the member it is for: one schema at both ends.
 */
export const REACH_OUT_PREVIEW_DOOR = edgeDoor(
  "/api/admin/reach-out-preview",
  ReachOutPreviewSchema.extend({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional() }),
  answerFields({ preview: z.unknown() }),
);

/** POST /api/admin/reach-out/check: sends a member pressed, checked now rather than in the clock's next minute. */
export const REACH_OUT_CHECK_DOOR = edgeDoor(
  "/api/admin/reach-out/check",
  z.object({ send_ids: z.array(DOOR_ID).optional(), stream: z.boolean().optional() }),
  PLAIN_ANSWER,
);
