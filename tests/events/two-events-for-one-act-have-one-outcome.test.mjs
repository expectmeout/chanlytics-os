/**
 * Two event rows for one act have one outcome, and events that arrive out of order end in the right state (the plan
 * "Prove it works", lane 7, item 3; guarantees 4 and 5).
 *
 * Every subscriber may see one delivery twice and leaves the same rows (the harness in
 * an-event-is-delivered-to-its-subscriber.test.mjs runs each twice). That holds one EVENT to one outcome. It does not
 * hold one ACT to one outcome where the act wrote two events: a writer moved between two deploys wrote its event from
 * both sides for the minutes between them (00722), and a retried door can do the same. Most subscribers are once by the
 * act itself (a lead stamped once, a batch once per appointment, a row claimed). Four told the owner by the event's own
 * id alone: a hold, a booking cancelled or moved, a booking that arrived, a teammate who left. Two rows, two bells, two
 * emails.
 *
 * Those four now ask first whether the same news about the same thing was already told for another event, since a
 * minute before this one (packages/db wasSameNewsTold): the words the bell shows are the act. News that says something
 * else (a hold's new reason, a booking moved to another time, another teammate) is told as its own.
 *
 * The real subscribers (core SUBSCRIBERS) and the real readers of what was told (packages/db), over a database in
 * memory; the facts a subscriber reads are handed in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SUBSCRIBERS } from "@chanlytics/core";
import { holdTold, wasEventTold, wasNoticeKept, wasSameNewsTold } from "@chanlytics/db/notices";
import { fakeDb } from "../_fake-db.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONV = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const AT = "2026-10-06T00:00:00Z";
const id = (n) => `e${n}e${n}e${n}e${n}-e${n}e${n}-4e${n}e-8e${n}e-e${n}e${n}e${n}e${n}e${n}e${n}`;

/** A world as a subscriber meets it: the bell's rows in a database in memory, and the facts it reads handed in. */
function world(facts = {}) {
  const tables = { notifications: [] };
  const db = fakeDb(tables);
  let clock = Date.parse(AT) + 2000;
  const never = (name) => () => {
    throw new Error(`this subscriber was not expected to ask ${name}`);
  };
  const state = { hold: facts.hold ?? null, booked: facts.booked ?? [], cancelled: facts.cancelled ?? [] };
  const ports = {
    holdFacts: async () => state.hold,
    holdTold: (tenantId, p) => holdTold(db, { tenantId, ...p }),
    eventTold: (tenantId, eventId) => wasEventTold(db, { tenantId, eventId }),
    sameNewsTold: (tenantId, p) => wasSameNewsTold(db, { tenantId, ...p }),
    memberTold: (tenantId, invitationId) =>
      wasNoticeKept(db, { tenantId, kind: "member_joined", subjectType: "invitation", subjectId: invitationId }),
    bookedVisits: async (_tenant, ids, _now, status = "booked") =>
      (status === "cancelled" ? state.cancelled : state.booked).filter((v) => ids.includes(v.id)),
    feedAdditionsWith: async () => [],
    twinTold: async () => false,
    memberEmail: async (userId) => `${userId}@example.com`,
    freedTimeFacts: async () => null,
    lapsedRequest: never("lapsedRequest"),
    // The workspace told as the edge tells it (lib/shared/alerts/notify.ts): the bell's row, keeping the event it answers.
    tell: async (news) => {
      clock += 1000;
      const kept = await db.from("notifications").insert({
        tenant_id: T,
        kind: news.kind,
        title: news.subject.slice(0, 200),
        body: news.body.slice(0, 4000),
        route: news.route,
        subject_type: news.about?.type ?? null,
        subject_id: news.about?.id ?? null,
        source_event: news.sourceEvent ?? null,
        created_at: new Date(clock).toISOString(),
      });
      if (kept.error) throw new Error(kept.error.message);
    },
  };
  return { tables, ports, state, bell: () => tables.notifications.map((n) => n.title) };
}

const event = (n, over) => ({ id: id(n), tenant_id: T, created_at: AT, data: {}, ...over });
const aHold = (reason) => ({
  conversationId: CONV,
  reason,
  details: null,
  who: "Rosa Diaz",
  address: "+13055550142",
  channel: "whatsapp",
  customerWords: "Can I move my appointment?",
  replyWords: null,
  pausedHours: null,
  erased: false,
});
const opened = (n, reason) =>
  event(n, { kind: "escalation.opened", subject_type: "conversation", subject_id: CONV, data: { reason } });
const aVisit = (start) => ({
  id: APPT,
  start,
  end: new Date(Date.parse(start) + 3_600_000).toISOString(),
  allDay: false,
  timezone: "America/New_York",
  who: "Rosa Diaz",
  service: "Gel manicure",
  via: "booking_email",
});
const changed = (n, change, more = {}) =>
  event(n, {
    kind: "appointment.changed",
    subject_type: "appointment",
    subject_id: APPT,
    data: { change, source: "booking_email", by: "service", ...more },
  });

/* ------------------------------------------------------------------------------- two events for one act -- */

test("a hold: two events for one thread handed to a person, for one reason, ring once", async () => {
  const w = world({ hold: aHold("rate_cap") });
  await SUBSCRIBERS.owner_notice(opened(1, "rate_cap"), w.ports);
  await SUBSCRIBERS.owner_notice(opened(2, "rate_cap"), w.ports);
  assert.equal(w.tables.notifications.length, 1, `told once: ${w.bell().join(" | ")}`);
  assert.equal(w.tables.notifications[0].source_event, id(1), "by the first of them");
});

test("a hold that took another reason a moment later is news of its own, and is told", async () => {
  const w = world({ hold: aHold("rate_cap") });
  await SUBSCRIBERS.owner_notice(opened(1, "rate_cap"), w.ports);
  w.state.hold = aHold("send_failed");
  await SUBSCRIBERS.owner_notice(
    event(2, {
      kind: "escalation.changed",
      subject_type: "escalation",
      subject_id: "h0h0",
      data: { to: "send_failed" },
    }),
    w.ports,
  );
  assert.equal(w.tables.notifications.length, 2);
  assert.notEqual(w.tables.notifications[0].title, w.tables.notifications[1].title);
});

test("a booking cancelled by its customer: two events for the one cancellation ring once", async () => {
  const w = world({ cancelled: [aVisit("2999-10-12T15:00:00Z")] });
  await SUBSCRIBERS.visit_notice(changed(1, "cancelled"), w.ports);
  await SUBSCRIBERS.visit_notice(changed(2, "cancelled"), w.ports);
  assert.deepEqual(w.bell(), ["Rosa Diaz cancelled their booking"]);
});

test("a booking moved twice within the minute is two acts: each time is told", async () => {
  const w = world({ booked: [aVisit("2999-10-12T15:00:00Z")] });
  await SUBSCRIBERS.visit_notice(changed(1, "moved"), w.ports);
  w.state.booked = [aVisit("2999-10-13T17:00:00Z")];
  await SUBSCRIBERS.visit_notice(changed(2, "moved"), w.ports);
  assert.equal(w.tables.notifications.length, 2, "the second says another time");
  // And the same move, written twice, is one.
  await SUBSCRIBERS.visit_notice(changed(3, "moved"), w.ports);
  assert.equal(w.tables.notifications.length, 2);
});

test("a booking that arrived: two events for the one visit ring once", async () => {
  const w = world({ booked: [aVisit("2999-10-12T15:00:00Z")] });
  const added = (n) => changed(n, "added", { by: null, starts_at: "2999-10-12T15:00:00Z" });
  await SUBSCRIBERS.visit_notice(added(1), w.ports);
  await SUBSCRIBERS.visit_notice(added(2), w.ports);
  assert.equal(w.tables.notifications.length, 1, w.bell().join(" | "));
});

test("a teammate who left: two events for the one leaving ring once; two teammates leaving are told each", async () => {
  const left = (n, by) => event(n, { kind: "member.left", data: { by, how: "left", had_role: "operator" } });
  const w = world();
  await SUBSCRIBERS.team_notice(left(1, "ada"), w.ports);
  await SUBSCRIBERS.team_notice(left(2, "ada"), w.ports);
  assert.equal(w.tables.notifications.length, 1);
  await SUBSCRIBERS.team_notice(left(3, "grace"), w.ports);
  assert.equal(w.tables.notifications.length, 2, "another person is other news");
});

test("the same news an hour apart is two acts: only what was told since a minute before the event is the same telling", async () => {
  const w = world({ cancelled: [aVisit("2999-10-12T15:00:00Z")] });
  await SUBSCRIBERS.visit_notice(changed(1, "cancelled"), w.ports);
  // Booked again and cancelled again an hour on: its own event, long after the first was told.
  await SUBSCRIBERS.visit_notice({ ...changed(2, "cancelled"), created_at: "2026-10-06T01:00:00Z" }, w.ports);
  assert.equal(w.tables.notifications.length, 2, "the first notice is before this event's minute: told again");
});

/* ------------------------------------------------------------------------------------------ one event twice -- */

test("one event delivered twice is told once, as before: the notice keeps the event it answers", async () => {
  const w = world({ hold: aHold("rate_cap") });
  await SUBSCRIBERS.owner_notice(opened(1, "rate_cap"), w.ports);
  await SUBSCRIBERS.owner_notice(opened(1, "rate_cap"), w.ports);
  assert.equal(w.tables.notifications.length, 1);
});

/* ------------------------------------------------------------------------------------------- out of order -- */

test("out of order, a hold: the change is delivered before the opening, and the owner is told once, as the hold stands", async () => {
  // The record first: opened for one reason, then changed to another. The deliveries arrive the other way round.
  const w = world({ hold: aHold("send_failed") });
  const change = event(2, {
    kind: "escalation.changed",
    subject_type: "escalation",
    subject_id: "h0h0",
    data: { to: "send_failed" },
  });
  await SUBSCRIBERS.owner_notice(change, w.ports);
  await SUBSCRIBERS.owner_notice(opened(1, "rate_cap"), w.ports);
  assert.equal(w.tables.notifications.length, 1, "the opening's reason is no longer the hold's: it tells nothing");
  assert.equal(w.tables.notifications[0].source_event, id(2));
});

test("out of order, a booking: its cancellation is delivered before its arrival, and the owner hears only that it was cancelled", async () => {
  // The record as it stands when either runs: the visit is cancelled, so it is not among the booked.
  const w = world({ cancelled: [aVisit("2999-10-12T15:00:00Z")], booked: [] });
  await SUBSCRIBERS.visit_notice(changed(2, "cancelled"), w.ports);
  await SUBSCRIBERS.visit_notice(changed(1, "added", { by: null, starts_at: "2999-10-12T15:00:00Z" }), w.ports);
  assert.deepEqual(w.bell(), ["Rosa Diaz cancelled their booking"], "a booking that is gone is not told as arriving");
});

test("out of order, a visit's arrival stamp: the later moment wins whichever delivery runs last", async () => {
  const stamps = [];
  const ports = {
    keepArrival: async (_tenant, appointmentId, at) => {
      // The door's own rule (packages/db stampVisitArrival, proven on a database): the later moment wins.
      const had = stamps.at(-1);
      if (!had || Date.parse(at) > Date.parse(had)) stamps.push(at);
      assert.equal(appointmentId, APPT);
    },
  };
  const arrived = (n, at) => ({
    ...changed(n, "added", { by: null, starts_at: "2999-10-12T15:00:00Z" }),
    created_at: at,
  });
  await SUBSCRIBERS.visit_arrival(arrived(2, "2026-10-06T00:05:00Z"), ports);
  await SUBSCRIBERS.visit_arrival(arrived(1, "2026-10-06T00:00:00Z"), ports);
  assert.equal(stamps.at(-1), "2026-10-06T00:05:00Z");
});
