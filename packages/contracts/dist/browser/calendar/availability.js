import { DAYS } from "../config/workspace-config/config-rules.js";
import { NO_LINK_DETAILS } from "../config/no-booking-link.js";
import { BOOKING_REQUEST_INSTRUCTION } from "./visit/booking-request.js";
import { keyParts } from "./day-keys.js";
import { WEEKDAY_KEYS, clockInZone, dayPlusInZone, localToUtcMs } from "./zone-math.js";
import { dateFormat } from "../shared/time.js";
export const BOOKING_DEFAULTS = { lead_hours: 2, buffer_min: 0, max_days_ahead: 14, slot_min: 30 };
function hhmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}
export function dayIntervals(h) {
  const raw = [];
  if (h?.open && h?.close) raw.push([h.open, h.close]);
  for (const iv of h?.intervals ?? []) if (iv?.open && iv?.close) raw.push([iv.open, iv.close]);
  const usable = raw.filter(([o, c]) => c > o).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const merged = [];
  for (const [o, c] of usable) {
    const last = merged[merged.length - 1];
    if (last && o <= last[1]) {
      if (c > last[1]) last[1] = c;
    } else {
      merged.push([o, c]);
    }
  }
  return merged;
}
export function closedOn(closures, key) {
  return !!closures?.some((c) => c.date <= key && key <= (c.until && c.until >= c.date ? c.until : c.date));
}
const minutesOf = (s) => {
  const t = hhmm(s);
  return t ? t[0] * 60 + t[1] : null;
};
export function openAt(hours, closures, dateKey, minute) {
  if (closedOn(closures, dateKey)) return false;
  const { y, m, d } = keyParts(dateKey);
  const weekday = WEEKDAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  if (!weekday) return false;
  return dayIntervals(hours?.[weekday]).some(([o, c]) => {
    const from = minutesOf(o);
    const to = minutesOf(c);
    return from !== null && to !== null && from <= minute && minute < to;
  });
}
export function hasHours(hours) {
  return DAYS.some((d) => dayIntervals(hours?.[d]).length > 0);
}
function onTheGrid(tz, atMs, slotMin) {
  const grid = slotMin > 0 && 60 % slotMin === 0 ? slotMin : 15;
  const c = clockInZone(tz, atMs);
  const into = (c.mm % grid * 60 + c.ss) * 1e3 + (atMs % 1e3 + 1e3) % 1e3;
  return into === 0 ? atMs : atMs - into + grid * 6e4;
}
export function freeWindows(input) {
  const rules = { ...BOOKING_DEFAULTS, ...input.rules ?? {} };
  const leadMs = rules.lead_hours * 36e5;
  const bufferMs = rules.buffer_min * 6e4;
  const slotMs = rules.slot_min * 6e4;
  const earliest = onTheGrid(input.tz, input.now.getTime() + leadMs, rules.slot_min);
  const busy = input.busy.map((b) => ({ start: b.start - bufferMs, end: b.end + bufferMs })).sort((a, b) => a.start - b.start);
  const out = [];
  for (let offset = 0; offset < rules.max_days_ahead; offset++) {
    const day = dayPlusInZone(input.tz, input.now.getTime(), offset);
    if (closedOn(input.closures, day.key)) continue;
    const ranges = dayIntervals(input.hours?.[day.weekday]);
    const windows = [];
    for (const [open, close] of ranges) {
      const o = hhmm(open), c = hhmm(close);
      if (!o || !c) continue;
      let start = Math.max(localToUtcMs(input.tz, day.y, day.m, day.d, o[0], o[1]), earliest);
      const end = localToUtcMs(input.tz, day.y, day.m, day.d, c[0], c[1]);
      for (const b of busy) {
        if (b.end <= start) continue;
        if (b.start >= end) break;
        if (b.start > start && b.start - start >= slotMs) windows.push({ start, end: b.start });
        start = Math.max(start, b.end);
      }
      if (end - start >= slotMs) windows.push({ start, end });
    }
    if (windows.length) {
      out.push({
        key: day.key,
        weekday: day.weekday,
        // Noon on that local day: an instant the day owns whichever way the
        // clock moved, where midnight on a spring-forward day may not exist
        // and 1 AM on an autumn one happens twice.
        label: dateFormat("en-US", {
          timeZone: input.tz,
          weekday: "long",
          month: "long",
          day: "numeric"
        }).format(new Date(localToUtcMs(input.tz, day.y, day.m, day.d, 12, 0))),
        windows
      });
    }
  }
  return out;
}
const DAY_NAMES = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tues: "tue",
  tuesday: "tue",
  wed: "wed",
  wednesday: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun"
};
export function filterOpenings(openings, by) {
  const day = (by.day ?? "").trim().toLowerCase();
  const weekday = day ? DAY_NAMES[day] : void 0;
  const key = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : void 0;
  const minMs = by.minMinutes && by.minMinutes > 0 ? by.minMinutes * 6e4 : 0;
  const picked = openings.filter((o) => key ? o.key === key : weekday ? o.weekday === weekday : true);
  const first = weekday && !key ? picked.slice(0, 1) : picked;
  return first.map((o) => ({ ...o, windows: o.windows.filter((w) => w.end - w.start >= minMs) })).filter((o) => o.windows.length > 0);
}
function span(tz, start, end) {
  const f = dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  return `${f.format(new Date(start))} \u2013 ${f.format(new Date(end))}`;
}
export function describeOpenings(openings, tz, opts) {
  const maxDays = opts.maxDays ?? 5;
  const ahead = opts.daysAhead ?? BOOKING_DEFAULTS.max_days_ahead;
  const hasLink = opts.hasBookingLink;
  const held = hasLink && opts.bookingHeld === true;
  if (!openings.length) {
    const instead = held ? "Offer to have a member of the team call or text them when a slot frees up, and take their name. This business confirms its own bookings: never send or promise the booking link." : `Offer to have someone call back${hasLink ? ", and send the booking link so they are told when a slot frees up" : ""}.`;
    return `Open times (from the calendar): nothing is open in the next ${ahead} days. ${instead}`;
  }
  const lines = openings.slice(0, maxDays).map((o) => `- ${o.label}: ${o.windows.map((w) => span(tz, w.start, w.end)).join(", ")}`);
  const confirms = held || !hasLink;
  if (opts.requests === true && confirms)
    return `Open times (from the calendar, checked just now \u2014 these change as bookings come in):
${lines.join("\n")}
Offer up to three of these that fit what they want. ${BOOKING_REQUEST_INSTRUCTION}` + (held ? " This business confirms its own bookings: never send or promise the booking link." : "");
  return `Open times (from the calendar, checked just now \u2014 these change as bookings come in):
${lines.join("\n")}
` + (held ? "Offer up to three of these that fit what they want, then say a member of the team will call or text them to confirm, and take their name. This business confirms its own bookings: never send or promise the booking link, and never confirm a slot yourself." : hasLink ? "Offer up to three of these that fit what they want, then send the booking link to lock one in. Never confirm a slot yourself; the calendar decides." : `Offer up to three of these that fit what they want, then take ${NO_LINK_DETAILS} so the team can confirm one. Never confirm a slot yourself; the calendar decides.`);
}
