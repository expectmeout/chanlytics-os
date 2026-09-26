/**
 * push_send, run over the fake database and a recording push port: the readers of a kept row (the one it is
 * addressed to, else every member), their phones, one message each, a phone the service says is gone forgotten, and
 * a transport that fails thrown so the ledger tries again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { dispatchJob } from "../../../../packages/jobs/src/handlers.ts";
import { RETRY_WAITS_MS } from "../../../../packages/jobs/src/ledger.ts";

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
        return messages.map((m) => answer?.[m.to] ?? { to: m.to, status: "ok" });
      },
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
    data: { route: "inbox/th-1", notification_id: "n1", tenant_id: T },
  });
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

test("a transport that fails throws, so the ledger tries again; a runtime without a port fails by name", async () => {
  const p = port(new Error("push_rejected 503"));
  await assert.rejects(dispatchJob(ctx(world().db, { push: p.push }), job), /push_rejected 503/);
  await assert.rejects(dispatchJob(ctx(world().db, {}), job), /push_send: this runtime holds no push transport/);
  assert.deepEqual(RETRY_WAITS_MS.push_send, [2 * 60_000, 10 * 60_000], "two minutes, then ten, before the row fails");
});
