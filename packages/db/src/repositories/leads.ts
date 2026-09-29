/**
 * One lead as the Leads page would show it (Reach out Part 4, PR 9): what GET leads/[id] reads for the peek of a lead
 * on no page the tab has loaded. The lead in the workspace named, the membership the page would show (00212's
 * lead_member_of, over lead_member_shown, the one rule leads_page asks) and how many places it was found at. Reads
 * run on the session client, so RLS decides what comes back; the page's rows are leads_page's, read by the dashboard.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

type Db = SupabaseClient<Database>;

/** The lead's columns as leads_page answers them, under the names it answers them by. */
const ONE_LEAD_COLUMNS =
  "id, tenant_id, place_id, business_name, category, street, city, region, postal_code, neighborhood, lat, lng, mark_path, website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, email_checked_at, rating, reviews, stage, closed_reason, last_outcome, last_note, about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank, contact_id, contacted_at, converted_at, exported_at, found_at, version, blanked_at, erased_at";

type LeadsRow = Database["public"]["Tables"]["leads"]["Row"];
export type LeadOneLead = Omit<LeadsRow, "country" | "logo_url" | "resume_at" | "website_root">;

/** The membership lead_member_of answers, the columns leads_page answers of it. */
export interface LeadOneMember {
  id: string;
  search_id: string;
  class: string;
  excluded_by: string | null;
  fit: string | null;
  reason: string;
  distance_m: number | null;
  counted: boolean;
  judgment: Json;
}

const jsonString = (v: Json | undefined): string | null => (typeof v === "string" ? v : null);

/** lead_member_of's jsonb, narrowed: a shape it does not answer is no membership. */
function memberOf(data: Json | null): LeadOneMember | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const id = jsonString(data.id);
  const searchId = jsonString(data.search_id);
  const cls = jsonString(data.class);
  if (!id || !searchId || !cls) return null;
  return {
    id,
    search_id: searchId,
    class: cls,
    excluded_by: jsonString(data.excluded_by),
    fit: jsonString(data.fit),
    reason: jsonString(data.reason) ?? "",
    distance_m: typeof data.distance_m === "number" ? data.distance_m : null,
    counted: data.counted === true,
    judgment: data.judgment ?? null,
  };
}

/**
 * One lead of the workspace named, with the membership the page would show (in `searchId` when it names one, else
 * the newest) and its places counted; null when the lead is not the workspace's, is erased or blanked, or has no
 * membership the page would show.
 */
export async function readLeadOne(
  db: Db,
  tenantId: string,
  leadId: string,
  searchId?: string,
): Promise<{ lead: LeadOneLead; member: LeadOneMember; places: number } | null> {
  const [l, m, places] = await Promise.all([
    db.from("leads").select(ONE_LEAD_COLUMNS).eq("id", leadId).eq("tenant_id", tenantId).maybeSingle(),
    db.rpc("lead_member_of", {
      p_tenant_id: tenantId,
      p_lead_id: leadId,
      ...(searchId ? { p_search_id: searchId } : {}),
    }),
    db.from("lead_places").select("id", { count: "exact", head: true }).eq("lead_id", leadId),
  ]);
  if (l.error) throw new Error(`readLeadOne: ${l.error.message}`);
  if (m.error) throw new Error(`lead_member_of: ${m.error.message}`);
  if (places.error) throw new Error(`readLeadOne: ${places.error.message}`);
  const lead = l.data;
  const member = memberOf(m.data);
  if (!lead || lead.tenant_id !== tenantId || lead.blanked_at || lead.erased_at || !member) return null;
  return { lead, member, places: places.count ?? 1 };
}
