/** Profile: details. */

import { PlacesError, type PlacesHttp, type PlacesRequest } from "../places";
import { nonBlankOrNull, recordOrNull } from "@chanlytics/contracts";
import { GBP_INFO_BASE, bearer, type Obj } from "./requests";
import { callProfileApi } from "./profile";

/** A reply as Google accepts it: words, at most this many characters. */
export const GBP_REPLY_MAX = 4096;

export function cleanReply(text: unknown): string {
  return typeof text === "string"
    ? text
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .trim()
        .slice(0, GBP_REPLY_MAX)
    : "";
}

/* ---- a location's details (decision 0073, R17) ---- */

/** What a connected location is read for beside its name: its hours and days closed, phone, website, kinds, words, services. */
const GBP_DETAILS_READ_MASK =
  "name,title,phoneNumbers,categories,websiteUri,regularHours,specialHours,profile,serviceItems";

/** Google's day words, as its week counts them (0 is Sunday, as the Places listing's own week does). */
const GBP_DAYS: Readonly<Record<string, number>> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/** One opening period, as the Places listing's week keeps one (day 0 is Sunday); no close is around the clock. */
export interface GbpPeriod {
  open: { day: number; hour: number; minute: number };
  close: { day: number; hour: number; minute: number } | null;
}

/** A location's details, as the first run's Check offers them (each kept only on the owner's tap). */
export interface GbpLocationDetails {
  hours: GbpPeriod[] | null;
  /** Days the location says it is closed, YYYY-MM-DD, each run of days with its last. */
  closed: Array<{ date: string; until: string | null }>;
  phone: string | null;
  website: string | null;
  /** Its primary category's name ("Hair salon"), and the rest. */
  category: string | null;
  categories: string[];
  description: string | null;
  /** Its services as the profile lists them, each with its price where it gives one ("$65", "65 EUR"). */
  services: Array<{ name: string; price_note: string | null }>;
}

const gbpTimeOf = (t: unknown): { hour: number; minute: number } | null => {
  const o = recordOrNull(t);
  if (!o) return null;
  const hour = typeof o.hours === "number" ? o.hours : 0;
  const minute = typeof o.minutes === "number" ? o.minutes : 0;
  return hour >= 0 && hour <= 24 && minute >= 0 && minute < 60 ? { hour, minute } : null;
};

const dateOf = (d: unknown): string | null => {
  const o = recordOrNull(d);
  if (!o || typeof o.year !== "number" || typeof o.month !== "number" || typeof o.day !== "number") return null;
  return `${o.year}-${String(o.month).padStart(2, "0")}-${String(o.day).padStart(2, "0")}`;
};

/** A price as the owner writes one: "$65" in dollars, else the amount and its currency. */
function priceOf(payload: unknown): string | null {
  const record = recordOrNull(payload);
  if (!record) return null;
  const units =
    typeof record.units === "string" ? Number(record.units) : typeof record.units === "number" ? record.units : NaN;
  const nanos = typeof record.nanos === "number" ? record.nanos : 0;
  if (!Number.isFinite(units)) return null;
  const amount = units + nanos / 1e9;
  const shown = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const cur = nonBlankOrNull(record.currencyCode);
  return cur === "USD" || !cur ? `$${shown}` : `${shown} ${cur}`;
}

/** Google's answer for a location's details, read; null for an answer that names no location. */
function parseLocationDetails(json: unknown): GbpLocationDetails | null {
  const record = recordOrNull(json);
  if (!record || !nonBlankOrNull(record.name)?.startsWith("locations/")) return null;
  const regular = recordOrNull(record.regularHours);
  const periods: unknown[] | null = Array.isArray(regular?.periods) ? regular.periods : null;
  const hours = periods
    ? periods.flatMap((raw): GbpPeriod[] => {
        const result = recordOrNull(raw);
        const openDay = GBP_DAYS[String(result?.openDay)];
        const open = gbpTimeOf(result?.openTime);
        if (openDay === undefined || !open) return [];
        const closeDay = GBP_DAYS[String(result?.closeDay)];
        const close = gbpTimeOf(result?.closeTime);
        return [
          {
            open: { day: openDay, ...open },
            close: closeDay === undefined || !close ? null : { day: closeDay, ...close },
          },
        ];
      })
    : null;
  const specialHours = recordOrNull(record.specialHours);
  const special: unknown[] = Array.isArray(specialHours?.specialHourPeriods) ? specialHours.specialHourPeriods : [];
  const closed = special.flatMap((raw) => {
    const s = recordOrNull(raw);
    const date = dateOf(s?.startDate);
    if (!s || s.closed !== true || !date) return [];
    const end = dateOf(s.endDate);
    return [{ date, until: end && end !== date ? end : null }];
  });
  const cats = recordOrNull(record.categories);
  const primary = recordOrNull(cats?.primaryCategory);
  const others = Array.isArray(cats?.additionalCategories) ? cats.additionalCategories : [];
  const allCats = [primary, ...others.map(recordOrNull)].filter((c): c is Obj => !!c);
  // A structured service names its kind by id; the categories carry each kind's name.
  const kinds = new Map<string, string>();
  for (const c of allCats)
    for (const t of Array.isArray(c.serviceTypes) ? c.serviceTypes : []) {
      const o = recordOrNull(t);
      const id = nonBlankOrNull(o?.serviceTypeId);
      const name = nonBlankOrNull(o?.displayName);
      if (id && name) kinds.set(id, name);
    }
  const seen = new Set<string>();
  const services = (Array.isArray(record.serviceItems) ? record.serviceItems : []).flatMap((raw) => {
    const s = recordOrNull(raw);
    const free = recordOrNull(recordOrNull(s?.freeFormServiceItem)?.label);
    const structured = nonBlankOrNull(recordOrNull(s?.structuredServiceItem)?.serviceTypeId);
    const name = nonBlankOrNull(free?.displayName) ?? (structured ? (kinds.get(structured) ?? null) : null);
    if (!name || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    return [{ name: name.slice(0, 80), price_note: priceOf(s?.price) }];
  });
  return {
    hours,
    closed,
    phone: nonBlankOrNull(recordOrNull(record.phoneNumbers)?.primaryPhone),
    website: nonBlankOrNull(record.websiteUri),
    category: nonBlankOrNull(primary?.displayName),
    categories: allCats.map((c) => nonBlankOrNull(c.displayName)).filter((c): c is string => !!c),
    description: nonBlankOrNull(recordOrNull(record.profile)?.description),
    services,
  };
}

/** A connected location's details (locations.get with GBP_DETAILS_READ_MASK); throws a PlacesError when Google refuses. */
export async function readLocationDetails(
  http: PlacesHttp,
  token: string,
  locationName: string,
): Promise<GbpLocationDetails> {
  const query = new URLSearchParams({ readMask: GBP_DETAILS_READ_MASK });
  const req: PlacesRequest = {
    url: `${GBP_INFO_BASE}/${locationName}?${query.toString()}`,
    method: "GET",
    headers: bearer(token),
  };
  const locationDetails = parseLocationDetails(await callProfileApi(http, req));
  if (!locationDetails) throw new PlacesError(502, `Google's answer for ${locationName} named no location`);
  return locationDetails;
}
