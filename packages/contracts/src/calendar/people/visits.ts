/** People: visits. */

import { dayInZone, dayPlusInZone } from "../../shared/zone/math";
import type { FeedItem } from "../feed";
import type { EarlierVisitsDto } from "../dto";
import { normalizeEmail } from "../../shared/email-address";
import { dateFormat, DAY_MS } from "../../shared/time";
import { NO_OWN_ADDRESSES, extractContacts, type MatchVia, type Visit, type Visits } from "./matching";

/** ISO or ms → ms. */
const ms = (t: number | string): number => (typeof t === "number" ? t : Date.parse(t));

/** "Tue, Sep 8" — or "Today" / "Tomorrow" by the business's clock. */
export function visitDay(start: number | string, tz: string, nowMs: number): string {
  const key = dayInZone(tz, ms(start)).key;
  const today = dayInZone(tz, nowMs).key;
  const tomorrow = dayPlusInZone(tz, nowMs, 1).key;
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  return dateFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(
    new Date(ms(start)),
  );
}

/** "2:00 – 5:00 PM", or "all day". */
export function visitTime(
  values: { start: number | string; end: number | string; allDay?: boolean; all_day?: boolean },
  tz: string,
): string {
  if (values.allDay || values.all_day) return "all day";
  const f = dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const a = f.format(new Date(ms(values.start)));
  const b = f.format(new Date(ms(values.end)));
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} – ${b}`;
}

/** "Tue, Sep 8 · 2:00 – 5:00 PM" */
/** "2026-09-08" — the day a visit falls on, by the calendar's own clock. */
export function visitDateKey(start: number | string, tz: string): string {
  return dayInZone(tz, ms(start)).key;
}

/** "2:00 PM" — the start alone, for a reminder's sentence. */
export function visitStartTime(
  values: { start: number | string; allDay?: boolean; all_day?: boolean },
  tz: string,
): string {
  if (values.allDay || values.all_day) return "all day";
  return dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms(values.start)));
}

export function visitLine(
  values: { start: number | string; end: number | string; allDay?: boolean; all_day?: boolean },
  tz: string,
  nowMs: number,
): string {
  return `${visitDay(values.start, tz, nowMs)} · ${visitTime(values, tz)}`;
}

/**
 * The receptionist's lines about a caller's appointments — facts from the
 * calendar, with the rule that nothing is changed from here. A match by
 * name alone says so, so the receptionist confirms it is them before it
 * reads details back. With no booking link to send (the first run's
 * decision 2), a change goes to the team.
 */
export function describeVisits(
  visits: Visits,
  tz: string,
  nowMs: number,
  opts: { hasBookingLink: boolean },
): string | null {
  const out: string[] = [];
  if (visits.next) {
    const n = visits.next;
    out.push(
      `Their next appointment on the calendar: ${visitLine(n, tz, nowMs)} (${n.title}).${n.via === "name" ? " Matched by name only — make sure it is them before confirming details." : n.via === "business" ? " Matched by their business only — make sure it is them before confirming details." : ""} If they ask, confirm it; to change or cancel it, ${opts.hasBookingLink ? "send the booking link" : "say the team will follow up"} — nothing is changed from here.`,
    );
  }
  if (visits.last) {
    const l = visits.last;
    out.push(
      `Their last visit on the calendar: ${dateFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(l.start))} (${l.title}).`,
    );
  }
  return out.length ? out.join(" ") : null;
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
  /** The appointment's key (Visit.key), which a reminder keeps to ask its row again when it goes. Absent on an older read. */
  key?: string;
  /** What a member said became of it (decision 0002 step 8): kept or missed. Absent while it stands, and on an older read. */
  said?: "kept" | "missed";
  /** The id of the record's row for it (Visit.recordId): the visit's own address on the Calendar. Absent for an event the sync has not kept, and on an older read. */
  record_id?: string;
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
  /** The visits within a few days of the read, by start (Visits.near): what a day-keyed moment reads. Absent on an older read. */
  near?: VisitDto[];
  /** The latest visit a member said they missed (Visits.missed), or null. Absent on an older read. */
  missed?: VisitDto | null;
  /** The record's count of their visits from before the season (R7); absent on the list, with none, and on an older read. */
  earlier?: EarlierVisitsDto;
}

/**
 * A person's visits as they stand at `nowMs`, not at the read (visitsIn's split, again): an ended next is their last where
 * later than the read's, and the next is the first not ended of those carried (`all`, else `near`), never a missed one.
 */
export function visitsAt<V extends PersonVisitsDto>(value: V | null, nowMs: number): V | null {
  if (!value?.next || !(Date.parse(value.next.end) < nowMs)) return value;
  const ended = value.next;
  const ahead = (value.all ?? value.near ?? [])
    .filter((x) => x.said !== "missed" && x.id !== ended.id && Date.parse(x.end) >= nowMs)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const last = !value.last || Date.parse(ended.end) > Date.parse(value.last.end) ? ended : value.last;
  return { ...value, next: ahead.at(0) ?? null, last };
}

export function toVisitDto(visit: Visit | null): VisitDto | null {
  return visit
    ? {
        id: visit.id,
        start: new Date(visit.start).toISOString(),
        end: new Date(visit.end).toISOString(),
        title: visit.title,
        all_day: visit.allDay,
        via: visit.via,
        ...(visit.key ? { key: visit.key } : {}),
        ...(visit.said ? { said: visit.said } : {}),
        ...(visit.recordId ? { record_id: visit.recordId } : {}),
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
  /** The one address the appointment carried beside the one number, else null: two addresses are nobody's. */
  email: string | null;
}

/**
 * Everyone the feed names by phone inside the window — a month back, three
 * months ahead — one row per number, so the sweep and the page create each
 * person once. A name is taken from the appointment that keys the row; a
 * later appointment with a name fills in for one without, and so does the
 * one address an appointment carried beside its one number — unless that
 * address rode beside another number anywhere in the feed, when it is nobody's.
 */
export function peopleFromItems(
  items: FeedItem[],
  services: string[],
  nowMs: number,
  window: { backDays?: number; aheadDays?: number } = {},
): CalendarPerson[] {
  const from = nowMs - (window.backDays ?? 30) * DAY_MS;
  const to = nowMs + (window.aheadDays ?? 90) * DAY_MS;
  const byPhone = new Map<string, CalendarPerson>();
  // Every number each address rode with, across the feed. An address beside one customer's number on one
  // appointment and beside another's on the next -- a co-host among the guests, a booking page's "email hello@…"
  // in every description -- is nobody's, not the first customer's with a refusal (23505) for everyone after.
  const ridersOf = new Map<string, Set<string>>();
  const better = (a: CalendarPerson, b: CalendarPerson): boolean => {
    // Upcoming beats past; among upcoming the soonest; among past the latest.
    const aUp = a.start >= nowMs;
    const bUp = b.start >= nowMs;
    if (aUp !== bUp) return aUp;
    return aUp ? a.start < b.start : a.start > b.start;
  };
  for (const it of items) {
    if (it.end < from || it.start > to) continue;
    // People are made from a number, never an address (create_person); an address rides along for the person the
    // number names. The business's own ADDRESSES are not taken off here -- the sweep and the board pass none. The
    // case that happened, an own address on every appointment, rides with many numbers and is nobody's below; a
    // lone one beside a single customer's number on a feed of one appointment is not caught.
    const found = extractContacts(it, NO_OWN_ADDRESSES);
    const phones = found.phones;
    if (!phones.length) continue;
    for (const e of found.emails) {
      const riders = ridersOf.get(e) ?? new Set<string>();
      for (const phone of phones) riders.add(phone);
      ridersOf.set(e, riders);
    }
    // One number and one address name one person; an event with two addresses names nobody's. Through the one
    // normalizer every writer of an address goes through (00125), so what rides along is what People can hold.
    const email = phones.length === 1 && found.emails.length === 1 ? normalizeEmail(found.emails[0]) : null;
    const name = guessName(it, services);
    for (const phone of phones) {
      const row: CalendarPerson = { phone, name, title: it.title || "Busy", uid: it.uid, start: it.start, email };
      const have = byPhone.get(phone);
      if (!have) {
        byPhone.set(phone, row);
        continue;
      }
      // The better appointment keys the row; a name or an address the other carried fills in where it has none.
      const [keep, other] = better(row, have) ? [row, have] : [have, row];
      byPhone.set(phone, { ...keep, name: keep.name ?? other.name, email: keep.email ?? other.email });
    }
  }
  // The address is the normalizer's spelling of the match it was counted under, so the two agree.
  return [...byPhone.values()]
    .map((r) => (r.email && (ridersOf.get(r.email)?.size ?? 0) > 1 ? { ...r, email: null } : r))
    .sort((a, b) => a.start - b.start);
}

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
  // 22023: the door refused this number's shape. PE001: this number's person asked to be forgotten (00331). Either
  // is one person, not everyone behind them.
  return code === "22023" || code === "PE001" ? "skip" : "stop";
}
