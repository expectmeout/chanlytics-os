/**
 * The copies Ask reads pictures by (decision 0099, step 2): the dashboard holds no model key and never reads a copy's id, so it
 * asks here, by the file, and takes what comes back straight into the image blocks of a request. The copy is the one the look
 * already made, or made again where it has run out. A file the model refused is not sent again: a refused picture in a request
 * can refuse the whole of it.
 */
import { UUID } from "@chanlytics/contracts";
import { fileForWork } from "@chanlytics/db";
import { readBody } from "../shared/admin-door.js";
import { workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { json, refuse } from "../shared/http.js";
import { errField, logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { claudeCopyOf } from "./look.js";

/** The most one call asks for: what one turn's question may carry. */
const COPIES_AT_ONCE = 10;

export async function fileCopies(auth: Admitted, request: Request): Promise<Response> {
  const body = await readBody<{ tenant_id: string; ids: unknown }>(request);
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string" && UUID.test(i)) : [];
  if (ids.length === 0 || ids.length > COPIES_AT_ONCE) {
    return refuse(400, "bad_request", `ids: 1-${COPIES_AT_ONCE} files`);
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const copies = await Promise.all(
    ids.map(async (id) => {
      try {
        const row = await fileForWork(db, tenantId, id);
        if (!row || row.removed_at || row.look_status === "refused") return { id, file_id: null };
        const copy = await claudeCopyOf(db, row);
        return { id, file_id: copy?.id ?? null };
      } catch (e) {
        logger({ tenant_id: tenantId }).warn("file_copy_failed", { file: id, why: "door", error: errField(e) });
        return { id, file_id: null };
      }
    }),
  );
  return json(200, { ok: true, copies });
}
