/**
 * What the lead finder's runner reads and writes beside its SQL doors (decision 0111): a round's runs, the round and
 * the run its job names, the members and the facts of their leads, and which places, numbers and addresses a workspace
 * already holds or was told no. A round and a run are read by the id their job names, across workspaces (the job is
 * the platform's); every other read names the workspace. Each answer is the database's as it came; the runner (the
 * edge's leadDb) says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types";
import { DbFailure, type TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** The facts of a lead the runner reads back. */
const LEAD_FACTS =
  "id, lat, lng, phone_e164, email, email_state, place_id, stage, contact_id, contacted_at, last_outcome, phone_wrong";

/** A round's runs, new, each inserted only where no run of its id is: a second inserter meets the first and adds none. */
export const insertLeadRuns = async (db: Db, rows: Database["public"]["Tables"]["lead_runs"]["Insert"][]) =>
  db.from("lead_runs").upsert(rows, { onConflict: "id", ignoreDuplicates: true });

/** Every run of a round, whole. */
export const listRunsOfRound = async (db: Db, roundId: string) =>
  db.from("lead_runs").select("*").eq("round_id", roundId);

/** One run, whole, or none. */
export const findLeadRun = async (db: Db, runId: string) =>
  db.from("lead_runs").select("*").eq("id", runId).maybeSingle();

/** One round, whole, or none. */
export const findLeadRound = async (db: Db, roundId: string) =>
  db.from("lead_rounds").select("*").eq("id", roundId).maybeSingle();

/** The members of a round, or of a search, whole. */
export const listSearchMembers = async (db: Db, by: "round_id" | "search_id", id: string) =>
  db.from("lead_search_members").select("*").eq(by, id);

/** These leads' facts, as the runner reads them back. */
export const listLeadFacts = async (db: Db, leadIds: string[]) => db.from("leads").select(LEAD_FACTS).in("id", leadIds);

/** The workspace's leads (not erased) at any of these places. */
export const listLeadsAtPlaces = async (db: Db, tenantId: TenantId, placeIds: string[]) =>
  db.from("leads").select("id, place_id").eq("tenant_id", tenantId).in("place_id", placeIds).is("erased_at", null);

/** The places the workspace's leads were also found at, among these. */
export const listLeadPlacesAt = async (db: Db, tenantId: TenantId, placeIds: string[]) =>
  db.from("lead_places").select("lead_id, place_id").eq("tenant_id", tenantId).in("place_id", placeIds);

/** The workspace's leads (not erased) whose `by` is one of `values`, each with its id and that value. */
export const listLeadsSharing = async (
  db: Db,
  tenantId: TenantId,
  by: "phone_e164" | "email" | "website_host",
  values: string[],
) => db.from("leads").select(`id, ${by}`).eq("tenant_id", tenantId).in(by, values).is("erased_at", null);

/** The workspace's people (not erased) whose `by` is one of `values`, each with its id and that value. */
export const listPeopleSharing = async (db: Db, tenantId: TenantId, by: "phone_e164" | "email", values: string[]) =>
  db.from("contacts").select(`id, ${by}`).eq("tenant_id", tenantId).in(by, values).is("erased_at", null);

/** Which of these places' erasure digests the workspace was told no for. */
export const listPlacesSuppressed = async (db: Db, tenantId: TenantId, hashes: string[]) =>
  db.from("lead_suppressions").select("hash").eq("tenant_id", tenantId).eq("kind", "place").in("hash", hashes);

/** How many addresses on the never-again list are there for one reason. */
async function countSuppressedAddresses(
  db: Db,
  tenantId: TenantId,
  what: "said_no" | "email_opt_out",
): Promise<number> {
  const { count, error } = await db
    .from("lead_suppressions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("kind", "email")
    .eq("what", what);
  if (error) throw new DbFailure(error, "cannot count the never-again list");
  return count ?? 0;
}

/**
 * Who said no and who asked to stop, as the Cold email page says them. Its rows are scrambled, so it can say how many and
 * never who, and it counts addresses: someone who said no leaves a row for their address and one for their company.
 */
export async function countLeadSuppressions(
  db: Db,
  tenantId: TenantId,
): Promise<{ said_no: number; asked_to_stop: number }> {
  const [said_no, asked_to_stop] = await Promise.all([
    countSuppressedAddresses(db, tenantId, "said_no"),
    countSuppressedAddresses(db, tenantId, "email_opt_out"),
  ]);
  return { said_no, asked_to_stop };
}

/** What a round's question is told with: its workspace, its search, its state and the question. */
export const findRoundToTell = async (db: Db, roundId: string) =>
  db.from("lead_rounds").select("tenant_id, search_id, state, question").eq("id", roundId).maybeSingle();

/** The workspace's search's name. */
export const findLeadSearchName = async (db: Db, tenantId: TenantId, searchId: string) =>
  db.from("lead_searches").select("name").eq("id", searchId).eq("tenant_id", tenantId).maybeSingle();

/** What a delivery from the provider is checked against: the run's workspace, its provider run, its state and its token. */
export const findRunForDelivery = async (db: Db, runId: string) =>
  db.from("lead_runs").select("id, tenant_id, apify_run_id, state, webhook_token_hash").eq("id", runId).maybeSingle();
