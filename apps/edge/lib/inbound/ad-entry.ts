/**
 * What an ad said, kept once its message has landed (decision 0049, step P0a).
 *
 * A person who taps an ad and writes arrives with the ad's referral. Its id and kind ride in the message's meta, where
 * the database stamps the person and opens the ad's entry in the message's own transaction (00306, 00644). What the ad
 * said (its headline, its words, its kind of media, its link) is kept here, in a call of its own after the ingest, so
 * nothing an advertiser typed can cost a customer's message its place. A keep that fails, or finds no entry to keep on,
 * is one log line, `ad_entry_keep_failed`, and an entry whose words never arrived, which is how the loss is counted.
 * Never throws.
 *
 * Either deploy order: a database that has not run 00644 has no door to call, and that is nothing to say.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundMessage } from "@chanlytics/channels/inbound";
import type { TenantId } from "@chanlytics/contracts";
import { keepAdEntry, type AdEntrySaid } from "@chanlytics/db/ads";
import type { Database } from "@chanlytics/db/types";
import { errField, logger } from "../shared/log.js";

/** The ad's words as the door takes them: a part the referral did not say is left out, never null. */
function saidForTheDoor(adSaid: NonNullable<InboundMessage["referral"]>["said"]): AdEntrySaid {
  return {
    ...(adSaid?.headline ? { headline: adSaid.headline } : {}),
    ...(adSaid?.body ? { body: adSaid.body } : {}),
    ...(adSaid?.mediaType ? { media_type: adSaid.mediaType } : {}),
    ...(adSaid?.link ? { link: adSaid.link } : {}),
  };
}

/**
 * Keeps what the ad said on the entry the message opened. Only an ad is an ad: a post, a link or no referral keeps
 * nothing. An ad that said nothing sound is kept as having said nothing, so an entry with no words at all always means
 * this call never arrived.
 */
export async function keepWhatTheAdSaid(
  db: SupabaseClient<Database>,
  tenantId: TenantId,
  messageId: string,
  referral: InboundMessage["referral"],
): Promise<void> {
  if (referral?.sourceType !== "ad") return;
  try {
    const kept = await keepAdEntry(db, tenantId, messageId, saidForTheDoor(referral.said));
    if (kept === "none")
      logger({ tenant_id: tenantId }).warn("ad_entry_keep_failed", { message: messageId, error: "no entry" });
  } catch (e) {
    logger({ tenant_id: tenantId }).error("ad_entry_keep_failed", { message: messageId, error: errField(e) });
  }
}
