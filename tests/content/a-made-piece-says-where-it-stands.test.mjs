/**
 * Where a made piece stands on Campaigns › Content, from its posts alone (content/page.ts contentMarkOf), and the words for it.
 * A piece can be up on Google and stuck on Instagram at once: the tile says the one thing that matters most, what needs the
 * owner first, then what is working, then what is done.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_WORDS,
  contentHeadOf,
  contentMakingSaid,
  contentMarkOf,
  contentMarkSaid,
  contentMoving,
} from "@chanlytics/contracts";

/** A post, newest first in the list it is handed in. */
const post = (place, status, over = {}) => ({
  id: `${place}-${status}`,
  place,
  kind: "picture",
  caption: null,
  status,
  held_reason: status === "held" ? "disconnected" : null,
  permalink: null,
  scheduled_for: "2026-11-11T15:00:00Z",
  published_at: status === "published" ? "2026-11-11T15:01:00Z" : null,
  error: null,
  created_at: "2026-11-11T15:00:00Z",
  ...over,
});

test("nothing posted is ready, and a post pulled or taken down leaves it ready", () => {
  assert.deepEqual(contentMarkOf([]), { is: "ready" });
  assert.deepEqual(contentMarkOf([post("instagram", "pulled")]), { is: "ready" });
  assert.deepEqual(contentMarkOf([post("google", "taken_down")]), { is: "ready" });
});

test("only the newest post at each place speaks for it", () => {
  const older = post("instagram", "failed", { id: "old" });
  assert.deepEqual(contentMarkOf([post("instagram", "published"), older]), { is: "posted", places: ["instagram"] });
});

test("what needs the owner outranks what is working, which outranks what is done", () => {
  assert.deepEqual(contentMarkOf([post("instagram", "held"), post("google", "published")]), {
    is: "stuck",
    place: "instagram",
  });
  assert.deepEqual(contentMarkOf([post("instagram", "failed"), post("google", "queued")]), {
    is: "stuck",
    place: "instagram",
  });
  for (const moving of ["queued", "preparing", "publishing", "checking"])
    assert.deepEqual(contentMarkOf([post("instagram", moving), post("google", "published")]), {
      is: "going",
      place: "instagram",
    });
  assert.deepEqual(contentMarkOf([post("instagram", "published"), post("google", "published")]), {
    is: "posted",
    places: ["instagram", "google"],
  });
});

test("each mark is said once, in the owner's words, and a video is never offered a post it cannot make", () => {
  assert.equal(contentMarkSaid({ is: "ready" }, "image"), "Ready to post");
  assert.equal(contentMarkSaid({ is: "ready" }, "video"), "Ready");
  assert.equal(contentMarkSaid({ is: "going", place: "instagram" }, "image"), "On its way to Instagram");
  assert.equal(contentMarkSaid({ is: "going", place: "google" }, "image"), "On its way to Google");
  assert.equal(contentMarkSaid({ is: "posted", places: ["instagram"] }, "image"), "On Instagram");
  assert.equal(contentMarkSaid({ is: "posted", places: ["instagram", "google"] }, "image"), "On Instagram and Google");
  assert.equal(contentMarkSaid({ is: "stuck", place: "instagram" }, "image"), "Not posted. Open it to see why.");
});

test("the head counts what is made and what is out, and says nothing it has not read", () => {
  assert.equal(contentHeadOf({ made: 0, posted: 0 }), "Nothing made yet");
  assert.equal(contentHeadOf({ made: 1, posted: 0 }), "1 piece made · none posted yet");
  assert.equal(contentHeadOf({ made: 12, posted: 3 }), "12 pieces made · 3 posted");
});

/** A video asked for, as the read hands it over. */
const making = (over = {}) => ({
  id: "p-1",
  status: "making",
  stage: "drawing",
  failed_why: null,
  lines: ["Three years", "of layers."],
  language: "en",
  moments: 4,
  created_at: "2026-11-11T15:00:00Z",
  ...over,
});

test("a video being made says its opening words and where it is at, in its own language", () => {
  assert.deepEqual(contentMakingSaid(making()), {
    title: "Three years of layers.",
    state: "Putting it together",
    failed: null,
  });
  assert.equal(contentMakingSaid(making({ stage: "queued" })).state, "Starting");
  assert.equal(contentMakingSaid(making({ language: "es", stage: "queued" })).state, "Empezando");
  assert.equal(contentMakingSaid(making({ lines: [] })).title, CONTENT_WORDS.video);
});

test("one that was not made says so, and why", () => {
  const said = contentMakingSaid(making({ status: "failed", failed_why: "clips" }));
  assert.equal(said.state, "Couldn't make it");
  assert.equal(said.failed, "One of its clips or photos isn't in your Library any more, or can't be used yet.");
});

test("the page asks again only while something is still moving", () => {
  const page = (over) => ({ making: [], made: [], next: null, tally: { made: 0, posted: 0 }, ...over });
  const file = { id: "f-1", kind: "image" };
  assert.equal(contentMoving(page({})), false);
  assert.equal(contentMoving(page({ making: [making()] })), true);
  assert.equal(contentMoving(page({ making: [making({ status: "failed", failed_why: "draw" })] })), false);
  assert.equal(contentMoving(page({ made: [{ file, posts: [post("instagram", "preparing")] }] })), true);
  assert.equal(contentMoving(page({ made: [{ file, posts: [post("instagram", "published")] }] })), false);
});
