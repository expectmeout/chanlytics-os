/**
 * booking_read, the job (packages/jobs/src/booking-read.ts), run through the dispatcher over a database in memory: what
 * is left of a delivery when its read cannot finish. The verb's own rules are notice-read.test.mjs's; these are the
 * handler's, where a throw meets the ledger.
 *
 * A read that threw used to fail the job at the first throw (the kind had no wait to be tried again after), and a
 * failed job was all there was of the delivery: nothing on the notices ledger, so nothing in the fold, and a booking
 * the owner was never shown. Now a throw is the next try's, twice, and the last try holds the notice for a person.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
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
function world({ ask = async () => answer(), faults = {}, tables = {} } = {}) {
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
      mayRead: async () => null,
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
  assert.deepEqual(last.told, [], "the reader's absence is on the list, and is not news for the bell");
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
  const intake = async (config, email = received) => {
    const scheduled = [];
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
    }).catch(() => undefined);
    return scheduled.filter(([kind]) => kind === "booking_read");
  };
  assert.deepEqual(await intake({ bookings: { tool: "booksy" } }), [
    ["booking_read", { received_id: "rcv_1", mailbox_id: MAILBOX, tool: "booksy" }],
  ]);
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
