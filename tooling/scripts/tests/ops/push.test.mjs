/**
 * A phone can be told: what a device registration accepts, which kept kinds reach a phone, and the words a phone
 * shows -- the bell's own, once per device.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDevice,
  PUSH_KINDS,
  PUSH_PLATFORMS,
  isPushKind,
  pushFor,
  firstLine,
  SERVER_NOTIFICATION_KINDS,
  JOB_KINDS,
  unreadFor,
  PUSH_RECEIPTS_AFTER_MS,
} from "../../../../packages/contracts/src/index.ts";

test("a device is a token and a platform; the version is kept short; anything else is refused in a sentence", () => {
  assert.deepEqual(parseDevice({ token: " ExponentPushToken[abc] ", platform: "ios", app_version: "1.2.0" }), {
    ok: true,
    device: { token: "ExponentPushToken[abc]", platform: "ios", app_version: "1.2.0", activity_token: null },
  });
  assert.deepEqual(parseDevice({ token: "t", platform: "android" }), {
    ok: true,
    device: { token: "t", platform: "android", app_version: null, activity_token: null },
  });
  assert.equal(
    parseDevice({ token: "t", platform: "ios", activity_token: " act " }).device.activity_token,
    "act",
    "the Live Activity's push-to-start token rides along",
  );
  assert.equal(parseDevice({ token: "t", platform: "ios", activity_token: "x".repeat(201) }).ok, false);
  assert.equal(parseDevice({ platform: "ios" }).reason, "A device needs its push token.");
  assert.equal(parseDevice({ token: "t", platform: "windows" }).reason, "A device is an iPhone or an Android phone.");
  assert.equal(parseDevice({ token: "x".repeat(201), platform: "ios" }).ok, false);
  assert.equal(parseDevice(null).ok, false);
  assert.deepEqual(PUSH_PLATFORMS, ["ios", "android"]);
});

test("the kinds a phone hears about are kept kinds, and not all of them; the ledger knows push_send", () => {
  for (const k of PUSH_KINDS) assert.ok(SERVER_NOTIFICATION_KINDS.includes(k), k);
  for (const k of ["sweep", "deadman", "alert"]) assert.ok(!isPushKind(k), `${k} stays off the phone`);
  assert.ok(isPushKind("handoff") && isPushKind("call") && isPushKind("note_for_you"));
  assert.ok(JOB_KINDS.includes("push_send") && JOB_KINDS.includes("push_receipts"));
});

test("a phone shows the bell's words: the title, the first line of the body, and where to go", () => {
  const n = {
    id: "n1",
    tenant_id: "t1",
    kind: "handoff",
    title: "WhatsApp handoff needed: +13055550134",
    body: "\n  The assistant flagged a conversation for a human.  \n\nCustomer: +13055550134",
    route: "inbox/th-abc",
  };
  const one = (to, badge) => ({
    to,
    title: n.title,
    body: "The assistant flagged a conversation for a human.",
    sound: "default",
    badge,
    data: { route: "inbox/th-abc", notification_id: "n1", tenant_id: "t1" },
  });
  assert.deepEqual(
    pushFor(n, [
      { token: "tok-a", badge: 3 },
      { token: "tok-b", badge: 0 },
    ]),
    [one("tok-a", 3), one("tok-b", 0)],
  );
  assert.equal(firstLine("x".repeat(200)).length, 160);
  assert.equal(firstLine("\n\n"), "");
  assert.deepEqual(pushFor({ ...n, route: null }, []), []);
});

test("the badge is the bell's number: rows newer than the seen moment, not marked read or dismissed (00189)", () => {
  const rows = [
    { id: "a", created_at: "2026-09-26T10:00:00Z" },
    { id: "b", created_at: "2026-09-26T11:00:00Z" },
    { id: "c", created_at: "2026-09-26T12:00:00Z" },
    { id: "d", created_at: "2026-09-26T13:00:00Z" },
  ];
  const marks = [
    { notification_id: "c", read_at: "2026-09-26T12:30:00Z", dismissed_at: null },
    { notification_id: "d", read_at: null, dismissed_at: "2026-09-26T13:30:00Z" },
    { notification_id: "b", read_at: null, dismissed_at: null },
  ];
  assert.equal(unreadFor(rows, null, []), 4, "never opened, nothing marked: every row");
  assert.equal(unreadFor(rows, "2026-09-26T10:30:00Z", []), 3, "the seen moment hides what came before it");
  assert.equal(
    unreadFor(rows, "2026-09-26T10:30:00Z", marks),
    1,
    "a read or dismissed row is not unread; an empty mark is",
  );
  assert.equal(unreadFor([], "2026-09-26T10:30:00Z", marks), 0);
  assert.equal(PUSH_RECEIPTS_AFTER_MS, 15 * 60_000, "what Expo asks");
});
