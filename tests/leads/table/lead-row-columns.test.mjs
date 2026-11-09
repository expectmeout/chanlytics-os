/**
 * What the columns a member turns on say of one lead (contracts leads/sheet/lead-row-columns.ts, decision 0103), and the
 * sentences an export says while it runs. Pure: the clock is an argument. Every name and number here is made up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAD_COLUMN_GROUPS, leadColumnsOf, leadOutcomeWord } from "@chanlytics/contracts";
import { LEAD_EXPORT_WORDS } from "../../../apps/dashboard/src/surfaces/leads/page/export-words.ts";

const NOW = new Date("2026-11-05T15:00:00Z");
const TZ = "America/New_York";

/** A lead's row as the read says it, as much of it as the columns read, and none of the facts unless said. */
const row = (over = {}) => ({
  kind: "place",
  facts: null,
  place: null,
  contacted_at: null,
  last_outcome: null,
  last_note: null,
  city: null,
  state: null,
  linkedin_url: null,
  facebook_url: null,
  instagram: null,
  tiktok_url: null,
  reviews: null,
  claimed: null,
  ...over,
});

test("a place says its sequence, its last contact and its last outcome", () => {
  const cols = leadColumnsOf(
    row({
      place: { name: "Local: your receptionist is built" },
      contacted_at: "2026-11-02T15:00:00Z",
      last_outcome: "voicemail",
      last_note: "Call after 3",
    }),
    TZ,
    NOW,
  );
  assert.equal(cols.sequence, "Local: your receptionist is built");
  assert.equal(cols.contacted.label, "3d");
  assert.match(cols.contacted.at, /2026 · /, "the whole date, for the tip, in the business's clock");
  assert.deepEqual(cols.outcome, { word: "Left a voicemail", note: "Call after 3" });
});

test("a last outcome this does not know says nothing, and an email marked as sent says so", () => {
  assert.equal(leadOutcomeWord("emailed"), "Emailed");
  assert.equal(leadOutcomeWord("no_answer"), "No answer");
  assert.equal(leadOutcomeWord("spoke_to_a_ghost"), null);
  assert.equal(leadOutcomeWord(null), null);
  assert.equal(leadColumnsOf(row({ last_note: "Left alone" }), TZ, NOW).outcome, null, "a note alone is no outcome");
  assert.deepEqual(leadColumnsOf(row({ last_outcome: "emailed", last_note: "" }), TZ, NOW).outcome, {
    word: "Emailed",
    note: null,
  });
});

test("a company says who its email goes to, and its size; a place has neither", () => {
  const facts = {
    size: "11 - 50",
    addressee: 1,
    people: [
      { name: "Ana Quix", title: "Founder" },
      { name: "Bo Quix", title: "Office manager" },
    ],
  };
  const company = leadColumnsOf(row({ kind: "company", facts }), TZ, NOW);
  assert.deepEqual(company.contact, { name: "Bo Quix", title: "Office manager" });
  assert.equal(company.size, "11 - 50");
  const place = leadColumnsOf(row({ kind: "place", facts }), TZ, NOW);
  assert.equal(place.contact, null);
  assert.equal(place.size, null);
  const noneChosen = leadColumnsOf(row({ kind: "company", facts: { ...facts, addressee: null } }), TZ, NOW);
  assert.equal(noneChosen.contact, null, "a company with nobody chosen writes to nobody");
});

test("social holds only the links the lead has, in one order", () => {
  const cols = leadColumnsOf(
    row({
      tiktok_url: "https://tiktok.example/quix",
      instagram: "https://instagram.example/quix",
      linkedin_url: "https://linkedin.example/quix",
    }),
    TZ,
    NOW,
  );
  assert.deepEqual(cols.social, [
    { key: "linkedin", word: "LinkedIn", href: "https://linkedin.example/quix" },
    { key: "instagram", word: "Instagram", href: "https://instagram.example/quix" },
    { key: "tiktok", word: "TikTok", href: "https://tiktok.example/quix" },
  ]);
  const all = leadColumnsOf(
    row({
      linkedin_url: "https://linkedin.example/q",
      facebook_url: "https://facebook.example/q",
      instagram: "https://instagram.example/q",
      tiktok_url: "https://tiktok.example/q",
    }),
    TZ,
    NOW,
  );
  assert.deepEqual(
    all.social.map((s) => s.word),
    ["LinkedIn", "Facebook", "Instagram", "TikTok"],
  );
  const odd = leadColumnsOf(
    row({ linkedin_url: "javascript:alert(1)", facebook_url: "not a link", instagram: "instagram.example/quix" }),
    TZ,
    NOW,
  );
  assert.deepEqual(
    odd.social,
    [{ key: "instagram", word: "Instagram", href: "https://instagram.example/quix" }],
    "a table draws these as links: what is no web address is not one, and one with no scheme gets its own",
  );
});

test("a listing says its reviews with thousands and its claim, and a false claim is not an absent one", () => {
  const cols = leadColumnsOf(row({ reviews: 1284, claimed: true, city: "Queens", state: "NY" }), TZ, NOW);
  assert.equal(cols.reviews, "1,284");
  assert.equal(cols.claimed, "Yes");
  assert.equal(cols.city, "Queens");
  assert.equal(cols.region, "NY");
  assert.equal(leadColumnsOf(row({ claimed: false }), TZ, NOW).claimed, "No");
  assert.equal(leadColumnsOf(row({ reviews: 0 }), TZ, NOW).reviews, "0", "none reviewed is a count, not nothing");
});

test("nothing held says nothing", () => {
  assert.deepEqual(leadColumnsOf(row(), TZ, NOW), {
    sequence: null,
    contacted: null,
    outcome: null,
    contact: null,
    size: null,
    city: null,
    region: null,
    social: [],
    reviews: null,
    claimed: null,
  });
  assert.equal(leadColumnsOf(row({ contacted_at: "not a moment" }), TZ, NOW).contacted, null);
});

test("the groups are the Columns menu's headings, in its order", () => {
  assert.deepEqual(Object.values(LEAD_COLUMN_GROUPS), [
    "Where it stands",
    "Who they are",
    "Where",
    "How to reach",
    "How good",
    "Where from",
  ]);
});

test("the export's sentences", () => {
  assert.equal(LEAD_EXPORT_WORDS.going(8_000, 12_480), "Exporting 8,000 of 12,480…");
  assert.equal(LEAD_EXPORT_WORDS.going(8_000, null), "Exporting 8,000…", "where nothing said how many, none is said");
  assert.equal(LEAD_EXPORT_WORDS.done(12_480), "Exported 12,480 leads.");
  assert.equal(LEAD_EXPORT_WORDS.done(1), "Exported 1 lead.");
  assert.equal(LEAD_EXPORT_WORDS.part(8_000, 12_480), "Saved 8,000 of 12,480. The rest did not export.");
  assert.equal(LEAD_EXPORT_WORDS.part(8_000, null), "Saved 8,000. The rest did not export.");
});
