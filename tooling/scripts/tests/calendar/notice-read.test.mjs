/**
 * A booking tool's notice, read into the record (docs/plans/2026-10-07-bookings-arrive-by-email.md, step 3): the verb,
 * run over fakes that record their calls, so what is proved is what it writes, in what order, and what it never does.
 * The model is a fake that answers the shape (contracts NOTICE_SCHEMA); the strict read of that answer is proved in
 * booking-notice.test.mjs. People are made up: 555-01xx numbers, example.com addresses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { readBookingNotice } = await importSrc("packages/core/src/appointments/notice-read.ts");

const T = "t1";
const TZ = "America/New_York";
/** A Tuesday noon in New York, 6 Oct 2026. */
const NOW = Date.parse("2026-10-06T16:00:00Z");
/** Thursday 3 PM in New York: 19:00Z. */
const THU_3PM = "2026-10-08T19:00:00.000Z";
const THU_5PM = "2026-10-08T21:00:00.000Z";

const email = (over = {}) => ({
  id: "rcv_9",
  from: { address: "no-reply@booksy.com", name: "Booksy" },
  subject: "Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
  text: "Dana Rivera\n(305) 555-0144\ndana.rivera@example.com\nThursday, October 8, 2026, 3:00 PM - 5:00 PM\nHair Color: Partial highlight\nwith Sam Ortiz",
  receivedAt: "2026-10-06T15:58:00Z",
  ...over,
});

const answer = (over = {}) => ({
  kind: "booked",
  client_name: "Dana Rivera",
  client_phone: "(305) 555-0144",
  client_email: "dana.rivera@example.com",
  service: "Hair Color: Partial highlight",
  staff: "Sam Ortiz",
  starts_at: "2026-10-08T15:00",
  ends_at: "2026-10-08T17:00",
  previous_starts_at: null,
  price: "Varies",
  note: null,
  ...over,
});

const CLIENT = { name: "Dana Rivera", phone: "+13055550144", email: "dana.rivera@example.com" };
const KEY = `booksy:+13055550144:${Date.parse(THU_3PM)}`;

/** Ports that answer what they are told and log every call by name. */
function world(over = {}) {
  const log = [];
  const answers = {
    mayRead: null,
    ask: answer(),
    noticeOf: null,
    keepNotice: undefined,
    byKey: null,
    byClientStart: null,
    insert: { id: "a1" },
    update: "updated",
    personFor: "p1",
    ...over,
  };
  const ports = { now: () => NOW };
  for (const [name, a] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      log.push([name, ...args]);
      return typeof a === "function" ? a(...args) : a;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]), calls: (name) => log.filter((l) => l[0] === name) };
}
const run = (w, over = {}) => readBookingNotice(w.ports, { tenantId: T, tz: TZ, tool: "booksy", email: email(over) });

test("a booking is written under its key with the client, the person it is for, and the ledger's row last", async () => {
  const w = world();
  assert.equal(await run(w), "booked");
  assert.deepEqual(w.ops(), ["noticeOf", "mayRead", "ask", "personFor", "byKey", "insert", "keepNotice"]);
  const [, row] = w.calls("insert")[0];
  assert.deepEqual(row, {
    tenantId: T,
    tool: "booksy",
    externalId: KEY,
    status: "booked",
    startsAt: THU_3PM,
    endsAt: THU_5PM,
    timezone: TZ,
    service: "Hair Color: Partial highlight",
    staff: "Sam Ortiz",
    price: "Varies",
    note: null,
    client: CLIENT,
    contactId: "p1",
  });
  const [, , client, visit] = w.calls("personFor")[0];
  assert.deepEqual(client, CLIENT);
  assert.deepEqual(visit, {
    title: "Hair Color: Partial highlight · Dana Rivera",
    uid: "notice:rcv_9",
    startMs: Date.parse(THU_3PM),
  });
  const [, kept] = w.calls("keepNotice")[0];
  assert.deepEqual(kept, {
    tenantId: T,
    noticeId: "rcv_9",
    tool: "booksy",
    fromAddress: "no-reply@booksy.com",
    subject: "Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
    receivedAt: "2026-10-06T15:58:00Z",
    outcome: "booked",
    holdReason: null,
    appointmentId: "a1",
  });
  // The model was told the notice, the zone and the day it arrived.
  const [, system, user] = w.calls("ask")[0];
  assert.match(system, /Invent nothing/);
  assert.match(user, /the business's zone is America\/New_York/);
});

test("a delivery the ledger holds as read pays nothing; one it holds as held is read again", async () => {
  const w = world({ noticeOf: { outcome: "booked", holdReason: null, appointmentId: "a1" } });
  assert.equal(await run(w), "already");
  assert.deepEqual(w.ops(), ["noticeOf"]);
  const again = world({ noticeOf: { outcome: "held", holdReason: "no_model", appointmentId: null } });
  assert.equal(await run(again), "booked");
  assert.ok(again.calls("ask").length === 1);
});

test("the same visit said again restates the row it has, and books a hold the tool now confirms", async () => {
  const w = world({
    byKey: { id: "a1", status: "booked", starts_at: THU_3PM, ends_at: THU_5PM, external_id: KEY, contact_id: "p1" },
  });
  assert.equal(await run(w), "booked_again");
  assert.deepEqual(w.ops(), ["noticeOf", "mayRead", "ask", "personFor", "byKey", "update", "keepNotice"]);
  const [, , id, patch] = w.calls("update")[0];
  assert.equal(id, "a1");
  assert.equal(patch.status, undefined);
  assert.equal(patch.endsAt, THU_5PM);
  const held = world({
    byKey: { id: "a1", status: "proposed", starts_at: THU_3PM, ends_at: THU_5PM, external_id: KEY, contact_id: null },
  });
  await run(held);
  assert.equal(held.calls("update")[0][3].status, "booked");
});

test("a change moves the live row the old time named to the new time under its new key", async () => {
  const old = {
    id: "a1",
    status: "booked",
    starts_at: "2026-10-07T15:00:00.000Z",
    ends_at: "2026-10-07T16:00:00.000Z",
    external_id: "booksy:+13055550144:x",
    contact_id: "p1",
  };
  const w = world({
    ask: answer({ kind: "changed", previous_starts_at: "2026-10-07T11:00" }),
    byClientStart: (_t, _c, startMs) => (startMs === Date.parse("2026-10-07T15:00:00.000Z") ? old : null),
  });
  assert.equal(await run(w), "changed");
  assert.deepEqual(w.ops(), [
    "noticeOf",
    "mayRead",
    "ask",
    "personFor",
    "byClientStart",
    "byKey",
    "update",
    "keepNotice",
  ]);
  const [, , id, patch] = w.calls("update")[0];
  assert.equal(id, "a1");
  assert.equal(patch.externalId, KEY);
  assert.equal(patch.startsAt, THU_3PM);
  assert.equal(patch.status, "booked");
  assert.equal(w.calls("keepNotice")[0][1].outcome, "changed");
});

test("a change with no row to move is a booking at the new time, said so", async () => {
  const w = world({ ask: answer({ kind: "changed", previous_starts_at: "2026-10-07T11:00" }) });
  assert.equal(await run(w), "changed_unknown");
  assert.equal(w.calls("insert").length, 1);
  assert.equal(w.calls("insert")[0][1].status, "booked");
  // No old time stated at all: nothing is looked for by time.
  const none = world({ ask: answer({ kind: "changed" }) });
  assert.equal(await run(none), "changed_unknown");
  assert.equal(none.calls("byClientStart").length, 0);
});

test("a cancellation ends the row the time names; a finished visit is not moved; one never seen is kept as the fact", async () => {
  const w = world({
    byKey: { id: "a1", status: "booked", starts_at: THU_3PM, ends_at: THU_5PM, external_id: KEY, contact_id: "p1" },
    ask: answer({ kind: "cancelled" }),
  });
  assert.equal(await run(w), "cancelled");
  assert.deepEqual(w.calls("update")[0].slice(2), ["a1", { status: "cancelled" }]);
  const kept = world({
    byKey: { id: "a1", status: "kept", starts_at: THU_3PM, ends_at: THU_5PM, external_id: KEY, contact_id: "p1" },
    ask: answer({ kind: "cancelled" }),
    update: "refused",
  });
  assert.equal(await run(kept), "cancel_refused");
  const unknown = world({ ask: answer({ kind: "cancelled" }) });
  assert.equal(await run(unknown), "cancelled_unknown");
  assert.equal(unknown.calls("insert")[0][1].status, "cancelled");
  // Already withdrawn: nothing to do, and no second move.
  const twice = world({
    byKey: { id: "a1", status: "cancelled", starts_at: THU_3PM, ends_at: THU_5PM, external_id: KEY, contact_id: null },
    ask: answer({ kind: "cancelled" }),
  });
  assert.equal(await run(twice), "cancelled");
  assert.equal(twice.calls("update").length, 0);
});

test("REGRESSION: a cancellation the visit's guard refuses is set aside on the ledger, on the visit it named -- it was kept as cancelled, and Activity said so of a visit that stood", async () => {
  // A member said the visit was kept (or missed): that is final, and the tool's late word moves nothing. The run says
  // so for the log; the ledger keeps what became of the notice, and "cancelled" is what did not.
  const w = world({
    byKey: { id: "a1", status: "missed", starts_at: THU_3PM, ends_at: THU_5PM, external_id: KEY, contact_id: "p1" },
    ask: answer({ kind: "cancelled" }),
    update: "refused",
  });
  assert.equal(await run(w), "cancel_refused");
  assert.deepEqual(w.calls("update")[0].slice(2), ["a1", { status: "cancelled" }], "the guard was asked, and refused");
  const [, kept] = w.calls("keepNotice")[0];
  assert.equal(kept.outcome, "dismissed");
  // The ledger pairs a set-aside notice with a reason, and has none of its own for this one yet: the read's own.
  assert.equal(kept.holdReason, "not_a_booking");
  assert.equal(kept.appointmentId, "a1");
});

test("what is held, with its reason on the ledger and no row written: no model, no spend, an answer with no time or no shape", async () => {
  for (const [over, reason] of [
    [{ mayRead: "no_model" }, "no_model"],
    [{ mayRead: "may_not_spend" }, "may_not_spend"],
    [{ ask: answer({ starts_at: null }) }, "no_time"],
    [{ ask: null }, "unreadable"],
  ]) {
    const w = world(over);
    assert.equal(await run(w), `held:${reason}`);
    assert.equal(w.calls("insert").length, 0);
    assert.equal(w.calls("update").length, 0);
    assert.equal(w.calls("personFor").length, 0);
    const [, kept] = w.calls("keepNotice")[0];
    assert.equal(kept.outcome, "held");
    assert.equal(kept.holdReason, reason);
    assert.equal(kept.appointmentId, null);
  }
});

test("a tool's email about no booking is kept on the ledger and set aside: nobody is asked to look at a receipt", async () => {
  // Held, each one rang the bell and stood in "N booking emails need a look": a filter that forwards a tool's mail
  // forwards its payouts, its digests and its newsletter too, and the list a person was asked to look at was those.
  const w = world({ ask: answer({ kind: "other" }) });
  assert.equal(await run(w), "set_aside");
  assert.deepEqual(w.ops(), ["noticeOf", "mayRead", "ask", "keepNotice"]);
  const [, kept] = w.calls("keepNotice")[0];
  assert.equal(kept.outcome, "dismissed", "on the ledger, so the delivery said again pays nothing");
  assert.equal(kept.holdReason, "not_a_booking");
  assert.equal(kept.appointmentId, null);
  // And said again, it is one the ledger holds as done: no second read.
  const again = world({ noticeOf: { outcome: "dismissed", holdReason: "not_a_booking", appointmentId: null } });
  assert.equal(await run(again), "already");
  assert.deepEqual(again.ops(), ["noticeOf"]);
});

test("REGRESSION: a time that was withdrawn and is booked again is a visit again -- it stayed cancelled, and the time was offered to someone else", async () => {
  // The key is the tool, the client and the start, so Thursday at three cancelled and booked again states the key of
  // a row that ended, and an ended row does not come back (the table's guard). The ended row leaves the key and the
  // visit is written anew under it.
  const ended = { id: "a1", status: "cancelled", starts_at: THU_3PM, ends_at: THU_5PM, external_id: KEY };
  const w = world({ byKey: ended, insert: { id: "a2" } });
  assert.equal(await run(w), "booked");
  assert.deepEqual(w.ops(), ["noticeOf", "mayRead", "ask", "personFor", "byKey", "update", "insert", "keepNotice"]);
  assert.deepEqual(w.calls("update")[0].slice(1), [T, "a1", { externalId: `${KEY}|ended:a1` }]);
  const [, row] = w.calls("insert")[0];
  assert.equal(row.externalId, KEY);
  assert.equal(row.status, "booked");
  assert.equal(w.calls("keepNotice")[0][1].appointmentId, "a2");

  // A time already past is left as it ended: nothing is offered there, and an old email forwarded late books nothing.
  const past = { ...ended, starts_at: "2026-10-01T19:00:00.000Z", ends_at: "2026-10-01T21:00:00.000Z" };
  const late = world({ byKey: past, ask: answer({ starts_at: "2026-10-01T15:00", ends_at: "2026-10-01T17:00" }) });
  assert.equal(await run(late), "booked_again");
  assert.equal(late.calls("insert").length, 0);
  assert.equal("externalId" in late.calls("update")[0][3], false);
});

test("REGRESSION: a visit moved onto a time the client once withdrew keeps the visit -- the ended row refused the booking and the moved one was withdrawn", async () => {
  const live = {
    id: "a1",
    status: "booked",
    starts_at: "2026-10-07T19:00:00.000Z",
    ends_at: "2026-10-07T21:00:00.000Z",
  };
  const ended = { id: "a0", status: "cancelled", starts_at: THU_3PM, ends_at: THU_5PM, external_id: KEY };
  const w = world({
    ask: answer({ kind: "changed", previous_starts_at: "2026-10-07T15:00" }),
    byClientStart: live,
    byKey: ended,
  });
  assert.equal(await run(w), "changed");
  const updates = w.calls("update").map((c) => [c[2], c[3]]);
  assert.deepEqual(updates[0], ["a0", { externalId: `${KEY}|ended:a0` }], "the ended row leaves the key");
  assert.equal(updates[1][0], "a1", "and the row that moves takes it");
  assert.equal(updates[1][1].externalId, KEY);
  assert.equal(updates[1][1].status, "booked");
  assert.equal(updates[1][1].startsAt, THU_3PM);
  assert.equal(updates.length, 2, "nothing is withdrawn");
  assert.equal(w.calls("keepNotice")[0][1].appointmentId, "a1");
});

test("a failed call is the ledger's to try again: nothing is kept for it", async () => {
  const w = world({
    ask: () => {
      throw new Error("529");
    },
  });
  await assert.rejects(run(w), /529/);
  assert.equal(w.calls("keepNotice").length, 0);
});
