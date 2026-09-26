/**
 * The shell's side of the bridge (src/shell/bridge.ts): a page's message becomes the next state and, for a person
 * signed out, the sign-in screen; a shell's ask becomes one line of JavaScript; the bottom inset is iOS's bar plus
 * the home indicator, and nothing on Android.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { onPageMessage, askPage, insetScript, bottomInset, IOS_TAB_BAR_PT } from "../src/shell/bridge.ts";
import { INITIAL } from "../src/shell/state.ts";

test("a page's messages move the state; only 'out' asks for the sign-in screen", () => {
  let s = INITIAL;
  let r = onPageMessage(s, '{"t":"session","state":"in"}');
  assert.equal(r.state.session, "in");
  assert.equal(r.effect, "nothing");
  r = onPageMessage(r.state, '{"t":"workspace","slug":"acme-plumbing"}');
  assert.equal(r.state.slug, "acme-plumbing");
  r = onPageMessage(r.state, '{"t":"needs","inbox":4}');
  assert.equal(r.state.needs, 4);
  r = onPageMessage(r.state, '{"t":"route","route":"inbox"}');
  assert.equal(r.effect, "nothing");
  const before = r.state;
  r = onPageMessage(r.state, "garbage");
  assert.equal(r.state, before, "unparsed: untouched");
  r = onPageMessage(r.state, '{"t":"session","state":"out"}');
  assert.equal(r.effect, "sign-in");
});

test("an ask is one injectable line that ends in true", () => {
  const js = askPage({ t: "navigate", route: "clients" });
  assert.equal(
    js,
    'window.__appBridge&&window.__appBridge.receive("{\\"t\\":\\"navigate\\",\\"route\\":\\"clients\\"}");true;',
  );
  assert.ok(askPage({ t: "menu" }).endsWith("true;"));
  assert.equal(insetScript(83.4), 'document.documentElement.style.setProperty("--app-inset-bottom","83px");true;');
  assert.equal(insetScript(-5), 'document.documentElement.style.setProperty("--app-inset-bottom","0px");true;');
});

test("the bottom inset: iOS's bar plus the safe area; Android none", () => {
  assert.equal(bottomInset("ios", 34), IOS_TAB_BAR_PT + 34);
  assert.equal(bottomInset("ios", 0), IOS_TAB_BAR_PT);
  assert.equal(bottomInset("android", 24), 0);
});
