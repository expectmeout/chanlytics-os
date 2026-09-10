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
import type { Database } from "./workspace/db.js";
import type { Logger } from "./log.js";
import { json } from "./http.js";

export async function authorizeCron(
  request: Request,
  db: SupabaseClient<Database>,
  L: Pick<Logger, "error">,
): Promise<Response | null> {
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error } = await db.rpc("get_cron_sweep_key");
  if (error || !expected) {
    // The route does nothing without its key, and the 503 is what sweep_health() reads.
    L.error("cron_key_unavailable", { error: error?.message ?? "no cron_sweep_key in Vault" });
    return json(503, { ok: false, error: "key_unavailable" });
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (!presented || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(401, { ok: false, error: "unauthorized" });
  }
  return null;
}
