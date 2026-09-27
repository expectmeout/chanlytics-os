/**
 * push_send, run over the fake database and a recording push port: the readers of a kept row (the one it is
 * addressed to, else every member), their phones, one message each with the reader's bell number, the tickets kept for
 * one push_receipts job, a phone the service says is gone forgotten (in the ticket, or in the receipt a quarter of an
 * hour on), and a transport that fails thrown so the ledger tries again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { dispatchJob } from "../../../../packages/jobs/src/handlers.ts";
import { RETRY_WAITS_MS } from "../../../../packages/jobs/src/ledger.ts";
import { PUSH_RECEIPTS_AFTER_MS } from "../../../../packages/contracts/src/today/push.ts";

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const row = (over = {}) => ({
  id: "n1",
  tenant_id: T,
  kind: "handoff",
  title: "Handoff needed",
  body: "Maria asked for a person.\nMore",
  route: "inbox/th-1",
  recipient_user_id: null,
  created_at: "2026-09-26T10:00:00Z",
  ...over,
});
/** The tables by reference, so what the job deleted can be read back. */
function world(over = {}) {
  const devices = [
    { id: "d1", user_id: "u1", token: "tok-u1-a" },
    { id: "d2", user_id: "u1", token: "tok-u1-b" },
    { id: "d3", user_id: "u2", token: "tok-u2" },
    { id: "d9", user_id: "u9", token: "tok-u9" },
  ];
  const db = fakeDb({
    notifications: [row(over.notification)],
    memberships: [
      { user_id: "u1", tenant_id: T, role: "owner" },
      { user_id: "u2", tenant_id: T, role: "staff" },
      { user_id: "u9", tenant_id: OTHER, role: "owner" },
    ],
    push_devices: devices,
  });
  return { db, devices };
}
const port = (answer) => {
  const sent = [];
  return {
    sent,
    push: {
      send: async (messages) => {
        sent.push(...messages);
        if (answer instanceof Error) throw answer;
        return messages.map((m) => answer?.[m.to] ?? { to: m.to, status: "ok", id: `ticket-${m.to}` });
      },
      receipts: async () => ({}),
    },
  };
};
const job = { id: "j1", tenant_id: T, kind: "push_send", payload: { notification_id: "n1" } };
const ctx = (db, p) => ({
  db,
  wire: { whatsapp: null, sms: null },
  alert: async () => {},
  schedule: async () => {},
  deadline: Date.now() + 45_000,
  ...p,
});

test("every member's every phone hears a workspace row, in the bell's words; another workspace's phone does not", async () => {
  const { db } = world();
  const p = port();
  assert.equal(await dispatchJob(ctx(db, { push: p.push }), job), "done");
  assert.deepEqual(p.sent.map((m) => m.to).sort(), ["tok-u1-a", "tok-u1-b", "tok-u2"]);
  assert.deepEqual(p.sent[0], {
    to: "tok-u1-a",
    title: "Handoff needed",
    body: "Maria asked for a person.",
    sound: "default",
    badge: 1,
    data: { route: "inbox/th-1", notification_id: "n1", tenant_id: T },
  });
});

test("the badge is each reader's own bell number; the tickets go to one push_receipts job a quarter of an hour on", async () => {
  // u1 opened the bell after the first row and marked nothing; u2 never opened it but dismissed one row.
  const tables = {
    notifications: [
      row({ id: "n0", created_at: "2026-09-26T09:00:00Z" }),
      row(),
      row({ id: "n2", created_at: "2026-09-26T11:00:00Z" }),
    ],
    memberships: [
      { user_id: "u1", tenant_id: T, role: "owner" },
      { user_id: "u2", tenant_id: T, role: "staff" },
    ],
    push_devices: [
      { id: "d1", user_id: "u1", token: "tok-u1-a" },
      { id: "d2", user_id: "u1", token: "tok-u1-b" },
      { id: "d3", user_id: "u2", token: "tok-u2" },
    ],
    notification_reads: [{ tenant_id: T, user_id: "u1", seen_at: "2026-09-26T09:30:00Z" }],
    notification_marks: [{ notification_id: "n2", user_id: "u2", read_at: null, dismissed_at: "2026-09-26T12:00:00Z" }],
  };
  const db = fakeDb(tables);
  const scheduled = [];
  const p = port();
  const before = Date.now();
  await dispatchJob(
    ctx(db, { push: p.push, schedule: async (kind, dueAt, payload) => scheduled.push({ kind, dueAt, payload }) }),
    job,
  );
  const badgeOf = (to) => p.sent.find((m) => m.to === to).badge;
  assert.equal(badgeOf("tok-u1-a"), 2, "u1: two rows after the seen moment");
  assert.equal(badgeOf("tok-u1-b"), 2, "the same person's other phone wears the same number");
  assert.equal(badgeOf("tok-u2"), 2, "u2: three rows, one dismissed");
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].kind, "push_receipts");
  assert.ok(scheduled[0].dueAt.getTime() - before >= PUSH_RECEIPTS_AFTER_MS - 1000, "a quarter of an hour on");
  assert.deepEqual(scheduled[0].payload.tickets.map((t) => t.to).sort(), ["tok-u1-a", "tok-u1-b", "tok-u2"]);
  assert.deepEqual(
    scheduled[0].payload.tickets.find((t) => t.to === "tok-u2"),
    { id: "ticket-tok-u2", to: "tok-u2" },
  );
});

test("a receipts job the ledger refuses does not make the alert leave twice", async () => {
  const { db } = world();
  const p = port();
  const refusing = async () => {
    throw new Error("jobs_kind_check");
  };
  assert.equal(await dispatchJob(ctx(db, { push: p.push, schedule: refusing }), job), "done");
  assert.equal(p.sent.length, 3, "sent once, and the job is done, not retried");
});

test("push_receipts forgets the phones their receipts say are gone and leaves every other answer alone", async () => {
  const { db, devices } = world();
  const asked = [];
  const push = {
    send: async () => [],
    receipts: async (ids) => {
      asked.push(...ids);
      return {
        "t-a": { status: "ok" },
        "t-b": { status: "error", error: "DeviceNotRegistered" },
        "t-c": { status: "error", error: "MessageRateExceeded" },
      };
    },
  };
  const receiptsJob = {
    id: "j2",
    tenant_id: T,
    kind: "push_receipts",
    payload: {
      tickets: [
        { id: "t-a", to: "tok-u1-a" },
        { id: "t-b", to: "tok-u1-b" },
        { id: "t-c", to: "tok-u2" },
        { id: "t-late", to: "tok-u2" },
        "junk",
      ],
    },
  };
  assert.equal(await dispatchJob(ctx(db, { push }), receiptsJob), "done");
  assert.deepEqual(asked, ["t-a", "t-b", "t-c", "t-late"]);
  assert.deepEqual(
    devices.map((d) => d.token).sort(),
    ["tok-u1-a", "tok-u2", "tok-u9"],
    "only the phone answered gone is forgotten",
  );
  assert.equal(
    await dispatchJob(ctx(db, { push }), { ...receiptsJob, payload: {} }),
    "done",
    "no tickets is a job done",
  );
  await assert.rejects(dispatchJob(ctx(db, {}), receiptsJob), /push_receipts: this runtime holds no push transport/);
  assert.deepEqual(
    RETRY_WAITS_MS.push_receipts,
    [5 * 60_000, 30 * 60_000],
    "five minutes, then thirty: the receipts keep a day",
  );
});

test("a row addressed to one member reaches that member's phones only", async () => {
  const { db } = world({ notification: { kind: "note_for_you", recipient_user_id: "u2" } });
  const p = port();
  await dispatchJob(ctx(db, { push: p.push }), job);
  assert.deepEqual(
    p.sent.map((m) => m.to),
    ["tok-u2"],
  );
});

test("a phone the service reports gone is forgotten; a row nobody can hear, or that was purged, is done quietly", async () => {
  const { db, devices } = world();
  const p = port({ "tok-u1-b": { to: "tok-u1-b", status: "error", error: "DeviceNotRegistered" } });
  await dispatchJob(ctx(db, { push: p.push }), job);
  assert.deepEqual(devices.map((d) => d.token).sort(), ["tok-u1-a", "tok-u2", "tok-u9"]);
  const empty = fakeDb({
    notifications: [row()],
    memberships: [{ user_id: "u1", tenant_id: T, role: "owner" }],
    push_devices: [],
  });
  const q = port();
  assert.equal(await dispatchJob(ctx(empty, { push: q.push }), job), "done");
  assert.deepEqual(q.sent, []);
  const purged = fakeDb({ notifications: [], memberships: [], push_devices: [] });
  assert.equal(await dispatchJob(ctx(purged, { push: q.push }), job), "done");
  assert.deepEqual(q.sent, [], "a purged row says nothing");
});

test("a month's bell is counted whole, a page at a time and the marks in short lists", async () => {
  // The read of the window's rows is paged (a thousand a page) and the marks are asked for a hundred ids at a time:
  // a single read answers a thousand rows at most, and a hundred-odd uuids more in one `in` list is a URL too long.
  // The fake does not cap either; this holds the count right across the seams the paging introduces.
  const many = Array.from({ length: 1250 }, (_, i) =>
    row({ id: `n${i}`, created_at: `2026-09-${String(1 + (i % 25)).padStart(2, "0")}T10:00:00Z` }),
  );
  const db = fakeDb({
    notifications: many,
    memberships: [{ user_id: "u1", tenant_id: T, role: "owner" }],
    push_devices: [{ id: "d1", user_id: "u1", token: "tok-u1-a" }],
    notification_marks: [
      { notification_id: "n3", user_id: "u1", read_at: "2026-09-26T00:00:00Z", dismissed_at: null },
      { notification_id: "n1200", user_id: "u1", read_at: null, dismissed_at: "2026-09-26T00:00:00Z" },
    ],
  });
  const p = port();
  await dispatchJob(ctx(db, { push: p.push }), { ...job, payload: { notification_id: "n0" } });
  assert.equal(p.sent.length, 1);
  assert.equal(p.sent[0].badge, 1248, "every row of the window but the two marked");
});

test("a transport that fails throws, so the ledger tries again; a runtime without a port fails by name", async () => {
  const p = port(new Error("push_rejected 503"));
  await assert.rejects(dispatchJob(ctx(world().db, { push: p.push }), job), /push_rejected 503/);
  await assert.rejects(dispatchJob(ctx(world().db, {}), job), /push_send: this runtime holds no push transport/);
  assert.deepEqual(RETRY_WAITS_MS.push_send, [2 * 60_000, 10 * 60_000], "two minutes, then ten, before the row fails");
});
