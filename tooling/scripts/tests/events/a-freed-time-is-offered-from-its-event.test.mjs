/**
 * A time a cancellation frees is offered from its event (decision 0082): the subscriber `freed_time_offer` reads an
 * `appointment.changed`, asks the record for the row and the calendar the receptionist reads, decides the freed time by
 * the one rule (contracts freedTimeOf), and hands it to the edge's offer, which runs the workspace's step on
 * `slot_opened`. Every change that offers nothing says why in one log line; a change that frees nothing (a booking
 * added) says nothing. And the owner's news of a customer's cancellation (`visit_notice`) says what the offer came to,
 * from the offer itself, so the bell and the batch never disagree. Run through the job runner's dispatch over a
 * database in memory, as the harness beside it runs every subscriber.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { dispatchJob } from "../../../../packages/jobs/src/handlers.ts";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const PERSON = "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0";
const OTHER = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const H = 3_600_000;
const DAY = 24 * H;
const iso = (ms) => new Date(ms).toISOString();

/** Three days from now at 3:00 PM UTC: past the two hours' notice and inside the fortnight, whatever the clock says. */
const START = (() => {
  const d = new Date(Date.now() + 3 * DAY);
  d.setUTCHours(15, 0, 0, 0);
  return d.getTime();
})();
const open = { open: "00:00", close: "23:59" };
const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };

/** The visit a booking tool's email kept, cancelled by the service, with its person. */
const theVisit = (over = {}) => ({
  id: APPT,
  tenant_id: T,
  starts_at: iso(START),
  ends_at: iso(START + H),
  all_day: false,
  timezone: "UTC",
  status: "cancelled",
  source: "booking_email",
  client_name: "Rosa Diaz",
  service: "Gel manicure",
  contact_id: PERSON,
  vanished_at: null,
  expires_at: null,
  ...over,
});

/** The logger's lines written while `fn` ran, and what it answered. */
async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    const answer = await fn();
    return { answer, lines: lines.map(logLineOf).filter(Boolean) };
  } finally {
    Object.assign(console, real);
  }
}

/**
 * A workspace open all week, one cancellation's event and its delivery to `subscriber`; the edge's offer recorded,
 * answering `offer` (or throwing it, when it is an Error).
 */
function world({
  subscriber = "freed_time_offer",
  data = { change: "cancelled", source: "booking_email", by: "service", starts_at: iso(START) },
  visits = [theVisit()],
  offer = { offered: true, people: 4, waits: false },
} = {}) {
  const tables = {
    tenants: [rows.tenant({ id: T, timezone: "UTC" })],
    tenant_config: [
      rows.config({
        tenant_id: T,
        config: {
          brain: {
            business_name: "Harbor",
            booking_link: "https://book.example/harbor",
            system_prompt: "Answer as the front desk of Harbor: brief and warm, never a price.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: { hours: HOURS },
          },
        },
      }),
    ],
    contacts: [
      rows.contact({ id: PERSON, tenant_id: T, display_name: "Rosa Diaz", phone_e164: "+13055550142" }),
      rows.contact({ id: OTHER, tenant_id: T, display_name: "Ada Park", phone_e164: "+13055550143" }),
    ],
    appointments: visits,
    notifications: [],
    events: [
      rows.event({
        id: E,
        tenant_id: T,
        kind: "appointment.changed",
        category: "appointment",
        subject_type: "appointment",
        subject_id: APPT,
        data,
        created_at: iso(Date.now() - 60_000),
      }),
    ],
    event_subscriptions: [
      { kind: "appointment.changed", subscriber, lane: 2, paused: false, created_at: "2026-10-06T00:00:00Z" },
    ],
    event_deliveries: [
      {
        event_id: E,
        subscriber,
        tenant_id: T,
        kind: "appointment.changed",
        event_at: "2026-10-06T00:00:00Z",
        state: "scheduled",
        job_id: null,
        attempts: 0,
        last_error: null,
        created_at: "2026-10-06T00:00:01Z",
        updated_at: "2026-10-06T00:00:01Z",
      },
    ],
  };
  const db = fakeDb(tables);
  const offers = [];
  const told = [];
  const ctx = {
    db,
    wire: { whatsapp: null, sms: null },
    alert: async (news) => {
      told.push(news);
    },
    freedTimes: {
      offer: async (tenantId, freed) => {
        offers.push([tenantId, freed]);
        if (offer instanceof Error) throw offer;
        return offer;
      },
    },
  };
  const job = {
    id: "j-1",
    tenant_id: T,
    kind: "event_deliver",
    payload: { event_id: E, subscriber, kind: "appointment.changed", lane: "2" },
  };
  return { tables, ctx, job, offers, told, delivery: () => tables.event_deliveries[0] };
}

/** The subscriber's own lines, as [name, fields]. */
const freedLines = (lines) =>
  lines.filter((l) => l.event?.startsWith("freed_time_")).map((l) => [l.event, fieldsOf(l)]);

test("a client's cancellation by the service offers the time it freed, and says what came of it", async () => {
  const w = world();
  const { answer, lines } = await logged(() => dispatchJob(w.ctx, w.job));
  assert.equal(answer, "done");
  assert.deepEqual(w.offers, [[T, { from: APPT, start: START, end: START + H }]], "the visit's own hour, from it");
  assert.deepEqual(freedLines(lines), [
    ["freed_time_offered", { tenant_id: T, appointment: APPT, event_id: E, people: 4, waits: false }],
  ]);
  assert.equal(w.delivery().state, "done");

  // Delivered again, the offer is asked again and answers the batch it made (the edge's, once per appointment: the
  // unique index); the subscriber writes nothing of its own.
  const before = JSON.stringify(w.tables.events);
  assert.equal(await dispatchJob(w.ctx, w.job), "done");
  assert.equal(w.offers.length, 2);
  assert.equal(JSON.stringify(w.tables.events), before);
});

test("a move offers the time it left; the vanished entry of the owner's calendar offers its own", async () => {
  const moved = world({
    data: { change: "moved", source: "booking_email", by: "service", was_at: iso(START) },
    visits: [theVisit({ status: "booked", starts_at: iso(START + 2 * DAY), ends_at: iso(START + 2 * DAY + H) })],
  });
  assert.equal(await dispatchJob(moved.ctx, moved.job), "done");
  assert.deepEqual(
    moved.offers,
    [[T, { from: APPT, start: START, end: START + H }]],
    "the hour it left, as long as it is",
  );

  const vanished = world({
    data: { change: "vanished", source: "calendar_feed" },
    visits: [theVisit({ status: "booked", source: "calendar_feed", vanished_at: iso(Date.now()) })],
  });
  assert.equal(await dispatchJob(vanished.ctx, vanished.job), "done");
  assert.deepEqual(vanished.offers, [[T, { from: APPT, start: START, end: START + H }]]);
});

test("the calendar's copy of the cancelled visit holds no time; another person's visit at that hour does", async () => {
  const copy = theVisit({
    id: "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
    status: "booked",
    source: "calendar_feed",
  });
  const withCopy = world({ visits: [theVisit(), copy] });
  assert.equal(await dispatchJob(withCopy.ctx, withCopy.job), "done");
  assert.equal(withCopy.offers.length, 1, "the same person at the same start is the same visit, cancelled");

  const someoneElse = world({ visits: [theVisit(), { ...copy, contact_id: OTHER, client_name: "Ada Park" }] });
  const { lines } = await logged(() => dispatchJob(someoneElse.ctx, someoneElse.job));
  assert.deepEqual(someoneElse.offers, []);
  assert.deepEqual(freedLines(lines), [
    ["freed_time_not_offered", { tenant_id: T, appointment: APPT, event_id: E, why: "not_free" }],
  ]);
});

test("a member's cancel, nobody's visit, a move that says no time it left, a time too soon and a gone row offer nothing, each said once", async () => {
  const cases = [
    [{ data: { change: "cancelled", source: "booking_email", by: "member" } }, "not_a_service_change"],
    [{ visits: [theVisit({ contact_id: null })] }, "no_person"],
    [
      {
        data: { change: "moved", source: "booking_email", by: "service" },
        visits: [theVisit({ status: "booked" })],
      },
      "no_was_at",
    ],
    [{ visits: [theVisit({ starts_at: iso(Date.now() + H), ends_at: iso(Date.now() + 2 * H) })] }, "too_soon"],
    [{ visits: [] }, "gone"],
  ];
  for (const [over, why] of cases) {
    const w = world(over);
    const { answer, lines } = await logged(() => dispatchJob(w.ctx, w.job));
    assert.equal(answer, "done", why);
    assert.deepEqual(w.offers, [], `${why}: nothing offered`);
    assert.deepEqual(
      freedLines(lines),
      [["freed_time_not_offered", { tenant_id: T, appointment: APPT, event_id: E, why }]],
      why,
    );
  }
});

test("a workspace with no step, or a run that found nobody, is said as the offer answered; a booking added says nothing", async () => {
  for (const [offer, fields] of [
    [{ offered: false, why: "no_step" }, { why: "no_step" }],
    [
      { offered: false, why: "off", detail: "template_not_approved" },
      { why: "off", detail: "template_not_approved" },
    ],
    [{ offered: false, why: "nobody" }, { why: "nobody" }],
  ]) {
    const w = world({ offer });
    const { lines } = await logged(() => dispatchJob(w.ctx, w.job));
    assert.equal(w.offers.length, 1);
    assert.deepEqual(freedLines(lines), [
      ["freed_time_not_offered", { tenant_id: T, appointment: APPT, event_id: E, ...fields }],
    ]);
  }

  const added = world({
    data: { change: "added", source: "booking_email", starts_at: iso(START) },
    visits: [theVisit({ status: "booked" })],
  });
  const { lines } = await logged(() => dispatchJob(added.ctx, added.job));
  assert.deepEqual([added.offers, freedLines(lines)], [[], []], "a booking frees no time, and is nobody's refusal");
});

test("an offer the edge could not make fails the delivery, so the ledger tries again", async () => {
  const w = world({ offer: new Error("the edge's database is away") });
  await assert.rejects(() => dispatchJob(w.ctx, w.job), /the edge's database is away/);
  assert.deepEqual([w.delivery().state, w.delivery().last_error], ["failed", "the edge's database is away"]);
});

test("the owner's news of a customer's cancellation says what the offer came to, from the offer itself", async () => {
  const bodyOf = async (offer) => {
    const w = world({ subscriber: "visit_notice", offer });
    assert.equal(await dispatchJob(w.ctx, w.job), "done");
    assert.equal(w.told.length, 1);
    assert.equal(w.told[0].subject, "Rosa Diaz cancelled their booking");
    return w.told[0].body.split("\n");
  };
  assert.ok(
    (await bodyOf({ offered: true, people: 4, waits: false })).includes(
      "That time is free again · offered to 4 people.",
    ),
  );
  assert.ok(
    (await bodyOf({ offered: true, people: 1, waits: false })).includes(
      "That time is free again · offered to 1 person.",
    ),
  );
  assert.ok(
    (await bodyOf({ offered: true, people: 3, waits: true })).includes(
      "That time is free again · ready to offer to 3 people when you OK it.",
    ),
  );
  assert.ok(
    (await bodyOf({ offered: false, why: "nobody" })).includes(
      "That time is free again · nobody asked this month who hasn't booked.",
    ),
  );
  // A workspace that offers no freed time hears the news as before; so does one whose offer could not be asked, which
  // its own delivery tries again: the news never waits on it.
  assert.ok((await bodyOf({ offered: false, why: "no_step" })).includes("That time is free again."));
  assert.ok((await bodyOf(new Error("the edge's database is away"))).includes("That time is free again."));
});
