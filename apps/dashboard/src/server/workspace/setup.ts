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
import type { Database, MailboxRow } from "@chanlytics/db";
import { getTenantConfig, mailboxOfTenant, offersEmailReach } from "@chanlytics/db";
import {
  emailOffersOpen,
  forwardStillAsked,
  offerPauseOf,
  parseTenantConfig,
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
import { calendarWeek } from "../calendar/calendar-week";
import { teamRoster } from "./team";
import { linesFor, linesStatus } from "../connections/lines";
import { listingFor, listingFactsFor, connectionFor, googleReadiness } from "../connections/google";
import { billingFor, billingReadiness } from "./billing";
import { emailSetupFor } from "../connections/email";
import { emailWire } from "../connections/email-readiness";
import { tenantFacts } from "../tenant";
import { once } from "@/server/lazy";
import { log } from "@/server/log";

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
type SetupViewer = { kind: "member" } | { kind: "back_office" };

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

/* ------------------------------------------------------------------ the reads, one per source */

/** The workspace's channels: every row of every kind and status, for `channelFor` to pick from (channelsSection). */
function channelRows(supabase: SupabaseClient<Database>, tenantId: string) {
  return supabase
    .from("tenant_channels")
    .select("kind, status, number_e164, config, created_at")
    .eq("tenant_id", tenantId);
}

/** The newest WhatsApp message a customer sent. */
function lastWhatsAppIn(supabase: SupabaseClient<Database>, tenantId: string) {
  return supabase
    .from("messages")
    .select("channel_ts, created_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .eq("channel", "whatsapp")
    .order("channel_ts", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
}

/** The newest call that reached the receptionist. */
function lastInboundCall(supabase: SupabaseClient<Database>, tenantId: string) {
  return (
    supabase
      .from("calls")
      .select("started_at")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      // A dial that never connected reached nobody: it is no test of the receptionist.
      .neq("status", "not_connected")
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
  );
}

/**
 * Each WhatsApp template by name, with what Meta said of it and whether it is hidden. An email or a text version of a
 * message (00296) is approved the moment it is written and is nobody's word but its author's, so it is no verdict of
 * Meta's: counted here, a starter still in review would read as approved by its other versions.
 */
function templateVerdicts(supabase: SupabaseClient<Database>, tenantId: string) {
  return supabase
    .from("templates")
    .select("name, meta_status, hidden_at")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp");
}

/** How many people said yes to messages about their own visit. */
function saidYesCount(supabase: SupabaseClient<Database>, tenantId: string) {
  return supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("consent", "opted_in")
    .is("erased_at", null);
}

/**
 * The OTHER answer, counted on its own column, twice: who gave it (here), and who of
 * them a promotional broadcast reaches (offersReachCount). `dnc` is excluded here and not
 * in saidYesCount because a do-not-contact blocks a promotion outright, and a STOP sets it
 * (00095's set_contact_consent) -- so this is `saidYesTo(r, "marketing")` in
 * SQL, the predicate of the `contacts_marketing_audience` index (00095).
 */
function offersSaidYesCount(supabase: SupabaseClient<Database>, tenantId: string) {
  return supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("marketing_consent", "opted_in")
    .eq("dnc", false)
    .is("erased_at", null);
}

/** Who of them a promotional broadcast reaches. */
function offersReachCount(supabase: SupabaseClient<Database>, tenantId: string) {
  return (
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
      .not("phone_e164", "is", null)
  );
}

/**
 * How many people an offer by email would reach (the database's offers_email_reach, the rule of contracts mayMessageFor in
 * SQL) -- counted only while this workspace can send one (contracts emailOffersOpen: the deployment's campaigns domain
 * verified, the business's address on file, a mailbox whose offers are not paused). Null otherwise, and where the count
 * could not be read or the database has none (00299): Setup then says nothing of offers by email, never a zero for it. A
 * read that fails is said in the log (`setup_offers_by_email_failed`), so a Setup that says nothing has a reason on record.
 *
 * Asked with Setup's first reads, of the settings and the mailbox they ask for themselves. It was asked after the last
 * of them had answered, and began by asking the edge whether the wire can send, an answer a deployment keeps a few
 * minutes and waits up to four seconds for: the whole of Setup stood behind that wait (9 Oct 2026).
 */
async function offersByEmailOf(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  settings: Promise<{ config: unknown } | null>,
  mailboxRead: () => Promise<MailboxRow | null>,
): Promise<number | null> {
  try {
    const wire = await emailWire();
    if (wire.ready !== true) return null;
    const [mailbox, cfgRow] = await Promise.all([mailboxRead(), settings]);
    const address = parseTenantConfig(cfgRow?.config ?? null)?.brain?.profile?.address?.trim();
    const paused = offerPauseOf(mailbox?.offers_paused_at, mailbox?.offers_paused_reason);
    if (!mailbox || !emailOffersOpen({ campaigns: wire.offers, address: !!address, paused }, "").ok) return null;
    return await offersEmailReach(supabase, tenantId);
  } catch (e) {
    log.error("setup_offers_by_email_failed", {
      tenant_id: tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * What the owner has asked a person at Chanlytics for, newest first (00123: a line, a port, a repair). From the
 * events the ask records, not the bell: a bell row cannot say which thing was asked for, and the edge's own
 * "your phone line is ready" row shares its subject, so it read as a request.
 */
function setupRequested(supabase: SupabaseClient<Database>, tenantId: string) {
  return supabase
    .from("events")
    .select("created_at, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "setup.requested")
    .order("created_at", { ascending: false })
    .limit(30);
}

/** The owner's own act, per capability (00108). */
function activationRows(supabase: SupabaseClient<Database>, tenantId: string) {
  return supabase
    .from("capability_activations")
    .select("capability, activated_at, activated_by, deactivated_at")
    .eq("tenant_id", tenantId);
}

/**
 * Where the calendar stands, for Setup's row: whether the feed reads, and no more (feedOnly: nothing of the record is
 * read for it, and nobody in People). From the settings Setup reads anyway, with the zone read beside them: the lookup
 * read the workspace's row and then the settings again, one behind the other, before it could ask for the feed (9 Oct
 * 2026). A week that could not be read is its own fact (null), never Setup's failure.
 */
function calendarStands(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  now: Date,
  from: { settings: Promise<{ config: unknown } | null>; mailbox: () => Promise<MailboxRow | null> },
) {
  return Promise.all([from.settings, tenantFacts(supabase, tenantId)])
    .then(([row, { timezone }]) =>
      calendarWeek({ supabase }, tenantId, { from: null, days: 7 }, now, {
        canAct: false,
        feedOnly: true,
        timezone,
        config: row?.config ?? null,
        mailbox: from.mailbox,
      }),
    )
    .catch(() => null);
}

/** Every source Setup reads, asked at once and in this order. */
function askSetup(supabase: SupabaseClient<Database>, tenantId: string, viewer: SetupViewer, now: Date) {
  // The settings, which the calendar's row and the offers' count are read from too: asked once, and handed to both.
  const settings = getTenantConfig(supabase, tenantId);
  // The workspace's mailbox, which the email line, the calendar's notices and the offers' count each want: asked once,
  // by whichever of them asks first, and by none where none does (email off, no booking tool named).
  const mailbox = once(() => mailboxOfTenant(supabase, tenantId));
  return Promise.all([
    settings,
    channelRows(supabase, tenantId),
    lastWhatsAppIn(supabase, tenantId),
    lastInboundCall(supabase, tenantId),
    templateVerdicts(supabase, tenantId),
    calendarStands(supabase, tenantId, now, { settings, mailbox }),
    viewer.kind === "member" ? teamRoster(supabase, tenantId) : teamCounts(supabase, tenantId),
    saidYesCount(supabase, tenantId),
    offersSaidYesCount(supabase, tenantId),
    offersReachCount(supabase, tenantId),
    setupRequested(supabase, tenantId),
    linesFor(supabase, tenantId),
    linesStatus(),
    listingFor(supabase, tenantId),
    // Google's facts, which no read above carries: the days the first run's Check asks about.
    listingFactsFor(supabase, tenantId),
    googleReadiness(),
    connectionFor(supabase, tenantId),
    billingFor(supabase, tenantId),
    billingReadiness(),
    activationRows(supabase, tenantId),
    // Whether this deployment has email, and the workspace's mailbox when it has one. No query at all where it is off.
    emailSetupFor(supabase, tenantId, mailbox),
    offersByEmailOf(supabase, tenantId, settings, mailbox),
  ]);
}

/**
 * Each answer by the name the sections read it by. A read that failed fails Setup: the first in askSetup's order
 * that did. The calendar's failure is not one -- a week that could not be read is its own fact (none).
 */
async function setupReads(supabase: SupabaseClient<Database>, tenantId: string, viewer: SetupViewer, now: Date) {
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
    offersByEmail,
  ] = await askSetup(supabase, tenantId, viewer, now);
  // A count that could not be read is not a zero: read as one, the row says nobody has said yes.
  for (const read of [channels, lastMsg, lastCall, templates, yes, offersSaid, offersReach, requested, activations])
    if (read.error) throw new Error(read.error.message);
  return {
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
    offersByEmail,
  };
}

type SetupReads = Awaited<ReturnType<typeof setupReads>>;

/* ------------------------------------------------------------------ the building, one builder per section */

/** The config, and the parts of it the sections read. */
function configOf(cfgRow: SetupReads["cfgRow"]) {
  // The config, as the parser reads it — a broken row is its own fact.
  const parsed = cfgRow ? parseTenantConfigResult(cfgRow.config) : null;
  const cfg = parsed && parsed.ok ? parsed.config : null;
  const brain = cfg?.brain ?? null;
  const profile = brain?.profile ?? null;
  return { parsed, cfg, brain, profile };
}

type SetupConfig = ReturnType<typeof configOf>;

function businessSection({ parsed, brain, profile }: SetupConfig): SetupDto["business"] {
  // Whether the receptionist is set up, by the one test the first receptionist's route asks too.
  const receptionist = receptionistOf(parsed);
  return {
    name: brain?.business_name ?? null,
    hours: !!profile?.hours && Object.keys(profile.hours).length > 0,
    services: profile?.services?.length ?? 0,
    bookingLink: !!brain?.booking_link,
    address: !!profile?.address,
    handoff: profile?.handoff_number ?? null,
    broken: receptionist === "broken",
    receptionist,
  };
}

/**
 * The same resolver the prompt and the Business pane use. Setup called the
 * facts row "ready" whenever the fields were filled in, on a workspace whose
 * receptionist was publishing the number it transfers to.
 */
function conflictsSection(brain: SetupConfig["brain"], { channels, listing, lineRows }: SetupReads) {
  return factConflicts(
    resolveFacts(brain, {
      workspace: null,
      channels: channels.data ?? [],
      listing: listing ? { name: listing.name, address: listing.address } : null,
      // A kept number that forwards to the line is the number to publish, not a conflict.
      forwarding: knownForwarding(lineRows),
    }),
  );
}

function channelsSection({ channels, lastMsg, lastCall }: SetupReads): SetupDto["channels"] {
  // `channelFor`, not a bare `.find`. The query has no status filter and no order,
  // and Postgres row order is unspecified -- so with two rows of one kind the pick
  // was arbitrary. A workspace gets two exactly by escaping a stuck line: `release`
  // switches the routing row off rather than deleting it (calls keep their history),
  // so a released-then-rebought number leaves a disabled voice row beside the active
  // one. Picking the disabled one made `voice.active` false, which made `answering`
  // false, which read "your line is switched off", removed `tryIt` and bounced the
  // owner back onto Setup -- all while the line was answering.
  //
  // The same array goes to `resolveFacts` (conflictsSection), whose `activeChannel`
  // has always done this correctly. This is that rule, shared.
  const byKind = (kind: string) => channelFor(channels.data ?? [], kind);
  const wa = byKind("whatsapp");
  const voice = byKind("voice");
  return { whatsapp: whatsappSection(wa, lastMsg), voice: voiceSection(voice, lastCall) };
}

/** A channel's row, as the workspace's channels are read. */
type ChannelRow = NonNullable<SetupReads["channels"]["data"]>[number];

function whatsappSection(wa: ChannelRow | null, lastMsg: SetupReads["lastMsg"]): SetupDto["channels"]["whatsapp"] {
  const waCfg = (wa?.config && typeof wa.config === "object" && !Array.isArray(wa.config) ? wa.config : {}) as Record<
    string,
    unknown
  >;
  return {
    present: !!wa,
    active: wa?.status === "active",
    number: wa?.number_e164 ?? null,
    quality: typeof waCfg.quality_rating === "string" ? waCfg.quality_rating : null,
    lastInboundAt: lastMsg.data?.channel_ts ?? lastMsg.data?.created_at ?? null,
  };
}

function voiceSection(voice: ChannelRow | null, lastCall: SetupReads["lastCall"]): SetupDto["channels"]["voice"] {
  return {
    present: !!voice,
    active: voice?.status === "active",
    number: voice?.number_e164 ?? null,
    lastInboundAt: lastCall.data?.started_at ?? null,
  };
}

function templatesSection(templates: SetupReads["templates"]): SetupDto["templates"] {
  const approved = (templates.data ?? []).filter((t) => t.meta_status === "approved" && !t.hidden_at);
  const pending = (templates.data ?? []).filter((t) => t.meta_status === "pending" && !t.hidden_at);
  return {
    approved: approved.length,
    pending: pending.length,
    startersApproved: approved.filter((t) => starterByName(t.name) !== null).length,
  };
}

/**
 * What the calendar is fed by, as the one rule reads it (contracts calendar-source.ts): the link's read, the booking
 * tool named and where its emails stand, and the owner's word that they book by hand. The row read the link alone.
 */
function calendarSection(calendar: SetupReads["calendar"], now: Date): SetupDto["calendar"] {
  const feed = calendar?.feed;
  const n = feed?.notices;
  return {
    state: feed?.state ?? "none",
    problem: feed?.problem ?? null,
    stale: !!feed?.stale,
    tool: n?.tool ?? null,
    by_hand: !!feed?.by_hand,
    emails: n?.tool
      ? {
          address: !!n.address,
          forwarding: forwardStillAsked(n.forwarding?.at, now),
          last_at: n.last_at,
          held: n.held,
        }
      : null,
    booking_link: !!calendar?.booking_link,
  };
}

function teamSection(team: SetupReads["team"], cfg: SetupConfig["cfg"]): SetupDto["team"] {
  return {
    // Either shape answers the same two questions; the member path already
    // has the roster in hand, the back office never asks for it.
    members:
      "members" in team && Array.isArray(team.members) ? team.members.length : (team as { members: number }).members,
    invitesOpen: "invites" in team ? team.invites.length : (team as { invitesOpen: number }).invitesOpen,
    alertEmails: cfg?.notifications?.escalation_emails?.length ?? 0,
    // The partner who sits on the team (0012), by the name the roster already carries: on the member's own
    // read only. The back office reads counts, never the roster, so its team stays three numbers.
    ...("members" in team && Array.isArray(team.members)
      ? {
          partner: (() => {
            const p = team.members.find((m) => m.role === "partner");
            return p ? p.displayName || p.email || null : null;
          })(),
        }
      : {}),
  };
}

function consentSection({ yes, offersReach, offersSaid, offersByEmail }: SetupReads): SetupDto["consent"] {
  return {
    yes: yes.count ?? 0,
    offers: offersReach.count ?? 0,
    offersSaidYes: offersSaid.count ?? 0,
    // The address arm, only where offers by email can go and the database counted it.
    ...(offersByEmail === null ? {} : { offers_by_email: offersByEmail }),
  };
}

function googleSection(
  { google, listing, connection, listingFacts }: SetupReads,
  profile: SetupConfig["profile"],
): SetupDto["google"] {
  return {
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
  };
}

function billingSection({ billingRow, billingReady }: SetupReads): SetupDto["billing"] {
  return billingRow
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
    : undefined;
}

function activationsSection(activations: SetupReads["activations"]): SetupDto["activations"] {
  return (activations.data ?? []).map((a) => ({
    capability: a.capability as CapabilityKind,
    activated_at: a.activated_at,
    activated_by: a.activated_by,
    deactivated_at: a.deactivated_at,
  }));
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
  const read = await setupReads(supabase, tenantId, viewer, now);
  const config = configOf(read.cfgRow);
  const { lineRows, lineStatus } = read;
  const setup: SetupDto = {
    business: businessSection(config),
    conflicts: conflictsSection(config.brain, read),
    channels: channelsSection(read),
    email: read.email,
    templates: templatesSection(read.templates),
    calendar: calendarSection(read.calendar, now),
    team: teamSection(read.team, config.cfg),
    consent: consentSection(read),
    requests: requestsFrom(read.requested.data),
    lines: {
      rows: lineRows,
      ready: lineStatus.ready,
      provider: lineStatus.provider,
      costs: { local_number_month_usd: lineStatus.costs.local_number_month_usd },
    },
    google: googleSection(read, config.profile),
    billing: billingSection(read),
    activations: activationsSection(read.activations),
  };
  return setup;
}
