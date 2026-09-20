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
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leadsRoute, parseLeadsRoute, stageArgs, LeadStageInputSchema, leadDraftFooter,
  LEAD_DRAFT_JSON_SCHEMA, LEAD_SUGGEST_JSON_SCHEMA, LEAD_EMAIL_WORDS, outcomeMove,
  toLeadRowVM, leadRail, leadsStanding,
  leadEndingLine, leadAllowanceFact, leadAnd, LEAD_PAUSED_TITLE,
} from "../../../packages/contracts/src/leads.ts";
import { LEAD_ROUND_ENDINGS, LEAD_ENDING_WORDS } from "../../../packages/contracts/src/lead-search.ts";

/* ------------------------------------------------------------ the fixtures */

const SEARCH_A = "5e000000-0000-4000-8000-000000000001";
const SEARCH_B = "5e000000-0000-4000-8000-000000000002";
const LEAD_A = "1ead0000-0000-4000-8000-000000000001";
/** The owner is in Austin; the clock below is theirs. */
const TZ = "America/Chicago";
const NOW = new Date("2026-09-18T19:20:00.000Z");

const plan = {
  version: 1, card: "local_businesses", name: "personal trainers",
  asked: "personal trainers in Austin with a website, about 200",
  terms: ["personal trainer"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
};

/** One round of a search, in the shape `lead_searches_view` answers (4.2 §3). */
const round = (over = {}) => ({
  id: "r1", seq: 1, purpose: "main", state: "ended", ending: "target_reached", question: null,
  target: 200, counted: 161, qualified: 158, review: 2, excluded: 1,
  emails_checked: 88, with_phone: 72, ending_pending: false, waiting_since: null,
  cost_usd: 4.2, ended_at: "2026-09-18T16:00:00.000Z", undo_op_id: "op-1", undo_version: 3,
  ...over,
});
const searchWith = (over = {}, roundOver = {}) => ({
  id: SEARCH_A, name: "Personal trainers · Austin", asked: plan.asked,
  asked_on: "2026-09-18T15:00:00.000Z", plan, plan_version: 1, round: round(roundOver), ...over,
});
const SEARCH_DONE = searchWith();
const SEARCH_WAITING = searchWith({ id: SEARCH_B, name: "Chiropractors · Round Rock" }, {
  id: "r2", state: "waiting_on_owner", ending: null, counted: 25,
  question: { sentence: "Most of the first 25 were chain gyms. Keep leaving them out?", criterion_key: "chain" },
  waiting_since: "2026-09-18T18:00:00.000Z", ended_at: null,
});
const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };

/** One row, in the shape `leads_page` answers (4.2 §3). */
const row = (over = {}) => ({
  id: LEAD_A, search_id: SEARCH_A, search_name: "Personal trainers · Austin", place_id: "ChIJfixture0001",
  business_name: "Zilker Strength Lab", category: "Personal trainer",
  city: "Austin", state: "TX", street: "1200 Barton Springs Rd", postal_code: "78704",
  phone: "+15125550101", phone_agrees: true, phone_wrong: false,
  email: "hello@zilkerstrength.example", email_state: "ok", email_checked_at: "2026-09-18T19:15:00.000Z",
  website: "zilkerstrength.example", instagram: null, rating: 5, reviews: 16,
  stage: "ready", closed_reason: null, contact_id: null,
  last_outcome: null, last_note: null, contacted_at: null, converted_at: null,
  places: 1, found_at: "2026-09-18T19:14:00.000Z", exported_at: null, version: 1,
  member: {
    class: "qualified", fit: "strong", reason: "Independent studio, one location, coaching only",
    excluded_by: null, distance_m: 1931, counted: true, checks: [], other_emails: [],
  },
  ...over,
});

/* ------------------------------------------------------------- the tests -- */

test("a view of the Leads scope is a route Ask can cite and the page can read back", () => {
  const route = leadsRoute({ searchId: "5e000000-0000-4000-8000-000000000001", list: "ready", cls: "review" });
  assert.equal(route, "clients/leads:s-5e000000-0000-4000-8000-000000000001:l-ready:c-review");
  assert.match(route.slice("clients/".length), /^[A-Za-z0-9:_-]+$/, "the citation grammar Ask grounds pages with (ask.ts PAGE_PREFIX)");
  assert.deepEqual(parseLeadsRoute(route), { searchId: "5e000000-0000-4000-8000-000000000001", list: "ready", cls: "review", chips: {} });
  assert.deepEqual(parseLeadsRoute("clients/leads"), { searchId: null, list: "all", cls: null, chips: {} });
  assert.equal(parseLeadsRoute("clients/p-123"), null);
});

test("a stage change in the page's words becomes the door's arguments; the door, not the page, decides what converts", () => {
  const args = (x) => stageArgs(LeadStageInputSchema.parse(x));
  assert.deepEqual(args({ kind: "stage", stage: "nurture" }), { p_stage: "nurture", p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null });
  assert.deepEqual(args({ kind: "stage", stage: "converted" }), { p_stage: "converted", p_reason: null, p_fit_reason: null, p_outcome: null, p_note: null }, "a click says Talking; it never says convert");
  assert.deepEqual(args({ kind: "not_a_fit", why: "customer" }), { p_stage: "archived", p_reason: "customer", p_fit_reason: "customer", p_outcome: null, p_note: null });
  assert.deepEqual(args({ kind: "not_a_fit", why: "chain" }), { p_stage: "archived", p_reason: "not_a_fit", p_fit_reason: "chain", p_outcome: null, p_note: null });
  assert.deepEqual(args({ kind: "said_no" }), { p_stage: "archived", p_reason: "said_no", p_fit_reason: null, p_outcome: null, p_note: null });
  assert.deepEqual(args({ kind: "outcome", outcome: "interested", note: "Wants a call Tuesday" }), { p_stage: "converted", p_reason: null, p_fit_reason: null, p_outcome: "interested", p_note: "Wants a call Tuesday" });
  assert.deepEqual(args({ kind: "outcome", outcome: "wrong_number" }), { p_stage: null, p_reason: null, p_fit_reason: null, p_outcome: "wrong_number", p_note: null });
  assert.deepEqual(args({ kind: "emailed" }), { p_stage: "nurture", p_reason: null, p_fit_reason: null, p_outcome: "emailed", p_note: null });
  assert.deepEqual([outcomeMove("interested").converts, outcomeMove("call_back").converts], [true, false], "only Interested makes a person");
});

test("the email states are words that claim only what was seen: a catch-all is Unconfirmed", () => {
  assert.deepEqual(LEAD_EMAIL_WORDS, { none: "No email", checking: "Checking", ok: "Checked", catch_all: "Unconfirmed", unknown: "Couldn't check", invalid: "Bounces" });
});

test("a draft's foot is code's: the business's address and a way to say no, as US law asks", () => {
  assert.equal(leadDraftFooter("Zilker Strength Lab", "1200 Barton Springs Rd, Austin, TX 78704"), "\n\n—\nZilker Strength Lab · 1200 Barton Springs Rd, Austin, TX 78704\nNot interested? Reply \"no thanks\" and I won't write again.");
});

test("the answer schemas are the structured-output shape: every property required, no length keywords", () => {
  for (const s of [LEAD_DRAFT_JSON_SCHEMA, LEAD_SUGGEST_JSON_SCHEMA]) {
    assert.equal(s.additionalProperties, false);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
    assert.equal(/minLength|maxLength|minimum|maximum/.test(JSON.stringify(s)), false);
  }
});

test("one row is words and shapes, never a stored value: the fit band, the email word, the phone's agreement, found as 6m", () => {
  const vm = toLeadRowVM(row(), TZ, NOW);
  assert.deepEqual(vm, {
    id: LEAD_A, searchId: SEARCH_A, searchName: "Personal trainers · Austin",
    mark: "ZS", name: "Zilker Strength Lab", places: 1, category: "Personal trainer", area: "78704 · Austin, TX",
    cls: "qualified", fitLabel: "Strong fit", fitTitle: "Independent studio, one location, coaching only · 5.0 from 16 reviews",
    email: "hello@zilkerstrength.example", emailState: "ok", emailLabel: "hello@zilkerstrength.example", emailWord: "Checked",
    phone: "+15125550101", phoneAgrees: true, phoneWrong: false,
    why: "Independent studio, one location, coaching only", rating: "5.0 · 16",
    stage: "ready", stageLabel: "Ready", foundLabel: "6m", foundAt: "Sep 18, 2026 · 2:14 PM",
    distance: "1.2 mi", source: "Google Maps listing", host: "zilkerstrength.example",
    excludedBy: null, version: 1,
  });
  const review = toLeadRowVM(row({ email: null, email_state: "unknown", member: { ...row().member, class: "review", fit: "look", reason: "Couldn't check the email" } }), TZ, NOW);
  assert.deepEqual([review.fitLabel, review.emailWord, review.emailLabel], ["Couldn't check the email", "Couldn't check", ""], "Needs review says why, and an address nobody could check is not claimed");
  const excluded = toLeadRowVM(row({ member: { ...row().member, class: "excluded", fit: null, excluded_by: "chain", reason: "A chain with 40 locations" } }), TZ, NOW);
  assert.deepEqual([excluded.excludedBy, excluded.fitLabel, excluded.fitTitle], ["Chain", "Chain", "Left out: Chain"], "Excluded wears the criterion that left it out");
  const closed = toLeadRowVM(row({ stage: "archived", closed_reason: "not_a_fit" }), TZ, NOW);
  assert.deepEqual([closed.stage, closed.stageLabel], ["archived", "Not a fit"], "a closed lead says why it closed, never 'archived'");
  const bare = toLeadRowVM(row({ category: null, city: null, state: null, postal_code: null, rating: null, reviews: null, website: null, phone: null, member: { ...row().member, distance_m: null } }), TZ, NOW);
  assert.deepEqual([bare.area, bare.rating, bare.host, bare.distance, bare.phone], ["", "", "", "", null], "a fact nobody has is blank, never a zero");
});

test("the rail and the standing line count what the lists hold, and say who needs you", () => {
  const rail = leadRail(COUNTS, [SEARCH_WAITING, SEARCH_DONE]);
  assert.deepEqual(rail.lists.map((l) => [l.label, l.count]), [["All leads", 322], ["Ready", 272], ["Contacted", 31], ["Talking", 9], ["Said no", 6], ["Not a fit", 4]]);
  assert.deepEqual(rail.searches.map((s) => s.mark), ["question", null]);
  assert.deepEqual(rail.searches.map((s) => [s.name, s.count]), [["Chiropractors · Round Rock", 25], ["Personal trainers · Austin", 161]]);
  assert.deepEqual(leadsStanding(COUNTS, [SEARCH_WAITING, SEARCH_DONE]), { total: "322 leads", parts: ["272 ready", "2 searches"], needsYou: { count: 1, searchId: SEARCH_WAITING.id } });
  assert.deepEqual(leadRail({ ...COUNTS, said_no: 0 }, []).lists.map((l) => l.label), ["All leads", "Ready", "Contacted", "Talking", "Not a fit"], "Said no only when there are any");
  assert.deepEqual(leadsStanding(COUNTS, [SEARCH_DONE]), { total: "322 leads", parts: ["272 ready", "1 search"], needsYou: null }, "one search is a search");
  assert.deepEqual(leadRail(COUNTS, [searchWith({ id: SEARCH_B }, { state: "running", ending: null, ended_at: null })]).searches.map((s) => s.mark), ["live"]);
});

/* ------------------------------ the nine endings, said once (Task 19 §19.2) */

/** What the source is bought through, and what checks the mailboxes: never on a screen, never in a word we export. */
const VENDOR = /apify|compass|bounce ?verify|crawler|scraper|google places|serpapi/i;
const MONEY = /\$\s?\d/;

const ENDING_FACTS = {
  name: "personal trainers", area: "Austin", counted: 61, target: 200, emails: 88, phones: 72, excluded: 40,
  checking: false, foundBefore: 12, nearby: ["Round Rock", "Pflugerville"], seen: 86, leftOutBy: "part of chains",
};

test("every ending is one line: what happened, what was kept, what was counted, and at most one next step", () => {
  assert.equal(LEAD_ROUND_ENDINGS.length, 9);
  for (const ending of LEAD_ROUND_ENDINGS) {
    const line = leadEndingLine(ending, ENDING_FACTS);
    assert.equal(line.mark, LEAD_ENDING_WORDS[ending], `${ending}: the ending's own word is the strip's name`);
    assert.ok(line.title.length > 0, `${ending}: a title`);
    const said = [line.title, ...line.parts, line.step ? line.step.label : ""].join(" ");
    assert.ok(!MONEY.test(said), `${ending} says a dollar amount: ${said}`);
    assert.ok(!VENDOR.test(said), `${ending} names the vendor: ${said}`);
    assert.ok(/\d/.test(said) || ending === "paused", `${ending}: a number the owner can check`);
  }
});

test("the endings read as the States artboard wrote them", () => {
  const line = (ending, over = {}) => leadEndingLine(ending, { ...ENDING_FACTS, ...over });
  const said = (l) => [l.title, ...l.parts].join(" · ");
  assert.equal(said(line("target_reached", { counted: 200 })), "Found 200 personal trainers · 88 you can email · 72 by phone · 40 left out");
  assert.deepEqual(line("target_reached", { counted: 200 }).step, { id: "excluded", label: "40 left out" });
  assert.equal(said(line("searched_everything", { counted: 160 })), "Found 160 personal trainers · everything these searches returned in Austin");
  assert.deepEqual(line("searched_everything", { counted: 160 }).step, { id: "nearby", label: "Find 40 more nearby" });
  assert.equal(
    said(line("searched_everything", { counted: 0, seen: 3, area: "Marfa, TX", leftOutBy: "part of chains", nearby: ["Alpine", "Fort Davis"] })),
    "There are 3 personal trainers in Marfa, TX, and all of them are part of chains, which you asked me to leave out. · Nothing was counted.",
  );
  assert.equal(said(line("month_leads_used", { counted: 464 })), "Stopped at 464 · this month's leads are used · the 464 found are yours");
  assert.equal(said(line("budget_used")), "Stopped at 61 · this month's searching is used up · the 61 found are yours");
  assert.equal(said(line("few_new_matches", { name: "chiropractors", seen: 64 })), "All 64 chiropractors in Austin are already yours. · Look further out, in Round Rock and Pflugerville?");
  assert.equal(said(line("stopped", { checking: true })), "Stopping · checking the emails of the 61 found · nothing else was counted");
  assert.equal(said(line("stopped")), "Stopped at 61 · the 61 found are yours · nothing else was counted");
  assert.equal(said(line("source_failed")), "Stopped at 86: the source stopped answering · the 61 found are yours · nothing more was counted");
  assert.equal(said(line("question_unanswered")), "Stopped after a day without your answer · the 12 found before it asked are yours");
  assert.equal(said(line("paused")), "Lead searches are paused for now · your leads are all here · nothing is being counted");
  assert.equal(line("paused").step, null, "nothing to press: it is not this workspace's to turn on");
  assert.equal(LEAD_PAUSED_TITLE, "Lead searches are paused for now");
  assert.equal(leadAnd(["Alpine", "Fort Davis"]), "Alpine and Fort Davis");
  assert.equal(leadAnd(["Round Rock", "Pflugerville", "Kyle"]), "Round Rock, Pflugerville and Kyle");
});

test("the month's allowance and the searching budget are one unit on every screen: leads, never dollars", () => {
  assert.equal(leadAllowanceFact(486), "486 left this month");
  const budget = leadEndingLine("budget_used", ENDING_FACTS);
  assert.ok(budget.parts.includes("this month's searching is used up"));
  assert.ok(!/\$|usd|dollar|budget of/i.test([budget.title, ...budget.parts].join(" ")));
  assert.ok(leadEndingLine("month_leads_used", ENDING_FACTS).parts.includes("this month's leads are used"));
});

/* ------------------------------------------------- a search, kept (§8.10) */
// Its own import, at the foot with its tests, so the block above stays whoever's it was.
import { leadSearchWords, LEAD_REMOVE_KEEPS } from "../../../packages/contracts/src/leads.ts";

test("a kept search says what was asked, in the owner's words and the date they asked", () => {
  const s = {
    id: "5e000000-0000-4000-8000-000000000001",
    name: "Personal trainers · Austin",
    asked: "personal trainers in Austin with a website, about 200",
    asked_on: "2026-09-18T20:00:00.000Z",
    plan: { criteria: [{ key: "website", text: "has a website", standard: "seen", required: true }], exclusions: [{ key: "chain", text: "chain gyms", origin: "claude" }, { key: "pt", text: "physical therapists and chiropractors", origin: "claude" }] },
  };
  assert.deepEqual(leadSearchWords(s, "America/Chicago"), {
    askedLine: "You asked on Sep 18: “personal trainers in Austin with a website, about 200”. Leaving out chain gyms and physical therapists and chiropractors.",
    keepsLine: "Keeps the ones you contacted or are talking to.",
  });
  assert.deepEqual(leadSearchWords({ ...s, plan: { criteria: [], exclusions: [] } }, "America/Chicago").askedLine, "You asked on Sep 18: “personal trainers in Austin with a website, about 200”.", "nothing left out, nothing said about it");
  assert.deepEqual(leadSearchWords(null, "America/Chicago"), { askedLine: "", keepsLine: LEAD_REMOVE_KEEPS }, "a search the page does not hold says nothing about what was asked");
});
