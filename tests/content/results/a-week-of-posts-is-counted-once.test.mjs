/**
 * The week's line and Reports' content section (the content loop PRD's 9.3, Appendix A.8; the canvas, Today cell 4):
 * posts up, reached as the places report it, conversations (people who wrote about a post), booked from a post and it
 * helped; and the total, where a booking an ad and a post both touched is counted once and lists both, new people and
 * known ones apart, kept, missed and cancelled apart. Views are never added together.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentTotalsOf, contentWeekOf, contentWeekSaid } from "@chanlytics/contracts";

const DAY = 86_400_000;
const T0 = Date.parse("2026-11-30T15:00:00Z");
const at = (days) => new Date(T0 + days * DAY).toISOString();
const touch = (subject, contact, days, over = {}) => ({
  id: `${subject.id}-${contact}-${days}`,
  home: subject.type === "ad" ? "ad_entries" : "touches",
  kind: subject.type === "ad" ? "ad_message" : "reply",
  subject,
  contact_id: contact,
  conversation_id: null,
  message_id: null,
  new_person: false,
  at: at(days),
  said: null,
  ...over,
});
const visit = (id, contact, days, over = {}) => ({
  id,
  contact_id: contact,
  status: "booked",
  source: "receptionist",
  created_at: at(days),
  through_type: null,
  through_id: null,
  starts_at: at(days + 2),
  service: null,
  ...over,
});
const REEL = { type: "post", id: "reel" };
const PIC = { type: "post", id: "pic" };
const AD = { type: "ad", id: "ad-1" };

const world = {
  posts: [
    { post_id: "reel", reach: 2000 },
    { post_id: "pic", reach: 140 },
    { post_id: "story", reach: null },
  ],
  touches: [
    touch(REEL, "ana", 0, { new_person: true }),
    touch(REEL, "dana", 1, { new_person: true, kind: "coded_message" }),
    touch(PIC, "rosa", 1),
    touch(AD, "rosa", 2),
    touch(REEL, "lucia", 2, { kind: "comment" }),
  ],
  visits: [
    visit("v-ana", "ana", 1, { through_type: "post", through_id: "reel" }),
    visit("v-dana", "dana", 2, { through_type: "post", through_id: "reel", status: "kept" }),
    visit("v-rosa", "rosa", 3, { through_type: "ad", through_id: "ad-1", source: "receptionist" }),
    visit("v-old", "ana", -20, { source: "person" }),
    visit("v-feed", "lucia", 3, { source: "calendar_feed" }),
  ],
};

test("posts up, reached, conversations, from a post and it helped, each said for what it counts", () => {
  const totals = contentTotalsOf(world);
  assert.equal(totals.postsUp, 3);
  assert.equal(totals.reached, 2140, "the places' own reach, added post by post; a story with none adds nothing");
  assert.equal(totals.conversations, 4, "people who wrote about a post, once each");
  assert.equal(totals.direct, 2, "Ana and Dana booked from the reel");
  assert.equal(totals.assisted, 1, "Rosa booked from the ad; the picture helped");
});

test("the total counts each booking once and lists what touched it; a calendar's copy is none of it", () => {
  const totals = contentTotalsOf(world);
  assert.equal(totals.bookings.length, 3);
  const rosa = totals.bookings.find((b) => b.visitId === "v-rosa");
  assert.deepEqual(rosa.touched, [
    { type: "ad", id: "ad-1", class: "direct" },
    { type: "post", id: "pic", class: "assisted" },
  ]);
  assert.deepEqual(totals.byStatus, { booked: 2, kept: 1, missed: 0, cancelled: 0 });
  assert.deepEqual(totals.people, { new: 2, known: 1 });
});

test("the week's line, as Today's weekly card says it", () => {
  const said = contentWeekSaid(contentWeekOf(contentTotalsOf(world), 7));
  assert.equal(said.title, "Your posts brought 4 conversations last week.");
  assert.equal(said.line, "3 up · 2,140 reached · 2 booked from a post · 1 it helped");
});

test("a week with no post up has no line, and one with posts and no conversation says so", () => {
  assert.equal(contentWeekSaid(contentWeekOf(contentTotalsOf({ posts: [], touches: [], visits: [] }), 7)), null);
  const quiet = contentWeekSaid(
    contentWeekOf(contentTotalsOf({ posts: [{ post_id: "pic", reach: 12 }], touches: [], visits: [] }), 7),
  );
  assert.equal(quiet.title, "Your posts went up last week.");
  assert.equal(quiet.line, "1 up · 12 reached");
});
