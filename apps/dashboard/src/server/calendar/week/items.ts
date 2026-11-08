/** Week: items. */

import "server-only";
import {
  appointmentKeyOf,
  dayInZone,
  eventText,
  extractContacts,
  feedProblemWords,
  guessName,
  isDayKey,
  isConsultationTitle,
  consultServiceOf,
  matchPerson,
  mondayOf,
  shiftKey,
  windowFor,
  zoneMidnight,
  type BookingRules,
  type BusinessProfile,
  type CalendarDayDto,
  type CalendarItemDto,
  type VisitOriginDto,
  type CalendarWeekDto,
  type FeedItem,
  type PersonLike,
  type ConsultRules,
  type ParsedFeed,
  personLikeOf,
  type OwnAddresses,
  isNoticeHold,
  suggestLocalPart,
  type AppointmentLike,
  type BusyBlock,
  type CalendarFeedDto,
  type CalendarNoticesDto,
  type PersonRowDto,
  markOn,
  type FeedMark,
  feedMarksOf,
} from "@chanlytics/contracts";
import { findAppointmentNotices, listHeldNotices, findVisitsOver, type AppointmentRow } from "@chanlytics/db/calendar";
import { findMailboxOfTenant, type MailboxRow } from "@chanlytics/db/email";
import { hostedAddress } from "@chanlytics/channels/email";
import type { RouteContext } from "@/server/shared/with-route";
import { emailDomain } from "../../connections/email";
import type { ParsedRead } from "../parsed-feed";
import { log } from "@/server/shared/log";
import type { TenantId } from "@chanlytics/contracts";

/**
 * The calendar as the receptionist reads it, for one span of days.
 *
 * The feed is fetched server-side (its address never reaches the browser)
 * with the same short cache the assistant's openings use; the taken blocks,
 * the hours, the closures and the booking rules go through the same pure
 * functions the phone tool computes with, so the windows this page draws are
 * the windows a caller is offered. Titles are the owner's own calendar
 * words; a title that carries a person's name links to their profile.
 */
/** Nine weeks: the window a page loads around the day it looks at. */
const MAX_DAYS = 63;

/**
 * The most items one day carries to the browser. A board draws a day in a
 * column; a hundred blocks in it is already unreadable, and a feed that
 * names a thousand is a shared calendar, not a salon's. The rest are counted
 * and said, never silently dropped.
 */
export const MAX_ITEMS_PER_DAY = 100;

/**
 * The span a read covers. A day named is where it starts. With none, `around` says the board's own window (contracts
 * windowFor: the weeks around the business's today, which the page used to work out from the zone before it could ask,
 * so its first read waited for who is looking and could not be started from the document's head); else today's week.
 */
export function spanFor(
  from: string | null,
  days: number,
  tz: string,
  now: Date,
  around: "today" | null = null,
): { from: string; days: number } {
  const todayKey = dayInZone(tz, now.getTime()).key;
  if (!isDayKey(from) && around === "today") return windowFor(todayKey);
  const start = isDayKey(from) ? from : mondayOf(todayKey);
  return { from: start, days: Math.min(MAX_DAYS, Math.max(1, Math.round(days) || 7)) };
}

/** People as the matcher wants them: a human-given name (never a phone made words), the E.164, the address (00125), and the thread a link is texted into when they have one. */
/** A People row as the calendar matches it: contracts' one rule (audience-pool.ts personLikeOf). */
export const personLike = personLikeOf;

/**
 * The feed's items by day, as the board draws them: who each is for, what it carried, and whether it is a consultation
 * (0008), by the one rule People's visits are marked by (withVisits): its title says so, or names a service the
 * workspace's rules say needs a consultation first. `consult` is the profile's services and those rules.
 */
export function itemsToDays(
  items: FeedItem[],
  from: string,
  days: number,
  tz: string,
  people: PersonLike[],
  own: OwnAddresses,
  services: string[],
  consult: {
    services: readonly { name: string }[];
    rules: ConsultRules | null;
    /** The record's row for each event the sync keeps, by its key and start (markOn): what a member's word is said on. */
    marks?: ReadonlyMap<string, FeedMark>;
  },
): { days: Array<Pick<CalendarDayDto, "key" | "items">>; dropped: number } {
  const out: Array<Pick<CalendarDayDto, "key" | "items">> = [];
  let dropped = 0;
  for (let index = 0; index < days; index++) {
    const key = shiftKey(from, index);
    const dayStart = zoneMidnight(tz, key);
    const dayEnd = zoneMidnight(tz, shiftKey(key, 1));
    const inDay = items.filter((it) => it.end > dayStart && it.start < dayEnd);
    if (inDay.length > MAX_ITEMS_PER_DAY) dropped += inDay.length - MAX_ITEMS_PER_DAY;
    // A block's id is its appointment's key (appointmentKeyOf: the UID, with the occurrence for one of a series), so it
    // is the same block on every read: an index said only for a true twin. It carried the event's place in the day's list,
    // so an event added before it on the five-minute read moved every id after it, and closed the sheet open on it.
    const seen = new Map<string, number>();
    const rows: CalendarItemDto[] = inDay.slice(0, MAX_ITEMS_PER_DAY).map((it) => {
      const found = extractContacts(it, own);
      const key = appointmentKeyOf(it);
      const twin = seen.get(key) ?? 0;
      seen.set(key, twin + 1);
      return {
        id: twin ? `${key}#${twin}` : key,
        start: new Date(it.start).toISOString(),
        end: new Date(it.end).toISOString(),
        title: it.title,
        all_day: it.allDay,
        person: matchPerson(it, people, own),
        description: eventText(it.description),
        location: it.location,
        contacts: { phones: found.phones, emails: found.emails },
        guess: guessName(it, services),
        ...(it.occurrence !== undefined ? { series: true } : {}),
        consultation: isConsultationTitle(it.title, consult.services, consult.rules),
        consult_service: consultServiceOf(it.title, consult.services, consult.rules),
        visit: markOn(consult.marks, it),
      };
    });
    out.push({ key, items: rows });
  }
  return { days: out, dropped };
}

/**
 * What the board's week is read from, for one span: the workspace's zone and the span by its clock, its settings, the
 * feed parsed once, the profile's services and everyone in People as the matcher wants them. `week` is the answer
 * already whole -- no calendar, or one that could not be read -- and null when the feed was read, which is then
 * `parsed`; the services' names and People are read only then, and are empty beside a whole week. It carries neither
 * the feed's address nor the raw settings -- only the calendar's name and the business's own addresses, taken from
 * them in calendarSources -- and it is still never an answer: only what weekFrom assembles from it is.
 */
export type CalendarSources = {
  timezone: string;
  span: { from: string; days: number };
  /** The calendar's name ("Google Calendar", "your calendar"), as the board says it: never its address. */
  source: string;
  /** The business's own addresses (never anybody's visit), as the board matches around them. */
  ownAddresses: OwnAddresses;
  profile: BusinessProfile | null;
  rules: BookingRules | null;
  base: CalendarWeekDto;
  serviceNames: string[];
  people: PersonLike[];
  /**
   * The People rows the matcher's `people` were made of, by id: what the board says of each person a visit names
   * (calendar-person-facts.ts), so the page reads no People of its own. Empty where nobody was read.
   */
  book: ReadonlyMap<string, PersonRowDto>;
  /**
   * Who of `book` comes in today or tomorrow for the first visit the record holds of theirs (people-visits.ts
   * getBoardVisits): Today's day says "First visit" of them. Empty where nobody was read, or the record could not say.
   */
  firsts: ReadonlySet<string>;
  /**
   * The appointments the record holds over the span (00345): the bookings that arrived by email, drawn beside the
   * feed's events (docs/plans/2026-10-07-bookings-arrive-by-email.md). Empty for a workspace none have reached.
   */
  rows: AppointmentLike[];
  /** The record's row for each feed event the hourly sync keeps, by its key, with how it stands (feedMarksOf). */
  marks: ReadonlyMap<string, FeedMark>;
  /**
   * Where each visit's person came from, by the record row's id (00426: the lead they were found as, and its sequence).
   * Read only for the rows that name a lead; none for the rest, and none where the read failed.
   */
  origins?: ReadonlyMap<string, VisitOriginDto>;
  /**
   * The record's taken time over the days the receptionist may offer, read beside a feed that reads (record-busy.ts):
   * what the open times subtract with the feed's own, whichever span the page shows. Empty with no readable feed,
   * where no time is offered.
   */
  taken: BusyBlock[];
  /** The feed's read, null with no address; its parse, null when it could not be read. */
  feed: ParsedRead | null;
  parsed: ParsedFeed | null;
};

/** The feed's state for a calendar that was fetched and could not be read: the reason the board says. */
export function unreadFeed(base: CalendarFeedDto, feed: ParsedRead): CalendarFeedDto {
  return {
    ...base,
    checked_at: feed.checkedAt === null ? null : new Date(feed.checkedAt).toISOString(),
    reason: feed.reason,
    status: feed.status,
    problem: feedProblemWords(feed.reason, feed.status),
  };
}

/**
 * The record's rows over the span and the notices' health line, read beside the feed: the bookings that arrived by
 * email (00345, docs/plans/2026-10-07-bookings-arrive-by-email.md). Asked for in one order (ask/readers.test.mjs pins
 * it) and waited for together: none needs another's answer, and one after the other they were four round trips the
 * board stood behind (9 Oct 2026). A failed read is an empty board side and a logged line, never a board that fails to
 * draw the feed.
 */
export async function recordOverSpan(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  tz: string,
  from: string,
  to: string,
  by: { tool: string | null; name: string | null },
): Promise<{
  rows: AppointmentLike[];
  marks: Map<string, FeedMark>;
  leads: Map<string, string>;
  notices: Omit<CalendarNoticesDto, "count">;
}> {
  const spanFrom = new Date(zoneMidnight(tz, from)).toISOString();
  const spanTo = new Date(zoneMidnight(tz, shiftKey(to, 1))).toISOString();
  const failed = (e: unknown) =>
    log.error("calendar_notices_read_failed", {
      tenant_id: tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
  const [record, notices] = await Promise.all([
    findVisitsOver(ctx.supabase, tenantId, spanFrom, spanTo).catch((e): { noted: AppointmentRow[]; feed: [] } => {
      failed(e);
      return { noted: [], feed: [] };
    }),
    noticesHealth(ctx, tenantId, by, true),
  ]);
  // A booking's rows however they stand: drawn (a cancelled one struck), and each one's copy in the feed left out
  // (withoutVisitsRowsDraw), cancelled or not. The feed's own rows by key, for what a member says on them.
  // The lead each row's person was found as (00426), a booking's and a feed event's alike, by the row's id.
  const leads = new Map<string, string>();
  for (const r of [...record.noted, ...record.feed]) if (r.lead_id) leads.set(r.id, r.lead_id);
  return { rows: record.noted, marks: feedMarksOf(record.feed), leads, notices };
}

/**
 * The notices' health line alone: the tool, the address its emails go to, the latest that became a visit, how many are
 * held, and Gmail's pending confirmation. With `listed`, the held ones as the card lists them; without, their count
 * only, which is all Setup's and Connections' row says (the whole of what a feed-only read asks of the record).
 * `mailboxRead`: how to ask for the workspace's mailbox, from a caller that reads it for more than this (Setup).
 */
export async function noticesHealth(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  by: { tool: string | null; name: string | null },
  listed: boolean,
  mailboxRead: () => Promise<MailboxRow | null> = () => findMailboxOfTenant(ctx.supabase, tenantId),
): Promise<Omit<CalendarNoticesDto, "count">> {
  const { tool } = by;
  // The latest and the held count beside the workspace's address, as the tool is to send to, with Gmail's pending
  // confirmation of a forward here (00345): two reads that wait for nothing of each other's.
  const [latest, mailbox] = await Promise.all([
    findAppointmentNotices(ctx.supabase, tenantId).catch(() => ({ tool: null, last_at: null, held: 0 })),
    mailboxRead().catch(() => null),
  ]);
  // The held ones themselves only where the count says there are any.
  const held = listed && latest.held ? await listHeldNotices(ctx.supabase, tenantId).catch(() => []) : [];
  const domain = emailDomain();
  const local = suggestLocalPart(by.name);
  const notices: Omit<CalendarNoticesDto, "count"> = {
    tool: tool ?? latest.tool,
    address: mailbox && domain ? hostedAddress(mailbox.local_part, domain) : null,
    // Where it has none: the one its name would give, which the fold offers in one press (mailbox.ts suggestLocalPart).
    suggested: !mailbox && domain && local ? hostedAddress(local, domain) : null,
    last_at: latest.last_at,
    held: latest.held,
    held_list: held.flatMap((count) =>
      isNoticeHold(count.hold_reason)
        ? [
            {
              id: count.id,
              notice_id: count.notice_id,
              tool: count.tool,
              from: count.from_address,
              subject: count.subject,
              received_at: count.received_at,
              reason: count.hold_reason,
            },
          ]
        : [],
    ),
    forwarding:
      mailbox?.forward_confirm_code && mailbox.forward_confirm_account && mailbox.forward_confirm_at
        ? {
            account: mailbox.forward_confirm_account,
            code: mailbox.forward_confirm_code,
            link: mailbox.forward_confirm_link,
            at: mailbox.forward_confirm_at,
          }
        : null,
  };
  return notices;
}
