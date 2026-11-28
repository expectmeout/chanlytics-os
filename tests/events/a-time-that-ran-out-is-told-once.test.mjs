/**
 * A time a customer asked for that ran out with no answer is said on the record as `lapsed`, and its owner is told once
 * (decision 0061, as amended 22 Nov 2026). Here: how the event is read (contracts requestLapsed), what the nudge and
 * the note say and where they open, the subscriber that tells the note (core visit_notice) over fakes for its ports,
 * the kind's place in the tables that say what the bell, the mail and the phone carry, and Activity's line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BELL_LINE_KINDS,
  EMAILED_NOTIFICATION_KINDS,
  SERVER_NOTIFICATION_KINDS,
  VISIT_CHANGES_TOLD,
  activityTone,
  activityWords,
  bookingChanged,
  changeFreesATime,
  isPushKind,
  requestLapsed,
  requestLapsedNews,
  requestNudgeNews,
  serverNotificationRows,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

const { SUBSCRIBERS } = await importSrc("packages/core/src/events/subscribers.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EVENT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SAID = {
  appointmentId: APPT,
  conversationId: CONV,
  who: "Ana Ruiz",
  when: "Sat, Oct 17, 2:00 PM",
  service: "Balayage",
};

const event = (data) => ({
  id: EVENT,
  tenant_id: T,
  kind: "appointment.changed",
  subject_type: "appointment",
  subject_id: APPT,
  created_at: "2026-10-16T11:04:00.000Z",
  data: { change: "lapsed", source: "receptionist", starts_at: "2026-10-17T18:00:00.000Z", by: "service", ...data },
});

test("the record's event says a request ran out, and whether the customer was told", () => {
  assert.deepEqual(requestLapsed(event({ told: true })), { appointmentId: APPT, told: true });
  assert.deepEqual(requestLapsed(event({ told: false })), { appointmentId: APPT, told: false });
  // An event that does not say is not one that told them.
  assert.deepEqual(requestLapsed(event({})), { appointmentId: APPT, told: false });
  assert.equal(requestLapsed(event({ change: "cancelled", told: true })), null);
  assert.equal(requestLapsed({ ...event({ told: true }), kind: "appointment.booked" }), null);
});

test("a request that ran out is no cancellation: no freed time is offered on it, and no tool's cancel is told", () => {
  assert.equal(changeFreesATime("lapsed"), false);
  assert.equal(bookingChanged(event({ told: true })), null);
  assert.ok(VISIT_CHANGES_TOLD.lapsed);
});

test("the owner's one note: who, which time, that AI told them, and it opens the conversation", () => {
  const news = requestLapsedNews(SAID);
  assert.equal(news.kind, "booking_lapsed");
  assert.equal(news.route, `inbox/th-${CONV}`);
  assert.deepEqual(news.about, { type: "conversation", id: CONV });
  assert.equal(news.subject, "Ana Ruiz's time wasn't confirmed");
  // One line, so the bell's row (a note's first line) says both: that AI is telling them, and which time.
  assert.equal(news.body, "AI is letting them know · Sat, Oct 17, 2:00 PM · Balayage");
  assert.doesNotMatch(news.redactedBody, /Ana|Balayage/);
  // Nobody named: it is still said, of a customer.
  assert.equal(requestLapsedNews({ ...SAID, who: null, service: null }).subject, "A customer's time wasn't confirmed");
});

test("the nudge says who is waiting, for what, and when it stops being held, once per request", () => {
  const news = requestNudgeNews(SAID, Date.parse("2026-10-16T11:00:00.000Z"), "America/New_York");
  assert.equal(news.kind, "deadman");
  assert.equal(news.onceKey, `booking_nudge:${APPT}`);
  assert.equal(news.subject, "Ana Ruiz's time stops being held at 7:00 AM");
  assert.match(news.body, /AI tells them it couldn.t be confirmed\./);
});

function ports(over = {}) {
  const told = [];
  return {
    told,
    ports: {
      eventTold: async () => over.eventTold ?? false,
      // No other event of the same act told it (tests/events/two-events-for-one-act-have-one-outcome.test.mjs).
      sameNewsTold: async () => false,
      lapsedRequest: async () => ("said" in over ? over.said : SAID),
      tell: async (news) => {
        told.push(news);
      },
    },
  };
}

test("a request that ran out and was told is told to its owner once, from its event", async () => {
  const w = ports();
  await SUBSCRIBERS.visit_notice(event({ told: true }), w.ports);
  assert.equal(w.told.length, 1);
  assert.equal(w.told[0].kind, "booking_lapsed");
  assert.equal(w.told[0].sourceEvent, EVENT, "the bell keeps the event, so a second delivery tells nobody");
  // A second delivery of the same event finds it told.
  const again = ports({ eventTold: true });
  await SUBSCRIBERS.visit_notice(event({ told: true }), again.ports);
  assert.equal(again.told.length, 0);
});

test("one the customer could not be told of is not this note's: its conversation's hold tells it", async () => {
  const w = ports();
  await SUBSCRIBERS.visit_notice(event({ told: false }), w.ports);
  assert.equal(w.told.length, 0);
});

test("a request the record no longer holds tells nobody", async () => {
  const w = ports({ said: null });
  await SUBSCRIBERS.visit_notice(event({ told: true }), w.ports);
  assert.equal(w.told.length, 0);
});

test("the note is news on the bell alone: no mail, no phone, and it reads as what it is", () => {
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("booking_lapsed"));
  assert.ok(BELL_LINE_KINDS.includes("booking_lapsed"));
  assert.equal(EMAILED_NOTIFICATION_KINDS.includes("booking_lapsed"), false, "no mail");
  assert.equal(isPushKind("booking_lapsed"), false, "no phone");
  const [row] = serverNotificationRows({
    notifications: [
      {
        id: "n1",
        kind: "booking_lapsed",
        title: "Ana Ruiz's time wasn't confirmed",
        body: "Sat, Oct 17, 2:00 PM · Balayage",
        route: `inbox/th-${CONV}`,
        subject_type: "conversation",
        subject_id: CONV,
        created_at: "2026-10-16T11:04:00.000Z",
        read: false,
        dismissed: false,
      },
    ],
    seen_at: null,
  });
  assert.equal(row.to, `inbox/th-${CONV}`);
  assert.equal(row.action, "Open the conversation");
});

test("Activity says it in a line, and what became of the customer", () => {
  assert.equal(
    activityWords("appointment.lapsed", { told: true }),
    "A time a customer asked for wasn't confirmed in time · AI tells them",
  );
  assert.equal(
    activityWords("appointment.lapsed", { told: false }),
    "A time a customer asked for wasn't confirmed in time · reply to them",
  );
  assert.equal(activityTone("appointment.lapsed"), "warn");
});
