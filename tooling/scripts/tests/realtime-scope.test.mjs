/**
 * Realtime is scoped to the workspace the tab shows. The wrapper in
 * packages/db puts the workspace filter on every watched table when it is
 * told which one; RLS still authorises server-side. The bridge is the one
 * caller, and it must say which workspace: a member of two workspaces must
 * not receive, or repaint on, the other one's rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribeMessagesInserts } from "@chanlytics/db";

/** A client whose channel records what it was asked to listen to. */
function fakeClient() {
  const listened = [];
  let onStatus = null;
  const channel = {
    on(kind, spec, cb) { listened.push({ kind, ...spec, cb }); return channel; },
    subscribe(cb) { onStatus = cb; return channel; },
  };
  const client = {
    token: null,
    topic: null,
    removed: false,
    auth: { getSession: async () => ({ data: { session: { access_token: "jwt" } } }) },
    realtime: { setAuth(t) { client.token = t; } },
    channel(topic) { client.topic = topic; return channel; },
    async removeChannel() { client.removed = true; },
  };
  return { client, listened, fire: (s) => onStatus && onStatus(s) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("with a workspace named, every watched table is filtered to it, on a topic of its own", async () => {
  const { client, listened } = fakeClient();
  const off = subscribeMessagesInserts(client, () => {}, { tenantId: "ws-1", topic: "bridge:ws-1" });
  await tick();
  assert.ok(listened.length >= 9, `every watched table (${listened.length})`);
  for (const l of listened) assert.equal(l.filter, "tenant_id=eq.ws-1", `${l.table} is filtered to the workspace`);
  assert.equal(client.topic, "db-changes:bridge:ws-1");
  assert.equal(client.token, "jwt", "the session token is pushed before the join, or the channel joins as anon and hears nothing");
  off();
  assert.equal(client.removed, true);
});

test("a row arrives with the table it came from and the event", async () => {
  const { client, listened } = fakeClient();
  const seen = [];
  subscribeMessagesInserts(client, (row, table, event) => seen.push({ row, table, event }), { tenantId: "ws-1" });
  await tick();
  const messages = listened.find((l) => l.table === "messages");
  messages.cb({ eventType: "INSERT", new: { conversation_id: "c1", tenant_id: "ws-1" } });
  assert.deepEqual(seen, [{ row: { conversation_id: "c1", tenant_id: "ws-1" }, table: "messages", event: "INSERT" }]);
});

test("without a workspace, nothing is filtered: the caller must say", async () => {
  const { client, listened } = fakeClient();
  subscribeMessagesInserts(client, () => {}, {});
  await tick();
  assert.ok(listened.length >= 9);
  for (const l of listened) assert.equal(l.filter, undefined);
});
