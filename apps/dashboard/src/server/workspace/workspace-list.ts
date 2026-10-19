/**
 * The session's workspaces (app/api/v1/workspaces): the tenants RLS shows the caller, plus who is actually signed in,
 * on the payload the seam already fetches at boot (the platform-admin flag, the partner account, an open handover, the
 * sign-up posture for an account in no workspace yet), and the active workspace chosen by memberContext's one rule with
 * the one degradation that keeps a stale preference from bricking the app, every read asked at once and weighed in the
 * order it depends; and the two fields of the tenant row a business owns, its zone and its word for a booking (0041 J4,
 * 00458). On a database a migration has not reached, the read is asked again without the newer column: either deploy
 * order works. The read writes nothing, whoever makes it: an invitation open for the caller's address is accepted by
 * one POST the shell makes once when it boots (POST me/invitations/accept, after which the list is read again when it
 * seated someone), not here (decision 0047, lane 6). A partner account must have shown its second factor before it gets
 * the list. The PATCH is its owner's: a forbidden UPDATE answers success with no rows in this stack, so the row count
 * is the permission check. The routes declare who may and how often.
 */
import { memberContext, requireSecondFactor, type MemberContext, type RouteContext } from "@/server/with-route";
import {
  APPOINTMENT_WORD_REFUSAL,
  AppError,
  cleanTimezone,
  cleanWorkspaceName,
  isAppointmentWord,
  pendingWorkspaceOf,
  providerNameOf,
  signupPosture,
  workspaceLogoSrc,
  type AppointmentWord,
} from "@chanlytics/contracts";
import { emitEvent, getOpenHandovers, getOwnPartner, workspaceNamed } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { isPlatformAdmin } from "@/server/platform/platform";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { settled } from "@/server/lazy";
import type { Member } from "@/server/route";

/** A workspace as the list says it: its zone, and its word for a booking (0041 J4, 00458), null where it never picked one. */
interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  appointment_word: string | null;
  /** The caller's role in it (0012): the switcher says it beside every workspace, and the partner's pane counts theirs. */
  role?: string | null;
  /** Where its own logo is served (00407), on the storage origin the content policy allows; null for none. */
  logo_url?: string | null;
}

/** The columns the list reads, newest first; each read after the first leaves one newer column out. */
const COLUMN_SETS = [
  "id, slug, name, status, timezone, appointment_word, logo_path",
  "id, slug, name, status, timezone, logo_path",
  "id, slug, name, status, timezone",
] as const;

/** What a PATCH of the word reads back: the row as it wrote it, its word with it, and never the logo's storage path. */
const WORD_ANSWER = "id, slug, name, status, timezone, appointment_word";

/** The error a read that names a newer column gets from a database the migration adding it has not reached. */
const lacksNewer = (message: string): boolean =>
  /\b(appointment_word|logo_path)\b/.test(message) && /does not exist|could not find/i.test(message);

/** A tenant row as any of the reads gives it. */
interface TenantRead {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  appointment_word?: string | null;
  logo_path?: string | null;
}

/** The rows as the list answers them: a workspace's logo as the address it is served at, never its storage path. */
const listed = (rows: TenantRead[] | null): WorkspaceRow[] | null =>
  rows?.map(({ logo_path: path, ...t }) => ({
    ...t,
    appointment_word: t.appointment_word ?? null,
    logo_url: workspaceLogoSrc(env.NEXT_PUBLIC_SUPABASE_URL, path),
  })) ?? null;

/**
 * The session's tenants, RLS-scoped, by name. The whole app boots on this read, so on a database a migration has not
 * reached -- which answers "column does not exist" for a newer column -- it reads again without it (the word's 00458,
 * then the logo's 00407), and what that database cannot say is not said yet: no word stored, no logo, never a blank
 * app. Either deploy order works.
 */
async function tenantsOf(
  supabase: RouteContext["supabase"],
): Promise<{ data: WorkspaceRow[] | null; error: { message: string } | null }> {
  const read = <C extends string>(columns: C) => supabase.from("tenants").select(columns).order("name");
  // Each read typed by its own columns, newest first.
  const reads = [() => read(COLUMN_SETS[0]), () => read(COLUMN_SETS[1]), () => read(COLUMN_SETS[2])];
  let last: { message: string } | null = null;
  for (const next of reads) {
    const r = await next();
    if (!r.error) return { data: listed(r.data), error: null };
    if (!lacksNewer(r.error.message)) return { data: null, error: r.error };
    last = r.error;
  }
  return { data: null, error: last };
}

/** The caller's role in each of their workspaces: their own memberships, by RLS. */
const rolesOf = (supabase: RouteContext["supabase"], userId: string) =>
  supabase.from("memberships").select("tenant_id, role").eq("user_id", userId);

export async function readWorkspaces(ctx: RouteContext, _req: Request) {
  const { supabase, userId, email } = ctx;
  const preferred = new URL(_req.url).searchParams.get("workspace");
  // Every read the answer is made of, at once. They were asked one after another, eight round trips before the
  // first byte (356 ms from a laptop to the database, 2 Oct 2026), and every page's boot reads this first; none of
  // them needs another's answer. What depends on something is decided below, in the order it always was: the
  // partner's second factor before the list is trusted.
  //
  // This read writes nothing. An open invitation for this address used to be looked up here and accepted on every
  // same-origin read, the document head's included, which seated a person with no word to them that it had and made a
  // GET that wrote (F51 had only made the cross-site one safe). It is one POST now (POST me/invitations/accept), which the
  // shell makes once when it boots and which says "You joined X"; the list is read again when it seated someone.
  // Acceptance was never gated on having no memberships (someone invited before they had an account, who then creates
  // their own workspace, is seated all the same); the POST keeps that, and migration 00023's partial index.
  const [tenants, profileRead, platformAdmin, partnerRow, open, mine, active] = await Promise.all([
    tenantsOf(supabase),
    // The name this person gave (profiles, 00068) rides with the identity, so the chrome shows a person rather
    // than the workspace standing in for one.
    supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
    // Whether the back office exists for this person, on the payload the seam already fetches at boot. The nav has
    // to decide synchronously whether the tab is there at all, and a second round trip for one boolean would make
    // the rail flicker for everybody to serve two accounts. It answers only about the caller -- see
    // is_platform_admin() in 00091 for why that is safe to hand every session -- and it is NOT the authorization:
    // every platform route asks the database again.
    isPlatformAdmin(ctx),
    // Whether this person is a partner (0012), on the same payload for the same reason: the Partner pane and the
    // switcher's role chips are drawn from what boot already fetched. Their own row alone, by RLS; null on a
    // database 00202 has not reached.
    getOwnPartner(supabase),
    // A workspace a partner set up and handed to this person (0016), on the same payload: the shell asks before it
    // opens anything else, the create screen included. None on a database 00214 has not reached; a failed read is
    // logged and reads as none, because the boot must not fail for it.
    getOpenHandovers(supabase),
    rolesOf(supabase, userId),
    settled(memberContext(ctx, preferred, { defaultAllowed: true })),
  ]);
  if (tenants.error) throw new Error(tenants.error.message);
  const { data } = tenants;
  // The name they gave us wins; the name they gave Google (full_name on the
  // auth user) stands in until they do. Never anything made from the email.
  const displayName = profileRead.data?.display_name || providerNameOf(ctx.metadata);
  const partner = partnerRow ? { code: partnerRow.code, status: partnerRow.status } : null;
  // A partner account opens the app on a session that showed its second factor (0013, M3, no grace): the refusal
  // sends the tab to the second step, where an account with no authenticator sets one up. Their seats are refused
  // on their own (memberContext) and hidden by the database (00218); this is the one place that says so at boot.
  if (partner) requireSecondFactor(ctx);
  if (open.error) log.error("handovers_unread", { error: open.error.slice(0, 200) });
  const handovers = open.handovers;

  // The caller's role rides along so the mockup gate() chips tell the truth —
  // but the role must describe the workspace actually being VIEWED. This used
  // to report the role for `data[0]`, the name-sorted first tenant, while the
  // rest of the app defaulted to the oldest membership: for anyone in two
  // workspaces the chips could describe one business and the data another.
  // memberContext owns that choice now, so there is one answer.
  //
  // A stale preference must not brick the app: the client remembers the last
  // workspace it was in, and someone removed from that workspace would send an
  // id they are no longer a member of. Everywhere else that is a 404 — here it
  // degrades to their default, because this is the endpoint whose whole job is
  // answering "where am I".
  // Someone with no workspace at all — an invite revoked before first sign-in —
  // must see an empty state, not a 404. This endpoint answers "where am I", and
  // "nowhere yet" is a real answer. It comes with what sign-up kept: the name
  // and clock this person typed before they had proved the inbox, so the
  // create screen opens with them rather than asking twice. Sign-up makes no
  // workspace; this is where every first workspace begins.
  if (!data?.length) {
    // And the sign-up posture, because the create screen is this person's door
    // and it asks the invite code -- or shows the list -- accordingly. Read here
    // so the bridge makes no request of its own for it.
    return {
      workspaces: [],
      activeWorkspaceId: null,
      pending: pendingWorkspaceOf(ctx.metadata),
      posture: signupPosture(env.SIGNUP_CODE),
      user: {
        id: userId,
        email: email ?? null,
        role: null,
        display_name: displayName,
        platform_admin: platformAdmin,
        partner,
        handovers,
      },
    };
  }

  // The caller's role in each workspace (0012): one read of their own memberships, RLS-scoped.
  if (mine.error) throw new Error(mine.error.message);
  const roleOf = new Map((mine.data ?? []).map((m) => [m.tenant_id, m.role]));
  const listed = data.map((w) => ({ ...w, role: roleOf.get(w.id) ?? null }));

  // A STALE PREFERENCE, and nothing else. memberContext throws two things:
  // an AppError("not_found") when the named workspace is not one of this
  // account's -- someone was removed from the workspace their tab remembers,
  // which is the degradation this fallback is for -- and a plain Error when
  // the memberships read itself failed. Catching both sent a momentary read
  // failure to the OLDEST membership instead, and the client echoes
  // activeWorkspaceId back on every later call: the operator would be working
  // in a different business's inbox with nothing on screen saying so. A
  // rejection that is not the stale preference is re-thrown with its own
  // cause, rather than replaced by a bare "no workspace" behind a 500.
  let member: MemberContext;
  if (active.ok) member = active.value;
  else {
    const e = active.error;
    if (!preferred || !(e instanceof AppError) || e.code !== "not_found") throw e;
    member = await memberContext(ctx, null, { defaultAllowed: true });
  }
  return {
    workspaces: listed,
    // Which workspace everything else on this page is scoped to. The client
    // echoes it back as ?workspace= so a reload lands where it left off.
    activeWorkspaceId: member.tenantId,
    user: {
      id: userId,
      email: email ?? null,
      role: member.role,
      display_name: displayName,
      platform_admin: platformAdmin,
      partner,
      handovers,
    },
  };
}

export async function patchWorkspace(ctx: RouteContext, req: Request, member: Member) {
  const body = (await req.json().catch(() => null)) as { timezone?: unknown; appointment_word?: unknown } | null;
  const zone = body?.timezone !== undefined;
  const word = body?.appointment_word;
  if (!zone && word === undefined)
    throw new AppError("validation", "Send the workspace's timezone, or what it calls a booking.");
  const patch: { timezone?: string; appointment_word?: AppointmentWord } = {};
  if (zone) {
    const parsed = cleanTimezone(body?.timezone);
    if (!parsed.ok) throw new AppError("validation", parsed.reason);
    patch.timezone = parsed.tz;
  }
  if (word !== undefined) {
    if (!isAppointmentWord(word)) throw new AppError("validation", APPOINTMENT_WORD_REFUSAL);
    patch.appointment_word = word;
  }

  const { data, error } = await writeOwnFields(ctx, member.tenantId, patch);
  // A zone this server's Intl knows and the database does not (00365 refuses one written, as creation always did) is
  // the owner's to choose again, in the words a zone nobody knows is refused in, not a failure of ours.
  if (error?.code === "22023" && patch.timezone)
    throw new AppError("validation", `${patch.timezone} is not a timezone this system knows.`);
  if (error) throw new Error(error.message);
  // A forbidden UPDATE comes back successful with zero rows in this stack, so
  // the row count IS the permission check. Without this an owner whose policy
  // or grant went missing would be told the zone was saved and see the old one
  // on the next read.
  const what = zone ? "That workspace's timezone" : "What that workspace calls a booking";
  if (!data?.length) throw new AppError("forbidden", `${what} could not be changed.`, 403);
  // On the ledger as every other setting is (settings-write.ts): which of the two moved and who by, never the value.
  // They live on the tenant's row, not in its config, so a save of them left no trace. As the service role: a session
  // may not insert into events.
  await emitEvent(serviceDb(), member.tenantId, "settings.changed", "workspace", member.tenantId, {
    fields: Object.keys(patch).sort(),
    by: ctx.userId,
    version: null,
  });
  return { workspace: data[0] };
}

/**
 * The fields of the tenant row a business owns, written through the session: RLS (the settings permission) is the floor,
 * and the rows that come back are the check, since a forbidden UPDATE answers success with none.
 */
async function writeOwnFields(
  ctx: RouteContext,
  tenantId: string,
  patch: { timezone?: string; appointment_word?: AppointmentWord; name?: string },
) {
  return (await ctx.supabase
    .from("tenants")
    .update(patch)
    .eq("id", tenantId)
    .select(patch.appointment_word ? WORD_ANSWER : COLUMN_SETS[2])) as unknown as {
    data: Partial<WorkspaceRow>[] | null;
    error: { message: string; code?: string } | null;
  };
}

/**
 * Rename the workspace with the business's name an owner saved (00439; the wiring's second audit, X4-5; Ruben, 15 October
 * 2026): its sign-up page, the page's paper form, the desk sign and the unsubscribe page say the name the receptionist
 * does. The ledger keeps the names it changed from and to, the one setting it says in full. Null where the workspace is
 * named so already, or the name is not one a workspace takes (the settings save took it; the workspace keeps its name). A
 * refusal throws: the grant missing (a database 00439 has not reached), or no row the caller may change.
 */
export async function renameWorkspace(
  ctx: RouteContext,
  member: Member,
  raw: string,
): Promise<{ from: string; to: string } | null> {
  const cleaned = cleanWorkspaceName(raw);
  if (!cleaned.ok) return null;
  const was = await workspaceNamed(ctx.supabase, member.tenantId);
  if (!was || was.name === cleaned.name) return null;
  const { data, error } = await writeOwnFields(ctx, member.tenantId, { name: cleaned.name });
  if (error) throw new Error(error.message);
  if (!data?.length) throw new AppError("forbidden", "That workspace's name could not be changed.", 403);
  await emitEvent(serviceDb(), member.tenantId, "settings.changed", "workspace", member.tenantId, {
    fields: ["name"],
    by: ctx.userId,
    version: null,
    from: was.name,
    to: cleaned.name,
  });
  return { from: was.name, to: cleaned.name };
}
