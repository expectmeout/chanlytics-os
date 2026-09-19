/**
 * The lead finder's rules with a right answer, run (PRD v3 §0.1, §0.2, §0.5,
 * §7.2, §13.3; release A1). Pure: nothing here reads a file or a database.
 * The fixtures are fictional: every domain under .example, every phone in
 * 555-0100..0199, every place id ChIJfixture....
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LeadSearchPlanSchema, planSentence, planVersionOf, estimateRoundUsd, placesToAsk, classify, questionAfterProbe,
  endingOfRound, cleanEmailCandidates, usPhone, siteHost, stateCode, leadMonth,
  LEAD_ROUND_ENDINGS, LEAD_ENDING_WORDS, LEAD_CARDS, LEAD_PROBE_PLACES, LEAD_MAX_PLACES, LEAD_MONTHLY_ALLOWANCE,
  LEAD_MONTHLY_BUDGET_USD, LEAD_DAY_CAP_USD, LEAD_PLATFORM_DAY_CAP_USD, LEAD_QUESTION_THRESHOLD, LEAD_JUDGE_BATCH,
  LEAD_ESTIMATE_MARGIN,
} from "../../../packages/contracts/src/lead-search.ts";
import * as searchWords from "../../../packages/contracts/src/lead-search.ts";
import * as judgeWords from "../../../packages/contracts/src/lead-judge.ts";

/** The plan every test starts from: 200 personal trainers in Austin, TX with a website, email checked, leaving out chain gyms. */
const plan = (over = {}) => LeadSearchPlanSchema.parse({
  version: 1, card: "local_businesses", name: "personal trainers", asked: "personal trainers in Austin with a website, about 200",
  terms: ["personal trainer", "strength coach"],
  area: { kind: "city", label: "Austin, TX", state: "TX", center: { lat: 30.2672, lng: -97.7431 }, radius_m: 25_000, query: "Austin, TX, USA" },
  count: 200, contact: "email",
  criteria: [{ key: "website", text: "With a website", standard: "likely", required: true }],
  exclusions: [{ key: "chain", text: "Chain gyms", origin: "claude" }],
  ...over,
});
const facts = (over = {}) => ({ ref: 1, name: "Zilker Strength", category: "Personal trainer", city: "Austin", state: "TX", host: "zilkerstrength.example", rating: 4.9, reviews: 41, emails: ["hello@zilkerstrength.example"], phone_matches_site: true, ...over });
const answer = (criteria, over = {}) => ({ ref: 1, criteria, email_index: 0, reason: "An independent trainer with a site.", ...over });

test("the decisions are the constants the PRD names, and the nine endings are one closed set with words", () => {
  assert.deepEqual([LEAD_MONTHLY_ALLOWANCE, LEAD_MONTHLY_BUDGET_USD, LEAD_DAY_CAP_USD, LEAD_PLATFORM_DAY_CAP_USD, LEAD_QUESTION_THRESHOLD, LEAD_PROBE_PLACES, LEAD_JUDGE_BATCH, LEAD_MAX_PLACES], [500, 25, 10, 50, 0.6, 25, 25, 1000]);
  assert.deepEqual([...LEAD_ROUND_ENDINGS], ["target_reached", "searched_everything", "month_leads_used", "budget_used", "few_new_matches", "stopped", "source_failed", "question_unanswered", "paused"]);
  assert.deepEqual(Object.keys(LEAD_ENDING_WORDS).sort(), [...LEAD_ROUND_ENDINGS].sort(), "every ending has its words, and nothing else does");
  assert.equal(LEAD_ENDING_WORDS.stopped, "Stopped by you");
});

test("the plan schema keeps its keys unique and its shape whole; the sentence says the count, the kind, the area, each criterion and its standard, the contact standard and what is left out", () => {
  const p = plan();
  assert.equal(planSentence(p), "Find 200 personal trainers in Austin, TX with a website, then find their email and check it. Leaving out: chain gyms.");
  const seen = plan({ contact: "phone", criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }], exclusions: [] });
  assert.equal(planSentence(seen), "Find 200 personal trainers in Austin, TX already sell OTC medicine (confirmed), a phone is enough.");
  assert.throws(() => plan({ exclusions: [{ key: "website", text: "Chain gyms", origin: "claude" }] }), /key of its own/);
  assert.throws(() => plan({ count: 1001 }));
  assert.throws(() => plan({ area: { ...p.area, state: "Texas" } }));
  const acronym = plan({ exclusions: [{ key: "cvs", text: "CVS pharmacies", origin: "claude" }] });
  assert.equal(planSentence(acronym), "Find 200 personal trainers in Austin, TX with a website, then find their email and check it. Leaving out: CVS pharmacies.", "an acronym's own case survives: only a lowercase second letter gets folded");
});

test("the plan schema also refuses the same term twice, a radius with no center, a ZIP with no zip code, and a state that is not a real US state or DC", () => {
  const p = plan();
  assert.throws(() => plan({ terms: ["Personal Trainer", "personal trainer"] }), /terms/i);
  assert.throws(() => plan({ area: { kind: "radius", label: "near me", state: "TX", center: null, radius_m: 5_000, query: "near me" } }), /center/i);
  assert.doesNotThrow(
    () => plan({ area: { kind: "zip", label: "78704", state: "TX", center: null, radius_m: 5_000, zip: "78704", query: "78704" } }),
    "a ZIP ask is proposed before its center is known: A2 derives one from the ZCTA table",
  );
  assert.throws(
    () => plan({ area: { kind: "zip", label: "78704", state: "TX", center: null, radius_m: 5_000, query: "78704" } }),
    /zip/i,
    "a ZIP ask still needs its zip code, center or no",
  );
  assert.throws(() => plan({ area: { ...p.area, state: "ZZ" } }), /state/i);
  assert.doesNotThrow(() => plan({ area: { kind: "city", label: "Austin, TX", state: "TX", center: null, radius_m: 25_000, query: "Austin, TX, USA" } }), "a city may still wait for its center");
});

test("a change to the area, count, contact standard, criteria or exclusions makes a new version; a rename does not", () => {
  const p = plan();
  assert.equal(planVersionOf(p, { name: "trainers" }).version, 1);
  assert.equal(planVersionOf(p, { terms: ["trainer"] }).version, 1, "the terms are the source's words, not the promise");
  assert.equal(planVersionOf(p, { count: 50 }).version, 2);
  assert.equal(planVersionOf(p, { contact: "phone" }).version, 2);
  assert.equal(planVersionOf(p, { exclusions: [] }).version, 2, "Include removes a chip: a new version");
  assert.equal(planVersionOf(p, { criteria: [...p.criteria] }).version, 1, "the same criteria, restated, is no change");
  assert.equal(planVersionOf(planVersionOf(p, { count: 50 }), { count: 60 }).version, 3);
  const reordered = {
    query: p.area.query, radius_m: p.area.radius_m,
    center: { lng: p.area.center.lng, lat: p.area.center.lat },
    state: p.area.state, label: p.area.label, kind: p.area.kind,
  };
  assert.equal(planVersionOf(p, { area: reordered }).version, 1, "the same area, its keys (and its center's) written in another order, is no change");
});

test("the estimate comes from the card's prices with room: discovery, contacts, the judge, the check under an email standard, a start per term", () => {
  const c = LEAD_CARDS[0];
  const perPlace = c.costPerPlaceUsd + c.contactsPerPlaceUsd + c.judgePerPlaceUsd + c.checkPerEmailUsd;
  assert.equal(estimateRoundUsd(plan(), "probe", 25), Math.round((25 * perPlace + 2 * c.startUsd) * LEAD_ESTIMATE_MARGIN * 10_000) / 10_000);
  assert.equal(estimateRoundUsd(plan({ contact: "phone" }), "main", 260), Math.round((260 * (perPlace - c.checkPerEmailUsd) + 2 * c.startUsd) * LEAD_ESTIMATE_MARGIN * 10_000) / 10_000, "a phone standard checks no mailbox");
  assert.ok(estimateRoundUsd(plan(), "probe", 25) < 0.5, "the probe costs cents; the $0.50 floor is the run cap's, not the estimate's");
});

test("placesToAsk spreads the probe's 25 across every term, and a later round asks for the remainder over the yield, clamped 1.2x..4x and inside what a term can return", () => {
  assert.deepEqual(placesToAsk(plan(), 200, null), { total: 25, perTerm: [13, 12] });
  assert.deepEqual(placesToAsk(plan({ terms: ["trainer", "coach", "gym"] }), 200, null), { total: 25, perTerm: [9, 8, 8] });
  assert.deepEqual(placesToAsk(plan(), 100, 0.5), { total: 200, perTerm: [100, 100] }, "100 over a 50% yield is 200");
  assert.deepEqual(placesToAsk(plan(), 100, 0.95), { total: 120, perTerm: [60, 60] }, "never under 1.2x the remainder");
  assert.deepEqual(placesToAsk(plan(), 50, 0.1), { total: 200, perTerm: [100, 100] }, "never over 4x the remainder");
  assert.deepEqual(placesToAsk(plan(), 50, 0), { total: 200, perTerm: [100, 100] }, "no yield yet is the 4x clamp, not infinity");
  assert.deepEqual(placesToAsk(plan(), 400, 0.5), { total: 240, perTerm: [120, 120] }, "one search on the source tops out near 120");
  assert.ok(placesToAsk(plan({ terms: ["trainer", "coach", "gym", "studio", "fitness"] }), 400, 0.3).total <= LEAD_MAX_PLACES);
});

test("placesToAsk asks for nothing once nothing remains, and spreads a total smaller than the term count one place at a time", () => {
  assert.deepEqual(placesToAsk(plan(), 0, 0.5), { total: 0, perTerm: [0, 0] }, "nothing left means nothing asked, whatever the yield");
  assert.deepEqual(placesToAsk(plan(), -5, 0.5), { total: 0, perTerm: [0, 0] }, "a negative remainder is the same as none");
  assert.deepEqual(
    placesToAsk(plan({ terms: ["trainer", "coach", "gym", "studio", "fitness"] }), 1, 1),
    { total: 2, perTerm: [1, 1, 0, 0, 0] },
    "a total under the term count gives 1 to as many terms as it covers and 0 to the rest",
  );
});

test("classify: everything passing under the standard qualifies; a required fail excludes with that key; unknown, a seen criterion with no fact cited, out of area, or the email standard not met is review", () => {
  const p = plan();
  const ok = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name", "reviews"] }]), facts(), "ok", true);
  assert.deepEqual(ok, { class: "qualified", excluded_by: null, fit: "strong", reasons: [] });
  const chain = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "fail", facts: ["name"] }]), facts(), "ok", true);
  assert.deepEqual(chain, { class: "excluded", excluded_by: "chain", fit: null, reasons: ["fail:chain"] });
  const unsure = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "unknown", facts: [] }]), facts(), "ok", true);
  assert.deepEqual([unsure.class, unsure.fit, unsure.reasons], ["review", "look", ["unknown:chain"]]);
  const seen = plan({ criteria: [{ key: "otc", text: "Already sell OTC medicine", standard: "seen", required: true }], exclusions: [] });
  const inferred = classify(seen, answer([{ key: "otc", answer: "pass", facts: [] }]), facts(), "ok", true);
  assert.deepEqual([inferred.class, inferred.reasons], ["review", ["inferred:otc"]], "a seen criterion answered by inference goes to review");
  const cited = classify(seen, answer([{ key: "otc", answer: "pass", facts: ["category"] }]), facts(), "ok", true);
  assert.deepEqual([cited.class, cited.reasons], ["review", ["inferred:otc"]], "name and category are descriptions, not evidence: citing only one of them is still a read, not seen");
  const citedProperly = classify(seen, answer([{ key: "otc", answer: "pass", facts: ["category", "reviews"] }]), facts(), "ok", true);
  assert.equal(citedProperly.class, "qualified", "a fact beyond name or category is real evidence for a seen pass");
  const away = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), "ok", false);
  assert.deepEqual([away.class, away.reasons], ["review", ["out_of_area"]]);
  for (const state of ["catch_all", "unknown", "none", "invalid", "checking"]) {
    const r = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), state, true);
    assert.deepEqual([r.class, r.reasons], ["review", [`email:${state}`]], state);
  }
  const phone = plan({ contact: "phone" });
  assert.equal(classify(phone, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), "none", true).class, "qualified", "a phone is enough");
  assert.deepEqual(classify(phone, answer([{ key: "website", answer: "pass", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts({ phone_matches_site: null }), "none", true).reasons, ["phone:none"]);
  const soft = plan({ criteria: [{ key: "website", text: "With a website", standard: "likely", required: false }] });
  const long = classify(soft, answer([{ key: "website", answer: "fail", facts: ["host"] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), "ok", true);
  assert.deepEqual([long.class, long.fit], ["qualified", "long"], "a preferred criterion that fails is a long shot, never an exclusion");
  const optionalUnknown = classify(soft, answer([{ key: "website", answer: "unknown", facts: [] }, { key: "chain", answer: "pass", facts: ["name"] }]), facts(), "ok", true);
  assert.deepEqual([optionalUnknown.class, optionalUnknown.fit], ["qualified", "long"], "decision 26: only a required criterion gates the class; an optional one only ever lowers the fit band");
  const missing = classify(p, answer([{ key: "website", answer: "pass", facts: ["host"] }]), facts(), "ok", true);
  assert.deepEqual([missing.class, missing.reasons], ["review", ["unknown:chain"]], "a criterion the judge did not answer is unknown");
  assert.equal(classify(p, answer([{ key: "website", answer: "fail", facts: [] }, { key: "chain", answer: "fail", facts: [] }]), facts(), "ok", true).excluded_by, "chain", "an exclusion's required fail is tallied before a criterion's, so Include is never offered against a real requirement");
});

test("the question fires under 60% of the first 25 and names the most common exclusion; it drops a term that returned mostly the wrong kind; it never fires on too few, on enough, or when nothing was left out", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const members = [...Array(12).fill(m("qualified")), ...Array(9).fill(m("excluded", "chain", "strength coach")), ...Array(2).fill(m("excluded", "website")), ...Array(2).fill(m("review"))];
  const q = questionAfterProbe(p, members);
  assert.equal(q.ask, true);
  assert.equal(q.criterionKey, "chain");
  assert.equal(q.dropTerm, "strength coach");
  assert.equal(q.sentence, `Some of the first 25 are chain gyms and other kinds of places, which I'm leaving out. Is that what you meant? I'm dropping "strength coach": it mostly returned those.`, "chain is still the topic asked about (the website requirement is never tallied), but the 2 excluded for it are real and the sentence owns them as \"other kinds of places\"");
  const half = questionAfterProbe(p, [...Array(12).fill(m("qualified")), ...Array(13).fill(m("excluded", "chain"))]);
  assert.equal(half.sentence, "Half of the first 25 are chain gyms, which I'm leaving out. Is that what you meant?");
  assert.equal(half.dropTerm, null, "one term of two returned everything: nothing to drop");
  assert.match(questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(20).fill(m("excluded", "chain"))]).sentence, /^Most of the first 25/);
  assert.deepEqual(questionAfterProbe(p, [...Array(15).fill(m("qualified")), ...Array(10).fill(m("excluded", "chain"))]), { ask: false }, "60% is enough");
  assert.deepEqual(questionAfterProbe(p, [m("qualified"), ...Array(7).fill(m("excluded", "chain"))]), { ask: false }, "eight places are too few to ask about");
  assert.deepEqual(questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(20).fill(m("review"))]), { ask: false }, "review is not an exclusion: the question is an intent check, not an accuracy measure");
  assert.equal(questionAfterProbe(plan({ terms: ["personal trainer"] }), members).dropTerm, null, "the only term is never dropped");
});

test("the question is measured by the share excluded, not the share qualified yet: under an email standard almost nothing is Qualified before the mailbox checks land, so Review must not read as a no", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const members = [...Array(24).fill(m("review")), m("excluded", "chain")];
  assert.deepEqual(questionAfterProbe(p, members), { ask: false }, "1 of 25 excluded is nowhere near the bar, however few are Qualified yet");
});

test("the question never proposes relaxing a required criterion: only an exclusion's own tally can be the topic asked about", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const members = [...Array(5).fill(m("qualified")), ...Array(20).fill(m("excluded", "website"))];
  assert.deepEqual(questionAfterProbe(p, members), { ask: false }, "every excluded place failed the website requirement, not the chain exclusion: nothing to ask about that Include could honor");
});

test("the question's lead word counts what the sentence actually names, a chip's own share of the first n, never everything excluded for any reason (P2, S12): the rest is \"other kinds of places\", not folded into \"Most\"", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const mostlyRequired = questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(19).fill(m("excluded", "website")), m("excluded", "chain")]);
  assert.equal(
    mostlyRequired.sentence,
    "Some of the first 25 are chain gyms and other kinds of places, which I'm leaving out. Is that what you meant?",
    "1 of 25 is chain: \"Some\", never \"Most\" from the 20 excluded for any reason at all",
  );
  const allChain = questionAfterProbe(p, [...Array(5).fill(m("qualified")), ...Array(20).fill(m("excluded", "chain"))]);
  assert.equal(
    allChain.sentence,
    "Most of the first 25 are chain gyms, which I'm leaving out. Is that what you meant?",
    "20 of 25 really are chain: the claim and the lead word agree, with nothing left to call \"other kinds\"",
  );
});

test("a term is dropped only when another term that returned enough places is demonstrably working; never when every term is bad, and never on the strength of a term nobody else has tried", () => {
  const p = plan();
  const m = (cls, excluded_by = null, term = "personal trainer") => ({ class: cls, excluded_by, term });
  const everyTermBad = questionAfterProbe(p, [
    ...Array(2).fill(m("qualified", null, "personal trainer")), ...Array(11).fill(m("excluded", "chain", "personal trainer")),
    ...Array(2).fill(m("qualified", null, "strength coach")), ...Array(10).fill(m("excluded", "chain", "strength coach")),
  ]);
  assert.equal(everyTermBad.dropTerm, null, "both terms are bad: dropping one would not fix the search");
  const othersEmpty = questionAfterProbe(p, [
    ...Array(2).fill(m("qualified", null, "personal trainer")), ...Array(23).fill(m("excluded", "chain", "personal trainer")),
  ]);
  assert.equal(othersEmpty.dropTerm, null, "\"strength coach\" returned nothing at all: it has not earned the claim that it works");
});

test("the ending of a round follows S7: the target overrides everything else, then what was done to it, then the allowance, the budget, then whether every term ran short", () => {
  const base = { counted: 10, target: 200, termsShort: [false, false], budgetLeftUsd: 5, allowanceLeft: 100, stopped: false, sourceFailed: false, unanswered: false, paused: false };
  assert.equal(endingOfRound({ ...base, paused: true, stopped: true }), "paused");
  assert.equal(endingOfRound({ ...base, stopped: true, sourceFailed: true }), "stopped");
  assert.equal(endingOfRound({ ...base, sourceFailed: true, counted: 200 }), "target_reached", "the target reached on the very page that failed still counts: nothing outranks it");
  assert.equal(endingOfRound({ ...base, unanswered: true }), "question_unanswered");
  assert.equal(endingOfRound({ ...base, counted: 200 }), "target_reached");
  assert.equal(endingOfRound({ ...base, allowanceLeft: 0 }), "month_leads_used");
  assert.equal(endingOfRound({ ...base, budgetLeftUsd: 0 }), "budget_used");
  assert.equal(endingOfRound({ ...base, termsShort: [true, true] }), "searched_everything", "only when every term returned fewer than asked");
  assert.equal(endingOfRound({ ...base, termsShort: [true, false] }), "few_new_matches", "otherwise the round ended at its limit");
  assert.equal(endingOfRound({ ...base, termsShort: [] }), "few_new_matches");
});

test("the cleaner keeps a business's own addresses first, says why each other was dropped, gives none of a partner list's, and five of a staff list", () => {
  const SITE = "zilkerstrength.example";
  const raw = [
    "support@vagaro.com", "filler@godaddy.com", "yourdomain@mail.com", "careers@zilkerstrength.example", "press@zilkerstrength.example", "x@2x.png",
    "Hello@ZilkerStrength.example", "hello@zilkerstrength.example", "newcase@www.zilkerstrength.example", "coach.sam@gmail.com", "not an address",
  ];
  const r = cleanEmailCandidates(raw, SITE);
  assert.deepEqual(r.kept, ["hello@zilkerstrength.example", "newcase@zilkerstrength.example", "coach.sam@gmail.com"]);
  assert.deepEqual(r.dropped.map((d) => d.why), ["junk_domain", "junk_domain", "placeholder", "role", "role", "image", "duplicate", "malformed"]);
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
  assert.deepEqual(subdomain.dropped, [{ email: "x@sentry-next.wixpress.com", why: "junk_domain" }], "a junk domain is matched by suffix, as siteHost matches a platform host");
});

test("phones, hosts and states are read by rules: placeholders and foreign numbers dropped, platforms are no site of their own, a state is its two letters", () => {
  for (const bad of ["1234567890", "123456789", "+6221123456789", "+118322305794", "5555555555", "0123456789"]) assert.equal(usPhone(bad), null, bad);
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
  assert.equal(leadMonth("America/Chicago", new Date("2026-10-01T03:30:00Z")), "2026-09", "still 30 September in Chicago");
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
    else if (v && typeof v === "object" && !seen.has(v)) { seen.add(v); Object.values(v).forEach(walk); }
  };
  walk({ ...searchWords });
  walk({ ...judgeWords });
  walk(searchWords.planSentence(plan()));
  walk(judgeWords.judgeSystemPrompt(plan()));
  walk(Object.values(searchWords.LEAD_ENDING_WORDS));
  assert.ok(strings.length > 50, "the walk saw the words");
  assert.deepEqual(strings.filter((s) => /apify|compass|bounceverify|crawler/i.test(s)), []);
});
