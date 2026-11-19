/**
 * The rules every page of Ads reads, each in one place (decision 0049, step P0b; contracts src/ads): an ad's badge and an
 * ad account's, who is booked from an ad, and the cost for each person who booked. The real functions run.
 *
 *   badge     Chanlytics's own making first, a run that is over next, then the platform's word against what was asked;
 *             every word Meta lists for an ad is read, and a word nobody knows is never read as On
 *   account   none, choosing, connected, and needing to be connected again (taken back, or a token run out)
 *   booked    a visit after first touch that is not cancelled and is more than a request; one before it does not count
 *   cost      a dash under five booked, a cost from five, "so far" while a day of the last fourteen is in the figure
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AD_SETTLE_DAYS,
  REPORT_MIN_N,
  adAccountStateOf,
  adCostRule,
  adDaySettling,
  adStateOf,
  addDays,
  bookedAfterTouch,
} from "@chanlytics/contracts";

const TODAY = "2026-11-18";

/** An ad Chanlytics made on Meta that the owner asked to be on, with a total it has not spent and days still to run. */
const kept = (over = {}) => ({
  status: "made",
  intent: "on",
  platform: "meta",
  platformWord: "ACTIVE",
  endDay: "2026-11-30",
  totalMinor: 72000,
  spentMinor: 41200,
  ...over,
});

const badge = (over) => adStateOf(kept(over), TODAY);

test("every word Meta has for an ad is read into a badge, against what the owner asked", () => {
  // Meta's `effective_status`, every value its reference lists for the Ad object (v27.0, read 18 November 2026).
  const asked = {
    ACTIVE: { on: "on", paused: "on" },
    PAUSED: { on: "needs-you", paused: "paused" },
    ADSET_PAUSED: { on: "needs-you", paused: "paused" },
    CAMPAIGN_PAUSED: { on: "needs-you", paused: "paused" },
    PENDING_REVIEW: { on: "review", paused: "paused" },
    IN_PROCESS: { on: "review", paused: "paused" },
    PREAPPROVED: { on: "review", paused: "paused" },
    DISAPPROVED: { on: "needs-you", paused: "needs-you" },
    PENDING_BILLING_INFO: { on: "needs-you", paused: "needs-you" },
    WITH_ISSUES: { on: "needs-you", paused: "needs-you" },
    ARCHIVED: { on: "ended", paused: "ended" },
    DELETED: { on: "ended", paused: "ended" },
  };
  assert.equal(Object.keys(asked).length, 12);
  for (const [platformWord, by] of Object.entries(asked)) {
    for (const intent of ["on", "paused"])
      assert.equal(badge({ platformWord, intent }), by[intent], `${platformWord}, asked ${intent}`);
    assert.equal(badge({ platformWord, intent: "ended" }), "ended", `${platformWord}, ended by its owner`);
  }
});

test("an ad is On only once its platform says so: a word nobody knows, or none yet, is In review", () => {
  assert.equal(badge({ platformWord: null }), "review", "made, and the platform has not been read");
  assert.equal(badge({ platformWord: "SOMETHING_NEW" }), "review", "a word Meta added since");
  assert.equal(badge({ platformWord: "active" }), "review", "Meta's words are read as Meta writes them");
  assert.equal(badge({ platformWord: "constructor" }), "review", "nor is a word every object answers to");
  assert.equal(badge({ platformWord: "SOMETHING_NEW", intent: "paused" }), "paused");
  // Google's and TikTok's words join with their own steps: until then none of theirs is known.
  for (const platform of ["google", "tiktok"]) assert.equal(badge({ platform }), "review", platform);
});

test("what Chanlytics is still doing comes first, and a run that is over next", () => {
  assert.equal(badge({ status: "draft", platformWord: null }), "draft");
  assert.equal(badge({ status: "sending", platformWord: "PAUSED" }), "setting-up", "made paused, then turned on");
  assert.equal(badge({ status: "failed", platformWord: "PAUSED" }), "couldnt-finish");
  assert.equal(badge({ status: "draft", intent: "ended", endDay: "2026-01-01" }), "draft", "nothing ran to be over");
  // Its total spent: Finished, whatever else is true of it.
  assert.equal(badge({ spentMinor: 72000 }), "finished");
  assert.equal(badge({ spentMinor: 72000, intent: "ended", endDay: "2026-11-01" }), "finished");
  assert.equal(badge({ spentMinor: 71999 }), "on", "a cent short of its total is not spent");
  // Its last day: over the day after, not on the day.
  assert.equal(badge({ endDay: TODAY }), "on");
  assert.equal(badge({ endDay: addDays(TODAY, -1) }), "ended");
  assert.equal(badge({ endDay: addDays(TODAY, -1), platformWord: "DISAPPROVED" }), "ended", "nothing left to mend");
  // A daily amount with no end never finishes and never ends by itself.
  assert.equal(badge({ totalMinor: null, endDay: null, spentMinor: 9_000_000 }), "on");
});

test("an ad account is not connected, to be chosen, connected, or needs connecting again", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const account = (status, tokenExpiresAt = null) => adAccountStateOf({ status, tokenExpiresAt }, now);
  assert.equal(adAccountStateOf(null, now), "not-connected", "the workspace has none on the platform");
  assert.equal(account("disconnected"), "not-connected");
  assert.equal(account("choosing"), "choose");
  assert.equal(account("connected"), "connected", "a token with no end");
  assert.equal(account("connected", "2026-12-18T12:00:00Z"), "connected");
  assert.equal(account("connected", "2026-11-18T12:00:00Z"), "lapsed", "a token that has just run out");
  assert.equal(account("connected", "2026-11-01T00:00:00Z"), "lapsed");
  assert.equal(account("revoked", "2026-12-18T12:00:00Z"), "lapsed", "the platform took its access back");
});

test("booked from an ad: a visit after first touch that is not cancelled, and is more than a request", () => {
  const touch = "2026-11-10T15:00:00Z";
  const visit = (status, start = "2026-11-25T10:00:00Z") => ({ status, start });
  assert.equal(bookedAfterTouch(touch, []), false);
  assert.equal(bookedAfterTouch(touch, [visit("booked")]), true, "a visit ahead");
  assert.equal(bookedAfterTouch(touch, [visit("kept", "2026-11-12T10:00:00Z")]), true, "one they kept");
  assert.equal(
    bookedAfterTouch(touch, [visit("missed", "2026-11-12T10:00:00Z")]),
    true,
    "one they missed: they booked",
  );
  assert.equal(bookedAfterTouch(touch, [visit("booked", "2026-11-12T10:00:00Z")]), true, "past, and never marked");
  assert.equal(bookedAfterTouch(touch, [visit("cancelled")]), false, "a cancelled visit un-books");
  assert.equal(bookedAfterTouch(touch, [visit("proposed")]), false, "a request nobody confirmed");
  assert.equal(bookedAfterTouch(touch, [visit("kept", "2026-11-01T10:00:00Z")]), false, "a visit before first touch");
  assert.equal(
    bookedAfterTouch(touch, [visit("booked", touch)]),
    false,
    "one that starts at the touch is not after it",
  );
  assert.equal(
    bookedAfterTouch(touch, [visit("cancelled"), visit("proposed"), visit("booked")]),
    true,
    "any one counts",
  );
  // The record's ms and the wire's ISO read alike, and a moment that is not a time counts for nothing.
  assert.equal(bookedAfterTouch(Date.parse(touch), [{ status: "booked", start: Date.parse(touch) + 1 }]), true);
  assert.equal(bookedAfterTouch("never", [visit("booked")]), false);
  assert.equal(bookedAfterTouch(touch, [visit("booked", "soon")]), false);
});

test("the cost for each person who booked: a dash under five, a cost from five, so far while a day still settles", () => {
  assert.equal(REPORT_MIN_N, 5);
  assert.equal(AD_SETTLE_DAYS, 14);
  const old = [addDays(TODAY, -40), addDays(TODAY, -AD_SETTLE_DAYS - 1)];
  const cost = (over) => adCostRule({ spentMinor: 41200, booked: 5, days: old, today: TODAY, ...over });
  assert.deepEqual(cost({ booked: 4 }), { eachMinor: null, soFar: false }, "four booked: a dash that says only 4");
  assert.deepEqual(cost({ booked: 0 }), { eachMinor: null, soFar: false });
  assert.deepEqual(cost({}), { eachMinor: 8240, soFar: false }, "five booked, every day settled");
  assert.equal(cost({ spentMinor: 1000, booked: 6 }).eachMinor, 1000 / 6, "an average is not rounded by the rule");
  // The settling window: any of the last fourteen days in the figure makes it so far.
  const edge = addDays(TODAY, -AD_SETTLE_DAYS);
  assert.equal(adDaySettling(edge, TODAY), true);
  assert.equal(adDaySettling(addDays(edge, -1), TODAY), false);
  assert.equal(cost({ days: [...old, edge] }).soFar, true);
  assert.equal(cost({ days: [...old, TODAY] }).soFar, true);
  assert.equal(cost({ days: [] }).soFar, false);
  // A dash is never so far: it says only how few booked.
  assert.deepEqual(cost({ booked: 4, days: [TODAY] }), { eachMinor: null, soFar: false });
});
