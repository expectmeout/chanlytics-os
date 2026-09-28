/**
 * What an admin door does around its ops, in one place: read the body, answer, refuse, and find the workspace an op
 * acts on. Who may knock is admin-auth.ts's; what each op decides is its domain's *-ops.ts; a door keeps its own ops
 * and the order of its reads.
 *
 * The lines, Google and billing doors each wrote these for themselves -- the same body reader three times, two names
 * for one answer type, three spellings of an error's words -- and a fourth door would have written them again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./packages/db.js";
import { UUID } from "./packages/contracts.js";
import { json } from "./http.js";
import { pg } from "./pg.js";

type Db = SupabaseClient<Database>;

/** What a door answers: the status and the JSON body. */
export interface DoorAnswer {
  status: number;
  body: unknown;
}

/** A refusal on the way to an op: the response the door answers with, the op never run. */
export type Refused = { ok: false; response: Response };

export const respond = (a: DoorAnswer): Response => json(a.status, a.body);

export const stop = (response: Response): Refused => ({ ok: false, response });

/** An error's words: an Error's message, anything else that was thrown as a string. */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The body as sent when it is a JSON object; anything else -- not JSON, or JSON that is not an object (null, an array,
 * a number, a string, a boolean) -- is an empty body, validated by the door like any other. A door reads `body.op` and
 * writes the workspace back onto the body, and both threw on null or a primitive: a 500 where its validation answers
 * 400.
 */
export async function readBody<T extends object>(request: Request): Promise<Partial<T>> {
  try {
    const body = JSON.parse(await request.text());
    return typeof body === "object" && body !== null && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

/** The database and the workspace an op acts on: no database is a 503, an id that is not a workspace's a 400. */
export function workspaceOf(tenantId: unknown): { ok: true; db: Db; tenantId: string } | Refused {
  const db = pg();
  if (!db) return stop(json(503, { ok: false, error: "no_database" }));
  const id = typeof tenantId === "string" ? tenantId.trim() : "";
  if (!UUID.test(id)) return stop(json(400, { ok: false, error: "tenant_id (a workspace id) is required" }));
  return { ok: true, db, tenantId: id };
}

/**
 * The workspace's row, as the door's read of it answered (the columns are the door's): a read that failed is a 503 in
 * the database's words, no row a 404.
 */
export function workspaceRow<R>(read: {
  data: R | null;
  error: { message: string } | null;
}): { ok: true; row: R } | Refused {
  if (read.error) return stop(json(503, { ok: false, error: read.error.message }));
  if (!read.data) return stop(json(404, { ok: false, error: "no such workspace" }));
  return { ok: true, row: read.data };
}
