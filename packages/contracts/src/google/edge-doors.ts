/**
 * The edge's door for Google, as the dashboard knocks on it (decision 0109). The ops are listed in
 * apps/edge/lib/google/admin.ts; each reads the fields it needs and refuses the rest in its own words.
 */
import { z } from "zod";
import { DOOR_ID, edgeDoor } from "../shared/edge/door";

/** POST /api/admin/google: the listing searched, linked and read, the profile connected, a review answered, a post made. */
export const GOOGLE_DOOR = edgeDoor(
  "/api/admin/google",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    place_id: z.string().optional(),
    query: z.string().optional(),
    code: z.string().optional(),
    account_name: z.string().optional(),
    location_name: z.string().optional(),
    /** A review's id, for its answer. */
    id: z.string().optional(),
    comment: z.string().optional(),
    file_id: DOOR_ID.optional(),
    summary: z.string().optional(),
    photo_url: z.string().optional(),
    language: z.string().optional(),
    /** Whether a post asks for a call. */
    call: z.boolean().optional(),
    post_name: z.string().optional(),
  }),
);
