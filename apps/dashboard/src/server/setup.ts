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
import {
  parseTenantConfigResult,
  receptionistOf,
  starterByName,
  resolveFacts,
  factConflicts,
  knownForwarding,
  channelFor,
  hoursFromGoogle,
  type SetupDto,
  type CapabilityKind,
} from "@chanlytics/contracts";
import { calendarWeek } from "./calendar";
import { teamRoster } from "./service";
import { linesFor, linesStatus } from "./lines";
import { listingFor, listingFactsFor, connectionFor, googleReadiness } from "./google";
import { billingFor, billingReadiness } from "./billing";
import { emailSetupFor } from "./email";

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
async function teamCounts(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<{ members: number; invitesOpen: number }> {
  const [members, invites] = await Promise.all([
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("accepted_at", null)
      .is("revoked_at", null),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (invites.error) throw new Error(invites.error.message);
  return { members: members.count ?? 0, invitesOpen: invites.count ?? 0 };
}

/**
 * The newest ask of each thing a workspace has asked a person at Chanlytics
 * for, from setup.requested events that arrive newest first (00123).
 */
function requestsFrom(rows: ReadonlyArray<{ created_at: string; data: unknown }> | null): SetupDto["requests"] {
  const newest = (what: string) =>
    (rows ?? []).find((r) => (r.data as { what?: unknown } | null)?.what === what)?.created_at ?? null;
  return {
    line: newest("line"),
    port: newest("port"),
    repair: newest("repair"),
    forwarding: newest("forwarding"),
  };
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
  const [
    cfgRow,
    channels,
    lastMsg,
    lastCall,
    templates,
    calendar,
    team,
    yes,
    offersSaid,
    offersReach,
    requested,
    lineRows,
    lineStatus,
    listing,
    listingFacts,
    google,
    connection,
    billingRow,
    billingReady,
    activations,
    email,
  ] = await Promise.all([
    getTenantConfig(supabase, tenantId),
    supabase.from("tenant_channels").select("kind, status, number_e164, config, created_at").eq("tenant_id", tenantId),
    supabase
      .from("messages")
      .select("channel_ts, created_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .eq("channel", "whatsapp")
      .order("channel_ts", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("calls")
      .select("started_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("templates").select("name, meta_status, hidden_at").eq("tenant_id", tenantId),
    calendarWeek({ supabase }, tenantId, { from: null, days: 7 }, now, { canAct: false }).catch(() => null),
    viewer.kind === "member" ? teamRoster(supabase, tenantId) : teamCounts(supabase, tenantId),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("consent", "opted_in")
      .is("erased_at", null),
    // The OTHER answer, counted on its own column, twice: who gave it, and who of
    // them a promotional broadcast reaches. `dnc` is excluded here and not above
    // because a do-not-contact blocks a promotion outright, and a STOP sets it
    // (00095's set_contact_consent) -- so this is `saidYesTo(r, "marketing")` in
    // SQL, the predicate of the `contacts_marketing_audience` index (00095).
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("marketing_consent", "opted_in")
      .eq("dnc", false)
      .is("erased_at", null),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      // `mayReceive(r, "marketing")` in SQL, because this is a count and not a list:
      // the yes to offers, no do-not-contact, and a number to send to. The number was
      // missing, so this row counted people the broadcast route would not enrol --
      // and read alone, it called a yes with no number (someone who only emails, a
      // walk-in recorded without one) nobody's yes.
      .eq("marketing_consent", "opted_in")
      .eq("dnc", false)
      .is("erased_at", null)
      .not("phone_e164", "is", null),
    // What the owner has asked a person at Chanlytics for, newest first (00123: a line, a port, a repair). From the
    // events the ask records, not the bell: a bell row cannot say which thing was asked for, and the edge's own
    // "your phone line is ready" row shares its subject, so it read as a request.
    supabase
      .from("events")
      .select("created_at, data")
      .eq("tenant_id", tenantId)
      .eq("kind", "setup.requested")
      .order("created_at", { ascending: false })
      .limit(30),
    linesFor(supabase, tenantId),
    linesStatus(),
    listingFor(supabase, tenantId),
    // Google's facts, which no read above carries: the days the first run's Check asks about.
    listingFactsFor(supabase, tenantId),
    googleReadiness(),
    connectionFor(supabase, tenantId),
    billingFor(supabase, tenantId),
    billingReadiness(),
    // The owner's own act, per capability (00108).
    supabase
      .from("capability_activations")
      .select("capability, activated_at, activated_by, deactivated_at")
      .eq("tenant_id", tenantId),
    // Whether this deployment has email, and the workspace's mailbox when it has one. No query at all where it is off.
    emailSetupFor(supabase, tenantId),
  ]);
  if (channels.error) throw new Error(channels.error.message);
  if (lastMsg.error) throw new Error(lastMsg.error.message);
  if (lastCall.error) throw new Error(lastCall.error.message);
  if (templates.error) throw new Error(templates.error.message);
  if (yes.error) throw new Error(yes.error.message);
  // A count that could not be read is not a zero: read as one, the row says nobody has said yes.
  if (offersSaid.error) throw new Error(offersSaid.error.message);
  if (offersReach.error) throw new Error(offersReach.error.message);
  if (requested.error) throw new Error(requested.error.message);
  if (activations.error) throw new Error(activations.error.message);

  // The config, as the parser reads it — a broken row is its own fact.
  const parsed = cfgRow ? parseTenantConfigResult(cfgRow.config) : null;
  const cfg = parsed && parsed.ok ? parsed.config : null;
  const brain = cfg?.brain ?? null;
  const profile = brain?.profile ?? null;
  // Whether the receptionist is set up, by the one test the first receptionist's route asks too.
  const receptionist = receptionistOf(parsed);
  const business: SetupDto["business"] = {
    name: brain?.business_name ?? null,
    hours: !!profile?.hours && Object.keys(profile.hours).length > 0,
    services: profile?.services?.length ?? 0,
    bookingLink: !!brain?.booking_link,
    address: !!profile?.address,
    handoff: profile?.handoff_number ?? null,
    broken: receptionist === "broken",
    receptionist,
  };

  // `channelFor`, not a bare `.find`. The query has no status filter and no order,
  // and Postgres row order is unspecified -- so with two rows of one kind the pick
  // was arbitrary. A workspace gets two exactly by escaping a stuck line: `release`
  // switches the routing row off rather than deleting it (calls keep their history),
  // so a released-then-rebought number leaves a disabled voice row beside the active
  // one. Picking the disabled one made `voice.active` false, which made `answering`
  // false, which read "your line is switched off", removed `tryIt` and bounced the
  // owner back onto Setup -- all while the line was answering.
  //
  // Nine lines below, the same array goes to `resolveFacts`, whose `activeChannel`
  // has always done this correctly. This is that rule, shared.
  const byKind = (kind: string) => channelFor(channels.data ?? [], kind);
  const wa = byKind("whatsapp");
  const voice = byKind("voice");
  const waCfg = (wa?.config && typeof wa.config === "object" && !Array.isArray(wa.config) ? wa.config : {}) as Record<
    string,
    unknown
  >;

  const approved = (templates.data ?? []).filter((t) => t.meta_status === "approved" && !t.hidden_at);
  const pending = (templates.data ?? []).filter((t) => t.meta_status === "pending" && !t.hidden_at);

  // The same resolver the prompt and the Business pane use. Setup called the
  // facts row "ready" whenever the fields were filled in, on a workspace whose
  // receptionist was publishing the number it transfers to.
  const conflicts = factConflicts(
    resolveFacts(brain, {
      workspace: null,
      channels: channels.data ?? [],
      listing: listing ? { name: listing.name, address: listing.address } : null,
      // A kept number that forwards to the line is the number to publish, not a conflict.
      forwarding: knownForwarding(lineRows),
    }),
  );

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
    email,
    templates: {
      approved: approved.length,
      pending: pending.length,
      startersApproved: approved.filter((t) => starterByName(t.name) !== null).length,
    },
    calendar: { state: calendar?.feed.state ?? "none", problem: calendar?.feed.problem ?? null },
    team: {
      // Either shape answers the same two questions; the member path already
      // has the roster in hand, the back office never asks for it.
      members:
        "members" in team && Array.isArray(team.members) ? team.members.length : (team as { members: number }).members,
      invitesOpen: "invites" in team ? team.invites.length : (team as { invitesOpen: number }).invitesOpen,
      alertEmails: cfg?.notifications?.escalation_emails?.length ?? 0,
    },
    consent: { yes: yes.count ?? 0, offers: offersReach.count ?? 0, offersSaidYes: offersSaid.count ?? 0 },
    requests: requestsFrom(requested.data),
    lines: {
      rows: lineRows,
      ready: lineStatus.ready,
      provider: lineStatus.provider,
      costs: { local_number_month_usd: lineStatus.costs.local_number_month_usd },
    },
    google: {
      ready: google.places || google.profile,
      places: google.places,
      listing: listing
        ? {
            name: listing.name,
            rating: listing.rating,
            review_count: listing.review_count,
            checked_at: listing.checked_at,
            check_error: listing.check_error,
          }
        : null,
      connected: !!connection?.location_name,
      // A day the record states, closed included (`{}`), is answered: only the rest are asked about.
      unsure: listingFacts?.facts
        ? hoursFromGoogle(listingFacts.facts.hours).unsure.filter(
            (d) => !Object.prototype.hasOwnProperty.call(profile?.hours ?? {}, d),
          )
        : [],
      type: listingFacts?.facts?.primary_type ?? null,
      bookingPage: listingFacts?.facts?.booking_page ?? null,
      phone: listingFacts?.facts?.phone_e164 ?? null,
    },
    billing: billingRow
      ? {
          ready: billingReady.ready,
          livemode: billingReady.livemode,
          mode: billingRow.mode,
          status: billingRow.status,
          trial_end: billingRow.trial_end,
          current_period_end: billingRow.current_period_end,
          trial_days: billingReady.trial_days,
          cancel_at: billingRow.cancel_at,
          cancel_at_period_end: billingRow.cancel_at_period_end,
          price: billingReady.price,
        }
      : undefined,
    activations: (activations.data ?? []).map((a) => ({
      capability: a.capability as CapabilityKind,
      activated_at: a.activated_at,
      activated_by: a.activated_by,
      deactivated_at: a.deactivated_at,
    })),
  };
  return setup;
}
