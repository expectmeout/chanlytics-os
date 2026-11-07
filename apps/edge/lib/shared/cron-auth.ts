/**
 * The door every pg_cron → pg_net route stands behind: the x-cron-key header
 * against the sweep key held in Vault. Null means come in; anything else is
 * the answer to send.
 *
 * One copy. Nine routes each carried their own, and they had already drifted:
 * three logged a key they could not read and six said nothing at all.
 * hygiene.test.mjs holds every route in apps/edge/api/cron, and the jobs tick,
 * to this door.
 */
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import type { Logger } from "./log.js";
import { refuse } from "./http.js";
import { getCronSweepKey } from "@chanlytics/db/ops";

export async function authorizeCron(
  request: Request,
  db: SupabaseClient<Database>,
  log: Pick<Logger, "error">,
): Promise<Response | null> {
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error } = await getCronSweepKey(db);
  if (error || !expected) {
    // The route does nothing without its key, and the 503 is what sweep_health() reads.
    log.error("cron_key_unavailable", { error: error?.message ?? "no cron_sweep_key in Vault" });
    return refuse(503, "key_unavailable");
  }
  const items = Buffer.from(presented);
  const result = Buffer.from(expected);
  if (!presented || items.length !== result.length || !crypto.timingSafeEqual(items, result)) {
    return refuse(401, "unauthorized");
  }
  return null;
}
