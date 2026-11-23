/** Setup: channel rows. */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db/types";
import type { MailboxRow } from "@chanlytics/db/email";
import { readSetupRows, type SetupRows } from "@chanlytics/db/workspace";
import { findOffersEmailReach } from "@chanlytics/db/campaigns";
import { findStoredConfig } from "../workspace/config-row";
import {
  billingAccountDto,
  emailOffersOpen,
  lineDtoOf,
  listingFactsOf,
  offerPauseOf,
  parseTenantConfig,
  type SetupDto,
  recordOrNull,
} from "@chanlytics/contracts";
import { getCalendarWeek } from "../calendar/week/week";
import { rosterOf } from "../workspace/team";
import { getLinesStatus } from "../connections/lines";
import { getGoogleReadiness } from "../connections/google";
import { getBillingReadiness } from "../workspace/billing";
import { getEmailSetup } from "../connections/email";
import { getEmailWire } from "../connections/email-readiness";
import { getTenantFacts } from "../shared/tenant";
import { log } from "@/server/shared/log";
import type { TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";

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

/**
 * How many people an offer by email would reach (the database's offers_email_reach, the rule of contracts mayMessageFor in
 * SQL) -- counted only while this workspace can send one (contracts emailOffersOpen: the deployment's campaigns domain
 * verified, the business's address on file, a mailbox whose offers are not paused). Null otherwise, and where the count
 * could not be read or the database has none (00299): Setup then says nothing of offers by email, never a zero for it. A
 * read that fails is said in the log (`setup_offers_by_email_failed`), so a Setup that says nothing has a reason on record.
 *
 * Asked with Setup's rows, of the settings and the mailbox they carry. It was asked after the last of Setup's reads had
 * answered, and began by asking the edge whether the wire can send, an answer a deployment keeps a few minutes and waits
 * up to four seconds for: the whole of Setup stood behind that wait (9 Oct 2026).
 */
async function offersByEmailOf(
  supabase: SupabaseClient<Database>,
  tenantId: TenantId,
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
 * Where the calendar stands, for Setup's row: whether the feed reads, and no more (feedOnly: nothing of the record is
 * read for it, and nobody in People). From the settings and the mailbox Setup's rows carry, and the workspace's zone. A
 * week that could not be read is its own fact (null), never Setup's failure.
 */
function calendarStands(
  supabase: SupabaseClient<Database>,
  tenantId: TenantId,
  now: Date,
  from: {
    settings: Promise<{ config: unknown } | null>;
    timezone: Promise<string>;
    mailbox: () => Promise<MailboxRow | null>;
  },
) {
  return Promise.all([from.settings, from.timezone])
    .then(([row, timezone]) =>
      getCalendarWeek({ supabase }, tenantId, { from: null, days: 7 }, now, {
        feedOnly: true,
        timezone,
        config: row?.config ?? null,
        mailbox: from.mailbox,
      }),
    )
    .catch(logAndGoOn("setup's calendar week", null));
}

/** The team as Setup reads it: the roster, or the back office's two counts. */
type SetupTeam =
  | { members: ReturnType<typeof rosterOf>; invites: SetupRows["invitations"] }
  | { members: number; invitesOpen: number };

/**
 * The member's view reads the roster; the back office, which has no session, its count. The partner who brought the
 * workspace (0012) is on its team to set it up, not to answer: counted out by both (teamSection, setup_rows).
 */
function teamOf(rows: SetupRows, member: boolean): SetupTeam {
  return member
    ? { members: rosterOf(rows.roster ?? []), invites: rows.invitations }
    : { members: rows.members ?? 0, invitesOpen: rows.invitations.length };
}

/**
 * Everything Setup reads, by the name its sections read it by, asked at once. The workspace's rows come in one call
 * (setup_rows, 00700: 24 calls until 23 Nov 2026, each read as the caller still is). Beside them, what is not a row of
 * the workspace's: what this deployment can do (lines, Google, billing, the email wire: the edge's to say, an answer a
 * deployment keeps a few minutes and waits up to four seconds for, so never asked behind the rows), the email's
 * mailboxes, and, once the rows are in, the settings as the server holds them where the session's were masked, the
 * calendar's feed and the offers by email. A failed read of the rows fails Setup.
 */
export async function setupReads(
  supabase: SupabaseClient<Database>,
  tenantId: TenantId,
  viewer: SetupViewer,
  now: Date,
) {
  const member = viewer.kind === "member";
  const rowsRead = readSetupRows(supabase, tenantId, member);
  // The settings as the server holds them (config-row.ts): a member's row the session read masked is read whole.
  const settings = rowsRead.then((r) => findStoredConfig(r.config, tenantId));
  const mailbox = () => rowsRead.then((r) => r.mailbox);
  const [rows, cfgRow, calendar, email, offersByEmail, lineStatus, google, billingReady] = await Promise.all([
    rowsRead,
    settings,
    calendarStands(supabase, tenantId, now, {
      settings,
      timezone: getTenantFacts(supabase, tenantId).then((facts) => facts.timezone),
      mailbox,
    }),
    getEmailSetup(supabase, tenantId, mailbox),
    offersByEmailOf(supabase, tenantId, settings, mailbox),
    getLinesStatus(),
    getGoogleReadiness(),
    getBillingReadiness(),
  ]);
  const facts = rows.listing_facts;
  return {
    cfgRow,
    channels: rows.channels,
    lastMsg: rows.last_whatsapp,
    lastCall: rows.last_call,
    templates: rows.templates,
    calendar,
    team: teamOf(rows, member),
    yes: rows.people.said_yes,
    offersSaid: rows.people.offers_yes,
    offersReach: rows.people.offers_reach,
    requested: rows.asks,
    lineRows: rows.lines.map((r) => lineDtoOf(r)),
    lineStatus,
    listing: rows.listing,
    listingFacts: facts ? { name: facts.name, address: facts.address, facts: listingFactsOf(facts.facts) } : null,
    google,
    connection: rows.google,
    billingRow: rows.billing ? billingAccountDto(rows.billing) : null,
    billingReady,
    activations: rows.activations,
    email,
    offersByEmail,
    dayBefore: rows.day_before,
    rehearsal: rows.rehearsals,
    imports: rows.imports,
    people: rows.people.all,
    reads: rows.business_reads,
    choices: rows.choices,
  };
}
