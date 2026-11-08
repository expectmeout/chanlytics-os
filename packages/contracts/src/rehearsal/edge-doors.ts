/** The edge's doors for trying the receptionist before a customer does, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import type { RehearsalAllowance } from "./rehearsal";
import type { ReviewDto } from "./review";
import { DOOR_ID, answerFields, edgeDoor, PLAIN_ANSWER, shaped } from "../shared/edge/door";

/** One turn of a conversation, as a rehearsal keeps it. */
const TURN = z.object({ role: z.enum(["user", "assistant"]), content: z.string() });

/** POST /api/admin/eval: the receptionist's answers to a few made-up messages, each with what came before. */
export const EVAL_DOOR = edgeDoor(
  "/api/admin/eval",
  z.object({
    tenant_id: DOOR_ID.optional(),
    cases: z.array(z.object({ id: z.string(), text: z.string(), history: z.array(TURN).exactOptional() })).optional(),
  }),
  answerFields({ results: z.array(z.unknown()) }),
);

/** POST /api/admin/rehearsal/agent: the rehearsal's own agent, made or refreshed. */
export const REHEARSAL_AGENT_DOOR = edgeDoor(
  "/api/admin/rehearsal/agent",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional() }),
  PLAIN_ANSWER,
);

/** POST /api/admin/rehearsal/call: a rehearsal call, started. */
export const REHEARSAL_CALL_DOOR = edgeDoor(
  "/api/admin/rehearsal/call",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional() }),
  answerFields({
    rehearsal_id: z.string(),
    call: z.object({
      call_id: z.string(),
      access_token: z.string(),
      transport: z.string().nullable(),
      ice_servers: z.array(z.unknown()),
      expires_at: z.number().nullable(),
    }),
    max_ms: z.number(),
    allowance: shaped<RehearsalAllowance>(),
    handoff: z.string().nullable(),
  }),
);

/** POST /api/admin/rehearsal/fix: where a correction goes, said before anything is written. */
export const REHEARSAL_FIX_DOOR = edgeDoor(
  "/api/admin/rehearsal/fix",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    kind: z.string().optional(),
    words: z.string().optional(),
    customer: z.string().optional(),
    answer: z.string().optional(),
    rule: z.string().optional(),
  }),
  answerFields({ change: z.unknown() }),
);

/**
 * POST /api/admin/rehearsal/review: how it did, judged: a kept rehearsal, a real call, or turns as typed with the
 * settings' version they were said under (null when unknown).
 */
export const REHEARSAL_REVIEW_DOOR = edgeDoor(
  "/api/admin/rehearsal/review",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    rehearsal_id: DOOR_ID.optional(),
    call_id: z.string().optional(),
    turns: z.array(TURN).readonly().optional(),
    config_version: z.number().nullable().optional(),
  }),
  answerFields({ rehearsal_id: z.string(), review: shaped<ReviewDto>() }),
);
