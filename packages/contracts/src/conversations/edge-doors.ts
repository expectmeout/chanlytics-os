/** The edge's doors for a thread's draft, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor } from "../shared/edge/door";

/** POST /api/admin/draft: a member's change to a thread's draft, or their Try again (decision 0093). */
export const DRAFT_DOOR = edgeDoor(
  "/api/admin/draft",
  z.object({
    conversation_id: DOOR_ID,
    /** A reply, or a brief; a reply when unsaid. */
    kind: z.string().optional(),
    instruction: z.string().optional(),
  }),
);

/** POST /api/admin/steer: a held draft, steered by the member's words. */
export const STEER_DOOR = edgeDoor(
  "/api/admin/steer",
  z.object({ message_id: DOOR_ID.optional(), text: z.string().optional() }),
);
