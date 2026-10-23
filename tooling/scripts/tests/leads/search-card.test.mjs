/**
 * A search's card in Ask (contracts leads/search-card.ts; Ruben, 23 Oct 2026: an idea opens Ask with its card, and a
 * change is said to Ask, which updates the card): what the card draws and its one press sends, which earlier card a new
 * one replaces, the idea's mark carried, and the waiting card as a turn is told it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEARCH_CARD_REPLACED,
  peoplePlanFrom,
  searchCardView,
  searchCardsReplaced,
  startsSearch,
  waitingSearchWords,
  withAnswerLanded,
  withIdeaCarried,
} from "@chanlytics/contracts";
import { PLAN } from "../_lead-fixtures.mjs";

const FACTS = {
  dupes: 0,
  leadsLeft: 500,
  bound: null,
  prior: null,
  priorOf: null,
  cannotSee: null,
  renewsOn: "Nov 1",
  nearby: [],
};

const places = (over = {}, payload = {}) => ({
  id: "p-1",
  kind: "lead_search",
  title: "Find 20 personal trainers",
  summary: "",
  payload: { plan: PLAN, view: { title: "Find 20 personal trainers" }, facts: FACTS, ...payload },
  needs: "partner",
  undo: "Stop the search",
  ...over,
});

const PEOPLE = peoplePlanFrom({
  name: "Owners of home service companies",
  asked: "Owners of home service companies anywhere in the US",
  count: 50,
  titles: ["Owner", "Founder"],
  seniority: ["owner", "founder"],
  industries: ["Construction"],
  keywords: ["plumbing", "HVAC"],
  sizes: ["1 - 10", "11 - 50"],
  states: [],
});
const people = (over = {}) => ({
  id: "p-2",
  kind: "people_search",
  title: "Owners of home service companies",
  summary: "",
  payload: { plan: PEOPLE, facts: { leads_left: 500, renews_on: "Nov 1", rights: "From a business directory." } },
  needs: "partner",
  undo: "Stop the search",
  ...over,
});

const turn = (id, proposals) => ({ id, proposals });

test("a places card is rows to read, the line under them and one press, which posts the plan as it is, at its first version", () => {
  const v = searchCardView(places());
  assert.deepEqual(
    v.sheet.rows.map((r) => r.label),
    ["Finds", "Searched as", "Where", "How many", "Must have", "Leave out", "Shows first"],
  );
  const row = (label) => v.sheet.rows.find((r) => r.label === label).value;
  assert.equal(row("Searched as"), "personal trainer · strength coach", "the words Google Maps is searched with");
  assert.equal(row("Where"), "Austin, TX, about 25 km around");
  assert.equal(row("Leave out"), "Chain gyms · Anyone already yours", "and anyone already the owner's, always");
  assert.match(row("Must have"), /^A personal trainer or coaching studio · Independent/);
  assert.deepEqual(v.sheet.holds, [], "nothing holds it");
  assert.equal(v.press.label, "Find 20 leads");
  assert.equal(v.press.disabled, false);
  assert.equal(v.commit.payload.plan.version, 1, "a new search is never a second version");
  assert.match(v.foot, /^About \d+ min · uses 20 of your 500 leads this month · skips leads you have$/);
  assert.equal(v.source, null);
  // A ZIP is said as it is searched.
  const zip = searchCardView(
    places(
      {},
      { plan: { ...PLAN, area: { ...PLAN.area, kind: "zip", label: "near 78704", zip: "78704", radius_m: 8000 } } },
    ),
  );
  assert.equal(zip.sheet.rows.find((r) => r.label === "Where").value, "Near 78704, about 8 km around");
});

test("the press asks for what the month has room for, says why first, and posts that count with nothing else changed", () => {
  const v = searchCardView(places({}, { facts: { ...FACTS, leadsLeft: 12, bound: "allowance" } }));
  assert.equal(v.press.label, "Find 12 leads");
  assert.match(v.sheet.holds[0], /^You have 12 leads left this month/);
  assert.deepEqual([v.commit.payload.plan.count, v.commit.payload.plan.version], [12, 1]);
  assert.equal(v.commit.payload.plan.terms, PLAN.terms, "the plan is the card's, but for the count");
  const none = searchCardView(places({}, { facts: { ...FACTS, leadsLeft: 0, bound: "allowance" } }));
  assert.deepEqual([none.press.label, none.press.disabled], ["No leads left this month", true]);
  // A criterion the listing cannot show holds the press until it is said another way, in Ask.
  const cannot = searchCardView(
    places(
      {},
      {
        plan: { ...PLAN, criteria: [{ key: "open_late", text: "open late", standard: "seen", required: true }] },
        facts: { ...FACTS, cannotSee: { key: "open_late", text: "open late", likely: "likely open late" } },
      },
    ),
  );
  assert.equal(cannot.press.disabled, true);
  assert.match(cannot.sheet.holds.at(-1), /can't be confirmed\. Say “likely open late” instead, or take it out\./);
});

test("a people card says who, what they are called, the companies as the directory files them and what they do, how big, where and how many, and where its people come from", () => {
  const v = searchCardView(people());
  assert.deepEqual(
    v.sheet.rows.map((r) => [r.label, r.value]),
    [
      ["Finds", "Owners, one at each company"],
      ["Called", "Owner or Founder"],
      ["At", "Construction companies doing plumbing or HVAC"],
      ["Size", "1–50 staff"],
      ["Where", "Across the US"],
      ["How many", "50 companies"],
    ],
  );
  assert.equal(v.press.label, "Find 50 owners");
  assert.equal(v.source, "From a business directory.");
  const tight = searchCardView(people({ payload: { plan: PEOPLE, facts: { leads_left: 20, renews_on: "" } } }));
  assert.deepEqual([tight.press.label, tight.commit.payload.plan.count], ["Find 20 owners", 20]);
  assert.equal(tight.sheet.holds[0], "You have 20 leads left this month.", "no renew day said where none is known");
});

test("a card that answers a search's question, or is no search, draws as any card does", () => {
  assert.equal(searchCardView(places({}, { amends: { search_id: "s1", question: "Include chains?" } })), null);
  assert.equal(searchCardView({ ...places(), kind: "note" }), null);
  assert.equal(
    startsSearch(places({ plan: { id: "x", step: 1, of: 2, silent: true, after: [] } })),
    false,
    "a plan's step is the plan's",
  );
});

test("a new search card sets aside the one still waiting above it: one search card in a thread can be pressed", () => {
  const earlier = [
    turn("m1", [places({ id: "old" })]),
    turn("m2", [places({ id: "pressed", outcome: { state: "done", receipt: "Finding", atMs: 1 } })]),
    turn("m3", [{ ...places({ id: "note" }), kind: "note" }]),
  ];
  assert.deepEqual(searchCardsReplaced(earlier, [places({ id: "new" })]), [{ messageId: "m1", proposalId: "old" }]);
  assert.deepEqual(searchCardsReplaced(earlier, [people({ id: "new" })]), [{ messageId: "m1", proposalId: "old" }]);
  assert.deepEqual(searchCardsReplaced(earlier, []), [], "an answer with no search card replaces nothing");
  // The Line, as the answer lands: the same card set aside, with the words the card then says.
  const landed = withAnswerLanded(earlier, turn("m4", [places({ id: "new" })]), 42);
  assert.equal(landed.length, 4);
  assert.deepEqual(landed[0].proposals[0].outcome, {
    state: "dismissed",
    receipt: SEARCH_CARD_REPLACED,
    atMs: 42,
    undo: null,
  });
  assert.equal(landed[1].proposals[0].outcome.state, "done", "a card already pressed stays as it is");
  assert.equal(landed[3].proposals[0].outcome, undefined);
});

test("a card that replaces an idea's keeps the idea's mark, however it was changed", () => {
  const fromIdea = [turn("m1", [places({ id: "old" }, { plan: { ...PLAN, from: "idea" } })])];
  const [made] = withIdeaCarried(fromIdea, [places({ id: "new" }, { plan: { ...PLAN, count: 40 } })]);
  assert.deepEqual([made.payload.plan.from, made.payload.plan.count], ["idea", 40]);
  const [plain] = withIdeaCarried([turn("m1", [places({ id: "old" })])], [places({ id: "new" })]);
  assert.equal(plain.payload.plan.from, undefined, "one asked of Ask is no idea's");
});

test("the waiting search card is told to the turn whole, as find takes it, so a change keeps the rest of the plan", () => {
  assert.equal(waitingSearchWords([]), null);
  assert.equal(waitingSearchWords([{ ...places(), kind: "note" }]), null);
  const said = waitingSearchWords([places()]);
  assert.match(said, /^A search card waits in this thread for their press, “Find 20 personal trainers” \(p-1\)/);
  const ask = JSON.parse(/: (\{.*\})\. When they change it/.exec(said)[1]);
  assert.deepEqual(
    [ask.looking_for, ask.city, ask.region, ask.count, ask.terms, ask.leave_out, ask.contact],
    ["local_businesses", "Austin", "TX", 20, PLAN.terms, [{ words: "chain gyms" }], "phone"],
  );
  assert.deepEqual(
    ask.criteria,
    PLAN.criteria.map((c) => ({ text: c.text, standard: c.standard, required: c.required })),
  );
  assert.match(said, /changed only where they said/);
  const told = JSON.parse(/: (\{.*\})\. When they change it/.exec(waitingSearchWords([people()]))[1]);
  assert.deepEqual(
    [told.looking_for, told.region, told.keywords, told.industries, told.company_sizes],
    ["people_at_companies", "US", ["plumbing", "HVAC"], ["Construction"], ["1 - 10", "11 - 50"]],
  );
});
