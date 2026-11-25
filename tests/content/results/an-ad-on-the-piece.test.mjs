/**
 * An ad made from a piece, on the piece (the content loop's pass 6; the content canvas's Loop2, approved 24 Nov 2026; the
 * Ads plan's 6.8, join 8): its line under Where it goes in Ads' words, in the canvas's four states, opening the ad where
 * there is one to open; and what it brought apart from the post, with what a booking cost. Pure: contracts ads/on-piece.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PIECE_AD_WORDS, pieceAdBroughtOf, pieceAdLineOf } from "@chanlytics/contracts";

const TZ = "America/New_York";
const ad = (over = {}) => ({
  id: "ad-1",
  state: "on",
  shown_on: ["facebook"],
  spend_minor: 1800,
  total_minor: 4000,
  currency: "USD",
  // Friday 4 December 2026, the end of its last day in New York.
  ends_at: "2026-12-05T04:59:00.000Z",
  paused_by: null,
  version: 3,
  people: 9,
  booked: 2,
  ...over,
});

test("the ad's line in the canvas's four states, in Ads' words; Meta checking it opens nothing yet", () => {
  const said = (over) => {
    const line = pieceAdLineOf(ad(over), TZ, null);
    return [line.title, line.said, line.tone, line.opens];
  };
  assert.deepEqual(said({ state: "review" }), [
    "Ad on Facebook",
    "Meta is checking it · usually within a day",
    "moving",
    false,
  ]);
  assert.deepEqual(said({}), ["Ad on Facebook", "Running as an ad · $18 of $40 · until Fri", "ok", true]);
  assert.deepEqual(said({ state: "ended", spend_minor: 4000 }), [
    "Ad on Facebook",
    "Ran as an ad · $40 · ended Fri",
    "gone",
    true,
  ]);
  assert.deepEqual(said({ state: "paused", paused_by: "remediation" }), [
    "Ad on Facebook",
    "Paused when you took the post down",
    "gone",
    true,
  ]);
  assert.equal(
    pieceAdLineOf(ad({ shown_on: ["facebook", "instagram"] }), TZ, null).title,
    "Ad on Facebook and Instagram",
  );
});

test("a post removed at its place while its ad runs: the ad's line says so, with the one press that pauses it", () => {
  // The review of 24 Nov 2026, B5 and D3: a take-down from here pauses the piece's ads; a removal on Instagram did
  // not, and nothing said the ad went on.
  const running = pieceAdLineOf(ad(), TZ, "Instagram");
  assert.deepEqual(
    [running.said, running.tone, running.note, running.pause, running.opens],
    [
      "Running as an ad · $18 of $40 · until Fri",
      "needs",
      "Its post was removed on Instagram. The ad is still running.",
      true,
      true,
    ],
  );
  assert.equal(PIECE_AD_WORDS.pause, "Pause the ad");
  // Nothing was removed: the line is as it was, and offers no pause of its own.
  const fine = pieceAdLineOf(ad(), TZ, null);
  assert.deepEqual([fine.tone, fine.note, fine.pause], ["ok", null, false]);
  // An ad that is not running has nothing to pause: paused already, ended, or still being checked.
  for (const state of ["paused", "ended", "finished", "review", "setting-up", "couldnt-finish"]) {
    const line = pieceAdLineOf(ad({ state }), TZ, "Instagram");
    assert.deepEqual([line.note, line.pause], [null, false], state);
  }
});

test("what the ad brought, apart from the post: its spend in its head, and what a booking cost only where one was booked", () => {
  assert.deepEqual(pieceAdBroughtOf(ad({ spend_minor: 4000 })), {
    head: "From the ad · $40",
    line: "9 conversations · 2 booked from the ad · about $20 a booking",
  });
  assert.deepEqual(pieceAdBroughtOf(ad({ booked: 0, people: 1 })), {
    head: "From the ad · $18",
    line: "1 conversation",
  });
});
