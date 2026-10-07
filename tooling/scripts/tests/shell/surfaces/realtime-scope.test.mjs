/**
 * The live feed is the workspace's own topic (decision 0019). The database tells each workspace what changed on
 * `workspace:<id>:changes` (00265), and the wrapper in packages/db joins that topic privately, after pushing the
 * session's token, for the workspace the tab shows: a member of two workspaces neither hears nor repaints on the other
 * one's changes. A notice names a table and an event, and a call's statuses; the runner hears each as a change.
 *
 * The fake client behaves as realtime-js 2.116.0 does where the wrapper depends on it: `channel(topic)` hands back the
 * channel it already has for a topic, a channel joins once (a second `subscribe` does nothing), and a removed channel
 * stays the topic's until its leave is answered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribeWorkspaceChanges } from "@chanlytics/db";

function fakeClient({ session = { access_token: "jwt" } } = {}) {
  const said = [];
  const channels = new Map();
  const made = [];
  const client = {
    auth: {
      getSession: async () => {
        if (session instanceof Error) throw session;
        return { data: { session } };
      },
    },
    realtime: {
      setAuth(token) {
        said.push(`token ${token}`);
      },
    },
    channel(topic, params = {}) {
      const had = channels.get(topic);
      if (had) return had;
      const channel = {
        topic,
        params,
        bindings: [],
        joins: 0,
        removed: false,
        onStatus: null,
        on(type, filter, callback) {
          channel.bindings.push({ type, filter, callback });
          return channel;
        },
        subscribe(callback) {
          if (channel.joins++ === 0) {
            channel.onStatus = callback;
            said.push(`join ${topic}`);
          }
          return channel;
        },
        /** The server's word: a broadcast to every binding it matches, or a status. */
        broadcast(event, payload) {
          for (const b of channel.bindings)
            if (b.type === "broadcast" && (b.filter.event === "*" || b.filter.event === event))
              b.callback({ type: "broadcast", event, payload });
        },
        status(s) {
          channel.onStatus?.(s);
        },
      };
      channels.set(topic, channel);
      made.push(channel);
      return channel;
    },
    /** Leaving takes a round trip; until it is answered, the topic still hands back this channel. */
    async removeChannel(channel) {
      said.push(`leave ${channel.topic}`);
      await new Promise((r) => setTimeout(r, 5));
      channel.removed = true;
      channel.onStatus?.("CLOSED");
      if (channels.get(channel.topic) === channel) channels.delete(channel.topic);
      return "ok";
    },
  };
  return { client, said, made };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test("the tab joins its workspace's topic privately, after pushing the session's token, and binds nothing else", async () => {
  const { client, said, made } = fakeClient();
  const off = subscribeWorkspaceChanges(client, () => {}, { tenantId: "ws-1", onStatus: () => {} });
  await tick();
  assert.deepEqual(
    said,
    ["token jwt", "join workspace:ws-1:changes"],
    "the token first, or it joins as anon and is refused",
  );
  assert.equal(made.length, 1);
  const [channel] = made;
  assert.equal(channel.params.config.private, true, "a private topic: Realtime asks the policy who may listen");
  assert.deepEqual(
    channel.bindings.map((b) => [b.type, b.filter]),
    [["broadcast", { event: "*" }]],
    "every notice, and no table's changes bound one by one",
  );
  off();
  await tick(10);
  assert.equal(channel.removed, true, "the last to leave removes the channel");
});

test("a notice reaches the runner as its table, its event and a row of the workspace, and a call's two statuses as two changes", async () => {
  const { client, made } = fakeClient();
  const seen = [];
  subscribeWorkspaceChanges(client, (row, table, event) => seen.push({ row, table, event }), {
    tenantId: "ws-1",
    onStatus: () => {},
  });
  await tick();
  const [channel] = made;
  channel.broadcast("INSERT", { table: "messages", op: "INSERT", id: "n1" });
  channel.broadcast("DELETE", { table: "segment_members", op: "DELETE", id: "n2" });
  channel.broadcast("UPDATE", { table: "calls", op: "UPDATE", statuses: ["ended", "ongoing"], id: "n3" });
  channel.broadcast("UPDATE", { op: "UPDATE", id: "n4" });
  assert.deepEqual(seen, [
    { row: { tenant_id: "ws-1" }, table: "messages", event: "INSERT" },
    { row: { tenant_id: "ws-1" }, table: "segment_members", event: "DELETE" },
    { row: { tenant_id: "ws-1", status: "ended" }, table: "calls", event: "UPDATE" },
    { row: { tenant_id: "ws-1", status: "ongoing" }, table: "calls", event: "UPDATE" },
  ]);
});

test("two runners on one client share the topic's channel, and the first to leave does not close the second's", async () => {
  const { client, said, made } = fakeClient();
  const a = { seen: [], statuses: [] };
  const b = { seen: [], statuses: [] };
  const offA = subscribeWorkspaceChanges(client, (_row, table) => a.seen.push(table), {
    tenantId: "ws-1",
    onStatus: (s) => a.statuses.push(s),
  });
  const offB = subscribeWorkspaceChanges(client, (_row, table) => b.seen.push(table), {
    tenantId: "ws-1",
    onStatus: (s) => b.statuses.push(s),
  });
  await tick();
  assert.equal(made.length, 1, "one channel for the topic");
  assert.equal(said.filter((s) => s.startsWith("join")).length, 1, "joined once");
  const [channel] = made;
  channel.status("SUBSCRIBED");
  assert.deepEqual([a.statuses, b.statuses], [["SUBSCRIBED"], ["SUBSCRIBED"]], "each runner hears the join");
  channel.broadcast("INSERT", { table: "deals", op: "INSERT" });
  offA();
  await tick(10);
  assert.equal(channel.removed, false, "the second runner still listens");
  channel.broadcast("UPDATE", { table: "deals", op: "UPDATE" });
  assert.deepEqual([a.seen, b.seen], [["deals"], ["deals", "deals"]], "only the runner still listening hears on");
  offB();
  await tick(10);
  assert.equal(channel.removed, true, "the last to leave removes it");
  assert.deepEqual(b.statuses, ["SUBSCRIBED"], "its own close is not told to anyone as a drop");
});

test("a runner that arrives once the channel is up is told it is up", async () => {
  const { client, made } = fakeClient();
  subscribeWorkspaceChanges(client, () => {}, { tenantId: "ws-1", onStatus: () => {} });
  await tick();
  made[0].status("SUBSCRIBED");
  const late = [];
  subscribeWorkspaceChanges(client, () => {}, { tenantId: "ws-1", onStatus: (s) => late.push(s) });
  await tick();
  assert.deepEqual(late, ["SUBSCRIBED"], "its feed counts as joined, so a later rejoin reads what it missed");
  assert.equal(made.length, 1);
});

test("a join right after the last runner left waits for that channel to go, and joins a new one", async () => {
  const { client, said, made } = fakeClient();
  const off = subscribeWorkspaceChanges(client, () => {}, { tenantId: "ws-1", onStatus: () => {} });
  await tick();
  made[0].status("SUBSCRIBED");
  off();
  const seen = [];
  const statuses = [];
  subscribeWorkspaceChanges(client, (_row, table) => seen.push(table), {
    tenantId: "ws-1",
    onStatus: (s) => statuses.push(s),
  });
  await tick(20);
  assert.deepEqual(statuses, [], "the old channel's close is not the new runner's drop, nor its join");
  assert.equal(made.length, 2, "the leaving channel is not handed back to the new runner");
  assert.equal(made[0].removed, true);
  assert.deepEqual(said, [
    "token jwt",
    "join workspace:ws-1:changes",
    "leave workspace:ws-1:changes",
    "token jwt",
    "join workspace:ws-1:changes",
  ]);
  made[1].broadcast("INSERT", { table: "notifications", op: "INSERT" });
  assert.deepEqual(seen, ["notifications"]);
});

test("a runner that leaves before its join is made joins nothing", async () => {
  const { client, made } = fakeClient();
  const off = subscribeWorkspaceChanges(client, () => {}, { tenantId: "ws-1", onStatus: () => {} });
  off();
  await tick(10);
  assert.equal(made.length, 0);
});

test("each workspace is a topic of its own", async () => {
  const { client, made } = fakeClient();
  subscribeWorkspaceChanges(client, () => {}, { tenantId: "ws-1", onStatus: () => {} });
  subscribeWorkspaceChanges(client, () => {}, { tenantId: "ws-2", onStatus: () => {} });
  await tick();
  assert.deepEqual(
    made.map((c) => c.topic),
    ["workspace:ws-1:changes", "workspace:ws-2:changes"],
  );
});

test("a tab with no workspace joins nothing", async () => {
  const { client, said, made } = fakeClient();
  const off = subscribeWorkspaceChanges(client, () => {}, { onStatus: () => {} });
  await tick();
  assert.deepEqual([said, made.length], [[], 0]);
  off();
});

test("a session that cannot be read joins nothing, and the feed says it is down", async () => {
  const { client, made } = fakeClient({ session: new Error("storage unavailable") });
  const statuses = [];
  subscribeWorkspaceChanges(client, () => {}, { tenantId: "ws-1", onStatus: (s) => statuses.push(s) });
  await tick();
  assert.deepEqual([made.length, statuses], [0, ["CHANNEL_ERROR"]]);
});
