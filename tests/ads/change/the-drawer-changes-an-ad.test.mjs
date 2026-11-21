/**
 * An ad made here, changed from its drawer (the Ads plan's 4.5 and 5.2; decision 0050, calls 3 and 10): the one rule
 * every tree judges a change by (contracts ads/change.ts), and the drawer's model of it (surfaces/campaigns/ads/live
 * change-model.ts, and the sheet's own model.ts), over page reads in memory. Pure: no network, no clock but the one
 * handed in.
 *
 * What must hold. A total is never under Meta's least for the run nor a tenth over what it spent, and a raise is never
 * past the owner's most; only a raise names a most. A last day is a whole day off at least, and no later than the total
 * covers at Meta's least a day. Miles are whole, 1 to 50, and an ad shown across a wider place has none to change.
 * Meta's four amounts an hour say when the next is taken. The drawer's sentence taps only where its owner may change
 * it and nothing is on its way, and its press says what it does. An ad Meta turned down offers Fix it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const S = "../../../apps/dashboard/src";
const C = await import("@chanlytics/contracts");
const { changeSentenceOf, changeEditOf, changeToastOf, typedOf } = await import(
  `${S}/surfaces/campaigns/ads/live/change-model.ts`
);
const { sheetModel } = await import(`${S}/surfaces/campaigns/ads/live/model.ts`);
const { FIX } = await import(`${S}/surfaces/campaigns/ads/live/change-words.ts`);

const TZ = "America/New_York";
const NOW = Date.parse("2026-11-21T15:00:00Z");
const ID = "adadadad-9999-4000-8000-000000000001";

/** $70 in all, $20 spent, from 16 November to 4 December, at Meta's least of $1 a day. */
const FACTS = {
  currency: "USD",
  minDailyMinor: 100,
  ownerMostMinor: null,
  totalMinor: 7000,
  spentMinor: 2000,
  startDay: "2026-11-16",
  endDay: "2026-12-04",
  today: "2026-11-21",
  miles: 5,
};
const issue = (ask, over = {}) => C.adChangeIssue(ask, { ...FACTS, ...over });

test("a total is held to Meta's least for the run, a tenth over what it spent, and the owner's most", () => {
  assert.equal(issue({ what: "total", total_minor: 9000 }), null);
  assert.deepEqual(issue({ what: "total", total_minor: 7000 }), { code: "same" });
  // $20 spent: Meta keeps it at least $22.
  assert.deepEqual(issue({ what: "total", total_minor: 2100 }), { code: "under_spent", nearest_minor: 2200 });
  // Nothing spent, a run of 19 days touching 19 calendar days at $1: $19 at the least.
  assert.deepEqual(issue({ what: "total", total_minor: 1500 }, { spentMinor: 0 }), {
    code: "under_least",
    nearest_minor: 1900,
  });
  assert.deepEqual(issue({ what: "total", total_minor: 9000 }, { ownerMostMinor: 8000 }), {
    code: "over_most",
    nearest_minor: 8000,
  });
  // A cut is never held to the owner's most: it can only cost less.
  assert.equal(issue({ what: "total", total_minor: 6000 }, { ownerMostMinor: 5000 }), null);
  assert.deepEqual(issue({ what: "total", total_minor: 9050 }), { code: "not_whole", nearest_minor: 9100 });
});

test("only a raise names a most, and it is the new total; a raise or a later last day can spend where it would not", () => {
  assert.equal(C.adChangeMostOf({ what: "total", total_minor: 9000 }, FACTS), 9000);
  assert.equal(C.adChangeMostOf({ what: "total", total_minor: 6000 }, FACTS), null);
  assert.equal(C.adChangeMostOf({ what: "end_day", end_day: "2026-12-10" }, FACTS), null);
  assert.equal(C.adChangeMostOf({ what: "end" }, FACTS), null);
  assert.equal(C.adChangeSpendsMore({ what: "total", total_minor: 9000 }, FACTS), true);
  assert.equal(C.adChangeSpendsMore({ what: "end_day", end_day: "2026-12-10" }, FACTS), true);
  assert.equal(C.adChangeSpendsMore({ what: "end_day", end_day: "2026-11-30" }, FACTS), false);
  assert.equal(C.adChangeSpendsMore({ what: "miles", miles: 8 }, FACTS), false);
});

test("a last day is a whole day off at least, and no later than the total covers at Meta's least a day", () => {
  assert.equal(issue({ what: "end_day", end_day: "2026-12-10" }), null);
  assert.deepEqual(issue({ what: "end_day", end_day: "2026-11-21" }), { code: "too_soon", nearest_day: "2026-11-22" });
  // $25 covers 25 calendar days from 16 November at $1 a day: to 9 December.
  assert.deepEqual(issue({ what: "end_day", end_day: "2027-01-31" }, { totalMinor: 2500 }), {
    code: "too_long",
    nearest_day: "2026-12-10",
    least_minor: 7700,
  });
});

test("miles are whole, 1 to 50, and an ad shown across a wider place has none to change here", () => {
  assert.equal(issue({ what: "miles", miles: 8 }), null);
  assert.deepEqual(issue({ what: "miles", miles: 5 }), { code: "same" });
  assert.deepEqual(issue({ what: "miles", miles: 80 }), { code: "miles", nearest_miles: 50 });
  assert.deepEqual(issue({ what: "miles", miles: 8 }, { miles: null }), { code: "wide" });
  assert.equal(C.adApprovedMiles({ miles: 5 }), 5);
  assert.equal(C.adApprovedMiles({ miles: 5, area: { kind: "city", key: "1", name: "Miami" } }), null);
});

test("Meta takes four amounts an hour: the fifth waits until the oldest of the four is an hour old", () => {
  const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();
  assert.equal(C.adAmountAfter([ago(30), ago(20), ago(10)], NOW), null);
  assert.equal(
    C.adAmountAfter([ago(90), ago(40), ago(30), ago(20), ago(10)], NOW),
    new Date(NOW + 20 * 60_000).toISOString(),
  );
  assert.equal(C.adAmountAfter([ago(70), ago(30), ago(20), ago(10)], NOW), null, "one is past the hour");
});

test("a change on its way is read back from what the ad keeps, and one Meta never answered says so", () => {
  assert.deepEqual(C.adChangeOnWayOf({ what: "total", total_minor: 9000, asked_at: "x" }), {
    what: "total",
    total_minor: 9000,
    unsure: false,
  });
  assert.deepEqual(C.adChangeOnWayOf({ what: "end", sent_at: "x" }), { what: "end", unsure: true });
  assert.equal(C.adChangeOnWayOf(null), null);
  assert.equal(C.adChangeOnWayOf({ what: "total" }), null, "a change with nothing to change to is none");
});

test("the server reads the same facts from an ad's row as the drawer from the page", () => {
  const row = {
    origin: "chanlytics",
    budget_kind: "total",
    budget_minor: 7000,
    budget_left_minor: 5000,
    starts_at: "2026-11-16T15:00:00Z",
    ends_at: "2026-12-05T04:59:00Z",
    created_at: "2026-11-16T14:00:00Z",
    approved: { miles: 5 },
  };
  const account = { currency: "USD", minDailyMinor: 100, ownerMostMinor: null, timezone: TZ };
  assert.deepEqual(C.adChangeFactsOf(row, account, NOW), FACTS);
  assert.equal(C.adChangeFactsOf({ ...row, origin: "platform" }, account, NOW), null, "an ad made in Meta: none");
});

/* ------------------------------------------------------------------------------------------------ the drawer */

const adOf = ({ made_here: here, ...over } = {}) => ({
  id: ID,
  name: "First visit",
  made_in_platform: false,
  shown_on: ["facebook"],
  launch: { stopped: null, said: null, left: [] },
  made_here:
    here === null
      ? null
      : {
          miles: 5,
          place: null,
          start_day: "2026-11-16",
          change: null,
          amount_after: null,
          changed_in_meta: false,
          ...here,
        },
  opens: "whatsapp",
  state: "on",
  needs: null,
  issue: null,
  ends_at: "2026-12-05T04:59:00.000Z",
  budget: { kind: "total", minor: 7000, left_minor: 5000, shared: false },
  pending: null,
  version: 4,
  resume: { ok: false, why: "not_paused" },
  people: 0,
  booked: 0,
  spend_minor: 2000,
  settling: false,
  theirs: { impressions: 0, clicks: 0, results: null },
  ...over,
});
const pageOf = (ads, over = {}) => ({
  account: {
    status: "connected",
    name: "Harbor ads",
    currency: "USD",
    timezone: TZ,
    read_at: "2026-11-21T14:00:00Z",
    read_failed: false,
    revoked_at: null,
    disconnected_at: null,
    min_daily_minor: 100,
    most_minor: null,
    ...over.account,
  },
  window: { from: "2026-10-23", to: "2026-11-21" },
  today: "2026-11-21",
  ads,
  unnamed: { people: 0, booked: 0 },
  elsewhere: { people: 0, booked: 0 },
  can_press: over.can_press ?? true,
  stopped_at: null,
});

test("the sentence says who sees it, up to what in all, until when, and taps its three words for the owner", () => {
  const vm = changeSentenceOf(adOf(), pageOf([adOf()]), NOW);
  assert.deepEqual([vm.lead, vm.area, vm.total, vm.end], ["People within ", "5 miles", "$70", "Fri 4 Dec"]);
  assert.deepEqual(vm.taps, { total: true, end_day: true, miles: true });
  assert.deepEqual([vm.note, vm.ends], [null, true]);
  assert.deepEqual(vm.from, { total_minor: 7000, ends_at: "2026-12-05T04:59:00.000Z" });
  assert.deepEqual(vm.facts, FACTS);
  // A wider place is said by its name, and its miles are not tapped.
  const wide = adOf({ made_here: { miles: null, place: { kind: "city", name: "Miami" } } });
  const across = changeSentenceOf(wide, pageOf([wide]), NOW);
  assert.deepEqual([across.lead, across.area, across.taps.miles], ["People in and around ", "Miami", false]);
});

test("nothing is tapped while a change is on its way, nor by anyone who may not change the ad", () => {
  const onWay = adOf({ made_here: { change: { what: "total", total_minor: 9000, unsure: false } } });
  const vm = changeSentenceOf(onWay, pageOf([onWay]), NOW);
  assert.deepEqual([vm.taps.total, vm.note], [false, "Changing the total to $90…"]);
  const unsure = adOf({ made_here: { change: { what: "end", unsure: true } } });
  assert.match(changeSentenceOf(unsure, pageOf([unsure]), NOW).note, /Couldn't confirm Meta took the change/);
  assert.equal(changeSentenceOf(unsure, pageOf([unsure]), NOW).ends, false, "ending, so End is not offered again");
  const reader = changeSentenceOf(adOf(), pageOf([adOf()], { can_press: false }), NOW);
  assert.deepEqual([reader.taps, reader.ends], [{ total: false, end_day: false, miles: false }, false]);
  // Changed in Meta: the sentence says what Meta holds, and that it was changed there.
  const moved = adOf({ made_here: { changed_in_meta: true } });
  assert.equal(changeSentenceOf(moved, pageOf([moved]), NOW).note, "Changed in Meta · this is what Meta holds now");
});

test("an ad made in Meta, one still being set up and one whose run is over have no sentence to change", () => {
  for (const ad of [
    adOf({ made_here: null, made_in_platform: true }),
    adOf({ state: "setting-up" }),
    adOf({ state: "ended" }),
  ])
    assert.equal(changeSentenceOf(ad, pageOf([ad]), NOW), null);
});

test("a box's press says what it does, a raise naming its most; what can't be sent has no press and says why", () => {
  const vm = changeSentenceOf(adOf(), pageOf([adOf()]), NOW);
  const typed = typedOf(vm);
  const at = { timezone: TZ };
  const up = changeEditOf(vm, "total", { ...typed, total_minor: 9000 }, at);
  assert.deepEqual([up.press.words, up.press.most], ["Raise to $90 in all", 9000]);
  assert.equal(up.hint, "Meta never spends more than the total in all");
  const down = changeEditOf(vm, "total", { ...typed, total_minor: 5000 }, at);
  assert.deepEqual([down.press.words, down.press.most], ["Lower to $50 in all", null]);
  const under = changeEditOf(vm, "total", { ...typed, total_minor: 1000 }, at);
  assert.deepEqual(
    [under.press, under.tone, under.hint],
    [null, "warn", "At least $22: Meta keeps it above what's spent"],
  );
  assert.equal(changeEditOf(vm, "total", typed, at).press, null, "the same total has nothing to press");
  assert.equal(changeEditOf(vm, "total", typed, at).hint, "At least $22 for this run");
  assert.equal(
    changeEditOf(vm, "end_day", { ...typed, end_day: "2026-12-10" }, at).press.words,
    "Run until Thu 10 Dec",
  );
  assert.equal(changeEditOf(vm, "end_day", { ...typed, end_day: "2026-11-30" }, at).press.words, "End on Mon 30 Nov");
  assert.equal(changeEditOf(vm, "miles", { ...typed, miles: 8 }, at).press.words, "Show within 8 miles");
  // The owner's most says itself under the total, and a raise past it has no press.
  const capped = changeSentenceOf(adOf(), pageOf([adOf()], { account: { most_minor: 8000 } }), NOW);
  assert.equal(changeEditOf(capped, "total", typedOf(capped), at).hint, "At least $22 · your most for an ad is $80");
  assert.equal(changeEditOf(capped, "total", { ...typed, total_minor: 9000 }, at).press, null);
});

test("with Meta's four amounts used, the total's box says when the next is taken, and has no press", () => {
  const waits = adOf({ made_here: { amount_after: "2026-11-21T15:40:00.000Z" } });
  const vm = changeSentenceOf(waits, pageOf([waits]), NOW);
  const box = changeEditOf(vm, "total", { ...typedOf(vm), total_minor: 9000 }, { timezone: TZ });
  assert.deepEqual([box.press, box.hint], [null, "Meta takes the next change of the total at 10:40 AM"]);
});

test("a toast says what a change came to: taken, waiting for Meta, not known yet, or ended", () => {
  const ad = { name: "First visit", currency: "USD" };
  const raise = { what: "total", total_minor: 9000 };
  assert.deepEqual(changeToastOf(raise, "told", ad), { msg: "The total is now $90", undoable: true });
  assert.deepEqual(changeToastOf(raise, "soon", ad), { msg: "The total goes to $90 in a moment", undoable: true });
  assert.equal(changeToastOf(raise, "sent", ad).undoable, false, "nothing known to undo");
  assert.deepEqual(changeToastOf({ what: "end" }, "told", ad), { msg: "First visit has ended", undoable: false });
});

test("an ad made here that Meta turned down offers Fix it beside a door to ask Meta to look again, and End", () => {
  const refused = adOf({
    state: "needs-you",
    needs: "refused",
    issue: "Your ad uses language about personal attributes.",
  });
  const sheet = sheetModel(pageOf([refused]), ID, { timezone: TZ, nowMs: NOW });
  assert.deepEqual(sheet.foot, { kind: "fix", body: FIX.body });
  assert.deepEqual([sheet.reason.words, sheet.change, sheet.ends], [refused.issue, null, true]);
  // One made in Meta is fixed in Meta, as before.
  const inMeta = adOf({ made_here: null, made_in_platform: true, state: "needs-you", needs: "refused", issue: "x" });
  assert.notEqual(sheetModel(pageOf([inMeta]), ID, { timezone: TZ }).foot.kind, "fix");
});
