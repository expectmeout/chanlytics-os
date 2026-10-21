/**
 * The Console's staff and its reads across workspaces (decision 0066, 00466): who the calling session is to the
 * Console, Find, Home's spend, a workspace by its address, and who has taken a workspace.
 *
 * The session's questions (staffStateOf, findAcross) run on the session client, because each function answers about
 * `auth.uid()` alone and asks is_platform_admin() itself. The rest run on the service role the dashboard's backOffice()
 * hands out only once the database said yes. Each answers what the database answered, its error untouched, so the
 * caller keeps its own words.
 *
 * Cross-workspace: the Console's own reads; the service-role client exists only behind backOffice(ctx)'s admin check.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";

type Db = SupabaseClient<Database>;

/** What the database says of the calling session: its role, `needs_second_factor`, or `none`. */
export async function staffStateOf(db: Db) {
  return db.rpc("platform_staff_state");
}

/** One box over every workspace (platform_find): refused, 42501, to a session that is not staff with its factor. */
export async function findAcross(db: Db, q: string) {
  return db.rpc("platform_find", { p_q: q });
}

/** What every model call cost over the last days, and across how many workspaces. */
export async function modelSpend(db: Db, days: number) {
  return db.rpc("platform_model_spend", { p_days: days });
}

/** A workspace by the address /w/ says it with. */
export async function tenantBySlug(db: Db, slug: string) {
  return db.from("tenants").select("id, slug, name, status, timezone, created_at").eq("slug", slug).maybeSingle();
}

/** Workspaces' names and addresses by id, for rows that carry only the id. */
export async function tenantNames(db: Db, ids: readonly string[]) {
  return db
    .from("tenants")
    .select("id, slug, name")
    .in("id", [...ids]);
}

/* ------------------------------------------------------------------------------------------------ who has it */

/** Every claim still held at `nowIso`. */
export async function liveClaims(db: Db, nowIso: string) {
  return db.from("platform_claims").select("tenant_id, user_id, email, until").gt("until", nowIso);
}

/**
 * Take a workspace until `untilIso`: a claim that ran out, or the caller's own, is cleared first, then the row is
 * written. A live claim of someone else's stays, and the insert's unique key (23505) says so; the caller reads who.
 */
export async function takeClaim(
  db: Db,
  claim: { tenantId: string; userId: string; email: string | null; nowIso: string; untilIso: string },
) {
  const cleared = await db
    .from("platform_claims")
    .delete()
    .eq("tenant_id", claim.tenantId)
    .or(`until.lt.${claim.nowIso},user_id.eq.${claim.userId}`);
  if (cleared.error) return { data: null, error: cleared.error };
  return db
    .from("platform_claims")
    .insert({
      tenant_id: claim.tenantId,
      user_id: claim.userId,
      email: claim.email,
      claimed_at: claim.nowIso,
      until: claim.untilIso,
    })
    .select("tenant_id, user_id, email, until")
    .single();
}

/** Let a workspace go: the caller's own claim only. */
export async function letClaimGo(db: Db, tenantId: string, userId: string) {
  return db.from("platform_claims").delete().eq("tenant_id", tenantId).eq("user_id", userId);
}

/** Who holds a workspace now, when someone does. */
export async function claimOf(db: Db, tenantId: string, nowIso: string) {
  return db
    .from("platform_claims")
    .select("tenant_id, user_id, email, until")
    .eq("tenant_id", tenantId)
    .gt("until", nowIso)
    .maybeSingle();
}
