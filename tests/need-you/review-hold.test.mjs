/**
 * A Google review's reply is public the moment its door is called, so Need you holds it for the reply's grace (decision
 * 0071, E7; surfaces/today/need-you/sends.ts): Undo inside it posts nothing, and a tab closed inside it posts the reply
 * as it goes, by a request sent to outlive the page (fetch's keepalive, through the typed client), once and never again
 * when the grace runs out. Run on the real modules, with the clock in the test's hands.
 */
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { at } from "../_cron-doors-world.mjs";

// The tab the hold hooks its close on: an event target is all sends.ts asks of it.
globalThis.window ??= new EventTarget();
mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
const { holdReviewPost, undoSend } = await import(at("apps/dashboard/src/surfaces/today/need-you/sends.ts"));
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
const { SEND_GRACE_MS } = await import("@chanlytics/contracts");

const posts = [];
const held = (key) =>
  holdReviewPost(key, {
    who: "Jamie R.",
    post: async (asTabGoes) => {
      posts.push({ key, asTabGoes });
      return true;
    },
  });

test("Undo inside the grace posts nothing; left alone, the reply posts once its grace is out", async () => {
  posts.length = 0;
  held("q-r-undone");
  assert.deepEqual(await undoSend("q-r-undone"), { ok: true });
  mock.timers.tick(SEND_GRACE_MS + 1);
  await Promise.resolve();
  assert.deepEqual(posts, [], "nothing public was made");
  held("q-r-kept");
  mock.timers.tick(SEND_GRACE_MS + 1);
  await Promise.resolve();
  assert.deepEqual(posts, [{ key: "q-r-kept", asTabGoes: false }]);
});

test("a tab closed inside the grace posts the reply as it goes, to outlive the page, and never twice", async () => {
  posts.length = 0;
  held("q-r-closing");
  globalThis.window.dispatchEvent(new Event("pagehide"));
  await Promise.resolve();
  assert.deepEqual(posts, [{ key: "q-r-closing", asTabGoes: true }]);
  // A tab back from the back-forward cache: its timer was cleared with the post, so the grace's end posts nothing more.
  mock.timers.tick(SEND_GRACE_MS + 1);
  await Promise.resolve();
  assert.deepEqual(posts, [{ key: "q-r-closing", asTabGoes: true }]);
});

test("the typed client sends a write to outlive the page only when asked", async () => {
  const inits = [];
  const client = createApi({
    fetch: async (_url, init) => {
      inits.push(init);
      return new Response(JSON.stringify({ ok: true, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    workspace: () => "ws",
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async () => undefined,
  });
  const reply = { params: { id: "11111111-1111-4111-8111-111111111111" }, body: { comment: "Thank you!" } };
  await client("POST google/reviews/[id]/reply", { ...reply, keepalive: true, refresh: false });
  await client("POST google/reviews/[id]/reply", { ...reply, refresh: false });
  assert.deepEqual(
    inits.map((i) => i.keepalive === true),
    [true, false],
  );
});
