import "server-only";
import { emitEvent, recordEvent, getSubjectsWith } from "@chanlytics/db/events";
import { getOwnPartner } from "@chanlytics/db/partners";
import { inviteUserByEmail } from "@chanlytics/db/auth";
import {
  changeTeamRole,
  insertMembership,
  inviteToTeam,
  joinTeam,
  leaveWorkspaceTeam,
  listInvitesForAddress,
  listOpenInvitations,
  listWorkspaceIds,
  lookupUserForInvite,
  readTeamRoster,
  removeFromTeam,
  renewTeamInvite,
  stampInvitationAccepted,
  withdrawInviteRenewal,
  withdrawTeamInvite,
} from "@chanlytics/db/workspace";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppError,
  type InvitationsAcceptedDto,
  type JoinedWorkspaceDto,
  type MembershipRole,
  recordOrEmpty,
} from "@chanlytics/contracts";
import { serviceDb } from "../shared/service-db";
import { getTenantFacts } from "../shared/tenant";
import { requireSecondFactor, type RouteContext } from "../shared/with-route";
import { log } from "@/server/shared/log";
import type { TenantId } from "@chanlytics/contracts";

/**
 * Team operations: the roster, an invitation, a role change, a removal, and the sign-in that completes an invitation.
 * The one email it sends, the invitation's, goes through packages/db's inviteUserByEmail (SQL cannot send mail); no file
 * here names the admin API. A function takes the workspace the route has already proven the caller belongs
 * to (getMemberContext) and hands it to the database's team_* functions with the session's verified user as the actor;
 * each checks that the actor owns the workspace before it changes anything. The service role bypasses RLS, so that
 * scoping lives in those functions and in the tenant each call names.
 *
 * Cross-workspace: acceptOpenInvites completes the invitations addressed to the signed-in email in every workspace that
 * invited it; the email, proved by the session, is the scope, and each membership it makes is the invitation's own. It
 * runs from a POST the shell makes once when it boots, never from a read (decision 0047, lane 6).
 */

/** The one sentence for a change that would leave the workspace with no owner: team_change_role's and team_remove's refusal (last_owner), and 00271's trigger's behind it. */
const ONLY_OWNER = "This is the only owner. Promote someone else first.";

interface TeamMember {
  membershipId: string;
  userId: string;
  email: string | null;
  /** The name they gave; "" when none. */
  displayName: string;
  role: string;
  /** When they joined the workspace (team_roster's `joined_at`, 00068); null where the read did not say. */
  joined_at: string | null;
  isMe?: boolean;
}

interface OpenInvite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

/**
 * A team change and its row on the ledger, in one transaction (00277: team_change_role, team_remove, team_join,
 * team_invite).
 *
 * decisions recorded every conversation verb and nothing about the team, the one table where reconstructing who did
 * what afterwards is hardest, and where it matters most: promoting someone to owner hands them billing, the power to
 * remove everyone else, and the receptionist's voice. The row was then written after the change, on the caller's
 * client, and a failed write was a log line: the change stood, unrecorded. Now the database makes the change and its
 * row together or neither. The functions are the platform's (the service role), handed the session's verified user as
 * the actor; each checks that the actor owns the workspace before it changes anything, and the last owner stays one
 * with the owners locked while they are counted.
 */
type TeamCtx = { userId: string; via?: RouteContext["via"]; undoOf?: string };

/** The database's refusal, as the owner reads it. */
function teamRefusal(error: { code?: string; message: string }): Error {
  if (error.message === "forbidden") return new AppError("forbidden", "Only an owner can do this.", 403);
  if (error.message === "not_found") return new AppError("not_found", "That person is not on this team.", 404);
  if (error.message === "last_owner") return new AppError("conflict", ONLY_OWNER, 409);
  if (error.message === "self_remove")
    return new AppError("conflict", "You cannot remove yourself. Ask another owner.", 409);
  return new Error(error.message);
}

/** A team function's answer; a refusal thrown in the owner's words. An undo whose decision is unknown is said once. */
async function teamCall(
  call: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>,
  verb: string,
  undoOf?: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await call;
  if (error) throw teamRefusal(error);
  const answer = recordOrEmpty(data);
  // A card kept from a stale tab, or a header nobody should have sent: the change is kept without the link.
  if (answer.undo_dropped === true) log.error("decision_undo_of_unknown", { undo_of: undoOf, verb });
  return answer;
}

/**
 * The roster, in one round trip, on the CALLER's own client.
 *
 * This used to run on the service role and loop `auth.admin.getUserById` once
 * per member, sequentially — twenty people meant twenty round trips on every
 * Settings load. It did that because `memberships_self_select` is
 * `user_id = auth.uid()`, so a session client can see its own membership row
 * and nobody else's, and emails live in auth.users which PostgREST does not
 * expose at all.
 *
 * `team_roster` (00022) checks the caller's membership itself, which is what
 * lets this drop the service role rather than merely parallelise it. Fewer
 * privileged paths is the point; the speed is a side effect.
 */
export async function getTeamRoster(db: SupabaseClient<Database>, tenantId: TenantId) {
  const [members, invites] = await Promise.all([
    readTeamRoster(db, tenantId),
    // Plain RLS: invitations_member_read already scopes this to the caller's
    // workspaces, so it never needed a privileged client.
    listOpenInvitations(db, tenantId),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (invites.error) throw new Error(invites.error.message);

  const roster: TeamMember[] = (members.data ?? []).map((m) => ({
    membershipId: m.membership_id,
    userId: m.member_user_id,
    email: m.email,
    displayName: m.display_name,
    role: m.role,
    joined_at: m.joined_at ?? null,
  }));
  return { members: roster, invites: invites.data ?? [] };
}

export async function inviteMember(
  tenantId: TenantId,
  invitedBy: string,
  email: string,
  role: "operator" | "viewer",
  /** Where the request came from inside the app, when it says: a card, not a form. */
  via?: RouteContext["via"],
  /** The privileged client, injected by a test; the platform's own otherwise, as the roster takes its client. */
  svc: SupabaseClient<Database> = serviceDb(),
) {
  const db = svc;
  // A person who already belongs shouldn't get a confusing signup email.
  //
  // One indexed lookup, not a page of the whole platform. This was
  // `auth.admin.listUsers({ perPage: 1000 })` — O(every account) per invite,
  // and silently wrong past a thousand: an existing user on page two read as
  // new, the invite email then failed because the account already existed, and
  // the invitation row was rolled back. The owner got an error they could not
  // act on, and the person was never added. supabase-js has no
  // getUserByEmail, so the lookup lives in the database.
  //
  // On the platform's client, never the caller's. Whether an address has an
  // account is an oracle, and a session that could call this could ask it about
  // every address at API speed, outside the owner check and rate bucket the
  // invite route runs first (00121).
  const { data: existingId, error: lookupErr } = await lookupUserForInvite(db, tenantId, email);
  if (lookupErr) throw new Error(lookupErr.message);
  if (existingId) {
    // Known account, new workspace: membership now, no email ceremony needed, and the ledger saying so, together.
    const joined = await teamCall(
      joinTeam(db, {
        p_tenant_id: tenantId,
        p_actor: invitedBy,
        p_user_id: existingId,
        p_role: role,
        p_email: email,
        ...(via ? { p_via: via } : {}),
      }),
      "invite",
    );
    return joined.already_member === true ? { alreadyMember: true as const } : { added: true as const };
  }

  // The invitation and its row, before the mail: the mail cannot be part of a transaction, so a mail that could not
  // go takes both back, and the ledger never says an invitation went that did not.
  const inv = await teamCall(
    inviteToTeam(db, {
      p_tenant_id: tenantId,
      p_actor: invitedBy,
      p_email: email,
      p_role: role,
      ...(via ? { p_via: via } : {}),
    }),
    "invite",
  );
  if (inv.already_invited === true) return { alreadyInvited: true as const };
  const { error: mailErr } = await inviteUserByEmail(db, email);
  if (mailErr) {
    // The intent row without the email is a lie in the invites list, and on the ledger: take both back. The email's
    // failure is what the person is told; a withdrawal that fails too is logged beside it.
    const withdrawn = await withdrawTeamInvite(db, tenantId, String(inv.invitation_id));
    if (withdrawn.error)
      log.error("db_failed", {
        tenant_id: tenantId,
        code: withdrawn.error.code ?? null,
        error: withdrawn.error.message,
      });
    throw new AppError("upstream_email", `We could not send the invitation email: ${mailErr.message}`, 502);
  }
  return { invited: true as const };
}

export async function setMemberRole(
  ctx: TeamCtx,
  tenantId: TenantId,
  membershipId: string,
  role: string,
  svc: SupabaseClient<Database> = serviceDb(),
) {
  // Read and written in one transaction: the previous role is the part of the audit that matters later ("was
  // promoted to owner" is a different fact from "was already one"), and the row is the only place it is written.
  const changed = await teamCall(
    changeTeamRole(svc, {
      p_tenant_id: tenantId,
      p_actor: ctx.userId,
      p_membership_id: membershipId,
      p_role: role,
      ...(ctx.via ? { p_via: ctx.via } : {}),
      ...(ctx.undoOf ? { p_undo_of: ctx.undoOf } : {}),
    }),
    "change_role",
    ctx.undoOf,
  );
  return { membershipId: String(changed.membership_id), role: String(changed.role) };
}

export async function removeMember(
  ctx: TeamCtx,
  tenantId: TenantId,
  /** A membership or an open invitation; nobody removes themself (the actor is ctx's user). */
  id: string,
  svc: SupabaseClient<Database> = serviceDb(),
) {
  // id may be a membership or an open invite; the database tries the invite first. Recorded in the same transaction
  // as the delete, carrying the role they held: the membership row is gone, so the ledger's is the surviving record.
  const removed = await teamCall(
    removeFromTeam(svc, {
      p_tenant_id: tenantId,
      p_actor: ctx.userId,
      p_id: id,
      ...(ctx.via ? { p_via: ctx.via } : {}),
      ...(ctx.undoOf ? { p_undo_of: ctx.undoOf } : {}),
    }),
    "remove_member",
    ctx.undoOf,
  );
  return removed.revoked_invite === true ? { revokedInvite: true as const } : { removed: true as const };
}

/** Supabase Auth's refusal of an invitation to an address whose account was confirmed meanwhile. */
const EMAIL_HAS_ACCOUNT = "email_exists";

/**
 * An owner sends an open invitation again (00371 team_invite_renew): seven more days, a decision that says it went
 * again, then the email. The card offered "revoke it and send a new one", which sent nothing at all: the first
 * invitation had made an account, and the second found it. A mail that cannot go takes the renewal back, its expiry
 * and its decision, as a first invitation's failed mail takes the invitation back.
 */
export async function resendInvite(
  ctx: TeamCtx,
  tenantId: TenantId,
  invitationId: string,
  svc: SupabaseClient<Database> = serviceDb(),
) {
  let renewed: Record<string, unknown>;
  try {
    renewed = await teamCall(
      renewTeamInvite(svc, {
        p_tenant_id: tenantId,
        p_actor: ctx.userId,
        p_invitation_id: invitationId,
        ...(ctx.via ? { p_via: ctx.via } : {}),
      }),
      "invite",
    );
  } catch (e) {
    if (e instanceof AppError && e.code === "not_found")
      throw new AppError("not_found", "That invitation is no longer open.", 404);
    throw e;
  }
  const email = String(renewed.email);
  const { error: mailErr } = await inviteUserByEmail(svc, email);
  if (!mailErr) return { resent: true as const, email };
  // The email's failure is what the person is told; a renewal that cannot be taken back is logged beside it.
  const withdrawn = await withdrawInviteRenewal(svc, {
    p_tenant_id: tenantId,
    p_invitation_id: invitationId,
    p_decision_id: String(renewed.decision_id),
    p_was: String(renewed.was),
  });
  if (withdrawn.error)
    log.error("db_failed", { tenant_id: tenantId, code: withdrawn.error.code ?? null, error: withdrawn.error.message });
  if (mailErr.code === EMAIL_HAS_ACCOUNT)
    throw new AppError(
      "conflict",
      `${email} has an account now. Revoke this invitation and invite them again: they join at once.`,
      409,
    );
  throw new AppError("upstream_email", `We could not send the invitation email: ${mailErr.message}`, 502);
}

/**
 * A member leaves the workspace by their own hand (00371 team_leave), an owner too while another owner stays.
 * team_remove refuses a removal of oneself and is an owner's alone, so an operator who had left the business had to
 * ask to be taken off.
 */
export async function leaveTeam(ctx: TeamCtx, tenantId: TenantId, svc: SupabaseClient<Database> = serviceDb()) {
  try {
    await teamCall(
      leaveWorkspaceTeam(svc, { p_tenant_id: tenantId, p_actor: ctx.userId, ...(ctx.via ? { p_via: ctx.via } : {}) }),
      "leave",
    );
  } catch (e) {
    if (e instanceof AppError && e.code === "conflict")
      throw new AppError("conflict", "You're the only owner. Make someone else Owner first.", 409);
    throw e;
  }
  return { left: true as const };
}

/** An invitation still open for an address: where it seats them, and as what. */
interface InviteToAccept {
  id: string;
  tenant_id: TenantId;
  role: MembershipRole;
}

/**
 * The invitations still open for this address, none when there is no address or they cannot be read: looked up by the
 * accept (acceptOpenInvites), which is the one place that writes on them. Never rejects.
 */
async function openInvitesFor(email: string | null): Promise<InviteToAccept[]> {
  if (!email) return [];
  try {
    // A person's open invitations, whichever workspaces they are to: by design, read by their address.
    const { data, error } = await listInvitesForAddress(serviceDb(), email.toLowerCase(), new Date().toISOString());
    return error ? [] : (data ?? []);
  } catch {
    return [];
  }
}

/**
 * A person's open invitations accepted: membership rows appear at the invited role and each invite is stamped accepted.
 * Made by one POST the shell makes once when it boots (POST me/invitations/accept, joinFromInvitations), no longer by
 * the read of the workspace list, which seated people on every same-origin GET (decision 0047, lane 6: reads never
 * write). Not only for a session with no memberships yet: a person already in one workspace can be invited to another.
 * The invitations it seated, none when there is no address or nothing open.
 */
async function acceptOpenInvites(userId: string, email: string | null): Promise<InviteToAccept[]> {
  if (!email) return [];
  const invites = await openInvitesFor(email);
  if (!invites.length) return [];
  const db = serviceDb();
  const seated: InviteToAccept[] = [];
  for (const inv of invites) {
    const { error: mErr } = await insertMembership(db, { tenant_id: inv.tenant_id, user_id: userId, role: inv.role });
    // A refusal other than "they hold the seat" leaves the invitation open for the next read.
    if (mErr && mErr.code !== "23505") continue;
    // The seat, the news and the stamp are three writes that cannot share a transaction, so they are ordered to be finished
    // by whoever comes next: the news (member.joined, which the owner's bell line follows: core SUBSCRIBERS.team_notice)
    // before the invitation is stamped. An invitation still open is one nobody has been told of, so a read that died
    // between the seat and its news is finished by the next one, which finds the seat held (23505) and the ledger without
    // the news. The ledger is asked first, so a read that finds the news there writes none, and a seat that was held from
    // another door while the invitation stayed open is accepted and said once, when it is first signed in to.
    const sentence = await getSubjectsWith(db, inv.tenant_id, "member.joined", [inv.id]).catch(() => null);
    if (!sentence) continue;
    if (!sentence.has(inv.id)) {
      const { error } = await recordEvent(db, inv.tenant_id, "member.joined", "invitation", inv.id, {
        by: userId,
        role: inv.role,
      });
      if (error) {
        log.error("member_joined_not_recorded", { tenant_id: inv.tenant_id, invitation: inv.id, error });
        continue;
      }
    }
    // Stamped only if nobody stamped it first (a second tab's read at once), which is the one that counts it. A stamp
    // that fails is logged and leaves the invitation open: the seat is written already, and the next accept stamps it.
    const stamped = await stampInvitationAccepted(db, inv.tenant_id, inv.id, new Date().toISOString());
    if (stamped.error)
      log.error("db_failed", {
        tenant_id: inv.tenant_id,
        code: stamped.error.code ?? null,
        error: stamped.error.message,
      });
    seated.push(inv);
  }
  return seated;
}

/**
 * What POST me/invitations/accept answers: the workspaces the person was seated in, by name, so the shell can say "You
 * joined Harbor". The name is read as the service role (the seat was just made, and RLS shows the person their own
 * workspaces from the next request); one that cannot be read is "a workspace", never a failure of the acceptance.
 */
export async function joinFromInvitations(
  ctx: Pick<RouteContext, "supabase" | "userId" | "email" | "aal">,
): Promise<InvitationsAcceptedDto> {
  // A partner account opens the app on a session that showed its second factor (0013), as the list of workspaces has always
  // asked, so the refusal that sends the tab to the second step comes before any seat is made.
  if (await getOwnPartner(ctx.supabase)) requireSecondFactor(ctx);
  const seated = await acceptOpenInvites(ctx.userId, ctx.email ?? null);
  const db = serviceDb();
  const joined: JoinedWorkspaceDto[] = await Promise.all(
    seated.map(async (inv) => ({
      id: inv.tenant_id,
      name: (await getTenantFacts(db, inv.tenant_id).catch(() => null))?.name ?? "a workspace",
      role: inv.role,
    })),
  );
  return { joined };
}

/**
 * The workspaces a person is in, read before their account goes: its rows go with it, and each of those workspaces
 * is told a member left (recordLeft). A read that fails is no list, and the deletion goes on without the record.
 */
export async function listSeats(db: SupabaseClient<Database>, userId: string): Promise<string[]> {
  return listWorkspaceIds(db, userId).catch(() => []);
}

/**
 * A person deleted their account: said on the ledger of each workspace they sat in, so the team that reads the log
 * sees a seat go rather than a name vanish from the roster with no trace. Who they were is not kept: the account is
 * gone, and the id names no row. As the service role: their own session ended with the account.
 */
export async function recordLeft(tenantIds: readonly string[], userId: string): Promise<void> {
  const db = serviceDb();
  for (const tenantId of tenantIds)
    await emitEvent(db, tenantId, "member.left", "workspace", tenantId, { by: userId, how: "account_deleted" });
}
