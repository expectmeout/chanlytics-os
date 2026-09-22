/**
 * A broadcast run's report, kept for the run in the tab (the loading standard's C): every open was a read first,
 * ~250ms of "Reading who got it…" on the salon's workspace, the second open of the same run too. The courier keeps
 * the last answer per run (read-cache.ts), so an open paints it at once and reads again behind; a refusal is never
 * kept, and any write empties what is kept, since it may have changed the run.
 * Run, never read: the courier over a fake wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let answer = () => json(200, { ok: true, data: { broadcast: { id: "b-1", state: "sent" }, recipients: [] } });
const asked = [];
globalThis.window = {
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return true; },
  fetch: async (url, init = {}) => { asked.push(`${init.method || "GET"} ${new URL(String(url), "https://app.chanlytics.com").pathname}`); return answer(); },
};
globalThis.document = { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };
const { broadcasts } = await quiet(() => import("../../../apps/dashboard/src/legacy-bridge/broadcast-verbs.ts"));

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
