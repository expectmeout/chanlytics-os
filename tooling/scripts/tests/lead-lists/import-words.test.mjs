/**
 * A list of your own, in contracts' words (Reach out Part 7: J1, J4, J5, J7, J8; lead-import.ts): a file read by its
 * header or by what its columns hold, each row as the door takes it, what the sheet and *Write to them* say, a list's
 * strip and empty table, a list's line in the rail's menu, and the bodies' limits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_IMPORT_WORDS,
  LEAD_LIST_MAX,
  LeadChooseSchema,
  LeadImportSchema,
  isLeadList,
  leadChooseAnswerWords,
  leadChooseNameOf,
  leadImportAnswerWords,
  leadImportCountWords,
  leadImportEstimateUsd,
  leadImportNameOf,
  leadImportPlanOf,
  leadListEmptyOf,
  leadListStripOf,
  leadRail,
  leadSearchWords,
  reachOutPersonOf,
  regionOf,
  websiteHostOf,
} from "@chanlytics/contracts";

const TZ = "America/Chicago";
const NOW = Date.parse("2026-09-28T17:00:00.000Z");

test("a file with a header: each column by its words, each row as the door takes it", () => {
  const plan = leadImportPlanOf(
    [
      "Company,E-mail,Phone Number,Website URL,City,State,Industry",
      `"Zilker Kettlebell Club, LLC",Hello@Zilker.example,(512) 555-0101,https://www.zilker.example/about,Austin,Texas,Gym`,
      "Barton Springs Barre,studio@barre.example,,barre.example,Austin,TX,Studio",
      "No Address Gym,,512-555-0102,,Austin,TX,Gym",
      ",nobody@example.com,,,,,",
    ].join("\n"),
  );
  assert.equal(plan.header, true);
  assert.deepEqual(plan.columns, { name: 0, email: 1, phone: 2, website: 3, city: 4, region: 5, category: 6 });
  assert.deepEqual(plan.rows[0], {
    line: 2,
    name: "Zilker Kettlebell Club, LLC",
    email: "hello@zilker.example",
    phone: "+15125550101",
    website_host: "zilker.example",
    city: "Austin",
    region: "TX",
    category: "Gym",
  });
  assert.deepEqual(plan.counts, { rows: 4, ready: 2, noEmail: 1, noName: 1 });
  assert.equal(leadImportCountWords(plan.counts), "4 rows · 2 with a name and an email · 2 without");
});

test("a file with no header: the address, the number and the website by what they hold, the name the words left", () => {
  const plan = leadImportPlanOf(
    [
      "Zilker Club,hello@zilker.example,5125550101,zilker.example",
      "Barre Co,studio@barre.example,5125550102,barre.example",
    ].join("\n"),
  );
  assert.equal(plan.header, false);
  assert.deepEqual([plan.columns.name, plan.columns.email, plan.columns.phone, plan.columns.website], [0, 1, 2, 3]);
  assert.deepEqual([plan.rows[1].line, plan.rows[1].name, plan.rows[1].website_host], [2, "Barre Co", "barre.example"]);
});

test("a website is its host, a state is its code, and nothing else is either", () => {
  assert.equal(websiteHostOf("HTTPS://WWW.Example.com/Path?q=1"), "example.com");
  assert.equal(websiteHostOf("shop.example.co.uk"), "shop.example.co.uk");
  assert.equal(websiteHostOf("hello@example.com"), null);
  assert.equal(websiteHostOf("not a site"), null);
  assert.deepEqual(
    [regionOf("tx"), regionOf("Texas"), regionOf("District of Columbia"), regionOf("XX"), regionOf("")],
    ["TX", "TX", "DC", null, null],
  );
});

test("the bodies' limits: 1 to 500 rows with a name and an address, 1 to 500 lead ids", () => {
  const row = { name: "Gym", email: "gym@example.com" };
  assert.equal(LEAD_LIST_MAX, 500);
  assert.ok(LeadImportSchema.safeParse({ name: "Expo", rows: [row] }).success);
  assert.ok(!LeadImportSchema.safeParse({ name: "Expo", rows: Array(501).fill(row) }).success);
  assert.ok(!LeadImportSchema.safeParse({ name: " ", rows: [row] }).success);
  assert.ok(!LeadImportSchema.safeParse({ name: "Expo", rows: [{ ...row, name: "" }] }).success);
  assert.ok(
    !LeadImportSchema.safeParse({ name: "Expo", rows: [{ ...row, region: "Texas" }] }).success,
    "a state is its code",
  );
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.ok(LeadChooseSchema.safeParse({ name: "1 chosen", lead_ids: [id] }).success);
  assert.ok(!LeadChooseSchema.safeParse({ name: "1 chosen", lead_ids: [] }).success);
  assert.ok(!LeadChooseSchema.safeParse({ name: "1 chosen", lead_ids: ["nope"] }).success);
});

test("what a check may cost: the card's price an address with the margin, never under the run's floor", () => {
  assert.deepEqual(
    [leadImportEstimateUsd(1), leadImportEstimateUsd(100), leadImportEstimateUsd(500)],
    [0.5, 0.5, 0.58],
  );
});

test("names: the file's own, else the day; a choice by its count and the day", () => {
  assert.equal(leadImportNameOf("austin_expo-gyms.csv", NOW, TZ), "austin expo gyms");
  assert.equal(leadImportNameOf(null, NOW, TZ), "Imported on Sep 28");
  assert.equal(leadChooseNameOf(NOW, TZ), "Chosen on Sep 28", "by the day: how many join is the door's to say");
});

test("what an import and a choice did, in the sheet's and the toast's words", () => {
  const said = leadImportAnswerWords(
    {
      search_id: "s",
      added: 140,
      checking: 141,
      counted: 1,
      left_out: { unreadable: 2, twice: 1, customer: 3, never_again: 1, elsewhere: 1 },
    },
    4,
  );
  assert.deepEqual(said, {
    title: "142 businesses on the list",
    lines: [
      "Checking 141 addresses now: each one that checks out joins Ready, usually within a few minutes.",
      "1 lead already counted joined as it is.",
      "Left out: 6 without a name or an address, 1 twice in the file, 3 already in People, 1 on your never-again list, 1 being checked in another search.",
    ],
  });
  assert.equal(
    leadChooseAnswerWords({ search_id: "s", counted: 12, left_out: { not_counted: 2, no_email: 1, gone: 0 } }),
    "12 leads on the list. Left out: 2 not yet counted: keep them first, 1 with no address.",
  );
  assert.equal(
    leadChooseAnswerWords({ search_id: "s", counted: 1, left_out: { not_counted: 0, no_email: 0, gone: 0 } }),
    "1 lead on the list.",
  );
});

const round = (over = {}) => ({
  id: "r",
  seq: 1,
  purpose: "main",
  state: "checking",
  ending: null,
  question: null,
  target: 140,
  counted: 35,
  qualified: 35,
  review: 105,
  excluded: 0,
  emails_checked: 35,
  with_phone: 0,
  ending_pending: false,
  waiting_since: null,
  cost_usd: 0,
  ended_at: null,
  undo_op_id: null,
  undo_version: null,
  nearby: [],
  ...over,
});

test("a list's strip: its check while it runs, what checked out once it ends; a choice's; none for a finder's", () => {
  assert.deepEqual(leadListStripOf({ via: "import", round: round() }), {
    state: "running",
    alert: false,
    title: "Checking the addresses on your list",
    parts: ["35 ready so far"],
    progress: null,
    actions: [],
  });
  assert.deepEqual(
    leadListStripOf({
      via: "import",
      round: round({ state: "ended", ending: "searched_everything", qualified: 130, review: 10 }),
    }),
    {
      state: "ended",
      alert: false,
      title: "130 of 140 on your list are ready",
      parts: ["10 could not be confirmed and wait in Needs review"],
      progress: null,
      actions: [{ id: "review", label: "10 need a look", arg: "review", pile: true }],
    },
  );
  assert.equal(
    leadListStripOf({ via: "chosen", round: round({ state: "ended", qualified: 12 }) }).title,
    "12 leads you chose",
  );
  assert.equal(leadListStripOf({ via: "people", round: round() }), null);
  assert.equal(leadListStripOf(null), null);
  assert.deepEqual(leadListEmptyOf({ via: "import", round: round() }).title, "Checking the addresses.");
  assert.equal(leadListEmptyOf({ via: "import", round: round({ state: "ended" }) }), null);
  assert.equal(leadListEmptyOf({ via: "chosen", round: round() }), null);
});

test("a list says where it came from, and the rail marks it so its menu never searches again", () => {
  const s = (via, asked) => ({
    id: via,
    name: "Expo gyms",
    asked,
    asked_on: "2026-09-28T15:00:00.000Z",
    via,
    plan_version: 1,
    thread_id: null,
    round: round(),
  });
  assert.equal(
    leadSearchWords(s("import", "gyms I met at the expo"), TZ).askedLine,
    "Your list, imported on Sep 28: “gyms I met at the expo”.",
  );
  assert.equal(leadSearchWords(s("chosen", ""), TZ).askedLine, "Leads you chose on Sep 28.");
  assert.deepEqual(
    [isLeadList(s("import")), isLeadList(s("chosen")), isLeadList(s("people")), isLeadList({})],
    [true, true, false, false],
  );
  const counts = { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 };
  assert.deepEqual(
    leadRail(counts, [s("import", "x"), s("people", "y")]).searches.map((r) => r.list),
    [true, false],
  );
  assert.equal(
    LEAD_IMPORT_WORDS.searchAgain,
    "A list of your own is not searched again. Start a new search to find more businesses.",
  );
});

test("a lead a list brought is from your list, never from Google Maps, and a choice has nothing to give back", () => {
  const story = (over) =>
    reachOutPersonOf(
      {
        lead_id: "l1",
        business_name: "Zilker Kettlebell Club",
        stage: "ready",
        closed_reason: null,
        found_at: "2026-09-28T15:00:00.000Z",
        email_state: "ok",
        resume_at: null,
        booked_at: null,
        stopped_at: null,
        chain: null,
        search: { id: "s", name: "Expo gyms", asked: "gyms I met at the expo", fit: null },
        conversation_id: null,
        sends: [],
        readings: [],
        can_stop: false,
        ...over,
      },
      NOW,
      TZ,
    );
  assert.match(story({ found_on_listing: false }).found.text, /^From your list · address checked$/);
  assert.match(story({ found_on_listing: true }).found.text, /^Found on Google Maps by “gyms I met at the expo”/);
  assert.match(story({}).found.text, /^Found on Google Maps/, "a story read before 00242 says what it always said");
  const ended = { ...round({ state: "ended", ended_at: "2026-09-28T16:00:00.000Z" }), undo_op_id: null };
  const s = (via) => ({
    id: via,
    name: "x",
    asked: "",
    asked_on: "2026-09-28T15:00:00.000Z",
    via,
    plan_version: 1,
    thread_id: null,
    round: ended,
  });
  const counts = { all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 };
  assert.deepEqual(
    leadRail(counts, [s("chosen"), s("import")], new Date(NOW)).searches.map((r) => r.undoable),
    [false, true],
    "a choice drew nothing, so Remove the ones you haven't touched gives nothing back",
  );
});
