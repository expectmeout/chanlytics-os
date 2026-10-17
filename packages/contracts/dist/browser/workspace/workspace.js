import { deviceTimezone as signupDeviceTimezone } from "./signup.js";
import { dateFormat, timezoneCity } from "../shared/time.js";
export const DEFAULT_TIMEZONE = "America/New_York";
export function isTimezone(raw) {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return true;
  } catch {
    return false;
  }
}
export function cleanTimezone(raw) {
  const tz = typeof raw === "string" ? raw.trim() : "";
  if (!tz) return { ok: false, reason: "Pick the timezone your business runs on." };
  if (!isTimezone(tz)) return { ok: false, reason: `${tz} is not a timezone this system knows.` };
  return { ok: true, tz };
}
export function timezoneWords(tz, nowMs = Date.now()) {
  const zone = tz && isTimezone(tz) ? tz : DEFAULT_TIMEZONE;
  const city = timezoneCity(zone);
  let timeThere;
  try {
    timeThere = dateFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(nowMs));
  } catch {
    timeThere = null;
  }
  return { city, zone, timeThere, line: timeThere ? `${city} \xB7 ${timeThere} there now` : city };
}
const ZONE_ALSO = {
  "America/New_York": "Miami Orlando Tampa Jacksonville Florida Atlanta Georgia Boston Massachusetts Philadelphia Pittsburgh Pennsylvania Washington DC Baltimore Maryland Charlotte Raleigh North Carolina South Carolina Virginia Richmond Newark New Jersey Brooklyn Queens Bronx Buffalo Connecticut Ohio Columbus Cleveland Cincinnati Michigan Maine Vermont New Hampshire Rhode Island Delaware West Virginia",
  "America/Detroit": "Detroit Michigan",
  "America/Indiana/Indianapolis": "Indianapolis Indiana",
  "America/Kentucky/Louisville": "Louisville Kentucky",
  "America/Chicago": "Houston Dallas Austin San Antonio Fort Worth Texas Nashville Memphis Tennessee New Orleans Louisiana Minneapolis Minnesota St. Louis Kansas City Missouri Milwaukee Wisconsin Oklahoma City Tulsa Oklahoma Omaha Nebraska Iowa Des Moines Alabama Birmingham Mississippi Arkansas Illinois Kansas Wichita",
  "America/Denver": "Colorado Colorado Springs Salt Lake City Utah Albuquerque New Mexico El Paso Boise Idaho Montana Wyoming",
  "America/Phoenix": "Arizona Phoenix Tucson Scottsdale Mesa",
  "America/Los_Angeles": "California San Francisco San Diego San Jose Oakland Sacramento Fresno Seattle Washington State Portland Oregon Las Vegas Nevada",
  "America/Anchorage": "Alaska",
  "Pacific/Honolulu": "Hawaii",
  "America/Puerto_Rico": "San Juan Puerto Rico",
  "America/Toronto": "Toronto Ontario Ottawa Montreal Quebec",
  "America/Vancouver": "Vancouver British Columbia",
  "America/Mexico_City": "Mexico Guadalajara Monterrey",
  "Europe/London": "England UK United Kingdom Manchester Birmingham"
};
export function zoneSearchWords(zone) {
  return [zone.replace(/_/g, " "), ZONE_ALSO[zone] ?? ""].join(" ").trim();
}
export function knownTimezones() {
  const intl = Intl;
  try {
    const all = intl.supportedValuesOf?.("timeZone");
    if (all && all.length) return all;
  } catch {
  }
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([here, DEFAULT_TIMEZONE].filter(isTimezone))];
}
export function usableDeviceTimezone(resolve) {
  const tz = signupDeviceTimezone(resolve);
  return tz && isTimezone(tz) ? tz : null;
}
const WORKSPACE_NAME_MAX = 120;
export function cleanWorkspaceName(raw) {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!name) return { ok: false, reason: "A business needs a name." };
  if (name.length > WORKSPACE_NAME_MAX)
    return { ok: false, reason: `A business's name is at most ${WORKSPACE_NAME_MAX} characters.` };
  return { ok: true, name };
}
