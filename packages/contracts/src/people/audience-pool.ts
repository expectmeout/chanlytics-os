/**
 * The pool every list is judged over (decision 0009): everyone, with their appointments, as the People page, a send, a
 * playbook's run and the assistant read them.
 *
 * The two apps fetch differently -- the dashboard its cached feed, the edge its own -- but what they make of what they
 * fetched is decided here, once: which appointments are a person's, which of them is a consultation (0004), the row
 * each person is read as, and what the pool can give a list. The edge's runner had built its own: its visits were never
 * marked as consultations, so a playbook on a list that reads one ran on nobody the page counted.
 */
import type { ConsultRules, FeedItem } from "../calendar/availability";
import {
  indexFeed,
  toVisitDto,
  visitsIn,
  type OwnAddresses,
  type PersonLike,
  type PersonVisitsDto,
  type VisitDto,
} from "../calendar/calendar-people";
import { isConsultationTitle } from "../deals/deals";
import type { ListContext } from "./lists";
import { toPersonRowVM, type PersonRowDto, type PersonRowVM } from "./people";

/** A People row as the calendar matches it: a name a human gave, their number, their address. */
export function personLikeOf(
  p: Pick<PersonRowDto, "id" | "display_name" | "wa_profile_name" | "phone_e164"> &
    Partial<Pick<PersonRowDto, "email" | "has_chat" | "latest_conversation_id" | "latest_wa_inbound_at">>,
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
  const index = indexFeed([...items], cal.own);
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
}

/**
 * The row one person is read as. Where deals are off it carries no deal and no deal stage: not the lists, the column,
 * the row's second line, the thread's chip, or Today's proposals waiting, which all read it from here.
 */
export function poolRowOf(person: PersonRowDto, o: PoolOptions): PersonRowVM {
  const vm = toPersonRowVM(person, o.tz, o.now, o.viewer);
  return o.dealsOn ? vm : { ...vm, deal: null, dealStage: null };
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
