/**
 * A member's browsers that said yes to being told (web_push_subscriptions, 00575), as devices.ts is their phones. Kept and
 * forgotten on the member's own session, read by the job that tells them with the service role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure } from "@chanlytics/contracts";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/**
 * This browser said yes. A subscription's keys go with its address, so one kept already is this one: a session may not update
 * these rows, and has no need to.
 */
export async function keepWebPush(
  db: Db,
  s: { userId: string; endpoint: string; p256dh: string; auth: string; userAgent: string | null },
): Promise<void> {
  const { error } = await db
    .from("web_push_subscriptions")
    .upsert(
      { user_id: s.userId, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, user_agent: s.userAgent },
      { onConflict: "user_id,endpoint", ignoreDuplicates: true },
    );
  if (error) throw new DbFailure(error, "keeping this browser's subscription");
}

/** This browser is told no more. */
export async function forgetWebPush(db: Db, userId: string, endpoint: string): Promise<void> {
  const { error } = await db.from("web_push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
  if (error) throw new DbFailure(error, "forgetting this browser's subscription");
}

/** The browsers to tell of a notification, up to `max`. */
export async function listWebPushOf(
  db: Db,
  users: readonly string[],
  max: number,
): Promise<{ endpoint: string; p256dh: string; auth: string }[]> {
  const { data, error } = await db
    .from("web_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", [...users])
    .limit(max);
  if (error) throw new DbFailure(error, "reading who to tell");
  return data ?? [];
}

/** The addresses a push service says have gone: forgotten here too. */
export async function forgetGoneWebPush(db: Db, endpoints: readonly string[]): Promise<void> {
  const { error } = await db
    .from("web_push_subscriptions")
    .delete()
    .in("endpoint", [...endpoints]);
  if (error) throw new DbFailure(error, "forgetting browsers that have gone");
}
