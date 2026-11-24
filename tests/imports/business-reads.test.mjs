/**
 * What the Business Profile and the website said (decision 0073, R10, R17; contracts imports/business-reads.ts): a read's
 * facts taken for what each is, and what Check offers of them beside what the record already holds -- each thing once,
 * the profile's before the website's, a read that could not be made said once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingPageRead,
  FOUND_WORDS,
  PROFILE_LIMITS,
  WEBSITE_READ_SCHEMA,
  businessReadFactsOf,
  filmShotsOf,
  foundOf,
  foundServicesRoom,
  withFoundClosure,
  withFoundNote,
  withFoundServices,
  withFoundWorn,
} from "@chanlytics/contracts";

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
      look: null,
      booking_page: null,
      booking_read: false,
    },
  );
  const none = {
    services: [],
    closed: [],
    rules: [],
    answers: [],
    description: null,
    look: null,
    booking_page: null,
    booking_read: false,
  };
  assert.deepEqual(businessReadFactsOf(null), none);
  assert.deepEqual(businessReadFactsOf(["services"]), none);
  assert.deepEqual(businessReadFactsOf({ services: "Local moves", description: 12 }), none);
});

test("where the site says customers book, read for what it is, and whether that page was read too", () => {
  const PAGE = "https://calendly.com/harbor-moving-example/estimate";
  const read = (o) => businessReadFactsOf(o);
  assert.deepEqual(
    [
      read({ booking_page: PAGE, booking_read: false }).booking_page,
      read({ booking_page: PAGE, booking_read: false }).booking_read,
    ],
    [PAGE, false],
    "named, and not read",
  );
  assert.equal(read({ booking_page: PAGE, booking_read: true }).booking_read, true);
  assert.equal(
    read({ booking_page: PAGE }).booking_read,
    true,
    "a row from before the two were told apart named what it read",
  );
  assert.equal(
    read({ booking_page: "javascript:alert(1)" }).booking_page,
    null,
    "the column is jsonb: read for what it is",
  );
  assert.equal(
    read({ booking_page: "https://harbor.example.com/book" }).booking_page,
    null,
    "no platform's page, no booking page",
  );
  const of = (facts, source = "website") => ({
    source,
    facts: read(facts),
    read_from: null,
    read_at: "2026-11-04T00:00:00Z",
    error: null,
  });
  assert.equal(bookingPageRead([of({ booking_page: PAGE })]), PAGE);
  assert.equal(
    bookingPageRead([of({ booking_page: PAGE }, "google_profile")]),
    null,
    "the website's, no other source's",
  );
  assert.equal(bookingPageRead([]), null);
  assert.equal(bookingPageRead(null), null);
  const empty = { services: [], closures: [], notes: [], description: null };
  const withService = { services: [{ name: "Local moves", price_note: null, duration_min: null }] };
  const fromOf = (facts) => foundOf([of({ ...withService, ...facts })], empty).services[0].from;
  assert.equal(fromOf({ booking_page: PAGE, booking_read: true }), FOUND_WORDS.fromWithBooking);
  assert.equal(
    fromOf({ booking_page: PAGE, booking_read: false }),
    FOUND_WORDS.from.website,
    "a page named, not read, is not said to be",
  );
});

test("the website's reading answers in the shape the facts are read in: every field asked for, nothing else", () => {
  // film: three shots to film for a video, read apart from the facts (filmShotsOf) and kept beside them; look: the feel,
  // the call and the music's mood the brand kit is proposed from on day one (content/making/kit.ts siteKitOf).
  assert.deepEqual(
    [...WEBSITE_READ_SCHEMA.required],
    ["services", "closed", "rules", "answers", "description", "film", "look"],
  );
  assert.deepEqual([...WEBSITE_READ_SCHEMA.properties.look.required], ["words", "call", "music"]);
  assert.equal(WEBSITE_READ_SCHEMA.additionalProperties, false);
  assert.deepEqual([...WEBSITE_READ_SCHEMA.properties.services.items.required], ["name", "price_note", "duration_min"]);
  // A clip's length is its own number (Content's card says it once, "8s each"), never words inside where to stand.
  assert.deepEqual([...WEBSITE_READ_SCHEMA.properties.film.items.required], ["what", "how", "seconds"]);
});

test("a clip to film keeps its seconds where they are a clip's, and a read before them keeps none", () => {
  const shots = filmShotsOf({
    film: [
      { what: "The chat on the phone", how: "Hold the phone over a desk.", seconds: 8 },
      { what: "The count, from above", how: "Straight down over the screen.", seconds: 900 },
      { what: "Written before 16 Nov", how: "Film it for about 8 seconds." },
    ],
  });
  assert.deepEqual(
    shots.map((s) => s.seconds),
    [8, null, null],
  );
});

test("a clip's line that runs long ends at its last whole word, never mid-word, and a short one is kept whole", () => {
  const long = "Hold the phone flat on a desk, screen facing up, and film the screen over the table slowly ".repeat(3);
  const [shot] = filmShotsOf({ film: [{ what: "Phone showing an automated reply", how: long, seconds: 10 }] });
  assert.ok(shot.how.length <= 160, `at most 160 characters: ${shot.how.length}`);
  assert.match(shot.how, /\b(table|slowly|over|the|screen|film|and|up|facing|desk|flat|on|a|phone|Hold)…$/, shot.how);
  assert.ok(long.startsWith(shot.how.slice(0, -1)), "what it keeps is the line's own start");
  const [short] = filmShotsOf({
    film: [{ what: "Need you approval screen", how: "Rest the phone on a stand.", seconds: 8 }],
  });
  assert.equal(short.how, "Rest the phone on a stand.");
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

/** What a site says, read and offered, for the adds below. */
const SITE_FOUND = () =>
  foundOf(
    [
      {
        source: "website",
        read_from: "https://fixture.example.com",
        read_at: "2026-10-30T12:00:00Z",
        error: null,
        facts: {
          services: [
            { name: "Fade", price_note: "$35", duration_min: 30 },
            { name: "Beard trim", price_note: "from $15", duration_min: null },
          ],
          closed: [{ date: "2026-12-24", until: "2026-12-26" }],
          rules: ["Cancel 24 hours ahead"],
          answers: [{ q: "Do you take walk-ins?", a: "Yes, until 5 PM." }],
          description: "A neighbourhood barber.",
          look: null,
        },
      },
    ],
    { services: [], closures: [], notes: [], description: null },
  );

test("a press adds what it always added: a service with its price, a day closed, a rule, an answer", () => {
  const found = SITE_FOUND();
  const priced = withFoundServices({}, found.services, { prices: true });
  assert.deepEqual(priced.services, [
    { name: "Fade", price_note: "$35", duration_min: 30 },
    { name: "Beard trim", price_note: "from $15" },
  ]);
  assert.deepEqual(withFoundClosure({}, found.closed[0]).closures, [{ date: "2026-12-24", until: "2026-12-26" }]);
  const rule = found.notes.find((n) => n.title === FOUND_WORDS.rulesTitle);
  assert.deepEqual(withFoundNote({ booking_rules: { lead_hours: 2 } }, rule).booking_rules, {
    lead_hours: 2,
    notes: ["Cancel 24 hours ahead"],
  });
  assert.deepEqual(withFoundNote({}, { title: "Do you take walk-ins?", text: "Yes, until 5 PM." }).notes, [
    { title: "Do you take walk-ins?", text: "Yes, until 5 PM." },
  ]);
  const full = { services: Array.from({ length: PROFILE_LIMITS.services - 1 }, (_, i) => ({ name: `S${i}` })) };
  assert.deepEqual(
    foundServicesRoom(full, found.services).map((s) => s.name),
    ["Fade"],
    "as many as the record has room for",
  );
});

test("worn at once, for a preview: every service without its price, the day closed, the rule, the answer, the words", () => {
  const worn = withFoundWorn({ hours: { mon: { open: "09:00", close: "17:00" } } }, SITE_FOUND());
  assert.deepEqual(worn.services, [{ name: "Fade", duration_min: 30 }, { name: "Beard trim" }], "no price, ever");
  assert.deepEqual(worn.closures, [{ date: "2026-12-24", until: "2026-12-26" }]);
  assert.deepEqual(worn.booking_rules, { notes: ["Cancel 24 hours ahead"] });
  assert.deepEqual(worn.notes, [
    { title: "Do you take walk-ins?", text: "Yes, until 5 PM." },
    { title: FOUND_WORDS.aboutTitle, text: "A neighbourhood barber." },
  ]);
  assert.deepEqual(worn.hours, { mon: { open: "09:00", close: "17:00" } }, "what the record held stays");
});

test("worn at once, only where the record has room", () => {
  const full = {
    notes: Array.from({ length: PROFILE_LIMITS.notes }, (_, i) => ({ title: `N${i}`, text: "x" })),
    booking_rules: { notes: Array.from({ length: PROFILE_LIMITS.ruleNotes }, (_, i) => `R${i}`) },
  };
  const worn = withFoundWorn(full, SITE_FOUND());
  assert.equal(worn.notes.length, PROFILE_LIMITS.notes);
  assert.equal(worn.booking_rules.notes.length, PROFILE_LIMITS.ruleNotes);
  assert.equal(worn.services.length, 2, "services had room");
});
