/**
 * The people in a calendar: who an appointment is for, read from the words
 * a booking tool wrote into the owner's calendar and matched against People.
 *
 * Booksy, Square, Fresha, Acuity and Google's own appointment schedules all
 * put the client's name and the service in the title; some add a phone or
 * an email in the description, and a booking made through Google adds the
 * booker as a guest. None of it is structured, so the match goes by
 * evidence: a phone number found anywhere in the event beats an address, an
 * address beats a name, and a name only counts when it is a whole saved name
 * of four letters or more. A number and an address are exact — they are the
 * person, or nobody; a name is a guess, and a name match is the only one that
 * says so. People has held an address since 00125, so the customer a booking
 * through Google adds as a guest is now someone, not an unmatched block.
 *
 * Pure. The dashboard's calendar, the person's profile, both receptionists
 * and the tests share it, so an appointment is the same person everywhere.
 */
import { dayInZone, dayPlusInZone, type FeedItem } from "./availability";
import { formatPhoneDisplay, normalizePhone } from "./phone";

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
  /** When they last wrote on WhatsApp, for the reply window. */
  waInboundAt?: string | null;
}

/** How a match was made, surest first: a number and an address are exact, a name is a guess. */
export type MatchVia = "phone" | "email" | "name";

export interface PersonMatch {
  id: string;
  name: string;
  via: MatchVia;
  /** Present only when the person has a thread: its conversation id, and their last WhatsApp message for the reply window. */
  thread?: string | null;
  wa_inbound_at?: string | null;
}

/** The thread facts a match carries, when the person has one; nothing otherwise, so a match without a thread is unchanged. */
function threadOf(p: PersonLike): Pick<PersonMatch, "thread" | "wa_inbound_at"> {
  return p.thread ? { thread: p.thread, wa_inbound_at: p.waInboundAt ?? null } : {};
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
const NO_OWN_ADDRESSES: OwnAddresses = new Set();

/**
 * The address a Google Calendar feed belongs to, or null.
 *
 * A private feed is https://calendar.google.com/calendar/ical/<id>/private-<key>/basic.ics,
 * and a primary calendar's id is its owner's address. A secondary calendar is
 * <hash>@group.calendar.google.com and an imported one @import.calendar.google.com:
 * calendars, not people, so neither is anybody's address.
 */
export function calendarOwnerOf(url: string | null | undefined): string | null {
  const m = /^https:\/\/calendar\.google\.com\/calendar\/ical\/([^/]+)\//i.exec(url ?? "");
  if (!m) return null;
  let id: string;
  try {
    id = decodeURIComponent(m[1]).trim().toLowerCase();
  } catch {
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
  const out = new Set<string>();
  for (const e of cfg?.notifications?.escalation_emails ?? []) {
    const a = String(e).trim().toLowerCase();
    if (a) out.add(a);
  }
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

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A whole-name matcher: four letters or more, on word edges ("Dani" is not in "Daniela"); null for a name that is none, or only a phone made words. */
function nameMatcher(name: string): RegExp | null {
  const n = name.trim();
  if (n.length < 4 || /^[+\d(]/.test(n)) return null;
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

// The same order People names someone by (people.ts personName), so a person
// known only by an address reads as that address and not as "Unknown".
const labelOf = (p: PersonLike): string => p.name.trim() || formatPhoneDisplay(p.phone) || p.email || "Unknown";

/** Who the appointment is for: a phone in the event first, then an address, then a whole name in its title, guests or description. */
export function matchPerson(
  item: Pick<FeedItem, "title" | "description" | "location" | "attendees" | "organizer">,
  everyone: PersonLike[],
  own: OwnAddresses,
): PersonMatch | null {
  const c = extractContacts(item, own);
  // Not a candidate at all: named or not, the business's own person is never
  // who an appointment is for, so it cannot be labelled "with" them either.
  const people = everyone.filter((p) => !isOwn(own, p));
  if (c.phones.length) {
    const byPhone = new Map<string, PersonLike>();
    for (const p of people) if (p.phone) byPhone.set(p.phone, p);
    for (const ph of c.phones) {
      const p = byPhone.get(ph);
      if (p) return { id: p.id, name: labelOf(p), via: "phone", ...threadOf(p) };
    }
  }
  if (c.emails.length) {
    // The event's addresses are lower-cased by extractContacts; People's are
    // normalised on the way in (00125), and lower-cased again here for a row
    // written before that.
    const byEmail = new Map<string, PersonLike>();
    for (const p of people) if (p.email) byEmail.set(p.email.toLowerCase(), p);
    for (const em of c.emails) {
      const p = byEmail.get(em);
      if (p) return { id: p.id, name: labelOf(p), via: "email", ...threadOf(p) };
    }
  }
  const p = personInText([item.title, ...c.names, item.description ?? ""].join("\n"), people);
  return p ? { id: p.id, name: labelOf(p), via: "name", ...threadOf(p) } : null;
}

/* ---------------------------------------------------------------- visits */

export interface Visit {
  id: string;
  /** Epoch ms. */
  start: number;
  end: number;
  title: string;
  allDay: boolean;
  via: MatchVia;
}

export interface Visits {
  /** The first appointment that has not ended. */
  next: Visit | null;
  /** The latest one that has. */
  last: Visit | null;
}

/** A feed indexed once — every item's phones, addresses and words found up front — so many people can be matched against it. */
export interface FeedIndex {
  byPhone: Map<string, FeedItem[]>;
  /**
   * Lower-cased, as extractContacts gives them: every address the event
   * carried except the organiser's (#626) and the business's own (`own`). An
   * owner who is in People used to take every appointment they were a guest
   * on; the organiser rule covered them as organiser, and `own` as guest.
   */
  byEmail: Map<string, FeedItem[]>;
  texts: Array<{ item: FeedItem; text: string }>;
  /** The business's own addresses: taken off every event, and a person held under one has no visits. */
  own: OwnAddresses;
}

export function indexFeed(items: FeedItem[], own: OwnAddresses): FeedIndex {
  const byPhone = new Map<string, FeedItem[]>();
  const byEmail = new Map<string, FeedItem[]>();
  const texts: FeedIndex["texts"] = [];
  for (const it of items) {
    const c = extractContacts(it, own);
    for (const ph of c.phones) byPhone.set(ph, [...(byPhone.get(ph) ?? []), it]);
    for (const em of c.emails) byEmail.set(em, [...(byEmail.get(em) ?? []), it]);
    texts.push({ item: it, text: [it.title, ...c.names, it.description ?? ""].join("\n") });
  }
  return { byPhone, byEmail, texts, own };
}

/** Every appointment of one person against an indexed feed, oldest first: their number first, their address second, their whole name third. */
export function allVisitsIn(index: FeedIndex, person: PersonLike): Visit[] {
  // By every route, not only the address: a named owner would otherwise take
  // "Meeting with Ruben Segura" by the words in its title.
  if (isOwn(index.own, person)) return [];
  const out: Visit[] = [];
  const seen = new Set<FeedItem>();
  const take = (it: FeedItem, via: MatchVia) => {
    if (seen.has(it)) return;
    seen.add(it);
    out.push({
      id: it.uid ? `${it.uid}:${it.start}` : `ev:${it.start}`,
      start: it.start,
      end: it.end,
      title: it.title || "Busy",
      allDay: it.allDay,
      via,
    });
  };
  if (person.phone) for (const it of index.byPhone.get(person.phone) ?? []) take(it, "phone");
  if (person.email) for (const it of index.byEmail.get(person.email.toLowerCase()) ?? []) take(it, "email");
  const re = nameMatcher(person.name);
  if (re) for (const { item, text } of index.texts) if (!seen.has(item) && re.test(text)) take(item, "name");
  return out.sort((a, b) => a.start - b.start);
}

/** One person's next and last appointment against an indexed feed: their number first, their address second, their whole name third. */
export function visitsIn(index: FeedIndex, person: PersonLike, nowMs: number): Visits {
  if (isOwn(index.own, person)) return { next: null, last: null };
  let next: Visit | null = null;
  let last: Visit | null = null;
  const seen = new Set<FeedItem>();
  const take = (it: FeedItem, via: MatchVia) => {
    if (seen.has(it)) return;
    seen.add(it);
    const v: Visit = {
      id: it.uid ? `${it.uid}:${it.start}` : `ev:${it.start}`,
      start: it.start,
      end: it.end,
      title: it.title || "Busy",
      allDay: it.allDay,
      via,
    };
    if (it.end >= nowMs) {
      if (!next || v.start < next.start) next = v;
    } else if (!last || v.end > last.end) last = v;
  };
  if (person.phone) for (const it of index.byPhone.get(person.phone) ?? []) take(it, "phone");
  if (person.email) for (const it of index.byEmail.get(person.email.toLowerCase()) ?? []) take(it, "email");
  const re = nameMatcher(person.name);
  if (re) for (const { item, text } of index.texts) if (!seen.has(item) && re.test(text)) take(item, "name");
  return { next, last };
}

/** One person's next and last appointment in a parsed feed. */
export function visitsOf(items: FeedItem[], person: PersonLike, nowMs: number, own: OwnAddresses): Visits {
  return visitsIn(indexFeed(items, own), person, nowMs);
}

/** ISO or ms → ms. */
const ms = (t: number | string): number => (typeof t === "number" ? t : Date.parse(t));

/** "Tue, Sep 8" — or "Today" / "Tomorrow" by the business's clock. */
export function visitDay(start: number | string, tz: string, nowMs: number): string {
  const key = dayInZone(tz, ms(start)).key;
  const today = dayInZone(tz, nowMs).key;
  const tomorrow = dayPlusInZone(tz, nowMs, 1).key;
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(ms(start)),
  );
}

/** "2:00 – 5:00 PM", or "all day". */
export function visitTime(
  v: { start: number | string; end: number | string; allDay?: boolean; all_day?: boolean },
  tz: string,
): string {
  if (v.allDay || v.all_day) return "all day";
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const a = f.format(new Date(ms(v.start)));
  const b = f.format(new Date(ms(v.end)));
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} – ${b}`;
}

/** "Tue, Sep 8 · 2:00 – 5:00 PM" */
/** "2026-09-08" — the day a visit falls on, by the calendar's own clock. */
export function visitDateKey(start: number | string, tz: string): string {
  return dayInZone(tz, ms(start)).key;
}

/** "2:00 PM" — the start alone, for a reminder's sentence. */
export function visitStartTime(v: { start: number | string; allDay?: boolean; all_day?: boolean }, tz: string): string {
  if (v.allDay || v.all_day) return "all day";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
    new Date(ms(v.start)),
  );
}

export function visitLine(
  v: { start: number | string; end: number | string; allDay?: boolean; all_day?: boolean },
  tz: string,
  nowMs: number,
): string {
  return `${visitDay(v.start, tz, nowMs)} · ${visitTime(v, tz)}`;
}

/**
 * The receptionist's lines about a caller's appointments — facts from the
 * calendar, with the rule that nothing is changed from here. A match by
 * name alone says so, so the receptionist confirms it is them before it
 * reads details back. With no booking link to send (the first run's
 * decision 2), a change goes to the team.
 */
export function describeVisits(visits: Visits, tz: string, nowMs: number, hasBookingLink: boolean): string | null {
  const out: string[] = [];
  if (visits.next) {
    const n = visits.next;
    out.push(
      `Their next appointment on the calendar: ${visitLine(n, tz, nowMs)} (${n.title}).${n.via === "name" ? " Matched by name only — make sure it is them before confirming details." : ""} If they ask, confirm it; to change or cancel it, ${hasBookingLink ? "send the booking link" : "say the team will follow up"} — nothing is changed from here.`,
    );
  }
  if (visits.last) {
    const l = visits.last;
    out.push(
      `Their last visit on the calendar: ${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(l.start))} (${l.title}).`,
    );
  }
  return out.length ? out.join(" ") : null;
}

/* ---------------------------------------------------------------- words */

/** Which calendar the feed comes from, from its address alone — the address itself never leaves the server. */
export function feedSourceLabel(url: string | null | undefined): string {
  if (!url) return "your calendar";
  let host = "";
  try {
    host = new URL(url.replace(/^webcal:\/\//i, "https://")).hostname.toLowerCase();
  } catch {
    return "your calendar";
  }
  if (host.includes("google")) return "Google Calendar";
  if (host.includes("icloud")) return "Apple Calendar";
  if (host.includes("office365") || host.includes("outlook") || host.includes("live.com")) return "Outlook";
  return "your calendar";
}

/** A description as plain text: tags out, entities back, at most a screen of it. */
export function eventText(raw: string | null | undefined, max = 1500): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/* ------------------------------------------------------------- the wire */

/** One appointment on the wire. */
export interface VisitDto {
  id: string;
  /** ISO instants. */
  start: string;
  end: string;
  title: string;
  all_day: boolean;
  via: MatchVia;
  /** The visit is a consultation: its title says so, or names a consult-first service (contracts isConsultationTitle, set by the server). Absent on an older read. */
  consultation?: boolean;
}

/** A person's appointments as their profile reads them. */
export interface PersonVisitsDto {
  timezone: string;
  source: string;
  state: "ok" | "unavailable";
  next: VisitDto | null;
  last: VisitDto | null;
  /** Every visit the feed holds for them, oldest first — the profile's timeline. Absent on the list. */
  all?: VisitDto[];
}

export function toVisitDto(v: Visit | null): VisitDto | null {
  return v
    ? {
        id: v.id,
        start: new Date(v.start).toISOString(),
        end: new Date(v.end).toISOString(),
        title: v.title,
        all_day: v.allDay,
        via: v.via,
      }
    : null;
}

/* ------------------------------------------------------------ the name */

const NAME_WORD = /^[\p{L}][\p{L}'’.-]*$/u;
const CAPITAL = /^\p{Lu}/u;

/**
 * The client's name as the title or the guests give it — "Maria Lopez -
 * Balayage", "Balayage · Maria Lopez", "Haircut with Maria Lopez" — or
 * null. A guest's name first; else the first part of the title, split on
 * the separators booking tools use, that is two to four capitalised words
 * of letters and not a service the workspace lists. Shown in the button
 * before anything is added, so a wrong guess is seen, not saved unread.
 */
export function guessName(
  item: Pick<FeedItem, "title" | "attendees" | "organizer">,
  services: string[] = [],
): string | null {
  const svc = new Set(services.map((s) => s.trim().toLowerCase()).filter(Boolean));
  // The organiser is not the customer, so "Add … to People" never offers the
  // owner's own name -- which their CN puts on every event they organise.
  const organizer = item.organizer?.toLowerCase() || null;
  const guest = (item.attendees ?? [])
    .filter((a) => !organizer || a.email?.toLowerCase() !== organizer)
    .map((a) => (a.name ?? "").trim())
    .find((n) => n && !n.includes("@"));
  if (guest) return guest.slice(0, 80);
  const title = item.title.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  const parts = title
    .split(/\s+(?:-|–|—|·|\||:|\/)\s+|\s+(?:with|for|w\/)\s+|:\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (svc.has(part.toLowerCase())) continue;
    const words = part.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => NAME_WORD.test(w) && CAPITAL.test(w))) continue;
    if (words.some((w) => svc.has(w.toLowerCase()))) continue;
    return part;
  }
  return null;
}

/* ---------------------------------------------------- people from a feed */

/** One person an appointment names: the phone that keys them, the name as the event gives it, and the appointment it came from. */
export interface CalendarPerson {
  /** E.164. */
  phone: string;
  name: string | null;
  title: string;
  uid: string | null;
  /** Epoch ms of the appointment that named them — the soonest upcoming, else the latest past. */
  start: number;
}

/**
 * Everyone the feed names by phone inside the window — a month back, three
 * months ahead — one row per number, so the sweep and the page create each
 * person once. A name is taken from the appointment that keys the row; a
 * later appointment with a name fills in for one without.
 */
export function peopleFromItems(
  items: FeedItem[],
  services: string[],
  nowMs: number,
  window: { backDays?: number; aheadDays?: number } = {},
): CalendarPerson[] {
  const from = nowMs - (window.backDays ?? 30) * 86_400_000;
  const to = nowMs + (window.aheadDays ?? 90) * 86_400_000;
  const byPhone = new Map<string, CalendarPerson>();
  const better = (a: CalendarPerson, b: CalendarPerson): boolean => {
    // Upcoming beats past; among upcoming the soonest; among past the latest.
    const aUp = a.start >= nowMs;
    const bUp = b.start >= nowMs;
    if (aUp !== bUp) return aUp;
    return aUp ? a.start < b.start : a.start > b.start;
  };
  for (const it of items) {
    if (it.end < from || it.start > to) continue;
    // Phones only: people are made from a number, never an address (create_person),
    // so the business's own ADDRESSES have nothing to take off here.
    const phones = extractContacts(it, NO_OWN_ADDRESSES).phones;
    if (!phones.length) continue;
    const name = guessName(it, services);
    for (const phone of phones) {
      const row: CalendarPerson = { phone, name, title: it.title || "Busy", uid: it.uid, start: it.start };
      const have = byPhone.get(phone);
      if (!have) {
        byPhone.set(phone, row);
        continue;
      }
      if (better(row, have)) byPhone.set(phone, { ...row, name: row.name ?? have.name });
      else if (!have.name && row.name) byPhone.set(phone, { ...have, name: row.name });
    }
  }
  return [...byPhone.values()].sort((a, b) => a.start - b.start);
}

/* ------------------------------------------------- asked, then booked */

/** Of the people who wrote or called in the period, how many have an appointment on the calendar. */
/**
 * What a refusal from `create_person` means for the rest of the batch.
 *
 * `22023` is the door's own refusal of THIS row — a phone that is not in
 * international form, or a name over 80 characters (00052_create_person.sql).
 * The appointments behind it are innocent: skipping costs one person, and
 * stopping costs everyone after them. Stopping is what the calendar read used
 * to do, so a single short code on the calendar silently kept every later
 * person out of People for as long as it stayed there, leaving one line in a
 * log nobody reads.
 *
 * Every other code fails identically for every row — `28000` not signed in,
 * `P0002` no membership, `42501` the grant gone, `PGRST202` the function
 * gone — so spending forty more calls proving it during a page load helps
 * nobody. An absent code is treated as systemic too: unknown means unproven,
 * and the safe unknown is the one that does less.
 */
export function afterPersonRefused(code: string | null | undefined): "skip" | "stop" {
  return code === "22023" ? "skip" : "stop";
}

export interface BookingReportDto {
  calendar: "ok" | "unavailable" | "none";
  days: number;
  asked: number;
  booked: number;
}

export interface BookingReportVM {
  /** False without a readable calendar: nothing to count against. */
  present: boolean;
  /** Where the count came from: a calendar that was read, one that could not be read, or none connected. */
  calendar: "ok" | "unavailable" | "none";
  /** "12 of 40 booked" */
  headline: string;
  sub: string;
  /** What the share is of, for a page that draws the share itself (the sub is the share and these words); empty when nothing was counted. */
  words: string;
  pct: number | null;
  asked: number;
  booked: number;
  /** Of the ones who asked, how many still have nothing on the calendar. */
  unbooked: number;
  /** The share's other side, as a sentence of its own: "10 of the 26 who asked have nothing on the calendar yet",
   *  or the good news when everybody booked. Empty when there is nothing to count. */
  rest: string;
}

/**
 * Whether someone who reached out has an appointment that answers it: one
 * upcoming, or one held since they got in touch. The conversion Chanlytics
 * counts is the booking, not a stage somebody moved a card into.
 */
export function bookedAfterAsk(visits: Visits | null | undefined, askedMs: number): boolean {
  if (!visits) return false;
  if (visits.next) return true;
  return !!visits.last && visits.last.start >= askedMs - 86_400_000;
}

export function toBookingReportVM(dto: BookingReportDto | null | undefined): BookingReportVM {
  if (!dto || dto.calendar === "none")
    return {
      present: false,
      calendar: "none",
      headline: "—",
      sub: "Connect your calendar under Settings › Business to see who booked.",
      words: "",
      pct: null,
      asked: 0,
      booked: 0,
      unbooked: 0,
      rest: "",
    };
  if (dto.calendar === "unavailable")
    return {
      present: false,
      calendar: "unavailable",
      headline: "—",
      sub: "Your calendar could not be read.",
      words: "",
      pct: null,
      asked: dto.asked,
      booked: 0,
      unbooked: 0,
      rest: "",
    };
  if (dto.asked === 0)
    return {
      present: true,
      calendar: "ok",
      headline: "Nobody asked",
      sub: `nobody wrote or called in the last ${dto.days} days`,
      words: "",
      pct: null,
      asked: 0,
      booked: 0,
      unbooked: 0,
      rest: "",
    };
  const pct = Math.round((dto.booked / dto.asked) * 100);
  const words = `of the people who wrote or called in the last ${dto.days} days have an appointment on the calendar`;
  const unbooked = dto.asked - dto.booked;
  return {
    present: true,
    calendar: "ok",
    headline: `${dto.booked} of ${dto.asked} booked`,
    sub: `${pct}% ${words}`,
    words,
    pct,
    asked: dto.asked,
    booked: dto.booked,
    unbooked,
    // The other side of the same share, said once: who is still waiting to be
    // given a time. It is the half an owner can do something about.
    rest:
      unbooked === 0
        ? `Everyone who asked in the last ${dto.days} days has an appointment.`
        : `${unbooked} of the ${dto.asked} who asked ${unbooked === 1 ? "has" : "have"} nothing on the calendar yet.`,
  };
}
