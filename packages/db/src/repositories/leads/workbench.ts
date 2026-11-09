/**
 * The leads workbench as the member's pages read and move it (decision 0111): the searches and their counts, a lead's
 * and a search's own row, the leads page and the month's spend, and every door a press goes through (00143 onwards):
 * a stage, a bulk move, a check again, an erase, an import, a choice, a rename, a removal and its undo, an export, a
 * new search. Read on the member's own client: row-level security and each door's own check decide. Each answer is the
 * database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import type { TenantId, ContactId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** One of the workspace's searches as its card reads it, or none. */
export const findSearchCard = async (db: Db, tenantId: TenantId, searchId: string) =>
  db.from("lead_searches_view").select("*").eq("tenant_id", tenantId).eq("id", searchId).maybeSingle();

/** The workspace's searches not removed, newest first, `limit` of them. */
export const listSearchCards = async (db: Db, tenantId: TenantId, limit: number) =>
  db
    .from("lead_searches_view")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

/** The name of the workspace's newest search not removed, or null: who it has been looking for. */
export async function findNewestSearchName(db: Db, tenantId: TenantId): Promise<string | null> {
  const { data, error } = await db
    .from("lead_searches")
    .select("name")
    .eq("tenant_id", tenantId)
    .is("removed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cannot read the newest search: ${error.message}`);
  return data?.name.trim() || null;
}

/** The workspace's searches' names, `limit` of them. */
export const listSearchNames = async (db: Db, tenantId: TenantId, limit: number) =>
  db.from("lead_searches").select("id, name").eq("tenant_id", tenantId).limit(limit);

/** A lead's own row as a press on it is checked, or none. */
export const findLeadScope = async (db: Db, leadId: string) =>
  db
    .from("leads")
    .select(
      "id, tenant_id, business_name, email, email_state, stage, closed_reason, contact_id, place_id, erased_at, blanked_at",
    )
    .eq("id", leadId)
    .maybeSingle();

/** A search's own row as a press on it is checked, or none. */
export const findSearchScope = async (db: Db, searchId: string) =>
  db.from("lead_searches").select("id, tenant_id, name, plan, removed_at").eq("id", searchId).maybeSingle();

/** How many of a search's members are kept (not blanked). */
export const countKeptMembers = async (db: Db, searchId: string) =>
  db
    .from("lead_search_members")
    .select("lead_id", { count: "exact", head: true })
    .eq("search_id", searchId)
    .is("blanked_at", null);

/** The newest lead found of a person, not erased or blanked, or none. */
export const findNewestLeadOfPerson = async (db: Db, tenantId: TenantId, contactId: ContactId) =>
  db
    .from("leads")
    .select("id, business_name, found_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .is("erased_at", null)
    .is("blanked_at", null)
    .order("found_at", { ascending: false })
    .limit(1)
    .maybeSingle();

/** What a lead's draft is written from: its business, place and standing on Google. */
export const findLeadDraftFacts = async (db: Db, leadId: string) =>
  db
    .from("leads")
    .select("business_name, category, city, region, website_host, rating, reviews")
    .eq("id", leadId)
    .maybeSingle();

/** The workspace's kept suggestions of who to look for, or none. */
export const findLeadSuggestions = async (db: Db, tenantId: TenantId) =>
  db
    .from("lead_suggestions")
    .select("tenant_id, business_line, by_owner, items, made_at, basis, failed_at, passed")
    .eq("tenant_id", tenantId)
    .maybeSingle();

/** The workspace's searches' and lists' counts (lead_list_counts). */
export const readLeadListCounts = async (db: Db, tenantId: TenantId) =>
  db.rpc("lead_list_counts", { p_tenant_id: tenantId });

/** One page of the leads workbench (leads_page). */
export const readLeadsPage = async (db: Db, args: Args<"leads_page">) => db.rpc("leads_page", args);

/** What the workspace's finding spent in a month (lead_month_used). */
export const readLeadMonthUsed = async (db: Db, tenantId: TenantId, period: string) =>
  db.rpc("lead_month_used", { p_tenant_id: tenantId, p_period: period });

/** What finding a kind of business tends to cost (lead_niche_prior). */
export const readNichePrior = async (db: Db, categoryKey: string) =>
  db.rpc("lead_niche_prior", { p_category_key: categoryKey });

/** A lead moved to a stage (lead_set_stage). */
export const moveLeadStage = async (db: Db, args: Args<"lead_set_stage">) => db.rpc("lead_set_stage", args);

/** Many leads moved at once (lead_bulk). */
export const applyLeadBulk = async (db: Db, args: Args<"lead_bulk">) => db.rpc("lead_bulk", args);

/** Leads asked to be checked again (lead_check_again). */
export const askLeadsChecked = async (db: Db, args: Args<"lead_check_again">) => db.rpc("lead_check_again", args);

/** A lead erased (lead_erase). */
export const eraseLeadRow = async (db: Db, leadId: string) => db.rpc("lead_erase", { p_lead_id: leadId });

/** A list of the owner's own imported as a search (lead_search_import). */
export const importLeadList = async (db: Db, args: Args<"lead_search_import">) => db.rpc("lead_search_import", args);

/** Chosen leads kept as a search of their own (lead_search_choose). */
export const chooseLeadList = async (db: Db, args: Args<"lead_search_choose">) => db.rpc("lead_search_choose", args);

/** A search renamed (lead_search_rename). */
export const renameLeadSearch = async (db: Db, searchId: string, name: string) =>
  db.rpc("lead_search_rename", { p_search_id: searchId, p_name: name });

/** A search removed (lead_search_remove). */
export const removeLeadSearch = async (db: Db, searchId: string) =>
  db.rpc("lead_search_remove", { p_search_id: searchId });

/** A search's removal undone (lead_search_undo). */
export const undoLeadSearchRemoval = async (db: Db, searchId: string) =>
  db.rpc("lead_search_undo", { p_search_id: searchId });

/** Leads marked exported (lead_export_mark). */
export const markLeadsExported = async (db: Db, tenantId: TenantId, leadIds: string[]) =>
  db.rpc("lead_export_mark", { p_tenant_id: tenantId, p_ids: leadIds });

/** A new search begun (lead_search_create). */
export const startLeadSearch = async (db: Db, args: Args<"lead_search_create">) => db.rpc("lead_search_create", args);
