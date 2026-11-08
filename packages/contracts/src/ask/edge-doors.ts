/** The edge's door for Ask's model, as the dashboard reaches it through the gateway (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor, PLAIN_ANSWER } from "../shared/edge/door";

/**
 * POST /api/admin/llm: one model request, for a workspace and a member, under the purpose it is counted as. The request
 * is the model provider's own shape, which the edge passes on and measures; it is not restated here.
 */
export const LLM_DOOR = edgeDoor(
  "/api/admin/llm",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    purpose: z.string().optional(),
    request: z.unknown().optional(),
  }),
  PLAIN_ANSWER,
);
