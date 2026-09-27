import { deviceTimezone as signupDeviceTimezone } from "./signup";
import { timezoneCity } from "../shared/time";

/**
 * The workspace itself, in words.
 *
 * One field so far, and it is the one that decides what "today" means.
 * tenants.timezone has defaulted to America/New_York since 00001 with no write
 * path in the product, so every workspace on the database is still on it —
 * which for a business anywhere else means its own receptionist quotes the
 * wrong opening hours, its day rolls over at the wrong time in Reports, and
 * nothing on any screen says why.
 *
 * The rule here is that an owner should be able to CHECK the setting without
 * knowing what an IANA zone is. "America/New_York" tells them nothing;
 * "New York · 3:42 PM there now" tells them immediately whether it is right.
 */

/** The house fallback, and the value every workspace still carries. */
export const DEFAULT_TIMEZONE = "America/New_York";

/**
 * Is this a zone this machine can actually resolve?
 *
 * Intl is the only authority — a list checked into the repo goes stale every
 * time the IANA database moves a city, and Postgres cannot answer from a CHECK
 * constraint because pg_timezone_names is a set-returning function and not
 * immutable. So the database stores text and this is the gate in front of it.
 */
export function isTimezone(raw: unknown): raw is string {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}

export function cleanTimezone(raw: unknown): { ok: true; tz: string } | { ok: false; reason: string } {
  const tz = typeof raw === "string" ? raw.trim() : "";
  if (!tz) return { ok: false, reason: "Pick the timezone your business runs on." };
  // Deliberately not normalised or aliased: "US/Eastern" resolves and is a real
  // answer, and silently rewriting someone's choice to its canonical spelling
  // is a change they did not ask for and cannot see.
  if (!isTimezone(tz)) return { ok: false, reason: `${tz} is not a timezone this system knows.` };
  return { ok: true, tz };
}

/**
 * What to show beside the zone so an owner can tell at a glance whether it is
 * theirs: the local time in it, right now.
 */
export function timezoneWords(
  tz: string | null | undefined,
  nowMs: number = Date.now(),
): {
  city: string;
  zone: string;
  /** Local time in that zone, or null when the zone cannot be resolved. */
  timeThere: string | null;
  /** The one-line summary the settings row shows. */
  line: string;
} {
  const zone = tz && isTimezone(tz) ? tz : DEFAULT_TIMEZONE;
  const city = timezoneCity(zone);
  let timeThere: string | null;
  try {
    timeThere = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(nowMs));
  } catch {
    timeThere = null;
  }
  return { city, zone, timeThere, line: timeThere ? `${city} · ${timeThere} there now` : city };
}

/**
 * What else a zone is found by in the picker: the cities and states people type, which a zone's own name ("America/
 * New_York") does not say -- "Search for a city" found nothing for "Miami". Only the zones US and Canadian businesses
 * run on and a few more; every other zone is found by its own name, as before. A state split between two zones is
 * named for the one most of it keeps.
 */
const ZONE_ALSO: Record<string, string> = {
  "America/New_York":
    "Miami Orlando Tampa Jacksonville Florida Atlanta Georgia Boston Massachusetts Philadelphia Pittsburgh Pennsylvania Washington DC Baltimore Maryland Charlotte Raleigh North Carolina South Carolina Virginia Richmond Newark New Jersey Brooklyn Queens Bronx Buffalo Connecticut Ohio Columbus Cleveland Cincinnati Michigan Maine Vermont New Hampshire Rhode Island Delaware West Virginia",
  "America/Detroit": "Detroit Michigan",
  "America/Indiana/Indianapolis": "Indianapolis Indiana",
  "America/Kentucky/Louisville": "Louisville Kentucky",
  "America/Chicago":
    "Houston Dallas Austin San Antonio Fort Worth Texas Nashville Memphis Tennessee New Orleans Louisiana Minneapolis Minnesota St. Louis Kansas City Missouri Milwaukee Wisconsin Oklahoma City Tulsa Oklahoma Omaha Nebraska Iowa Des Moines Alabama Birmingham Mississippi Arkansas Illinois Kansas Wichita",
  "America/Denver":
    "Colorado Colorado Springs Salt Lake City Utah Albuquerque New Mexico El Paso Boise Idaho Montana Wyoming",
  "America/Phoenix": "Arizona Phoenix Tucson Scottsdale Mesa",
  "America/Los_Angeles":
    "California San Francisco San Diego San Jose Oakland Sacramento Fresno Seattle Washington State Portland Oregon Las Vegas Nevada",
  "America/Anchorage": "Alaska",
  "Pacific/Honolulu": "Hawaii",
  "America/Puerto_Rico": "San Juan Puerto Rico",
  "America/Toronto": "Toronto Ontario Ottawa Montreal Quebec",
  "America/Vancouver": "Vancouver British Columbia",
  "America/Mexico_City": "Mexico Guadalajara Monterrey",
  "Europe/London": "England UK United Kingdom Manchester Birmingham",
};

/** The zone's own name as people read it, and the cities and states it is also found by. */
export function zoneSearchWords(zone: string): string {
  return [zone.replace(/_/g, " "), ZONE_ALSO[zone] ?? ""].join(" ").trim();
}

/**
 * Every zone this machine knows, for the picker.
 *
 * supportedValuesOf is the modern answer and needs no list in the repo; where
 * it is missing, the browser's own zone plus the default is still a real
 * choice rather than an empty menu.
 */
export function knownTimezones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
  try {
    const all = intl.supportedValuesOf?.("timeZone");
    if (all && all.length) return all;
  } catch {
    /* falls through to the pair below */
  }
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([here, DEFAULT_TIMEZONE].filter(isTimezone))];
}

/**
 * The device's zone, when it is one this machine can resolve.
 *
 * Narrows signup.ts's deviceTimezone rather than redefining it: signup hands
 * the raw string to workspace creation and lets the database default it, while
 * a picker needs a value it can pre-select, so the two answers differ by
 * exactly this check.
 */
export function usableDeviceTimezone(resolve?: () => string | undefined): string | null {
  const tz = signupDeviceTimezone(resolve);
  return tz && isTimezone(tz) ? tz : null;
}
