/**
 * The door every pg_cron → pg_net route stands behind: the x-cron-key header
 * against the sweep key held in Vault. Null means come in; anything else is
 * the answer to send.
 */
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./workspace/db.js";
import { json } from "./http.js";

export async function authorizeCron(request: Request, db: SupabaseClient<Database>): Promise<Response | null> {
  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error } = await db.rpc("get_cron_sweep_key");
  if (error || !expected) return json(503, { ok: false, error: "key_unavailable" });
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (!presented || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(401, { ok: false, error: "unauthorized" });
  }
  return null;
}
