export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_NAMES = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
const DAY_NAME = DAY_NAMES;
export function isRealDate(key) {
  const at = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === key;
}
export const MAX_INTERVALS_PER_DAY = 4;
export const MAX_CLOSURES = 60;
export function dayProblems(h, day) {
  const name = DAY_NAME[day] ?? day;
  const out = [];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    out.push({
      path: [open ? "close" : "open"],
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    out.push({ path: ["close"], message: `${name} closes at or before it opens.` });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY) {
    out.push({ path: ["intervals"], message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.` });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      out.push({ path: ["intervals", n, "close"], message: `${name}: a shift has to close after it opens.` });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      out.push({ path: ["intervals", n, "open"], message: `${name}: two shifts overlap.` });
    }
  }
  return out;
}
export const E164 = /^\+[1-9]\d{6,14}$/;
export const isE164 = (s) => typeof s === "string" && E164.test(s);
export const INSTRUCTIONS_MAX = 2e4;
export const BOOKING_LINK_MAX = 500;
export const PROFILE_LIMITS = {
  tone: 200,
  services: 60,
  serviceName: 80,
  serviceMinutes: 1440,
  servicePrice: 120,
  languages: 8,
  languageMin: 2,
  languageMax: 40,
  reasons: 20,
  reason: 200,
  consultFirst: 20,
  consultFirstLine: 80,
  ruleNotes: 10,
  ruleNote: 200,
  notes: 10,
  noteTitle: 80,
  noteText: 1200,
  closureNote: 200,
  closures: MAX_CLOSURES,
  shifts: MAX_INTERVALS_PER_DAY,
  instructions: INSTRUCTIONS_MAX,
  message: 2e3
};
export const BOOKING_RULE_BOUNDS = {
  /** Least notice for a slot, in hours. */
  lead_hours: { min: 0, max: 168 },
  /** The shortest window worth naming, in minutes. */
  slot_min: { min: 15, max: 240 },
  /** Gap kept around each existing appointment, in minutes. */
  buffer_min: { min: 0, max: 120 },
  /** How far ahead open times are offered, in days. */
  max_days_ahead: { min: 1, max: 90 },
  party_max: { min: 1, max: 20 }
};
export const GUARDRAIL_KEYS = [
  "never_quote_prices",
  "never_confirm_booking",
  "disclose_ai",
  "no_health_advice"
];
export function guardrailsInForce(g) {
  return {
    never_quote_prices: g?.never_quote_prices !== false,
    // Always (the Settings wiring review, 18 Oct 2026): nothing in the product books, so no choice of the owner's lets the
    // receptionist confirm one; what happens instead is the booking choice on Hours & booking. A stored false is read as
    // on, and the key stays in the schema so an older tab's rules save is not refused by name.
    never_confirm_booking: true,
    // Always: the receptionist says it is an automated assistant whatever a row stores (decision 0051). The key stays
    // in the schema so an open tab's rules save, which writes all four, is never refused by name.
    disclose_ai: true,
    no_health_advice: g?.no_health_advice === true
  };
}
