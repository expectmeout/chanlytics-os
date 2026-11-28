/**
 * A made video's second version, as its screens say it (the version board, approved 23 Nov 2026 with its calls 14 and 15;
 * 00708): while version 2 is made, the posts set to go wait for it and nothing else is offered; once made, each asks
 * again and one press approves it for every place; one that could not be made leaves version 1 going as approved, with
 * Try again; the list of versions offers an older one "Post this one instead" only where something still waits. One
 * version says nothing of versions at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { revisionChangesOf, piecePlanOf, versionSaysOther } from "@chanlytics/contracts";
import {
  VERSION_WORDS,
  versionStandingOf,
} from "../../../apps/dashboard/src/surfaces/campaigns/content/model/version.ts";

const NOW = Date.parse("2026-12-01T18:00:00Z");
const ahead = (ms) => new Date(NOW + ms).toISOString();
const HOUR = 3_600_000;
const when = (iso) => `@${iso.slice(11, 16)}`;
let seq = 0;
const post = (over = {}) => ({
  id: `post-${++seq}`,
  place: "instagram",
  kind: "reel",
  caption: "Forty-five minutes, one round brush.",
  status: "queued",
  held_reason: null,
  held_why: null,
  permalink: null,
  scheduled_for: ahead(HOUR),
  published_at: null,
  verified_at: null,
  good_until: null,
  error: null,
  created_at: new Date(NOW - HOUR).toISOString(),
  ...over,
});
const V1 = { n: 1, changed: [], at: "2026-11-30T14:03:00Z", file_id: "file-v1" };
const V2 = { n: 2, changed: ["trim"], at: "2026-12-01T16:12:00Z", file_id: "file-v2" };
const versions = (over = {}) => ({ n: 1, drawing: null, failed: false, list: [V1], waiting: [], ...over });

test("one version says nothing of versions", () => {
  const none = versionStandingOf(undefined, [post()], "file-v1", when);
  assert.deepEqual(
    { making: none.making, ver: none.ver, pill: none.pill, under: none.under, lead: none.lead, list: none.list },
    { making: null, ver: null, pill: null, under: null, lead: null, list: [] },
  );
  const one = versionStandingOf(versions(), [post()], "file-v1", when);
  assert.equal(one.ver, null);
  assert.equal(one.lead, null);
  assert.deepEqual(one.list, []);
});

test("while version 2 is made, every post set to go waits for it and nothing is offered to press", () => {
  const reel = post({ scheduled_for: ahead(2 * HOUR) });
  const story = post({ kind: "story", scheduled_for: ahead(HOUR) });
  const up = post({ status: "published", published_at: ahead(-HOUR) });
  const making = versionStandingOf(versions({ drawing: "drawing" }), [reel, story, up], "file-v1", when);
  assert.equal(making.making?.title, "Making version 2");
  assert.equal(making.making?.stage, "Putting it together");
  assert.ok(making.making.share > 0 && making.making.share < 1);
  // The pill counts the places that wait; what is up already is not one.
  assert.deepEqual(making.pill, { said: "Waits for version 2 · 2 places", tone: "live" });
  assert.equal(making.under, VERSION_WORDS.waitsNote);
  assert.equal(making.lines.get(story.id), `Waits for version 2 · ${when(story.scheduled_for)}`);
  assert.equal(making.lines.has(up.id), false);
  assert.equal(making.lead, null);
  // Nothing set to go: it says only that it is coming.
  const quiet = versionStandingOf(versions({ drawing: "queued" }), [up], "file-v1", when);
  assert.equal(quiet.pill, null);
  assert.equal(quiet.under, VERSION_WORDS.madeNote);
  // A stage this build does not know is said as drawing, never as nothing.
  assert.equal(
    versionStandingOf(versions({ drawing: "rendering" }), [], "file-v1", when).making?.stage,
    "Putting it together",
  );
});

test("version 2 made asks again: the posts approved at version 1 wait for its approval, and one press approves it", () => {
  const reel = post({ scheduled_for: ahead(3 * HOUR) });
  const google = post({ place: "google", kind: "post", scheduled_for: ahead(HOUR) });
  const asks = versionStandingOf(
    versions({ n: 2, list: [V2, V1], waiting: [reel.id, google.id] }),
    [reel, google],
    "file-v2",
    when,
  );
  assert.equal(asks.ver, "Version 2 · a new cut");
  assert.deepEqual(asks.pill, { said: "Changed · approve it again", tone: "you" });
  assert.equal(
    asks.under,
    `Version 2 replaced what you approved, so it waits for you before it goes up ${when(google.scheduled_for)}.`,
  );
  assert.deepEqual(asks.lead, { words: "Approve version 2", is: "approve" });
  assert.equal(asks.lines.get(reel.id), `Waits for version 2's approval · ${when(reel.scheduled_for)}`);
  // The list: version 2 open (it plays above), version 1 what was approved, and it may still go instead.
  assert.deepEqual(
    asks.list.map((v) => [v.title, v.said.split(" · ")[0], v.current, v.instead]),
    [
      ["Version 2", "a new cut", true, false],
      ["Version 1", "What you approved", false, true],
    ],
  );
});

test("approved again, or with nothing set to go, the versions are listed and nothing waits", () => {
  const settled = versionStandingOf(
    versions({ n: 2, list: [V2, V1] }),
    [post({ status: "published" })],
    "file-v2",
    when,
  );
  assert.equal(settled.ver, "Version 2 · a new cut");
  assert.equal(settled.pill, null);
  assert.equal(settled.lead, null);
  assert.deepEqual(
    settled.list.map((v) => v.instead),
    [false, false],
  );
});

test("version 2 that could not be made leaves version 1 going as approved, with Try again", () => {
  const reel = post({ scheduled_for: ahead(HOUR) });
  const failed = versionStandingOf(versions({ failed: true }), [reel], "file-v1", when);
  assert.equal(failed.ver, "Version 2 couldn't be made this time");
  assert.equal(failed.under, `Version 1 still goes up ${when(reel.scheduled_for)}, as you approved it.`);
  assert.deepEqual(failed.lead, { words: "Try again", is: "again" });
  assert.equal(failed.pill, null);
});

test("version 2 that could not be made and says something else leaves version 1 waiting for its owner, never going up in its place", () => {
  const reel = post({ scheduled_for: ahead(HOUR) });
  const failed = versionStandingOf(versions({ failed: true, says_other: true }), [reel], "file-v1", when);
  assert.equal(failed.ver, "Version 2 couldn't be made this time");
  assert.equal(
    failed.under,
    `Version 1 says something else, so it waits for you before it goes up ${when(reel.scheduled_for)}.`,
  );
  assert.deepEqual(failed.lead, { words: "Try again", is: "again" });
  // One that only looked different says what it always said.
  const look = versionStandingOf(versions({ failed: true, says_other: false }), [reel], "file-v1", when);
  assert.equal(look.under, `Version 1 still goes up ${when(reel.scheduled_for)}, as you approved it.`);
});

test("a version says something else by its words, never by its look", () => {
  const plan = (over = {}) =>
    piecePlanOf({
      blocks: [
        { is: "clip", file_id: "c1", from: 0, to: 4, label: "Before" },
        { is: "clip", file_id: "c2", from: 1, to: 5 },
      ],
      lines: ["The finish"],
      end_line: "Book yours",
      caption: "Forty-five minutes, one round brush.",
      ...over,
    });
  const stands = plan();
  // Its look: a new cut, a new order, where the words sit and how long they stay.
  const cut = plan({
    blocks: [
      { is: "clip", file_id: "c1", from: 1, to: 3, label: "Before" },
      { is: "clip", file_id: "c2", from: 1, to: 5 },
    ],
  });
  const reordered = plan({
    blocks: [
      { is: "clip", file_id: "c2", from: 1, to: 5 },
      { is: "clip", file_id: "c1", from: 0, to: 4, label: "Before" },
    ],
  });
  for (const [name, other] of [
    ["the same plan", plan()],
    ["a new cut", cut],
    ["a new order", reordered],
    ["where the words sit", plan({ words_at: "top" })],
    ["how long they stay", plan({ words_hold: "all" })],
  ])
    assert.equal(versionSaysOther(stands, other), false, name);
  // Its words: under it, on it, its end line, a block's own, their language.
  for (const [name, other] of [
    ["the words under it", plan({ caption: "Half price this week." })],
    ["its opening words", plan({ lines: ["Half price"] })],
    ["its end line", plan({ end_line: "Call today" })],
    [
      "a block's own words",
      plan({
        blocks: [
          { is: "clip", file_id: "c1", from: 0, to: 4, label: "After" },
          { is: "clip", file_id: "c2", from: 1, to: 5 },
        ],
      }),
    ],
    ["its language", plan({ language: "es" })],
  ])
    assert.equal(versionSaysOther(stands, other), true, name);
});

test("what moved between two versions is what its line says", () => {
  const before = piecePlanOf({
    blocks: [
      { is: "clip", file_id: "c1", from: 0, to: 4 },
      { is: "clip", file_id: "c2", from: 1, to: 5 },
    ],
    lines: ["The finish"],
  });
  const shorter = piecePlanOf({
    blocks: [
      { is: "clip", file_id: "c1", from: 1, to: 4 },
      { is: "clip", file_id: "c2", from: 1, to: 5 },
    ],
    lines: ["The finish"],
  });
  assert.deepEqual(revisionChangesOf(before, shorter), ["trim"]);
  const asks = versionStandingOf(
    versions({ n: 2, list: [{ ...V2, changed: revisionChangesOf(before, shorter) }, V1] }),
    [],
    "file-v2",
    when,
  );
  assert.equal(asks.ver, "Version 2 · a new cut");
});
