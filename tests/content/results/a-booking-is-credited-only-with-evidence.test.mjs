/**
 * What a booking is put down to (the content loop PRD's 9.3 and Appendix A.6, A.7; its 15.1 cases): one rule for a
 * post, an ad and a form, worked out when read. "From this post" only where the visit recorded that it answered the
 * post and was made after the touch; "it helped" for any other touch of the same person in the 14 days before it was
 * made; nothing for a visit whose making is not known, one only proposed, or one cancelled.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CREDIT_WINDOW_DAYS, creditFor, creditOf, madeAtOf } from "@chanlytics/contracts";

const DAY = 86_400_000;
const T0 = Date.parse("2026-12-01T15:00:00Z");
const at = (days, hours = 0) => new Date(T0 + days * DAY + hours * 3_600_000).toISOString();
const ANA = "contact-ana";
const REEL = { type: "post", id: "post-reel" };
const STORY = { type: "post", id: "post-story" };
const AD = { type: "ad", id: "ad-1" };

const touch = (subject, when, over = {}) => ({
  subject,
  contact_id: ANA,
  at: when,
  kind: "reply",
  new_person: false,
  ...over,
});
const visit = (over = {}) => ({
  id: "visit-1",
  contact_id: ANA,
  status: "booked",
  source: "receptionist",
  created_at: at(1),
  through_type: null,
  through_id: null,
  ...over,
});

test("a visit AI asked for while answering a story reply, then confirmed, is from that story", () => {
  const booking = visit({ through_type: "post", through_id: STORY.id, created_at: at(0, 2) });
  const credit = creditOf(booking, [touch(STORY, at(0), { kind: "story_reply" })]);
  assert.deepEqual(credit.direct, STORY);
  assert.deepEqual(credit.assisted, []);
  assert.equal(creditFor(STORY, credit), "direct");
});

test("a time asked for but not yet confirmed, or answered Can't, is credited with nothing", () => {
  const asked = { through_type: "post", through_id: STORY.id, created_at: at(0, 2) };
  for (const status of ["proposed", "cancelled"]) {
    const credit = creditOf(visit({ ...asked, status }), [touch(STORY, at(0))]);
    assert.equal(credit.direct, null, status);
    assert.deepEqual(credit.assisted, [], status);
    assert.equal(creditFor(STORY, credit), "none", status);
  }
});

test("the same person booking by phone after replying is it helped, never from this post", () => {
  const credit = creditOf(visit({ source: "person", created_at: at(2) }), [touch(REEL, at(0))]);
  assert.equal(credit.direct, null);
  assert.deepEqual(credit.assisted, [REEL]);
  assert.equal(creditFor(REEL, credit), "assisted");
});

test("a regular who replied to a story ten days ago and books about something else today is not from that story", () => {
  const credit = creditOf(visit({ created_at: at(10) }), [touch(STORY, at(0), { kind: "story_reply" })]);
  assert.equal(creditFor(STORY, credit), "assisted");
});

test("a touch more than 14 days before the visit was made counts for nothing", () => {
  assert.equal(CREDIT_WINDOW_DAYS, 14);
  const credit = creditOf(visit({ created_at: at(15) }), [touch(REEL, at(0))]);
  assert.equal(creditFor(REEL, credit), "none");
});

test("booked elsewhere on Monday, an ad's message on Tuesday, read in on Wednesday: nothing is credited", () => {
  const readIn = visit({ source: "calendar_feed", created_at: at(2) });
  assert.equal(madeAtOf(readIn), null, "a calendar's copy says when Chanlytics saw it, not when it was made");
  const credit = creditOf(readIn, [touch(AD, at(1))]);
  assert.equal(credit.direct, null);
  assert.deepEqual(credit.assisted, []);
});

test("a visit made before the touch is not put down to it", () => {
  const credit = creditOf(visit({ source: "person", created_at: at(0) }), [touch(REEL, at(1))]);
  assert.equal(creditFor(REEL, credit), "none");
});

test("an ad and a post both touching one booking: it is from one at most, and both are listed", () => {
  const booking = visit({ through_type: "ad", through_id: AD.id, created_at: at(1) });
  const credit = creditOf(booking, [touch(REEL, at(0)), touch(AD, at(0, 20)), touch(REEL, at(0, 5))]);
  assert.deepEqual(credit.direct, AD);
  assert.deepEqual(credit.assisted, [REEL], "the reel once, however many times it was touched");
  assert.equal(creditFor(REEL, credit), "assisted");
  assert.equal(creditFor(AD, credit), "direct");
});

test("a visit that answered a post whose touch is not this person's own counts nothing for it", () => {
  const booking = visit({ through_type: "post", through_id: REEL.id });
  const credit = creditOf(booking, [touch(REEL, at(0), { contact_id: "contact-someone-else" })]);
  assert.equal(credit.direct, null);
  assert.deepEqual(credit.assisted, []);
});

test("a missed or kept visit is still what the post brought, counted under its own state", () => {
  for (const status of ["kept", "missed"]) {
    const credit = creditOf(visit({ status, through_type: "post", through_id: REEL.id }), [touch(REEL, at(0))]);
    assert.equal(creditFor(REEL, credit), "direct", status);
  }
});

test("when a visit was made: asked for here, or added by a member, is its own row's time; any outside copy is not known", () => {
  assert.equal(madeAtOf(visit({ source: "receptionist" })), at(1));
  assert.equal(madeAtOf(visit({ source: "person" })), at(1));
  for (const source of ["calendar_feed", "booking_email", "booking_tool"])
    assert.equal(madeAtOf(visit({ source })), null, source);
});
