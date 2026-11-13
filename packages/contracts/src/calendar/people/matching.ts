/** People: matching. */

import { isIdentifierName } from "../../conversations/thread-contact";
import type { FeedItem } from "../feed";
import { appointmentKeyOf, recordIdOf } from "../appointment-key";
import { alertAddressesOf } from "../../config/workspace-config/alerts";
import { formatPhoneDisplay, normalizePhone } from "../../shared/phone";
import { DAY_MS, MIN_MS } from "../../shared/time";

export interface EventContacts {
  /** E.164. */
  phones: string[];
  emails: string[];
  /** Guest names the calendar carried. */
  names: string[];
}

export interface PersonLike {
  id: string;
  /** A name a human gave — display or WhatsApp — or "" when there is none. Never a phone made words. */
  name: string;
  /** E.164, or null. */
  phone: string | null;
  /** Their address, lower-cased the way People stores it (00125), or null. Matched against, never created from: `create_person` wants a phone. */
  email: string | null;
  /** Their latest conversation, when they have one: the thread a booking link is texted into. */
  thread?: string | null;
  /** When they last wrote on WhatsApp, and by Instagram DM (person-row.ts igClockOfRow): each its reply window's clock. */
  waInboundAt?: string | null;
  igInboundAt?: string | null;
  /**
   * What a reply to them is judged by, as their People row says it (people/person-row/row-vm.ts replyChannelOfRow, isEmailStopped,
   * isOptedOutContact): the wire a reply goes out on, whether mail to their address has stopped, whether they asked to
   * stop or are on do-not-contact. The board's block asks the booking link's rule (people/person-reach.ts) of these.
   */
  reach?: { wire: "whatsapp" | "sms" | "email" | "instagram" | null; emailStopped: boolean; optedOut: boolean };
  /** The business they work at, while it stands (0052): a booking that names it is theirs, where nobody else works there. */
  business?: string | null;
  /**
   * That business's own addresses, lower-cased, on its own person alone (0052, I24: its email and the other ones the finder
   * read off its site): a booking from one is theirs, matched by their business, since the address is the business's and
   * not theirs. None for anyone else.
   */
  businessEmails?: readonly string[];
}

/**
 * How a visit was found to be someone's: a number or an address in the event (exact), their name in its words or the
 * business they work at (0052; guesses), or `record`, the booking's own row naming them (appointments.contact_id, linked
 * when the booking email was read), where "matched by email" said a match nothing on the board had made.
 */
export type MatchVia = "phone" | "email" | "name" | "business" | "record";

/**
 * How a match is said, once, wherever a visit names who it is for (the Calendar's panel, the person's History, Coming up
 * and Next visit, D1-visit-match-words): "matched by phone". It was worded four ways ("matched by name", "by name",
 * "matched by phone"). A name is the one match that is a guess, which the narrow places say alone (`isGuess`).
 */
const MATCH_WORDS: Record<MatchVia, string> = {
  phone: "matched by phone",
  email: "matched by email",
  name: "matched by name",
  business: "matched by their business",
  record: "linked on the booking",
};

/** The words for a match, or null where the visit says none (a visit rebuilt from an older read has no route). */
export function matchWordsOf(via: MatchVia | null | undefined): string | null {
  return via ? MATCH_WORDS[via] : null;
}

/** Whether a match is a guess: a name only, where a number and an address are the person (matchPerson). */
export function isGuess(via: MatchVia | null | undefined): boolean {
  return via === "name" || via === "business";
}

export interface PersonMatch {
  id: string;
  name: string;
  via: MatchVia;
  /** Present only when the person has a thread: its conversation id, and their last WhatsApp message and DM: the windows. */
  thread?: string | null;
  wa_inbound_at?: string | null;
  ig_inbound_at?: string | null;
  /** Present only when the person's row said it (PersonLike.reach): the wire a reply goes out on, and the two stops. */
  reply_wire?: "whatsapp" | "sms" | "email" | "instagram" | null;
  email_stopped?: boolean;
  opted_out?: boolean;
}

/** The thread facts a match carries, when the person has one; nothing otherwise, so a match without a thread is unchanged. */
function threadOf({ thread, waInboundAt, igInboundAt }: PersonLike) {
  return thread ? { thread, wa_inbound_at: waInboundAt ?? null, ig_inbound_at: igInboundAt ?? null } : {};
}

/** The reach facts a match carries when the row said them, whether or not there is a thread: a stop is a stop. */
export function replyFactsOf(person: PersonLike): Pick<PersonMatch, "reply_wire" | "email_stopped" | "opted_out"> {
  return person.reach
    ? { reply_wire: person.reach.wire, email_stopped: person.reach.emailStopped, opted_out: person.reach.optedOut }
    : {};
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

// A phone as people write one: an optional +, groups of digits joined by
// spaces, dots, dashes or brackets.
const PHONE_RE = /\+?\(?\d{1,4}\)?(?:[\s.-]?\(?\d{2,4}\)?){2,5}/g;

const ISO_DATE_RE = /^\d{4}[-./]\d{2}[-./]\d{2}/;

/** A phone-looking run is a phone when it has ten to fifteen digits and is not a date; a bare run only when it is a plain ten-digit number or +1 and ten. */
function phoneFrom(raw: string): string | null {
  const s = raw.trim();
  if (ISO_DATE_RE.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const bare = /^\+?\d+$/.test(s);
  if (bare && !s.startsWith("+") && !(digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))))
    return null;
  return normalizePhone(s.startsWith("+") ? `+${digits}` : digits);
}

/**
 * THE BUSINESS'S OWN ADDRESSES. Never a customer's, on any calendar event.
 *
 * #626 took the calendar's ORGANISER off every event: the owner is on all of
 * them and is never who the appointment is for. That covered the owner as
 * organiser and left the owner as GUEST -- which is every meeting somebody
 * else sent them, and on a personal Google Calendar that is most of them. So
 * when the owner wrote to their own salon's new address to test it (the first
 * thing anybody does with a new inbox), they became a person in People, and
 * every event they were invited to became one of their "visits": "Visited ·
 * New voicemail notification received", "Last visit: Today". The index's own
 * comment predicted it: an owner who is in People "would take every
 * appointment they are a guest on".
 *
 * The timeline was the visible half. The worse half was the playbooks, which
 * read visits the same way to decide who is thanked after a visit and who is
 * reminded before one: they could have written to the owner, as a customer,
 * about a meeting on their own calendar.
 *
 * Two facts every reader of the calendar already holds say an address is the
 * business's: it is where the business is ALERTED (notifications
 * .escalation_emails -- somebody who is told "a customer needs you" is not the
 * customer), and it is the calendar's own owner (a Google feed names its
 * calendar, and a primary calendar is named by its owner's address). A
 * team member who is neither is not covered: the auth table holding members'
 * addresses is not something the edge can read without a new function, and
 * this is exact for the case that happened.
 *
 * It is a REQUIRED input of every function below that matches a person, so no
 * reader of the calendar can forget to pass it -- the playbooks, the phone
 * receptionist and three dashboard reads, and whichever comes next.
 */
export type OwnAddresses = ReadonlySet<string>;

/** For a reader that takes only phones from an event, where an address can never become anybody. */
export const NO_OWN_ADDRESSES: OwnAddresses = new Set();

/**
 * The address a Google Calendar feed belongs to, or null.
 *
 * A private feed is https://calendar.google.com/calendar/ical/<id>/private-<key>/basic.ics,
 * and a primary calendar's id is its owner's address. A secondary calendar is
 * <hash>@group.calendar.google.com and an imported one @import.calendar.google.com:
 * calendars, not people, so neither is anybody's address.
 */
export function calendarOwnerOf(url: string | null | undefined): string | null {
  const match = /^https:\/\/calendar\.google\.com\/calendar\/ical\/([^/]+)\//i.exec(url ?? "");
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1] ?? "")
      .trim()
      .toLowerCase();
  } catch {
    // Not valid percent-encoding.
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) || /@(group|import)\.calendar\.google\.com$/.test(id)) return null;
  return id;
}

/** The business's own addresses, from the config every calendar reader already has: where it is alerted, and whose calendar it reads. */
export function ownAddressesOf(
  cfg:
    | {
        notifications?: { escalation_emails?: readonly string[] | null } | null;
        calendar?: { ical_url?: string | null } | null;
      }
    | null
    | undefined,
): OwnAddresses {
  const out = alertAddressesOf(cfg?.notifications);
  const owner = calendarOwnerOf(cfg?.calendar?.ical_url);
  if (owner) out.add(owner);
  return out;
}

/** Is this one of the business's own people, by the address they are held under? */
function isOwn(own: OwnAddresses, p: Pick<PersonLike, "email">): boolean {
  return !!p.email && own.has(p.email.toLowerCase());
}

/**
 * The phones, emails and guest names an event carries, wherever they were
 * written -- except the organiser's.
 *
 * The organiser is the calendar's owner, or the booking tool writing into it.
 * They are on EVERY event the feed carries, as ORGANIZER and usually among
 * the guests as well, and they are never who the appointment is for. Left in,
 * an owner who is also in People -- which the email channel makes likely,
 * since testing a new inbox means writing to it from your own address --
 * would take every appointment on their own calendar: by address, or by the
 * name their CN repeats on every line. So both come off, keyed by the
 * address, because that is the key the two arrive under. The cost is an
 * appointment a customer organised themselves, which stays unmatched --
 * matching nobody is the safe way to be wrong; attaching the owner is not.
 */
export function extractContacts(
  item: Pick<FeedItem, "title" | "description" | "location" | "attendees" | "organizer">,
  own: OwnAddresses,
): EventContacts {
  const text = [item.title, item.description ?? "", item.location ?? ""].join("\n");
  const organizer = item.organizer?.toLowerCase() || null;
  const emails = new Set<string>();
  for (const m of text.match(EMAIL_RE) ?? []) emails.add(m.toLowerCase());
  for (const a of item.attendees ?? []) if (a.email) emails.add(a.email.toLowerCase());
  if (organizer) emails.delete(organizer);
  // The business's own addresses come off the same way the organiser's do,
  // for the same reason: they are on the event because it is the business's
  // calendar, never because the appointment is for them.
  for (const a of own) emails.delete(a);
  const phones = new Set<string>();
  // Emails out first: the digits in "maria2026@gmail.com" are not a phone.
  for (const m of text.replace(EMAIL_RE, " ").match(PHONE_RE) ?? []) {
    const p = phoneFrom(m);
    if (p) phones.add(p);
  }
  const names = new Set<string>();
  for (const a of item.attendees ?? []) {
    if (organizer && a.email?.toLowerCase() === organizer) continue;
    if (a.email && own.has(a.email.toLowerCase())) continue;
    const n = (a.name ?? "").trim();
    if (n && !EMAIL_RE.test(n)) names.add(n);
    EMAIL_RE.lastIndex = 0;
  }
  return { phones: [...phones], emails: [...emails], names: [...names] };
}

export const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A whole-name matcher: four letters or more, on word edges ("Dani" is not in "Daniela"); null for a name that is none, or only a number or an address made words (isIdentifierName). */
function nameMatcher(name: string): RegExp | null {
  const n = name.trim();
  if (n.length < 4 || isIdentifierName(n)) return null;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}(?=$|[^\\p{L}\\p{N}])`, "iu");
}

/**
 * A person whose whole name the text carries: four letters or more, on word
 * edges ("Dani" is not in "Daniela"), the longest match when several fit.
 * Never a bare number, never a name that is only a phone made words.
 */
export function personInText(text: string, people: PersonLike[]): PersonLike | null {
  let best: PersonLike | null = null;
  for (const p of people) {
    const re = nameMatcher(p.name);
    if (re && re.test(text) && (!best || p.name.trim().length > best.name.trim().length)) best = p;
  }
  return best;
}

/**
 * What the board calls a person: the same order People names someone by (people.ts personName), so a person known only
 * by a number or an address reads as that and not as "Unknown", and never as nobody. A booking's row names its person by
 * it too (appointment-item.ts personOfAppointment), after the name the booking itself gave.
 */
export const personLabelOf = (person: PersonLike): string =>
  person.name.trim() || formatPhoneDisplay(person.phone) || person.email || "Unknown";

/** Who the appointment is for: a phone in the event first, then an address, then a whole name in its title, guests or description. */
export function matchPerson(
  item: Pick<FeedItem, "title" | "description" | "location" | "attendees" | "organizer">,
  everyone: PersonLike[],
  own: OwnAddresses,
): PersonMatch | null {
  const result = extractContacts(item, own);
  // Not a candidate at all: named or not, the business's own person is never
  // who an appointment is for, so it cannot be labelled "with" them either.
  const people = everyone.filter((p) => !isOwn(own, p));
  if (result.phones.length) {
    const byPhone = new Map<string, PersonLike>();
    for (const p of people) if (p.phone) byPhone.set(p.phone, p);
    for (const ph of result.phones) {
      const p = byPhone.get(ph);
      if (p) return { id: p.id, name: personLabelOf(p), via: "phone", ...threadOf(p), ...replyFactsOf(p) };
    }
  }
  if (result.emails.length) {
    // The event's addresses are lower-cased by extractContacts; People's are
    // normalised on the way in (00125), and lower-cased again here for a row
    // written before that.
    const byEmail = new Map<string, PersonLike>();
    for (const p of people) if (p.email) byEmail.set(p.email.toLowerCase(), p);
    for (const em of result.emails) {
      const p = byEmail.get(em);
      if (p) return { id: p.id, name: personLabelOf(p), via: "email", ...threadOf(p), ...replyFactsOf(p) };
    }
    // A business's own address (0052, I24): its person's, and said as their business, since it is not their own.
    const byBusiness = new Map<string, PersonLike>();
    for (const p of people) for (const em of p.businessEmails ?? []) byBusiness.set(em, p);
    for (const em of result.emails) {
      const p = byBusiness.get(em);
      if (p) return { id: p.id, name: personLabelOf(p), via: "business", ...threadOf(p), ...replyFactsOf(p) };
    }
  }
  const words = [item.title, ...result.names, item.description ?? ""].join("\n");
  const otherPersonInText = personInText(words, people);
  if (otherPersonInText)
    return {
      id: otherPersonInText.id,
      name: personLabelOf(otherPersonInText),
      via: "name",
      ...threadOf(otherPersonInText),
      ...replyFactsOf(otherPersonInText),
    };
  const byBusiness = personInText(words, soleAtBusiness(people));
  const businessPerson = byBusiness ? people.find((x) => x.id === byBusiness.id) : undefined;
  return businessPerson
    ? {
        id: businessPerson.id,
        name: personLabelOf(businessPerson),
        via: "business",
        ...threadOf(businessPerson),
        ...replyFactsOf(businessPerson),
      }
    : null;
}

/** Each person who is the only one in the pool at their business (0052), named by it: two at one is no one's booking. */
function soleAtBusiness(people: PersonLike[]): PersonLike[] {
  const key = (p: PersonLike) => p.business?.trim().toLowerCase() ?? "";
  const n = new Map<string, number>();
  for (const p of people) n.set(key(p), (n.get(key(p)) ?? 0) + 1);
  return people.flatMap((p) => (key(p) && n.get(key(p)) === 1 ? [{ ...p, name: p.business?.trim() ?? "" }] : []));
}

/* ---------------------------------------------------------------- visits */

export interface Visit {
  id: string;
  /** The appointment's own key (appointment-key.ts): what its row is stored under, and what a send asks of it again. Absent on a visit rebuilt from an older read. */
  key?: string;
  /** Epoch ms. */
  start: number;
  end: number;
  title: string;
  allDay: boolean;
  via: MatchVia;
  /** What a member said became of it (FeedItem.said): kept or missed. Absent while it stands. */
  said?: "kept" | "missed";
  /** The id of the record's row for it (FeedItem.recordId): what the Calendar opens the visit by. Absent for an event the sync has not kept. */
  recordId?: string;
}

export interface Visits {
  /** The first appointment that has not ended, and was not said missed. */
  next: Visit | null;
  /** The latest one that has, and that they came to as far as anyone said: a visit said missed is no visit. */
  last: Visit | null;
  /** The latest visit a member said they missed (decision 0002 step 8): what a win-back reads. */
  missed?: Visit | null;
  /** Every appointment starting within NEAR_VISIT_MS of now, by start: what a day-keyed moment reads (playbook-reach visitOnDay). */
  near: Visit[];
}

/** How far from now a visit is kept in `near`: past the day before and the day after, whatever the zone. */
const NEAR_VISIT_MS = 3 * DAY_MS;

/** A feed indexed once — every item's phones, addresses and words found up front — so many people can be matched against it. */
export interface FeedIndex {
  byPhone: Map<string, FeedItem[]>;
  /**
   * Lower-cased, as extractContacts gives them: every address the event carried except the organiser's (#626) and the
   * business's own (`own`). An owner who is in People used to take every appointment they were a guest on; the organiser
   * rule covered them as organiser, and `own` as guest.
   */
  byEmail: Map<string, FeedItem[]>;
  /** A booking's rows by the person each is linked to (FeedItem.contactId): found first, as the board finds them. */
  byContact: Map<string, FeedItem[]>;
  texts: Array<{ item: FeedItem; text: string }>;
  /** The business's own addresses: taken off every event, and a person held under one has no visits. */
  own: OwnAddresses;
}

/** A booking's own row, joined to the feed (feedItemOfAppointment), rather than a calendar's event. */
const isBookingRow = (it: FeedItem): boolean => !!it.uid && recordIdOf(it.uid) !== null;

export function indexFeed(items: FeedItem[], own: OwnAddresses): FeedIndex {
  const byPhone = new Map<string, FeedItem[]>();
  const byEmail = new Map<string, FeedItem[]>();
  const byContact = new Map<string, FeedItem[]>();
  const texts: FeedIndex["texts"] = [];
  for (const it of items) {
    const c = extractContacts(it, own);
    for (const ph of c.phones) byPhone.set(ph, [...(byPhone.get(ph) ?? []), it]);
    for (const em of c.emails) byEmail.set(em, [...(byEmail.get(em) ?? []), it]);
    if (it.contactId) byContact.set(it.contactId, [...(byContact.get(it.contactId) ?? []), it]);
    // A booking's row is its client's by their number or address, never by name (personOfAppointment): a notice for an
    // unsaved Maria Lopez is not the saved Maria Lopez's visit.
    if (!isBookingRow(it)) texts.push({ item: it, text: [it.title, ...c.names, it.description ?? ""].join("\n") });
  }
  return { byPhone, byEmail, byContact, texts, own };
}

/** Two visits are the same one when they are the same client's and start within this of each other. */
export const SAME_VISIT_MS = 15 * MIN_MS;

/** Whether two starts (epoch ms) are one visit's, the client being the same: booking-notice.ts and the visits index. */
export const sameVisitStart = (first: number, second: number): boolean => Math.abs(first - second) <= SAME_VISIT_MS;

/** One feed item as a visit of the person it was matched to, by the route it was matched by. */
const visitOf = (it: FeedItem, via: MatchVia): Visit => ({
  id: it.uid ? `${it.uid}:${it.start}` : `ev:${it.start}`,
  key: appointmentKeyOf(it),
  start: it.start,
  end: it.end,
  title: it.title || "Busy",
  allDay: it.allDay,
  via,
  ...(it.said ? { said: it.said } : {}),
  ...(it.recordId ? { recordId: it.recordId } : {}),
});

/**
 * Whether a calendar's event (never a booking's row) found for a person by their number, or with no number in it by their
 * address, names them first: the person the sweep matches it to (matchPerson takes an event's numbers in order), so it
 * is never another client's.
 */
function namesThemFirst(it: FeedItem, via: MatchVia, person: PersonLike, own: OwnAddresses): boolean {
  if ((via !== "phone" && via !== "email") || isBookingRow(it)) return false;
  const c = extractContacts(it, own);
  if (via === "phone") return c.phones[0] === person.phone;
  return !c.phones.length && c.emails[0] === person.email?.toLowerCase();
}

/**
 * One person's appointments against an indexed feed, each once: the bookings linked to them first, then by their number,
 * their address, their business's addresses and their whole name. A calendar's event that names them first by number or
 * address (namesThemFirst) and starts as near a booking linked to them as one visit's (sameVisitStart) is that booking's
 * copy, the sweep's rule for a copy by its person (booking-notice.ts bookingCopyTest) read only where the match is not a
 * guess: left out for the nearest such booking, its word kept on the booking where the booking has none. One found by
 * their business or their name stands as its own visit, as the board draws it.
 */
function personVisits(index: FeedIndex, person: PersonLike): Visit[] {
  // By every route, not only the address: a named owner would otherwise take "Meeting with Ruben Segura" by its words.
  if (isOwn(index.own, person)) return [];
  const taken = new Map<FeedItem, MatchVia>();
  const take = (items: readonly FeedItem[] | undefined, via: MatchVia) => {
    for (const it of items ?? []) if (!taken.has(it)) taken.set(it, via);
  };
  take(index.byContact.get(person.id), "record");
  if (person.phone) take(index.byPhone.get(person.phone), "phone");
  if (person.email) take(index.byEmail.get(person.email.toLowerCase()), "email");
  for (const em of person.businessEmails ?? []) take(index.byEmail.get(em), "business");
  const re = nameMatcher(person.name);
  if (re) for (const { item, text } of index.texts) if (!taken.has(item) && re.test(text)) taken.set(item, "name");
  const linked = index.byContact.get(person.id) ?? [];
  const gap = (a: FeedItem, b: FeedItem) => Math.abs(a.start - b.start);
  const copies: Array<{ it: FeedItem; of: FeedItem }> = [];
  for (const [it, via] of taken) {
    if (!namesThemFirst(it, via, person, index.own)) continue;
    const near = linked.filter((b) => sameVisitStart(b.start, it.start)).sort((a, b) => gap(a, it) - gap(b, it));
    if (near[0]) copies.push({ it, of: near[0] });
  }
  // The nearest copy's word first, so a word said of one visit is not laid on the booking beside it.
  const words = new Map<FeedItem, "kept" | "missed">();
  for (const { it, of } of copies.sort((a, b) => gap(a.it, a.of) - gap(b.it, b.of)))
    if (it.said && !of.said && !words.has(of)) words.set(of, it.said);
  const left = new Set(copies.map((c) => c.it));
  return [...taken].flatMap(([it, via]) => {
    if (left.has(it)) return [];
    const sentence = words.get(it);
    return [sentence ? { ...visitOf(it, via), said: sentence } : visitOf(it, via)];
  });
}

/** Every appointment of one person against an indexed feed, oldest first (personVisits). */
export function allVisitsIn(index: FeedIndex, person: PersonLike): Visit[] {
  return personVisits(index, person).sort((a, b) => a.start - b.start);
}

/** One person's next and last appointment against an indexed feed (personVisits). */
export function visitsIn(index: FeedIndex, person: PersonLike, nowMs: number): Visits {
  let next: Visit | null = null;
  let last: Visit | null = null;
  let missed: Visit | null = null;
  const near: Visit[] = [];
  for (const value of personVisits(index, person)) {
    // A visit said missed is none of their visits: not the next, not the last, no day a moment is keyed to. It is the
    // one a win-back reads instead.
    if (value.said === "missed") {
      if (!missed || value.start > missed.start) missed = value;
      continue;
    }
    if (value.end >= nowMs) {
      if (!next || value.start < next.start) next = value;
    } else if (!last || value.end > last.end) last = value;
    if (Math.abs(value.start - nowMs) <= NEAR_VISIT_MS) near.push(value);
  }
  return { next, last, near: near.sort((a, b) => a.start - b.start), missed };
}

/** One person's next and last appointment in a parsed feed. */
export function visitsOf(items: FeedItem[], person: PersonLike, nowMs: number, own: OwnAddresses): Visits {
  return visitsIn(indexFeed(items, own), person, nowMs);
}
