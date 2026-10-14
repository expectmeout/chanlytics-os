/**
 * The people card (00430) and the owner's drafts (00429), off the database:
 *
 *   1. The mapper reads a company and a person off an item, a work address only, a US company only; companiesOf keeps
 *      each company once with its people, those with a work address and the most senior first, its addressee the first
 *      with an address, and no company with nobody to write to.
 *   2. The plan: its sentence counts companies, who it looks for, its estimate with both floors, the sheet's problems in
 *      words (a state that reads as none is said, never dropped), and Ask's people ask, which asks nothing of a places plan.
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
  PEOPLE_FIND_WORDS,
  PEOPLE_STRIP_WORDS,
  ProposeAnySearchSchema,
  draftRefusalOf,
  leadAddresseeRefusal,
  leadCompanyOf,
  leadFoundWords,
  peopleEstimateUsd,
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
/** An item as the provider writes one: invented values, the fields the card reads. */
const item = (over = {}) => ({
  first_name: "Dana",
  last_name: "Reyes",
  full_name: "Dana Reyes",
  title: "Marketing Manager",
  seniority: "manager",
  email: "dana@acme-fixture.example",
  company_name: "Acme Fixture",
  company_domain: "acme-fixture.example",
  company_country: "United States",
  company_state: "Texas",
  company_city: "Austin",
  industry: "Marketing & Advertising",
  company_size: 30,
  ...over,
});

test("the mapper: a company and a person, a work address only, a US company only", () => {
  const m = card.mapItem(item());
  assert.equal(m.company.key, "acme-fixture.example");
  assert.deepEqual([m.company.region, m.company.country, m.company.size], ["TX", "US", "11 - 50"]);
  assert.deepEqual(
    [m.person.name, m.person.email, m.person.seniority],
    ["Dana Reyes", "dana@acme-fixture.example", "manager"],
  );
  assert.equal(
    card.mapItem(item({ email: "dana@gmail.com" })).person.email,
    null,
    "a free mailbox is no company's door",
  );
  assert.equal(
    card.mapItem(item({ email: "dana@gmail.com", work_email: "dana@acme-fixture.example" })).person.email,
    "dana@acme-fixture.example",
    "the work address beside it is the one",
  );
  assert.equal(card.mapItem(item({ company_country: "Canada" })), null, "a company outside the US is not read");
  assert.equal(card.mapItem(item({ company_domain: null, website: null })), null, "no key, no lead");
  assert.equal(card.mapItem(item({ full_name: "", first_name: "", last_name: "" })), null, "nobody named, no person");
  assert.equal(card.mapItem(null), null);
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
  assert.match(peoplePlanSentence(plan), /^Up to 100 Marketing & Advertising companies of 11 - 50 people in TX and CA/);
  assert.equal(peopleWho(plan), "people called “marketing manager” at Marketing & Advertising companies in TX and CA");
  assert.ok(peopleEstimateUsd(100, { perPerson: 0.002, perCheck: 0.00089, start: 0.01 }) >= 1, "both runs' floors");
  assert.equal(PEOPLE_FIND_WORDS.start(100), "Find 100 companies");

  assert.deepEqual(usStatesTyped("Texas, ca, Califronia"), { codes: ["TX", "CA"], unread: ["Califronia"] });
  const p = peopleSheetProblems({ titles: "", industries: "A", states: "Tex.", count: "900" });
  assert.equal(p.titles, PEOPLE_FIND_WORDS.needTitle);
  assert.equal(p.industries, PEOPLE_FIND_WORDS.industryOdd("A"));
  assert.equal(p.states, PEOPLE_FIND_WORDS.stateUnread("Tex."), "a state that reads as none is said, never dropped");
  assert.equal(p.count, PEOPLE_FIND_WORDS.needCount);
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
  assert.equal(planned.view.title, "Find 50 companies: Office managers at dental practices");
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
    LEAD_ADDRESSEE_WORDS.done("Bo Lin", true),
    /^Bo Lin is who its reach-out writes to now\. .*checked first/,
  );
  assert.match(LEAD_ADDRESSEE_WORDS.done("Bo Lin", false), /checked already\.$/);
});
