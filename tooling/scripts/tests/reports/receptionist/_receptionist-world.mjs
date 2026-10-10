/**
 * The Receptionist lens's own read, as the pages' tests hold it: Harbor Studio's week, Sat Aug 29 to Fri Sep 4, 2026 (the
 * world of ../_report-world.mjs, which the frame's read draws from), through the DTO the route answers (contracts
 * ReceptionistDto) and the surface that holds it (`reports_receptionist`: the DTO, the range it is of, when it was read).
 * Nothing here is a real business. The facts are receptionist-report.test.mjs's own, put on this week.
 */

/** When the read was made: the fold's "now", three hours into Friday Sep 4. */
export const READ_AT = Date.parse("2026-09-04T12:00:00Z");

/** Monday to Saturday, 9:30 to 6: Sunday is closed. */
export const PROFILE = {
  hours: {
    mon: { open: "09:30", close: "18:00" },
    tue: { open: "09:30", close: "18:00" },
    wed: { open: "09:30", close: "18:00" },
    thu: { open: "09:30", close: "18:00" },
    fri: { open: "09:30", close: "18:00" },
    sat: { open: "09:30", close: "18:00" },
  },
  closures: [],
};

/** A workspace that has everything: a hold with every outcome, topics, two languages, calls that ended, a link, a handover, and what is stuck. */
export const FACTS = {
  hold: {
    now: {
      total: 14,
      sent: 9,
      canceled: 1,
      steered: 1,
      overtaken: 1,
      person_first: 1,
      waiting: 0,
      other: 1,
      low_confidence: 3,
    },
    before: { total: 10, sent: 8 },
  },
  topics: { of: 41, stamped: 33, by_intent: { booking: 12, pricing: 9, hours: 6, services: 4, other: 2 } },
  languages: { of: 38, stamped: 38, by_language: { en: 30, es: 8 } },
  blocked: { total: 4, by_reason: { human_has_it: 3, opted_out: 1 } },
  call_endings: { total: 18, by_reason: { user_hangup: 11, agent_hangup: 5, unknown: 2 } },
  handover: {
    now: { n: 12, replied: { n: 11, median_s: 540 }, settled: { n: 9, median_s: 3900 } },
    before: { n: 10, replied: { n: 9, median_s: 780 }, settled: { n: 7, median_s: 5400 } },
  },
  missed: { now: { n: 6, touched: 4, pending: 1, unknown: 1 }, before: { n: 4, touched: 3, pending: 0, unknown: 0 } },
  // Sunday 11:00 and Wednesday 21:00 are closed, Monday 10:00 is open: 3 + 2 came while closed, 1 + 2 of them answered.
  after_hours: [
    { d: "2026-08-30", q: 44, n: 3, a: 1 },
    { d: "2026-09-02", q: 84, n: 2, a: 2 },
    { d: "2026-08-31", q: 40, n: 4, a: 4 },
  ],
  links: { sent: 7, booked: 3, calendar: "ok" },
  stuck: { waiting: 3, oldest_at: "2026-09-04T09:50:00Z", callbacks: 1 },
};

const NONE = {
  total: 0,
  sent: 0,
  canceled: 0,
  steered: 0,
  overtaken: 0,
  person_first: 0,
  waiting: 0,
  other: 0,
  low_confidence: 0,
};
const NO_HANDOVERS = { n: 0, replied: { n: 0, median_s: null }, settled: { n: 0, median_s: null } };
const NO_MISSED = { n: 0, touched: 0, pending: 0, unknown: 0 };

/** A period in which the receptionist's own parts have nothing to say: no held reply, no topic, no handover, nothing stuck. */
export const QUIET = {
  hold: { now: NONE, before: { total: 0, sent: 0 } },
  topics: { of: 0, stamped: 0, by_intent: {} },
  languages: { of: 0, stamped: 0, by_language: {} },
  blocked: { total: 0, by_reason: {} },
  call_endings: { total: 0, by_reason: {} },
  handover: { now: NO_HANDOVERS, before: NO_HANDOVERS },
  missed: { now: NO_MISSED, before: NO_MISSED },
  after_hours: [],
  links: { sent: 0, booked: 0, calendar: "ok" },
  stuck: { waiting: 0, oldest_at: null, callbacks: 0 },
};

/** What the route answers for the week: FACTS (or what `over` puts in their place) and the workspace's hours. */
export const dtoWith = (over = {}, profile = PROFILE) => ({
  timezone: "America/New_York",
  today: "2026-09-04",
  days: 7,
  series: { timezone: "America/New_York", today: "2026-09-04", days: 7, ...FACTS, ...over },
  profile,
});

/** The route's answer from a database with no receptionist_series yet. */
export const NO_FUNCTION = { ...dtoWith(), series: null, profile: null };

/** The surface's value: the DTO, the range it is of (the strip's, by its one name) and when it was read. */
export const ownHeld = (dto = dtoWith(), key = "7d") => ({ dto, key, readAt: READ_AT });
