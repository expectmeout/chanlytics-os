/**
 * Google, step one: the public listing found from facts and watched.
 *
 * The two Places calls are pinned to the documented shapes without a
 * network; the check planner's truth table is the contract for what counts
 * as new; the view model, the Setup row and Today's line are executed; and
 * the wiring pins keep the edge, the routes, the bridge, the migration and
 * the manifests saying the same thing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  placesSearchRequest,
  placesDetailsRequest,
  parsePlacesSearch,
  parsePlaceDetails,
  searchPlaces,
  getPlace,
  reviewIdOf,
  PLACES_SEARCH_MASK,
  PLACES_DETAILS_MASK,
  PLACES_SEARCH_LIMIT,
  PlacesError,
  PLACE_ID,
  planListingCheck,
  REVIEW_BELL_MAX,
  FRESH_SLACK_MS,
} from "@chanlytics/channels";
import {
  hoursFromGoogle,
  TenantConfigWriteSchema,
  toGoogleVM,
  gainedOver,
  reviewIsNew,
  ratingWords,
  starsOf,
  listingLine,
  checkedWords,
  reviewSnippet,
  setupSteps,
  serverNotificationRows,
  verbForRoute,
  EVENT_KINDS,
  SERVER_NOTIFICATION_KINDS,
  GOOGLE_SHOWN_REVIEWS,
  placesQueryOf,
} from "@chanlytics/contracts";
import { readCode, readRaw, importSrc } from "./_source.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const KEY = "AIza-test-key-not-real";

/* ------------------------------------------------------------ the two calls */

test("Text Search asks Google's documented endpoint for a handful of Pro fields, never the rating", () => {
  const r = placesSearchRequest(KEY, "Northside Movers, Brooklyn");
  assert.equal(r.url, "https://places.googleapis.com/v1/places:searchText");
  assert.equal(r.method, "POST");
  assert.equal(r.headers["X-Goog-Api-Key"], KEY);
  assert.equal(r.headers["X-Goog-FieldMask"], PLACES_SEARCH_MASK);
  assert.equal(r.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(r.body), {
    textQuery: "Northside Movers, Brooklyn",
    pageSize: PLACES_SEARCH_LIMIT,
    languageCode: "en",
  });
  assert.ok(!PLACES_SEARCH_MASK.includes("rating"), "the search stays on the Pro SKU");
  assert.ok(
    PLACES_SEARCH_MASK.split(",").every((f) => f.startsWith("places.")),
    "search fields are prefixed",
  );
  assert.equal(JSON.parse(placesSearchRequest(KEY, "x", { limit: 99 }).body).pageSize, 20, "pageSize is 1..20");
});

test("Place Details asks by id with the reviews in the mask, the id encoded, the language named", () => {
  const r = placesDetailsRequest(KEY, "ChIJN1t_tDeuEmsRUsoyG83frY4");
  assert.equal(r.url, "https://places.googleapis.com/v1/places/ChIJN1t_tDeuEmsRUsoyG83frY4?languageCode=en");
  assert.equal(r.method, "GET");
  assert.equal(r.headers["X-Goog-FieldMask"], PLACES_DETAILS_MASK);
  for (const f of [
    "id",
    "displayName",
    "formattedAddress",
    "googleMapsUri",
    "businessStatus",
    "rating",
    "userRatingCount",
    "reviews",
  ])
    assert.ok(PLACES_DETAILS_MASK.split(",").includes(f), f);
  // F7: what the listing says beyond its name, for the first run to offer. Each name as Google's Place reference
  // spells it (checked 24 Sep 2026): one wrong name and Google refuses the whole read, reviews and all.
  assert.deepEqual(PLACES_DETAILS_MASK.split(",").slice(-8), [
    "regularOpeningHours",
    "internationalPhoneNumber",
    "nationalPhoneNumber",
    "websiteUri",
    "primaryType",
    "primaryTypeDisplayName",
    "pureServiceAreaBusiness",
    "timeZone",
  ]);
  assert.equal(r.body, undefined);
  assert.ok(
    PLACE_ID.test("ChIJN1t_tDeuEmsRUsoyG83frY4") && !PLACE_ID.test("short") && !PLACE_ID.test("has spaces in it here"),
  );
});

const PLACE = {
  id: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  displayName: { text: "Northside Movers", languageCode: "en" },
  formattedAddress: "1200 Harbor Blvd, Brooklyn, NY 11201, USA",
  googleMapsUri: "https://maps.google.com/?cid=1",
  businessStatus: "OPERATIONAL",
  rating: 4.8,
  userRatingCount: 213,
  regularOpeningHours: {
    openNow: true,
    periods: [2, 3, 4, 5, 6].map((day) => ({
      open: { day, hour: 9, minute: 0 },
      close: { day, hour: 19, minute: 0 },
    })),
    weekdayDescriptions: ["Tuesday: 9:00 AM – 7:00 PM"],
  },
  internationalPhoneNumber: "+1 718-555-0142",
  nationalPhoneNumber: "(718) 555-0142",
  websiteUri: "https://northsidemovers.example",
  primaryType: "moving_company",
  primaryTypeDisplayName: { text: "Moving company", languageCode: "en" },
  pureServiceAreaBusiness: true,
  timeZone: { id: "America/New_York" },
  reviews: [
    {
      name: "places/ChIJN1t_tDeuEmsRUsoyG83frY4/reviews/r-ana",
      rating: 5,
      text: { text: "Fast, careful, and on time.", languageCode: "en" },
      authorAttribution: { displayName: "Ana P.", uri: "https://maps.google.com/u/1", photoUri: "https://lh3/x" },
      publishTime: "2026-09-07T13:00:00Z",
      googleMapsUri: "https://maps.google.com/r/1",
    },
    {
      name: "places/ChIJN1t_tDeuEmsRUsoyG83frY4/reviews/r-old",
      rating: 4,
      text: { text: "Good crew.", languageCode: "en" },
      authorAttribution: { displayName: "Ben" },
      publishTime: "2025-01-10T13:00:00Z",
    },
    {
      name: "places/ChIJN1t_tDeuEmsRUsoyG83frY4/reviews/r-nowords",
      rating: 5,
      authorAttribution: { displayName: "" },
      publishTime: "2026-09-06T20:00:00Z",
    },
  ],
};

test("the owner's words reach Google as it reads them: a phone number whole, with its country; anything else as typed", () => {
  assert.equal(placesQueryOf("(305) 555-0100"), "+13055550100", "Google needs the country to match a number");
  assert.equal(placesQueryOf(" +1 305 555 0100 "), "+13055550100");
  assert.equal(
    placesQueryOf("  Harbor   Moving 305 "),
    "Harbor Moving 305",
    "a name with a number in it is still a name",
  );
  assert.equal(placesQueryOf("12"), "12", "too short to be a number is sent as typed");
});

test("the parsers read what Google returns and refuse what it does not", () => {
  const found = parsePlacesSearch({ places: [PLACE, { id: "x" }, "junk"] });
  assert.deepEqual(found, [
    {
      place_id: PLACE.id,
      name: "Northside Movers",
      address: PLACE.formattedAddress,
      maps_uri: PLACE.googleMapsUri,
      business_status: "OPERATIONAL",
      category: "Moving company",
    },
  ]);
  assert.deepEqual(parsePlacesSearch({}), []);
  const d = parsePlaceDetails(PLACE);
  assert.equal(d.rating, 4.8);
  assert.equal(d.review_count, 213);
  assert.equal(d.reviews.length, 3);
  assert.deepEqual(d.reviews[0], {
    review_id: "r-ana",
    rating: 5,
    author: "Ana P.",
    author_uri: "https://maps.google.com/u/1",
    author_photo_uri: "https://lh3/x",
    text: "Fast, careful, and on time.",
    language_code: "en",
    published_at: "2026-09-07T13:00:00Z",
    maps_uri: "https://maps.google.com/r/1",
  });
  assert.equal(d.reviews[2].author, null, "an empty name is no name");
  assert.equal(d.reviews[2].text, null);
  assert.equal(reviewIdOf("places/p/reviews/abc"), "abc");
  assert.equal(reviewIdOf(""), null);
  assert.throws(() => parsePlaceDetails({ id: "x" }), PlacesError);
});

test("F7: the listing's facts are read as Google says them -- the week, the numbers, the site, the kind, the area, the zone", () => {
  assert.deepEqual(parsePlaceDetails(PLACE).facts, {
    hours: [2, 3, 4, 5, 6].map((day) => ({ open: { day, hour: 9, minute: 0 }, close: { day, hour: 19, minute: 0 } })),
    phone_e164: "+17185550142",
    phone_display: "(718) 555-0142",
    website: "https://northsidemovers.example",
    primary_type: "moving_company",
    primary_type_label: "Moving company",
    service_area_only: true,
    time_zone: "America/New_York",
  });
  // A listing that says none of it: nothing invented.
  assert.deepEqual(parsePlaceDetails({ id: PLACE.id, displayName: PLACE.displayName }).facts, {
    hours: null,
    phone_e164: null,
    phone_display: null,
    website: null,
    primary_type: null,
    primary_type_label: null,
    service_area_only: false,
    time_zone: null,
  });
  // Google drops a field at its zero (proto3): Sunday at midnight arrives as {}; a point that is not an object is no point.
  const odd = parsePlaceDetails({
    ...PLACE,
    regularOpeningHours: {
      periods: [{ open: {} }, { open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } }, { open: 5 }],
    },
  }).facts.hours;
  assert.deepEqual(odd, [
    { open: { day: 0, hour: 0, minute: 0 }, close: null },
    { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
  ]);
  // The international form carries its own country: its digits, never a +1 guessed for any ten of them. Country
  // code 999 is reserved, so this number is nobody's; the national form alone is no E.164 number.
  const phoneOf = (internationalPhoneNumber) =>
    parsePlaceDetails({ ...PLACE, internationalPhoneNumber }).facts.phone_e164;
  assert.equal(phoneOf("+999 555 0142"), "+9995550142");
  assert.equal(phoneOf("(718) 555-0142"), null);
  assert.equal(phoneOf("+1 555"), null, "too short to be a number");
});

test("F7: Google's week becomes the Business record's, and what the record cannot hold is named, never guessed", () => {
  const p = (day, oh, om, ch, cm, cday = day) => ({
    open: { day, hour: oh, minute: om },
    close: { day: cday, hour: ch, minute: cm },
  });
  // Tuesday to Saturday, nine to seven: a salon's week, Sunday and Monday closed by being absent.
  const week = hoursFromGoogle([2, 3, 4, 5, 6].map((d) => p(d, 9, 0, 19, 0)));
  assert.deepEqual(week, {
    hours: {
      tue: { open: "09:00", close: "19:00" },
      wed: { open: "09:00", close: "19:00" },
      thu: { open: "09:00", close: "19:00" },
      fri: { open: "09:00", close: "19:00" },
      sat: { open: "09:00", close: "19:00" },
    },
    unsure: [],
  });
  // A lunch break is two shifts, in order, whatever order Google sent them in.
  assert.deepEqual(hoursFromGoogle([p(1, 15, 0, 19, 0), p(1, 9, 30, 13, 0)]).hours, {
    mon: {
      intervals: [
        { open: "09:30", close: "13:00" },
        { open: "15:00", close: "19:00" },
      ],
    },
  });
  // Past midnight, five shifts, two that overlap: each day is left out and named.
  assert.deepEqual(hoursFromGoogle([p(5, 18, 0, 2, 0, 6)]), { hours: {}, unsure: ["fri"] });
  // Around the clock is one period with no close, on Sunday: every day is open and none has hours to give.
  assert.deepEqual(hoursFromGoogle([{ open: { day: 0, hour: 0, minute: 0 }, close: null }]), {
    hours: {},
    unsure: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  });
  assert.deepEqual(
    hoursFromGoogle([8, 10, 12, 14, 16].map((h) => p(3, h, 0, h + 1, 0))),
    { hours: {}, unsure: ["wed"] },
    "a fifth shift is more than the record holds",
  );
  assert.deepEqual(hoursFromGoogle([p(4, 9, 0, 13, 0), p(4, 12, 0, 17, 0)]), { hours: {}, unsure: ["thu"] });
  // One unsure day never takes the others with it.
  assert.deepEqual(hoursFromGoogle([p(1, 9, 0, 17, 0), p(5, 18, 0, 2, 0, 6)]), {
    hours: { mon: { open: "09:00", close: "17:00" } },
    unsure: ["fri"],
  });
  assert.deepEqual(hoursFromGoogle(null), { hours: {}, unsure: [] }, "no hours on the listing, nothing to offer");
  // Shifts that touch are an ordinary two-stylist day, as the record's own check has it.
  const touching = hoursFromGoogle([p(2, 9, 0, 13, 0), p(2, 13, 0, 19, 0)]);
  assert.deepEqual(touching.unsure, []);
  // Every week it makes is one the record's write rules accept: offered, it can be saved as it stands.
  const accepts = (hours) =>
    TenantConfigWriteSchema.safeParse({
      brain: {
        business_name: "Northside Movers",
        booking_link: "https://book.example/northside",
        system_prompt: "Answer as the front desk of Northside Movers: brief, warm, never a price.",
        fallbacks: { greeting: "g", error: "e", non_text: "n" },
        profile: { hours },
      },
    }).success;
  for (const made of [week, touching, hoursFromGoogle([p(1, 15, 0, 19, 0), p(1, 9, 30, 13, 0)])])
    assert.equal(accepts(made.hours), true, JSON.stringify(made.hours));
});

test("the client turns Google's refusal into its own words and never swallows a bad status", async () => {
  const calls = [];
  const http = async (req) => {
    calls.push(req);
    return {
      status: 403,
      body: JSON.stringify({
        error: {
          code: 403,
          message: "Places API (New) has not been used in project 1 before",
          status: "PERMISSION_DENIED",
        },
      }),
    };
  };
  await assert.rejects(
    () => searchPlaces(http, KEY, "Northside"),
    (e) => e instanceof PlacesError && e.status === 403 && /PERMISSION_DENIED: Places API/.test(e.message),
  );
  assert.equal(calls.length, 1);
  const ok = async () => ({ status: 200, body: JSON.stringify(PLACE) });
  assert.equal((await getPlace(ok, KEY, PLACE.id)).name, "Northside Movers");
  const notJson = async () => ({ status: 200, body: "<html>" });
  await assert.rejects(
    () => getPlace(notJson, KEY, PLACE.id),
    (e) => e instanceof PlacesError && e.status === 502,
  );
});

/* ------------------------------------------------------------- the planner */

const details = (over = {}) => ({ ...parsePlaceDetails(PLACE), ...over });
const nobody = new Set();

test("the first read after linking is history: the rows are written, nothing is announced", () => {
  const p = planListingCheck(
    { rating: null, review_count: null, checked_at: null },
    nobody,
    details(),
    "2026-09-07",
    NOW,
  );
  assert.deepEqual(p.bells, []);
  assert.deepEqual(p.fresh, []);
  assert.equal(p.counted, 0);
  assert.equal(p.reviews.length, 3);
  assert.equal(p.reviews[0].last_seen_at, new Date(NOW).toISOString());
  assert.deepEqual(p.day, { day: "2026-09-07", rating: 4.8, review_count: 213 });
  assert.deepEqual(p.listing, {
    name: "Northside Movers",
    address: PLACE.formattedAddress,
    maps_uri: PLACE.googleMapsUri,
    business_status: "OPERATIONAL",
    rating: 4.8,
    review_count: 213,
    checked_at: new Date(NOW).toISOString(),
    check_error: null,
    // F7: every good read keeps what the listing says now, for the first run to offer.
    facts: parsePlaceDetails(PLACE).facts,
  });
});

test("a review not on record and written since the previous check is news; an old one resurfacing is not", () => {
  const before = { rating: 4.8, review_count: 212, checked_at: "2026-09-06T15:00:00Z" };
  const p = planListingCheck(before, new Set(["r-nowords"]), details(), "2026-09-07", NOW);
  assert.deepEqual(
    p.fresh.map((r) => r.review_id),
    ["r-ana"],
    "the old one is not on record either, but it was written last year",
  );
  assert.equal(p.counted, 1);
  assert.equal(p.bells.length, 1);
  assert.equal(p.bells[0].title, "New on Google: ★★★★★ from Ana P.");
  assert.equal(p.bells[0].body, "“Fast, careful, and on time.”\n4.8 ★ overall · 213 reviews.");
  assert.equal(p.bells[0].review_id, "r-ana");
  // Dated slightly before the previous check still counts: Google's clock and a visit date differ from ours.
  const slack = planListingCheck(
    { ...before, checked_at: new Date(Date.parse("2026-09-07T13:00:00Z") + FRESH_SLACK_MS - 1000).toISOString() },
    nobody,
    details(),
    "2026-09-07",
    NOW,
  );
  assert.ok(slack.fresh.some((r) => r.review_id === "r-ana"));
});

test("ratings without words are counted from the count and said as such; several new reviews become one row", () => {
  const before = { rating: 4.7, review_count: 210, checked_at: "2026-09-06T15:00:00Z" };
  const all = new Set(["r-ana", "r-old", "r-nowords"]);
  const p = planListingCheck(before, all, details(), "2026-09-07", NOW);
  assert.deepEqual(p.fresh, []);
  assert.equal(p.counted, 3);
  assert.equal(p.bells.length, 1);
  assert.equal(p.bells[0].title, "3 new ratings on Google");
  assert.match(
    p.bells[0].body,
    /^4\.8 ★ overall · 213 reviews\. Google shows the words of its five most relevant reviews/,
  );
  assert.equal(p.bells[0].review_id, null);
  const many = details({
    reviews: ["a", "b", "c", "d", "e"].map((who) => ({
      review_id: `r-${who}`,
      rating: 5,
      author: who.toUpperCase(),
      author_uri: null,
      author_photo_uri: null,
      text: "Great",
      language_code: "en",
      published_at: "2026-09-07T12:00:00Z",
      maps_uri: null,
    })),
  });
  const pile = planListingCheck(before, nobody, many, "2026-09-07", NOW);
  assert.equal(pile.fresh.length, 5);
  assert.ok(pile.fresh.length > REVIEW_BELL_MAX);
  assert.equal(pile.bells.length, 1);
  assert.equal(pile.bells[0].title, "5 new reviews on Google");
  assert.match(pile.bells[0].body, /^From A, B, C, D, E\. 4\.8 ★ overall · 213 reviews\. The words are on Reports\.$/);
  const same = planListingCheck(
    { rating: 4.8, review_count: 213, checked_at: "2026-09-06T15:00:00Z" },
    all,
    details(),
    "2026-09-07",
    NOW,
  );
  assert.deepEqual(same.bells, [], "nothing changed, nothing said");
  assert.equal(GOOGLE_SHOWN_REVIEWS, 5);
});

/* ------------------------------------------------------- words and the VM */

const listing = (over = {}) => ({
  place_id: PLACE.id,
  name: "Northside Movers",
  address: PLACE.formattedAddress,
  maps_uri: PLACE.googleMapsUri,
  business_status: "OPERATIONAL",
  rating: 4.8,
  review_count: 213,
  linked_at: "2026-08-01T12:00:00Z",
  checked_at: "2026-09-07T12:00:00Z",
  check_error: null,
  ...over,
});
const review = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  review_id: "r-ana",
  origin: "places",
  rating: 5,
  author: "Ana P.",
  author_uri: null,
  author_photo_uri: null,
  body: "Fast, careful, and on time. Would hire again.",
  language_code: "en",
  published_at: "2026-09-07T13:00:00Z",
  reply_text: null,
  replied_at: null,
  maps_uri: null,
  first_seen_at: "2026-09-07T14:00:00Z",
  ...over,
});
const dto = (over = {}) => ({
  ready: { places: true, profile: false },
  listing: listing(),
  connection: null,
  reviews: [review()],
  days: [],
  role: "owner",
  ...over,
});

test("the words: a rating, its stars, the listing's line, when it was read", () => {
  assert.equal(ratingWords(4.8), "4.8 ★");
  assert.equal(ratingWords(null), "no rating yet");
  assert.equal(starsOf(5), "★★★★★");
  assert.equal(starsOf(3.6), "★★★★☆");
  assert.equal(starsOf(null), "☆☆☆☆☆");
  assert.equal(listingLine(listing()), "Northside Movers · 4.8 ★ · 213 reviews on Google");
  assert.equal(listingLine(listing({ rating: null, review_count: 0 })), "Northside Movers · no reviews on Google yet");
  assert.equal(checkedWords(listing(), NOW), "Checked 3h ago");
  assert.equal(
    checkedWords(listing({ check_error: "PERMISSION_DENIED" }), NOW),
    "Google could not be read since 3h ago — read again once a day",
  );
  assert.equal(
    checkedWords(listing({ checked_at: null, check_error: "x" }), NOW),
    "Google could not be read yet — read again once a day",
  );
  assert.equal(checkedWords(listing({ checked_at: null }), NOW), "Not read yet");
  assert.equal(reviewSnippet("  a   b  "), "a b");
  assert.equal(reviewSnippet("x".repeat(100)).length, 90);
});

test("a review is news when first seen recently, written recently, and after the first read", () => {
  assert.equal(reviewIsNew(review(), "2026-08-01T12:00:00Z", NOW), true);
  assert.equal(
    reviewIsNew(review({ first_seen_at: "2026-09-05T14:00:00Z" }), "2026-08-01T12:00:00Z", NOW),
    false,
    "seen two days ago: old news",
  );
  assert.equal(
    reviewIsNew(review({ published_at: "2025-01-10T13:00:00Z" }), "2026-08-01T12:00:00Z", NOW),
    false,
    "written last year: a relevance shift, not news",
  );
  assert.equal(
    reviewIsNew(review({ first_seen_at: "2026-09-07T14:00:00Z" }), "2026-09-07T13:30:00Z", NOW),
    false,
    "the first read after linking",
  );
  assert.equal(reviewIsNew(review({ published_at: null }), "2026-08-01T12:00:00Z", NOW), false);
});

test("what a period gained comes from the day snapshots, and refuses to guess from one day", () => {
  const days = [
    { day: "2026-08-05", rating: 4.7, review_count: 200 },
    { day: "2026-08-31", rating: 4.7, review_count: 205 },
    { day: "2026-09-02", rating: 4.8, review_count: 208 },
    { day: "2026-09-05", rating: 4.8, review_count: 210 },
    { day: "2026-09-07", rating: 4.8, review_count: 213 },
  ];
  const seven = gainedOver(days, 7);
  assert.equal(seven.current.total, 8, "213 on the 7th less 205 on the 31st, the newest day before the period");
  assert.equal(seven.current.sinceLabel, null);
  assert.equal(seven.current.points.length, 7);
  assert.deepEqual(
    seven.current.points.map((p) => p.gained),
    [0, 3, 0, 0, 2, 0, 3],
  );
  assert.equal(seven.current.max, 3);
  assert.equal(seven.previous, 5, "the period before: 205 on the 31st less 200 on the 5th");
  const one = gainedOver([days[4]], 7);
  assert.equal(one.current.total, null, "one day cannot say what was gained");
  const inside = gainedOver(days.slice(2), 7);
  assert.equal(inside.current.total, 5, "without a day before the period, from the first day inside it");
  assert.ok(inside.current.sinceLabel, "…and the day is named");
  assert.equal(inside.previous, null);
});

test("the view model: four measured tiles, the latest reviews, a table twin, Today's line; nothing without a listing", () => {
  const vm = toGoogleVM(
    dto({
      days: [
        { day: "2026-08-31", rating: 4.7, review_count: 205 },
        { day: "2026-09-07", rating: 4.8, review_count: 213 },
      ],
    }),
    30,
    NOW,
  );
  assert.equal(vm.listing.name, "Northside Movers");
  assert.equal(vm.listing.ratingLabel, "4.8 ★");
  assert.equal(vm.listing.checked, "Checked 3h ago");
  assert.equal(vm.listing.trouble, false);
  assert.deepEqual(
    vm.tiles.map((t) => [t.id, t.label, t.value]),
    [
      ["rating", "Rating on Google", "4.8"],
      ["reviews", "Reviews on Google", "213"],
      ["gained", "Gained in 30 days", "8"],
      ["newest", "Newest review", "2h ago"],
    ],
  );
  assert.equal(vm.tiles[0].meta, "213 reviews · checked 3h ago");
  assert.equal(vm.tiles[0].delta, null, "no day before the period to compare the rating with");
  assert.equal(vm.tiles[2].meta, "since Aug 31, the first day on record");
  assert.equal(vm.tiles[3].meta, "★★★★★ · Ana P.");
  assert.equal(vm.latest.length, 1);
  assert.equal(vm.latest[0].isNew, true);
  assert.equal(vm.latest[0].text, "Fast, careful, and on time. Would hire again.");
  assert.deepEqual(vm.table.columns, ["Reviewer", "Stars", "Written", "Words"]);
  assert.deepEqual(vm.table.rows, [["Ana P.", 5, "2h ago", "Fast, careful, and on time. Would hire again."]]);
  assert.deepEqual(vm.todayLine, {
    text: "New on Google: ★★★★★ from Ana P. — “Fast, careful, and on time. Would hire again.”",
    to: "reports",
  });
  const quiet = toGoogleVM(dto({ reviews: [review({ first_seen_at: "2026-09-01T14:00:00Z" })] }), 30, NOW);
  assert.equal(quiet.todayLine, null);
  assert.equal(quiet.tiles[2].value, "—");
  assert.equal(quiet.tiles[2].meta, "needs a second day of reading");
  const none = toGoogleVM(dto({ listing: null, reviews: [] }), 30, NOW);
  assert.equal(none.listing, null);
  assert.deepEqual(none.tiles, []);
  assert.equal(none.todayLine, null);
  const trouble = toGoogleVM(dto({ listing: listing({ check_error: "boom" }) }), 7, NOW);
  assert.equal(trouble.listing.trouble, true);
  assert.match(trouble.listing.checked, /could not be read since 3h ago/);
  assert.ok(!JSON.stringify(vm).includes("null."), "no null read aloud");
});

/* ------------------------------------------------------------- Setup's row */

const setup = (google, over = {}) =>
  setupSteps(
    {
      business: {
        name: "Northside Movers",
        hours: true,
        services: 4,
        bookingLink: true,
        address: true,
        handoff: null,
        broken: false,
      },
      channels: {
        whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
        voice: { present: false, active: false, number: null, lastInboundAt: null },
      },
      templates: { approved: 0, pending: 0, startersApproved: 0 },
      calendar: { state: "none" },
      team: { members: 1, invitesOpen: 0, alertEmails: 0 },
      consent: { yes: 0 },
      requests: { line: null },
      later: [],
      google,
      ...over,
    },
    NOW,
  );
const row = (vm, id) => vm.rows.find((r) => r.id === id);

test("Setup's Google row: absent until the platform can look listings up; then Find it, then the listing's line, or Waiting on Google", () => {
  assert.equal(row(setup(undefined), "google"), undefined);
  assert.equal(row(setup({ ready: false, listing: null }), "google"), undefined);
  assert.equal(setup(undefined).total, 9);
  const find = setup({ ready: true, places: true, listing: null });
  assert.equal(find.total, 10);
  assert.equal(row(find, "google").state, "not_started");
  assert.equal(row(find, "google").required, false, "optional, and can be put off");
  assert.equal(row(find, "google").sentence, "Find your business on Google so new reviews reach you here.");
  assert.deepEqual(row(find, "google").details, ["Uses the name and address on record"]);
  assert.deepEqual(
    row(find, "google").verb,
    { label: "Find it", to: "start/find" },
    "one finder: the first run's business step, which opens on Find",
  );
  const noAddress = setup(
    { ready: true, places: true, listing: null },
    {
      business: {
        name: "Northside Movers",
        hours: true,
        services: 4,
        bookingLink: true,
        address: false,
        handoff: null,
        broken: false,
      },
    },
  );
  const profileOnly = setup({ ready: true, places: false, listing: null });
  assert.equal(
    row(profileOnly, "google").sentence,
    "Connect your Google Business Profile so every review reaches you here.",
  );
  assert.deepEqual(row(profileOnly, "google").verb, { label: "Connect", to: "admin/integrations" });
  const connected = setup({
    ready: true,
    places: true,
    listing: {
      name: "Northside Movers",
      rating: 4.8,
      review_count: 213,
      checked_at: "2026-09-07T12:00:00Z",
      check_error: null,
    },
    connected: true,
  });
  assert.deepEqual(row(connected, "google").details, [
    "Checked 3h ago",
    "Business Profile connected — every review, replies from Reports",
  ]);
  assert.deepEqual(row(noAddress, "google").details, ["Add your address in Settings › Business for a surer match"]);
  const linked = setup({
    ready: true,
    listing: {
      name: "Northside Movers",
      rating: 4.8,
      review_count: 213,
      checked_at: "2026-09-07T12:00:00Z",
      check_error: null,
    },
  });
  assert.equal(row(linked, "google").state, "ready");
  assert.equal(row(linked, "google").sentence, "Northside Movers · 4.8 ★ · 213 reviews on Google.");
  assert.deepEqual(row(linked, "google").details, ["Checked 3h ago", "New reviews reach your bell and Reports"]);
  assert.deepEqual(row(linked, "google").verb, { label: "Open Reports", to: "reports" });
  const trouble = setup({
    ready: true,
    listing: {
      name: "Northside Movers",
      rating: 4.8,
      review_count: 213,
      checked_at: "2026-09-06T12:00:00Z",
      check_error: "PERMISSION_DENIED",
    },
  });
  assert.equal(row(trouble, "google").state, "waiting_them");
  assert.equal(row(trouble, "google").stateWords, "Waiting on Google");
  assert.equal(
    row(trouble, "google").sentence,
    "Northside Movers is on record, but Google could not be read since 1d ago — it is read again once a day.",
  );
  assert.equal(row(find, "google").later, false);
  const later = setup({ ready: true, places: true, listing: null }, { later: ["google"] });
  assert.equal(row(later, "google").later, true, "put off for later, like any optional row");
  assert.equal(later.rows[later.rows.length - 1].id, "google", "the last row: optional, after the first yes");
});

/* ------------------------------------------------------------- the bell */

test("a review on the bell is good news that opens Reports, and its route has a verb", () => {
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("review"));
  const rows = serverNotificationRows({
    seen_at: null,
    notifications: [
      {
        id: "1",
        kind: "review",
        title: "New on Google: ★★★★★ from Ana P.",
        body: "“Fast, careful, and on time.”\n4.8 ★ overall · 213 reviews.",
        route: "reports",
        subject_type: "review",
        subject_id: "r-ana",
        created_at: "2026-09-07T14:00:00Z",
        read: false,
        dismissed: false,
      },
    ],
  });
  assert.deepEqual(
    [rows[0].icon, rows[0].tone, rows[0].action, rows[0].to, rows[0].message],
    ["star", "ok", "Open Reports", "reports", "“Fast, careful, and on time.”"],
  );
  assert.equal(verbForRoute("reports"), "Open Reports");
  for (const k of ["google.linked", "google.unlinked", "google.reviews"]) assert.ok(EVENT_KINDS.includes(k), k);
});

/* ------------------------------------------------------------- the wiring */

test("the migration: three tables that hang off the listing, members read, realtime on two, the bell's kind, the sweep at :37", () => {
  const sql = readRaw("supabase/migrations/00069_google_listings.sql");
  assert.ok(
    sql.includes("create table public.google_listings (") &&
      sql.includes("tenant_id        uuid primary key references public.tenants (id) on delete cascade"),
  );
  assert.ok(
    sql.includes("uuid not null references public.google_listings (tenant_id) on delete cascade"),
    "reviews and days go with the listing",
  );
  for (const t of ["google_listings", "google_reviews", "google_listing_days"]) {
    assert.ok(sql.includes(`alter table public.${t} enable row level security;`), t);
    assert.ok(sql.includes(`create policy ${t}_member_select on public.${t}`), t);
    assert.ok(
      !sql.includes(`on public.${t}\n  for insert`) && !sql.includes(`on public.${t}\n  for update`),
      `${t}: the edge alone writes`,
    );
  }
  assert.ok(
    sql.includes("alter publication supabase_realtime add table public.google_listings, public.google_reviews;"),
  );
  assert.ok(sql.includes("'calendar_people','alert','review'"), "the bell's kind");
  assert.ok(sql.includes("unique (tenant_id, review_id)"));
  assert.ok(sql.includes("check (origin in ('places', 'profile'))"));
  assert.ok(sql.includes("url     := v_url || '/api/cron/google'"));
  const m = sql.match(/cron\.schedule\('google-listings-sweep', '(\d+) \* \* \* \*'/);
  assert.ok(m, "hourly");
  assert.ok(Number(m[1]) % 5 !== 0 && ![13, 23, 43].includes(Number(m[1])), "a minute no other sweep uses");
});

test("the edge library: the key alone on the edge, one check routine, a failed read that moves no stamp, the manifests", () => {
  // The door -- the knock, status, search, link (a read before a row, the
  // old place's reviews forgotten), unlink, refresh, and the two events --
  // runs in google-door.test.mjs.
  const lib = readCode("apps/edge/lib/google/google.ts");
  assert.ok(lib.includes("env.GOOGLE_PLACES_API_KEY"));
  assert.ok(
    lib.includes("planListingCheck(") &&
      /kind: "review",\s*title: b\.title,\s*body: b\.body,\s*route: "reports"/.test(lib),
    "the plan decides, the edge writes and rings",
  );
  assert.ok(
    lib.includes(".update({ check_error: error })"),
    "a failed read leaves its words and the last good numbers",
  );
  // And does NOT move the stamp: checked_at / last_synced_at are the last
  // SUCCESSFUL read, which is the news cutoff, the first-sync flag and the due
  // window all at once.
  assert.ok(!lib.includes("check_error: error, checked_at:"), "a failure must not read as a read");
  assert.ok(!lib.includes("sync_error: error.slice(0, 300), last_synced_at:"), "nor a failed sync as a sync");
  assert.ok(
    lib.includes('onConflict: "tenant_id,review_id"') && !lib.includes("first_seen_at"),
    "an existing review keeps its first_seen_at",
  );
  assert.ok(lib.includes('"google.reviews"'));
  // The sweep -- skipped without a key, forty listings a tick, never-read
  // first, a refusal left on its row -- runs in cron-doors-b.test.mjs.
  const vercel = JSON.parse(readRaw("apps/edge/vercel.json"));
  assert.equal(vercel.functions["api/admin/google.ts"].maxDuration, 60);
  assert.equal(vercel.functions["api/cron/google.ts"].maxDuration, 60);
  // The edge keeps contracts' list rather than a copy (a copy turned 00134's new kinds into "alert"); that every
  // listed kind is stored as itself is run in notify-transport.test.mjs.
  assert.ok(
    readCode("apps/edge/lib/ops/notify.ts").includes("new Set(SERVER_NOTIFICATION_KINDS)") &&
      ["calendar_people", "review"].every((k) => SERVER_NOTIFICATION_KINDS.includes(k)),
    "the kind is kept, not folded into alert",
  );
  assert.ok(readRaw("apps/edge/.env.example").includes("GOOGLE_PLACES_API_KEY="));
});

test("the dashboard: owners link and search, operators read, members look; the pages read one surface", async () => {
  const search = readCode("apps/dashboard/app/api/v1/google/search/route.ts");
  assert.ok(search.includes('role: "owner",') && search.includes('rate: "google_search",'));
  assert.ok(
    search.includes("cfg?.brain?.business_name") && search.includes("cfg?.brain?.profile?.address"),
    "the facts on record are the default query",
  );
  const link = readCode("apps/dashboard/app/api/v1/google/link/route.ts");
  assert.ok(link.includes("export const POST") && link.includes("export const DELETE"));
  assert.equal((link.match(/role: "owner",/g) ?? []).length, 2);
  assert.ok(link.includes('op: "link", tenant_id: member.tenantId, user_id: ctx.userId, place_id: placeId'));
  const refresh = readCode("apps/dashboard/app/api/v1/google/refresh/route.ts");
  assert.ok(refresh.includes('role: "operator",') && refresh.includes('rate: "google_refresh",'));
  const get = readCode("apps/dashboard/app/api/v1/google/route.ts");
  assert.ok(/googleFor\(ctx\.supabase, member\.tenantId\),\s*googleReadiness\(\)/.test(get));
  const server = readCode("apps/dashboard/src/server/google.ts");
  assert.ok(server.includes('edgeHeaders("/api/admin/google"') && server.includes("const READY_TTL_MS = 5 * 60_000;"));
  assert.ok(!server.includes("GOOGLE_PLACES_API_KEY"), "the dashboard never holds the key");
  const setup = readCode("apps/dashboard/src/server/setup.ts");
  assert.ok(
    setup.includes("listingFor(supabase, tenantId),") &&
      setup.includes("listingFactsFor(supabase, tenantId),\n    googleReadiness(),") &&
      setup.includes("ready: google.places || google.profile,"),
  );
  const bridge = readCode("apps/dashboard/src/legacy-bridge/google.ts");
  assert.ok(
    bridge.includes('key: "google",') &&
      bridge.includes('refreshOnTables: ["google_listings", "google_reviews", "google_connections"],'),
  );
  assert.deepEqual(
    (await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts")).AFTER["POST google/link"]().map((o) => o.key),
    ["google", "setup"],
    "a link repaints Setup too",
  );
  assert.ok(
    /setupOverride,\s*googleOverride,\s*billingOverride,?\s*\]/.test(
      readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx"),
    ) && readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx").includes("installGoogle();"),
  );
  const rt = readCode("packages/db/src/realtime.ts");
  assert.ok(
    rt.includes('{ table: "google_listings", event: "*" }') &&
      rt.includes('{ table: "google_reviews", event: "INSERT" }'),
  );
  // The finder is the first run's Find (first-run-page.test.mjs runs it); Setup's row opens it.
  const reports = readCode("apps/dashboard/src/legacy/pages/reports.jsx");
  assert.ok(
    reports.includes("<GoogleSection days={R.days} />") &&
      reports.includes(
        "if (!G || (!G.dto.ready.places && !G.dto.ready.profile && !G.dto.listing) || !window.__google) return null;",
      ),
  );
  assert.ok(
    reports.includes("vm.reply.words ? `${vm.source} · ${vm.reply.words}` : vm.source"),
    "the source is named, and what the receptionist does under a new review beside it",
  );
  const brief = readCode("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  assert.ok(brief.includes("<ReviewLine nav={nav} />") && brief.includes('data-testid="brief-review"'));
  const settings = readCode("apps/dashboard/src/legacy/pages/integrations-real.jsx");
  assert.ok(
    settings.includes('"verb:google-check": "google-check"') && settings.includes('data-testid="google-remove"'),
    "the listing row keeps its verbs' names",
  );
  assert.ok(
    /console\.error\(\s*"google_search_failed"/.test(search) &&
      !/typeof b\.error === "string" \? b\.error :/.test(search),
    "Google's words go to the log, not the owner",
  );
  assert.ok(
    settings.includes('"verb:google-connect": "google-connect"') && settings.includes('testid="google-disconnect"'),
    "the second door keeps its verbs' names",
  );
  const rate = readCode("apps/dashboard/src/server/rate-limit.ts");
  for (const b of ["google_search", "google_link", "google_refresh"]) assert.ok(rate.includes(`${b}: {`), b);
});
