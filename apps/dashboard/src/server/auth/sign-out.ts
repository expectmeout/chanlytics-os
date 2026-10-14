import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { forgetEveryPhone, type Database } from "@chanlytics/db";
import { log } from "@/server/log";

/**
 * What a sign-out does before the session ends: every phone of the person is forgotten (packages/db forgetEveryPhone,
 * 00432), since the sign-out ends every session of theirs on every device, and their phones went on being pushed handoff
 * and call alerts, with the customer's words, until someone else signed in on them (the wiring's second audit, R11
 * S8-3). It never stands in the sign-out's way: a phone not forgotten is said in the log, and the sign-out goes on.
 */
export async function forgetPhonesOnSignOut(db: SupabaseClient<Database>): Promise<void> {
  try {
    await forgetEveryPhone(db);
  } catch (e) {
    log.error("signout_phones_not_forgotten", { error: e instanceof Error ? e.message : String(e) });
  }
}
