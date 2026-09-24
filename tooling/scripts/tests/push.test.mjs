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
} from "../../../packages/contracts/src/index.ts";

test("a device is a token and a platform; the version is kept short; anything else is refused in a sentence", () => {
  assert.deepEqual(parseDevice({ token: " ExponentPushToken[abc] ", platform: "ios", app_version: "1.2.0" }), {
    ok: true,
    device: { token: "ExponentPushToken[abc]", platform: "ios", app_version: "1.2.0" },
  });
  assert.deepEqual(parseDevice({ token: "t", platform: "android" }), {
    ok: true,
    device: { token: "t", platform: "android", app_version: null },
  });
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
  assert.ok(JOB_KINDS.includes("push_send"));
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
  const one = (to) => ({
    to,
    title: n.title,
    body: "The assistant flagged a conversation for a human.",
    sound: "default",
    data: { route: "inbox/th-abc", notification_id: "n1", tenant_id: "t1" },
  });
  assert.deepEqual(pushFor(n, ["tok-a", "tok-b"]), [one("tok-a"), one("tok-b")]);
  assert.equal(firstLine("x".repeat(200)).length, 160);
  assert.equal(firstLine("\n\n"), "");
  assert.deepEqual(pushFor({ ...n, route: null }, []), []);
});
