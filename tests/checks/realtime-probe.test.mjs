/**
 * The production smoke's Realtime probe (tooling/scripts/checks/realtime-probe.mjs; the page-open PRD of 3 Nov 2026, L6):
 * a join's answer judged as Realtime gives it, and the address it asks on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeJoin, socketOf } from "../../tooling/scripts/checks/realtime-probe.mjs";

test("a join is admitted, refused, or unanswered, by Realtime's own reply", () => {
  assert.equal(judgeJoin({ event: "phx_reply", payload: { status: "ok", response: {} } }), "admitted");
  assert.equal(
    judgeJoin({ event: "phx_reply", payload: { status: "error", response: { reason: "Unauthorized" } } }),
    "refused",
  );
  assert.equal(judgeJoin(null), "unanswered");
  assert.equal(judgeJoin({ event: "presence_state", payload: {} }), "unanswered");
});

test("the probe asks the project's own Realtime, with the public key and the protocol's version", () => {
  assert.equal(
    socketOf("https://abc.supabase.co", "anon-key"),
    "wss://abc.supabase.co/realtime/v1/websocket?apikey=anon-key&vsn=1.0.0",
  );
  assert.equal(
    socketOf("http://127.0.0.1:54321", "k"),
    "ws://127.0.0.1:54321/realtime/v1/websocket?apikey=k&vsn=1.0.0",
  );
});
