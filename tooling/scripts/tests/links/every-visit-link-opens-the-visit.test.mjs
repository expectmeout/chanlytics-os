/**
 * Every link to a visit opens THE VISIT where the link knows which (wiring/records-not-pages, task 1.6; finding D1-visit-open).
 *
 * The person's Coming up and their History row, People's Visits cell and the About row all landed on the Calendar's Day view
 * for the date, and the owner then found the block and clicked it. A visit is named by the id of its row in the record (the one
 * the board's panel carries: CalendarBlockVM.visit.id), which the record's join to the feed now lays on each visit (feedWithRecord:
 * FeedItem.recordId, Visit.recordId, VisitDto.record_id), and the link is contracts' visitRoute with the visit's day in the
 * business's zone. A visit the record has no row for yet (an event the hourly sync has not kept) is still a link to its day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allVisitsIn,
  feedMarksOf,
  feedWithRecord,
  indexFeed,
  toPersonRowVM,
  toPersonVM,
  toVisitDto,
  visitDoor,
  visitsIn,
} from "@chanlytics/contracts";
import { personDto } from "../consent/_person-row.mjs";

const H = 3_600_000;
const D = 24 * H;
const NOW = Date.parse("2026-10-11T15:00:00Z");
const TZ = "America/New_York";
const NO_OWN = new Set();
const CAL = "+13055550133";
const PERSON = { id: "p", name: "", phone: CAL, email: null };

const event = (uid, start, title = "Colour") => ({
  uid,
  start,
  end: start + H,
  title,
  allDay: false,
  description: CAL,
  location: null,
  attendees: [],
  organizer: null,
});
const booking = (id, start, status = "booked") => ({
  id,
  tool: "booksy",
  status,
  starts_at: new Date(start).toISOString(),
  ends_at: new Date(start + H).toISOString(),
  all_day: false,
  title: null,
  service: "Balayage",
  staff: null,
  price: null,
  note: null,
  client_name: "Cal",
  client_phone: CAL,
  client_email: null,
  contact_id: null,
});

test("the record's join lays each visit's row id on it: a feed event's by its key, a booking's by its own", () => {
  const items = [event("kept", NOW - 3 * D), event("ahead", NOW + 2 * D), event("unsynced", NOW + 4 * D)];
  const record = {
    noted: [booking("rb1", NOW + 6 * D)],
    marks: feedMarksOf([
      { id: "r-kept", status: "kept", external_id: "kept", starts_at: new Date(NOW - 3 * D).toISOString() },
      { id: "r-ahead", status: "booked", external_id: "ahead", starts_at: new Date(NOW + 2 * D).toISOString() },
    ]),
  };
  const joined = feedWithRecord(items, record, NO_OWN);
  assert.deepEqual(
    joined.map((it) => [it.uid, it.recordId ?? null]),
    [
      ["kept", "r-kept"],
      ["ahead", "r-ahead"],
      ["unsynced", null],
      ["appt:rb1", "rb1"],
    ],
    "an event the sync has not kept has no row to name",
  );
  const all = allVisitsIn(indexFeed(joined, NO_OWN), PERSON);
  assert.deepEqual(
    all.map((v) => v.recordId ?? null),
    ["r-kept", "r-ahead", null, "rb1"],
  );
  const dtos = all.map((v) => toVisitDto(v));
  assert.deepEqual(
    dtos.map((v) => v.record_id ?? null),
    ["r-kept", "r-ahead", null, "rb1"],
    "on the wire as record_id, absent where there is none",
  );
  assert.ok(!("record_id" in dtos[2]), "never a null the older readers would trip on");
  const near = visitsIn(indexFeed(joined, NO_OWN), PERSON, NOW);
  assert.equal(near.next?.recordId, "r-ahead");
  assert.equal(near.last?.recordId, "r-kept");
});

test("a visit door is the visit's own address when its row is known, else its day", () => {
  assert.equal(visitDoor("2026-10-13", "r-ahead"), "calendar/2026-10-13:a-r-ahead");
  assert.equal(visitDoor("2026-10-13", null), "calendar/2026-10-13");
  assert.equal(visitDoor("2026-10-13", undefined), "calendar/2026-10-13");
});

const PERSON_ROW = personDto({ id: "p-cal", display_name: "Cal Jones", phone_e164: CAL });
const DTO = (over) => ({
  id: "x",
  start: "2026-10-13T18:00:00.000Z",
  end: "2026-10-13T19:00:00.000Z",
  title: "Colour",
  all_day: false,
  via: "phone",
  ...over,
});

test("a person's page links each visit: Coming up, their History row and the Next visit fact open the visit; one with no row opens its day", () => {
  const ahead = DTO({ id: "a:1", record_id: "r-ahead" });
  const unsynced = DTO({
    id: "b:1",
    start: "2026-10-16T18:00:00.000Z",
    end: "2026-10-16T19:00:00.000Z",
  });
  const past = DTO({
    id: "c:1",
    start: "2026-10-01T18:00:00.000Z",
    end: "2026-10-01T19:00:00.000Z",
    record_id: "r-past",
    said: "kept",
  });
  const detail = {
    row: { ...PERSON_ROW, visits: { timezone: TZ, source: "Google Calendar", state: "ok", next: ahead, last: past } },
    identities: [],
    conversations: [],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    visits: {
      timezone: TZ,
      source: "Google Calendar",
      state: "ok",
      next: ahead,
      last: past,
      all: [past, ahead, unsynced],
    },
  };
  const vm = toPersonVM(detail, TZ, new Date(NOW));
  assert.deepEqual(
    vm.comingUp.map((c) => c.to),
    ["calendar/2026-10-13:a-r-ahead", "calendar/2026-10-16"],
    "Coming up: the visit when its row is known, its day when it is not",
  );
  const links = vm.timeline.filter((t) => t.kind === "visit").map((t) => [t.link.label, t.link.to]);
  assert.deepEqual(links, [
    ["Open the day", "calendar/2026-10-16"],
    ["Open the appointment", "calendar/2026-10-13:a-r-ahead"],
    ["Open the appointment", "calendar/2026-10-01:a-r-past"],
  ]);
  assert.equal(vm.nextVisitDate, "2026-10-13");
  assert.equal(vm.nextVisitId, "r-ahead");
  assert.equal(vm.lastVisitId, "r-past");
});

test("a People row carries the visit's row id beside its day, for the Visits cell", () => {
  const ahead = DTO({ record_id: "r-ahead" });
  const row = toPersonRowVM(
    personDto({ visits: { timezone: TZ, source: "Google Calendar", state: "ok", next: ahead, last: null } }),
    TZ,
    new Date(NOW),
    null,
    null,
  );
  assert.equal(row.nextVisitDate, "2026-10-13");
  assert.equal(row.nextVisitId, "r-ahead");
  assert.equal(row.lastVisitId, null);
  const none = toPersonRowVM(personDto(), TZ, new Date(NOW), null, null);
  assert.deepEqual([none.nextVisitId, none.lastVisitId], [null, null]);
});
