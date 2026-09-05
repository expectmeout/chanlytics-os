import "server-only";
import {
  describeOpenings,
  filterOpenings,
  freeWindows,
  parseIcs,
  parseTenantConfig,
  type Opening,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { tenantFacts } from "../tenant";

/**
 * Openings for the assistant and the palette's fast path, computed the way
 * the phone receptionist computes them (edge availability.ts): the calendar
 * feed's busy blocks against the business's hours, closures and booking
 * rules, in the business's zone. Read under the caller's RLS; the feed URL
 * is fetched server-side and never sent to the browser.
 */

const FEED_TTL_MS = 5 * 60 * 1000;
const FEED_MAX_BYTES = 2_000_000;
const feeds = new Map<string, { at: number; text: string }>();

async function fetchFeed(tenantId: string, url: string): Promise<string | null> {
  const hit = feeds.get(tenantId);
  if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.text;
  try {
    const res = await fetch(url.replace(/^webcal:\/\//i, "https://"), { signal: AbortSignal.timeout(8_000), headers: { accept: "text/calendar, */*" } });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const text = await res.text();
    if (text.length > FEED_MAX_BYTES) throw new Error("feed too large");
    feeds.set(tenantId, { at: Date.now(), text });
    return text;
  } catch (e) {
    console.error("ask_feed_fetch_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
    return hit?.text ?? null;
  }
}

export interface OpeningsResult {
  state: "ok" | "no_calendar" | "unavailable";
  text: string;
  tz: string;
  days: Array<{ key: string; label: string; windows: string[] }>;
  service: { name: string; duration_min?: number } | null;
}

interface ServiceLike { name: string; duration_min?: number }

/** The same match the phone tool uses: exact, contains, then shared long words. */
export function matchService(services: ServiceLike[] | undefined, asked: string | null | undefined): ServiceLike | null {
  const q = (asked ?? "").trim().toLowerCase();
  if (!q || !services?.length) return null;
  const exact = services.find((s) => s.name.toLowerCase() === q);
  if (exact) return exact;
  const contains = services.find((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()));
  if (contains) return contains;
  const words = q.split(/[^a-z0-9áéíóúñ]+/).filter((w) => w.length >= 4);
  let best: ServiceLike | null = null;
  let bestScore = 0;
  for (const s of services) {
    const own = s.name.toLowerCase().split(/[^a-z0-9áéíóúñ]+/);
    const score = words.filter((w) => own.includes(w)).length;
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

function fmtWindow(start: number, end: number, tz: string): string {
  const f = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${f.format(new Date(start))}–${f.format(new Date(end))}`;
}

export async function openingsFor(
  ctx: RouteContext,
  tenantId: string,
  by: { day?: string | null; service?: string | null },
  now = new Date(),
): Promise<OpeningsResult> {
  const { timezone } = await tenantFacts(ctx.supabase, tenantId);
  const { data: row, error } = await ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  const cfg = parseTenantConfig(row?.config ?? null);
  const url = cfg?.calendar?.ical_url;
  const profile = cfg?.brain?.profile;
  const service = matchService(profile?.services, by.service);
  if (!url || !profile) return { state: "no_calendar", text: "No calendar feed is connected, so openings cannot be read.", tz: timezone, days: [], service };
  const text = await fetchFeed(tenantId, url);
  if (text === null) return { state: "unavailable", text: "The calendar could not be read right now.", tz: timezone, days: [], service };
  let openings: Opening[];
  let daysAhead: number;
  try {
    const rules = profile.booking_rules ?? null;
    daysAhead = rules?.max_days_ahead ?? 14;
    const feed = parseIcs(text, timezone, { horizon: { from: now.getTime() - 86_400_000, to: now.getTime() + (daysAhead + 1) * 86_400_000 } });
    openings = freeWindows({ hours: profile.hours, closures: profile.closures, tz: timezone, busy: feed.busy, rules, now });
  } catch (e) {
    console.error("ask_openings_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
    return { state: "unavailable", text: "The calendar could not be read right now.", tz: timezone, days: [], service };
  }
  const picked = filterOpenings(openings, { day: by.day ?? null, minMinutes: service?.duration_min ?? null });
  const described = describeOpenings(picked, timezone, { maxDays: 3, daysAhead });
  return {
    state: "ok",
    text: service?.duration_min ? `For ${service.name} (about ${service.duration_min} minutes): ${described}` : described,
    tz: timezone,
    days: picked.slice(0, 5).map((o) => ({ key: o.key, label: o.label, windows: o.windows.slice(0, 6).map((w) => fmtWindow(w.start, w.end, timezone)) })),
    service,
  };
}
