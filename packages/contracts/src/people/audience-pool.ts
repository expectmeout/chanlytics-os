/**
 * The pool every list is judged over (decision 0009): everyone, with their appointments, as the People page, a send, a
 * playbook's run and the assistant read them.
 *
 * The two apps fetch differently -- the dashboard its cached feed, the edge its own -- but what they make of what they
 * fetched is decided here, once: which appointments are a person's, which of them is a consultation (0004), the row
 * each person is read as, and what the pool can give a list. The edge's runner had built its own: its visits were never
 * marked as consultations, so a playbook on a list that reads one ran on nobody the page counted.
 */
import type { ConsultRules } from "../calendar/service-offer";
import { feedWithRecord, type PoolRecord } from "../calendar/appointment-item";
import type { FeedItem } from "../calendar/feed";
import { indexFeed, visitsIn, type OwnAddresses, type PersonLike } from "../calendar/people/matching";
import { toVisitDto, type PersonVisitsDto, type VisitDto } from "../calendar/people/visits";
import type { ChannelsReady } from "../campaigns/broadcasts/reach-for";
import { followUpStandOf, type FollowUpFactsDto } from "../campaigns/playbooks/follow-ups";
import { isOptedOutContact } from "../consent/consent";
import type { DealPaceVM } from "../deals/waits";
import { isEmailStopped } from "../conversations/thread-contact";
import { isConsultationTitle } from "../deals/consultations";
import type { ListContext } from "./lists/lists";
import type { PersonRowDto } from "./person-dto";
import type { HolderNames } from "./person-receptionist";
import { igClockOfRow, replyChannelOfRow, type PersonRowVM } from "./person-row/row-facts";
import { toPersonRowVM } from "./person-row/row-vm";

/** A People row as the calendar matches it: a name a human gave, their number, their address. */
export function personLikeOf(
  person: Pick<PersonRowDto, "id" | "display_name" | "wa_profile_name" | "phone_e164"> &
    Partial<
      Pick<
        PersonRowDto,
        | "email"
        | "has_chat"
        | "latest_conversation_id"
        | "latest_wa_inbound_at"
        | "last_inbound_channel"
        | "last_wrote_at"
        | "message_channels"
        | "email_suppressed_at"
        | "consent"
        | "dnc"
        | "lead_id"
        | "lead_name"
        | "lead_gone"
        | "lead_emails"
      >
    >,
): PersonLike {
  return {
    id: person.id,
    name: person.display_name || person.wa_profile_name || "",
    phone: person.phone_e164,
    // Optional on the Pick the way personName takes it: a row read before 00125 carries no address, and no address is
    // no match, never a crash.
    email: person.email ?? null,
    thread: person.has_chat && person.latest_conversation_id ? person.latest_conversation_id : null,
    waInboundAt: person.latest_wa_inbound_at ?? null,
    igInboundAt: igClockOfRow({
      last_inbound_channel: person.last_inbound_channel ?? null,
      last_wrote_at: person.last_wrote_at ?? null,
    }),
    // What a reply to them is judged by, from the same row and the same functions the People row asks (person-row.ts), so the
    // board's block offers the booking link, or does not, as the row does. A row without the columns says no stop: absence is
    // no opt-out (consent.ts).
    reach: {
      wire: replyChannelOfRow({
        has_chat: person.has_chat ?? false,
        last_inbound_channel: person.last_inbound_channel ?? null,
        message_channels: person.message_channels,
      }),
      emailStopped: isEmailStopped({ email_suppressed_at: person.email_suppressed_at ?? null }),
      optedOut: isOptedOutContact({ consent: person.consent, dnc: person.dnc }),
    },
    // The business they work at, while it stands (0052): the calendar's fourth match.
    business: person.lead_id && !person.lead_gone && person.lead_name ? person.lead_name : null,
    // Its own addresses, on its own person alone (people_list, 00418): a booking from one is theirs, by their business.
    businessEmails:
      person.lead_id && !person.lead_gone && person.lead_emails
        ? person.lead_emails.map((e) => e.trim().toLowerCase()).filter((e) => e.length > 0)
        : [],
  };
}

/** What a workspace's calendar is, beside its feed: its zone and name, the business's own addresses, its services. */
export interface PoolCalendar {
  timezone: string;
  source: string;
  own: OwnAddresses;
  /** The profile's services and its consult-first rule: which of a person's visits is a consultation (0004). */
  services: readonly { name: string }[];
  rules: ConsultRules | null;
  /**
   * The record over the feed's season (decision 0002's readers): a booking's rows join the feed's events, a cancelled
   * visit leaves them, and a member's kept or missed rides on each. Null or absent: the feed alone, as before.
   */
  record?: PoolRecord | null;
}

/**
 * Everyone's next and last appointment from one parsed feed, indexed once -- the number first, the whole name second
 * -- so a list of hundreds costs one read of the calendar. Each visit says whether it is a consultation: its title says
 * so, or names a consult-first service.
 */
export function peopleVisitsOf(
  items: readonly FeedItem[],
  people: readonly Parameters<typeof personLikeOf>[0][],
  cal: PoolCalendar,
  nowMs: number,
): Map<string, PersonVisitsDto> {
  const index = indexFeed(feedWithRecord(items, cal.record, cal.own), cal.own);
  const mark = (v: VisitDto | null): VisitDto | null =>
    v ? { ...v, consultation: isConsultationTitle(v.title, cal.services, cal.rules) } : null;
  const out = new Map<string, PersonVisitsDto>();
  for (const item of people) {
    const visits = visitsIn(index, personLikeOf(item), nowMs);
    out.set(item.id, {
      timezone: cal.timezone,
      source: cal.source,
      state: "ok",
      next: mark(toVisitDto(visits.next)),
      last: mark(toVisitDto(visits.last)),
      near: visits.near.map((x) => mark(toVisitDto(x))).filter((x): x is VisitDto => x !== null),
      missed: mark(toVisitDto(visits.missed ?? null)),
    });
  }
  return out;
}

/**
 * Everyone with their appointments attached, the one way: a read calendar gives each person their visits (none found
 * is no visit), a calendar that could not be read says so on every row, and no calendar leaves the rows without one.
 * The People list, the Playbooks page's counts and the edge's run all attach them here, so a row read one place is the
 * row read every place.
 */
export function withVisitsOf<T extends PersonRowDto>(
  people: readonly T[],
  visits: ReadonlyMap<string, PersonVisitsDto>,
  cal: { state: "ok" | "unavailable" | "none"; timezone: string; source: string },
): (T & { visits: PersonVisitsDto | null })[] {
  const unread: PersonVisitsDto = {
    timezone: cal.timezone,
    source: cal.source,
    state: "unavailable",
    next: null,
    last: null,
  };
  return people.map((p) => ({
    ...p,
    visits: cal.state === "ok" ? (visits.get(p.id) ?? null) : cal.state === "unavailable" ? unread : null,
  }));
}

/** How a pool reads its people: at `now`, in the workspace's zone, for `viewer` (null: no one, a playbook's run). */
export interface PoolOptions {
  tz: string;
  now: Date;
  viewer: string | null;
  /**
   * What the workspace can send on now, channel by channel (the dashboard's channels-ready.ts, the edge's own read of the
   * same rows): each row's reach is judged against it (reach-any.ts). Required: no reader may leave it out and count
   * another workspace's. Null where it could not be read: counted as before the channels were, by WhatsApp.
   */
  ready: ChannelsReady | null;
  /** The roster, where the page has read it: a teammate's thread says whose it is (person-receptionist.ts heldThreadOf). */
  names?: HolderNames | null;
}

/**
 * The row one person is read as: the lists, the column, the row's second line, the thread's chip and Today's proposals
 * waiting all read it from here. Every workspace has deals (0008, amended 18 Oct 2026), so it carries theirs.
 */
export function poolRowOf(person: PersonRowDto, poolOptions: PoolOptions): PersonRowVM {
  return toPersonRowVM(
    person,
    poolOptions.tz,
    poolOptions.now,
    poolOptions.viewer,
    poolOptions.ready,
    poolOptions.names ?? null,
  );
}

/**
 * A row as People's page holds it (0006): the row poolRowOf reads, with where the proposal follow-up stands for them where one
 * runs (followUpStandOf), judged by the pace and at the moment the row is. People's page makes its rows so, and Today's first
 * read the people it names (today/people.ts), so the two say one follow-up of one person.
 */
export function peopleRowOf(
  person: PersonRowDto,
  poolOptions: PoolOptions & { followUp: FollowUpFactsDto | null; pace: DealPaceVM | null },
): PersonRowVM {
  const vm = poolRowOf(person, poolOptions);
  const fu = poolOptions.followUp;
  return fu
    ? {
        ...vm,
        followUp: followUpStandOf(
          vm,
          fu,
          poolOptions.tz,
          poolOptions.now.getTime(),
          poolOptions.pace,
          poolOptions.ready,
        ),
      }
    : vm;
}

/** Everyone's rows, as poolRowOf reads each. */
export function poolRowsOf(people: readonly PersonRowDto[], poolOptions: PoolOptions): PersonRowVM[] {
  return people.map((p) => poolRowOf(p, poolOptions));
}

/** Whether the profile names a consult-first service (0004): a list that reads consultations can be counted only then. */
export function consultFirstOf(rules: ConsultRules | null | undefined): boolean {
  return (rules?.consult_first ?? []).length > 0;
}

/** What a pool can give a list (lists.ts ListContext): its calendar, a deal on file, a consult-first service, and a viewer. */
export function poolListContext(options: {
  calendar: ListContext["calendar"];
  hasDeals: boolean;
  consultFirst: boolean;
  viewer: string | null;
}): ListContext {
  return {
    calendar: options.calendar,
    hasDeals: options.hasDeals,
    consultFirst: options.consultFirst,
    viewer: options.viewer !== null,
  };
}
