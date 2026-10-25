/**
 * The calendars a connected mailbox's grant reads (decision 0073, R20): every calendar of the account but the ones a
 * provider makes for everyone (holidays, birthdays, week numbers), their events over a window, each occurrence of a
 * series apart. Written out as an iCal feed (calendarIcs) so everything that reads the owner's calendar link reads this
 * the same way: the openings, a caller's visits, the hourly sweep that keeps appointments and People. Each event keeps
 * the calendar's own UID and, for an occurrence, the instant it was due, so the keys are the ones the account's own
 * iCal link would give (contracts appointment-key.ts) and a workspace that moves from its link to this keeps its rows.
 * Every call returns what it came to and never throws (provider-fetch.ts).
 */
import { HOUR_MS } from "@chanlytics/contracts";
import { providerFetch, type ProviderReply } from "../provider-fetch";
import { MAILBOX_READ_MS } from "./mailbox-read";
import { GRAPH_API } from "./mailbox-graph";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
/** Events a page: Google's most is 2,500; Graph's calendar view a hundred, which is plenty for a page. */
const GOOGLE_PAGE = "500";
const EVENTS_PAGE = 100;

type Deps = Parameters<typeof providerFetch>[3];

/** One event of the owner's calendar, as the feed writes it. */
export interface CalendarEvent {
  uid: string;
  /** Epoch ms; an all-day event's day as YYYY-MM-DD beside it. */
  start: number;
  end: number;
  allDay: boolean;
  startDay: string | null;
  endDay: string | null;
  title: string;
  description: string | null;
  location: string | null;
  attendees: Array<{ name: string | null; email: string | null }>;
  organizer: string | null;
  /** For one occurrence of a series, the instant it was due before it was moved (epoch ms); null for a single event. */
  due: number | null;
  /** Marked free on the calendar (Google's transparency, Graph's showAs free): no time is taken. */
  free: boolean;
}

/** A page of events, and where the next starts (null at the last). */
export type EventsPage =
  { ok: true; events: CalendarEvent[]; next: string | null } | { ok: false; reply: ProviderReply };

/** The calendars of an account, by id. */
export type CalendarIds = { ok: true; ids: string[] } | { ok: false; reply: ProviderReply };

/** The calendars a provider makes for every account, which hold nobody's visits. */
const EVERYONES = /#(holiday|contacts|weeknum)@group\.v\.calendar\.google\.com$/i;

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** Every calendar of a Google account the grant reads, but the ones Google makes for everyone. */
export async function googleCalendarIds(token: string, deps?: Deps): Promise<CalendarIds> {
  const r = await providerFetch(
    "google",
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&maxResults=250`,
    { headers: bearer(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") return { ok: false, reply: r };
  const items = (r.json as { items?: Array<{ id?: unknown; deleted?: unknown }> } | null)?.items ?? [];
  return {
    ok: true,
    ids: items.flatMap((c) => (typeof c.id === "string" && c.deleted !== true && !EVERYONES.test(c.id) ? [c.id] : [])),
  };
}

type GoogleWhen = { dateTime?: unknown; date?: unknown } | undefined;

/** A Google time, read: an instant, or an all-day date (midnight UTC for the instant, the day kept beside it). */
function googleWhen(w: GoogleWhen): { ms: number; day: string | null } | null {
  if (typeof w?.dateTime === "string") {
    const ms = Date.parse(w.dateTime);
    return Number.isFinite(ms) ? { ms, day: null } : null;
  }
  if (typeof w?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w.date)) {
    return { ms: Date.parse(`${w.date}T00:00:00Z`), day: w.date };
  }
  return null;
}

/** One calendar's events between two instants, a page at a time, each occurrence of a series apart. */
export async function googleEvents(
  token: string,
  calendarId: string,
  window: { from: string; to: string },
  pageToken: string | null,
  deps?: Deps,
): Promise<EventsPage> {
  const q = new URLSearchParams({
    timeMin: window.from,
    timeMax: window.to,
    singleEvents: "true",
    maxResults: GOOGLE_PAGE,
    showDeleted: "false",
  });
  if (pageToken) q.set("pageToken", pageToken);
  const r = await providerFetch(
    "google",
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`,
    { headers: bearer(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") return { ok: false, reply: r };
  const j = r.json as { items?: Array<Record<string, unknown>>; nextPageToken?: unknown } | null;
  const events: CalendarEvent[] = [];
  for (const e of j?.items ?? []) {
    if (e.status === "cancelled") continue;
    const start = googleWhen(e.start as GoogleWhen);
    const end = googleWhen(e.end as GoogleWhen);
    const uid = typeof e.iCalUID === "string" ? e.iCalUID : typeof e.id === "string" ? e.id : null;
    if (!start || !end || !uid) continue;
    const due = typeof e.recurringEventId === "string" ? googleWhen(e.originalStartTime as GoogleWhen) : null;
    const attendees = Array.isArray(e.attendees) ? (e.attendees as Array<Record<string, unknown>>) : [];
    const organizer = (e.organizer as { email?: unknown } | undefined)?.email;
    events.push({
      uid,
      start: start.ms,
      end: end.ms,
      allDay: start.day !== null,
      startDay: start.day,
      endDay: end.day,
      title: typeof e.summary === "string" ? e.summary : "",
      description: typeof e.description === "string" ? e.description : null,
      location: typeof e.location === "string" ? e.location : null,
      attendees: attendees.map((a) => ({
        name: typeof a.displayName === "string" ? a.displayName : null,
        email: typeof a.email === "string" ? a.email.toLowerCase() : null,
      })),
      organizer: typeof organizer === "string" ? organizer.toLowerCase() : null,
      due: due ? due.ms : null,
      free: e.transparency === "transparent",
    });
  }
  return { ok: true, events, next: typeof j?.nextPageToken === "string" ? j.nextPageToken : null };
}

/** Every calendar of a Microsoft 365 account the grant reads. */
export async function graphCalendarIds(token: string, deps?: Deps): Promise<CalendarIds> {
  const r = await providerFetch(
    "microsoft",
    `${GRAPH_API}/me/calendars?$select=id&$top=100`,
    { headers: bearer(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") return { ok: false, reply: r };
  const value = (r.json as { value?: Array<{ id?: unknown }> } | null)?.value ?? [];
  return { ok: true, ids: value.flatMap((c) => (typeof c.id === "string" ? [c.id] : [])) };
}

/** Half a day: an all-day event's midnight, in its own zone and asked in UTC, is within it of the day it names. */
const HALF_DAY_MS = 12 * HOUR_MS;

/**
 * A Graph time asked in UTC (Prefer outlook.timezone), read as an instant; for an all-day event, the day it names: its
 * zone's midnight said in UTC lands within half a day of that day's own, either side of the meridian.
 */
function graphWhen(w: { dateTime?: unknown } | undefined, allDay: boolean): { ms: number; day: string | null } | null {
  if (typeof w?.dateTime !== "string") return null;
  const iso = /[zZ]|[+-]\d{2}:\d{2}$/.test(w.dateTime) ? w.dateTime : `${w.dateTime}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return { ms, day: allDay ? new Date(ms + HALF_DAY_MS).toISOString().slice(0, 10) : null };
}

/** One calendar's events between two instants (its calendar view), a page at a time, each occurrence apart. */
export async function graphEvents(
  token: string,
  calendarId: string,
  window: { from: string; to: string },
  link: string | null,
  deps?: Deps,
): Promise<EventsPage> {
  const q = new URLSearchParams({
    startDateTime: window.from,
    endDateTime: window.to,
    $select:
      "iCalUId,id,subject,bodyPreview,start,end,isAllDay,location,attendees,organizer,isCancelled,showAs,type,originalStart",
    $top: String(EVENTS_PAGE),
  });
  const url = link ?? `${GRAPH_API}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${q.toString()}`;
  const r = await providerFetch(
    "microsoft",
    url,
    {
      headers: { ...bearer(token), Prefer: 'outlook.timezone="UTC"' },
      timeoutMs: MAILBOX_READ_MS,
      idempotent: true,
      tries: 2,
    },
    deps,
  );
  if (r.outcome !== "ok") return { ok: false, reply: r };
  const j = r.json as { value?: Array<Record<string, unknown>>; "@odata.nextLink"?: unknown } | null;
  const events: CalendarEvent[] = [];
  for (const e of j?.value ?? []) {
    if (e.isCancelled === true) continue;
    const allDay = e.isAllDay === true;
    const start = graphWhen(e.start as { dateTime?: unknown }, allDay);
    const end = graphWhen(e.end as { dateTime?: unknown }, allDay);
    const uid = typeof e.iCalUId === "string" ? e.iCalUId : typeof e.id === "string" ? e.id : null;
    if (!start || !end || !uid) continue;
    const series = e.type === "occurrence" || e.type === "exception";
    const due = series && typeof e.originalStart === "string" ? Date.parse(e.originalStart) : NaN;
    const attendees = Array.isArray(e.attendees)
      ? (e.attendees as Array<{ emailAddress?: Record<string, unknown> }>)
      : [];
    const organizer = (e.organizer as { emailAddress?: { address?: unknown } } | undefined)?.emailAddress?.address;
    events.push({
      uid,
      start: start.ms,
      end: end.ms,
      allDay,
      startDay: start.day,
      endDay: end.day,
      title: typeof e.subject === "string" ? e.subject : "",
      description: typeof e.bodyPreview === "string" && e.bodyPreview ? e.bodyPreview : null,
      location:
        typeof (e.location as { displayName?: unknown } | undefined)?.displayName === "string" &&
        (e.location as { displayName: string }).displayName
          ? (e.location as { displayName: string }).displayName
          : null,
      attendees: attendees.map((a) => ({
        name: typeof a.emailAddress?.name === "string" ? a.emailAddress.name : null,
        email: typeof a.emailAddress?.address === "string" ? a.emailAddress.address.toLowerCase() : null,
      })),
      organizer: typeof organizer === "string" ? organizer.toLowerCase() : null,
      due: Number.isFinite(due) ? due : series ? start.ms : null,
      free: e.showAs === "free",
    });
  }
  return { ok: true, events, next: typeof j?.["@odata.nextLink"] === "string" ? j["@odata.nextLink"] : null };
}

/* ---- the feed ---- */

/** A text value as iCal writes it (RFC 5545 3.3.11): the backslash, the semicolon, the comma and a line break escaped. */
const icsText = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** An instant as iCal's UTC form: 20261025T140000Z. */
const icsUtc = (ms: number): string =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** A line folded at 75 characters, as iCal folds one (the reader unfolds it). */
function folded(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join("\r\n");
}

/** A guest's name as a parameter: quoted, with no quote of its own inside. */
const icsParam = (s: string): string => `"${s.replace(/"/g, "'")}"`;

/**
 * The events as one iCal feed, what the owner's calendar link would have said of them: each event's UID, its time (an
 * all-day one by its days), its words, its guests and organizer, an occurrence's RECURRENCE-ID, and a free one marked
 * transparent, so the feed's reader (contracts parseIcs) takes from it exactly what it takes from a link.
 */
export function calendarIcs(events: readonly CalendarEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Chanlytics//Calendar through the mailbox//EN"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${icsText(e.uid)}`);
    if (e.allDay && e.startDay && e.endDay) {
      lines.push(
        `DTSTART;VALUE=DATE:${e.startDay.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${e.endDay.replace(/-/g, "")}`,
      );
    } else {
      lines.push(`DTSTART:${icsUtc(e.start)}`, `DTEND:${icsUtc(e.end)}`);
    }
    if (e.due !== null) lines.push(`RECURRENCE-ID:${icsUtc(e.due)}`);
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    if (e.organizer) lines.push(`ORGANIZER:mailto:${e.organizer}`);
    for (const a of e.attendees) {
      if (!a.email) continue;
      lines.push(`ATTENDEE${a.name ? `;CN=${icsParam(a.name)}` : ""}:mailto:${a.email}`);
    }
    if (e.free) lines.push("TRANSP:TRANSPARENT");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(folded).join("\r\n")}\r\n`;
}
