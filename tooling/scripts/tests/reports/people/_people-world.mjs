/**
 * The People lens's own read, as the pages' tests hold it: Harbor Studio's thirty days to Fri Sep 4, 2026 (the world of
 * ../_report-world.mjs, which the frame's read draws from), through the DTO the route answers (contracts PeopleDto) and the
 * surface that holds it (`reports_people`: the DTO and the range it is of). Nothing here is a real business.
 *
 * The lens has two halves and the world keeps them apart as the DTO does: SERIES is what people_series answers for the
 * window (people reached, how they came, what they answered, steps done), POOL is the book as it stands now, counted over
 * the people pool by People's own rules (contracts peopleNowOf). The facts add up, and the sums are held by
 * people-record.test.mjs: the book's freshness to its 520 people, the last three buckets to the Quiet list, its wires to
 * 520, and the twelve new people by how they came.
 */

/** people_series's answer for the thirty days (00394): the window it was read for, and counts, never a name. */
export const SERIES = {
  timezone: "America/New_York",
  today: "2026-09-04",
  days: 30,
  reached: { now: { people: 40, new: 12 }, before: { people: 31, new: 8 } },
  by_channel: {
    now: { whatsapp: 25, sms: 3, email: 6, voice: 11 },
    before: { whatsapp: 20, sms: 2, email: 5, voice: 7 },
  },
  first_came: { by_via: { whatsapp: 5, call: 3, ad: 1, calendar: 1, unknown: 2 } },
  consent: {
    now: {
      yes: {
        total: 9,
        by_source: { customer_message: 6, form: 2, in_person: 1 },
        by_purpose: { messages: 6, offers: 2, email_offers: 1 },
      },
      stop: {
        total: 4,
        by_source: { customer_message: 2, carrier: 1, unsubscribe: 1 },
        by_purpose: { messages: 2, offers: 1, email_offers: 1 },
      },
    },
    before: { yes: 7, stop: 2 },
  },
  email_stopped: { total: 2, by_reason: { hard_bounce: 1, complaint: 1 } },
  steps: { done: 11, on_time: 8 },
};

/** The book as it stands now (contracts PeopleNowDto): 520 live people, counted by People's own predicates. */
export const POOL = {
  people: 520,
  fresh: { under_7: 60, d7_30: 140, d31_60: 90, d61_90: 70, d91_up: 110, never: 50 },
  // Quiet 30+ days is the last three buckets: 90 + 70 + 110.
  lists: { opted_in: 340, offers_ok: 40, opted_out: 22, quiet: 270 },
  steps: { overdue: 6, due_today: 3 },
  email_stopped: 4,
  wires: { whatsapp_only: 300, sms_only: 20, phone_only: 60, email_only: 40, several: 70, none: 30 },
};

const NO_CONSENT = {
  total: 0,
  by_source: {},
  by_purpose: { messages: 0, offers: 0, email_offers: 0 },
};

/** A window in which nobody reached the business and nothing was answered or done: every count 0, nobody came by any door. The book is POOL's still. */
export const QUIET = {
  reached: { now: { people: 0, new: 0 }, before: { people: 0, new: 0 } },
  by_channel: {
    now: { whatsapp: 0, sms: 0, email: 0, voice: 0 },
    before: { whatsapp: 0, sms: 0, email: 0, voice: 0 },
  },
  first_came: { by_via: {} },
  consent: { now: { yes: NO_CONSENT, stop: NO_CONSENT }, before: { yes: 0, stop: 0 } },
  email_stopped: { total: 0, by_reason: {} },
  steps: { done: 0, on_time: 0 },
};

/** What the route answers for the thirty days: SERIES (or what `over` puts in its place) and the book (`pool`, null: none). */
export const dtoWith = (over = {}, pool = POOL) => ({
  timezone: "America/New_York",
  today: "2026-09-04",
  days: 30,
  series: { ...SERIES, ...over },
  now: pool,
});

/** The surface's value: the DTO and the range it is of (the strip's, by its one name). */
export const held = (dto = dtoWith(), key = "30d") => ({ dto, key });
