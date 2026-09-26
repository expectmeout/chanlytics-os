/**
 * The two wires between the native shell and the page (contracts/app-bridge.ts): what the page says and what the
 * shell asks, each a small tagged object, parsed once on either side and refused when malformed. A route is a hash
 * route's name, never a URL: whoever wrote it, it goes into the address bar only after this check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePageMessage, parseShellMessage } from "../../../packages/contracts/src/app-bridge.ts";

test("a page message is one of four shapes; anything else is null", () => {
  assert.deepEqual(parsePageMessage('{"t":"route","route":"inbox"}'), { t: "route", route: "inbox" });
  assert.deepEqual(parsePageMessage('{"t":"route","route":"clients/abc-123"}'), {
    t: "route",
    route: "clients/abc-123",
  });
  assert.deepEqual(parsePageMessage('{"t":"needs","inbox":3}'), { t: "needs", inbox: 3 });
  assert.deepEqual(parsePageMessage('{"t":"session","state":"out"}'), { t: "session", state: "out" });
  assert.deepEqual(parsePageMessage('{"t":"workspace","slug":"acme-plumbing"}'), {
    t: "workspace",
    slug: "acme-plumbing",
  });
  assert.equal(parsePageMessage('{"t":"needs","inbox":"three"}'), null);
  assert.equal(parsePageMessage('{"t":"needs","inbox":-1}'), null);
  assert.equal(parsePageMessage('{"t":"session","state":"maybe"}'), null);
  assert.equal(parsePageMessage('{"t":"workspace","slug":"  "}'), null);
  assert.equal(parsePageMessage("not json"), null);
  assert.equal(parsePageMessage("[]"), null);
  assert.equal(parsePageMessage('{"t":"route","route":"javascript:alert(1)"}'), null);
  assert.equal(parsePageMessage('{"t":"route","route":"https://example.com"}'), null);
  assert.deepEqual(parsePageMessage('{"t":"badge","n":4}'), { t: "badge", n: 4 });
  assert.equal(parsePageMessage('{"t":"badge","n":-1}'), null);
  assert.deepEqual(parsePageMessage('{"t":"device","state":"registered"}'), { t: "device", state: "registered" });
  assert.equal(parsePageMessage('{"t":"device","state":"lost"}'), null);
  const snap = {
    headline: "h",
    figures: [{ label: "calls", value: 2 }],
    waiting: 1,
    first: null,
    at: "2026-09-26T15:00:00.000Z",
  };
  assert.deepEqual(parsePageMessage(JSON.stringify({ t: "today", snapshot: snap })), { t: "today", snapshot: snap });
  assert.equal(parsePageMessage(JSON.stringify({ t: "today", snapshot: { headline: "h" } })), null);
  assert.deepEqual(parsePageMessage('{"t":"token","access":" tok ","expires":1800000000}'), {
    t: "token",
    access: "tok",
    expires: 1800000000,
  });
  assert.deepEqual(parsePageMessage('{"t":"token","access":null,"expires":0}'), {
    t: "token",
    access: null,
    expires: 0,
  });
  assert.deepEqual(parsePageMessage('{"t":"token","access":"","expires":"x"}'), {
    t: "token",
    access: null,
    expires: 0,
  });
  assert.deepEqual(parsePageMessage('{"t":"calls","live":0}'), { t: "calls", live: 0 });
  assert.deepEqual(parsePageMessage('{"t":"calls","live":2}'), { t: "calls", live: 2 });
  assert.equal(parsePageMessage('{"t":"calls","live":-1}'), null);
  assert.equal(parsePageMessage('{"t":"calls","live":"2"}'), null);
});

test("a shell message is navigate, menu or top; a route is a hash route's name, never a URL", () => {
  assert.deepEqual(parseShellMessage({ t: "navigate", route: "clients" }), { t: "navigate", route: "clients" });
  assert.deepEqual(parseShellMessage({ t: "menu" }), { t: "menu" });
  assert.deepEqual(parseShellMessage({ t: "top" }), { t: "top" });
  assert.deepEqual(parseShellMessage({ t: "token" }), { t: "token" });
  assert.equal(parseShellMessage({ t: "navigate", route: "https://example.com" }), null);
  assert.equal(parseShellMessage({ t: "navigate", route: "" }), null);
  assert.equal(parseShellMessage({ t: "reload" }), null);
  assert.equal(parseShellMessage(null), null);
});

test("the shell's device ask carries a token, a platform and a version; forget carries the token", () => {
  assert.deepEqual(
    parseShellMessage({ t: "device", token: " ExponentPushToken[abc] ", platform: "ios", version: "1.0.0" }),
    {
      t: "device",
      token: "ExponentPushToken[abc]",
      platform: "ios",
      version: "1.0.0",
    },
  );
  assert.equal(parseShellMessage({ t: "device", token: "", platform: "ios", version: "1" }), null);
  assert.equal(parseShellMessage({ t: "device", token: "x", platform: "web", version: "1" }), null);
  assert.equal(parseShellMessage({ t: "device", token: "x".repeat(201), platform: "ios", version: "1" }), null);
  assert.deepEqual(
    parseShellMessage({ t: "device", token: "x", platform: "ios", version: "1", activity: " act " }),
    { t: "device", token: "x", platform: "ios", version: "1", activity: "act" },
    "the activity token rides along when the phone has one",
  );
  assert.deepEqual(parseShellMessage({ t: "device", token: "x", platform: "ios", version: "1", activity: "" }), {
    t: "device",
    token: "x",
    platform: "ios",
    version: "1",
  });
  assert.deepEqual(parseShellMessage({ t: "forget", token: "tok" }), { t: "forget", token: "tok" });
  assert.equal(parseShellMessage({ t: "forget" }), null);
});
