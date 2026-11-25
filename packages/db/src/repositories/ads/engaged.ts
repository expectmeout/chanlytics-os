/**
 * What the Ads page reads beside its counts (00719): what each ad did as the platform counts it over the page's days
 * (`ad_days.engaged`, summed), and who commented on each ad (a comment Meta says was left on it, kept as the person's
 * touch). A member's reads under their own row rules: the session client is handed in. A database that has not run
 * 00719 answers null, where the page says what it said before (either deploy order).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DbFailure, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The kinds a day of an ad keeps, as the platform counts them. */
const ENGAGED_KINDS = ["plays", "engaged", "comments", "reactions", "saves", "shares"] as const;
type EngagedKind = (typeof ENGAGED_KINDS)[number];

/** What an ad did over the days, a kind the platform counted none of left out. */
export type AdEngagedSum = Partial<Record<EngagedKind, number>>;

/** Postgres's word for a column a database does not have yet: one a deploy behind 00719. */
const NO_COLUMN = "42703";

const wholeOf = (value: unknown): number => (Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : 0);

/** The days' engagement of each ad over a window from `from` (YYYY-MM-DD), summed by kind. Null a deploy behind. */
export async function readAdsEngaged(
  db: Db,
  tenantId: TenantId,
  from: string,
): Promise<Map<string, AdEngagedSum> | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ad_days")
    .select("ad_id, engaged")
    .gte("day", from)
    .not("engaged", "is", null)
    .limit(20_000);
  if (error) {
    if (error.code === NO_COLUMN) return null;
    throw new DbFailure(error, "the ads' engagement");
  }
  const sums = new Map<string, AdEngagedSum>();
  for (const row of data) {
    const day = recordOrEmpty(row.engaged);
    const sum = sums.get(row.ad_id) ?? {};
    for (const kind of ENGAGED_KINDS) {
      const n = wholeOf(day[kind]);
      if (n > 0) sum[kind] = (sum[kind] ?? 0) + n;
    }
    sums.set(row.ad_id, sum);
  }
  return sums;
}

/** Someone who commented on an ad, as their page names them. */
export interface AdCommenter {
  id: string;
  /** Their row's own words for them, which the page names them by (contracts personName). */
  contact: {
    display_name: string | null;
    wa_profile_name: string | null;
    phone_e164: string | null;
    email: string | null;
  };
  /** Their latest comment on it (ISO). */
  at: string;
}

/** The most commenters a read hands one ad: the drawer names them a page at a time. */
const COMMENTERS_MAX = 50;

/**
 * Who commented on each ad since `from` (ISO), the latest first: a comment kept on the ad (a post made by hand), or kept on a
 * post Chanlytics sent that names the ad beside it. One row a person, by their latest comment; an erased person is left
 * out. Null a deploy behind.
 */
export async function readAdCommenters(
  db: Db,
  tenantId: TenantId,
  from: string,
): Promise<Map<string, { count: number; people: AdCommenter[] }> | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("touches")
    .select(
      "subject_type, subject_id, evidence, at, contact_id, contacts!touches_contact_same_workspace(display_name, wa_profile_name, phone_e164, email)",
    )
    .eq("kind", "comment")
    .eq("place", "instagram")
    .is("emptied_at", null)
    .gte("at", from)
    .or("subject_type.eq.ad,evidence->>ad.not.is.null")
    .order("at", { ascending: false })
    .limit(5_000);
  if (error) {
    if (error.code === NO_COLUMN || error.code === "22P02") return null;
    throw new DbFailure(error, "who commented on the ads");
  }
  const byAd = new Map<string, Map<string, AdCommenter>>();
  for (const row of data) {
    const named = recordOrEmpty(row.evidence).ad;
    const adId = row.subject_type === "ad" ? row.subject_id : typeof named === "string" ? named : "";
    if (!adId || !row.contact_id || !row.contacts) continue;
    const people = byAd.get(adId) ?? new Map<string, AdCommenter>();
    // The latest comment first: a person met again keeps the moment they were first met at, which is their latest.
    if (!people.has(row.contact_id))
      people.set(row.contact_id, { id: row.contact_id, contact: row.contacts, at: row.at });
    byAd.set(adId, people);
  }
  return new Map(
    [...byAd].map(([adId, people]) => [
      adId,
      { count: people.size, people: [...people.values()].slice(0, COMMENTERS_MAX) },
    ]),
  );
}
