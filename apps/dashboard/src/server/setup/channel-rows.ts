/** Setup: channel rows. */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import type { MailboxRow } from "@chanlytics/db/email";
import {
  countOffersReach,
  countOffersYes,
  countOpenInvites,
  countSaidYes,
  countTeamMembers,
  findLastWhatsAppIn,
  getTenantConfig,
  listCapabilityRows,
  listSetupAsks,
  listSetupChannels,
  listTemplateVerdicts,
  setupChoicesOf,
} from "@chanlytics/db/workspace";
import { listImports, listBusinessReads, getPeopleCount } from "@chanlytics/db/imports";
import { findMailboxOfTenant } from "@chanlytics/db/email";
import { findOffersEmailReach, listRunningStepsOn } from "@chanlytics/db/campaigns";
import { findRehearsalTally } from "@chanlytics/db/facts";
import { findConfigRow } from "../workspace/config-row";
import { emailOffersOpen, offerPauseOf, parseTenantConfig, type SetupDto, recordOrNull } from "@chanlytics/contracts";
import { getCalendarWeek } from "../calendar/week/week";
import { getTeamRoster } from "../workspace/team";
import { listLines, getLinesStatus } from "../connections/lines";
import { findListing, findListingFacts, findConnection, getGoogleReadiness } from "../connections/google";
import { findBilling, getBillingReadiness } from "../workspace/billing";
import { getEmailSetup } from "../connections/email";
import { getEmailWire } from "../connections/email-readiness";
import { getTenantFacts } from "../shared/tenant";
import { once } from "@/server/shared/lazy";
import { log } from "@/server/shared/log";
import { findLastConnectedCallIn } from "@chanlytics/db/voice";

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

/**
 * How many people answer in the workspace and how many invitations are open -- the only two numbers Setup uses. The
 * partner who brought it (0012) is on its team to set it up, not to answer: counted out, as the member's read counts
 * them out of the roster (teamSection), so support reads the number the owner does.
 */
async function teamCounts(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<{ members: number; invitesOpen: number }> {
  const [members, invites] = await Promise.all([
    countTeamMembers(supabase, tenantId),
    countOpenInvites(supabase, tenantId),
  ]);
  if (members.error) throw new Error(members.error.message);
  if (invites.error) throw new Error(invites.error.message);
  return { members: members.count ?? 0, invitesOpen: invites.count ?? 0 };
}

/**
 * The newest ask of each thing a workspace has asked a person at Chanlytics
 * for, from setup.requested events that arrive newest first (00123).
 */
export function requestsFrom(rows: ReadonlyArray<{ created_at: string; data: unknown }> | null): SetupDto["requests"] {
  const newest = (text: string) => (rows ?? []).find((r) => recordOrNull(r.data)?.what === text)?.created_at ?? null;
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
  return listSetupChannels(supabase, tenantId);
}

/** The newest WhatsApp message a customer sent. */
function lastWhatsAppIn(supabase: SupabaseClient<Database>, tenantId: string) {
  return findLastWhatsAppIn(supabase, tenantId);
}

/** The newest call that reached the receptionist. */
function lastInboundCall(supabase: SupabaseClient<Database>, tenantId: string) {
  // A dial that never connected reached nobody: it is no test of the receptionist.
  return findLastConnectedCallIn(supabase, tenantId);
}

/**
 * Each WhatsApp template by name, with what Meta said of it and whether it is hidden. An email or a text version of a
 * message (00296) is approved the moment it is written and is nobody's word but its author's, so it is no verdict of
 * Meta's: counted here, a starter still in review would read as approved by its other versions.
 */
function templateVerdicts(supabase: SupabaseClient<Database>, tenantId: string) {
  return listTemplateVerdicts(supabase, tenantId);
}

/** How many people said yes to messages about their own visit. */
function saidYesCount(supabase: SupabaseClient<Database>, tenantId: string) {
  return countSaidYes(supabase, tenantId);
}

/**
 * The OTHER answer, counted on its own column, twice: who gave it (here), and who of
 * them a promotional broadcast reaches (offersReachCount). `dnc` is excluded here and not
 * in saidYesCount because a do-not-contact blocks a promotion outright, and a STOP sets it
 * (00095's set_contact_consent) -- so this is `saidYesTo(r, "marketing")` in
 * SQL, the predicate of the `contacts_marketing_audience` index (00095).
 */
function offersSaidYesCount(supabase: SupabaseClient<Database>, tenantId: string) {
  return countOffersYes(supabase, tenantId);
}

/** Who of them a promotional broadcast reaches. */
function offersReachCount(supabase: SupabaseClient<Database>, tenantId: string) {
  // `mayReceive(r, "marketing")` in SQL, because this is a count and not a list:
  // the yes to offers, no do-not-contact, and a number to send to. The number was
  // missing, so this row counted people the broadcast route would not enrol --
  // and read alone, it called a yes with no number (someone who only emails, a
  // walk-in recorded without one) nobody's yes.
  return countOffersReach(supabase, tenantId);
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
    const wire = await getEmailWire();
    if (wire.ready !== true) return null;
    const [mailbox, cfgRow] = await Promise.all([mailboxRead(), settings]);
    const address = parseTenantConfig(cfgRow?.config ?? null)?.brain?.profile?.address?.trim();
    const paused = offerPauseOf(mailbox?.offers_paused_at, mailbox?.offers_paused_reason);
    if (!mailbox || !emailOffersOpen({ campaigns: wire.offers, address: !!address, paused }, "").ok) return null;
    return await findOffersEmailReach(supabase, tenantId);
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
  return listSetupAsks(supabase, tenantId, 30);
}

/**
 * Whether a day-before reminder already runs: a running step on the visit_tomorrow moment, the one question the routes
 * ask before refusing a second (playbook-row.ts findVisitTwinRefusal). Today's card stops offering one then. A read that
 * fails says nothing (null), and the card offers as it did: the route is still the door that refuses.
 */
function dayBeforeRunning(supabase: SupabaseClient<Database>, tenantId: string): Promise<boolean | null> {
  return listRunningStepsOn(supabase, tenantId, ["visit_tomorrow"]).then(
    (steps) => steps.length > 0,
    () => null,
  );
}

/** The owner's own act, per capability (00108). */
function activationRows(supabase: SupabaseClient<Database>, tenantId: string) {
  return listCapabilityRows(supabase, tenantId);
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
  return Promise.all([from.settings, getTenantFacts(supabase, tenantId)])
    .then(([row, { timezone }]) =>
      getCalendarWeek({ supabase }, tenantId, { from: null, days: 7 }, now, {
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
  // The settings, which the calendar's row and the offers' count are read from too: asked once, and handed to both. A
  // member's as the server holds them for a member (config-row.ts); the back office's, on the service role, from the table.
  const settings = viewer.kind === "member" ? findConfigRow(supabase, tenantId) : getTenantConfig(supabase, tenantId);
  // The workspace's mailbox, which the email line, the calendar's notices and the offers' count each want: asked once,
  // by whichever of them asks first, and by none where none does (email off, no booking tool named).
  const mailbox = once(() => findMailboxOfTenant(supabase, tenantId));
  return Promise.all([
    settings,
    channelRows(supabase, tenantId),
    lastWhatsAppIn(supabase, tenantId),
    lastInboundCall(supabase, tenantId),
    templateVerdicts(supabase, tenantId),
    calendarStands(supabase, tenantId, now, { settings, mailbox }),
    viewer.kind === "member" ? getTeamRoster(supabase, tenantId) : teamCounts(supabase, tenantId),
    saidYesCount(supabase, tenantId),
    offersSaidYesCount(supabase, tenantId),
    offersReachCount(supabase, tenantId),
    setupRequested(supabase, tenantId),
    listLines(supabase, tenantId),
    getLinesStatus(),
    findListing(supabase, tenantId),
    // Google's facts, which no read above carries: the days the first run's Check asks about.
    findListingFacts(supabase, tenantId),
    getGoogleReadiness(),
    findConnection(supabase, tenantId),
    findBilling(supabase, tenantId),
    getBillingReadiness(),
    activationRows(supabase, tenantId),
    // Whether this deployment has email, and the workspace's mailbox when it has one. No query at all where it is off.
    getEmailSetup(supabase, tenantId, mailbox),
    offersByEmailOf(supabase, tenantId, settings, mailbox),
    dayBeforeRunning(supabase, tenantId),
    // What the first run's five steps read beside the rows (decision 0073): the rehearsals, what was brought in, the
    // people. Each is its own fact: one that cannot be read is left out, never a zero, and never fails Setup.
    quietly(findRehearsalTally(supabase, tenantId)),
    quietly(listImports(supabase, tenantId)),
    quietly(getPeopleCount(supabase, tenantId)),
    // What the Business Profile and the website say, for Check to offer (decision 0073, R10, R17).
    quietly(listBusinessReads(supabase, tenantId)),
    // What the first run chose for the workspace (setup_choices, decision 0091): unread, the member's own view stands.
    quietly(setupChoicesOf(supabase, tenantId)),
  ]);
}

/** A read Setup can do without: its answer, or null where it failed (said in the log, never as a refusal). */
function quietly<T>(read: Promise<T>): Promise<T | null> {
  return read.catch((e: unknown) => {
    log.warn("setup_read_skipped", { error: e instanceof Error ? e.message : String(e) });
    return null;
  });
}

/**
 * Each answer by the name the sections read it by. A read that failed fails Setup: the first in askSetup's order
 * that did. The calendar's failure is not one -- a week that could not be read is its own fact (none).
 */
export async function setupReads(supabase: SupabaseClient<Database>, tenantId: string, viewer: SetupViewer, now: Date) {
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
    dayBefore,
    rehearsal,
    imports,
    people,
    reads,
    choices,
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
    dayBefore,
    rehearsal,
    imports,
    people,
    reads,
    choices,
  };
}
