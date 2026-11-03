/**
 * The catch-up a tab asks for (GET changes, apps/dashboard/src/server/live-feed.ts over packages/db noticesSince; 00508):
 * the workspace's notices since a moment, each as a table, an event, its statuses and its clock, never a row; `whole` false
 * where there were more than one answer carries, or the moment is past a day (Realtime drops a day's partition at a time),
 * and the tab then reads everything. And the browser's side (hearing/live-feed.ts catchUpLiveFeed): what it asks for is on
 * the servers' clock, on the early side, and an answer that is not whole is no answer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const { changesSince } = await importSrc("apps/dashboard/src/server/live-feed.ts");
const { noticesSince } = await importSrc("packages/db/src/realtime.ts");

/** A session's client whose rpc answers `rows` and records what it was asked. */
const clientAnswering = (rows, asked = []) => ({
  rpc: async (name, args) => {
    asked.push({ name, args });
    return { data: rows, error: null };
  },
});

const notice = (table, at, extra = {}) => ({ event: "INSERT", payload: { table, op: "INSERT", at, ...extra } });

test("the notices since a moment, each a table, an event, its statuses and its clock", async () => {
  const asked = [];
  const client = clientAnswering(
    [
      notice("messages", "2026-11-03T12:00:01.000Z"),
      {
        event: "UPDATE",
        payload: { table: "calls", op: "UPDATE", statuses: ["ongoing", "ended"], at: "2026-11-03T12:00:02.000Z" },
      },
      { event: "probe", payload: {} },
    ],
    asked,
  );
  const got = await changesSince(
    { supabase: client },
    { tenantId: "t1" },
    { since: "2026-11-03T12:00:00.000Z" },
    Date.parse("2026-11-03T12:05:00Z"),
  );
  assert.deepEqual(asked, [
    { name: "workspace_notices_since", args: { p_tenant_id: "t1", p_since: "2026-11-03T12:00:00.000Z" } },
  ]);
  assert.equal(got.whole, true);
  assert.deepEqual(
    got.notices,
    [
      { table: "messages", event: "INSERT", statuses: null, at: "2026-11-03T12:00:01.000Z" },
      { table: "calls", event: "UPDATE", statuses: ["ongoing", "ended"], at: "2026-11-03T12:00:02.000Z" },
    ],
    "a row that names no table is no notice",
  );
});

test("more than one answer carries is not whole, and the tab reads everything", async () => {
  const rows = Array.from({ length: 201 }, (_, i) =>
    notice("deals", new Date(Date.UTC(2026, 10, 3, 12, 0, i)).toISOString()),
  );
  const got = await noticesSince(clientAnswering(rows), "t1", "2026-11-03T12:00:00.000Z");
  assert.equal(got.notices.length, 200);
  assert.equal(got.whole, false);
});

test("a moment past a day asks nothing and answers not whole: the topic's partitions are being dropped", async () => {
  const asked = [];
  const got = await changesSince(
    { supabase: clientAnswering([], asked) },
    { tenantId: "t1" },
    { since: "2026-11-01T12:00:00.000Z" },
    Date.parse("2026-11-03T12:00:00Z"),
  );
  assert.deepEqual(got, { notices: [], whole: false });
  assert.equal(asked.length, 0);
});

test("a refused read throws, and the runner reads everything as before", async () => {
  const client = { rpc: async () => ({ data: null, error: { message: "permission denied" } }) };
  await assert.rejects(noticesSince(client, "t1", "2026-11-03T12:00:00.000Z"));
});
