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
  toLeadPeekVM, toLeadRowVM, leadRail, leadUndoable, leadsStanding, leadReviewGroups,
  leadEndingLine, leadAllowanceFact, leadAnd, LEAD_PAUSED_TITLE, leadBand, leadTintOf, leadWeekBars, leadMapPlot,
  leadPlanAsk, leadPlanFacts, leadPlanLikely,
} from "../../../packages/contracts/src/leads.ts";
import { LEAD_ROUND_ENDINGS, LEAD_ENDING_WORDS, LeadSearchPlanSchema } from "../../../packages/contracts/src/lead-search.ts";

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
  // D2: the two contacts as one glance for the Reach column, and the listing's photo for the row's mark.
  assert.deepEqual(vm.reach, { email: { address: row().email, state: row().email_state, word: LEAD_EMAIL_WORDS[row().email_state] }, phone: { number: row().phone, agrees: row().phone_agrees } });
  assert.equal(vm.image, null, "a row from before D2 has no photo, and says so with nothing");
  assert.equal(toLeadRowVM(row({ image_url: "https://lh3.example/p.jpg" }), TZ, NOW).image, "https://lh3.example/p.jpg");
  assert.deepEqual(toLeadRowVM(row({ email: null, email_state: "none", phone: null }), TZ, NOW).reach, { email: null, phone: null });
  assert.deepEqual(vm, {
    id: LEAD_A, searchId: SEARCH_A, searchName: "Personal trainers · Austin",
    mark: "ZS", name: "Zilker Strength Lab", places: 1, category: "Personal trainer", area: "78704 · Austin, TX",
    cls: "qualified", fit: "strong", fitLabel: "Strong fit", fitTitle: "Independent studio, one location, coaching only · 5.0 from 16 reviews",
    email: "hello@zilkerstrength.example", emailState: "ok", emailLabel: "hello@zilkerstrength.example", emailWord: "Checked",
    phone: "+15125550101", phoneAgrees: true, phoneWrong: false,
    reach: { email: { address: "hello@zilkerstrength.example", state: "ok", word: "Checked" }, phone: { number: "+15125550101", agrees: true } },
    image: null, reasons: [],
    why: "Independent studio, one location, coaching only", rating: "5.0 · 16", reviewsTitle: "",
    stage: "ready", stageLabel: "Ready", foundLabel: "6m", foundAt: "Sep 18, 2026 · 2:14 PM",
    distance: "1.2 mi", source: "Google Maps listing", host: "zilkerstrength.example",
    excludedBy: null, version: 1,
    // D5: the row as the redesign reads it.
    sub: "Personal trainer · 78704 · 1.2 mi",
    slots: {
      phone: { state: "ok", value: "+15125550101", word: "Checked", tip: "+15125550101 — the same number on Google Maps and on their website", copy: true },
      mailbox: { state: "ok", value: "hello@zilkerstrength.example", word: "Checked", tip: "hello@zilkerstrength.example — Mailbox exists", copy: true },
    },
    rated: { score: "5.0", count: "16" }, spread: null,
    tile: { initials: "ZS", tint: leadTintOf("Personal trainer"), image: null },
    waitsOn: null, state: "ready", stateTag: null,
    card: { about: null, today: null, where: { line: "1200 Barton Springs Rd, Austin, TX 78704", href: null }, site: { label: "zilkerstrength.example", href: "https://zilkerstrength.example" }, maps: null, found: [{ at: "2:14 PM", what: "On a Google Maps listing" }] },
    point: null,
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
  const rail = leadRail(COUNTS, [SEARCH_WAITING, SEARCH_DONE], NOW);
  // The rail row says whether the search's untouched leads may still be removed, so the menu reads it off the row.
  assert.deepEqual(rail.searches.map((s) => s.undoable), [false, leadUndoable(SEARCH_DONE, NOW)]);
  assert.equal(leadUndoable({ round: { undo_op_id: null, ended_at: new Date(NOW.getTime() - 60_000).toISOString() } }, NOW), true);
  assert.equal(leadUndoable({ round: { undo_op_id: "op-1", ended_at: new Date(NOW.getTime() - 60_000).toISOString() } }, NOW), false, "used once");
  assert.equal(leadUndoable({ round: { undo_op_id: null, ended_at: new Date(NOW.getTime() - 25 * 3_600_000).toISOString() } }, NOW), false, "a day is the window");
  assert.equal(leadUndoable({ round: null }, NOW), false);
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
  // "already yours" read as dedupe, and it stood beside an Undo. "Found all" says what happened: the area ran dry.
  assert.equal(said(line("few_new_matches", { name: "chiropractors", seen: 64 })), "Found all 64 chiropractors in Austin · the 61 found are yours · Look further out, in Round Rock and Pflugerville?");
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

/* ------------------------------------------------- the plan card's words (Task 9) */

const CARD_PLAN = LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "personal trainers", asked: "200 personal trainers in Austin with a website",
  terms: ["personal trainer", "strength coach", "fitness coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
});

const PLAN_FACTS = { dupes: 14, leadsLeft: 486, bound: null, prior: { places: 1_200, matched: 700, with_email: 406 }, priorOf: "trainers", cannotSee: null, renewsOn: "Oct 1", nearby: [] };

test("the plan card's facts are the PRD's three, in leads, with no dollar meter", () => {
  assert.deepEqual(leadPlanFacts(CARD_PLAN, PLAN_FACTS), [
    "About 48 minutes — leave the page if you like",
    // No number: the card cannot know how many of THIS search's places are already here until it has looked.
    "Anything already yours is skipped",
    "Counts only matches you can reach · 486 left this month",
  ]);
  assert.equal(/\$/.test(leadPlanFacts(CARD_PLAN, PLAN_FACTS).join(" ")), false);
});

test("Likely says what past searches found, and a kind never searched says the share is checked after the first 25", () => {
  assert.deepEqual(leadPlanLikely(CARD_PLAN, PLAN_FACTS), { emailPct: 58, phonePct: 42, line: "About 116 will have an email; the rest you call · from past searches for trainers" });
  const fresh = leadPlanLikely(CARD_PLAN, { ...PLAN_FACTS, prior: null });
  assert.deepEqual(fresh, { emailPct: null, phonePct: null, line: "How many have an email is checked after the first 25." });
  const thin = leadPlanLikely(CARD_PLAN, { ...PLAN_FACTS, prior: { places: 12, matched: 7, with_email: 4 } });
  assert.equal(thin.emailPct, null, "too few places judged to say a number from");
});

test("when a limit binds, the count is clamped to what is left, the button says that number and one sentence says why", () => {
  assert.deepEqual(leadPlanAsk(CARD_PLAN, PLAN_FACTS), { count: 200, label: "Find 200 leads", covers: null });
  const budget = leadPlanAsk(CARD_PLAN, { ...PLAN_FACTS, leadsLeft: 60, bound: "budget" });
  assert.deepEqual(budget, { count: 60, label: "Find 60 leads", covers: "Emails for personal trainers are hard to find, so this month covers about 60 more. Find 60 now?" });
  const month = leadPlanAsk(CARD_PLAN, { ...PLAN_FACTS, leadsLeft: 36, bound: "allowance" });
  assert.deepEqual(month, { count: 36, label: "Find 36 leads", covers: "You have 36 leads left this month. Your leads renew on Oct 1." });
  assert.equal(/\$/.test(`${budget.covers} ${month.covers}`), false, "no dollar meter, ever");
  assert.equal(leadPlanAsk(CARD_PLAN, { ...PLAN_FACTS, leadsLeft: 600, bound: "allowance" }).covers, null, "a limit above the ask does not bind");
});

test("Needs review is grouped by what resolves it, in the order an owner would work it", () => {
  const rv = (id, reasons) => ({ id, cls: "review", reasons });
  const rows = [
    rv("a", ["email:checking"]), rv("b", ["email:unknown"]), rv("c", ["email:none"]), rv("d", ["email:catch_all"]),
    rv("e", ["unknown:website"]), rv("f", ["inferred:website"]), rv("g", ["out_of_area"]), rv("h", ["email:unknown", "unknown:website"]), rv("i", ["email:invalid"]), rv("j", ["email:ok"]), rv("k", ["email:ok", "unknown:website"]),
    { id: "q", cls: "qualified", reasons: [] },
  ];
  const groups = leadReviewGroups(rows, SEARCH_DONE);
  assert.deepEqual(groups.map((g) => [g.id, g.label, g.ids, g.acts]), [
    ["mailbox_waiting", "Waiting on the mailbox check", ["a"], []],
    ["checks_out", "Their email checks out", ["j"], ["keep", "exclude"]],
    ["mailbox_silent", "Their mail server wouldn't answer", ["b", "h"], ["check_again", "keep", "exclude"]],
    ["bad_email", "Their email bounces", ["i"], ["find_email", "keep", "exclude"]],
    ["no_email", "No email on their site", ["c"], ["find_email", "keep", "exclude"]],
    ["catch_all", "Unconfirmed — the mailbox accepts any address", ["d"], ["keep", "exclude"]],
    ["unsure", "Couldn't tell if — with a website", ["e", "k"], ["keep", "exclude"]],
    ["read_only", "Only the listing says so — with a website", ["f"], ["keep", "exclude"]],
    ["out_of_area", "Just outside the area you asked for", ["g"], ["keep", "exclude"]],
  ], "one group per resolver, a lead in the first group that fits it, the criterion named in the owner's words, a qualified row in none, and an address that checks out groups a lead only when nothing else holds it back");
  assert.deepEqual(leadReviewGroups([], SEARCH_DONE), []);
  assert.deepEqual(leadReviewGroups([{ id: "old", cls: "review", reasons: [] }], SEARCH_DONE), [], "a row from before D3 carries no reasons and lands in no group");
  assert.deepEqual(toLeadRowVM(row({ member: { ...row().member, class: "review", reasons: ["email:none"] } }), TZ, NOW).reasons, ["email:none"], "the row VM carries them, so the page can group without the DTO");
});

// D5: the row as the redesign reads it. NOW is a Friday in America/Chicago.
test("D5: the row reads a sub-line, two reach slots, the tile, what it waits on, its state, and the name card's facts", () => {
  const vm = toLeadRowVM(row({ neighborhood: "Bouldin", about: "Coaching only.", hours: [{ day: "Friday", hours: "6 AM to 8 PM" }], maps_url: "https://maps.example/?cid=1", rank: 3, reviews_dist: { one: 0, two: 1, three: 1, four: 4, five: 10 }, lat: 30.25, lng: -97.75 }), TZ, NOW, SEARCH_DONE);
  assert.equal(vm.sub, "Personal trainer · Bouldin · 78704 · 1.2 mi", "whatever the source gave, in that order");
  assert.deepEqual([vm.slots.phone.state, vm.slots.phone.word, vm.slots.mailbox.state, vm.slots.mailbox.copy], ["ok", "Checked", "ok", true]);
  assert.match(vm.slots.mailbox.tip, /^hello@zilkerstrength\.example — Mailbox exists$/, "the tip gives the value back, with the sentence behind the shape");
  assert.deepEqual(vm.rated, { score: "5.0", count: "16" });
  assert.deepEqual(vm.spread, [0, 1, 1, 4, 10]);
  assert.deepEqual([vm.tile.initials, vm.tile.image], [vm.mark, null]);
  assert.ok(vm.tile.tint >= 1 && vm.tile.tint <= 6);
  assert.equal(vm.tile.tint, leadTintOf("Personal trainer"), "the same kind, the same tint");
  assert.notEqual(leadTintOf("Personal trainer"), leadTintOf("Book store"), "two kinds, two tints (these two)");
  assert.deepEqual([vm.waitsOn, vm.state, vm.stateTag], [null, "ready", null], "Ready is silent");
  assert.equal(vm.card.today, "Open today · 6 AM to 8 PM");
  assert.equal(vm.card.about, "Coaching only.");
  assert.deepEqual(vm.card.where, { line: "1200 Barton Springs Rd, Austin, TX 78704", href: "https://maps.example/?cid=1" });
  assert.deepEqual([vm.card.site, vm.card.maps], [{ label: "zilkerstrength.example", href: "https://zilkerstrength.example" }, { label: "Google Maps", href: "https://maps.example/?cid=1" }]);
  assert.equal(vm.card.found[0].what, "On Google Maps, #3 for “personal trainer”");
  assert.deepEqual(vm.point, { lat: 30.25, lng: -97.75 });
  // The five states a slot can wear.
  const slot = (over) => toLeadRowVM(row(over), TZ, NOW).slots;
  assert.deepEqual([slot({ phone_agrees: false }).phone.state, slot({ phone_wrong: true }).phone.state, slot({ phone: null }).phone.state], ["part", "bad", "none"]);
  assert.deepEqual(
    [slot({ email_state: "catch_all" }).mailbox.state, slot({ email_state: "unknown" }).mailbox.state, slot({ email_state: "invalid" }).mailbox.state, slot({ email_state: "checking" }).mailbox.state, slot({ email: null, email_state: "none" }).mailbox.state],
    ["part", "part", "bad", "checking", "none"],
  );
  assert.match(slot({ email_state: "unknown" }).mailbox.tip, /mail server wouldn't answer/, "the same shape as a catch-all, its own sentence");
  assert.equal(slot({ email: null, email_state: "none" }).mailbox.tip, "No email found on their site — home, contact and about pages checked", "says what was looked at, never just the word none");
  // A lead from a source that rates nothing, shows no photo and names no ZIP still reads cleanly.
  const bare = toLeadRowVM(row({ category: "Software company", postal_code: null, rating: null, reviews: null, member: { ...row().member, distance_m: null } }), TZ, NOW);
  assert.deepEqual([bare.sub, bare.rated, bare.spread, bare.tile.image, bare.point], ["Software company", null, null, null, null]);
  assert.equal(toLeadRowVM(row({ category: null, postal_code: null, member: { ...row().member, distance_m: null } }), TZ, NOW).sub, "");
  // The states a row wears.
  const st = (over) => { const v = toLeadRowVM(row(over), TZ, NOW, SEARCH_DONE); return [v.state, v.stateTag, v.waitsOn]; };
  assert.deepEqual(st({ stage: "nurture", contacted_at: "2026-09-15T19:20:00.000Z" }), ["contacted", "Contacted · 3d", null]);
  assert.deepEqual(st({ stage: "converted" }), ["talking", "Talking", null]);
  assert.deepEqual(st({ stage: "archived", closed_reason: "not_a_fit" }), ["out", "Not a fit", null]);
  assert.deepEqual(st({ member: { ...row().member, class: "review", fit: "look", reasons: ["email:unknown"] } }), ["review", null, "Their mail server wouldn't answer"], "a waiting row names the thing that resolves it");
  assert.deepEqual(st({ member: { ...row().member, class: "excluded", fit: null, excluded_by: "chain" } }), ["out", "Left out", null]);
});

test("D5: the week's hours as bars, and the peek's own additions -- the tile, the rating apart, the checks' head, the facts", () => {
  const bars = leadWeekBars([{ day: "Monday", hours: "9 AM to 6 PM" }, { day: "Tuesday", hours: "Closed" }, { day: "Wednesday", hours: "Open 24 hours" }, { day: "Thursday", hours: "10:30 AM to 1 AM" }, { day: "Friday", hours: "by appointment" }], TZ, NOW);
  assert.deepEqual(bars.map((b) => [b.day, b.bar, b.today]), [
    ["Monday", { x: 37.5, w: 37.5 }, false], ["Tuesday", null, false], ["Wednesday", { x: 0, w: 100 }, false],
    ["Thursday", { x: 43.8, w: 56.3 }, false], ["Friday", null, true],
  ], "a bar across the day; closed and unreadable lines draw nothing and keep their words; overnight runs to the end of the day");
  assert.equal(bars[4].hours, "by appointment");
  const vm = toLeadPeekVM(row({ hours: [{ day: "Friday", hours: "6 AM to 8 PM" }], claimed: false, price: "$$", rank: 3, places: 2, member: { ...row().member, checks: [
    { key: "on_maps", how: "seen", answer: "yes", source: "Google Maps", reason: null },
    { key: "mailbox", how: "seen", answer: "unknown", source: "Mailbox check", reason: null },
    { key: "independent", how: "read", answer: "no", source: "Claude", reason: "a franchise" },
  ] } }), SEARCH_DONE, TZ, NOW);
  assert.deepEqual([vm.tile, vm.rated, vm.distance, vm.checksSummary], [{ initials: "ZS", tint: leadTintOf("Personal trainer") }, { score: "5.0", count: "16" }, "1.2 mi", "1 check passed · 1 couldn't tell · 1 failed"]);
  assert.deepEqual(vm.week.map((d) => [d.day, d.today, d.bar]), [["Friday", true, { x: 25, w: 58.3 }]]);
  assert.deepEqual(vm.facts, [{ k: "Kind", v: "Personal trainer" }, { k: "Price", v: "$$" }, { k: "Rated", v: "5.0 from 16 reviews" }, { k: "Listing", v: "Not claimed by the owner" }, { k: "Found at", v: "#3 for “personal trainer”" }, { k: "Other listings", v: "2 listings for this business" }]);
  assert.deepEqual([vm.slots.phone.state, vm.slots.mailbox.state], ["ok", "ok"]);
  assert.equal(toLeadPeekVM(row({ member: { ...row().member, checks: [] } }), SEARCH_DONE, TZ, NOW).checksSummary, "", "no checks, no head");
});

test("D5: the band is the search's whole shape, and the fit split is worth drawing only when the fits differ", () => {
  const band = leadBand(searchWith({}, { qualified: 19, review: 2, excluded: 7, fits: { strong: 11, look: 6, long: 2 } }));
  assert.deepEqual(band.classes, [{ id: "qualified", label: "19 qualified", count: 19 }, { id: "review", label: "2 need a look", count: 2 }, { id: "excluded", label: "7 left out", count: 7 }]);
  assert.deepEqual(band.fits.map((f) => [f.id, f.label, f.count]), [["strong", "Strong fit", 11], ["look", "Worth a look", 6], ["long", "Long shot", 2]]);
  assert.equal(band.mixed, true);
  assert.equal(leadBand(searchWith({}, { fits: { strong: 19, look: 0, long: 0 } })).mixed, false, "every row strong: the split says nothing");
  assert.equal(leadBand(searchWith({}, { review: 1 })).classes[1].label, "1 needs a look");
  assert.deepEqual(leadBand(searchWith({}, { review: 1 })).fits.map((f) => f.count), [0, 0, 0], "a round from before carries no split");
  assert.equal(leadBand(null), null);
});

// D2: who they are, from what the listing shows. NOW is a Friday in America/Chicago.
test("the peek knows who they are: their own words, where, whether they are open today, what they look like, the spread of reviews, the socials, whether the listing is claimed, the rank it was found at", () => {
  const shown = {
    about: "Waterfront venue for weddings.", street: "101 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33132", price: "$$",
    hours: [{ day: "Friday", hours: "9 AM to 6 PM" }, { day: "Saturday", hours: "Closed" }], image_url: "https://lh3.example/p.jpg",
    reviews_dist: { one: 1, two: 0, three: 2, four: 8, five: 30 }, facebook_url: "https://www.facebook.example/x", linkedin_url: null, tiktok_url: "https://www.tiktok.example/@x",
    claimed: false, maps_url: "https://maps.example/?cid=1", rank: 3,
  };
  const v = toLeadPeekVM(row(shown), SEARCH_DONE, TZ, NOW);
  assert.equal(v.about, "Waterfront venue for weddings.");
  assert.deepEqual(v.where, { line: "101 Biscayne Blvd, Miami, FL 33132", href: "https://maps.example/?cid=1" });
  assert.equal(v.today, "Open today · 9 AM to 6 PM");
  assert.equal(toLeadPeekVM(row(shown), SEARCH_DONE, TZ, new Date(NOW.getTime() + 86_400_000)).today, "Closed today", "Saturday");
  assert.equal(toLeadPeekVM(row({ ...shown, hours: [] }), SEARCH_DONE, TZ, NOW).today, null, "no hours, no line");
  assert.equal(v.image, "https://lh3.example/p.jpg");
  assert.equal(v.sub, "Personal trainer · $$ · Miami, FL", "the price rides the sub-line between the kind and the place");
  assert.deepEqual(v.reviewsDist, [1, 0, 2, 8, 30]);
  assert.deepEqual([v.links.facebook?.label, v.links.linkedin, v.links.tiktok?.label, v.links.maps?.label], ["Facebook", null, "TikTok", "Google Maps"], "each social the listing gave, and the Maps page");
  assert.equal(v.claimedNote, "Listing not claimed by the owner", "an unclaimed listing rarely watches its email");
  assert.equal(toLeadPeekVM(row({ ...shown, claimed: true }), SEARCH_DONE, TZ, NOW).claimedNote, null);
  assert.equal(toLeadPeekVM(row({ ...shown, claimed: null }), SEARCH_DONE, TZ, NOW).claimedNote, null, "a listing that did not say is not called unclaimed");
  assert.match(v.found[0].what, /^On Google Maps, #3 for “/, "the rank rides the first line of Found");
  const before = toLeadPeekVM(row(), SEARCH_DONE, TZ, NOW);
  assert.deepEqual([before.about, before.today, before.image, before.reviewsDist, before.claimedNote, before.links.facebook, before.links.maps], [null, null, null, null, null, null, null], "a lead from before D2 claims none of it");
  assert.match(before.found[0].what, /^On Google Maps, searching “/, "and is found the way it was");
});

// D5: the same leads, on the ground. A plot of one town, measured in metres from one centre -- no projection of
// the world, no tile, and no request to anybody.
test("D5: the map plots every lead the door placed, and the area the search asked for, in one square", () => {
  const AREA = { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 8000, query: "Austin, TX, USA" };
  const at = (id, lat, lng) => ({ id, point: { lat, lng } });
  const plot = leadMapPlot([at("a", 30.2672, -97.7431), at("b", 30.3122, -97.7431), at("c", 30.2672, -97.6912), { id: "d", point: null }], AREA);
  assert.deepEqual(plot.pins.map((p) => p.id), ["a", "b", "c"], "a lead the source placed nowhere is not on it");
  const a = plot.pins[0];
  assert.deepEqual([Math.round(a.x * 1000) / 1000, Math.round(a.y * 1000) / 1000], [0.5, 0.5], "the centre of the area is the centre of the square");
  assert.ok(plot.pins[1].y < 0.5, "north is up");
  assert.ok(plot.pins[2].x > 0.5, "east is right");
  assert.deepEqual(plot.ring, { x: 0.5, y: 0.5, r: plot.ring.r }, "the area sits where its centre is");
  assert.ok(plot.ring.r > 0.4 && plot.ring.r < 0.5, "and fills the square with a margin, never touching its edge");
  assert.deepEqual([plot.spanM > 8000 * 2, plot.center], [true, AREA.center]);
  // A search with no centre yet: the leads alone make the picture, and no ring is drawn.
  const loose = leadMapPlot([at("a", 30.2672, -97.7431), at("b", 30.2772, -97.7431)], { ...AREA, center: null });
  assert.equal(loose.ring, null);
  assert.deepEqual([loose.pins.length, loose.center], [2, { lat: 30.2672, lng: -97.7431 }]);
  // One lead alone is a place, not a pinpoint; nothing placed at all is no plot.
  assert.equal(leadMapPlot([at("a", 30.2672, -97.7431)], null).spanM, 1120);
  assert.deepEqual(leadMapPlot([{ id: "d", point: null }], null), { pins: [], ring: null, spanM: 0, center: null });
});
