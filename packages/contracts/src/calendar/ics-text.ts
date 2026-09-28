/**
 * A calendar feed as iCal text (RFC 5545): its folded lines unfolded and split into a name, parameters and a value,
 * and a value read as text, an instant, a wall-clock time or a duration. feed.ts reads the events out of them.
 */
import { localToUtcMs, zoneParts } from "./zone-math";

/* ------------------------------------------------------------ the feed */

/** iCal TEXT escapes: \, \; \n and \\. */
export function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c)).trim();
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
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (ch === ":" && !q) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts: string[] = [];
  let cur = "";
  q = false;
  for (const ch of head) {
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === ";" && !q) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  const [name, ...rest] = parts;
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
 *  - "20260909T140000" with TZID → that zone; without → `fallbackTz`
 *  - "20260909" (VALUE=DATE) → midnight in `fallbackTz`; `endOfDay` for DTEND
 */
export function toMs(value: string, params: Record<string, string>, fallbackTz: string): number | null {
  const v = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || params.VALUE === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return localToUtcMs(fallbackTz, Number(m[1]), Number(m[2]), Number(m[3]), 0, 0);
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  if (z) return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? 0));
  const tz = params.TZID ?? fallbackTz;
  try {
    return localToUtcMs(tz, Number(y), Number(mo), Number(d), Number(hh), Number(mm)) + Number(ss ?? 0) * 1000;
  } catch {
    return localToUtcMs(fallbackTz, Number(y), Number(mo), Number(d), Number(hh), Number(mm));
  }
}

/** The wall-clock parts of an iCal date-time in the zone it names (or the
 *  fallback), so a recurring series can be stepped by calendar days. */
export function localPartsOf(
  value: string,
  params: Record<string, string>,
  fallbackTz: string,
): { tz: string; y: number; m: number; d: number; hh: number; mm: number; allDay: boolean } | null {
  const v = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date || params.VALUE === "DATE") {
    const m = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { tz: fallbackTz, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), hh: 0, mm: 0, allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  if (m[7]) {
    const p = zoneParts(
      fallbackTz,
      new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))),
    );
    return { tz: fallbackTz, y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm, allDay: false };
  }
  return {
    tz: params.TZID ?? fallbackTz,
    y: Number(m[1]),
    m: Number(m[2]),
    d: Number(m[3]),
    hh: Number(m[4]),
    mm: Number(m[5]),
    allDay: false,
  };
}

/** "PT1H30M" / "P1D" → milliseconds. */
export function durationMs(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return (
    sign * ((Number(m[2] ?? 0) * 86400 + Number(m[3] ?? 0) * 3600 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) * 1000)
  );
}
