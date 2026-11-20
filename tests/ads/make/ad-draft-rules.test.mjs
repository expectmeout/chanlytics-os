/**
 * A new ad's draft, the parts code picks (contracts ads/draft.ts; the Ads plan's 4.6, 5.1 and its gaps G5, G6, G7, G13
 * and G15): the service, the picture, the area, the amount and the end, the one thing missing where a draft cannot be
 * written, and what stops an amount, an end date or a picture before Turn on. Rules with no model, over made-up
 * businesses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

const picture = (over = {}) => ({
  id: "pic-1",
  serviceId: "svc-first",
  kind: "photo",
  width: 1440,
  height: 1800,
  seconds: null,
  people: false,
  music: null,
  beforeAfter: false,
  made: false,
  ...over,
});

const inputs = (over = {}) => ({
  today: "2026-11-20",
  services: [
    { id: "svc-first", name: "First appointment", advertised: false, booked: 4 },
    { id: "svc-follow", name: "Follow-up", advertised: false, booked: 9 },
  ],
  pictures: [picture(), picture({ id: "pic-2", serviceId: "svc-follow" })],
  address: "12 Harbor Street, Miami, FL",
  whatsapp: true,
  account: { currency: "USD", minDailyMinor: 100 },
  history: { booked: 0, costPerBookedMinor: null, largestTotalMinor: null },
  ownerMostMinor: null,
  openTimes: null,
  ...over,
});

test("5.1, a picture: only one that shows nobody, has no music, is no before and after, and is a shape Meta takes", () => {
  assert.equal(C.adPictureIssue(picture()), null, "4:5, wide enough, nobody in it");
  assert.equal(C.adPictureIssue(picture({ width: 1080, height: 1080 })), null, "square");
  assert.equal(C.adPictureIssue(picture({ width: 1200, height: 628 })), null, "1.91:1");
  // Until Content answers who said yes to ads (its step L4), a person shown stops it, and so does not knowing.
  assert.equal(C.adPictureIssue(picture({ people: true })), "person");
  assert.equal(C.adPictureIssue(picture({ people: null })), "person");
  assert.equal(C.adPictureIssue(picture({ beforeAfter: true })), "before_after");
  assert.equal(C.adPictureIssue(picture({ width: 480, height: 600 })), "small");
  // One picture is shown in every place, so it is the feed's shape: a tall one for stories alone is not offered yet.
  assert.equal(C.adPictureIssue(picture({ width: 1080, height: 1920 })), "shape");
  assert.equal(C.adPictureIssue(picture({ width: 2400, height: 800 })), "shape");

  const video = (over) => picture({ kind: "video", seconds: 20, music: false, ...over });
  assert.equal(C.adPictureIssue(video()), null);
  // Music runs in an ad only with a licence of the advertiser's own: with music, or not known, it is not offered.
  assert.equal(C.adPictureIssue(video({ music: true })), "music");
  assert.equal(C.adPictureIssue(video({ music: null })), "music");
  assert.equal(C.adPictureIssue(picture({ music: true })), null, "a photo has no sound");
  for (const seconds of [2, 61, null]) assert.equal(C.adPictureIssue(video({ seconds })), "length", String(seconds));
  assert.equal(C.adPictureIssue(video({ seconds: 3 })), null);
  assert.equal(C.adPictureIssue(video({ seconds: 60 })), null);
});

test("5.1, an amount: never under Meta's least for the run, over the owner's most, or a part of a unit", () => {
  const account = { currency: "USD", minDailyMinor: 100 };
  // Meta's least is for a day and holds for a total: fourteen days at a dollar a day is fourteen dollars.
  assert.equal(C.adLeastTotal(account, 14), 1400);
  assert.equal(C.adLeastTotal({ currency: "USD", minDailyMinor: 135 }, 3), 500, "up to a whole dollar");
  assert.equal(C.adLeastTotal({ currency: "JPY", minDailyMinor: 150 }, 14), 2100, "the yen is its own unit");
  assert.equal(C.adLeastTotal(account, 0), 100, "a run is never under a day");

  const amount = (totalMinor, over = {}) =>
    C.adAmountIssue({ totalMinor, days: 14, account, ownerMostMinor: null, ...over });
  assert.equal(amount(7000), null);
  assert.equal(amount(1400), null);
  assert.deepEqual(amount(1300), { code: "under_least", nearestMinor: 1400 });
  assert.deepEqual(amount(0), { code: "under_least", nearestMinor: 1400 });
  assert.deepEqual(amount(7050), { code: "not_whole", nearestMinor: 7100 });
  assert.deepEqual(amount(12000, { ownerMostMinor: 10000 }), { code: "over_most", nearestMinor: 10000 });
  assert.equal(amount(10000, { ownerMostMinor: 10000 }), null);
  // An owner's most under Meta's least leaves no amount: Meta's least is what is said.
  assert.deepEqual(amount(1400, { ownerMostMinor: 1000 }), { code: "over_most", nearestMinor: 1400 });
});

test("5.1, an end date: at least one whole day to run, and the nearest day that is", () => {
  assert.equal(C.adEndIssue("2026-11-20", "2026-12-04"), null);
  assert.equal(C.adEndIssue("2026-11-20", "2026-11-21"), null);
  assert.deepEqual(C.adEndIssue("2026-11-20", "2026-11-20"), { code: "too_soon", nearestDay: "2026-11-21" });
  assert.deepEqual(C.adEndIssue("2026-11-20", "2026-11-01"), { code: "too_soon", nearestDay: "2026-11-21" });
  assert.deepEqual(C.adEndIssue("2026-12-31", "2026-12-31"), { code: "too_soon", nearestDay: "2027-01-01" });
});

test("5.1, the kinds Meta asks to be declared are read from words, and an ordinary service is none", () => {
  assert.deepEqual(C.adSpecialKinds("We're hiring line cooks"), ["employment"]);
  assert.deepEqual(C.adSpecialKinds("Apartments for rent, and home loans too"), ["housing", "financial"]);
  assert.deepEqual(C.adSpecialKinds("Vota por la candidata"), ["politics"]);
  assert.deepEqual(C.adSpecialKinds("Casino night with sports betting"), ["gambling"]);
  assert.deepEqual(C.adSpecialKinds("Préstamos personales y tarjetas de crédito"), ["financial"]);
  for (const ordinary of [
    "Move-out cleaning for apartments and houses",
    "We take most insurance plans",
    "Pago seguro, seguro que te gusta",
    "Voted best brake check in town",
    "Career coaching sessions",
  ])
    assert.deepEqual(C.adSpecialKinds(ordinary), [], ordinary);
});

test("a draft says the one thing missing, in the order an owner can mend them (G13)", () => {
  const missing = (over) => C.adDraftOf(inputs(over));
  assert.deepEqual(missing({ services: [] }), { ok: false, missing: "service" });
  // Every service already has an ad: there is none left to propose.
  assert.deepEqual(missing({ services: inputs().services.map((service) => ({ ...service, advertised: true })) }), {
    ok: false,
    missing: "service",
  });
  assert.deepEqual(missing({ address: "  " }), { ok: false, missing: "address" });
  assert.deepEqual(missing({ whatsapp: false }), { ok: false, missing: "whatsapp" });
  assert.deepEqual(missing({ pictures: [] }), { ok: false, missing: "picture" });
  assert.deepEqual(missing({ pictures: [picture({ people: true })] }), { ok: false, missing: "picture" });
});

test("the service: never one with an ad, never one with no picture fine in ads, then the most booked (G5)", () => {
  const picked = (over) => {
    const draft = C.adDraftOf(inputs(over));
    return draft.ok ? draft.parts.serviceId : draft.missing;
  };
  assert.equal(picked(), "svc-follow", "booked most in the last 90 days");
  const [first, follow] = inputs().services;
  assert.equal(
    picked({ services: [first, { ...follow, advertised: true }] }),
    "svc-first",
    "an ad already runs for it",
  );
  assert.equal(picked({ pictures: [picture()] }), "svc-first", "the most booked has no picture");
  // Nobody booked anything yet: Services' own order.
  assert.equal(
    picked({
      services: [
        { ...first, booked: 0 },
        { ...follow, booked: 0 },
      ],
    }),
    "svc-first",
  );
  // A picture about no service in particular serves any of them.
  assert.equal(picked({ pictures: [picture({ id: "pic-9", serviceId: null })] }), "svc-follow");
});

test("the picture: one about the service before a general one, a video before a photo, AI's before a kept one", () => {
  const picked = (pictures) => {
    const draft = C.adDraftOf(inputs({ services: [inputs().services[0]], pictures }));
    return draft.ok ? draft.parts.pictureId : draft.missing;
  };
  const clip = picture({ id: "clip", kind: "video", seconds: 20, music: false });
  assert.equal(picked([picture({ id: "kept" }), clip]), "clip");
  assert.equal(picked([picture({ id: "kept" }), picture({ id: "made", made: true })]), "made");
  assert.equal(picked([picture({ id: "general", serviceId: null, made: true }), picture({ id: "own" })]), "own");
  assert.equal(picked([picture({ id: "first" }), picture({ id: "second" })]), "first", "Files' own order");
  assert.equal(
    picked([picture({ id: "loud", kind: "video", seconds: 20, music: true }), picture({ id: "quiet" })]),
    "quiet",
  );
});

test("the amount and the end: a starting amount under five booked, the calendar's open times over it, a most (G6)", () => {
  const parts = (over) => C.adDraftOf(inputs(over)).parts;
  // Nothing booked from ads yet: Meta's least for fourteen days, said as a starting amount, five miles, two weeks.
  assert.deepEqual(parts(), {
    serviceId: "svc-follow",
    pictureId: "pic-2",
    miles: 5,
    totalMinor: 1400,
    starting: true,
    days: 14,
    endDay: "2026-12-04",
  });
  const known = { booked: 6, costPerBookedMinor: 1150, largestTotalMinor: 8000 };
  // Six open times at $11.50 a booking is $69, never above the largest total they have turned on.
  assert.deepEqual(
    [parts({ history: known, openTimes: 6 }).totalMinor, parts({ history: known, openTimes: 6 }).starting],
    [6900, false],
  );
  assert.equal(parts({ history: known, openTimes: 20 }).totalMinor, 8000);
  assert.equal(parts({ history: known, openTimes: 20, ownerMostMinor: 15000 }).totalMinor, 15000, "the owner's most");
  assert.equal(parts({ history: known, openTimes: 1 }).totalMinor, 1400, "never under Meta's least");
  // Under five booked, with no cost known, or with no calendar link: a starting amount, and no number promised.
  assert.equal(parts({ history: { ...known, booked: 4 }, openTimes: 6 }).starting, true);
  assert.equal(parts({ history: { ...known, costPerBookedMinor: null }, openTimes: 6 }).starting, true);
  assert.equal(parts({ history: known, openTimes: null }).starting, true);
  // Before any total was turned on and with no most said, Meta's least is the ceiling too.
  assert.equal(parts({ history: { ...known, largestTotalMinor: null }, openTimes: 20 }).totalMinor, 1400);
  // Every amount a draft proposes passes the amount's own check.
  for (const over of [{}, { history: known, openTimes: 6 }, { history: known, openTimes: 20, ownerMostMinor: 15000 }]) {
    const draft = parts(over);
    assert.equal(
      C.adAmountIssue({
        totalMinor: draft.totalMinor,
        days: draft.days,
        account: inputs().account,
        ownerMostMinor: over.ownerMostMinor ?? null,
      }),
      null,
    );
    assert.equal(C.adEndIssue(inputs().today, draft.endDay), null);
  }
  assert.deepEqual([C.AD_RUN_DAYS, C.AD_DRAFT_MILES, C.AD_BOOKED_TO_FORECAST], [{ draft: 14, least: 1 }, 5, 5]);
});
