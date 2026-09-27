/**
 * A kept notification (the bell's row), for the edge's notification door (apps/edge/lib/ops/notify.ts). The one place
 * a row is taken back: a notice told exactly once (notifyOnce) whose mail failed takes its row back, so asking again
 * leaves no twin on the bell. A delete that fails throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

export async function forgetNotification(db: Db, p: { tenantId: string; id: string }): Promise<void> {
  const { error } = await db.from("notifications").delete().eq("tenant_id", p.tenantId).eq("id", p.id);
  if (error) throw new Error(`cannot take the notification back: ${error.message}`);
}
