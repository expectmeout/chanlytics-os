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
});

test("a shell message is navigate, menu or top; a route is a hash route's name, never a URL", () => {
  assert.deepEqual(parseShellMessage({ t: "navigate", route: "clients" }), { t: "navigate", route: "clients" });
  assert.deepEqual(parseShellMessage({ t: "menu" }), { t: "menu" });
  assert.deepEqual(parseShellMessage({ t: "top" }), { t: "top" });
  assert.equal(parseShellMessage({ t: "navigate", route: "https://example.com" }), null);
  assert.equal(parseShellMessage({ t: "navigate", route: "" }), null);
  assert.equal(parseShellMessage({ t: "reload" }), null);
  assert.equal(parseShellMessage(null), null);
});
