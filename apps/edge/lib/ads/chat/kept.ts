/**
 * Meta's count beside Chanlytics', told to Health (the Ads tracking plan's T2 and its call 1). After each read of an
 * account at Meta, every ad whose chats Meta counted ten or more of over the days it has settled, and of which fewer than
 * half reached Chanlytics (contracts adChatsKeptRule, over 00678 ad_chats_kept), is paged to the platform with the ad
 * and the two counts. Once: a page of the ad's own key that went out is not sent again, however many reads find it still
 * parted, and each read's own log line counts them. A page that did not go is tried at the next read. If Meta changes what it
 * sends, messages stop being kept and every figure on the Ads page goes quietly wrong; this is the alarm for that.
 *
 * The owner is never asked to fix it: their drawer says what is happening, that the ad and AI's replies are not
 * affected, and that Chanlytics is looking. Nothing here is shown to an owner, so the code's words are fine in it.
 */
import { AD_PAGE_DAYS, adChatsKeptRule, type TenantId } from "@chanlytics/contracts";
import { readAdChatsKept, type AdChatsKeptRow } from "@chanlytics/db/ads";
import { findOperatorPage } from "@chanlytics/db/ops";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAndGoOn } from "@chanlytics/log";
import { pageOperator, type PagePorts } from "../../shared/alerts/page-operator.js";

type Db = SupabaseClient<Database>;

/** The pager's key for one ad's parted counts: one page an ad. */
const partedKey = (adId: string): string => `ad_chats_parted:${adId}`;

/** Whether Health was told of this ad already: its page went out. A memory that cannot be read tells it again. */
async function isToldAlready(db: Db, adId: string): Promise<boolean> {
  const { data, error } = await findOperatorPage(db, partedKey(adId));
  return !error && Boolean(data?.alerted_at);
}

/** What Health is told of one parted ad: which, whose, the two counts, and where to look. */
function partedPage(tenantId: TenantId, row: AdChatsKeptRow): { subject: string; body: string } {
  return {
    subject: `Ad counts parted: ${row.name}, Meta ${row.meta} chats, Chanlytics ${row.kept}`,
    body:
      `Meta counted ${row.meta} chats from the ad "${row.name}" (${row.ad_id}) of workspace ${tenantId} over the days ` +
      `it has settled, up to ${row.through}; ${row.kept} reached Chanlytics as messages from the ad (ad_entries). ` +
      "Fewer than half: messages from this ad are arriving without Meta's referral, or not arriving. Look at a recent " +
      "WhatsApp delivery's referral (channels whatsapp/first-touch.ts, ad_entry_keep) and at the webhook's " +
      "subscription. The owner's drawer says their ad and AI's replies are not affected and that Chanlytics is " +
      "looking; they are asked nothing. Told once for this ad.\n",
  };
}

/**
 * Each read's look at Meta's count beside Chanlytics', for one workspace: how many of its ads have parted, and how many
 * of those were paged now (the read's own log line says both). A read of the counts that fails pages nobody and is
 * logged; one a deploy behind has none.
 */
export async function pageChatsParted(
  db: Db,
  tenantId: TenantId,
  pager: Omit<PagePorts, "db"> = {},
): Promise<{ parted: number; paged: number }> {
  const rows = await readAdChatsKept(db, tenantId, AD_PAGE_DAYS).catch(
    logAndGoOn<AdChatsKeptRow[] | null>("Meta's chats beside the ones kept", null),
  );
  const parted = (rows ?? []).filter((row) => adChatsKeptRule(row).parted);
  let paged = 0;
  // One after another: a workspace has few ads parted at once, and the pager keeps each key's pages in turn.
  for (const row of parted) {
    if (await isToldAlready(db, row.ad_id)) continue;
    const page = partedPage(tenantId, row);
    if ((await pageOperator({ db, ...pager }, partedKey(row.ad_id), page.subject, page.body)) === "sent") paged += 1;
  }
  return { parted: parted.length, paged };
}
