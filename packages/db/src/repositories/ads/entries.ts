/**
 * An ad's entries (ad_entries, 00644; decision 0049): one row each time someone reaches a workspace through an ad. One
 * door writes it, ad_entry_keep. The database calls it with the message that carried the ad (the first-touch trigger),
 * which opens the row; what the ad said is kept on it here, by the message's id, as the service role. The one place
 * code calls the door, and the one place the table is read by name.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, SCHEMA_SETS, isOneOf, recordOrNull, type AdSaid, type TenantId } from "@chanlytics/contracts";
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

/** One part of what an ad said, as the entry holds it: a string that says something, or nothing. */
const adPartOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

/**
 * What the ad said on the entry a message opened (one entry a message, 00644), read by the message's id inside its own
 * workspace: the words AI is told when it answers that person (conversations/thread/ad-tap.ts). Null where the message
 * opened no entry, or its words never arrived. The link is not read: nothing that answers a person needs the ad's
 * address. A read the database refuses throws.
 */
export async function readAdSaid(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  messageId: string,
): Promise<AdSaid | null> {
  const { data, error } = await db
    .from("ad_entries")
    .select("said")
    .eq("tenant_id", tenantId)
    .eq("message_id", messageId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "readAdSaid");
  const kept = recordOrNull(data?.said);
  if (!kept) return null;
  const headline = adPartOf(kept.headline);
  const body = adPartOf(kept.body);
  const visual = adPartOf(kept.media_type);
  return {
    ...(headline === undefined ? {} : { headline }),
    ...(body === undefined ? {} : { body }),
    ...(visual === undefined ? {} : { media_type: visual }),
  };
}

/** The ad a first touch names, as a page says it: its platform, and its name where an entry kept what the ad said. */
export interface AdNamed {
  platform: (typeof SCHEMA_SETS)["ad_entries.platform"][number] | null;
  name: string | null;
}

/**
 * The ad a person's first touch names (contacts.acquired_ref), read through ad_named (00646): the one place an ad gets
 * its name until Chanlytics holds the ad itself. Under the caller's own row rules. A database that has not run 00646
 * names no ad, which is what a page said before it (either deploy order).
 */
export async function readAdNamed(
  db: SupabaseClient<Database>,
  tenantId: string,
  ref: string | null,
): Promise<AdNamed> {
  const { data, error } = await db.rpc("ad_named", { p_tenant_id: tenantId, p_ref: ref ?? "" });
  if (error) {
    if (isMissingDoor(error)) return { platform: null, name: null };
    throw new DbFailure(error, "ad_named");
  }
  const named = recordOrNull(data);
  const platform = named?.platform;
  const name = named?.name;
  return {
    platform: isOneOf(SCHEMA_SETS["ad_entries.platform"], platform) ? platform : null,
    name: typeof name === "string" && name.trim() ? name : null,
  };
}
