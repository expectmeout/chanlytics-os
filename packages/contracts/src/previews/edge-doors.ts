/** The edge's door for a lead's preview, as the dashboard knocks on it (decision 0109). */
import { z } from "zod";
import { answerFields, DOOR_ID, edgeDoor, NO_BODY, PLAIN_ANSWER } from "../shared/edge/door";
import { PREVIEW_AFTER_CALL_STATES } from "./heard";

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

/**
 * POST /api/admin/previews/after-call: what a call to a lead's preview left once it ended, as the provider's own
 * analysis says it: how it ended, what the caller wanted, what to do next and what they gave. Read from the provider
 * each time and kept nowhere, since a preview's call is nobody's customer. A door of its own, so a dashboard that
 * deploys first is answered a 404 it reads as no write-up, never a body an older door would take for something else.
 */
export const PREVIEW_AFTER_CALL_DOOR = edgeDoor(
  "/api/admin/previews/after-call",
  z.object({ tenant_id: DOOR_ID.optional(), rehearsal_id: DOOR_ID.optional() }),
  answerFields({
    state: z.enum(PREVIEW_AFTER_CALL_STATES),
    outcome: z.string().nullable(),
    wanted: z.string().nullable(),
    summary: z.string().nullable(),
    follow_up: z.string().nullable(),
    caller_name: z.string().nullable(),
    caller_email: z.string().nullable(),
  }),
);
