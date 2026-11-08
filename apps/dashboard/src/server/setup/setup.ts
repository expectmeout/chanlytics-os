/** Setup: setup. */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import { requestSetup, setSetupChoices } from "@chanlytics/db/workspace";
import {
  forwardStillAsked,
  parseTenantConfigResult,
  configReceptionistOf,
  starterByName,
  resolveFacts,
  factConflicts,
  knownForwarding,
  channelFor,
  hoursFromGoogle,
  memberWords,
  AppError,
  callsNotByPhone,
  setupPhoneWantOf,
  WORKSPACE_MARKS,
  type SetupWorkspaceChoicesDto,
  type SetupDto,
  IMPORT_SOURCES,
  BUSINESS_READ_SOURCES,
  businessReadFactsOf,
  IMPORT_STATES,
  isOneOf,
} from "@chanlytics/contracts";
import { dbRefusal } from "@/server/shared/with-route";
import { requestsFrom, setupReads, type SetupViewer } from "./channel-rows";
import type { TenantId } from "@chanlytics/contracts";

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
  const receptionist = configReceptionistOf(parsed);
  return {
    name: brain?.business_name ?? null,
    hours: !!profile?.hours && Object.keys(profile.hours).length > 0,
    services: profile?.services?.length ?? 0,
    bookingLink: !!brain?.booking_link,
    address: !!profile?.address,
    handoff: profile?.handoff_number ?? null,
    phone_greeting: profile?.phone_greeting ?? null,
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
  const notices = feed?.notices;
  return {
    state: feed?.state ?? "none",
    problem: feed?.problem ?? null,
    stale: !!feed?.stale,
    tool: notices?.tool ?? null,
    by_hand: !!feed?.by_hand,
    emails: notices?.tool
      ? {
          address: !!notices.address,
          forwarding: forwardStillAsked(notices.forwarding?.at, now),
          last_at: notices.last_at,
          held: notices.held,
        }
      : null,
    booking_link: !!calendar?.booking_link,
    granted: !!feed?.granted,
    source: feed?.source ?? null,
  };
}

function teamSection(team: SetupReads["team"], cfg: SetupConfig["cfg"]): SetupDto["team"] {
  return {
    // Either shape answers the same two questions; the member path already
    // has the roster in hand, the back office never asks for it. Who answers:
    // the partner who brought the workspace is named below, never counted as
    // someone who backs the owner up (teamCounts counts them out too).
    members:
      "members" in team && Array.isArray(team.members)
        ? team.members.filter((m) => m.role !== "partner").length
        : (team as { members: number }).members,
    invitesOpen: "invites" in team ? team.invites.length : team.invitesOpen,
    alertEmails: cfg?.notifications?.escalation_emails?.length ?? 0,
    // The partner who sits on the team (0012), by the name the roster already carries: on the member's own
    // read only. The back office reads counts, never the roster, so its team stays three numbers.
    ...("members" in team && Array.isArray(team.members)
      ? {
          partner: (() => {
            const p = team.members.find((m) => m.role === "partner");
            return p ? memberWords({ email: p.email, display_name: p.displayName }).name : null;
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
    profile: google.profile,
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
    // The connection's own state, so Setup says a sync that failed as Connections does (R11 S11-4).
    connection: connection
      ? {
          google_email: connection.google_email,
          location_name: connection.location_name,
          last_synced_at: connection.last_synced_at,
          sync_error: connection.sync_error,
        }
      : null,
    // A day the record states, closed included (`{}`), is answered: only the rest are asked about.
    unsure: listingFacts?.facts
      ? hoursFromGoogle(listingFacts.facts.hours).unsure.filter(
          (d) => !Object.prototype.hasOwnProperty.call(profile?.hours ?? {}, d),
        )
      : [],
    type: listingFacts?.facts?.primary_type ?? null,
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

/** The ledger's rows, as contracts' closed sets read them: a source or state the page does not know is left out. */
function importsSection(rows: NonNullable<SetupReads["imports"]>): NonNullable<SetupDto["imports"]> {
  return rows.flatMap((r) =>
    isOneOf(IMPORT_SOURCES, r.source) && isOneOf(IMPORT_STATES, r.state)
      ? [{ ...r, source: r.source, state: r.state }]
      : [],
  );
}

/** What the profile and the website said, each read for what it is (contracts businessReadFactsOf). */
function readsSection(rows: NonNullable<SetupReads["reads"]>): NonNullable<SetupDto["reads"]> {
  return rows.flatMap((row) =>
    isOneOf(BUSINESS_READ_SOURCES, row.source)
      ? [
          {
            source: row.source,
            facts: businessReadFactsOf(row.facts),
            read_from: row.read_from,
            read_at: row.read_at,
            error: row.error,
          },
        ]
      : [],
  );
}

function activationsSection(activations: SetupReads["activations"]): SetupDto["activations"] {
  return (activations.data ?? []).map((a) => ({
    capability: a.capability,
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
  tenantId: TenantId,
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
    // Said only where it was read: unread, the card offers the reminder as a read from before the field does.
    ...(read.dayBefore === null ? {} : { reminders: { day_before: read.dayBefore } }),
    ...(read.rehearsal ? { rehearsal: read.rehearsal } : {}),
    ...(read.imports ? { imports: importsSection(read.imports) } : {}),
    ...(read.people === null ? {} : { people: read.people }),
    ...(read.reads ? { reads: readsSection(read.reads) } : {}),
    ...(read.choices ? { workspace_choices: read.choices } : {}),
  };
  return setup;
}

/**
 * PUT setup/choices (decision 0091): what the first run chose for the workspace, kept on the workspace through its door
 * (setup_choice_set, 00513), the version compared when the tab names one. The number is checked by contracts' own
 * reading (setupPhoneWantOf), so a shape the page could not read back is refused rather than kept.
 */
export async function saveSetupChoices(
  ctx: { supabase: SupabaseClient<Database> },
  tenantId: TenantId,
  input: { phone?: unknown; whatsapp?: string; marks?: string[]; version?: number },
): Promise<{ choices: SetupWorkspaceChoicesDto }> {
  // Not by phone (decision 0091) is kept as the number's choice is, so one key says how calls reach the business.
  const noCalls = callsNotByPhone({ phone: input.phone });
  const phone = noCalls
    ? { way: "none" }
    : input.phone === undefined || input.phone === null
      ? null
      : setupPhoneWantOf({ phone: input.phone });
  if (input.phone && !phone) throw new AppError("validation", "That number cannot be kept: choose it again.");
  const marks = (input.marks ?? []).filter((m) => isOneOf(WORKSPACE_MARKS, m));
  const { data, error } = await setSetupChoices(ctx.supabase, {
    p_tenant_id: tenantId,
    ...(phone ? { p_phone: { ...phone } } : {}),
    ...(input.phone === null ? { p_clear_phone: true } : {}),
    ...(input.whatsapp ? { p_whatsapp: input.whatsapp } : {}),
    ...(marks.length ? { p_marks: marks } : {}),
    ...(input.version === undefined ? {} : { p_version: input.version }),
  });
  if (error) throw dbRefusal(error, { code: "forbidden", status: 403 });
  const row = (data ?? {}) as {
    error?: string;
    phone?: unknown;
    whatsapp?: string | null;
    marks?: string[];
    version?: number;
  };
  if (row.error === "stale")
    throw new AppError("conflict", "Another tab changed what was chosen. Look again, then choose.", 409);
  return {
    choices: {
      phone: row.phone ?? null,
      whatsapp: row.whatsapp ?? null,
      marks: row.marks ?? [],
      version: row.version ?? 0,
    },
  };
}

/** Help with one part of the setup, asked for on the member's session (packages/db workspace/setup.ts), answered as it came. */
export const requestWorkspaceSetup = (
  ctx: { supabase: SupabaseClient<Database> },
  args: Parameters<typeof requestSetup>[1],
) => requestSetup(ctx.supabase, args);
