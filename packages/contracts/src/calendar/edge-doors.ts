/** The edge's doors for the calendar, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import { DOOR_ID, answerFields, edgeDoor } from "../shared/edge/door";

/** POST /api/admin/calendar/feed: the calendar a mailbox reads, as text, between two moments (the season's, when unsaid). */
export const CALENDAR_FEED_DOOR = edgeDoor(
  "/api/admin/calendar/feed",
  z.object({
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    from: z.number().optional(),
    to: z.number().optional(),
  }),
  answerFields({ text: z.string() }),
);

/** POST /api/admin/calendar/freed-time: a cancelled appointment's time, offered now. */
export const FREED_TIME_DOOR = edgeDoor(
  "/api/admin/calendar/freed-time",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional(), appointment_id: DOOR_ID.optional() }),
  answerFields({ offered: z.boolean(), people: z.number(), waits: z.boolean(), why: z.string() }),
);
