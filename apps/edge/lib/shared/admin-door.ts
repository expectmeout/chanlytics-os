/**
 * What an admin door does around its ops, in one place: read the body, answer, refuse, and find the workspace an op
 * acts on. Who may knock is admin-auth.ts's; what each op decides is its domain's *-ops.ts; a door keeps its own ops
 * and the order of its reads.
 *
 * The lines, Google and billing doors each wrote these for themselves -- the same body reader three times, two names
 * for one answer type, three spellings of an error's words -- and a fourth door would have written them again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import { UUID, unheldByDoor, type DoorRead, type EdgeDoor, type EdgeErrorCode } from "@chanlytics/contracts";
import { json, refuse } from "./http.js";
import { logger } from "./log.js";
import { pg } from "./pg.js";

type Db = SupabaseClient<Database>;

/** What a door answers: the status and the JSON body, whose `error`, when it has one, is a code of the closed set. */
export interface DoorAnswer {
  status: number;
  body: { readonly [k: string]: unknown; readonly error?: EdgeErrorCode };
}

/** A refusal on the way to an op: the response the door answers with, the op never run. */
export type Refused = { ok: false; response: Response };

export const respond = (doorAnswer: DoorAnswer): Response => json(doorAnswer.status, doorAnswer.body);

export const stop = (response: Response): Refused => ({ ok: false, response });

/** An error's words: an Error's message, anything else that was thrown as a string. */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The body as sent when it is a JSON object; anything else -- not JSON, or JSON that is not an object (null, an array,
 * a number, a string, a boolean) -- is an empty body, validated by the door like any other. A door reads `body.op` and
 * writes the workspace back onto the body, and both threw on null or a primitive: a 500 where its validation answers
 * 400. `source` is the request, or its body when a door has already read it as text (the model gateway measures it
 * first).
 *
 * `door` is the door as contracts declares it, the dashboard's side of the same shape (decision 0109). A body its schema
 * does not hold is said, by field and never by value, and read as it always was: the op still refuses what it refuses, in
 * its own words, until production has sent nothing the schema refuses and the door refuses at the schema.
 */
export async function readBody<D extends EdgeDoor>(source: Request | string, door: D): Promise<DoorRead<D>> {
  let body: object = {};
  try {
    const sent: unknown = JSON.parse(typeof source === "string" ? source : await source.text());
    if (typeof sent === "object" && sent !== null && !Array.isArray(sent)) body = sent;
  } catch {
    // Not JSON: an empty body, as above.
  }
  const held = door.body.safeParse(body);
  if (!held.success) logger().warn("door_body_unexpected", { door: door.aud, fields: unheldByDoor(held.error) });
  return body;
}

/** The database and the workspace an op acts on: no database is a 503, an id that is not a workspace's a 400. */
export function workspaceOf(tenantId: unknown): { ok: true; db: Db; tenantId: string } | Refused {
  const db = pg();
  if (!db) return stop(refuse(503, "no_database"));
  const id = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!UUID.test(id)) return stop(refuse(400, "bad_tenant", "tenant_id (a workspace id) is required"));
  return { ok: true, db, tenantId: id };
}

/**
 * The workspace's row, as the door's read of it answered (the columns are the door's): a read that failed is a 503
 * with the database's words in `detail`, no row a 404.
 */
export function workspaceRow<R>(read: {
  data: R | null;
  error: { message: string } | null;
}): { ok: true; row: R } | Refused {
  if (read.error) return stop(refuse(503, "read_failed", read.error.message));
  if (!read.data) return stop(refuse(404, "not_found", "no such workspace"));
  return { ok: true, row: read.data };
}
