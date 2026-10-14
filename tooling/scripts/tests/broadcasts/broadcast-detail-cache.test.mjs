/**
 * A broadcast run's report, kept for the run in the tab (the loading standard's C): every open was a read first,
 * ~250ms of "Reading who got it…" on the salon's workspace, the second open of the same run too. The courier keeps
 * the last answer per run (read-cache.ts), so an open paints it at once and reads again behind; a refusal is never
 * kept, and any write empties what is kept, since it may have changed the run.
 * Run, never read: the courier over a fake wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let answer = () => json(200, { ok: true, data: { broadcast: { id: "b-1", state: "sent" }, recipients: [] } });
const asked = [];
globalThis.window = {
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  fetch: async (url, init = {}) => {
    asked.push(`${init.method || "GET"} ${new URL(String(url), "https://app.chanlytics.com").pathname}`);
    return answer();
  },
};
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const quiet = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { broadcasts } = await quiet(
  () => import("../../../../apps/dashboard/src/surfaces/campaigns/broadcasts/verbs.ts"),
);

test("a run's report is kept for the run once read, and a refusal never is", async () => {
  assert.equal(broadcasts.peekDetail("b-1"), null, "nothing held before a read");
  const r = await broadcasts.detail("b-1");
  assert.equal(r.ok, true);
  assert.equal(broadcasts.peekDetail("b-1").data.broadcast.id, "b-1", "the next open paints this at once");
  assert.equal(broadcasts.peekDetail("b-2"), null, "another run's is its own");
  answer = () => json(404, { ok: false, error: { code: "not_found", message: "Broadcast not found." } });
  await broadcasts.detail("b-2");
  assert.equal(broadcasts.peekDetail("b-2"), null, "a run that is not here is not kept as one that is");
});

test("a write empties what is kept: a cancel, an approve or a send may have changed the run", async () => {
  answer = () => json(200, { ok: true, data: { broadcast: { id: "b-1", state: "sent" }, recipients: [] } });
  await broadcasts.detail("b-1");
  assert.ok(broadcasts.peekDetail("b-1"));
  answer = () => json(200, { ok: true, data: { id: "b-1", state: "canceled" } });
  await quiet(() => broadcasts.cancel("b-1"));
  assert.equal(broadcasts.peekDetail("b-1"), null, "REGRESSION would be a canceled run opening as it was");
});

test("REGRESSION (S9-10): a run's approve and cancel are one intent each -- a press again before it lands is the same request, which the server answers once", async () => {
  const keys = [];
  const wire = window.fetch;
  // Every request on its way, let land together.
  const waiting = [];
  const land = () =>
    waiting.splice(0).forEach((r) => r(json(200, { ok: true, data: { id: "b-9", state: "sending" } })));
  window.fetch = (url, init = {}) => {
    keys.push(
      `${new URL(String(url), "https://app.chanlytics.com").pathname} ${init.headers?.["idempotency-key"] ?? "none"}`,
    );
    return new Promise((r) => waiting.push(r));
  };
  try {
    for (const verb of ["approve", "cancel"]) {
      keys.length = 0;
      const first = quiet(() => broadcasts[verb]("b-9"));
      const again = quiet(() => broadcasts[verb]("b-9"));
      await new Promise((r) => setTimeout(r, 0));
      const [a, b] = keys;
      assert.ok(a && !a.endsWith(" none"), `${verb}: it carries the intent's key (${a})`);
      assert.equal(b, a, `${verb}: the press again is the same request, so the server answers it once`);
      land();
      await Promise.all([first, again]);
      const next = quiet(() => broadcasts[verb]("b-9"));
      await new Promise((r) => setTimeout(r, 0));
      land();
      await next;
      assert.notEqual(keys.at(-1), a, `${verb}: once it has landed, a new press is a new intent`);
    }
  } finally {
    window.fetch = wire;
  }
});
