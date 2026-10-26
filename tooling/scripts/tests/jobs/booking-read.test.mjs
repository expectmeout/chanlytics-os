/**
 * booking_read, the job (packages/jobs/src/booking-read.ts), run through the dispatcher over a database in memory: what
 * is left of a delivery when its read cannot finish. The verb's own rules are notice-read.test.mjs's; these are the
 * handler's, where a throw meets the ledger.
 *
 * A read that threw used to fail the job at the first throw (the kind had no wait to be tried again after), and a
 * failed job was all there was of the delivery: nothing on the notices ledger, so nothing in the fold, and a booking
 * the owner was never shown. Now a throw is the next try's, twice, and the last try holds the notice for a person and
 * rings the bell once (the wiring's second audit, S6-7): the booking reached no calendar, and nothing reads it again by
 * itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";
import { dispatchJob } from "../../../../packages/jobs/src/handlers.ts";
import { MAX_ATTEMPTS, RETRY_WAITS_MS } from "../../../../packages/jobs/src/ledger.ts";

const T = "11111111-1111-4111-8111-111111111111";
const DELIVERY = {
  id: "rcv_1",
  from: { address: "no-reply@booksy.com", name: "Booksy" },
  subject: "Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
  text: "Dana Rivera\n(305) 555-0144\nThursday, October 8, 2026, 3:00 PM - 5:00 PM\nHair Color: Partial highlight",
  html: null,
  createdAt: "2026-10-06T15:58:00Z",
};
const answer = (over = {}) => ({
  kind: "booked",
  client_name: "Dana Rivera",
  client_phone: "(305) 555-0144",
  client_email: null,
  service: "Hair Color: Partial highlight",
  staff: null,
  starts_at: "2026-10-08T15:00",
  ends_at: "2026-10-08T17:00",
  previous_starts_at: null,
  price: null,
  note: null,
  ...over,
});

/** One run of the job: the tables it wrote, what the bell was told, and how often the reader was asked. */
function world({ ask = async () => answer(), mayRead = async () => null, faults = {}, tables = {} } = {}) {
  const held = {
    tenants: [{ id: T, timezone: "America/New_York" }],
    appointments: [],
    appointment_notices: [],
    ...tables,
  };
  const told = [];
  let asked = 0;
  const ctx = {
    db: fakeDb(held, faults),
    deadline: Date.now() + 60_000,
    email: { fetch: async () => DELIVERY },
    bookings: {
      ask: async (...args) => {
        asked += 1;
        return ask(...args);
      },
      mayRead,
      personFor: async () => null,
      tell: async (_tenantId, notice) => {
        told.push(notice);
      },
    },
  };
  const run = (attempts) =>
    dispatchJob(ctx, {
      id: "j1",
      tenant_id: T,
      kind: "booking_read",
      payload: { received_id: "rcv_1", tool: "booksy" },
      ...(attempts === undefined ? {} : { attempts }),
    });
  return { run, tables: held, told, asked: () => asked };
}
const down = async () => {
  throw new Error("529 overloaded");
};

/** Wednesday 7 Oct 2026, 3 PM in New York: the time a visit stood at before it moved. */
const WED_3PM = "2026-10-07T19:00:00.000Z";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const OTHER_TOOL = "44444444-4444-4444-8444-444444444444";
const OWN = "55555555-5555-4555-8555-555555555555";
const DOOR = "77777777-7777-4777-8777-777777777777";
/** A visit on the record as its writer leaves it, every column the table has: a Booksy notice's unless it says so. */
const visitRow = (over = {}) => ({
  id: OWN,
  tenant_id: T,
  contact_id: null,
  lead_id: null,
  conversation_id: null,
  source: "booking_email",
  tool: "booksy",
  external_id: `booksy:+13055550144:${Date.parse(WED_3PM)}`,
  status: "booked",
  starts_at: WED_3PM,
  ends_at: "2026-10-07T21:00:00.000Z",
  all_day: false,
  title: null,
  service: "Hair Color: Partial highlight",
  staff: null,
  price: null,
  note: null,
  client_name: "Dana Rivera",
  client_phone: "+13055550144",
  client_email: null,
  consultation: false,
  timezone: "America/New_York",
  vanished_at: null,
  created_by: null,
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
  expires_at: null,
  ...over,
});
/** The receptionist's request for the same client and time (00443 booking_request_open), and another tool's visit. */
const request = visitRow({
  id: REQUEST,
  source: "receptionist",
  tool: null,
  external_id: null,
  status: "proposed",
  conversation_id: "66666666-6666-4666-8666-666666666666",
  expires_at: "2026-10-07T18:00:00.000Z",
});
const otherTool = visitRow({
  id: OTHER_TOOL,
  tool: "vagaro",
  external_id: `vagaro:+13055550144:${Date.parse(WED_3PM)}`,
});
/** The same tool's visit by its own door (booking_tool, decision 0002 step 7): Booksy's word, but no notice's row. */
const door = visitRow({ id: DOOR, source: "booking_tool", external_id: "booksy-door-1" });

test("a read that threw is tried again, and the kind has the waits for it", () => {
  assert.ok(Array.isArray(RETRY_WAITS_MS.booking_read), "a throw was the job's end: the kind had no wait at all");
  assert.equal(RETRY_WAITS_MS.booking_read.length, MAX_ATTEMPTS - 1);
});

test("REGRESSION: the last try that cannot read holds the notice for a person -- a failed job was all there was of the delivery", async () => {
  // A first and a second try that throw are the ledger's to run again: nothing is kept, so the next try reads whole.
  for (const attempts of [undefined, 1, MAX_ATTEMPTS - 1]) {
    const early = world({ ask: down });
    await assert.rejects(early.run(attempts), /529/);
    assert.deepEqual(early.tables.appointment_notices, []);
  }
  // The last has no next. The delivery is kept as held, under the tool, with the words that say to press Read again.
  const last = world({ ask: down });
  assert.equal(await last.run(MAX_ATTEMPTS), "done");
  assert.equal(last.tables.appointment_notices.length, 1);
  const kept = last.tables.appointment_notices[0];
  assert.equal(kept.tenant_id, T);
  assert.equal(kept.notice_id, "rcv_1");
  assert.equal(kept.tool, "booksy");
  assert.equal(kept.outcome, "held");
  assert.equal(kept.hold_reason, "no_model");
  assert.equal(kept.subject, DELIVERY.subject);
  assert.equal(kept.appointment_id, null);
  assert.deepEqual(last.tables.appointments, []);
  assert.equal(last.told.length, 1, "a booking that reached no calendar is news: the bell says so once");
  assert.equal(last.told[0].noticeId, "rcv_1");
  assert.match(last.told[0].reason, /Press Read again/);
});

test("REGRESSION: a last try whose reader answered, and whose write failed after the visit was written, is not told as a reader that was unavailable (the review's H2)", async () => {
  let faulted = 0;
  // The ledger's write fails once, after the visit is on the calendar; the catch's own write then succeeds.
  const faults = {
    get "appointment_notices.upsert"() {
      return faulted++ === 0 ? { message: "connection reset", code: "08006" } : undefined;
    },
  };
  const w = world({ faults });
  assert.equal(await w.run(MAX_ATTEMPTS), "done");
  assert.equal(w.tables.appointments.length, 1, "the visit is on the calendar");
  assert.deepEqual(w.told, [], "the reader answered: no bell row says it was unavailable");
});

test("a read the reader was never asked for (no key, the spend paused) is held and is not news: the card lists it", async () => {
  for (const reason of ["no_model", "may_not_spend"]) {
    const w = world({ mayRead: async () => reason });
    assert.equal(await w.run(1), "done");
    assert.equal(w.asked(), 0);
    assert.equal(w.tables.appointment_notices.length, 1);
    assert.equal(w.tables.appointment_notices[0].hold_reason, reason);
    assert.deepEqual(w.told, [], `${reason}: held before any try, on the card, not on the bell`);
  }
});

test("a visit the table refuses is held at once, on any try: no second try would write it", async () => {
  const refused = { message: 'new row for relation "appointments" violates check constraint', code: "23514" };
  const w = world({ faults: { "appointments.insert": refused } });
  assert.equal(await w.run(1), "done");
  assert.equal(w.tables.appointment_notices.length, 1);
  assert.equal(w.tables.appointment_notices[0].outcome, "held");
  assert.equal(w.tables.appointment_notices[0].hold_reason, "unreadable");
  assert.equal(w.told.length, 1, "a person is told once: it is theirs to look at");
  assert.equal(w.told[0].noticeId, "rcv_1");
  // Any other failed write is a bad minute: the next try's.
  const outage = world({ faults: { "appointments.insert": { message: "connection reset", code: "08006" } } });
  await assert.rejects(outage.run(1), /connection reset/);
  assert.deepEqual(outage.tables.appointment_notices, []);
});

test("a tool's email about no booking is set aside on the ledger: no bell, and the delivery said again is not read twice", async () => {
  const w = world({ ask: async () => answer({ kind: "other" }) });
  assert.equal(await w.run(1), "done");
  assert.equal(w.tables.appointment_notices.length, 1);
  assert.equal(w.tables.appointment_notices[0].outcome, "dismissed");
  assert.equal(w.tables.appointment_notices[0].hold_reason, "not_a_booking");
  assert.deepEqual(w.told, []);
  assert.deepEqual(w.tables.appointments, []);
  // The same delivery again (the intake run twice, a person pressing nothing): the ledger's row is read as done.
  assert.equal(await w.run(1), "done");
  assert.equal(w.asked(), 1);
  assert.equal(w.tables.appointment_notices.length, 1);
});

test("a booking read whole is a visit and a ledger row that names it", async () => {
  const w = world();
  assert.equal(await w.run(1), "done");
  assert.equal(w.tables.appointments.length, 1);
  const visit = w.tables.appointments[0];
  assert.equal(visit.status, "booked");
  assert.equal(visit.client_phone, "+13055550144");
  assert.equal(visit.starts_at, "2026-10-08T19:00:00.000Z");
  assert.equal(w.tables.appointment_notices[0].outcome, "booked");
  assert.equal(w.tables.appointment_notices[0].appointment_id, visit.id);
  assert.deepEqual(w.told, []);
  assert.deepEqual(
    (w.tables.events ?? []).map((e) => [e.tenant_id, e.kind, e.subject_type, e.subject_id, e.data.source]),
    [[T, "appointment.booked", "appointment", visit.id, "booking_email"]],
    "REGRESSION: a visit a booking tool's email put on the calendar was on no ledger an owner reads",
  );
});

test("REGRESSION: a tool's change or cancel takes only a visit that tool's notices wrote -- it took over the receptionist's request, rewrote its key and booked it without the owner's Booked it", async () => {
  // Booksy says Dana's Wednesday at three moved to Thursday at three. Beside the record's own Booksy row, the client
  // and the time also name a request the receptionist took (decision 0061: the owner's to book or not), a visit
  // another tool wrote and one Booksy's own door wrote. None is the visit the notices wrote, and none is touched.
  const moved = answer({ kind: "changed", previous_starts_at: "2026-10-07T15:00" });
  const thursdayKey = `booksy:+13055550144:${Date.parse("2026-10-08T19:00:00.000Z")}`;
  const theirs = () => [{ ...request }, { ...otherTool }, { ...door }];
  const alone = world({ ask: async () => moved, tables: { appointments: theirs() } });
  assert.equal(await alone.run(1), "done");
  const [req, other, byDoor, made, ...more] = alone.tables.appointments;
  assert.deepEqual(req, request, "the receptionist's request is the owner's to answer: untouched");
  assert.deepEqual(other, otherTool, "another tool's visit is that tool's word: untouched");
  assert.deepEqual(byDoor, door, "the tool's door's visit is no notice's row: untouched");
  assert.deepEqual(more, []);
  // With nothing of its own at the old time, the new time is the tool's booking, as a change with no row to move is.
  assert.equal(made.source, "booking_email");
  assert.equal(made.tool, "booksy");
  assert.equal(made.external_id, thursdayKey);
  assert.equal(made.starts_at, "2026-10-08T19:00:00.000Z");
  assert.equal(made.status, "booked");

  // The tool's own visit at the old time is the one that moves, whoever else holds the time.
  const own = visitRow();
  const beside = world({ ask: async () => moved, tables: { appointments: [...theirs(), { ...own }] } });
  assert.equal(await beside.run(1), "done");
  assert.deepEqual(beside.tables.appointments.slice(0, 3), [request, otherTool, door]);
  assert.equal(beside.tables.appointments.length, 4, "a visit moved, none written");
  const after = beside.tables.appointments[3];
  assert.equal(after.id, OWN);
  assert.equal(after.starts_at, "2026-10-08T19:00:00.000Z");
  assert.equal(after.external_id, thursdayKey);
  assert.equal(beside.tables.appointment_notices[0].appointment_id, OWN);

  // A cancellation whose key misses looks by client and time the same way: the request still stands, and the fact is
  // kept as the tool's own cancelled row.
  const cancel = world({
    ask: async () => answer({ kind: "cancelled", starts_at: "2026-10-07T15:00", ends_at: "2026-10-07T17:00" }),
    tables: { appointments: theirs() },
  });
  assert.equal(await cancel.run(1), "done");
  assert.deepEqual(cancel.tables.appointments.slice(0, 3), [request, otherTool, door], "none of theirs is cancelled");
  const fact = cancel.tables.appointments[3];
  assert.equal(fact.source, "booking_email");
  assert.equal(fact.status, "cancelled");
});

test("REGRESSION: a cancellation of a visit a member already marked is set aside, not said as cancelled -- the ledger kept it as cancelled and Activity said a booking was cancelled that still stands", async () => {
  // The member said Dana came (kept). A late cancel email from the tool is not the last word: the row's guard
  // (appointments_guard, 00345) refuses a finished visit cancelled. The double has no triggers, so its refusal is the
  // update's fault, with the guard's code.
  const START = "2026-10-08T19:00:00.000Z";
  const kept = visitRow({
    status: "kept",
    starts_at: START,
    ends_at: "2026-10-08T21:00:00.000Z",
    external_id: `booksy:+13055550144:${Date.parse(START)}`,
  });
  const w = world({
    ask: async () => answer({ kind: "cancelled" }),
    tables: { appointments: [{ ...kept }] },
    faults: {
      "appointments.update": { message: "appointments.status is terminal (kept -> cancelled refused)", code: "23514" },
    },
  });
  assert.equal(await w.run(1), "done");
  assert.deepEqual(w.tables.appointments, [kept], "the visit stands as the member said");
  const [notice] = w.tables.appointment_notices;
  assert.equal(notice.outcome, "dismissed", "set aside by the read: it cancelled nothing");
  assert.equal(notice.appointment_id, OWN, "on the visit it named, so an erasure of its person still finds it");
  assert.deepEqual(
    (w.tables.events ?? []).map((e) => e.kind),
    [],
    "nothing happened to the calendar, so Activity says nothing of it",
  );
  assert.deepEqual(w.told, [], "and nobody is asked to look: the member's word stands");
});

test("the intake reads the tool the workspace named off its stored config: a proved notice from that tool is one read scheduled, and with another named, or none, no read is", async () => {
  // The wiring the core test fakes (packages/jobs handlers.ts, `bookingTool`): config.bookings.tool, read where it is
  // stored. A name read from the wrong place would be no tool for every workspace, and nothing would ever be read.
  const MAILBOX = "22222222-2222-4222-8222-222222222222";
  const received = {
    ...DELIVERY,
    to: ["salon@mail.example.com"],
    cc: [],
    headers: {},
    messageId: "<b1@notices.example>",
    attachments: [],
    // The receiving side's own verdict, as the provider hands it over: a forward, and the tool's signature holds.
    authentication: { spf: "fail", dkim: "pass", dmarc: "pass" },
  };
  // The intake's own line of the last run (email_ingested), or null when the run ended before it was written.
  let said = null;
  const intake = async (config, email = received) => {
    const scheduled = [];
    said = null;
    const log = console.log;
    console.log = (...args) => {
      const line = logLineOf(args);
      if (line?.event === "email_ingested") said = fieldsOf(line);
    };
    const tables = {
      tenants: [{ id: T, timezone: "America/New_York" }],
      mailboxes: [{ id: MAILBOX, tenant_id: T, local_part: "salon" }],
      tenant_config: config === undefined ? [] : [{ tenant_id: T, config, version: 1 }],
    };
    const ctx = {
      db: fakeDb(tables),
      deadline: Date.now() + 60_000,
      email: {
        domain: "mail.example.com",
        fetch: async () => email,
        erasedBefore: async () => false,
        tell: async () => {},
      },
      schedule: async () => {},
      scheduleOnce: async (kind, _dueAt, payload) => {
        scheduled.push([kind, payload]);
        return "scheduled";
      },
    };
    // What a notice that is not read goes on to (kept as an email for a person) is the intake's own tests'; here only
    // whether a read was scheduled is asked, so a run that goes on past this fixture's tables is let end as it will.
    await dispatchJob(ctx, {
      id: "j2",
      tenant_id: T,
      kind: "email_ingest",
      payload: { mailbox_id: MAILBOX, received_id: "rcv_1" },
    })
      .catch(() => undefined)
      .finally(() => {
        console.log = log;
      });
    return scheduled.filter(([kind]) => kind === "booking_read");
  };
  assert.deepEqual(await intake({ bookings: { tool: "booksy" } }), [
    ["booking_read", { received_id: "rcv_1", mailbox_id: MAILBOX, tool: "booksy" }],
  ]);
  // What the provider said of the sender is on the intake's own line, in its words: it is how a deployment sees that a
  // verdict is handed over at all, and nothing of the email or its sender is in it.
  assert.deepEqual(said, {
    tenant_id: T,
    job: "j2",
    outcome: "kept_as_booking",
    sender_checks: { spf: "fail", dkim: "pass", dmarc: "pass" },
  });
  assert.deepEqual(await intake({ bookings: { tool: "calendly" } }), [], "another tool named");
  assert.deepEqual(await intake({ calendar: { ical_url: "https://calendar.example.com/a.ics" } }), [], "none named");
  assert.deepEqual(await intake(undefined), [], "no config at all");
  assert.deepEqual(await intake({ bookings: { tool: "not-a-tool" } }), [], "a value the list does not know");
  // And the named tool's notice with nothing to prove its sender is not read either.
  assert.deepEqual(await intake({ bookings: { tool: "booksy" } }, { ...received, authentication: null }), []);
  assert.deepEqual(
    await intake(
      { bookings: { tool: "booksy" } },
      { ...received, authentication: { spf: "pass", dkim: "gray", dmarc: "fail" } },
    ),
    [],
    "nor one the receiving side says is not the tool's",
  );
});
