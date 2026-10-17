import { dayNumber, localToUtcMs } from "./zone-math.js";
import { durationMs, localPartsOf, splitLine, toMs, unescapeText, unfold } from "./ics-text.js";
const WEEKDAYS = ["su", "mo", "tu", "we", "th", "fr", "sa"];
function parseRule(value, fallbackTz) {
  const parts = {};
  for (const kv of value.split(";")) {
    const eq = kv.indexOf("=");
    if (eq > 0) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  }
  const freq = parts.FREQ;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  for (const k of Object.keys(parts))
    if (!["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "WKST"].includes(k)) return null;
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1) || 1);
  const count = parts.COUNT ? Number(parts.COUNT) : null;
  let until = null;
  if (parts.UNTIL) {
    until = toMs(parts.UNTIL, {}, fallbackTz);
    if (until !== null && /^\d{8}$/.test(parts.UNTIL)) until += 864e5 - 1;
  }
  let byday = null;
  if (parts.BYDAY) {
    byday = [];
    for (const d of parts.BYDAY.split(",")) {
      const i = WEEKDAYS.indexOf(d.trim().toLowerCase());
      if (i === -1) return null;
      byday.push(i);
    }
    if (freq !== "WEEKLY") return null;
  }
  let bymonthday = null;
  if (parts.BYMONTHDAY) {
    if (freq !== "MONTHLY" || parts.BYMONTHDAY.includes(",")) return null;
    bymonthday = Number(parts.BYMONTHDAY);
    if (!Number.isInteger(bymonthday) || bymonthday < 1 || bymonthday > 31) return null;
  }
  return { freq, interval, count: count && count > 0 ? count : null, until, byday, bymonthday };
}
function occurrences(start, durMs, rule, exdates, horizon) {
  const out = [];
  const first = dayNumber(start.y, start.m, start.d);
  const firstDate = new Date(first * 864e5);
  const firstWeek = Math.floor((first - (firstDate.getUTCDay() + 6) % 7) / 7);
  const wanted = rule.byday ?? [firstDate.getUTCDay()];
  let produced = 0;
  for (let n = 0; n < 2e4; n++) {
    const day = first + n;
    const at = new Date(day * 864e5);
    const y = at.getUTCFullYear(), m = at.getUTCMonth() + 1, d = at.getUTCDate();
    let hit = false;
    if (rule.freq === "DAILY") hit = n % rule.interval === 0;
    else if (rule.freq === "WEEKLY") {
      const week = Math.floor((day - (at.getUTCDay() + 6) % 7) / 7);
      hit = wanted.includes(at.getUTCDay()) && (week - firstWeek) % rule.interval === 0;
    } else if (rule.freq === "MONTHLY") {
      const months = (y - start.y) * 12 + (m - start.m);
      hit = d === (rule.bymonthday ?? start.d) && months % rule.interval === 0;
    } else if (rule.freq === "YEARLY") {
      hit = m === start.m && d === start.d && (y - start.y) % rule.interval === 0;
    }
    if (!hit) continue;
    const s = localToUtcMs(start.tz, y, m, d, start.hh, start.mm);
    if (rule.until !== null && s > rule.until) break;
    produced++;
    if (rule.count !== null && produced > rule.count) break;
    if (s > horizon.to) break;
    if (exdates.has(s)) continue;
    if (s + durMs >= horizon.from) out.push({ start: s, end: s + durMs });
  }
  return out;
}
function instantsOf(lines, fallbackTz) {
  const out = [];
  for (const e of lines) {
    for (const v of e.value.split(",")) {
      if (v.includes("/")) continue;
      const ms = toMs(v, e.params, fallbackTz);
      if (ms !== null) out.push(ms);
    }
  }
  return out;
}
const seriesOf = (occurrence) => occurrence === null ? {} : { occurrence };
function dueAt(rid, fallbackTz) {
  return rid ? toMs(rid.value, rid.params, fallbackTz) : null;
}
export function parseIcs(text, fallbackTz, opts = {}) {
  const horizon = opts.horizon ?? { from: Date.now() - 864e5, to: Date.now() + 90 * 864e5 };
  const busy = [];
  const items = [];
  let events = 0;
  let recurringExpanded = 0;
  let skippedRecurring = 0;
  const raws = [];
  let cur = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = { props: {}, exdates: [], rdates: [], attendees: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) raws.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const s = splitLine(line);
    if (!s) continue;
    if (s.name === "EXDATE") {
      cur.exdates.push({ params: s.params, value: s.value });
      continue;
    }
    if (s.name === "RDATE") {
      cur.rdates.push({ params: s.params, value: s.value });
      continue;
    }
    if (s.name === "ATTENDEE") {
      const v = s.value.trim();
      cur.attendees.push({
        name: s.params.CN?.trim() || null,
        email: /^mailto:/i.test(v) ? v.slice(7).toLowerCase() : null
      });
      continue;
    }
    cur.props[s.name] = { params: s.params, value: s.value };
  }
  const overridden = /* @__PURE__ */ new Map();
  for (const r of raws) {
    const rid = r.props["RECURRENCE-ID"];
    const uid = r.props.UID?.value.trim();
    if (!rid || !uid) continue;
    const ms = toMs(rid.value, rid.params, fallbackTz);
    if (ms === null) continue;
    let set = overridden.get(uid);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      overridden.set(uid, set);
    }
    set.add(ms);
  }
  for (const r of raws) {
    events++;
    const p = r.props;
    const status = p.STATUS?.value.toUpperCase();
    const transp = p.TRANSP?.value.toUpperCase();
    if (status === "CANCELLED" || transp === "TRANSPARENT" || !p.DTSTART) continue;
    const start = toMs(p.DTSTART.value, p.DTSTART.params, fallbackTz);
    let end = null;
    if (p.DTEND) end = toMs(p.DTEND.value, p.DTEND.params, fallbackTz);
    else if (p.DURATION && start !== null) {
      const d = durationMs(p.DURATION.value);
      end = d === null ? null : start + d;
    } else if (start !== null) {
      end = p.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(p.DTSTART.value.trim()) ? start + 864e5 : start;
    }
    if (start === null || end === null || end <= start) continue;
    const title = unescapeText(p.SUMMARY?.value ?? "");
    const description = unescapeText(p.DESCRIPTION?.value ?? "") || null;
    const location = unescapeText(p.LOCATION?.value ?? "") || null;
    const allDay = p.DTSTART.params.VALUE === "DATE" || /^\d{8}$/.test(p.DTSTART.value.trim());
    const uid = p.UID?.value.trim() || null;
    const org = p.ORGANIZER?.value.trim() ?? "";
    const organizer = /^mailto:/i.test(org) ? org.slice(7).toLowerCase() : null;
    const isOverride = !!p["RECURRENCE-ID"];
    const rule = p.RRULE && !isOverride ? parseRule(p.RRULE.value, fallbackTz) : null;
    const local = p.RRULE && !isOverride ? localPartsOf(p.DTSTART.value, p.DTSTART.params, fallbackTz) : null;
    const dur = end - start;
    const words = { title, allDay, uid, description, location, attendees: r.attendees.slice(), organizer };
    const push = (o, occurrence = null) => {
      busy.push(o);
      items.push({ ...o, ...words, ...seriesOf(occurrence) });
    };
    if (p.RRULE && !isOverride && rule && local) {
      const ex = new Set(instantsOf(r.exdates, fallbackTz));
      for (const ms of uid ? overridden.get(uid) ?? [] : []) ex.add(ms);
      const seen = /* @__PURE__ */ new Set();
      const occ = occurrences(local, dur, rule, ex, horizon);
      for (const o of occ) {
        if (!seen.has(o.start)) {
          seen.add(o.start);
          push(o, o.start);
        }
      }
      for (const ms of instantsOf(r.rdates, fallbackTz)) {
        if (ex.has(ms) || seen.has(ms) || ms > horizon.to || ms + dur < horizon.from) continue;
        seen.add(ms);
        push({ start: ms, end: ms + dur }, ms);
      }
      recurringExpanded++;
    } else if (!p.RRULE && r.rdates.length && !isOverride) {
      const ex = new Set(instantsOf(r.exdates, fallbackTz));
      const seen = /* @__PURE__ */ new Set([start]);
      push({ start, end }, start);
      for (const ms of instantsOf(r.rdates, fallbackTz)) {
        if (ex.has(ms) || seen.has(ms) || ms > horizon.to || ms + dur < horizon.from) continue;
        seen.add(ms);
        push({ start: ms, end: ms + dur }, ms);
      }
      recurringExpanded++;
    } else {
      if (p.RRULE && !isOverride) skippedRecurring++;
      push({ start, end }, dueAt(p["RECURRENCE-ID"], fallbackTz));
    }
  }
  busy.sort((a, b) => a.start - b.start);
  items.sort((a, b) => a.start - b.start);
  return { busy, items, events, recurringExpanded, skippedRecurring };
}
