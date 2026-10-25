/**
 * What the Business Profile and the website said (decision 0073, R10, R17; contracts imports/business-reads.ts): a read's
 * facts taken for what each is, and what Check offers of them beside what the record already holds -- each thing once,
 * the profile's before the website's, a read that could not be made said once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FOUND_WORDS, WEBSITE_READ_SCHEMA, businessReadFactsOf, foundOf } from "@chanlytics/contracts";

const read = (source, facts, over = {}) => ({
  source,
  facts: businessReadFactsOf(facts),
  read_from: source === "website" ? "https://harbor.example" : null,
  read_at: "2026-09-07T15:00:00Z",
  error: null,
  ...over,
});
const NOTHING = { services: [], closures: [], notes: [], description: null };

test("a read's facts are taken for what each is: a field of the wrong kind is none, a list of things that are not is empty", () => {
  assert.deepEqual(
    businessReadFactsOf({
      services: [
        { name: "  Local   moves ", price_note: "from $300", duration_min: 119.6 },
        { name: "", price_note: "$5" },
        { name: "Packing", price_note: 40, duration_min: -5 },
        "Storage",
      ],
      closed: [
        { date: "2026-12-24", until: "2026-12-26" },
        { date: "Christmas" },
        { date: "2027-01-01", until: "soon" },
      ],
      rules: ["A $50 deposit holds the day", 7, "   "],
      answers: [{ q: "Do you move pianos?", a: "Yes, with two days' notice." }, { q: "Insured?" }],
      description: "Family movers in Brooklyn since 1998.",
    }),
    {
      services: [
        { name: "Local moves", price_note: "from $300", duration_min: 120 },
        { name: "Packing", price_note: null, duration_min: null },
      ],
      closed: [
        { date: "2026-12-24", until: "2026-12-26" },
        { date: "2027-01-01", until: null },
      ],
      rules: ["A $50 deposit holds the day"],
      answers: [{ q: "Do you move pianos?", a: "Yes, with two days' notice." }],
      description: "Family movers in Brooklyn since 1998.",
    },
  );
  const none = { services: [], closed: [], rules: [], answers: [], description: null };
  assert.deepEqual(businessReadFactsOf(null), none);
  assert.deepEqual(businessReadFactsOf(["services"]), none);
  assert.deepEqual(businessReadFactsOf({ services: "Local moves", description: 12 }), none);
});

test("the website's reading answers in the shape the facts are read in: every field asked for, nothing else", () => {
  assert.deepEqual([...WEBSITE_READ_SCHEMA.required], ["services", "closed", "rules", "answers", "description"]);
  assert.equal(WEBSITE_READ_SCHEMA.additionalProperties, false);
  assert.deepEqual([...WEBSITE_READ_SCHEMA.properties.services.items.required], ["name", "price_note", "duration_min"]);
});

test("Check offers what the reads found that the record does not hold: the profile's first, each thing once", () => {
  const profile = read("google_profile", {
    services: [{ name: "Local moves", price_note: "from $300" }, { name: "Packing" }],
    closed: [{ date: "2026-12-24", until: null }],
  });
  const website = read("website", {
    services: [
      { name: "local moves", price_note: "$350" },
      { name: "Storage", duration_min: 30 },
    ],
    closed: [{ date: "2026-12-24", until: "2026-12-26" }, { date: "2027-01-01" }],
    rules: ["A $50 deposit holds the day"],
    answers: [{ q: "Do you move pianos?", a: "Yes, with two days' notice." }],
    description: "Family movers in Brooklyn since 1998.",
  });
  // Given in the website's order first: the profile is still said first.
  const found = foundOf([website, profile], NOTHING);
  assert.deepEqual(
    found.services.map((s) => [s.name, s.price_note, s.from]),
    [
      ["Local moves", "from $300", "Google profile"],
      ["Packing", null, "Google profile"],
      ["Storage", null, "your website"],
    ],
    "the website's Local moves is the profile's, said once",
  );
  assert.deepEqual(
    found.closed.map((c) => [c.date, c.until, c.from]),
    [
      ["2026-12-24", null, "Google profile"],
      ["2027-01-01", null, "your website"],
    ],
  );
  assert.deepEqual(found.notes, [
    { title: "Booking rule", text: "A $50 deposit holds the day", from: "your website" },
    { title: "Do you move pianos?", text: "Yes, with two days' notice.", from: "your website" },
  ]);
  assert.deepEqual(found.description, { text: "Family movers in Brooklyn since 1998.", from: "your website" });
  assert.equal(found.unread, null);
  assert.equal(found.any, true);
  assert.equal(FOUND_WORDS.service("Storage", null, 30), "Storage · 30 min");
  assert.equal(FOUND_WORDS.closed("2026-12-24", "2026-12-26"), "Closed 2026-12-24 to 2026-12-26");
});

test("what the record already holds is never offered again, and a read that could not be made is said once", () => {
  const website = read(
    "website",
    {
      services: [{ name: "Packing" }],
      closed: [{ date: "2026-12-24" }],
      rules: ["A $50 deposit holds the day"],
      answers: [{ q: "Insured?", a: "Fully insured." }],
      description: "Family movers.",
    },
    { error: "it didn't answer, or answered with no page" },
  );
  const found = foundOf([website], {
    services: [{ name: "Packing" }],
    closures: [{ date: "2026-12-24" }],
    notes: [
      { title: "Deposits", text: "A $50 deposit holds the day" },
      { title: "Insurance", text: "Fully insured." },
    ],
    description: "Our own words.",
  });
  assert.deepEqual([found.services, found.closed, found.notes, found.description], [[], [], [], null]);
  assert.equal(found.unread, "Your website couldn't be read: it didn't answer, or answered with no page");
  assert.equal(found.any, false);
  assert.deepEqual(foundOf(null, NOTHING), {
    services: [],
    closed: [],
    notes: [],
    description: null,
    unread: null,
    any: false,
  });
});
