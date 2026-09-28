/**
 * What a person is told, as the edge reads and writes it: a kept notification taken back (apps/edge/lib/ops/notify.ts),
 * and the phones a call in progress is shown on (apps/edge/lib/voice/call-activity.ts). A read or write that fails
 * throws.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

/**
 * The one place a bell's row is taken back: a notice told exactly once (notifyOnce) whose mail failed takes its row
 * back, so asking again leaves no twin on the bell.
 */
export async function forgetNotification(db: Db, p: { tenantId: string; id: string }): Promise<void> {
  const { error } = await db.from("notifications").delete().eq("tenant_id", p.tenantId).eq("id", p.id);
  if (error) throw new Error(`cannot take the notification back: ${error.message}`);
}

/**
 * The push-to-start tokens of the phones whose people hold one of `roles` in the workspace (00191), each once. Throws
 * when the people or their phones cannot be read.
 */
export async function activityTokensOf(db: Db, tenantId: string, roles: readonly string[]): Promise<string[]> {
  const { data: members, error: me } = await db
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", [...roles]);
  if (me) throw new Error(`cannot read who is in the workspace: ${me.message}`);
  const people = (members ?? []).map((m) => m.user_id);
  if (!people.length) return [];
  const { data: devices, error: de } = await db
    .from("push_devices")
    .select("activity_token")
    .in("user_id", people)
    .not("activity_token", "is", null);
  if (de) throw new Error(`cannot read the phones: ${de.message}`);
  return [...new Set((devices ?? []).map((d) => d.activity_token).filter((t): t is string => !!t))];
}

/** Forget activity tokens Apple says are gone (410), so no later call tries them again. */
export async function forgetActivityTokens(db: Db, tokens: readonly string[]): Promise<void> {
  if (!tokens.length) return;
  const { error } = await db
    .from("push_devices")
    .update({ activity_token: null })
    .in("activity_token", [...tokens]);
  if (error) throw new Error(`cannot forget the gone activity tokens: ${error.message}`);
}
