/** The edge's door for a playbook's run, as the dashboard knocks on it (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor } from "../../shared/edge/door";

/** POST /api/admin/playbooks-run: a playbook run now, for whoever it is due to. */
export const PLAYBOOK_RUN_DOOR = edgeDoor(
  "/api/admin/playbooks-run",
  z.object({ tenant_id: DOOR_ID.optional(), playbook_id: DOOR_ID.optional(), user_id: DOOR_ID.optional() }),
);
