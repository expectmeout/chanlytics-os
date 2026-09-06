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
import { AppError, type JobKind } from "@chanlytics/contracts";
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

/**
 * Remove private objects from the `media` bucket.
 *
 * storage.objects has no RLS policies at all — service-role is the only door,
 * which is why this cannot live on the session client like the rest of an
 * erasure. A key that is already absent is the desired end state, so a short
 * `removed` list is NOT a failure; only a transport error is.
 */
export async function removeMediaObjects(
  paths: string[],
): Promise<{ requested: number; removed: string[]; error: string | null }> {
  if (!paths.length) return { requested: 0, removed: [], error: null };
  const { data, error } = await serviceDb().storage.from("media").remove(paths);
  if (error) {
    console.error("media_remove_failed", error.message);
    return { requested: paths.length, removed: [], error: error.message };
  }
  return { requested: paths.length, removed: (data ?? []).map((o) => o.name), error: null };
}

/**
 * The Blob leg's retry handle.
 *
 * The thread key is the customer's phone digits, and after the tombstone there
 * is nowhere left to recompute it — so a failed erase job's own payload is the
 * only thing that can drive the retry.
 *
 * The decision is made on the PAYLOAD, not the state. claim_job flips
 * scheduled -> fired BEFORE dispatch and fail_job runs only from fire.ts's
 * catch block, so a lambda timeout or a hard crash leaves the row at 'fired'
 * with its thread_ids intact — and reading 'fired' as "already done" would
 * strand that transcript forever. The handler scrubs the payload on success,
 * so an unscrubbed payload means unfinished, whatever the state says.
 */
export async function rescheduleBlobErase(
  tenantId: string,
  contactId: string,
): Promise<{ jobId: string } | null> {
  const { data } = await serviceDb()
    .from("jobs")
    .select("id, state, payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "blob_thread_erase")
    .eq("payload->>contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1);
  const prior = data?.[0];
  if (!prior) return null;
  const payload = prior.payload as { thread_ids?: string[]; scrubbed?: boolean } | null;
  if (payload?.scrubbed) return null;                        // the leg finished
  if (prior.state === "scheduled") return { jobId: prior.id }; // still queued
  if (!payload?.thread_ids?.length) return null;             // nothing to retry
  return await schedule(tenantId, "blob_thread_erase", new Date(), prior.payload as Json);
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
  // must never reach into the real Blob store — and neither may a laptop.
  // The guard used to fire only when VERCEL_ENV was SET, so plain local dev,
  // where it is unset, mirrored pauses into the live store (review F42).
  if (process.env.VERCEL_ENV !== "production") return;
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

/**
 * Whisper to the phone receptionist mid-call, through the edge — the
 * provider key lives there. Same production guard as the pause mirror: a
 * preview must never speak into a real customer's call. Returns a reason
 * instead of throwing so the route can answer in a sentence.
 */
export async function whisperLiveCall(
  retellCallId: string,
  text: string,
  trigger: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "preview" };
  const r = await fetch(`${EDGE_BASE}/api/admin/whisper`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    body: JSON.stringify({ call_id: retellCallId, text, trigger }),
  });
  if (r.ok) return { ok: true };
  const j = (await r.json().catch(() => ({}))) as { error?: string; status?: number };
  return { ok: false, reason: j.error ? `${j.error}${j.status ? ` ${j.status}` : ""}` : `edge ${r.status}` };
}

/**
 * Have the edge rewrite a held draft to the owner's instruction. The model
 * key lives there; RLS and the role door have already been checked by the
 * route that calls this.
 */
export async function steerDraft(
  messageId: string,
  text: string,
): Promise<{ ok: true; messageId: string; text: string } | { ok: false; reason: string }> {
  if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "preview" };
  const r = await fetch(`${EDGE_BASE}/api/admin/steer`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    body: JSON.stringify({ message_id: messageId, text }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message_id?: string; text?: string; error?: string };
  if (r.ok && j.ok && j.message_id) return { ok: true, messageId: j.message_id, text: j.text ?? "" };
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}` };
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
  ctx: { supabase: SupabaseClient<Database>; userId: string },
  tenantId: string,
  subjectType: "membership" | "invitation",
  subjectId: string,
  verb: "invite" | "revoke_invite" | "change_role" | "remove_member",
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await ctx.supabase.from("decisions").insert({
    tenant_id: tenantId,
    subject_type: subjectType,
    subject_id: subjectId,
    verb,
    actor_type: "user",
    actor_user_id: ctx.userId,
    payload: payload as Json,
  });
  if (error) console.error("team_audit_failed", verb, error.message);
}
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
    const { data: created, error } = await db
      .from("memberships")
      .insert({ tenant_id: tenantId, user_id: existingId, role })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await noteTeamChange({ supabase: caller, userId: invitedBy }, tenantId, "membership", created.id, "invite", {
      email, role, joined_existing_account: true,
    });
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
    throw new AppError("upstream_email", `We could not send the invitation email: ${mailErr.message}`, 502);
  }
  return { invited: true as const };
}

export async function setMemberRole(
  ctx: { supabase: SupabaseClient<Database>; userId: string },
  tenantId: string,
  membershipId: string,
  role: string,
) {
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
      if ((count ?? 0) <= 1) throw new AppError("conflict", "This is the only owner. Promote someone else first.", 409);
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
  if (!data) throw new AppError("not_found", "That person is not on this team.", 404);
  // The previous role is the part that matters later: "was promoted to
  // owner" is a different fact from "was already one".
  await noteTeamChange(ctx, tenantId, "membership", data.id, "change_role", {
    to: data.role,
  });
  return { membershipId: data.id, role: data.role };
}

export async function removeMember(
  ctx: { supabase: SupabaseClient<Database>; userId: string },
  tenantId: string,
  id: string,
  callerUserId: string,
) {
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
  if (target.user_id === callerUserId) throw new AppError("conflict", "You cannot remove yourself. Ask another owner.", 409);
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

/**
 * After an erasure: the jobs that carried the customer's number or words.
 *
 * erase_contact cancels what is still scheduled and touches nothing else, so
 * done, failed and canceled outbound_send rows kept `to_phone` and `body` in
 * their payload — a copy of the conversation the erasure promised to remove.
 * Matched by contact id or by the number in any of its forms; the Blob-erase
 * job is left alone because it is the one doing the erasing.
 */
export async function scrubErasedJobs(tenantId: string, contactId: string, phones: string[]): Promise<number> {
  const db = serviceDb();
  const { data: rows, error } = await db
    .from("jobs")
    .select("id, payload")
    .eq("tenant_id", tenantId)
    .neq("kind", "blob_thread_erase");
  if (error) throw new Error(`scrub_jobs_read: ${error.message}`);
  const digits = new Set(phones.map((p) => p.replace(/\D/g, "")).filter(Boolean));
  const hit = (rows ?? []).filter((j) => {
    const p = (j.payload ?? {}) as Record<string, unknown>;
    if (p.contact_id === contactId) return true;
    const to = typeof p.to_phone === "string" ? p.to_phone.replace(/\D/g, "") : "";
    return !!to && digits.has(to);
  });
  for (const j of hit) {
    const { error: uerr } = await db
      .from("jobs")
      .update({ payload: { scrubbed_at: new Date().toISOString(), reason: "contact erased" } })
      .eq("id", j.id);
    if (uerr) throw new Error(`scrub_jobs_update: ${uerr.message}`);
  }
  return hit.length;
}

/* ---- Connect your WhatsApp: the edge holds the app secret and does the exchange ---- */

export interface SignupConfig {
  app_id: string | null;
  config_id: string | null;
  graph_version: string;
  ready: boolean;
  reason: string | null;
}

/** What the browser needs to start Embedded Signup; honest about what is missing. */
export async function whatsappSignupConfig(): Promise<SignupConfig> {
  if (process.env.VERCEL_ENV !== "production") return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: "preview" };
  try {
    const r = await fetch(`${EDGE_BASE}/api/admin/whatsapp/signup-config`, { headers: { "x-diag-key": process.env.DIAG_KEY! }, cache: "no-store" });
    const j = (await r.json().catch(() => null)) as (SignupConfig & { ok?: boolean }) | null;
    if (!r.ok || !j?.ok) return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: `edge ${r.status}` };
    return { app_id: j.app_id, config_id: j.config_id, graph_version: j.graph_version, ready: j.ready, reason: j.reason };
  } catch (e) {
    return { app_id: null, config_id: null, graph_version: "v25.0", ready: false, reason: e instanceof Error ? e.message : "unreachable" };
  }
}

export type ConnectOutcome =
  | { ok: true; channelId: string; numberE164: string | null; verifiedName: string | null; qualityRating: string | null; registration: string }
  | { ok: false; reason: string; detail?: string };

/** The owner's number becomes a channel: the edge exchanges the code, registers the number and stores the token. */
export async function connectWhatsApp(
  tenantId: string,
  userId: string,
  body: { code: string; phone_number_id: string; waba_id: string },
): Promise<ConnectOutcome> {
  if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "preview" };
  const r = await fetch(`${EDGE_BASE}/api/admin/whatsapp/connect`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, ...body }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; channel_id?: string; number_e164?: string | null; verified_name?: string | null; quality_rating?: string | null; registration?: string; error?: string; detail?: string };
  if (r.ok && j.ok && j.channel_id) {
    return { ok: true, channelId: j.channel_id, numberE164: j.number_e164 ?? null, verifiedName: j.verified_name ?? null, qualityRating: j.quality_rating ?? null, registration: j.registration ?? "registered" };
  }
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

/* ---- Templates as Meta holds them: the edge reads the number's account ---- */

export type SyncOutcome =
  | { ok: true; seen: number; approved: number; marketing: number; syncedAt: string }
  | { ok: false; reason: string; detail?: string };

/** Every template of the workspace's WhatsApp account, upserted; a row Meta does not return is left as it was. */
export async function syncTemplates(tenantId: string): Promise<SyncOutcome> {
  if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "preview" };
  const r = await fetch(`${EDGE_BASE}/api/admin/whatsapp/templates-sync`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; seen?: number; approved?: number; marketing?: number; synced_at?: string; error?: string; detail?: string };
  if (r.ok && j.ok) {
    return { ok: true, seen: j.seen ?? 0, approved: j.approved ?? 0, marketing: j.marketing ?? 0, syncedAt: j.synced_at ?? new Date().toISOString() };
  }
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

/* ---- Templates written here: the edge submits to Meta and keeps the row ---- */

export type TemplateCreateOutcome = { ok: true; id: string; metaStatus: string } | { ok: false; reason: string; detail?: string };

export async function createTemplate(
  tenantId: string,
  userId: string,
  t: { name: string; language: string; category: string; components: unknown[]; body: string; examples: string[]; labels?: string[] },
): Promise<TemplateCreateOutcome> {
  if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "preview" };
  const r = await fetch(`${EDGE_BASE}/api/admin/whatsapp/templates-create`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, ...t }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: string; meta_status?: string; error?: string; detail?: string };
  if (r.ok && j.ok && j.id) return { ok: true, id: j.id, metaStatus: j.meta_status ?? "pending" };
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

export type TemplateDeleteOutcome = { ok: true; atMeta: boolean } | { ok: false; reason: string; detail?: string };

export async function deleteTemplate(tenantId: string, templateId: string): Promise<TemplateDeleteOutcome> {
  if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "preview" };
  const r = await fetch(`${EDGE_BASE}/api/admin/whatsapp/templates-delete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    body: JSON.stringify({ tenant_id: tenantId, template_id: templateId }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; at_meta?: boolean; error?: string; detail?: string };
  if (r.ok && j.ok) return { ok: true, atMeta: !!j.at_meta };
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}

/* ---- Playbooks: one run now, the same implementation the hourly sweep uses ---- */

export type RunPlaybookOutcome =
  | { ok: true; outcome: "sent" | "held" | "empty" | "off"; eligible?: number; broadcastId?: string; skipped?: string }
  | { ok: false; reason: string; detail?: string };

/**
 * The edge runs it (lib/playbooks.ts) as this person's decision: it sends
 * now unless the class is set to never, one run per local day.
 */
export async function runPlaybookNow(tenantId: string, playbookId: string, userId: string): Promise<RunPlaybookOutcome> {
  if (process.env.VERCEL_ENV !== "production") return { ok: false, reason: "preview" };
  const r = await fetch(`${EDGE_BASE}/api/admin/playbooks-run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY! },
    body: JSON.stringify({ tenant_id: tenantId, playbook_id: playbookId, user_id: userId }),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; outcome?: string; eligible?: number; broadcast_id?: string; skipped?: string; error?: string; detail?: string };
  if (r.ok && j.ok && (j.outcome === "sent" || j.outcome === "held" || j.outcome === "empty" || j.outcome === "off")) {
    return { ok: true, outcome: j.outcome, eligible: j.eligible, broadcastId: j.broadcast_id, skipped: j.skipped };
  }
  return { ok: false, reason: j.error ? String(j.error) : `edge ${r.status}`, detail: j.detail };
}
