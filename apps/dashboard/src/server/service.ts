import "server-only";

/**
 * Service-role territory (Blueprint §8): jobs scheduling and the pre-Gate-1b
 * Blob pause mirror. Tenant DATA writes never happen here — those run on the
 * session client so RLS enforces. This module cannot be imported client-side.
 */
import { createServiceClient } from "@chanlytics/db";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scheduleJob, cancelJobsFor } from "@chanlytics/jobs";
import type { JobKind } from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";

let svc: SupabaseClient<Database> | null = null;
function serviceDb(): SupabaseClient<Database> {
  svc ??= createServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  return svc;
}

export async function schedule(
  tenantId: string,
  kind: JobKind,
  dueAt: Date,
  payload: Json,
): Promise<{ jobId: string }> {
  const { jobId } = await scheduleJob(serviceDb(), {
    tenantId, kind, dueAt, payload,
    qstashToken: process.env.QSTASH_TOKEN!,
  });
  return { jobId };
}

export async function cancelKindFor(
  tenantId: string,
  kind: JobKind,
  payloadKey: string,
  payloadValue: string,
): Promise<number> {
  return cancelJobsFor(serviceDb(), tenantId, kind, payloadKey, payloadValue, process.env.QSTASH_TOKEN);
}

/** Short-lived signed URL for a private media object (call recordings). */
export async function signedMediaUrl(storagePath: string, seconds = 300): Promise<string | null> {
  const { data, error } = await serviceDb().storage.from("media").createSignedUrl(storagePath, seconds);
  if (error) {
    console.error("signed_media_url_failed", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

const EDGE_BASE = "https://chanlytics-messaging.vercel.app";

/**
 * Pre-Gate-1b bridge: the live bot reads pause state from Blob until the read
 * flip — a dashboard pause that doesn't reach Blob doesn't pause the bot
 * (the D10 incident). Fails LOUD: callers treat a mirror failure as a failed verb.
 */
export async function mirrorBlobPause(
  tenantId: string,
  phoneE164: string,
  pausedUntilMs: number,
): Promise<void> {
  // Only the production dashboard owns the live bot's pause state; a preview
  // must never reach into the real Blob store.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return;
  const r = await fetch(`${EDGE_BASE}/api/admin/pause`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    // The tenant is REQUIRED. Without it the edge keyed the pause on the phone
    // number alone, so taking over a conversation paused that customer's
    // receptionist at every business that has them as a customer.
    body: JSON.stringify({
      tenant_id: tenantId,
      phone_digits: phoneE164.replace(/[^\d]/g, ""),
      paused_until_ms: pausedUntilMs,
    }),
  });
  if (!r.ok) throw new Error(`blob pause mirror failed (${r.status})`);
}

/* ---- E1 team operations (Session A) --------------------------------------
   The ONLY file that touches auth.admin. Every function takes a tenantId the
   route has already proven the caller belongs to (memberContext), then scopes
   every query to it by hand — the service role bypasses RLS, so the scoping
   discipline lives here instead. */

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string | null;
  role: string;
  isMe?: boolean;
}
export interface OpenInvite {
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
export async function teamRoster(
  db: SupabaseClient<Database>,
  tenantId: string,
  callerRole: string,
) {
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
    role: m.role,
  }));
  return { members: roster, invites: (invites.data ?? []) as OpenInvite[], callerRole };
}

export async function inviteMember(
  /** The caller's own client — used for the owner-checked email lookup. */
  caller: SupabaseClient<Database>,
  tenantId: string,
  invitedBy: string,
  email: string,
  role: "operator" | "viewer",
) {
  const db = serviceDb();
  // A person who already belongs shouldn't get a confusing signup email.
  //
  // One indexed lookup, not a page of the whole platform. This was
  // `auth.admin.listUsers({ perPage: 1000 })` — O(every account) per invite,
  // and silently wrong past a thousand: an existing user on page two read as
  // new, the invite email then failed because the account already existed, and
  // the invitation row was rolled back. The owner got an error they could not
  // act on, and the person was never added. supabase-js has no
  // getUserByEmail, so the lookup lives in the database.
  const { data: existingId, error: lookupErr } = await caller.rpc("lookup_user_for_invite", {
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
    const { error } = await db.from("memberships").insert({ tenant_id: tenantId, user_id: existingId, role });
    if (error) throw new Error(error.message);
    return { added: true as const };
  }

  const { error: invErr } = await db
    .from("invitations")
    .insert({ tenant_id: tenantId, email, role, invited_by: invitedBy });
  if (invErr) {
    if (invErr.code === "23505") return { alreadyInvited: true as const };
    throw new Error(invErr.message);
  }
  const { error: mailErr } = await db.auth.admin.inviteUserByEmail(email);
  if (mailErr) {
    // The intent row without the email is a lie in the invites list — undo it.
    await db.from("invitations").delete().eq("tenant_id", tenantId).eq("email", email).is("accepted_at", null);
    throw new Error(`Invite email failed: ${mailErr.message}`);
  }
  return { invited: true as const };
}

export async function setMemberRole(tenantId: string, membershipId: string, role: string) {
  const db = serviceDb();
  if (role !== "owner") {
    // Demoting the LAST owner strands the workspace — nobody could ever
    // manage the team or billing again.
    const { data: target } = await db
      .from("memberships")
      .select("id, role")
      .eq("tenant_id", tenantId)
      .eq("id", membershipId)
      .maybeSingle();
    if (target?.role === "owner") {
      const { count } = await db
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("role", "owner");
      if ((count ?? 0) <= 1) throw new Error("last_owner");
    }
  }
  const { data, error } = await db
    .from("memberships")
    .update({ role })
    .eq("tenant_id", tenantId)
    .eq("id", membershipId)
    .select("id, role")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_found");
  return { membershipId: data.id, role: data.role };
}

export async function removeMember(tenantId: string, id: string, callerUserId: string) {
  const db = serviceDb();
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
    return { revokedInvite: true as const };
  }
  const { data: target } = await db
    .from("memberships")
    .select("id, user_id, role")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!target) throw new Error("not_found");
  if (target.user_id === callerUserId) throw new Error("self_remove");
  if (target.role === "owner") {
    const { count } = await db
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) throw new Error("last_owner");
  }
  const { error } = await db.from("memberships").delete().eq("id", target.id);
  if (error) throw new Error(error.message);
  return { removed: true as const };
}

/** First sign-in completes any open invites for this email: membership rows
 *  appear at the invited role and the invite is stamped accepted. Called from
 *  the workspaces route when a session has no memberships yet — self-healing,
 *  no separate accept endpoint to get wrong. */
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
