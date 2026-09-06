/**
 * The people in a calendar: who an appointment is for, read from the words
 * a booking tool wrote into the owner's calendar and matched against People.
 *
 * Booksy, Square, Fresha, Acuity and Google's own appointment schedules all
 * put the client's name and the service in the title; some add a phone or
 * an email in the description, and a booking made through Google adds the
 * booker as a guest. None of it is structured, so the match goes by
 * evidence: a phone number found anywhere in the event beats a name, and a
 * name only counts when it is a whole saved name of four letters or more.
 * An email is carried for the panel; People holds no email to match yet.
 *
 * Pure. The dashboard's calendar, the person's profile, both receptionists
 * and the tests share it, so an appointment is the same person everywhere.
 */
import { dayInZone, type FeedItem } from "./availability";
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
}

export interface PersonMatch {
  id: string;
  name: string;
  via: "phone" | "name";
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
  if (bare && !s.startsWith("+") && !(digits.length === 10 || (digits.length === 11 && digits.startsWith("1")))) return null;
  return normalizePhone(s.startsWith("+") ? `+${digits}` : digits);
}

/** The phones, emails and guest names an event carries, wherever they were written. */
export function extractContacts(item: Pick<FeedItem, "title" | "description" | "location" | "attendees">): EventContacts {
  const text = [item.title, item.description ?? "", item.location ?? ""].join("\n");
  const emails = new Set<string>();
  for (const m of text.match(EMAIL_RE) ?? []) emails.add(m.toLowerCase());
  for (const a of item.attendees ?? []) if (a.email) emails.add(a.email.toLowerCase());
  const phones = new Set<string>();
  // Emails out first: the digits in "maria2026@gmail.com" are not a phone.
  for (const m of text.replace(EMAIL_RE, " ").match(PHONE_RE) ?? []) {
    const p = phoneFrom(m);
    if (p) phones.add(p);
  }
  const names = new Set<string>();
  for (const a of item.attendees ?? []) {
    const n = (a.name ?? "").trim();
    if (n && !EMAIL_RE.test(n)) names.add(n);
    EMAIL_RE.lastIndex = 0;
  }
  return { phones: [...phones], emails: [...emails], names: [...names] };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A person whose whole name the text carries: four letters or more, on word
 * edges ("Dani" is not in "Daniela"), the longest match when several fit.
 * Never a bare number, never a name that is only a phone made words.
 */
export function personInText(text: string, people: PersonLike[]): PersonLike | null {
  let best: PersonLike | null = null;
  for (const p of people) {
    const n = p.name.trim();
    if (n.length < 4 || /^[+\d(]/.test(n)) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}(?=$|[^\\p{L}\\p{N}])`, "iu");
    if (re.test(text) && (!best || n.length > best.name.trim().length)) best = p;
  }
  return best;
}

const labelOf = (p: PersonLike): string => p.name.trim() || formatPhoneDisplay(p.phone) || "Unknown";

/** Who the appointment is for: a phone in the event first, then a whole name in its title, guests or description. */
export function matchPerson(item: Pick<FeedItem, "title" | "description" | "location" | "attendees">, people: PersonLike[]): PersonMatch | null {
  const c = extractContacts(item);
  if (c.phones.length) {
    const byPhone = new Map<string, PersonLike>();
    for (const p of people) if (p.phone) byPhone.set(p.phone, p);
    for (const ph of c.phones) {
      const p = byPhone.get(ph);
      if (p) return { id: p.id, name: labelOf(p), via: "phone" };
    }
  }
  const p = personInText([item.title, ...c.names, item.description ?? ""].join("\n"), people);
  return p ? { id: p.id, name: labelOf(p), via: "name" } : null;
}

/* ---------------------------------------------------------------- visits */

export interface Visit {
  id: string;
  /** Epoch ms. */
  start: number;
  end: number;
  title: string;
  allDay: boolean;
  via: "phone" | "name";
}

export interface Visits {
  /** The first appointment that has not ended. */
  next: Visit | null;
  /** The latest one that has. */
  last: Visit | null;
}

/** One person's next and last appointment in a parsed feed. */
export function visitsOf(items: FeedItem[], person: PersonLike, nowMs: number): Visits {
  let next: Visit | null = null;
  let last: Visit | null = null;
  for (const it of items) {
    const m = matchPerson(it, [person]);
    if (!m) continue;
    const v: Visit = { id: it.uid ? `${it.uid}:${it.start}` : `ev:${it.start}`, start: it.start, end: it.end, title: it.title || "Busy", allDay: it.allDay, via: m.via };
    if (it.end >= nowMs) { if (!next || v.start < next.start) next = v; }
    else if (!last || v.end > last.end) last = v;
  }
  return { next, last };
}

/** ISO or ms → ms. */
const ms = (t: number | string): number => (typeof t === "number" ? t : Date.parse(t));

/** "Tue, Sep 8" — or "Today" / "Tomorrow" by the business's clock. */
export function visitDay(start: number | string, tz: string, nowMs: number): string {
  const key = dayInZone(tz, ms(start)).key;
  const today = dayInZone(tz, nowMs).key;
  const tomorrow = dayInZone(tz, nowMs + 86_400_000).key;
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(ms(start)));
}

/** "2:00 – 5:00 PM", or "all day". */
export function visitTime(v: { start: number | string; end: number | string; allDay?: boolean; all_day?: boolean }, tz: string): string {
  if (v.allDay || v.all_day) return "all day";
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const a = f.format(new Date(ms(v.start)));
  const b = f.format(new Date(ms(v.end)));
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} – ${b}`;
}

/** "Tue, Sep 8 · 2:00 – 5:00 PM" */
export function visitLine(v: { start: number | string; end: number | string; allDay?: boolean; all_day?: boolean }, tz: string, nowMs: number): string {
  return `${visitDay(v.start, tz, nowMs)} · ${visitTime(v, tz)}`;
}

/**
 * The receptionist's lines about a caller's appointments — facts from the
 * calendar, with the rule that nothing is changed from here. A match by
 * name alone says so, so the receptionist confirms it is them before it
 * reads details back.
 */
export function describeVisits(visits: Visits, tz: string, nowMs: number): string | null {
  const out: string[] = [];
  if (visits.next) {
    const n = visits.next;
    out.push(`Their next appointment on the calendar: ${visitLine(n, tz, nowMs)} (${n.title}).${n.via === "name" ? " Matched by name only — make sure it is them before confirming details." : ""} If they ask, confirm it; to change or cancel it, send the booking link — nothing is changed from here.`);
  }
  if (visits.last) {
    const l = visits.last;
    out.push(`Their last visit on the calendar: ${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(l.start))} (${l.title}).`);
  }
  return out.length ? out.join(" ") : null;
}

/* ---------------------------------------------------------------- words */

/** Which calendar the feed comes from, from its address alone — the address itself never leaves the server. */
export function feedSourceLabel(url: string | null | undefined): string {
  if (!url) return "your calendar";
  let host = "";
  try { host = new URL(url.replace(/^webcal:\/\//i, "https://")).hostname.toLowerCase(); } catch { return "your calendar"; }
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
    .replace(/&quot;/g, "\"")
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
  via: "phone" | "name";
}

/** A person's appointments as their profile reads them. */
export interface PersonVisitsDto {
  timezone: string;
  source: string;
  state: "ok" | "unavailable";
  next: VisitDto | null;
  last: VisitDto | null;
}

export function toVisitDto(v: Visit | null): VisitDto | null {
  return v ? { id: v.id, start: new Date(v.start).toISOString(), end: new Date(v.end).toISOString(), title: v.title, all_day: v.allDay, via: v.via } : null;
}
