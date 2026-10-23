/**
 * The people card (00430) and the owner's drafts (00429), off the database:
 *
 *   1. The mapper reads a company and a person off an item as the provider writes it at the pinned build (its
 *      calibration run's shape), a work address only, a US company only, the company's place never its person's; the
 *      input asks at least the provider's hundred; companiesOf keeps each company once with its people, those with a
 *      work address and the most senior first, its addressee the first with an address, and no company with nobody to
 *      write to.
 *   2. The plan: its sentence counts companies, who it looks for, its estimate with both floors, the sheet's problems in
 *      words (a state or an industry that reads as none is said, never dropped; an industry in the directory's own name),
 *      and Ask's people ask, which asks nothing of a places plan.
 *   3. The strip of a people search: its own words, never a places plan's, and Find more like these.
 *   4. A draft's refusal (the door's rule, and a customer's address); Sent's words say what would refuse it now.
 *   5. Where a lead came from: a business directory for a company, never "your list".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  LEAD_ADDRESSEE_WORDS,
  LEAD_CARDS,
  LeadPeoplePlanSchema,
  PEOPLE_FIND_WORDS,
  PEOPLE_STRIP_WORDS,
  ProposeAnySearchSchema,
  draftRefusalOf,
  leadAddresseeRefusal,
  leadCompanyOf,
  leadFoundWords,
  peopleEstimateUsd,
  peoplePlanAsk,
  peoplePlanFrom,
  peoplePlanSentence,
  peopleSheetProblems,
  peopleWho,
  planPeopleSearch,
  toSendSaidWords,
  usStatesTyped,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", "..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { CARDS } = await import(at("packages/core/src/leads/cards.ts"));
const { companiesOf } = await import(at("packages/core/src/leads/runner/people.ts"));
const { leadStrip } = await import(at("apps/dashboard/src/surfaces/leads/finder/strip.ts"));

const card = CARDS.people_at_companies;
/**
 * An item as the provider writes one at the pinned build: the calibration run's shape (14 Oct 2026), every field it
 * wrote that the card reads or must not, with invented values.
 */
const item = (over = {}) => ({
  firstName: "Dana",
  lastName: "Reyes",
  title: "Digital Marketing Manager",
  seniority: "manager",
  department: "Sales - Marketing",
  email: "dana@acme-fixture.example",
  emailPatternGuess: null,
  phone: "+1 555 0142",
  linkedinUrl: "https://www.linkedin.com/in/dana-reyes-fixture",
  city: "Austin",
  state: "Texas",
  country: "United States",
  organizationName: "Acme Fixture",
  organizationWebsite: "acme-fixture.example",
  organizationIndustry: "Marketing & Advertising",
  organizationSize: 20,
  organizationEmployeeRange: "11 - 50",
  organizationLinkedinUrl: "http://www.linkedin.com/company/acme-fixture",
  organizationCity: "Austin",
  organizationState: "Texas",
  organizationCountry: "United States",
  organizationDescription: "An agency for the fixture's own tests.",
  ...over,
});

test("the mapper reads the provider's own fields: a company and a person, a work address only, a US company only", () => {
  const m = card.mapItem(item());
  assert.deepEqual(m.company, {
    key: "acme-fixture.example",
    name: "Acme Fixture",
    industry: "Marketing & Advertising",
    city: "Austin",
    region: "TX",
    country: "US",
    linkedin: "http://www.linkedin.com/company/acme-fixture",
    size: "11 - 50",
    about: "An agency for the fixture's own tests.",
  });
  assert.deepEqual(m.person, {
    name: "Dana Reyes",
    first_name: "Dana",
    title: "Digital Marketing Manager",
    seniority: "manager",
    email: "dana@acme-fixture.example",
    profile_url: "https://www.linkedin.com/in/dana-reyes-fixture",
  });
  const asked = Object.fromEntries(card.fields.filter((f) => f in item()).map((f) => [f, item()[f]]));
  assert.deepEqual(card.mapItem(asked), m, "every field the mapper reads is one a run asks for");
  assert.ok(
    !card.fields.includes("phone") && !card.fields.includes("emailPatternGuess"),
    "never a phone, nor the guess",
  );

  const at = (over) => card.mapItem(item(over));
  assert.equal(at({ email: "dana@gmail.com" }).person.email, null, "a free mailbox is no company's door");
  assert.equal(
    at({ email: "dána@acme-fixture.example" }).person.email,
    null,
    "an address outside ASCII is never sent to",
  );
  assert.equal(at({ organizationCountry: "India" }), null, "a company outside the US is not read, whoever works there");
  assert.equal(at({ organizationState: null }).company.region, null, "the company's place, never its person's");
  assert.equal(at({ organizationState: "New York" }).company.region, "NY");
  assert.equal(at({ organizationEmployeeRange: null, organizationSize: 300 }).company.size, "201 - 500");
  assert.equal(at({ organizationWebsite: null }), null, "no key, no lead");
  assert.equal(at({ firstName: "", lastName: "" }), null, "nobody named, no person");
  assert.equal(
    card.mapItem({ firstName: "Check the log to see how the run went." }),
    null,
    "the provider's first note",
  );
  assert.equal(card.mapItem(null), null);
});

test("the people card asks at least the provider's hundred, by its own names, at the build its calibration read", () => {
  // As the route takes it: the schema spells a typed industry as the directory does.
  const plan = LeadPeoplePlanSchema.parse(
    peoplePlanFrom({
      asked: "marketing managers",
      count: 10,
      titles: ["Marketing Manager"],
      seniority: ["manager"],
      industries: ["marketing and advertising"],
      sizes: ["11 - 50"],
      states: ["TX"],
    }),
  );
  assert.deepEqual(card.buildInput(plan, 20), {
    maxResults: 100,
    personTitle: ["Marketing Manager"],
    excludeSeniority: ["intern"],
    seniority: ["manager"],
    industry: ["Marketing & Advertising"],
    companyEmployeeSize: ["11 - 50"],
    personCountry: ["United States"],
    personState: ["Texas"],
  });
  assert.equal(card.buildInput(plan, 400).maxResults, 400);
  // The words the companies' sites use go as the directory's company keywords, and none goes as none.
  assert.deepEqual(card.buildInput({ ...plan, keywords: ["plumbing", "HVAC"] }, 20).webKeywords, ["plumbing", "HVAC"]);
  assert.equal("webKeywords" in card.buildInput(plan, 20), false);
  const brief = LEAD_CARDS.find((c) => c.id === "people_at_companies");
  assert.equal(card.build, brief.calibrated.build, "the pinned build is the one its calibration run read");
});

test("companiesOf: each company once, the people it can be written through first, its addressee, nobody to write to left out", () => {
  const person = (name, email, seniority, title = "Manager") => ({
    company: card.mapItem(item()).company,
    person: { name, first_name: name.split(" ")[0], title, seniority, email, profile_url: null },
  });
  const found = [
    person("Sam Staff", "sam@acme-fixture.example", "entry", "Coordinator"),
    person("Olga Owner", null, "owner", "Owner"),
    person("Dana Reyes", "dana@acme-fixture.example", "manager"),
    person("Dana Reyes", "dana@acme-fixture.example", "manager"),
    person("Vic Vp", "vic@acme-fixture.example", "vp", "VP Marketing"),
  ];
  const [acme] = companiesOf(found);
  assert.deepEqual(
    acme.facts.people.map((p) => p.name),
    ["Vic Vp", "Dana Reyes", "Sam Staff", "Olga Owner"],
    "with an address first, the most senior first; a person once",
  );
  assert.equal(acme.facts.addressee, 0);
  assert.equal(acme.email, "vic@acme-fixture.example", "the lead's address is its addressee's");
  assert.equal(acme.facts.people[0].role, "director");
  const nobody = companiesOf([person("Olga Owner", null, "owner", "Owner")]);
  assert.deepEqual(nobody, [], "a company with nobody to write to is no lead");
  const many = companiesOf(
    Array.from({ length: 8 }, (_, i) => person(`P ${i}`, `p${i}@acme-fixture.example`, "manager")),
  );
  assert.equal(many[0].facts.people.length, 5, "five people a company at most");
});

test("the plan: its sentence counts companies, its estimate keeps both floors, the sheet says what is wrong", () => {
  const plan = peoplePlanFrom({
    name: "Marketing managers",
    asked: "marketing managers",
    count: 100,
    titles: ["marketing manager"],
    seniority: ["manager"],
    industries: ["Marketing & Advertising"],
    sizes: ["11 - 50"],
    states: ["TX", "CA"],
  });
  // In plain words (Ruben, 23 Oct 2026): who as their seniority says them, the sizes as numbers, the states by name.
  assert.equal(
    peoplePlanSentence(plan),
    "Find 100 managers at marketing & advertising companies, 11–50 staff, in Texas and California. Each company is checked against what you asked.",
  );
  assert.equal(peoplePlanAsk(plan, null).label, "Find 100 managers", "the button names who it finds, not companies");
  // The words the companies' sites use are said, and searched (core cards.ts webKeywords).
  const trades = peoplePlanFrom({ ...plan, industries: ["Construction"], keywords: ["plumbing", "HVAC"], sizes: [] });
  assert.match(peoplePlanSentence(trades), / at construction companies doing plumbing or HVAC, any size, /);
  assert.deepEqual(trades.keywords, ["plumbing", "HVAC"]);
  assert.equal(peopleWho(plan), "people called “marketing manager” at Marketing & Advertising companies in TX and CA");
  assert.ok(
    peopleEstimateUsd(100, { perPerson: 0.002, perJudge: 0.0023, perCheck: 0.00089, start: 0.01 }) >= 1,
    "both runs' floors",
  );
  assert.equal(PEOPLE_FIND_WORDS.start(100), "Find 100 companies");

  assert.deepEqual(usStatesTyped("Texas, ca, Califronia"), { codes: ["TX", "CA"], unread: ["Califronia"] });
  const p = peopleSheetProblems({ titles: "", industries: "A", states: "Tex.", count: "900" });
  assert.equal(p.titles, PEOPLE_FIND_WORDS.needTitle);
  assert.equal(p.industries, PEOPLE_FIND_WORDS.industryOdd("A"));
  assert.equal(p.states, PEOPLE_FIND_WORDS.stateUnread("Tex."), "a state that reads as none is said, never dropped");
  assert.equal(p.count, PEOPLE_FIND_WORDS.needCount);
  // The directory's industries are the route's to say (its list stays on the server): the schema refuses one it does
  // not list, under the industries box (the route's fields name it), with the nearest of its own.
  const refused = (industries) => LeadPeoplePlanSchema.safeParse({ ...plan, industries }).error?.issues[0];
  const agencies = refused(["Accounting", "marketing agencies"]);
  assert.deepEqual(
    [agencies.path, agencies.message],
    [["industries", 1], PEOPLE_FIND_WORDS.industryUnread("marketing agencies", ["Marketing & Advertising"])],
    "an industry the directory does not list is said with the nearest of its own",
  );
  assert.match(refused(["dentists"]).message, /^“dentists” isn't one of the directory's industries\. Say it as/);
  assert.deepEqual(
    LeadPeoplePlanSchema.parse({ ...plan, industries: ["accounting", "real estate"] }).industries,
    ["Accounting", "Real Estate"],
    "its own names, in any case",
  );
  assert.deepEqual(LeadPeoplePlanSchema.parse(plan).industries, ["Marketing & Advertising"]);
  assert.equal(
    peopleSheetProblems({ titles: "owner", industries: "dentists", states: "", count: "10" }).industries,
    undefined,
    "the sheet leaves it to the route",
  );
  const long = "x".repeat(61);
  assert.equal(
    peopleSheetProblems({ titles: long, industries: "", states: "", count: "10" }).titles,
    PEOPLE_FIND_WORDS.titleLong(long),
  );
  assert.deepEqual(peopleSheetProblems({ titles: "owner", industries: "", states: "TX", count: "10" }), {});
  assert.equal(
    peopleSheetProblems({ titles: "owner, -", industries: "", states: "", count: "10" }).titles,
    PEOPLE_FIND_WORDS.titleShort("-"),
  );
  const eleven = "AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI";
  assert.equal(
    peopleSheetProblems({ titles: "owner", industries: "", states: eleven, count: "10" }).states,
    PEOPLE_FIND_WORDS.tooMany("states", 10, 11),
    "more states than a search takes is said, never dropped",
  );
});

test("Ask's people ask: nothing of a places plan asked of it, and a state it cannot read refused in words", () => {
  const ask = ProposeAnySearchSchema.parse({
    looking_for: "people_at_companies",
    country: "US",
    count: 50,
    who: "Office managers at dental practices",
    terms: ["office manager"],
    region: "California",
    asked: "office managers at dental practices in California",
  });
  const planned = planPeopleSearch(ask);
  assert.equal(planned.ok, true);
  assert.deepEqual(planned.plan.states, ["CA"]);
  assert.equal(planned.view.title, "Find 50 office managers at dental practices");
  const spelled = planPeopleSearch({ ...ask, industries: ["medical practice"] });
  assert.deepEqual(spelled.plan.industries, ["Medical Practice"], "the directory's own name");
  const dental = planPeopleSearch({ ...ask, industries: ["dentists"] });
  assert.equal(dental.ok, false, "an industry it does not list is refused, never searched as every industry");
  assert.equal(dental.refusal.text, PEOPLE_FIND_WORDS.industryUnread("dentists", []));
  const wrong = planPeopleSearch({ ...ask, region: "Texs, California" });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.refusal.text, PEOPLE_FIND_WORDS.stateUnread("Texs"));
  const places = ProposeAnySearchSchema.safeParse({
    looking_for: "local_businesses",
    country: "US",
    count: 20,
    who: "gyms",
  });
  assert.equal(places.success, false, "a places ask still asks for its plan's fields");
});

test("a people search's strip says its own words, and offers Find more like these", () => {
  const plan = peoplePlanFrom({
    name: "Owners",
    asked: "owners",
    count: 20,
    titles: ["owner"],
    seniority: [],
    industries: [],
    sizes: [],
    states: ["OH"],
  });
  const round = (over) => ({
    id: "r1",
    seq: 1,
    purpose: "main",
    state: "running",
    ending: null,
    question: null,
    target: 20,
    counted: 0,
    qualified: 0,
    review: 6,
    excluded: 1,
    emails_checked: 2,
    with_phone: 0,
    ending_pending: false,
    waiting_since: null,
    cost_usd: 0,
    ended_at: null,
    undo_op_id: null,
    undo_version: null,
    nearby: [],
    fits: { strong: 0, look: 0, long: 0 },
    ...over,
  });
  const s = (r) => ({
    id: "s1",
    name: "Owners",
    asked: "owners",
    asked_on: "2026-10-13",
    plan: null,
    people: plan,
    plan_version: 1,
    thread_id: null,
    round: r,
  });
  const running = leadStrip(s(round({})), new Date());
  assert.equal(running.title, PEOPLE_STRIP_WORDS.running("people called “owner” at companies in OH"));
  assert.deepEqual(running.parts, [PEOPLE_STRIP_WORDS.found(7), PEOPLE_STRIP_WORDS.checked(2)]);
  const ended = leadStrip(
    s(round({ state: "ended", ending: "searched_everything", counted: 5, qualified: 5, review: 0 })),
    new Date(),
  );
  assert.equal(ended.title, PEOPLE_STRIP_WORDS.ended("searched_everything", 5, 20));
  assert.equal(ended.actions[0].id, "people_more");
  assert.equal(ended.actions[0].arg, plan, "Find more like these opens the sheet with the plan");
  assert.ok(
    !ended.actions.some((a) => ["more", "nearby", "look_further", "carry_on", "try_again"].includes(a.id)),
    "never a places door",
  );
  assert.match(PEOPLE_STRIP_WORDS.ended("paused", 0, 20), /paused/, "a paused round is never one that found none");
  assert.match(PEOPLE_STRIP_WORDS.ended("budget_used", 3, 20), /used up/);
});

test("a draft's refusal is the door's, and a customer's address; Sent says what would refuse it now", () => {
  const fine = {
    lead_stage: "nurture",
    suppressed: false,
    wrote_back: false,
    away: false,
    stopped: false,
    customer: false,
  };
  assert.equal(draftRefusalOf(fine), null);
  assert.equal(draftRefusalOf(null), "lead_gone");
  assert.equal(draftRefusalOf({ ...fine, suppressed: true }), "outreach_suppressed");
  assert.equal(draftRefusalOf({ ...fine, wrote_back: true }), "outreach_wrote_back");
  assert.equal(draftRefusalOf({ ...fine, lead_stage: "archived" }), "outreach_lead_closed");
  assert.equal(draftRefusalOf({ ...fine, customer: true }), "already_yours");
  assert.equal(toSendSaidWords("Acme", { said: true, state: "sent", since: null }), "Acme: sent from your inbox");
  assert.match(
    toSendSaidWords("Acme", { said: true, state: "sent", since: "outreach_suppressed" }),
    /never-again list/,
  );
  assert.equal(
    toSendSaidWords("Acme", { said: true, state: "skipped" }),
    "Acme: left out. Nothing more is written to them.",
  );
  assert.equal(toSendSaidWords("Acme", { said: false, state: "sent" }), "Already said: it went.");
  assert.match(
    toSendSaidWords("Acme", { said: false, state: "skipped", reason: "outreach_wrote_back" }),
    /^Acme was left out already: they /,
    "a skip the clock or a reply made is said with why, never as another member's word",
  );
  assert.doesNotMatch(toSendSaidWords("Acme", { said: true, state: "sent", since: "already_yours" }), /thread/);
  assert.match(
    toSendSaidWords("Acme", { said: true, state: "sent", since: "already_yours", on_thread: true }),
    /thread/,
  );
});

test("where a lead came from: a business directory for a company, a list for a file's lead, Maps for a place", () => {
  assert.equal(leadFoundWords({ kind: "company", found_on_listing: false }), "From a business directory");
  assert.equal(leadFoundWords({ kind: "place", found_on_listing: false }), "From your list");
  assert.equal(
    leadFoundWords({ kind: "place", found_on_listing: true, search: { asked: "gyms" } }),
    "Found on Google Maps by “gyms”",
  );
  const company = leadCompanyOf({
    kind: "company",
    facts: {
      people: [
        { name: "Bo Lin", title: "Director", email: "bo@acme-fixture.example" },
        { name: "Dana Reyes", title: "Owner", email: "dana@acme-fixture.example" },
      ],
      addressee: 1,
      size: "11 - 50",
    },
  });
  assert.deepEqual(
    company.people.map((p) => [p.name, p.addressee]),
    [
      ["Dana Reyes", true],
      ["Bo Lin", false],
    ],
  );
  assert.doesNotMatch(company.source, /Apify|LinkedIn/, "no vendor in the product's words");
  assert.equal(leadCompanyOf({ kind: "place", facts: {} }), null);
});

test("who a company's reach-out writes to: who may be chosen, by their place in the stored list, and the door's words", () => {
  const facts = {
    people: [
      { name: "Bo Lin", title: "Director", email: "bo@acme-fixture.example" },
      { title: "A row with no name, which does not read" },
      { name: "Dana Reyes", title: "Owner", email: "dana@acme-fixture.example" },
      { name: "Kim Park", title: "Manager", email: null },
    ],
    addressee: 2,
  };
  const open = { kind: "company", facts, stage: "ready", closed_reason: null, contact_id: null, contacted_at: null };
  const company = leadCompanyOf({ ...open, email_state: "ok" });
  assert.deepEqual(
    company.people.map((p) => [p.name, p.index, p.addressee, p.choose]),
    [
      ["Dana Reyes", 2, true, false],
      ["Bo Lin", 0, false, true],
      ["Kim Park", 3, false, false],
    ],
    "each by their place in the stored list; the addressee and someone with no address are not offered",
  );
  const none = (over) => leadCompanyOf({ ...open, email_state: "ok", ...over }).people.some((p) => p.choose);
  assert.equal(none({ email_state: "checking" }), false, "a check on its way would land on the new address");
  assert.equal(none({ contacted_at: "2026-10-14T09:00:00Z" }), false, "written to by hand");
  assert.equal(none({ contact_id: "c-1" }), false, "one of your people already");
  assert.equal(none({ stage: "converted" }), false);
  assert.equal(none({ closed_reason: "said_no" }), false);
  assert.equal(none({ stage: "nurture" }), true, "Not now is still open");
  assert.equal(
    leadCompanyOf({ kind: "company", facts }).people.some((p) => p.choose),
    false,
    "unsaid is not open",
  );
  assert.equal(leadAddresseeRefusal("in_reach_out"), LEAD_ADDRESSEE_WORDS.refused.in_reach_out);
  assert.equal(leadAddresseeRefusal("something_new"), LEAD_ADDRESSEE_WORDS.refusedElse);
  assert.match(
    LEAD_ADDRESSEE_WORDS.done("Bo Lin", "Acme Studio", true),
    /^Your sequence writes to Bo Lin at Acme Studio now\. .*checked first/,
    'the toast names the business: "its" says nothing in a toast',
  );
  assert.match(LEAD_ADDRESSEE_WORDS.done("Bo Lin", "Acme Studio", false), /checked already\.$/);
});
