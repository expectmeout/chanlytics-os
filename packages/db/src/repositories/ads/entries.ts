/**
 * An ad's entries (ad_entries, 00644; decision 0049): one row each time someone reaches a workspace through an ad. One
 * door writes it, ad_entry_keep. The database calls it with the message that carried the ad (the first-touch trigger),
 * which opens the row; what the ad said is kept on it here, by the message's id, as the service role. The one place
 * code calls the door.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, type AdSaid, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import type { Database } from "../../types";

/**
 * What became of the words: `kept` on the entry; `already` there (the message was delivered twice, and the first words
 * stand); `none`, the message came from no ad the database can read; or `no_door`, a database that has not run 00644
 * yet, where nothing is kept and nothing is wrong (either deploy order).
 */
export type AdEntryKept = "kept" | "already" | "none" | "no_door";

/** Keeps what the ad said on the entry its message opened. A call the database refuses throws. */
export async function keepAdEntry(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  messageId: string,
  adSaid: AdSaid,
): Promise<AdEntryKept> {
  const { data, error } = await db.rpc("ad_entry_keep", {
    p_tenant_id: tenantId,
    p_message_id: messageId,
    p_said: { ...adSaid },
  });
  if (error) {
    if (isMissingDoor(error)) return "no_door";
    throw new DbFailure(error, "ad_entry_keep");
  }
  return data === "kept" || data === "already" ? data : "none";
}
