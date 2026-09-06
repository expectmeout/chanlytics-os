import "server-only";
import {
  AppError,
  eventText,
  extractContacts,
  feedSourceLabel,
  bookedAfterAsk,
  freeWindows,
  guessName,
  indexFeed,
  isDayKey,
  matchPerson,
  mondayOf,
  parseIcs,
  parseTenantConfig,
  peopleFromItems,
  shiftKey,
  toVisitDto,
  zoneMidnight,
  type BookingRulesLike,
  type CalendarDayDto,
  type CalendarItemDto,
  type CalendarWeekDto,
  type FeedItem,
  type PersonLike,
  type PersonRowDto,
  type PersonVisitsDto,
  type VisitDto,
  allVisitsIn,
  type BookingReportDto,
  type ParsedFeed,
  visitsIn,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { tenantFacts } from "@/server/tenant";
import { listPeople } from "@/server/people";
import { loadFeed } from "@/server/ask/openings";

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
 * The feed parsed once per fetch. The board, a profile, the People list and
 * the report all read it; `loadFeed` caches the text for a few minutes and
 * this caches its parse for as long as the text is the same one.
 */
const parsedFeeds = new Map<string, { text: string; tz: string; parsed: ParsedFeed }>();

async function parsedFeedFor(tenantId: string, url: string, tz: string, now: Date): Promise<{ parsed: ParsedFeed; at: number } | null> {
  const feed = await loadFeed(tenantId, url);
  if (!feed) return null;
  const hit = parsedFeeds.get(tenantId);
  if (hit && hit.text === feed.text && hit.tz === tz) return { parsed: hit.parsed, at: feed.at };
  const parsed = parseIcs(feed.text, tz, { horizon: { from: now.getTime() - 90 * 86_400_000, to: now.getTime() + 90 * 86_400_000 } });
  parsedFeeds.set(tenantId, { text: feed.text, tz, parsed });
  return { parsed, at: feed.at };
}

/** The workspace's calendar, as the people surfaces need it: its address (kept here), zone and name. */
async function calendarOf(ctx: RouteContext, tenantId: string): Promise<{ url: string | null; timezone: string; source: string }> {
  const [{ timezone }, { data: row, error }] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const url = parseTenantConfig(row?.config ?? null)?.calendar?.ical_url ?? null;
  // Server-side only: the address feeds the reads in this module and is never part of a response.
  return { url, timezone, source: feedSourceLabel(url) };
}

export function spanFor(from: string | null, days: number, tz: string, now: Date): { from: string; days: number } {
  const todayKey = ((): string => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    return f.format(now);
  })();
  const start = isDayKey(from) ? from : mondayOf(todayKey);
  return { from: start, days: Math.min(MAX_DAYS, Math.max(1, Math.round(days) || 7)) };
}

/** People as the matcher wants them: a human-given name (never a phone made words) and the E.164. */
export function personLike(p: Pick<PersonRowDto, "id" | "display_name" | "wa_profile_name" | "phone_e164">): PersonLike {
  return { id: p.id, name: p.display_name || p.wa_profile_name || "", phone: p.phone_e164 };
}

export function itemsToDays(items: FeedItem[], from: string, days: number, tz: string, people: PersonLike[], services: string[] = []): Array<Pick<CalendarDayDto, "key" | "items">> {
  const out: Array<Pick<CalendarDayDto, "key" | "items">> = [];
  for (let i = 0; i < days; i++) {
    const key = shiftKey(from, i);
    const dayStart = zoneMidnight(tz, key);
    const dayEnd = zoneMidnight(tz, shiftKey(key, 1));
    const rows: CalendarItemDto[] = items
      .filter((it) => it.end > dayStart && it.start < dayEnd)
      .map((it, n) => {
        const c = extractContacts(it);
        return {
          id: `${it.uid ?? "ev"}:${it.start}:${n}`,
          start: new Date(it.start).toISOString(),
          end: new Date(it.end).toISOString(),
          title: it.title,
          all_day: it.allDay,
          person: matchPerson(it, people),
          description: eventText(it.description),
          location: it.location,
          contacts: { phones: c.phones, emails: c.emails },
          guess: guessName(it, services),
        };
      });
    out.push({ key, items: rows });
  }
  return out;
}

/**
 * The people the feed names by phone who are not in People yet, added
 * through the `create_person` door — owner or operator only, which is what
 * `canAct` says; a viewer's read changes nothing. Capped per read: the
 * hourly sweep on the edge takes the rest. Never fatal to the board.
 */
async function addPeopleSeen(ctx: RouteContext, tenantId: string, items: FeedItem[], services: string[], people: PersonLike[], now: Date): Promise<PersonLike[]> {
  const have = new Set(people.map((p) => p.phone).filter(Boolean));
  const rows = peopleFromItems(items, services, now.getTime()).filter((r) => !have.has(r.phone)).slice(0, 40);
  const added: PersonLike[] = [];
  for (const r of rows) {
    // The door records the `contact.added` event itself (members cannot
    // insert events), with the appointment that named them.
    const { data, error } = await ctx.supabase.rpc("create_person", { p_tenant_id: tenantId, p_phone_e164: r.phone, p_display_name: r.name ?? "", p_source: "calendar", p_title: r.title });
    if (error) {
      console.error("calendar_person_add_failed", JSON.stringify({ tenant: tenantId, error: error.message }));
      break;
    }
    const out = data as { contact_id: string; existed: boolean };
    added.push({ id: out.contact_id, name: r.name ?? "", phone: r.phone });
  }
  return added;
}

export async function calendarWeek(ctx: RouteContext, tenantId: string, by: { from: string | null; days: number }, now = new Date(), opts: { canAct?: boolean } = {}): Promise<CalendarWeekDto> {
  const { timezone } = await tenantFacts(ctx.supabase, tenantId);
  const span = spanFor(by.from, by.days, timezone, now);
  const { data: row, error } = await ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  const cfg = parseTenantConfig(row?.config ?? null);
  const url = cfg?.calendar?.ical_url ?? null;
  const profile = cfg?.brain?.profile ?? null;
  const rules: BookingRulesLike | null = profile?.booking_rules ?? null;
  const hours = profile?.hours ?? null;
  const closures = profile?.closures ?? [];
  const to = shiftKey(span.from, span.days - 1);

  const base: CalendarWeekDto = {
    timezone,
    from: span.from,
    to,
    feed: { present: !!url, source: feedSourceLabel(url), state: url ? "unavailable" : "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    hours,
    closures,
    rules,
    // The services as Settings keeps them: how long each takes (the assistant
    // sizes windows by it) and which need a consultation first.
    services: (profile?.services ?? []).map((s) => ({
      name: s.name,
      duration_min: typeof s.duration_min === "number" ? s.duration_min : null,
      consult_first: (profile?.booking_rules?.consult_first ?? []).some((c: string) => c.trim().toLowerCase() === s.name.trim().toLowerCase()),
    })),
    booking_link: cfg?.brain?.booking_link ?? null,
    days: Array.from({ length: span.days }, (_, i) => ({ key: shiftKey(span.from, i), items: [], windows: [] })),
  };
  if (!url) return base;

  // One parse per fetch, shared with the profile, the People list and the
  // report. Its horizon — ninety days either side — covers any span the page
  // asks for and the openings' reach from now, so the windows are the
  // receptionist's own, never computed from a feed cut short.
  let feed;
  try {
    feed = await parsedFeedFor(tenantId, url, timezone, now);
  } catch (e) {
    console.error("calendar_parse_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
    feed = null;
  }
  if (!feed) return base;
  const parsed = feed.parsed;
  const serviceNames = (profile?.services ?? []).map((s) => s.name);
  const people = (await listPeople(ctx, tenantId).catch(() => [])).map(personLike);
  // The people this feed names are put in People here, so the board an
  // owner is looking at already links to them; the hourly sweep does the
  // same for everyone else, and for a feed nobody opens.
  if (opts.canAct) people.push(...await addPeopleSeen(ctx, tenantId, parsed.items, serviceNames, people, now).catch((e: unknown) => { console.error("calendar_people_seen_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) })); return []; }));
  const days = itemsToDays(parsed.items, span.from, span.days, timezone, people, serviceNames);
  const openings = profile ? freeWindows({ hours: profile.hours, closures: profile.closures, tz: timezone, busy: parsed.busy, rules, now }) : [];
  const windowsOf = new Map(openings.map((o) => [o.key, o.windows]));
  return {
    ...base,
    feed: { present: true, source: feedSourceLabel(url), state: "ok", read_at: new Date(feed.at).toISOString(), events: parsed.events, recurring_expanded: parsed.recurringExpanded, skipped_recurring: parsed.skippedRecurring },
    days: days.map((d) => ({ ...d, windows: (windowsOf.get(d.key) ?? []).map((w) => ({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() })) })),
  };
}

/* ---- A feed checked before it is saved ---- */

export interface FeedPreview {
  ok: true;
  events: number;
  recurring_expanded: number;
  skipped_recurring: number;
  /** The next few taken blocks, in the business's zone words. */
  next: Array<{ start: string; end: string; title: string }>;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

/** Only an address on the public internet, over https; a feed's own words are never trusted as anything but text. */
export function feedUrlOk(raw: string): string | null {
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (PRIVATE_HOST.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return null;
  return u.toString();
}

export async function previewFeed(url: string, tz: string, now = new Date()): Promise<FeedPreview> {
  const safe = feedUrlOk(url);
  if (!safe) throw new AppError("validation", "The calendar feed needs to be a full https:// or webcal:// address on the internet.");
  let text: string;
  try {
    const res = await fetch(safe, { signal: AbortSignal.timeout(8_000), headers: { accept: "text/calendar, */*" }, redirect: "follow" });
    if (!res.ok) throw new AppError("upstream_meta", `The calendar answered ${res.status}. Check the address — it is usually the private iCal link, not the calendar's web page.`, 502);
    text = await res.text();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("upstream_meta", "The calendar could not be reached. Check the address and try again.", 502);
  }
  if (text.length > 2_000_000) throw new AppError("validation", "That feed is too large to read.");
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new AppError("validation", "That address is not an iCal feed. In Google Calendar it is Settings › your calendar › Secret address in iCal format.");
  const parsed = parseIcs(text, tz, { horizon: { from: now.getTime() - 86_400_000, to: now.getTime() + 30 * 86_400_000 } });
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const next = parsed.items
    .filter((it) => it.end >= now.getTime())
    .sort((a, b) => a.start - b.start)
    .slice(0, 3)
    .map((it) => ({ start: f.format(new Date(it.start)), end: new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(it.end)), title: it.title || "Busy" }));
  return { ok: true, events: parsed.events, recurring_expanded: parsed.recurringExpanded, skipped_recurring: parsed.skippedRecurring, next };
}

/* ---- One person's appointments, for their profile ---- */

/**
 * The next and last appointment for one person, read from the same feed
 * with the same match the board uses. Null when the workspace has no
 * calendar; "unavailable" when it has one that could not be read. Ninety
 * days back and sixty ahead: a last visit worth naming, and a next one
 * booked past the receptionist's own offering window.
 */
export async function personVisits(ctx: RouteContext, tenantId: string, person: PersonLike, now = new Date()): Promise<PersonVisitsDto | null> {
  const { url, timezone, source } = await calendarOf(ctx, tenantId);
  if (!url) return null;
  let feed;
  try {
    feed = await parsedFeedFor(tenantId, url, timezone, now);
  } catch (e) {
    console.error("calendar_parse_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
    feed = null;
  }
  if (!feed) return { timezone, source, state: "unavailable", next: null, last: null };
  const index = indexFeed(feed.parsed.items);
  const v = visitsIn(index, person, now.getTime());
  // The timeline wants them all; a season either side is what the parse holds.
  const all = allVisitsIn(index, person).map((x) => toVisitDto(x) as VisitDto).slice(-60);
  return { timezone, source, state: "ok", next: toVisitDto(v.next), last: toVisitDto(v.last), all };
}

/* ---- Everyone's appointments, for the list and the report ---- */

export interface PeopleVisits {
  calendar: { state: "ok" | "unavailable" | "none"; source: string; timezone: string };
  /** By contact id; absent without a readable calendar. */
  visits: Map<string, PersonVisitsDto>;
}

/**
 * The next and last appointment of everyone on the list, from one parsed
 * feed indexed once — the number first, the whole name second — so a list
 * of hundreds costs one read of the calendar, not hundreds.
 */
export async function peopleVisits(ctx: RouteContext, tenantId: string, rows: PersonRowDto[], now = new Date()): Promise<PeopleVisits> {
  const { url, timezone, source } = await calendarOf(ctx, tenantId);
  const visits = new Map<string, PersonVisitsDto>();
  if (!url) return { calendar: { state: "none", source, timezone }, visits };
  let feed;
  try {
    feed = await parsedFeedFor(tenantId, url, timezone, now);
  } catch (e) {
    console.error("calendar_parse_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
    feed = null;
  }
  if (!feed) return { calendar: { state: "unavailable", source, timezone }, visits };
  const index = indexFeed(feed.parsed.items);
  const nowMs = now.getTime();
  for (const r of rows) {
    const v = visitsIn(index, personLike(r), nowMs);
    visits.set(r.id, { timezone, source, state: "ok", next: toVisitDto(v.next), last: toVisitDto(v.last) });
  }
  return { calendar: { state: "ok", source, timezone }, visits };
}

/** The rows with their appointments attached, the way the People list and the assistant read them. */
export async function withVisits(ctx: RouteContext, tenantId: string, rows: PersonRowDto[], now = new Date()): Promise<{ people: PersonRowDto[]; calendar: PeopleVisits["calendar"] }> {
  const pv = await peopleVisits(ctx, tenantId, rows, now).catch((e: unknown) => {
    console.error("people_visits_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
    return null;
  });
  if (!pv) return { people: rows.map((r) => ({ ...r, visits: null })), calendar: { state: "none", source: "your calendar", timezone: "UTC" } };
  return {
    people: rows.map((r) => ({ ...r, visits: pv.calendar.state === "ok" ? (pv.visits.get(r.id) ?? null) : pv.calendar.state === "unavailable" ? { timezone: pv.calendar.timezone, source: pv.calendar.source, state: "unavailable", next: null, last: null } : null })),
    calendar: pv.calendar,
  };
}

/**
 * Asked, then booked: of the people who wrote or called in the period, how
 * many have an appointment on the calendar — upcoming, or held since they
 * reached out. The one conversion line Reports carries.
 */
export async function bookingReport(ctx: RouteContext, tenantId: string, rows: PersonRowDto[], days: number, now = new Date()): Promise<BookingReportDto> {
  const pv = await peopleVisits(ctx, tenantId, rows, now);
  const nowMs = now.getTime();
  const since = nowMs - days * 86_400_000;
  let asked = 0;
  let booked = 0;
  for (const r of rows) {
    // Their message, or the call they placed — never a call the owner made.
    const cands = [r.last_inbound_at, r.last_inbound_call_at ?? null].map((x) => (x ? Date.parse(x) : NaN)).filter((x) => Number.isFinite(x));
    if (!cands.length) continue;
    const askedMs = Math.max(...cands);
    if (askedMs < since) continue;
    asked += 1;
    const v = pv.visits.get(r.id);
    if (v && bookedAfterAsk({ next: v.next ? { ...v.next, start: Date.parse(v.next.start), end: Date.parse(v.next.end), allDay: v.next.all_day } : null, last: v.last ? { ...v.last, start: Date.parse(v.last.start), end: Date.parse(v.last.end), allDay: v.last.all_day } : null }, askedMs)) booked += 1;
  }
  return { calendar: pv.calendar.state, days, asked, booked };
}
