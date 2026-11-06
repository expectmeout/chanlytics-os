/**
 * A customer's call that never connected, kept and told (the wiring's second audit, R11 S6-8). The bell's "Missed call"
 * row was derived in a browser that held the calls: with the app closed nothing was kept, mailed or pushed, and a dial
 * that never connected may never be analysed, which is when every other call is told.
 *
 * The real door (apps/edge/api/retell-webhook.ts) over the voice webhook's world: the delivery that says a customer's
 * call never connected keeps one "call" notice opening the call, mails it under the owner's choice for calls, and claims
 * the call, so a replay or a later analysis tells nobody again. The receptionist's own dial that nobody answered, and a
 * call the carrier flagged as spam, are no one's missed call. The bell shows the kept row in place of the one it derives
 * from the calls (contracts dedupeFeed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeFeed } from "@chanlytics/contracts";
import { openDoor, wire, DUPLICATE, NOW } from "./_retell-webhook-world.mjs";

// The door reads its keys at import; openDoor() imports it AFTER these lines, on purpose.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";
process.env.RETELL_API_KEY = "api-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { deliver, world } = await openDoor();

/** A dial that never connected, as the provider reports it when it ends. */
const neverConnected = (w, id, over = {}) =>
  w.call(id, {
    call_status: "not_connected",
    start_timestamp: NOW - 40_000,
    end_timestamp: NOW - 30_000,
    duration_ms: 0,
    disconnection_reason: "user_hangup",
    ...over,
  });

/** A world whose owner is mailed what the calls topic sends. */
function mailed() {
  const w = world();
  w.tables.tenant_config.push({
    tenant_id: w.T,
    config: { notifications: { escalation_emails: ["owner@harbor.test"] } },
  });
  return w;
}

test("a customer's call that never connected is kept on the bell, opening the call, mailed, and claimed: a replay tells nobody again", async () => {
  const w = mailed();
  w.open();
  const line = wire();
  try {
    const id = w.callId("missed");
    const res = await deliver("call_ended", neverConnected(w, id));
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);
    const call = w.tables.calls[0];
    assert.equal(call.status, "not_connected");
    assert.deepEqual(
      w.tables.notifications.map((n) => [n.kind, n.subject_type, n.subject_id, n.route]),
      [["call", "call", call.id, `conversations/cv-${call.id}`]],
      "one kept row about the call, opening it",
    );
    assert.match(w.tables.notifications[0].title, /^Missed call · /);
    assert.match(w.tables.notifications[0].body, /never connected, so nobody spoke with them/);
    assert.deepEqual(
      line.mail().map((m) => m.subject),
      [w.tables.notifications[0].title],
      "mailed under the owner's choice for calls",
    );
    assert.ok(call.notified_at, "claimed: told once per call");

    w.open({ "messages.insert": DUPLICATE("messages_tenant_external_uq") });
    const again = await deliver("call_ended", neverConnected(w, id));
    assert.deepEqual([again.status, await again.json()], [200, { ok: true, duplicate: true }]);
    assert.equal(w.tables.notifications.length, 1, "a replay finds the claim");
    assert.equal(line.mail().length, 1);
  } finally {
    line.restore();
  }
});

test("the receptionist's own dial that nobody answered, and a call the carrier flagged as spam, are no one's missed call: nothing kept, nothing mailed", async () => {
  const w = mailed();
  w.open();
  const line = wire();
  try {
    const out = await deliver("call_ended", neverConnected(w, w.callId("out"), { direction: "outbound" }));
    assert.equal(out.status, 200);
    const spam = await deliver(
      "call_ended",
      neverConnected(w, w.callId("spam"), { from_number: "+16465550124", disconnection_reason: "marked_as_spam" }),
    );
    assert.equal(spam.status, 200);
    assert.deepEqual(w.tables.notifications, []);
    assert.deepEqual(line.mail(), []);
  } finally {
    line.restore();
  }
});

test("the bell shows the kept missed call in place of the row it derives from the calls; with nothing kept, the derived row stands", () => {
  const derived = {
    key: "call:c1",
    kind: "missed_call",
    at: NOW,
    title: "Missed call · Rosa",
    message: "The call never connected.",
    to: "conversations/cv-c1",
    icon: "phone",
    tone: "warn",
    action: "See the call",
  };
  const kept = {
    key: "n:k1",
    kind: "call",
    at: NOW,
    title: "Missed call · Rosa",
    message: "+16465550123 rang and the call never connected, so nobody spoke with them.",
    to: "conversations/cv-c1",
    icon: "phone",
    tone: "",
    action: "Open the calls",
    unread: true,
    about: { type: "call", id: "c1" },
  };
  const another = { ...derived, key: "call:c2", to: "conversations/cv-c2" };
  assert.deepEqual(
    dedupeFeed([derived, kept, another]).map((r) => r.key),
    ["n:k1", "call:c2"],
    "one row per call: the kept one, and the derived row of a call nothing kept",
  );
  assert.deepEqual(
    dedupeFeed([derived]).map((r) => r.key),
    ["call:c1"],
  );
});
