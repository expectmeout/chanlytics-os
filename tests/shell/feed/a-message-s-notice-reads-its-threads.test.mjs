/**
 * A message's notice names its threads (00510; the page-open PRD of 3 Nov 2026, L13), and the Inbox reads those threads by
 * id into the list it holds instead of the hundred newest threads again (surfaces/inbox/surface.ts threadsMovedBy,
 * threadsInto). Anything else, or a notice that named none, reads the list. And the feed hands the threads on as the
 * topic said them (packages/db realtime.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { changesOf } from "../../_live-feed.mjs";

const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { threadsMovedBy, threadsInto } = await quietly(() => importSrc("apps/dashboard/src/surfaces/inbox/surface.ts"));

const msg = (threads, event = "INSERT") => ({ table: "messages", event, row: {}, ...(threads ? { threads } : {}) });

test("messages alone, each naming its threads: those threads, once each", () => {
  assert.deepEqual(threadsMovedBy([msg(["c1"]), msg(["c2", "c1"], "UPDATE")]), ["c1", "c2"]);
});

test("anything else reads the list: a hold, a thread's row, a call, a notice naming none, or a read nobody heard of", () => {
  assert.equal(threadsMovedBy(undefined), null, "a write's, a pass's or the boot's read");
  assert.equal(threadsMovedBy([]), null);
  assert.equal(
    threadsMovedBy([msg(["c1"]), { table: "escalations", event: "INSERT", row: {}, threads: ["c1"] }]),
    null,
  );
  assert.equal(threadsMovedBy([msg(["c1"]), msg(null)]), null, "a notice past the threads it carries named none");
  assert.equal(threadsMovedBy([{ table: "conversations", event: "UPDATE", row: {}, threads: ["c1"] }]), null);
});

test("the threads read go into the list by their newest message, and the hundred newest are kept", () => {
  const at = (m) => new Date(Date.UTC(2026, 10, 3, 12, m)).toISOString();
  const list = Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, last_message_at: at(100 - i) }));
  const merged = threadsInto(list, [
    { id: "c99", last_message_at: at(200) },
    { id: "new", last_message_at: at(150) },
  ]);
  assert.equal(merged.length, 100, "the list holds a hundred");
  assert.deepEqual(
    merged.slice(0, 3).map((c) => c.id),
    ["c99", "new", "c0"],
    "a thread that just moved stands first",
  );
  assert.ok(!merged.some((c) => c.id === "c98"), "the oldest falls out of the hundred, as the list's own read would");
});

test("the feed hands on the threads a notice names, and none where it named none", async () => {
  const named = await changesOf({
    event: "INSERT",
    payload: { table: "messages", op: "INSERT", threads: ["c1", "c2"] },
  });
  assert.deepEqual(named[0].threads, ["c1", "c2"]);
  const none = await changesOf({ event: "INSERT", payload: { table: "messages", op: "INSERT" } });
  assert.equal(none[0].threads, undefined);
});
