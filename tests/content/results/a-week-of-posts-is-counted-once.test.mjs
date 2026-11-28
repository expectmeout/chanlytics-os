/**
 * The week's line and Reports' content section (the content loop PRD's 9.3, Appendix A.8; the canvas, Today cell 4):
 * posts up, reached as the places report it, conversations (people who wrote about a post), booked from a post and it
 * helped; and the total, where a booking an ad and a post both touched is counted once and lists both, new people and
 * known ones apart, kept, missed and cancelled apart. Views are never added together. What each booking is put down to
 * is the one rule's answer (the database's booking_sources, 00732: proved on a real database by
 * a-booking-is-put-down-to-one-source.db.test.mjs); here is what a week's posts make of that answer.
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
/** A booking as the rule answers it: made `days` in, with what it is put down to, its main source first. */
const booking = (id, contact, days, sources, over = {}) => ({
  appointment_id: id,
  contact_id: contact,
  status: "booked",
  made_at: at(days),
  starts_at: at(days + 2),
  sources: sources.map(([subject, standing, tied = false], index) => ({
    type: subject.type,
    id: subject.id,
    ref: null,
    at: at(days - 1 + index / 10),
    standing,
    tied,
  })),
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
  // Ana and Dana booked in the conversation the reel opened. Rosa booked in the ad's; the picture she answered first
  // helped. Lucía's visit was first read from a calendar, with no moment it was made: the rule answers nothing for it.
  bookings: [
    booking("v-ana", "ana", 1, [[REEL, "main", true]]),
    booking("v-dana", "dana", 2, [[REEL, "main", true]], { status: "kept" }),
    booking("v-rosa", "rosa", 3, [
      [AD, "main", true],
      [PIC, "helped"],
    ]),
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

test("the total counts each booking once and lists what touched it, its main source first", () => {
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

test("a booking no post was on the way to is none of content's, and one an unnamed ad touched still lists the ad", () => {
  const FORM = { type: "form", id: "form-1" };
  const totals = contentTotalsOf({
    ...world,
    bookings: [
      ...world.bookings,
      // An ad and a form, no post: Ads' and Forms' to count, never content's.
      booking("v-else", "noor", 3, [
        [AD, "main"],
        [FORM, "helped"],
      ]),
      // The picture first, then an ad Chanlytics holds no record of: named by its reference at its platform.
      {
        ...booking("v-ines", "ines", 3, [[PIC, "main"]]),
        sources: [
          { type: "post", id: "pic", ref: null, at: at(1), standing: "main", tied: false },
          { type: "ad", id: null, ref: "meta:999", at: at(2), standing: "helped", tied: false },
        ],
      },
    ],
  });
  assert.equal(totals.bookings.length, 4, "the three, and Inés's");
  assert.equal(totals.direct, 3, "Inés's is the picture's: nothing else came first");
  assert.deepEqual(totals.bookings.find((b) => b.visitId === "v-ines").touched, [
    { type: "post", id: "pic", class: "direct" },
    { type: "ad", id: "meta:999", class: "assisted" },
  ]);
});

test("the week's line, as Today's weekly card says it", () => {
  const said = contentWeekSaid(contentWeekOf(contentTotalsOf(world), 7));
  assert.equal(said.title, "Your posts brought 4 conversations last week.");
  assert.equal(said.line, "3 up · 2,140 reached · 2 booked from a post · 1 it helped");
});

test("a week with no post up has no line, and one with posts and no conversation says so", () => {
  assert.equal(contentWeekSaid(contentWeekOf(contentTotalsOf({ posts: [], touches: [], bookings: [] }), 7)), null);
  const quiet = contentWeekSaid(
    contentWeekOf(contentTotalsOf({ posts: [{ post_id: "pic", reach: 12 }], touches: [], bookings: [] }), 7),
  );
  assert.equal(quiet.title, "Your posts went up last week.");
  assert.equal(quiet.line, "1 up · 12 reached");
});
