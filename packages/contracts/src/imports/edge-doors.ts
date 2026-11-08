/** The edge's doors for bringing in what a workspace had elsewhere, as the dashboard knocks on them (decision 0109). */
import { z } from "zod";
import { DOOR_ID, edgeDoor, PLAIN_ANSWER } from "../shared/edge/door";

/** POST /api/admin/imports/again: an import from a source, run again. */
export const IMPORT_AGAIN_DOOR = edgeDoor(
  "/api/admin/imports/again",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional(), source: z.string().optional() }),
  PLAIN_ANSWER,
);

/** POST /api/admin/imports/logo-lookup: the workspace's logo, looked for on its website. */
export const LOGO_LOOKUP_DOOR = edgeDoor(
  "/api/admin/imports/logo-lookup",
  z.object({ tenant_id: DOOR_ID.optional() }),
  PLAIN_ANSWER,
);

/** POST /api/admin/imports/website-read: the workspace's website, read for its facts. */
export const WEBSITE_READ_DOOR = edgeDoor(
  "/api/admin/imports/website-read",
  z.object({ tenant_id: DOOR_ID.optional(), user_id: DOOR_ID.optional() }),
  PLAIN_ANSWER,
);
