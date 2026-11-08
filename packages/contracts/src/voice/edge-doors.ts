/**
 * The edge's doors for calls: a live call steered, Ask's voice, a person's calls erased, and the agents set up and
 * watched. The dashboard knocks on the first five; the last three are an operator's (decision 0109).
 */
import { z } from "zod";
import { DOOR_ID, answerFields, edgeDoor, PLAIN_ANSWER } from "../shared/edge/door";

/** POST /api/admin/hand-over: a live call handed to a person's line. A call's id is the voice provider's. */
export const HAND_OVER_DOOR = edgeDoor(
  "/api/admin/hand-over",
  z.object({ call_id: z.string().optional(), line: z.string().optional() }),
  answerFields({ status: z.number() }),
);

/** POST /api/admin/stop-call: a live call ended. */
export const STOP_CALL_DOOR = edgeDoor(
  "/api/admin/stop-call",
  z.object({ call_id: z.string().optional() }),
  answerFields({ status: z.number() }),
);

/** POST /api/admin/whisper: words for the receptionist on a live call, said now or kept for its next turn. */
export const WHISPER_DOOR = edgeDoor(
  "/api/admin/whisper",
  z.object({ call_id: z.string().optional(), text: z.string().optional(), trigger: z.boolean().optional() }),
  answerFields({ status: z.number() }),
);

/** POST /api/admin/voice/session: a conversation with Ask by voice, started. */
export const VOICE_SESSION_DOOR = edgeDoor(
  "/api/admin/voice/session",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional() }),
  PLAIN_ANSWER,
);

/** POST /api/admin/voice/speech: Ask's words, spoken. */
export const VOICE_SPEECH_DOOR = edgeDoor(
  "/api/admin/voice/speech",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    text: z.string().optional(),
    purpose: z.string().optional(),
    /** What was said before, so the next clip carries on from it. */
    before: z.string().optional(),
  }),
  PLAIN_ANSWER,
);

/** POST /api/admin/voice/erase-calls: a person's calls erased at the voice provider. */
export const ERASE_CALLS_DOOR = edgeDoor(
  "/api/admin/voice/erase-calls",
  z.object({ tenant_id: DOOR_ID.optional(), call_ids: z.array(z.string()).optional() }),
  answerFields({ asked: z.number(), deleted: z.number(), refused: z.number() }),
);

/** POST /api/admin/voice-converge: the agents brought to what the code says they are (an operator's). */
export const VOICE_CONVERGE_DOOR = edgeDoor(
  "/api/admin/voice-converge",
  z.object({
    agent_id: z.string().optional(),
    apply: z.boolean().optional(),
    publish: z.boolean().optional(),
    shell: z.boolean().optional(),
    pin_number: z.string().optional(),
  }),
  PLAIN_ANSWER,
);

/** POST /api/admin/voice-provision: a workspace's agent and number made at the voice provider (an operator's). */
export const VOICE_PROVISION_DOOR = edgeDoor(
  "/api/admin/voice-provision",
  z.object({
    tenant_id: DOOR_ID.optional(),
    number: z.string().optional(),
    area_code: z.union([z.number(), z.string()]).optional(),
    llm_id: z.string().optional(),
    agent_id: z.string().optional(),
    apply: z.boolean().optional(),
  }),
  PLAIN_ANSWER,
);

/** POST /api/voice-canary: the canary call placed, or its verdict read since a moment (its own key's). */
export const VOICE_CANARY_DOOR = edgeDoor(
  "/api/voice-canary",
  z.object({ op: z.string().optional(), since: z.string().optional() }),
  PLAIN_ANSWER,
);
