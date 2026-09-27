import "server-only";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { recordDecision } from "../verbs";
import { serviceDb } from "../service-db";

/* ---- E1 team operations (Session A) --------------------------------------
   The ONLY file that touches auth.admin. Every function takes a tenantId the
   route has already proven the caller belongs to (memberContext), then scopes
   every query to it by hand — the service role bypasses RLS, so the scoping
   discipline lives here instead. */

interface TeamMember {
  membershipId: string;
  userId: string;
  email: string | null;
  /** The name they gave; "" when none. */
  displayName: string;
  role: string;
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
/**
 * Write a team change to the SAME ledger the conversation verbs use.
 *
 * decisions recorded every conversation verb and nothing about the team —
 * the one table where reconstructing who did what afterwards is hardest, and
 * where it matters most: promoting someone to owner hands them billing, the
 * power to remove everyone else, and the receptionist's voice.
 *
 * On the CALLER's client. decisions_acting_member_insert already admits an
 * acting member, so this needs no privilege the request does not have — and
 * actor_user_id is then the session's own user rather than something passed
 * in and trusted.
 *
 * Deliberately non-fatal. The audit row must never be the reason a role
 * change fails: the change has already happened, and throwing here would
 * report failure for something that succeeded.
 */
async function noteTeamChange(
  ctx: { supabase: SupabaseClient<Database>; userId: string; via?: "ask"; undoOf?: string },
  tenantId: string,
  subjectType: "membership" | "invitation",
  subjectId: string,
  verb: "invite" | "revoke_invite" | "change_role" | "remove_member",
  payload: Record<string, unknown>,
): Promise<void> {
  // Through the one ledger writer, so a card's mark (via) and an undo's link
  // ride on a team change as they ride on every other decision. This used to
  // be its own insert, and an invitation made from the Ask palette was the
  // one card whose row said nothing about the card.
  try {
    await recordDecision(ctx, tenantId, subjectType, subjectId, verb, payload as Json);
  } catch (e) {
    console.error("team_audit_failed", verb, e instanceof Error ? e.message : String(e));
  }
}

export async function teamRoster(db: SupabaseClient<Database>, tenantId: string) {
  const [members, invites] = await Promise.all([
    db.rpc("team_roster", { p_tenant_id: tenantId }),
    // Plain RLS: invitations_member_read already scopes this to the caller's
    // workspaces, so it never needed a privileged client.
    db
      .from("invitations")
      .select("id, email, role, created_at, expires_at")
      .eq("tenant_id", tenantId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at"),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (invites.error) throw new Error(invites.error.message);

  const roster: TeamMember[] = (members.data ?? []).map((m) => ({
    membershipId: m.membership_id,
    userId: m.member_user_id,
    email: m.email,
    displayName: m.display_name,
    role: m.role,
  }));
  return { members: roster, invites: (invites.data ?? []) as OpenInvite[] };
}

export async function inviteMember(
  /** The caller's own client — the ledger records the change under this session. */
  caller: SupabaseClient<Database>,
  tenantId: string,
  invitedBy: string,
  email: string,
  role: "operator" | "viewer",
  /** Where the request came from inside the app, when it says: a card, not a form. */
  via?: "ask",
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
  const { data: existingId, error: lookupErr } = await db.rpc("lookup_user_for_invite", {
    p_tenant_id: tenantId,
    p_email: email,
  });
  if (lookupErr) throw new Error(lookupErr.message);
  if (existingId) {
    const { data: mem } = await db
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", existingId)
      .maybeSingle();
    if (mem) return { alreadyMember: true as const };
    // Known account, new workspace: membership now, no email ceremony needed.
    const { data: created, error } = await db
      .from("memberships")
      .insert({ tenant_id: tenantId, user_id: existingId, role })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await noteTeamChange({ supabase: caller, userId: invitedBy, via }, tenantId, "membership", created.id, "invite", {
      email,
      role,
      joined_existing_account: true,
    });
    return { added: true as const };
  }

  const { data: inv, error: invErr } = await db
    .from("invitations")
    .insert({ tenant_id: tenantId, email, role, invited_by: invitedBy })
    .select("id")
    .single();
  if (invErr || !inv) {
    if (invErr?.code === "23505") return { alreadyInvited: true as const };
    throw new Error(invErr?.message ?? "invitation not created");
  }
  const { error: mailErr } = await db.auth.admin.inviteUserByEmail(email);
  if (mailErr) {
    // The intent row without the email is a lie in the invites list — undo it.
    await db.from("invitations").delete().eq("tenant_id", tenantId).eq("email", email).is("accepted_at", null);
    throw new AppError("upstream_email", `We could not send the invitation email: ${mailErr.message}`, 502);
  }
  // On the ledger once the email is on its way: an invitation is a decision
  // to hand out the power to message customers, and this path recorded none.
  await noteTeamChange({ supabase: caller, userId: invitedBy, via }, tenantId, "invitation", inv.id, "invite", {
    email,
    role,
  });
  return { invited: true as const };
}

export async function setMemberRole(
  ctx: { supabase: SupabaseClient<Database>; userId: string; via?: "ask"; undoOf?: string },
  tenantId: string,
  membershipId: string,
  role: string,
  svc: SupabaseClient<Database> = serviceDb(),
) {
  const db = svc;
  // Read first, always: the previous role is the part of the audit that
  // matters later ("was promoted to owner" is a different fact from "was
  // already one"), and the row is the only place it is written.
  const { data: target, error: readErr } = await db
    .from("memberships")
    .select("id, role")
    .eq("tenant_id", tenantId)
    .eq("id", membershipId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!target) throw new AppError("not_found", "That person is not on this team.", 404);
  if (role !== "owner" && target.role === "owner") {
    // Demoting the LAST owner strands the workspace — nobody could ever
    // manage the team or billing again.
    const { count } = await db
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) throw new AppError("conflict", "This is the only owner. Promote someone else first.", 409);
  }
  const { data, error } = await db
    .from("memberships")
    .update({ role })
    .eq("tenant_id", tenantId)
    .eq("id", membershipId)
    .select("id, role")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AppError("not_found", "That person is not on this team.", 404);
  await noteTeamChange(ctx, tenantId, "membership", data.id, "change_role", {
    from: target.role,
    to: data.role,
  });
  return { membershipId: data.id, role: data.role };
}

export async function removeMember(
  ctx: { supabase: SupabaseClient<Database>; userId: string; via?: "ask"; undoOf?: string },
  tenantId: string,
  id: string,
  callerUserId: string,
  svc: SupabaseClient<Database> = serviceDb(),
) {
  const db = svc;
  // id may be a membership or an open invite — try the invite first (cheaper).
  const { data: inv } = await db
    .from("invitations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .is("accepted_at", null)
    .maybeSingle();
  if (inv) {
    const { error } = await db.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", inv.id);
    if (error) throw new Error(error.message);
    await noteTeamChange(ctx, tenantId, "invitation", inv.id, "revoke_invite", {});
    return { revokedInvite: true as const };
  }
  const { data: target } = await db
    .from("memberships")
    .select("id, user_id, role")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!target) throw new AppError("not_found", "That person is not on this team.", 404);
  if (target.user_id === callerUserId)
    throw new AppError("conflict", "You cannot remove yourself. Ask another owner.", 409);
  if (target.role === "owner") {
    const { count } = await db
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) throw new AppError("conflict", "This is the only owner. Promote someone else first.", 409);
  }
  const { error } = await db.from("memberships").delete().eq("id", target.id);
  if (error) throw new Error(error.message);
  // Recorded AFTER the delete, and carrying the role they held — the
  // membership row is gone, so this is the only surviving record of it.
  await noteTeamChange(ctx, tenantId, "membership", target.id, "remove_member", {
    removed_user_id: target.user_id,
    had_role: target.role,
  });
  return { removed: true as const };
}

/** A sign-in completes any open invites for this email: membership rows
 *  appear at the invited role and the invite is stamped accepted. Called from
 *  the workspaces route on every same-origin read, not only when a session has
 *  no memberships yet: a person already in one workspace can be invited to
 *  another. Self-healing, no separate accept endpoint to get wrong. */
export async function acceptOpenInvites(userId: string, email: string | null): Promise<number> {
  if (!email) return 0;
  const db = serviceDb();
  const { data: open, error } = await db
    .from("invitations")
    .select("id, tenant_id, role")
    .eq("email", email.toLowerCase())
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error || !open?.length) return 0;
  let n = 0;
  for (const inv of open) {
    const { error: mErr } = await db
      .from("memberships")
      .insert({ tenant_id: inv.tenant_id, user_id: userId, role: inv.role });
    if (!mErr || mErr.code === "23505") {
      await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
      n++;
    }
  }
  return n;
}
