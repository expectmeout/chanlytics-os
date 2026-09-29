/**
 * The lead finder's rules with a right answer, run (PRD v3 §0.1, §0.2, §0.5,
 * §7.2, §13.3; release A1). Pure: nothing here reads a file or a database.
 * The fixtures are fictional: every domain under .example, every phone in
 * 555-0100..0199, every place id ChIJfixture....
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAD_ROUND_ENDINGS } from "../../../../../packages/contracts/src/leads/search/sets.ts";
import {
  leadMonth,
  LEAD_ASSUMED_YIELD,
  LEAD_PROBE_PLACES,
  LEAD_MAX_PLACES,
  LEAD_MONTHLY_ALLOWANCE,
  LEAD_MONTHLY_BUDGET_USD,
  LEAD_DAY_CAP_USD,
  LEAD_PLATFORM_DAY_CAP_USD,
  LEAD_QUESTION_THRESHOLD,
  LEAD_JUDGE_BATCH,
  LEAD_ESTIMATE_MARGIN,
} from "../../../../../packages/contracts/src/leads/search/caps.ts";
import { LeadSearchPlanSchema, planVersionOf } from "../../../../../packages/contracts/src/leads/search/plan.ts";
import {
  planSentence,
  planWords,
  planWho,
  planWhere,
  planArea,
  planSaid,
  planLeavingOut,
} from "../../../../../packages/contracts/src/leads/search/sentence.ts";
import {
  estimateRoundUsd,
  placesToAsk,
  planCeiling,
  planMinutes,
  LEAD_COUNT_CHOICES,
  LEAD_CARDS,
} from "../../../../../packages/contracts/src/leads/search/cards.ts";
import { endingOfRound, LEAD_ENDING_WORDS } from "../../../../../packages/contracts/src/leads/search/endings.ts";
import { classify } from "../../../../../packages/contracts/src/leads/search/class.ts";
import { questionAfterProbe } from "../../../../../packages/contracts/src/leads/search/question.ts";
import {
  cleanEmailCandidates,
  usPhone,
  siteHost,
  stateCode,
} from "../../../../../packages/contracts/src/leads/search/clean.ts";
import * as searchSets from "../../../../../packages/contracts/src/leads/search/sets.ts";
import * as searchCaps from "../../../../../packages/contracts/src/leads/search/caps.ts";
import * as searchPlan from "../../../../../packages/contracts/src/leads/search/plan.ts";
import * as searchSentence from "../../../../../packages/contracts/src/leads/search/sentence.ts";
import * as searchCards from "../../../../../packages/contracts/src/leads/search/cards.ts";
import * as searchEndings from "../../../../../packages/contracts/src/leads/search/endings.ts";
import * as searchClass from "../../../../../packages/contracts/src/leads/search/class.ts";
import * as searchQuestion from "../../../../../packages/contracts/src/leads/search/question.ts";
import * as searchClean from "../../../../../packages/contracts/src/leads/search/clean.ts";
import * as judgeWords from "../../../../../packages/contracts/src/leads/lead-judge.ts";

/** Every export of the lead search: one module once (lead-search.ts), nine now (leads/search/). */
const searchWords = {
  ...searchSets,
  ...searchCaps,
  ...searchPlan,
  ...searchSentence,
  ...searchCards,
  ...searchEndings,
  ...searchClass,
  ...searchQuestion,
  ...searchClean,
};

/** The plan every test starts from: 200 personal trainers in Austin, TX with a website, email checked, leaving out chain gyms. */
const plan = (over = {}) =>
  LeadSearchPlanSchema.parse({
    version: 1,
    card: "local_businesses",
    name: "personal trainers",
    asked: "personal trainers in Austin with a website, about 200",
    terms: ["personal trainer", "strength coach"],
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
    ...over,
  });
const facts = (over = {}) => ({
  ref: 1,
  name: "Zilker Strength",
  category: "Personal trainer",
  city: "Austin",
  state: "TX",
  host: "zilkerstrength.example",
  rating: 4.9,
  reviews: 41,
  emails: ["hello@zilkerstrength.example"],
  phone_matches_site: true,
  ...over,
});
// A whole answer carries the engine's own kind criterion first (LEAD_KIND_KEY); a test that leaves it out is asking
// about a place whose kind the judge did not say, which is review, and says so by giving it explicitly.
const answer = (criteria, over = {}) => ({
  ref: 1,
  criteria: criteria.some((c) => c.key === "kind")
    ? criteria
    : [{ key: "kind", answer: "pass", facts: ["category"] }, ...criteria],
  email_index: 0,
  reason: "An independent trainer with a site.",
  ...over,
});

test("the decisions are the constants the PRD names, and the nine endings are one closed set with words", () => {
  assert.deepEqual(
    [
      LEAD_MONTHLY_ALLOWANCE,
      LEAD_MONTHLY_BUDGET_USD,
      LEAD_DAY_CAP_USD,
      LEAD_PLATFORM_DAY_CAP_USD,
      LEAD_QUESTION_THRESHOLD,
      LEAD_PROBE_PLACES,
      LEAD_JUDGE_BATCH,
      LEAD_MAX_PLACES,
    ],
    [500, 25, 10, 50, 0.6, 25, 25, 1000],
  );
  assert.deepEqual(
    [...LEAD_ROUND_ENDINGS],
    [
      "target_reached",
      "searched_everything",
      "month_leads_used",
      "budget_used",
      "few_new_matches",
      "stopped",
      "source_failed",
      "question_unanswered",
      "paused",
    ],
  );
  assert.deepEqual(
    Object.keys(LEAD_ENDING_WORDS).sort(),
    [...LEAD_ROUND_ENDINGS].sort(),
    "every ending has its words, and nothing else does",
  );
  assert.equal(LEAD_ENDING_WORDS.stopped, "Stopped by you");
});

test("the plan schema keeps its keys unique and its shape whole; the sentence says the count, the kind, the area, each criterion and its standard, the contact standard and what is left out", () => {
  const p = plan();
  assert.equal(
    planSentence(p),
    "Find 200 personal trainers in Austin, TX with a website, reached by a checked email or a phone. Leaving out: chain gyms.",
  );
  const seen = plan({
    contact: "phone",
    criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }],
    exclusions: [],
  });
  assert.equal(
    planSentence(seen),
    "Find 200 personal trainers in Austin, TX already sell OTC medicine (confirmed), reached by phone or a checked email.",
  );
  assert.throws(
    () => plan({ exclusions: [{ key: "website", text: "Chain gyms", origin: "claude" }] }),
    /key of its own/,
  );
  assert.throws(() => plan({ count: 1001 }));
  assert.throws(() => plan({ area: { ...p.area, state: "Texas" } }));
  const acronym = plan({ exclusions: [{ key: "cvs", text: "CVS pharmacies", origin: "claude" }] });
  assert.equal(
    planSentence(acronym),
    "Find 200 personal trainers in Austin, TX with a website, reached by a checked email or a phone. Leaving out: CVS pharmacies.",
    "an acronym's own case survives: only a lowercase second letter gets folded",
  );
});

test("the plan schema also refuses the same term twice, a radius with no center, a ZIP with no zip code, and a state that is not a real US state or DC", () => {
  const p = plan();
  assert.throws(() => plan({ terms: ["Personal Trainer", "personal trainer"] }), /terms/i);
  assert.throws(
    () =>
      plan({
        area: { kind: "radius", label: "near me", state: "TX", center: null, radius_m: 5_000, query: "near me" },
      }),
    /center/i,
  );
  assert.doesNotThrow(
    () =>
      plan({
        area: { kind: "zip", label: "78704", state: "TX", center: null, radius_m: 5_000, zip: "78704", query: "78704" },
      }),
    "a ZIP ask is proposed before its center is known: A2 derives one from the ZCTA table",
  );
  assert.throws(
    () => plan({ area: { kind: "zip", label: "78704", state: "TX", center: null, radius_m: 5_000, query: "78704" } }),
    /zip/i,
    "a ZIP ask still needs its zip code, center or no",
  );
  assert.throws(() => plan({ area: { ...p.area, state: "ZZ" } }), /state/i);
  assert.doesNotThrow(
    () =>
      plan({
        area: {
          kind: "city",
          label: "Austin, TX",
          state: "TX",
          center: null,
          radius_m: 25_000,
          query: "Austin, TX, USA",
        },
      }),
    "a city may still wait for its center",
  );
});

test("a change to the area, count, contact standard, criteria or exclusions makes a new version; a rename does not", () => {
  const p = plan();
  assert.equal(planVersionOf(p, { name: "trainers" }).version, 1);
  assert.equal(
    planVersionOf(p, { terms: ["trainer"] }).version,
    1,
    "the terms are the source's words, not the promise",
  );
  assert.equal(planVersionOf(p, { count: 50 }).version, 2);
  assert.equal(planVersionOf(p, { contact: "phone" }).version, 2);
  assert.equal(planVersionOf(p, { exclusions: [] }).version, 2, "Include removes a chip: a new version");
  assert.equal(planVersionOf(p, { criteria: [...p.criteria] }).version, 1, "the same criteria, restated, is no change");
  assert.equal(planVersionOf(planVersionOf(p, { count: 50 }), { count: 60 }).version, 3);
  const reordered = {
    query: p.area.query,
    radius_m: p.area.radius_m,
    center: { lng: p.area.center.lng, lat: p.area.center.lat },
    state: p.area.state,
    label: p.area.label,
    kind: p.area.kind,
  };
  assert.equal(
    planVersionOf(p, { area: reordered }).version,
    1,
    "the same area, its keys (and its center's) written in another order, is no change",
  );
});

test("the estimate comes from the card's prices with room: discovery, contacts, the judge, the check under an email standard, a start per term", () => {
  const c = LEAD_CARDS[0];
  const perPlace = c.costPerPlaceUsd + c.contactsPerPlaceUsd + c.judgePerPlaceUsd + c.checkPerEmailUsd;
  assert.equal(
    estimateRoundUsd(plan(), "probe", 25),
    Math.round((25 * perPlace + 2 * c.startUsd) * LEAD_ESTIMATE_MARGIN * 10_000) / 10_000,
  );
  assert.equal(
    estimateRoundUsd(plan({ contact: "phone" }), "main", 260),
    Math.round((260 * (perPlace - c.checkPerEmailUsd) + 2 * c.startUsd) * LEAD_ESTIMATE_MARGIN * 10_000) / 10_000,
    "a phone standard checks no mailbox",
  );
  assert.ok(
    estimateRoundUsd(plan(), "probe", 25) < 0.5,
    "the probe costs cents; the $0.50 floor is the run cap's, not the estimate's",
  );
});

test("placesToAsk spreads the probe's 25 across every term, and a later round asks for the remainder over the yield, clamped 1.2x..4x and inside what a term can return", () => {
  assert.deepEqual(placesToAsk(plan(), 200, null), { total: 25, perTerm: [13, 12] });
  assert.deepEqual(placesToAsk(plan({ terms: ["trainer", "coach", "gym"] }), 200, null), {
    total: 25,
    perTerm: [9, 8, 8],
  });
  assert.deepEqual(placesToAsk(plan(), 100, 0.5), { total: 200, perTerm: [100, 100] }, "100 over a 50% yield is 200");
  assert.deepEqual(placesToAsk(plan(), 100, 0.95), { total: 120, perTerm: [60, 60] }, "never under 1.2x the remainder");
  assert.deepEqual(placesToAsk(plan(), 50, 0.1), { total: 200, perTerm: [100, 100] }, "never over 4x the remainder");
  assert.deepEqual(
    placesToAsk(plan(), 50, 0),
    { total: 200, perTerm: [100, 100] },
    "no yield yet is the 4x clamp, not infinity",
  );
  assert.deepEqual(
    placesToAsk(plan(), 400, 0.5),
    { total: 240, perTerm: [120, 120] },
    "one search on the source tops out near 120",
  );
  assert.ok(
    placesToAsk(plan({ terms: ["trainer", "coach", "gym", "studio", "fitness"] }), 400, 0.3).total <= LEAD_MAX_PLACES,
  );
});

test("placesToAsk asks for nothing once nothing remains, and spreads a total smaller than the term count one place at a time", () => {
  assert.deepEqual(
    placesToAsk(plan(), 0, 0.5),
    { total: 0, perTerm: [0, 0] },
    "nothing left means nothing asked, whatever the yield",
  );
  assert.deepEqual(
    placesToAsk(plan(), -5, 0.5),
    { total: 0, perTerm: [0, 0] },
    "a negative remainder is the same as none",
  );
  assert.deepEqual(
    placesToAsk(plan({ terms: ["trainer", "coach", "gym", "studio", "fitness"] }), 1, 1),
    { total: 2, perTerm: [1, 1, 0, 0, 0] },
    "a total under the term count gives 1 to as many terms as it covers and 0 to the rest",
  );
});

test("(0010) a lead's phone is verified when it dials: a real North American area code and exchange, never an N11 service code or a number too short", async () => {
  const { phoneDialable, leadPhoneState } = await import("@chanlytics/contracts");
  for (const ok of ["+15125550100", "(512) 555-0100", "512.555.0100", "+442071838750"])
    assert.equal(phoneDialable(ok), true, ok);
  for (const bad of [
    "(123) 456-7890",
    "+10125550100",
    "(512) 155-0100",
    "(911) 555-0100",
    "(512) 411-0100",
    "555-0100",
    "",
  ])
    assert.equal(phoneDialable(bad), false, bad);
  assert.deepEqual(
    [leadPhoneState("+15125550100"), leadPhoneState("(123) 456-7890"), leadPhoneState(null)],
    ["ok", "invalid", "none"],
  );
});

test("classify: everything passing under the standard qualifies; a required fail excludes with that key; unknown, a seen criterion with no fact cited, out of area, or the email standard not met is review", () => {
  const p = plan();
  const ok = classify(
    p,
    answer([
      { key: "website", answer: "pass", facts: ["host"] },
      { key: "chain", answer: "pass", facts: ["name", "reviews"] },
    ]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual(ok, { class: "qualified", excluded_by: null, fit: "strong", reasons: [] });
  const chain = classify(
    p,
    answer([
      { key: "website", answer: "pass", facts: ["host"] },
      { key: "chain", answer: "fail", facts: ["name"] },
    ]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual(chain, { class: "excluded", excluded_by: "chain", fit: null, reasons: ["fail:chain"] });
  // The engine's own first criterion (PRD §7 step 4): a photographer is not a wedding planner, however well it
  // could recommend one. On the first real search that was the only criterion, and two photographers, a band and a
  // caterer were handed to a wedding photographer as Qualified.
  const wrongKind = classify(
    p,
    answer([
      { key: "kind", answer: "fail", facts: ["category"] },
      { key: "website", answer: "pass", facts: ["host"] },
      { key: "chain", answer: "pass", facts: ["name"] },
    ]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual(
    wrongKind,
    { class: "excluded", excluded_by: "kind", fit: null, reasons: ["fail:kind"] },
    "the wrong kind of business is Excluded, by the kind",
  );
  const kindUnsure = classify(
    p,
    answer([
      { key: "kind", answer: "unknown", facts: [] },
      { key: "website", answer: "pass", facts: ["host"] },
      { key: "chain", answer: "pass", facts: ["name"] },
    ]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual(
    [kindUnsure.class, kindUnsure.fit, kindUnsure.reasons],
    ["review", "look", ["unknown:kind"]],
    "a kind the facts do not settle is a look, never a guess either way",
  );
  const kindByCategory = classify(
    p,
    answer([
      { key: "kind", answer: "pass", facts: ["category"] },
      { key: "website", answer: "pass", facts: ["host"] },
      { key: "chain", answer: "pass", facts: ["name"] },
    ]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.equal(
    kindByCategory.class,
    "qualified",
    "the kind rests on the category by design: a likely standard, never held to seen's bar",
  );
  // A place nobody can reach is not a lead: it used to land in Needs review as "phone:none" or "email:none",
  // which is work dressed as a lead and was the largest share of the review pile on the first five real
  // searches. It is left out, by a key with words, and the row says why.
  const unreachable = classify(
    p,
    answer([
      { key: "website", answer: "pass", facts: ["host"] },
      { key: "chain", answer: "pass", facts: ["name"] },
    ]),
    facts({ emails: [], phone_matches_site: null }),
    "none",
    true,
    "none",
  );
  assert.deepEqual(
    unreachable,
    { class: "excluded", excluded_by: "unreachable", fit: null, reasons: ["unreachable"] },
    "no phone and no email: left out, never review",
  );
  // ONE VERIFIED WAY TO REACH THEM IS ENOUGH (decision 0010): a phone that dials qualifies a lead even under a search
  // that prefers email, and a number that does not dial is review until an email checks out.
  const passing = answer([
    { key: "website", answer: "pass", facts: ["host"] },
    { key: "chain", answer: "pass", facts: ["name"] },
  ]);
  const phoneOnly = classify(p, passing, facts({ emails: [], phone_matches_site: true }), "none", true, "ok");
  assert.equal(p.contact, "email", "this plan prefers email");
  assert.deepEqual([phoneOnly.class, phoneOnly.reasons], ["qualified", []], "a phone that dials is a lead");
  const badPhone = classify(p, passing, facts({ emails: [], phone_matches_site: true }), "none", true, "invalid");
  assert.deepEqual(
    [badPhone.class, badPhone.reasons],
    ["review", ["phone:invalid"]],
    "a number that does not dial reaches nobody",
  );
  assert.equal(searchWords.LEAD_UNREACHABLE_KEY, "unreachable");
  assert.equal(searchWords.LEAD_KIND_KEY, "kind");
  assert.equal(
    searchWords.leadKindWord("wedding and event planners"),
    "Not one of the wedding and event planners",
    "what the Excluded chip says",
  );
  const unsure = classify(
    p,
    answer([
      { key: "website", answer: "pass", facts: ["host"] },
      { key: "chain", answer: "unknown", facts: [] },
    ]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual([unsure.class, unsure.fit, unsure.reasons], ["review", "look", ["unknown:chain"]]);
  const seen = plan({
    criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }],
    exclusions: [],
  });
  const inferred = classify(seen, answer([{ key: "otc", answer: "pass", facts: [] }]), facts(), "ok", true, "none");
  assert.deepEqual(
    [inferred.class, inferred.reasons],
    ["review", ["inferred:otc"]],
    "a seen criterion answered by inference goes to review",
  );
  const cited = classify(
    seen,
    answer([{ key: "otc", answer: "pass", facts: ["category"] }]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual(
    [cited.class, cited.reasons],
    ["review", ["inferred:otc"]],
    "name and category are descriptions, not evidence: citing only one of them is still a read, not seen",
  );
  const citedProperly = classify(
    seen,
    answer([{ key: "otc", answer: "pass", facts: ["category", "reviews"] }]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.equal(citedProperly.class, "qualified", "a fact beyond name or category is real evidence for a seen pass");
  const away = classify(
    p,
    answer([
      { key: "website", answer: "pass", facts: ["host"] },
      { key: "chain", answer: "pass", facts: ["name"] },
    ]),
    facts(),
    "ok",
    false,
    "none",
  );
  assert.deepEqual([away.class, away.reasons], ["review", ["out_of_area"]]);
  // No phone that dials: the email is the one way left, and its state is the reason a check can still clear.
  for (const state of ["catch_all", "unknown", "invalid", "checking"]) {
    const r = classify(
      p,
      answer([
        { key: "website", answer: "pass", facts: ["host"] },
        { key: "chain", answer: "pass", facts: ["name"] },
      ]),
      facts(),
      state,
      true,
      "none",
    );
    assert.deepEqual([r.class, r.reasons], ["review", [`email:${state}`]], state);
  }
  // No email picked either: nothing left to check, and the reason names the phone that was missing.
  const neither = classify(p, passing, facts(), "none", true, "none");
  assert.deepEqual([neither.class, neither.reasons], ["review", ["phone:none"]]);
  const phone = plan({ contact: "phone" });
  assert.equal(
    classify(
      phone,
      answer([
        { key: "website", answer: "pass", facts: ["host"] },
        { key: "chain", answer: "pass", facts: ["name"] },
      ]),
      facts(),
      "none",
      true,
      "ok",
    ).class,
    "qualified",
    "a phone that dials is enough",
  );
  assert.deepEqual(
    classify(
      phone,
      answer([
        { key: "website", answer: "pass", facts: ["host"] },
        { key: "chain", answer: "pass", facts: ["name"] },
      ]),
      facts({ phone_matches_site: null }),
      "none",
      true,
      "none",
    ).reasons,
    ["phone:none"],
  );
  const soft = plan({ criteria: [{ key: "website", text: "With a website", standard: "likely", required: false }] });
  const long = classify(
    soft,
    answer([
      { key: "website", answer: "fail", facts: ["host"] },
      { key: "chain", answer: "pass", facts: ["name"] },
    ]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual(
    [long.class, long.fit],
    ["qualified", "long"],
    "a preferred criterion that fails is a long shot, never an exclusion",
  );
  const optionalUnknown = classify(
    soft,
    answer([
      { key: "website", answer: "unknown", facts: [] },
      { key: "chain", answer: "pass", facts: ["name"] },
    ]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual(
    [optionalUnknown.class, optionalUnknown.fit],
    ["qualified", "long"],
    "decision 26: only a required criterion gates the class; an optional one only ever lowers the fit band",
  );
  const missing = classify(
    p,
    answer([{ key: "website", answer: "pass", facts: ["host"] }]),
    facts(),
    "ok",
    true,
    "none",
  );
  assert.deepEqual(
    [missing.class, missing.reasons],
    ["review", ["unknown:chain"]],
    "a criterion the judge did not answer is unknown",
  );
  assert.equal(
    classify(
      p,
      answer([
        { key: "website", answer: "fail", facts: [] },
        { key: "chain", answer: "fail", facts: [] },
      ]),
      facts(),
      "ok",
      true,
      "none",
    ).excluded_by,
    "chain",
    "an exclusion's required fail is tallied before a criterion's, so Include is never offered against a real requirement",
  );
});

test("the question fires under 60% of the first 25 and names the most common exclusion; it drops a term that returned mostly the wrong kind; it never fires on too few, on enough, or when nothing was left out", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const members = [
    ...Array(12).fill(m("qualified")),
    ...Array(9).fill(m("excluded", "chain", "strength coach")),
    ...Array(2).fill(m("excluded", "website")),
    ...Array(2).fill(m("review")),
  ];
  const q = questionAfterProbe(p, members);
  assert.equal(q.ask, true);
  assert.equal(q.criterionKey, "chain");
  assert.equal(q.dropTerm, "strength coach");
  assert.equal(
    q.sentence,
    `Some of the first 25 are chain gyms and other kinds of places, which I'm leaving out. Is that what you meant? I'm dropping "strength coach": it mostly returned those.`,
    'chain is still the topic asked about (the website requirement is never tallied), but the 2 excluded for it are real and the sentence owns them as "other kinds of places"',
  );
  const half = questionAfterProbe(p, [...Array(12).fill(m("qualified")), ...Array(13).fill(m("excluded", "chain"))]);
  assert.equal(half.sentence, "Half of the first 25 are chain gyms, which I'm leaving out. Is that what you meant?");
  assert.equal(half.dropTerm, null, "one term of two returned everything: nothing to drop");
  assert.match(
    questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(20).fill(m("excluded", "chain"))]).sentence,
    /^Most of the first 25/,
  );
  assert.deepEqual(
    questionAfterProbe(p, [...Array(15).fill(m("qualified")), ...Array(10).fill(m("excluded", "chain"))]),
    { ask: false },
    "60% is enough",
  );
  assert.deepEqual(
    questionAfterProbe(p, [m("qualified"), ...Array(7).fill(m("excluded", "chain"))]),
    { ask: false },
    "eight places are too few to ask about",
  );
  assert.deepEqual(
    questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(20).fill(m("review"))]),
    { ask: false },
    "review is not an exclusion: the question is an intent check, not an accuracy measure",
  );
  assert.equal(
    questionAfterProbe(plan({ terms: ["personal trainer"] }), members).dropTerm,
    null,
    "the only term is never dropped",
  );
});

test("the question is measured by the share excluded, not the share qualified yet: under an email standard almost nothing is Qualified before the mailbox checks land, so Review must not read as a no", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const members = [...Array(24).fill(m("review")), m("excluded", "chain")];
  assert.deepEqual(
    questionAfterProbe(p, members),
    { ask: false },
    "1 of 25 excluded is nowhere near the bar, however few are Qualified yet",
  );
});

test("the question never proposes relaxing a required criterion: only an exclusion's own tally can be the topic asked about", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const members = [...Array(5).fill(m("qualified")), ...Array(20).fill(m("excluded", "website"))];
  assert.deepEqual(
    questionAfterProbe(p, members),
    { ask: false },
    "every excluded place failed the website requirement, not the chain exclusion: nothing to ask about that Include could honor",
  );
});

test('the question\'s lead word counts what the sentence actually names, a chip\'s own share of the first n, never everything excluded for any reason (P2, S12): the rest is "other kinds of places", not folded into "Most"', () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const mostlyRequired = questionAfterProbe(p, [
    ...Array(5).fill(m("qualified")),
    ...Array(19).fill(m("excluded", "website")),
    m("excluded", "chain"),
  ]);
  assert.equal(
    mostlyRequired.sentence,
    "Some of the first 25 are chain gyms and other kinds of places, which I'm leaving out. Is that what you meant?",
    '1 of 25 is chain: "Some", never "Most" from the 20 excluded for any reason at all',
  );
  const allChain = questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(20).fill(m("excluded", "chain"))]);
  assert.equal(
    allChain.sentence,
    "Most of the first 25 are chain gyms, which I'm leaving out. Is that what you meant?",
    '20 of 25 really are chain: the claim and the lead word agree, with nothing left to call "other kinds"',
  );
});

test("a term is dropped only when another term that returned enough places is demonstrably working; never when every term is bad, and never on the strength of a term nobody else has tried", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const everyTermBad = questionAfterProbe(p, [
    ...Array(2).fill(m("qualified", null, "personal trainer")),
    ...Array(11).fill(m("excluded", "chain", "personal trainer")),
    ...Array(2).fill(m("qualified", null, "strength coach")),
    ...Array(10).fill(m("excluded", "chain", "strength coach")),
  ]);
  assert.equal(everyTermBad.dropTerm, null, "both terms are bad: dropping one would not fix the search");
  const othersEmpty = questionAfterProbe(p, [
    ...Array(2).fill(m("qualified", null, "personal trainer")),
    ...Array(23).fill(m("excluded", "chain", "personal trainer")),
  ]);
  assert.equal(
    othersEmpty.dropTerm,
    null,
    '"strength coach" returned nothing at all: it has not earned the claim that it works',
  );
});

test("the ending of a round follows S7: the target overrides everything else, then what was done to it, then the allowance, the budget, then whether every term ran short", () => {
  const base = {
    counted: 10,
    target: 200,
    termsShort: [false, false],
    budgetLeftUsd: 5,
    allowanceLeft: 100,
    stopped: false,
    sourceFailed: false,
    unanswered: false,
    paused: false,
  };
  assert.equal(endingOfRound({ ...base, paused: true, stopped: true }), "paused");
  assert.equal(endingOfRound({ ...base, stopped: true, sourceFailed: true }), "stopped");
  assert.equal(
    endingOfRound({ ...base, sourceFailed: true, counted: 200 }),
    "target_reached",
    "the target reached on the very page that failed still counts: nothing outranks it",
  );
  assert.equal(endingOfRound({ ...base, unanswered: true }), "question_unanswered");
  assert.equal(endingOfRound({ ...base, counted: 200 }), "target_reached");
  assert.equal(endingOfRound({ ...base, allowanceLeft: 0 }), "month_leads_used");
  assert.equal(endingOfRound({ ...base, budgetLeftUsd: 0 }), "budget_used");
  assert.equal(
    endingOfRound({ ...base, termsShort: [true, true] }),
    "searched_everything",
    "only when every term returned fewer than asked",
  );
  assert.equal(
    endingOfRound({ ...base, termsShort: [true, false] }),
    "few_new_matches",
    "otherwise the round ended at its limit",
  );
  assert.equal(endingOfRound({ ...base, termsShort: [] }), "few_new_matches");
});

test("the cleaner keeps a business's own addresses first, says why each other was dropped, gives none of a partner list's, and five of a staff list", () => {
  const SITE = "zilkerstrength.example";
  const raw = [
    "support@vagaro.com",
    "filler@godaddy.com",
    "yourdomain@mail.com",
    "careers@zilkerstrength.example",
    "press@zilkerstrength.example",
    "x@2x.png",
    "Hello@ZilkerStrength.example",
    "hello@zilkerstrength.example",
    "newcase@www.zilkerstrength.example",
    "coach.sam@gmail.com",
    "not an address",
  ];
  const r = cleanEmailCandidates(raw, SITE);
  assert.deepEqual(r.kept, ["hello@zilkerstrength.example", "newcase@zilkerstrength.example", "coach.sam@gmail.com"]);
  assert.deepEqual(
    r.dropped.map((d) => d.why),
    ["junk_domain", "junk_domain", "placeholder", "role", "role", "image", "duplicate", "malformed"],
  );
  const cruise = Array.from({ length: 8 }, (_, i) => `claims@cruiseline${i}.example`);
  const list = cleanEmailCandidates(cruise, "maritimelaw.example");
  assert.deepEqual(list.kept, [], "eight foreign domains is a list, not the firm");
  assert.ok(list.dropped.every((d) => d.why === "foreign_list"));
  const staff = Array.from({ length: 23 }, (_, i) => `staff${i}@bigfirm.example`).concat(["intake@bigfirm.example"]);
  const kept = cleanEmailCandidates(staff, "bigfirm.example");
  assert.equal(kept.kept.length, 5);
  assert.equal(kept.kept[0], "intake@bigfirm.example", "a front-desk address ranks first");
  assert.equal(kept.dropped.filter((d) => d.why === "over_limit").length, 19);
  const subdomain = cleanEmailCandidates(["x@sentry-next.wixpress.com"], "somebiz.example");
  assert.deepEqual(
    subdomain.dropped,
    [{ email: "x@sentry-next.wixpress.com", why: "junk_domain" }],
    "a junk domain is matched by suffix, as siteHost matches a platform host",
  );
});

test("phones, hosts and states are read by rules: placeholders and foreign numbers dropped, platforms are no site of their own, a state is its two letters", () => {
  for (const bad of ["1234567890", "123456789", "+6221123456789", "+118322305794", "5555555555", "0123456789"])
    assert.equal(usPhone(bad), null, bad);
  assert.equal(usPhone("(512) 555-0100"), "+15125550100");
  assert.equal(usPhone("+1 512 555 0142"), "+15125550142");
  assert.equal(siteHost("https://www.vagaro.com/zilkerstrength"), null);
  assert.equal(siteHost("instagram.com/zilkerstrength"), null);
  assert.equal(siteHost("www.ZilkerStrength.example/contact"), "zilkerstrength.example");
  assert.equal(siteHost("not a url"), null);
  assert.equal(stateCode("Texas"), "TX");
  assert.equal(stateCode("tx"), "TX");
  assert.equal(stateCode("District of Columbia"), "DC");
  assert.equal(stateCode("Ontario"), null);
});

test("the month a lead counts in is the workspace's calendar month, in its zone", () => {
  assert.equal(
    leadMonth("America/Chicago", new Date("2026-10-01T03:30:00Z")),
    "2026-09",
    "still 30 September in Chicago",
  );
  assert.equal(leadMonth("America/Chicago", new Date("2026-10-01T05:30:00Z")), "2026-10");
  assert.equal(leadMonth("UTC", new Date("2026-12-31T23:59:59Z")), "2026-12");
});

test("a plan's own words are stripped of control and format characters before they can reach the rubric: a name cannot carry a bidi override or a hidden newline into the judge's prompt", () => {
  const rlo = String.fromCharCode(0x202e);
  const nl = String.fromCharCode(10);
  const p = plan({ name: `personal${nl}trainers${rlo}` });
  assert.equal(p.name, "personal trainers");
});

test("no word the product says names the vendor that runs the searches, in either module", () => {
  const strings = [];
  const seen = new WeakSet(); // zod schemas point back at themselves
  const walk = (v) => {
    if (typeof v === "string") strings.push(v);
    else if (typeof v === "function") return;
    else if (v && typeof v === "object" && !seen.has(v)) {
      seen.add(v);
      Object.values(v).forEach(walk);
    }
  };
  walk({ ...searchWords });
  walk({ ...judgeWords });
  walk(searchWords.planSentence(plan()));
  walk(judgeWords.judgeSystemPrompt(plan()));
  walk(Object.values(searchWords.LEAD_ENDING_WORDS));
  assert.ok(strings.length > 50, "the walk saw the words");
  assert.deepEqual(
    strings.filter((s) => /apify|compass|bounceverify|crawler/i.test(s)),
    [],
  );
});

/* ------------------------------------------------ the sentence, derived once (release B, Task 9) */

/** The plan a model wrote with the area inside its plural, and a label that says "in" for itself. */
const brooklyn = (over = {}) =>
  LeadSearchPlanSchema.parse({
    version: 1,
    card: "local_businesses",
    name: "Hair salons in Brooklyn",
    asked: "60 hair salons in Brooklyn",
    terms: ["hair salon", "beauty salon"],
    area: {
      kind: "city",
      label: "in Brooklyn, NY",
      state: "NY",
      center: { lat: 40.6782, lng: -73.9442 },
      radius_m: 15_000,
      query: "Brooklyn, NY, USA",
    },
    count: 60,
    contact: "email",
    criteria: [],
    exclusions: [],
    ...over,
  });

test('REGRESSION: the sentence says the area once -- a plural that carried the area read "Find 60 Hair salons in Brooklyn in in Brooklyn, NY"', () => {
  assert.equal(planSentence(brooklyn()), "Find 60 hair salons in Brooklyn, NY, reached by a checked email or a phone.");
  assert.equal(planWho(brooklyn()), "hair salons", "the place clause whose words are the area's is dropped");
  assert.equal(planWhere(brooklyn().area), "in Brooklyn, NY", "the label already says where: no second preposition");
  assert.equal(planArea(brooklyn().area), "Brooklyn, NY", 'and the bare noun, for a sentence that says its own "in"');
  assert.equal(
    planWho(brooklyn({ name: "Pharmacies inside supermarkets", terms: ["pharmacy"] })),
    "pharmacies inside supermarkets",
    "a clause about something else is kept",
  );
  assert.equal(
    planWho(brooklyn({ name: "in Brooklyn" })),
    "hair salon and beauty salon",
    "a plural that is only the area falls back to the terms",
  );
  const radius = {
    kind: "radius",
    label: "within 25 miles of Austin",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 40_000,
    query: "Austin, TX, USA",
  };
  assert.deepEqual([planWhere(radius), planArea(radius)], ["within 25 miles of Austin", "Austin"]);
  assert.equal(
    planWhere({
      kind: "zip",
      label: "78704",
      state: "TX",
      center: null,
      radius_m: 5_000,
      zip: "78704",
      query: "78704",
    }),
    "in 78704",
  );
});

test("the sentence is the plan card's words joined: every picker is one word of it, and nothing else reads the plan", () => {
  const p = plan();
  assert.deepEqual(
    planWords(p)
      .filter((w) => w.pick)
      .map((w) => [w.pick, w.text]),
    [
      ["count", "200"],
      ["who", "personal trainers"],
      ["where", "in Austin, TX"],
      ["criterion", "with a website"],
      ["contact", "reached by a checked email or a phone"],
    ],
  );
  assert.equal(
    planWords(p).find((w) => w.pick === "criterion").key,
    "website",
    "a criterion word names the criterion it opens",
  );
  assert.equal(
    planSaid(p),
    "Find 200 personal trainers in Austin, TX with a website, reached by a checked email or a phone.",
  );
  assert.equal(planLeavingOut(p), " Leaving out: chain gyms.");
  assert.equal(
    planSentence(p),
    `${planSaid(p)}${planLeavingOut(p)}`,
    "one derivation: the receipt and the card cannot say the plan differently",
  );
  assert.equal(planLeavingOut(plan({ exclusions: [] })), "");
  const phone = plan({ contact: "phone" });
  assert.equal(planWords(phone).find((w) => w.pick === "contact").text, "reached by phone or a checked email");
});

test("the count picker's options each say about how long they take, and a plan never claims under two minutes", () => {
  const three = (n) => plan({ count: n, terms: ["personal trainer", "strength coach", "fitness coach"] });
  assert.deepEqual([...LEAD_COUNT_CHOICES], [50, 100, 200, 500]);
  // Measured over five real searches (20 Sep 2026): 8 places a minute, not the canvas's 50. 500 is the same round
  // as 200, capped at what one round may ask for -- and the picker says so instead of quoting 200's time twice.
  assert.deepEqual(
    LEAD_COUNT_CHOICES.map((n) => planMinutes(three(n))),
    [16, 28, 48, 48],
  );
  assert.equal(
    planCeiling(three(50)),
    180,
    "three terms, 120 places each, half of them qualifying: what one area's terms can yield",
  );
  assert.deepEqual(
    LEAD_COUNT_CHOICES.map((n) => n > planCeiling(three(n))),
    [false, false, true, true],
    "200 and 500 are more than one area likely holds",
  );
  assert.ok(planMinutes(plan({ count: 1 })) >= 2, "never under two minutes: the probe alone is 25 places");
  assert.equal(LEAD_ASSUMED_YIELD, 0.5);
});
