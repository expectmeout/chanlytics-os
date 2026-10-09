/**
 * The session's workspaces (app/api/v1/workspaces): the tenants RLS shows the caller, plus who is actually signed in,
 * on the payload the seam already fetches at boot (the platform-admin flag, the partner account, an open handover, the
 * sign-up posture for an account in no workspace yet), and the active workspace chosen by memberContext's one rule with
 * the one degradation that keeps a stale preference from bricking the app, every read asked at once and weighed in the
 * order it depends; and the two fields of the tenant row a
 * business owns, its zone and how its customers buy (0008). On a database 00160 has not reached, the read is asked
 * again without sells_by: either deploy order works. On the app's own reads only (the same origin: a cross-site GET
 * changes nothing) a read also accepts any open invitation for the caller's address and reads again
 * (acceptOpenInvites, which is why it is not only for an account with no membership), and a partner account must have
 * shown its second factor before it gets the list. The PATCH is its owner's: a forbidden UPDATE answers success with no
 * rows in this stack, so the row count is the permission check. The routes declare who may and how often.
 */
import { memberContext, requireSecondFactor, type MemberContext, type RouteContext } from "@/server/with-route";
import {
  AppError,
  SELLS_BY_REFUSAL,
  cleanTimezone,
  isSellsBy,
  pendingWorkspaceOf,
  providerNameOf,
  signupPosture,
  type SellsBy,
} from "@chanlytics/contracts";
import { acceptOpenInvites, openInvitesFor } from "@/server/workspace/team";
import { emitEvent, getOpenHandovers, getOwnPartner } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { isPlatformAdmin } from "@/server/platform/platform";
import { isSameOrigin } from "@/server/request-guards";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { settled } from "@/server/lazy";
import type { Member } from "@/server/route";

/** A workspace as the list says it: its zone, and how its customers buy (0008), null when it was never asked. */
interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  sells_by: string | null;
  /** The caller's role in it (0012): the switcher says it beside every workspace, and the partner's pane counts theirs. */
  role?: string | null;
}

const WORKSPACE_COLUMNS = "id, slug, name, status, timezone, sells_by";

const OLDER_COLUMNS = "id, slug, name, status, timezone";

/** The error a read that names sells_by gets from a database 00160 has not reached. */
const noSellsBy = (message: string): boolean =>
  /\bsells_by\b/.test(message) && /does not exist|could not find/i.test(message);

/**
 * The session's tenants, RLS-scoped, by name. The whole app boots on this read, so on a database 00160 has not reached
 * -- which answers "column does not exist" for sells_by -- it reads again without it, and every workspace is not asked
 * yet: deals off, never a blank app. Either deploy order works.
 */
async function tenantsOf(
  supabase: RouteContext["supabase"],
): Promise<{ data: WorkspaceRow[] | null; error: { message: string } | null }> {
  const r = await supabase.from("tenants").select(WORKSPACE_COLUMNS).order("name");
  if (!r.error || !noSellsBy(r.error.message)) return r;
  const older = await supabase.from("tenants").select(OLDER_COLUMNS).order("name");
  return { data: older.data?.map((t) => ({ ...t, sells_by: null })) ?? null, error: older.error };
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
  // partner's second factor before an invitation is accepted, an acceptance before the list is trusted.
  //
  // An open invitation for this address is looked up with them and accepted below. Self-healing: there is no
  // accept endpoint to get wrong, and no link that expires into a dead end. It used to be looked at ONLY when the
  // caller had no memberships, which quietly stranded anyone who acquired one first: someone invited before they
  // had an account, who signs up and creates their own workspace, holds a membership by the time the invitation is
  // looked at, so it was never honoured, nobody was told, and the owner who sent it saw "pending" forever. It now
  // runs on every workspace read; migration 00023 adds the partial index that makes that a lookup rather than a
  // scan. A GET is exempt from the cross-site check by design (reads change nothing), and this one writes on the
  // way through: benign and idempotent, but a write, so the lookup and the acceptance happen only on the app's own
  // reads, and a cross-site GET gets the list and nothing else (F51).
  const invited = isSameOrigin(_req) ? openInvitesFor(email ?? null) : null;
  const [tenants, profileRead, platformAdmin, partnerRow, open, mineRead, activeRead] = await Promise.all([
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
  let { data } = tenants;
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

  // An invitation accepted makes a membership the reads above did not see: they are read again.
  let mine = mineRead;
  let active = activeRead;
  if (invited && (await acceptOpenInvites(userId, email ?? null, invited)) > 0) {
    const [retry, roles, again] = await Promise.all([
      tenantsOf(supabase),
      rolesOf(supabase, userId),
      settled(memberContext(ctx, preferred, { defaultAllowed: true })),
    ]);
    if (retry.error) throw new Error(retry.error.message);
    data = retry.data;
    mine = roles;
    active = again;
  }

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
  const body = (await req.json().catch(() => null)) as { timezone?: unknown; sells_by?: unknown } | null;
  const zone = body?.timezone !== undefined;
  const answer = body?.sells_by;
  if (!zone && answer === undefined)
    throw new AppError("validation", "Send the workspace's timezone, or how its customers buy.");
  const patch: { timezone?: string; sells_by?: SellsBy } = {};
  if (zone) {
    const parsed = cleanTimezone(body?.timezone);
    if (!parsed.ok) throw new AppError("validation", parsed.reason);
    patch.timezone = parsed.tz;
  }
  if (answer !== undefined) {
    if (!isSellsBy(answer)) throw new AppError("validation", SELLS_BY_REFUSAL);
    patch.sells_by = answer;
  }

  const { data, error } = (await ctx.supabase
    .from("tenants")
    .update(patch)
    .eq("id", member.tenantId)
    .select(patch.sells_by ? WORKSPACE_COLUMNS : OLDER_COLUMNS)) as unknown as {
    data: Partial<WorkspaceRow>[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  // A forbidden UPDATE comes back successful with zero rows in this stack, so
  // the row count IS the permission check. Without this an owner whose policy
  // or grant went missing would be told the zone was saved and see the old one
  // on the next read.
  const what = zone ? "That workspace's timezone" : "How that workspace's customers buy";
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
