/**
 * A time a customer asked for has a clock (decision 0061, as amended 22 Nov 2026): the step the watchdog's tick runs
 * last. A request two hours from running out nudges its owner once, and is stamped only once the nudge was delivered; a
 * request that ran out is handed to the ledger, one job a request; a workspace with nobody on file is left unstamped;
 * nothing starts past the step's line; and a step that cannot read what is due says so and costs the tick nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { keepRequestsOnTheClock } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/receptionist/request-clock.ts")).href
);

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = Date.parse("2026-10-16T09:00:00.000Z");
const due = (what, n, over = {}) => ({
  what,
  appointment_id: `dddddddd-0000-4000-8000-00000000d00${n}`,
  tenant_id: T,
  conversation_id: `cccccccc-cccc-4ccc-8ccc-00000000000${n}`,
  client_name: "Ana Ruiz",
  starts_at: "2026-10-17T18:00:00.000Z",
  service: "Balayage",
  timezone: "America/New_York",
  expires_at: new Date(NOW + (what === "nudge" ? 2 : -1) * 3_600_000).toISOString(),
  ...over,
});

function world(rows, over = {}) {
  const lines = [];
  const told = [];
  const stamped = [];
  const jobs = [];
  const log = (level) => (event, fields) => lines.push([level, event, fields]);
  const db = fakeDb(
    {},
    {},
    {
      booking_requests_due: () => {
        if (over.unreadable) throw new Error("function public.booking_requests_due(integer) does not exist");
        return rows;
      },
      booking_request_nudged: (a) => {
        stamped.push(a.p_appointment_id);
        return true;
      },
    },
  );
  const ports = {
    db,
    L: { info: log("info"), warn: log("warn"), error: log("error") },
    started: NOW,
    now: over.now ?? (() => NOW + 1_000),
    loadTenantNotifications: async () => over.addressing ?? { notifyTo: "owner@harbor.test", notifyFrom: null },
    reachesTenant: (target) => !!target.notifyTo,
    notifyOnce: async (target, msg) => {
      told.push({ target, msg });
      return over.delivered ?? true;
    },
    handToTheLedger: async (tenantId, appointmentId) => {
      jobs.push({ tenantId, appointmentId });
      return over.scheduled ?? "scheduled";
    },
  };
  return { ports, lines, told, stamped, jobs };
}

test("a request two hours from running out nudges its owner once, in its own words, and is stamped", async () => {
  const w = world([due("nudge", 1)]);
  assert.deepEqual(await keepRequestsOnTheClock(w.ports), { nudged: 1, handed: 0 });
  assert.equal(w.told.length, 1);
  const { target, msg } = w.told[0];
  assert.equal(target.tenantId, T);
  assert.equal(msg.kind, "deadman");
  assert.equal(msg.onceKey, "booking_nudge:dddddddd-0000-4000-8000-00000000d001");
  assert.equal(msg.route, "inbox/th-cccccccc-cccc-4ccc-8ccc-000000000001");
  // Who, which time, and when it stops being held, on the business's clock (it runs out at 11:00 UTC, 7:00 AM in New York).
  assert.equal(msg.subject, "Ana Ruiz's time stops being held at 7:00 AM");
  assert.match(msg.body, /They asked for Sat, Oct 17, 2:00 PM · Balayage and are still waiting to hear\./);
  assert.match(msg.body, /Press Booked it or Can't before 7:00 AM\./);
  assert.doesNotMatch(msg.redactedBody, /Ana|Balayage/);
  assert.deepEqual(w.stamped, ["dddddddd-0000-4000-8000-00000000d001"]);
});

test("a nudge that was not delivered earns no stamp: the next tick tries again", async () => {
  const w = world([due("nudge", 1)], { delivered: false });
  assert.deepEqual(await keepRequestsOnTheClock(w.ports), { nudged: 0, handed: 0 });
  assert.deepEqual(w.stamped, []);
  assert.ok(w.lines.some(([level, event]) => level === "warn" && event === "deadman_alert_undelivered"));
});

test("a workspace with nobody on file is not nudged and not stamped", async () => {
  const w = world([due("nudge", 1)], { addressing: { notifyTo: null, notifyFrom: null } });
  assert.deepEqual(await keepRequestsOnTheClock(w.ports), { nudged: 0, handed: 0 });
  assert.equal(w.told.length, 0);
  assert.deepEqual(w.stamped, []);
});

test("a request that ran out is handed to the ledger, one job a request, and nobody is nudged for it", async () => {
  const w = world([due("lapse", 1), due("lapse", 2)]);
  assert.deepEqual(await keepRequestsOnTheClock(w.ports), { nudged: 0, handed: 2 });
  assert.deepEqual(w.jobs, [
    { tenantId: T, appointmentId: "dddddddd-0000-4000-8000-00000000d001" },
    { tenantId: T, appointmentId: "dddddddd-0000-4000-8000-00000000d002" },
  ]);
  assert.equal(w.told.length, 0);
});

test("a request whose job is already waiting is not counted twice", async () => {
  const w = world([due("lapse", 1)], { scheduled: "already_scheduled" });
  assert.deepEqual(await keepRequestsOnTheClock(w.ports), { nudged: 0, handed: 0 });
});

test("the ones that ran out go first, and nothing starts past the step's line", async () => {
  let clock = NOW + 1_000;
  const w = world([due("nudge", 1), due("lapse", 2), due("nudge", 3)], { now: () => clock });
  w.ports.handToTheLedger = async (tenantId, appointmentId) => {
    w.jobs.push({ tenantId, appointmentId });
    // The first nudge is still inside the line; the second would start past it.
    clock = NOW + 40_000;
    return "scheduled";
  };
  w.ports.notifyOnce = async (target, msg) => {
    w.told.push({ target, msg });
    clock = NOW + 60_000;
    return true;
  };
  assert.deepEqual(await keepRequestsOnTheClock(w.ports), { nudged: 1, handed: 1 });
  assert.equal(w.told.length, 1);
});

test("a database that cannot say what is due costs the tick nothing, and says so", async () => {
  const w = world([], { unreadable: true });
  assert.deepEqual(await keepRequestsOnTheClock(w.ports), { nudged: 0, handed: 0 });
  assert.ok(w.lines.some(([level, event]) => level === "error" && event === "booking_request_clock_failed"));
});

test("one request that fails leaves the rest their turn", async () => {
  const w = world([due("lapse", 1), due("lapse", 2)]);
  let first = true;
  w.ports.handToTheLedger = async (tenantId, appointmentId) => {
    if (first) {
      first = false;
      throw new Error("the ledger refused it");
    }
    w.jobs.push({ tenantId, appointmentId });
    return "scheduled";
  };
  assert.deepEqual(await keepRequestsOnTheClock(w.ports), { nudged: 0, handed: 1 });
  assert.equal(w.jobs.length, 1);
});
