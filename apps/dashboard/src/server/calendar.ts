import "server-only";
import {
  AppError,
  eventText,
  extractContacts,
  feedSourceLabel,
  freeWindows,
  guessName,
  isDayKey,
  matchPerson,
  mondayOf,
  parseIcs,
  parseTenantConfig,
  shiftKey,
  toVisitDto,
  visitsOf,
  zoneMidnight,
  type BookingRulesLike,
  type CalendarDayDto,
  type CalendarItemDto,
  type CalendarWeekDto,
  type FeedItem,
  type PersonLike,
  type PersonRowDto,
  type PersonVisitsDto,
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

export async function calendarWeek(ctx: RouteContext, tenantId: string, by: { from: string | null; days: number }, now = new Date()): Promise<CalendarWeekDto> {
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

  const feed = await loadFeed(tenantId, url);
  if (!feed) return base;

  // The horizon covers the span AND the openings' reach from now, so the
  // windows are the receptionist's own — never computed from a feed cut
  // short of what it would see.
  const daysAhead = rules?.max_days_ahead ?? 14;
  const spanStart = zoneMidnight(timezone, span.from);
  const spanEnd = zoneMidnight(timezone, shiftKey(to, 1));
  const horizon = { from: Math.min(spanStart, now.getTime()) - 86_400_000, to: Math.max(spanEnd, now.getTime() + (daysAhead + 1) * 86_400_000) };
  let parsed;
  try {
    parsed = parseIcs(feed.text, timezone, { horizon });
  } catch (e) {
    console.error("calendar_parse_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
    return { ...base, feed: { ...base.feed, read_at: new Date(feed.at).toISOString() } };
  }
  const people = (await listPeople(ctx, tenantId).catch(() => [])).map(personLike);
  const days = itemsToDays(parsed.items, span.from, span.days, timezone, people, (profile?.services ?? []).map((s) => s.name));
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
  const { data: row, error } = await ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  const url = parseTenantConfig(row?.config ?? null)?.calendar?.ical_url ?? null;
  if (!url) return null;
  const { timezone } = await tenantFacts(ctx.supabase, tenantId);
  const source = feedSourceLabel(url);
  const feed = await loadFeed(tenantId, url);
  if (!feed) return { timezone, source, state: "unavailable", next: null, last: null };
  let parsed;
  try {
    parsed = parseIcs(feed.text, timezone, { horizon: { from: now.getTime() - 90 * 86_400_000, to: now.getTime() + 60 * 86_400_000 } });
  } catch (e) {
    console.error("calendar_parse_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
    return { timezone, source, state: "unavailable", next: null, last: null };
  }
  const v = visitsOf(parsed.items, person, now.getTime());
  return { timezone, source, state: "ok", next: toVisitDto(v.next), last: toVisitDto(v.last) };
}
