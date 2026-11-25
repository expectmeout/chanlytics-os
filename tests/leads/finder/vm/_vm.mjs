/**
 * The world the tests of vm/ share. Split by behaviour from leads-vm.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * Release B's contracts for the Leads scope of People: a view of the scope as
 * a route, a stage change as the door's arguments, the words a lead wears, the
 * foot every draft carries, the shapes the model answers in, and the view
 * models the page draws (PRD v3 §6.1, §6.2, §9.1, §9.4; plan 4.1 and 4.6).
 *
 * Pure: nothing here reads a file or a database. The fixtures are fictional --
 * every domain under .example, every phone in 555-0100..0199, every place id
 * ChIJfixture....
 *
 * Tasks 9, 10, 12-15, 17 and 19 append their own cases as they write each body.
 */
import { LeadSearchPlanSchema } from "../../../../packages/contracts/src/leads/search/plan-schema";

/* ------------------------------------------------------------ the fixtures */

export const SEARCH_A = "5e000000-0000-4000-8000-000000000001";

export const SEARCH_B = "5e000000-0000-4000-8000-000000000002";

export const LEAD_A = "1ead0000-0000-4000-8000-000000000001";

/** The owner is in Austin; the clock below is theirs. */
export const TZ = "America/Chicago";

export const NOW = new Date("2026-09-18T19:20:00.000Z");

export const plan = {
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "personal trainers in Austin with a website, about 200",
  terms: ["personal trainer"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 25_000,
    query: "Austin, TX, USA",
  },
  count: 200,
  contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
};

/** One round of a search, in the shape `lead_searches_view` answers (4.2 §3). */
export const round = (over = {}) => ({
  id: "r1",
  seq: 1,
  purpose: "main",
  state: "ended",
  ending: "target_reached",
  question: null,
  target: 200,
  counted: 161,
  qualified: 158,
  review: 2,
  excluded: 1,
  emails_checked: 88,
  with_phone: 72,
  ending_pending: false,
  waiting_since: null,
  cost_usd: 4.2,
  ended_at: "2026-09-18T16:00:00.000Z",
  undo_op_id: "op-1",
  undo_version: 3,
  ...over,
});

export const searchWith = (over = {}, roundOver = {}) => ({
  id: SEARCH_A,
  name: "Personal trainers · Austin",
  asked: plan.asked,
  asked_on: "2026-09-18T15:00:00.000Z",
  plan,
  plan_version: 1,
  round: round(roundOver),
  ...over,
});

export const SEARCH_DONE = searchWith();

export const SEARCH_WAITING = searchWith(
  { id: SEARCH_B, name: "Chiropractors · Round Rock" },
  {
    id: "r2",
    state: "waiting_on_owner",
    ending: null,
    counted: 25,
    question: { sentence: "Most of the first 25 were chain gyms. Keep leaving them out?", criterion_key: "chain" },
    waiting_since: "2026-09-18T18:00:00.000Z",
    ended_at: null,
  },
);

export const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };

/** One row, in the shape `leads_page` answers (4.2 §3). */
export const row = (over = {}) => ({
  id: LEAD_A,
  search_id: SEARCH_A,
  search_name: "Personal trainers · Austin",
  place_id: "ChIJfixture0001",
  business_name: "Zilker Strength Lab",
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  street: "1200 Barton Springs Rd",
  postal_code: "78704",
  phone: "+15125550101",
  phone_agrees: true,
  phone_wrong: false,
  email: "hello@zilkerstrength.example",
  email_state: "ok",
  email_checked_at: "2026-09-18T19:15:00.000Z",
  website: "zilkerstrength.example",
  instagram: null,
  rating: 5,
  reviews: 16,
  stage: "ready",
  closed_reason: null,
  contact_id: null,
  last_outcome: null,
  last_note: null,
  contacted_at: null,
  converted_at: null,
  places: 1,
  found_at: "2026-09-18T19:14:00.000Z",
  exported_at: null,
  version: 1,
  member: {
    class: "qualified",
    fit: "strong",
    reason: "Independent studio, one location, coaching only",
    excluded_by: null,
    distance_m: 1931,
    counted: true,
    checks: [],
    other_emails: [],
  },
  ...over,
});

/* ------------------------------ the nine endings, said once (Task 19 §19.2) */

/** What the source is bought through, and what checks the mailboxes: never on a screen, never in a word we export. */
export const VENDOR = /apify|compass|bounce ?verify|crawler|scraper|google places|serpapi/i;

export const MONEY = /\$\s?\d/;

export const ENDING_FACTS = {
  name: "personal trainers",
  area: "Austin",
  counted: 61,
  target: 200,
  emails: 88,
  phones: 72,
  excluded: 40,
  checking: false,
  foundBefore: 12,
  nearby: ["Round Rock", "Pflugerville"],
  seen: 86,
  leftOutBy: "part of chains",
};

/* ------------------------------------------------- the plan card's words (Task 9) */

export const CARD_PLAN = LeadSearchPlanSchema.parse({
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 25_000,
    query: "Austin, TX, USA",
  },
  count: 200,
  contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

export const PLAN_FACTS = {
  dupes: 14,
  leadsLeft: 486,
  bound: null,
  prior: { places: 1_200, matched: 700, with_email: 406 },
  priorOf: "trainers",
  renewsOn: "Oct 1",
  nearby: [],
};
