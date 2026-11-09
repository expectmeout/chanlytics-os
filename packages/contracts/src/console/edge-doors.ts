/** The edge's doors for the back office: a support report mailed, a provider's delivery replayed (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor, PLAIN_ANSWER } from "../shared/edge/door";

/** POST /api/admin/support/report: a support report, mailed to the platform. */
export const SUPPORT_REPORT_DOOR = edgeDoor(
  "/api/admin/support/report",
  z.object({ report_id: DOOR_ID.optional() }),
  PLAIN_ANSWER,
);

/** POST /api/admin/intake/replay: a provider's delivery, as it was kept, handed to its door again (an operator's). */
export const INTAKE_REPLAY_DOOR = edgeDoor(
  "/api/admin/intake/replay",
  z.object({ provider: z.string().optional(), provider_event_id: z.string().optional() }),
  PLAIN_ANSWER,
);
