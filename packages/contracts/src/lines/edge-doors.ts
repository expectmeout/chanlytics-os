/**
 * The edge's doors for a workspace's phone lines, as the dashboard knocks on them (decision 0109). The ops are listed
 * in apps/edge/lib/lines/admin.ts; each reads the fields it needs and refuses the rest in its own words.
 */
import { z } from "zod";
import { DOOR_ID, doorAnswer, edgeDoor, NO_BODY } from "../shared/edge/door";

/** POST /api/admin/lines: a line searched, looked up, bought, retried, released, recorded and registered. */
export const LINES_DOOR = edgeDoor(
  "/api/admin/lines",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    /** A search's or a provision's area code, as a number or its three digits. */
    area_code: z.union([z.number(), z.string()]).optional(),
    number: z.string().optional(),
    line_id: DOOR_ID.optional(),
    /** Who pressed Retry: the owner, or support. */
    by: z.string().optional(),
    /** The business on record, as Setup's form holds it. */
    record: z.unknown().optional(),
    path: z.string().optional(),
    mock: z.boolean().optional(),
    refile: z.boolean().optional(),
    replace: z.boolean().optional(),
  }),
  doorAnswer({
    line: z.unknown(),
    queued: z.boolean(),
    pending: z.boolean(),
    step: z.string().nullable(),
    lookup: z.unknown(),
    reason: z.string().nullable(),
    problems: z.array(z.unknown()),
    numbers: z.unknown(),
    cost_month_usd: z.number().nullable(),
    provider: z.unknown(),
    record: z.unknown(),
    ready: z.boolean(),
    costs: z.object({ local_number_month_usd: z.number(), toll_free_month_usd: z.number() }).partial().nullable(),
  }),
);

/** GET /api/admin/lines/codes: the area codes a line can be bought in. */
export const LINE_CODES_DOOR = edgeDoor("/api/admin/lines/codes", NO_BODY, doorAnswer({ codes: z.array(z.unknown()) }));
