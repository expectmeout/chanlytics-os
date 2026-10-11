/**
 * The ideas for a new search (00398, 00399), decided in code: what each kind a workspace searched for found and its
 * verdict (with the clock: silence counts once the emails have had a week), the places an idea may name (the home ZIP
 * and city one place), the question's schema, the ideas passed on before, and the model's answer read back into ready
 * plans with the code's rules held whatever the model wrote. The same made-up workspaces the eval asks the model about
 * (tooling/scripts/fixtures/lead-ideas/workspaces.json), here with a scripted answer and no model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LeadIdeasAnswerSchema,
  LeadSearchPlanSchema,
  ideaAsk,
  ideaHistoryOf,
  ideaPassed,
  ideasFrom,
  ideasRead,
  leadKindKey,
  planLeadSearch,
} from "@chanlytics/contracts";
import { judgeIdeas, loadWorkspaces, workspaceOf } from "../../../evals/lead-ideas.mjs";

const NOW = new Date("2026-10-11T15:00:00Z");
const SET = loadWorkspaces();
const fx = (id) => SET.find((w) => w.id === id);

/** One idea as the model writes it, with what a test changes. */
const idea = (over = {}) => ({
  words: "independent restaurants",
  why: "Restaurants wrote back: 5 of 20.",
  who: "restaurants",
  who_one: "restaurant",
  category_key: "restaurant",
  terms: ["restaurant"],
  place: "P1",
  count: 50,
  contact: "email",
  criteria: [],
  leave_out: ["chains"],
  ...over,
});
const answer = (ideas) => LeadIdeasAnswerSchema.parse({ line: "Ledgerline Books", ideas });
/** One idea of a kind, its words the kind's plural: "bakery" -> "bakeries". */
const plural = (key) => (key.endsWith("y") ? `${key.slice(0, -1)}ies` : `${key}s`);
const kindOf = (key, over = {}) =>
  idea({ category_key: key, who: plural(key), who_one: key, words: plural(key), ...over });

test("a kind's key is one key: plural, singular, spaced or hyphenated, and the plan keeps it that way", () => {
  for (const words of ["Personal trainers", "personal_trainer", "personal-trainers", "PERSONAL TRAINER"])
    assert.equal(leadKindKey(words), "personal_trainer", words);
  assert.deepEqual(
    ["bakeries", "coffee shops", "pilates studios", "churches", "glass", "fitness", "spas", "attorneys"].map(
      leadKindKey,
    ),
    ["bakery", "coffee_shop", "pilates_studio", "church", "glass", "fitness", "spa", "attorney"],
  );
  const r = planLeadSearch({
    looking_for: "local_businesses",
    country: "US",
    count: 50,
    who: "plumbers",
    who_one: "plumber",
    category_key: "plumbers",
    terms: ["plumber"],
    city: "Austin",
    region: "TX",
    zip: null,
    contact: "email",
    criteria: [],
    leave_out: [],
    asked: "plumbers in Austin",
  });
  assert.equal(r.ok && r.plan.category_key, "plumber", "a plan keys its kind one of them");
});

test("lead_suggest_history's answer is narrowed: a search's kind is its plan's key, or a key from its name, one of them", () => {
  const h = ideaHistoryOf({
    basis: "2026-10-01T10:00:00.5+00:00",
    home: { city: "Austin", region: "Texas", zip: "78701-1234" },
    searches: [
      {
        name: "Personal trainers",
        kind: null,
        found: { qualified: "3" },
        from_idea: true,
        reach: { sent: 4, last_sent_at: "2026-10-09T10:00:00+00:00" },
      },
      { kind: "x" },
    ],
  });
  assert.equal(h.basis, "2026-10-01T10:00:00.500Z");
  assert.deepEqual(h.home, { city: "Austin", state: "TX", zip: "78701" });
  assert.equal(h.searches.length, 1, "a search with no name is no search");
  assert.equal(h.searches[0].kind, "personal_trainer", "one of them, as a plan keys it");
  assert.equal(h.searches[0].found.qualified, 3);
  assert.equal(h.searches[0].fromIdea, true);
  assert.equal(h.searches[0].reach.lastSentAt, "2026-10-09T10:00:00.000Z");
});

test("a kind is judged by its counts and the clock: worked, did not work, running, not reached, too early", () => {
  const worked = workspaceOf(fx("a-kind-that-worked"), NOW).packet.kinds[0];
  assert.equal(worked.verdict, "worked");
  assert.ok(worked.lines.some((l) => l.includes("5 wrote back")));
  assert.equal(workspaceOf(fx("a-kind-full-of-chains"), NOW).packet.kinds[0].verdict, "did_not_work");
  assert.equal(workspaceOf(fx("a-kind-nobody-answered"), NOW).packet.kinds[0].verdict, "did_not_work");
  assert.equal(workspaceOf(fx("an-area-that-ran-dry"), NOW).packet.kinds[0].verdict, "not_reached");
  assert.equal(workspaceOf(fx("a-search-still-running"), NOW).packet.kinds[0].verdict, "running");
  // The same silence, emailed two days ago: too early to say, and the line says when they were last emailed.
  const early = workspaceOf(fx("a-kind-emailed-lately"), NOW).packet.kinds[0];
  assert.equal(early.verdict, "too_early");
  assert.ok(
    early.lines.some((l) => l === "Last emailed 2 days ago"),
    early.lines.join(" | "),
  );
  // One interested call is a person; two are a kind.
  const withInterested = (n) => {
    const w = JSON.parse(JSON.stringify(fx("a-kind-nobody-answered")));
    for (const s of w.history.searches) s.leads.interested = n;
    return workspaceOf(w, NOW).packet.kinds[0].verdict;
  };
  assert.equal(withInterested(1), "did_not_work");
  assert.equal(withInterested(2), "worked");
});

test("the places are the home first, then what was searched, then what lies beside it, each once, the home ZIP and city one place", () => {
  const { packet } = workspaceOf(fx("a-kind-that-worked"), NOW);
  assert.deepEqual(
    packet.places.map((p) => `${p.id} ${p.area.label} · ${p.note}`),
    [
      "P1 near 78701 · home",
      "P2 Austin, TX · home city",
      "P3 near 78702 · beside near 78701",
      "P4 near 78703 · beside near 78701",
    ],
  );
  assert.deepEqual(packet.places[0].takenFor, ["restaurant"]);
  assert.deepEqual(packet.places[1].takenFor, ["restaurant"], "the home city lies around the home ZIP: taken in both");
  // The address the profile gives stands in for a workspace with no record and no listing.
  const dry = workspaceOf(fx("an-area-that-ran-dry"), NOW).packet;
  assert.equal(dry.places[0].area.label, "near 78703");
  assert.ok(dry.places.some((p) => p.area.label === "Round Rock, TX"));
});

test("the workspace's own kind, from its listing, is never an idea; and the language is the workspace's", () => {
  const own = workspaceOf(fx("a-kind-that-worked"), NOW);
  assert.equal(own.packet.ownKind, "accounting");
  assert.match(own.text, /Its own kind, from its Google listing: accounting\. Never suggest this kind/);
  assert.deepEqual(
    ideasRead(answer([kindOf("accounting")]), own.packet).dropped,
    { own_kind: 1 },
    "its competitors are no idea",
  );
  const es = workspaceOf(fx("una-linea-en-espanol"), NOW);
  assert.equal(es.packet.language, "es");
  assert.match(es.text, /Write words, why and line in Spanish/);
  assert.doesNotMatch(own.text, /Spanish/);
});

test("the schema holds the model to the listed places and the sizes the month allows", () => {
  const { schema, packet } = workspaceOf(fx("a-kind-nobody-answered"), NOW);
  const item = schema.properties.ideas.items;
  assert.deepEqual(
    item.properties.place.enum,
    packet.places.map((p) => p.id),
  );
  assert.deepEqual(item.properties.count.enum, [25], "40 left this month offers 25 alone");
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort());
  assert.equal(/minLength|maxLength|minimum|maximum|minItems|maxItems/.test(JSON.stringify(schema)), false);
});

test("an idea is a ready plan in its listed place, keeping its kind", () => {
  const ws = workspaceOf(fx("a-kind-that-worked"), NOW);
  const [it] = ideasFrom(answer([idea({ place: "P3" })]), ws.packet);
  assert.equal(it.words, "Independent restaurants near 78702");
  assert.equal(it.plan.area.label, "near 78702");
  assert.equal(it.plan.category_key, "restaurant");
  assert.equal(LeadSearchPlanSchema.safeParse(it.plan).success, true);
  assert.equal(ideaAsk(it.plan), "Find 50 restaurants near 78702, leaving out chains");
});

test("the code's rules hold whatever the model wrote, and say which rule dropped what", () => {
  const ws = workspaceOf(fx("a-kind-full-of-chains"), NOW);
  const { items, dropped } = ideasRead(
    answer([
      idea({ category_key: "coffee_shop", who: "coffee shops", who_one: "coffee shop", place: "P3" }),
      kindOf("bakery"),
      kindOf("bakery", { place: "P9" }),
      kindOf("bakery", { place: "P1" }),
      kindOf("bakery", { place: "P1" }),
      kindOf("florist", { words: "fl" }),
    ]),
    ws.packet,
  );
  assert.deepEqual(
    items.map((i) => i.words),
    ["Bakeries near 78704"],
    "a kind that did not work, a place not listed, the same idea twice and no words are dropped",
  );
  assert.deepEqual(dropped, { did_not_work: 1, place_unlisted: 1, twice: 2, no_words: 1 });
});

test("an idea offered before and not started is passed on: counted once more each time, let go once started, refused once offered twice", () => {
  const ws = workspaceOf(fx("a-kind-that-worked"), NOW);
  const [cafes, bars] = ideasFrom(answer([kindOf("cafe", { place: "P3" }), kindOf("bar", { place: "P4" })]), ws.packet);
  const made = "2026-10-01T00:00:00.000Z";
  // Bars were searched since the ideas were made, in their place: started, so not passed on. Cafes were not.
  const searches = ideaHistoryOf({
    searches: [{ name: "bars", kind: "bar", at: "2026-10-05T00:00:00Z", area: bars.plan.area }],
  }).searches;
  const once = ideaPassed({ items: [cafes, bars], madeAt: made, passed: [] }, searches);
  assert.deepEqual(once, [{ key: "cafe", place: "near 78702", label: "near 78702", times: 1 }]);
  const twice = ideaPassed({ items: [cafes], madeAt: made, passed: once }, searches);
  assert.equal(twice[0].times, 2);
  // Offered twice: the question says so, and the rule refuses it however the model answers.
  const again = workspaceOf({ ...fx("a-kind-that-worked"), passed: twice }, NOW);
  assert.match(again.text, /Offered before and not started[\s\S]*cafe near 78702 · offered twice/);
  assert.deepEqual(ideasRead(answer([kindOf("cafe", { place: "P3" })]), again.packet).dropped, { passed: 1 });
  // Offered once, it may still be offered.
  const onceMore = workspaceOf({ ...fx("a-kind-that-worked"), passed: once }, NOW);
  assert.equal(ideasFrom(answer([kindOf("cafe", { place: "P3" })]), onceMore.packet).length, 1);
});

test("the eval's judge fails an idea that says a number it was not given, and one that builds on nothing that worked", () => {
  const f = fx("a-kind-that-worked");
  const ws = workspaceOf(f, NOW);
  const items = ideasFrom(
    answer([
      kindOf("cafe", { why: "9 of 10 reply", place: "P3" }),
      kindOf("bar", { why: "Open late", place: "P4" }),
      kindOf("bakery", { why: "Near you", place: "P2" }),
    ]),
    ws.packet,
  );
  const verdict = judgeIdeas(f, ws, items);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.failures.some((x) => x.includes("says 9")));
  assert.ok(verdict.failures.some((x) => x.includes("nothing builds on restaurant")));
});
