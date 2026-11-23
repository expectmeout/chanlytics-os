/**
 * Reports › Content, as the lens says it (00692; the journey canvas's Results board, cells 12 and 13): one sentence of
 * what the window's posts brought, four figures (a reach no place gave said as not given, never 0), every booking
 * counted once by its state in the workspace's own word for one, new people and known apart, what "it helped" means, and
 * each post's own line. A window with nothing posted says so, and draws no row of zeros.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { contentReportSaid } = await import("../../../apps/dashboard/src/surfaces/reports/lenses/content/words.ts");

const report = (over = {}) => ({
  days: 30,
  posts_up: 3,
  reached: 4160,
  conversations: 7,
  direct: 2,
  assisted: 1,
  total: 3,
  by_status: { booked: 2, kept: 1, missed: 0, cancelled: 0 },
  people: { new: 2, known: 1 },
  with_an_ad: 1,
  by_post: [
    { post_id: "p1", title: "The finish", kind: "reel", reached: 2140, conversations: 4, direct: 2, assisted: 1 },
    { post_id: "p2", title: null, kind: "story", reached: null, conversations: 0, direct: 0, assisted: 0 },
  ],
  ...over,
});

test("the sentence and the four figures, in the workspace's word for a booking", () => {
  const said = contentReportSaid(report(), "visit");
  assert.equal(said.empty, false);
  assert.equal(said.head, "Your posts brought 7 conversations and 3 visits.");
  assert.deepEqual(
    said.figures.map((f) => [f.id, f.value, f.meta]),
    [
      ["posts_up", "3", "1 reel · 1 story"],
      ["reached", "4,160", "as Instagram counts it"],
      ["conversations", "7", "people who wrote about a post"],
      ["booked", "3", "2 from a post · 1 it helped"],
    ],
  );
});

test("every booking once by its state, new and known apart, and what the counts mean", () => {
  const said = contentReportSaid(report(), "appointment");
  assert.equal(said.counted.title, "Every appointment, counted once");
  assert.deepEqual(said.counted.lines, [
    "3 appointments · 2 booked · 1 kept · 0 missed · 0 cancelled",
    "New to you · 2 · People you knew · 1",
  ]);
  assert.match(said.fine, /^1 was touched by an ad too: in Ads' count and here, and once in this total\./);
  assert.match(said.fine, /"It helped" counts a reply or a comment in the 14 days before someone booked another way\./);
  assert.doesNotMatch(said.fine, /\ba appointment\b/, "no article written for one word and read with another");
});

test("each post's own line; a reach no place gave is said, never 0", () => {
  const said = contentReportSaid(report(), "visit");
  assert.deepEqual(said.byPost.rows, [
    {
      id: "p1",
      name: "The finish · reel",
      line: "2,140 reached · 4 conversations · 2 booked from this post · 1 it helped",
    },
    { id: "p2", name: "A post · story", line: "Reach not given" },
  ]);
  const unknown = contentReportSaid(report({ reached: null }), "visit");
  assert.equal(unknown.figures.find((f) => f.id === "reached").value, "Not given");
});

test("a window with nothing posted says so, with no row of zeros", () => {
  const said = contentReportSaid(report({ posts_up: 0, by_post: [] }), "visit");
  assert.deepEqual(said, {
    empty: true,
    title: "Nothing posted in these days.",
    body: "Once a post is up, what it brought shows here.",
  });
});
