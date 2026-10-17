import { BOOKING_RULE_BOUNDS } from "../workspace-config/config-rules.js";
import { BOOKING_DEFAULTS } from "../../calendar/availability.js";
import { count, pluralGrouped } from "./counts.js";
const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
export function bookingRulesWords(rules) {
  const r = rules ?? {};
  const parts = [];
  if (isNumber(r.lead_hours))
    parts.push(
      r.lead_hours === 0 ? "same-day bookings" : `at least ${r.lead_hours === 1 ? "1 hour's" : `${count(r.lead_hours)} hours'`} notice`
    );
  if (isNumber(r.slot_min)) parts.push(`${count(r.slot_min)}-minute slots`);
  if (isNumber(r.buffer_min))
    parts.push(
      r.buffer_min === 0 ? "no gap between bookings" : `${pluralGrouped(r.buffer_min, "minute", "minutes")} between bookings`
    );
  if (isNumber(r.max_days_ahead)) parts.push(`up to ${pluralGrouped(r.max_days_ahead, "day", "days")} ahead`);
  if (isNumber(r.party_max)) parts.push(`up to ${pluralGrouped(r.party_max, "person", "people")}`);
  if (r.ask_email) parts.push("asks for an email when sending the booking link");
  const joined = parts.join(" \xB7 ");
  const notes = (Array.isArray(r.notes) ? r.notes : []).filter((x) => typeof x === "string" && x.trim() !== "").map((x) => {
    const t = x.trim();
    return /[.!?…]$/.test(t) ? t : `${t}.`;
  });
  const d = BOOKING_DEFAULTS;
  return {
    line: joined ? `${joined[0].toUpperCase()}${joined.slice(1)}` : null,
    notes: notes.length ? notes.join(" ") : null,
    none: `The calendar's own \u2014 at least ${pluralGrouped(d.lead_hours, "hour's", "hours'")} notice, up to ${pluralGrouped(d.max_days_ahead, "day", "days")} ahead, in ${count(d.slot_min)}-minute slots`
  };
}
export function bookingRuleRefusal(key) {
  const words = {
    lead_hours: (lo, hi) => `Least notice is ${lo} to ${hi} hours; leave it empty to use ${pluralGrouped(BOOKING_DEFAULTS.lead_hours, "hour", "hours")}.`,
    slot_min: (lo, hi) => `A slot is ${lo} to ${hi} minutes; leave it empty for the calendar\u2019s ${pluralGrouped(BOOKING_DEFAULTS.slot_min, "minute", "minutes")}.`,
    buffer_min: (lo, hi) => `The gap is ${lo} to ${hi} minutes; leave it empty for ${BOOKING_DEFAULTS.buffer_min === 0 ? "none" : pluralGrouped(BOOKING_DEFAULTS.buffer_min, "minute", "minutes")}.`,
    max_days_ahead: (lo, hi) => `Times are offered ${lo} to ${hi} days ahead; leave it empty to use ${pluralGrouped(BOOKING_DEFAULTS.max_days_ahead, "day", "days")}.`,
    party_max: (lo, hi) => `A booking is for ${lo} to ${hi} people; leave it empty for no rule.`
  };
  const known = Object.prototype.hasOwnProperty.call(words, key);
  if (!known) {
    throw new TypeError(
      `bookingRuleRefusal knows the five booking rules a box holds a number for (${Object.keys(words).join(", ")}), not ${JSON.stringify(key)}.`
    );
  }
  const bound = BOOKING_RULE_BOUNDS[key];
  return words[key](bound.min, bound.max);
}
export const BOOKING_RULE_HINTS = /* @__PURE__ */ (() => ({
  lead_hours: null,
  slot_min: null,
  buffer_min: null,
  max_days_ahead: null,
  party_max: "Bigger groups are handed to a person."
}))();
