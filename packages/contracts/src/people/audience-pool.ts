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
import {
  indexFeed,
  toVisitDto,
  visitsIn,
  type OwnAddresses,
  type PersonLike,
  type PersonVisitsDto,
  type VisitDto,
} from "../calendar/calendar-people";
import type { ChannelsReady } from "../broadcasts/reach-for";
import { isOptedOutContact } from "../consent/consent";
import { isEmailStopped } from "../conversations/thread-contact";
import { isConsultationTitle } from "../deals/deal-consultations";
import type { ListContext } from "./lists/lists";
import type { PersonRowDto } from "./person-dto";
import type { HolderNames } from "./person-receptionist";
import { replyChannelOfRow, toPersonRowVM, type PersonRowVM } from "./person-row";

/** A People row as the calendar matches it: a name a human gave, their number, their address. */
export function personLikeOf(
  p: Pick<PersonRowDto, "id" | "display_name" | "wa_profile_name" | "phone_e164"> &
    Partial<
      Pick<
        PersonRowDto,
        | "email"
        | "has_chat"
        | "latest_conversation_id"
        | "latest_wa_inbound_at"
        | "last_inbound_channel"
        | "message_channels"
        | "email_suppressed_at"
        | "consent"
        | "dnc"
      >
    >,
): PersonLike {
  return {
    id: p.id,
    name: p.display_name || p.wa_profile_name || "",
    phone: p.phone_e164,
    // Optional on the Pick the way personName takes it: a row read before 00125 carries no address, and no address is
    // no match, never a crash.
    email: p.email ?? null,
    thread: p.has_chat && p.latest_conversation_id ? p.latest_conversation_id : null,
    waInboundAt: p.latest_wa_inbound_at ?? null,
    // What a reply to them is judged by, from the same row and the same functions the People row asks (person-row.ts), so the
    // board's block offers the booking link, or does not, as the row does. A row without the columns says no stop: absence is
    // no opt-out (consent.ts).
    reach: {
      wire: replyChannelOfRow({
        has_chat: p.has_chat ?? false,
        last_inbound_channel: p.last_inbound_channel ?? null,
        message_channels: p.message_channels,
      }),
      emailStopped: isEmailStopped({ email_suppressed_at: p.email_suppressed_at ?? null }),
      optedOut: isOptedOutContact({ consent: p.consent, dnc: p.dnc }),
    },
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
  for (const p of people) {
    const v = visitsIn(index, personLikeOf(p), nowMs);
    out.set(p.id, {
      timezone: cal.timezone,
      source: cal.source,
      state: "ok",
      next: mark(toVisitDto(v.next)),
      last: mark(toVisitDto(v.last)),
      near: v.near.map((x) => mark(toVisitDto(x))).filter((x): x is VisitDto => x !== null),
      missed: mark(toVisitDto(v.missed ?? null)),
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
  /** Deals are on here (dealsAreOn, 0008): where they are off, no row carries a deal, whatever the database holds. */
  dealsOn: boolean;
  /**
   * What the workspace can send on now, channel by channel (the dashboard's channels-ready.ts, the edge's own read of the
   * same rows): each row's reach is judged against it (reach-any.ts). Required, as `dealsOn` is: no reader may leave it
   * out and count another workspace's. Null where it could not be read: counted as before the channels were, by WhatsApp.
   */
  ready: ChannelsReady | null;
  /** The roster, where the page has read it: a teammate's thread says whose it is (person-receptionist.ts heldThreadOf). */
  names?: HolderNames | null;
}

/**
 * The row one person is read as. Where deals are off it carries no deal and no deal stage: not the lists, the column,
 * the row's second line, the thread's chip, or Today's proposals waiting, which all read it from here.
 */
export function poolRowOf(person: PersonRowDto, o: PoolOptions): PersonRowVM {
  const vm = toPersonRowVM(person, o.tz, o.now, o.viewer, o.ready, o.names ?? null);
  return o.dealsOn ? vm : { ...vm, deal: null, dealStage: null, openDeals: [], dealStages: [] };
}

/** Everyone's rows, as poolRowOf reads each. */
export function poolRowsOf(people: readonly PersonRowDto[], o: PoolOptions): PersonRowVM[] {
  return people.map((p) => poolRowOf(p, o));
}

/** Whether the profile names a consult-first service (0004): a list that reads consultations can be counted only then. */
export function consultFirstOf(rules: ConsultRules | null | undefined): boolean {
  return (rules?.consult_first ?? []).length > 0;
}

/** What a pool can give a list (lists.ts ListContext): its calendar, deals, a consult-first service, and a viewer. */
export function poolListContext(o: {
  calendar: ListContext["calendar"];
  dealsOn: boolean;
  consultFirst: boolean;
  viewer: string | null;
}): ListContext {
  return { calendar: o.calendar, dealsOn: o.dealsOn, consultFirst: o.consultFirst, viewer: o.viewer !== null };
}
