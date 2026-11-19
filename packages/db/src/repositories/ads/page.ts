/**
 * What the Ads page reads (decision 0049, readers adsPage and adPeople): an account's ads as their rows keep them, the
 * page's totals counted whole in the database (ads_page_counts, 00651), and one ad's people a page at a time
 * (ad_people). A member's reads, under their own row rules: the session client is handed in. A database that has not
 * run the migration answers null, where the page draws what it drew before (either deploy order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { isMissingDoor } from "../../shared/missing-door";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** An ad's row, every column. */
export type AdRow = Database["public"]["Tables"]["ads"]["Row"];

/** The most ads of one account a page lists: what a read adopts at most. */
const ADS_MAX = 500;

/** An account's ads, the newest first. */
export async function listAdsOfAccount(db: Db, tenantId: TenantId, accountId: string): Promise<AdRow[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ads")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(ADS_MAX);
  if (error) throw new DbFailure(error, "an account's ads");
  return data;
}

/** One ad of the workspace's, by Chanlytics' own id. */
export async function findAd(db: Db, tenantId: TenantId, adId: string): Promise<AdRow | null> {
  const { data, error } = await tenantDb(db, tenantId).from("ads").select("*").eq("id", adId).maybeSingle();
  if (error) throw new DbFailure(error, "an ad by id");
  return data ?? null;
}

/** The page's totals for a window, as ads_page_counts answers them. */
export interface AdsPageCounts {
  from: string;
  to: string;
  /** Who each ad brought, and who of them booked: only ads that brought someone. */
  people: Map<string, { people: number; booked: number }>;
  unnamed: { people: number; booked: number };
  /** What each ad's platform says of the same days. */
  spend: Map<
    string,
    { spend_minor: number; impressions: number; clicks: number; platform_results: number | null; settling: boolean }
  >;
}

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const rowsOf = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.map(recordOrEmpty) : []);

/** The page's totals, counted whole in the database (00651). Null where the database cannot say. */
export async function readAdsPageCounts(db: Db, tenantId: TenantId, days: number): Promise<AdsPageCounts | null> {
  const { data, error } = await db.rpc("ads_page_counts", { p_tenant_id: tenantId, p_days: days });
  if (error) {
    if (isMissingDoor(error)) return null;
    throw new DbFailure(error, "ads_page_counts");
  }
  if (data === null) return null;
  const answer = recordOrEmpty(data);
  const unnamed = recordOrEmpty(answer.unnamed);
  const { from, to } = answer;
  if (typeof from !== "string" || typeof to !== "string") return null;
  return {
    from,
    to,
    people: new Map(
      rowsOf(answer.ads).map((row) => [String(row.ad_id), { people: count(row.people), booked: count(row.booked) }]),
    ),
    unnamed: { people: count(unnamed.people), booked: count(unnamed.booked) },
    spend: new Map(
      rowsOf(answer.spend).map((row) => [
        String(row.ad_id),
        {
          spend_minor: count(row.spend_minor),
          impressions: count(row.impressions),
          clicks: count(row.clicks),
          platform_results: typeof row.platform_results === "number" ? row.platform_results : null,
          settling: row.settling === true,
        },
      ]),
    ),
  };
}

/** One person an ad brought, as ad_people answers them. */
export interface AdPersonRow {
  contact_id: string;
  first_at: string;
  booked: boolean;
  display_name: string | null;
  wa_profile_name: string | null;
  phone_e164: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * One ad's people in the page's window, newest first (ad_people, 00651); the ones from an ad Chanlytics cannot name
 * where `adId` is null. Empty where the database cannot say.
 */
export async function listAdPeople(
  db: Db,
  tenantId: TenantId,
  adId: string | null,
  page: { days: number; limit: number; offset: number },
): Promise<AdPersonRow[]> {
  const { data, error } = await db.rpc("ad_people", {
    p_tenant_id: tenantId,
    // No ad given is the people of an ad nobody can name (the function's own default).
    ...(adId === null ? {} : { p_ad_id: adId }),
    p_days: page.days,
    p_limit: page.limit,
    p_offset: page.offset,
  });
  if (error) {
    if (isMissingDoor(error)) return [];
    throw new DbFailure(error, "ad_people");
  }
  return rowsOf(data).flatMap((row) => {
    const contactId = text(row.contact_id);
    const firstAt = text(row.first_at);
    return contactId === null || firstAt === null
      ? []
      : [
          {
            contact_id: contactId,
            first_at: firstAt,
            booked: row.booked === true,
            display_name: text(row.display_name),
            wa_profile_name: text(row.wa_profile_name),
            phone_e164: text(row.phone_e164),
          },
        ];
  });
}
