import "server-only";

/**
 * What a workspace has, as one function.
 *
 * Every field is a fact the workspace holds right now: the config row, the
 * channels, the templates Meta approved, whether the calendar feed can be read,
 * who is on the team, where alerts go, how many people said yes, whether the
 * owner has asked a person at Chanlytics for a line, and how they pay. Nothing
 * here is a stored "done" flag -- contracts/setup.ts turns these into rows.
 *
 * WHY IT IS A FUNCTION AND NOT A ROUTE HANDLER. It has two callers now. The
 * workspace reads its own through /api/v1/setup on the session client, where
 * RLS is the enforcement. The back office reads somebody else's through
 * /api/v1/platform, on the service client, after the database has said the
 * caller is a platform admin.
 *
 * That is the whole point of the back office: support sees exactly what the
 * customer sees, not a second rendering that can disagree with it. Which is
 * only true while this is one function -- so it is one, and the client and the
 * viewer are arguments.
 *
 * WHY THE VIEWER IS A DISCRIMINATED UNION AND NOT A ROLE STRING. The first
 * version took `role: string` and the back office passed "owner". That looked
 * harmless and broke the whole surface: the roster it fed goes through
 * `team_roster`, a SECURITY DEFINER function whose first statement checks
 * `auth.uid()` against memberships. On the service client `auth.uid()` is NULL,
 * so the RPC raised 42501, teamRoster rethrew it, and EVERY detail read 500'd.
 * It shipped that way because every test around it either called pure contract
 * functions or stubbed the fetch.
 *
 * A string could not have prevented that; a type can. `back_office` is a
 * different kind of viewer, not an owner-shaped one, and it reads the two
 * numbers Setup actually needs -- how many members, how many open invitations --
 * with plain counting queries. No roster, and therefore no member's email ever
 * crosses the tenant boundary, which is the right answer on privacy grounds too.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { getTenantConfig } from "@chanlytics/db";
import { parseTenantConfigResult, starterByName, resolveFacts, factConflicts, type SetupDto } from "@chanlytics/contracts";
import { calendarWeek } from "./calendar";
import { teamRoster } from "./service";
import { linesFor, linesStatus } from "./lines";
import { listingFor, connectionFor, googleReadiness } from "./google";
import { billingFor, billingReadiness } from "./billing";

/**
/**
 * Who is looking, which decides what may be read and how.
 *
 * `member` is a signed-in person reading their own workspace on the session
 * client, where RLS is the enforcement and definer RPCs can see `auth.uid()`.
 * `back_office` is support reading somebody else's on the service client, where
 * there is no session at all -- so nothing on that path may call a function that
 * asks who is signed in.
 */
export type SetupViewer = { kind: "member" } | { kind: "back_office" };

/** How many people are in the workspace and how many invitations are open -- the only two numbers Setup uses. */
async function teamCounts(supabase: SupabaseClient<Database>, tenantId: string): Promise<{ members: number; invitesOpen: number }> {
  const [members, invites] = await Promise.all([
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("invitations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
      .is("accepted_at", null).is("revoked_at", null),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (invites.error) throw new Error(invites.error.message);
  return { members: members.count ?? 0, invitesOpen: invites.count ?? 0 };
}

/**
 * @param supabase the client to read with -- session-scoped for a workspace
 *   reading its own, service-role for the back office reading another's.
 * @param viewer which of those two this is. It is not a preference: the back
 *   office has no session, so the path it takes must never reach an RPC that
 *   reads `auth.uid()`.
 */
export async function setupDtoFor(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  viewer: SetupViewer,
  now = new Date(),
): Promise<SetupDto> {

  const [cfgRow, channels, lastMsg, lastCall, templates, calendar, team, yes, offersYes, requested, lineRows, lineStatus, listing, google, connection, billingRow, billingReady] = await Promise.all([
    getTenantConfig(supabase, tenantId),
    supabase.from("tenant_channels").select("kind, status, number_e164, config").eq("tenant_id", tenantId),
    supabase.from("messages").select("channel_ts, created_at").eq("tenant_id", tenantId).eq("direction", "inbound").eq("channel", "whatsapp")
      .order("channel_ts", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("calls").select("started_at").eq("tenant_id", tenantId).eq("direction", "inbound")
      .order("started_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    supabase.from("templates").select("name, meta_status, hidden_at").eq("tenant_id", tenantId),
    calendarWeek({ supabase }, tenantId, { from: null, days: 7 }, now, { canAct: false }).catch(() => null),
    viewer.kind === "member" ? teamRoster(supabase, tenantId) : teamCounts(supabase, tenantId),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("consent", "opted_in").is("erased_at", null),
    // The OTHER answer, counted on its own column. `dnc` is excluded here and not
    // above because a do-not-contact blocks a promotion outright, and the row this
    // feeds is the one that says whether a broadcast can go out at all -- the same
    // condition `contacts_marketing_reachable` (00095) uses.
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId)
      .eq("marketing_consent", "opted_in").eq("dnc", false).is("erased_at", null),
    supabase.from("notifications").select("created_at").eq("tenant_id", tenantId).eq("subject_type", "setup")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    linesFor(supabase, tenantId),
    linesStatus(),
    listingFor(supabase, tenantId),
    googleReadiness(),
    connectionFor(supabase, tenantId),
    billingFor(supabase, tenantId),
    billingReadiness(),
  ]);
  if (channels.error) throw new Error(channels.error.message);
  if (lastMsg.error) throw new Error(lastMsg.error.message);
  if (lastCall.error) throw new Error(lastCall.error.message);
  if (templates.error) throw new Error(templates.error.message);
  if (yes.error) throw new Error(yes.error.message);
  if (requested.error) throw new Error(requested.error.message);

  // The config, as the parser reads it — a broken row is its own fact.
  const parsed = cfgRow ? parseTenantConfigResult(cfgRow.config) : null;
  const cfg = parsed && parsed.ok ? parsed.config : null;
  const brain = cfg?.brain ?? null;
  const profile = brain?.profile ?? null;
  const business: SetupDto["business"] = {
    name: brain?.business_name ?? null,
    hours: !!profile?.hours && Object.keys(profile.hours).length > 0,
    services: profile?.services?.length ?? 0,
    bookingLink: !!brain?.booking_link,
    address: !!profile?.address,
    handoff: profile?.handoff_number ?? null,
    broken: !!parsed && !parsed.ok,
  };

  const byKind = (kind: string) => (channels.data ?? []).find((c) => c.kind === kind) ?? null;
  const wa = byKind("whatsapp");
  const voice = byKind("voice");
  const waCfg = (wa?.config && typeof wa.config === "object" && !Array.isArray(wa.config) ? wa.config : {}) as Record<string, unknown>;

  const approved = (templates.data ?? []).filter((t) => t.meta_status === "approved" && !t.hidden_at);
  const pending = (templates.data ?? []).filter((t) => t.meta_status === "pending" && !t.hidden_at);

  // The same resolver the prompt and the Business pane use. Setup called the
  // facts row "ready" whenever the fields were filled in, on a workspace whose
  // receptionist was publishing the number it transfers to.
  const conflicts = factConflicts(resolveFacts(brain, {
    workspace: null,
    channels: channels.data ?? [],
    listing: listing ? { name: listing.name, address: listing.address } : null,
  }));

  const setup: SetupDto = {
    business,
    conflicts,
    channels: {
      whatsapp: {
        present: !!wa,
        active: wa?.status === "active",
        number: wa?.number_e164 ?? null,
        quality: typeof waCfg.quality_rating === "string" ? (waCfg.quality_rating as string) : null,
        lastInboundAt: lastMsg.data?.channel_ts ?? lastMsg.data?.created_at ?? null,
      },
      voice: {
        present: !!voice,
        active: voice?.status === "active",
        number: voice?.number_e164 ?? null,
        lastInboundAt: lastCall.data?.started_at ?? null,
      },
    },
    templates: {
      approved: approved.length,
      pending: pending.length,
      startersApproved: approved.filter((t) => starterByName(t.name) !== null).length,
    },
    calendar: { state: calendar?.feed.state ?? "none" },
    team: {
      // Either shape answers the same two questions; the member path already
      // has the roster in hand, the back office never asks for it.
      members: "members" in team && Array.isArray(team.members) ? team.members.length : (team as { members: number }).members,
      invitesOpen: "invites" in team ? team.invites.length : (team as { invitesOpen: number }).invitesOpen,
      alertEmails: cfg?.notifications?.escalation_emails?.length ?? 0,
    },
    consent: { yes: yes.count ?? 0, offers: offersYes.count ?? 0 },
    requests: { line: requested.data?.created_at ?? null },
    lines: { rows: lineRows, ready: lineStatus.ready, provider: lineStatus.provider, costs: { local_number_month_usd: lineStatus.costs.local_number_month_usd } },
    google: {
      ready: google.places || google.profile,
      places: google.places,
      listing: listing ? { name: listing.name, rating: listing.rating, review_count: listing.review_count, checked_at: listing.checked_at, check_error: listing.check_error } : null,
      connected: !!connection?.location_name,
    },
    billing: billingRow
      ? { ready: billingReady.ready, mode: billingRow.mode, status: billingRow.status, trial_end: billingRow.trial_end, current_period_end: billingRow.current_period_end, trial_days: billingReady.trial_days, cancel_at: billingRow.cancel_at, cancel_at_period_end: billingRow.cancel_at_period_end }
      : undefined,
  };
  return setup;
}
