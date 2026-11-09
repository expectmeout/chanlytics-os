/**
 * The edge's door for Google, as the dashboard knocks on it (decision 0109). The ops are listed in
 * apps/edge/lib/google/admin.ts; each reads the fields it needs and refuses the rest in its own words.
 */
import { z } from "zod";
import type { GoogleCandidateDto } from "./listing";
import { DOOR_ID, answerFields, edgeDoor, shaped } from "../shared/edge/door";

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
    /** A draft of a reply: what the member said to put in it, and the words on their screen it changes. */
    instruction: z.string().optional(),
    given: z.string().optional(),
    comment: z.string().optional(),
    file_id: DOOR_ID.optional(),
    summary: z.string().optional(),
    photo_url: z.string().optional(),
    language: z.string().optional(),
    /** Whether a post asks for a call. */
    call: z.boolean().optional(),
    post_name: z.string().optional(),
  }),
  answerFields({
    removed: z.boolean(),
    revoked: z.boolean(),
    listing: z.unknown(),
    read: z.object({ ok: z.boolean(), fresh: z.number(), counted: z.number(), error: z.string() }).partial(),
    locations: z.unknown(),
    connection: z.unknown(),
    text: z.string(),
    mode: z.string(),
    pending: z.boolean(),
    replied_at: z.string().nullable(),
    reply_text: z.string().nullable(),
    held: z.boolean(),
    candidates: shaped<GoogleCandidateDto[]>(),
    ready: z.object({ places: z.boolean(), profile: z.boolean(), audience: z.string().nullable() }).partial(),
    profile: z.object({ client_id: z.string(), redirect_uri: z.string() }).partial().nullable(),
    name: z.string(),
    search_url: z.string().nullable(),
    state: z.string().nullable(),
  }),
);
