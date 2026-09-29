/**
 * The workspace's calendar as its settings name it: settings that will not parse told apart from a workspace without
 * a calendar (readSettings), and the lookup a profile, the People list and the report start from (calendarOf). The
 * board reads the same settings itself, in calendar-week.ts.
 */
import "server-only";
import {
  feedSourceLabel,
  parseTenantConfigResult,
  type BusinessProfile,
  type TenantConfig,
  ownAddressesOf,
  type OwnAddresses,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { tenantFacts } from "@/server/tenant";
import { log } from "@/server/log";

/**
 * Settings that will not parse are a READ THAT FAILED, not a workspace without a calendar.
 *
 * parseTenantConfig is documented as being "for callers that genuinely cannot act on the difference". Every
 * caller in this file CAN act on it, and the difference is the whole point: ONE malformed field (not an unknown
 * one, which the read leaves out) refuses the whole row and takes the calendar address down with it. Reported as "none",
 * that is indistinguishable from a workspace that never connected a calendar -- so the surfaces went quiet
 * instead of saying anything, and a bad config row survived two rounds of being looked straight at.
 *
 * Absent and broken are different things. Only absent is silent.
 *
 * `lostCalendar` is narrower than "the config did not parse", on purpose. A row can be refused over something
 * that has nothing to do with the calendar — a `brain` missing one of its required fields refuses the whole
 * row — and a workspace that never connected a calendar is not missing one. So the raw JSON is asked the one
 * question the schema can no longer answer: is an address in there? Yes, and we could not reach it: that is
 * news, said out loud. No: nothing was lost, stay quiet, and the log still has the issues either way.
 */
export function readSettings(tenantId: string, raw: unknown): { cfg: TenantConfig | null; lostCalendar: boolean } {
  const r = parseTenantConfigResult(raw);
  if (r.ok) return { cfg: r.config, lostCalendar: false };
  const named = (raw as { calendar?: { ical_url?: unknown } } | null)?.calendar?.ical_url;
  const lostCalendar = typeof named === "string" && named.trim() !== "";
  log.error("tenant_config_unreadable", { tenant: tenantId, lostCalendar, issues: r.issues.slice(0, 8) });
  return { cfg: null, lostCalendar };
}

/**
 * The workspace's calendar, as the people surfaces need it: its address (kept here), zone and name — and the
 * booking link, which a row may offer. `lostCalendar` is true when the settings would not parse AND they name
 * a calendar, which is why a null url is not always "no calendar" (see readSettings). `known`: the zone and the raw
 * settings, handed in by a caller that read them this turn (readers/report.ts), so neither is read again; without it,
 * both are read here.
 */
export async function calendarOf(
  ctx: RouteContext,
  tenantId: string,
  known?: { timezone: string; config: unknown },
): Promise<{
  url: string | null;
  lostCalendar: boolean;
  timezone: string;
  source: string;
  bookingLink: string | null;
  own: OwnAddresses;
  /** The business's profile: its services, and the rules that say which need a consultation first. Null without one. */
  profile: BusinessProfile | null;
}> {
  let timezone: string;
  let raw: unknown;
  if (known) {
    timezone = known.timezone;
    raw = known.config;
  } else {
    const [facts, { data: row, error }] = await Promise.all([
      tenantFacts(ctx.supabase, tenantId),
      ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    timezone = facts.timezone;
    raw = row?.config ?? null;
  }
  const { cfg, lostCalendar } = readSettings(tenantId, raw);
  const url = cfg?.calendar?.ical_url ?? null;
  const bookingLink = cfg?.brain?.booking_link?.trim() || null;
  // Server-side only: the address feeds the reads in this module and is never part of a response.
  // The business's own addresses (contracts ownAddressesOf): where it is alerted,
  // and whose calendar this is. Never a customer's, so never anybody's visit.
  return {
    url,
    lostCalendar,
    timezone,
    source: feedSourceLabel(url),
    bookingLink,
    own: ownAddressesOf(cfg),
    profile: cfg?.brain?.profile ?? null,
  };
}
