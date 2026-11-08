/**
 * A workspace's team as the dashboard reads and moves it (decision 0111): the roster and the open invitations, a person
 * looked up for an invite, and the team's doors (00178 onwards) that join, invite, withdraw, renew, change a role,
 * remove and leave; an invitation found by its address across workspaces at sign-in and taken up. Each answer is the
 * database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { platformWide } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;
type Args<F extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][F]["Args"];

/** The workspace's members, each with what the roster may say of them (team_roster). */
export const readTeamRoster = async (db: Db, tenantId: string) => db.rpc("team_roster", { p_tenant_id: tenantId });

/** The workspace's invitations not yet taken up or withdrawn, oldest first. */
export const listOpenInvitations = async (db: Db, tenantId: string) =>
  db
    .from("invitations")
    .select("id, email, role, created_at, expires_at")
    .eq("tenant_id", tenantId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at");

/** The account an address belongs to, as an invite asks it (lookup_user_for_invite). */
export const lookupUserForInvite = async (db: Db, tenantId: string, email: string) =>
  db.rpc("lookup_user_for_invite", { p_tenant_id: tenantId, p_email: email });

/** A person with an account joined to the team (team_join). */
export const joinTeam = async (db: Db, args: Args<"team_join">) => db.rpc("team_join", args);

/** A person invited to the team (team_invite). */
export const inviteToTeam = async (db: Db, args: Args<"team_invite">) => db.rpc("team_invite", args);

/** An invitation withdrawn (team_invite_withdraw). */
export const withdrawTeamInvite = async (db: Db, tenantId: string, invitationId: string) =>
  db.rpc("team_invite_withdraw", { p_tenant_id: tenantId, p_invitation_id: invitationId });

/** A member's role changed (team_change_role). */
export const changeTeamRole = async (db: Db, args: Args<"team_change_role">) => db.rpc("team_change_role", args);

/** A member, or an invitation, taken off the team (team_remove). */
export const removeFromTeam = async (db: Db, args: Args<"team_remove">) => db.rpc("team_remove", args);

/** An invitation sent again, its clock renewed (team_invite_renew). */
export const renewTeamInvite = async (db: Db, args: Args<"team_invite_renew">) => db.rpc("team_invite_renew", args);

/** A renewal taken back when its mail did not go (team_invite_renew_withdraw). */
export const withdrawInviteRenewal = async (db: Db, args: Args<"team_invite_renew_withdraw">) =>
  db.rpc("team_invite_renew_withdraw", args);

/** The member leaves the team (team_leave). */
export const leaveWorkspaceTeam = async (db: Db, args: Args<"team_leave">) => db.rpc("team_leave", args);

/** The invitations open to an address at `now`, whichever workspace's: what a sign-in takes up. */
export const listInvitesForAddress = async (db: Db, email: string, now: string) =>
  platformWide(db)
    .from("invitations")
    .select("id, tenant_id, role")
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now);

/** A person made a member of a workspace. */
export const insertMembership = async (db: Db, row: Database["public"]["Tables"]["memberships"]["Insert"]) =>
  db.from("memberships").insert(row);

/** An invitation stamped as taken up at `at`, only while it is open. */
export const stampInvitationAccepted = async (db: Db, tenantId: string, invitationId: string, at: string) =>
  db
    .from("invitations")
    .update({ accepted_at: at })
    .eq("id", invitationId)
    .eq("tenant_id", tenantId)
    .is("accepted_at", null);

/**
 * The person's workspaces, by name, read newest columns first: each read after the first leaves one newer column out,
 * for a database the migration adding it has not reached (the colour's 00490, the word's 00458, the logo's 00407).
 */
export const listMyWorkspaces = async (db: Db) =>
  db.from("tenants").select("id, slug, name, status, timezone, appointment_word, logo_path, accent").order("name");

/** The person's workspaces before the colour (00490). */
export const listMyWorkspacesBeforeAccent = async (db: Db) =>
  db.from("tenants").select("id, slug, name, status, timezone, appointment_word, logo_path").order("name");

/** The person's workspaces before the word (00458). */
export const listMyWorkspacesBeforeWord = async (db: Db) =>
  db.from("tenants").select("id, slug, name, status, timezone, logo_path").order("name");

/** The person's workspaces with the columns every database has. */
export const listMyWorkspacesOldest = async (db: Db) =>
  db.from("tenants").select("id, slug, name, status, timezone").order("name");

/** The person's role in each of their workspaces. */
export const listMyRoles = async (db: Db, userId: string) =>
  db.from("memberships").select("tenant_id, role").eq("user_id", userId);

/** The workspace's own fields written, the row back with `columns` (a set the caller types): none back, refused. */
export const patchWorkspaceRowWith = async (
  db: Db,
  tenantId: string,
  patch: Database["public"]["Tables"]["tenants"]["Update"],
  columns: string,
) => db.from("tenants").update(patch).eq("id", tenantId).select(columns);
