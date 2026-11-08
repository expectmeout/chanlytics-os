/**
 * A calendar feed as iCal text (RFC 5545): its folded lines unfolded and split into a name, parameters and a value,
 * and a value read as text, an instant, a wall-clock time or a duration. feed.ts reads the events out of them.
 */
import { zoneOfTzid } from "./ics-zones";
import { localToUtcMs, zoneParts } from "../shared/zone/math";

/* ------------------------------------------------------------ the feed */

/** iCal TEXT escapes: \, \; \n and \\. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c)).trim();
}

/** RFC 5545 folds long lines; a continuation starts with a space or tab. */
export function unfold(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) out[out.length - 1] += raw.slice(1);
    else out.push(raw);
  }
  return out;
}

/**
 * "DTSTART;TZID=America/New_York:20260909T140000" → { name, params, value }.
 * A quoted parameter may hold ":" or ";" (CN="Lopez, Maria: stylist"), so
 * the split respects quotes and drops them.
 */
export function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  let colon = -1;
  let query = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') query = !query;
    else if (ch === ":" && !query) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = "";
  query = false;
  for (const ch of head) {
    if (ch === '"') {
      query = !query;
      continue;
    }
    if (ch === ";" && !query) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  const [name = "", ...rest] = parts;
  const params: Record<string, string> = {};
  for (const p of rest) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

/**
 * An iCal date-time to an instant.
 *  - "20260909T180000Z"  → UTC
 *  - "20260909T140000" with TZID → that zone, by whichever name the feed's writer gave it (ics-zones.ts); without, or
 *    with a name nobody knows → `fallbackTz`
 *  - "20260909" (VALUE=DATE) → midnight in `fallbackTz`; `endOfDay` for DTEND
 */
export function toMs(value: string, params: Record<string, string>, fallbackTz: string): number | null {
  const text = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (date || params.VALUE === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(text);
    if (!m) return null;
    return localToUtcMs(fallbackTz, Number(m[1]), Number(m[2]), Number(m[3]), 0, 0);
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(text);
  if (!match) return null;
  const [, y, mo, d, hh, mm, ss, z] = match;
  if (z) return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0));
  const tz = zoneOfTzid(params.TZID, fallbackTz);
  return localToUtcMs(tz, Number(y), Number(mo), Number(d), Number(hh), Number(mm)) + Number(ss ?? 0) * 1000;
}

/** The wall-clock parts of an iCal date-time in the zone it names (or the
 *  fallback), so a recurring series can be stepped by calendar days. */
export function localPartsOf(
  value: string,
  params: Record<string, string>,
  fallbackTz: string,
): { tz: string; y: number; m: number; d: number; hh: number; mm: number; allDay: boolean } | null {
  const text = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (date || params.VALUE === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(text);
    if (!m) return null;
    return { tz: fallbackTz, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh: 0, mm: 0, allDay: true };
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(text);
  if (!match) return null;
  if (match[7]) {
    const result = zoneParts(
      fallbackTz,
      new Date(
        Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6] ?? 0),
        ),
      ),
    );
    return { tz: fallbackTz, y: result.y, m: result.m, d: result.d, hh: result.hh, mm: result.mm, allDay: false };
  }
  return {
    // A zone the clock reads: the series is stepped with it, and a name it did not know threw there (ics-zones.ts).
    tz: zoneOfTzid(params.TZID, fallbackTz),
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
    hh: Number(match[4]),
    mm: Number(match[5]),
    allDay: false,
  };
}

/** "PT1H30M" / "P1D" → milliseconds. */
export function durationMs(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return (
    sign * ((Number(m[2] ?? 0) * 86400 + Number(m[3] ?? 0) * 3600 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) * 1000)
  );
}
