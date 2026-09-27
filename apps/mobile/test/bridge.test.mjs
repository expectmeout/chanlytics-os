/**
 * The shell's side of the bridge (src/shell/bridge.ts): a page's message becomes the next state and, for a person
 * signed out, the sign-in screen; a shell's ask becomes one line of JavaScript; the bottom inset is iOS's bar plus
 * the home indicator, and nothing on Android.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  onPageMessage,
  askPage,
  insetScript,
  bottomInset,
  IOS_TAB_BAR_PT,
  shouldRegister,
  registrationKey,
} from "../src/shell/bridge.ts";
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

test("the bell's number is the icon's; a device answer settles what is registered; out forgets the person", () => {
  let r = onPageMessage({ ...INITIAL, token: "tok" }, '{"t":"badge","n":5}');
  assert.equal(r.effect, "badge");
  assert.equal(r.state.badge, 5);
  r = onPageMessage(r.state, '{"t":"device","state":"registered"}');
  assert.equal(r.state.registered, "tok|");
  r = onPageMessage(r.state, '{"t":"device","state":"refused"}');
  assert.equal(r.state.registered, null, "refused: the next chance asks again");
  r = onPageMessage({ ...r.state, session: "in", slug: "acme", registered: "tok" }, '{"t":"session","state":"out"}');
  assert.equal(r.state.registered, null);
  assert.equal(r.state.slug, null);
});

test("a page in front is asked to register once per token pair per person", () => {
  assert.ok(shouldRegister({ ...INITIAL, session: "in", token: "tok", registered: null }));
  assert.ok(shouldRegister({ ...INITIAL, session: "in", token: "tok2", registered: "tok|" }), "a rotated token");
  assert.ok(!shouldRegister({ ...INITIAL, session: "in", token: "tok", registered: "tok|" }));
  assert.ok(
    shouldRegister({ ...INITIAL, session: "in", token: "tok", activityToken: "act", registered: "tok|" }),
    "an activity token that arrived after the push token registers again",
  );
  assert.ok(!shouldRegister({ ...INITIAL, session: "in", token: "tok", activityToken: "act", registered: "tok|act" }));
  assert.equal(registrationKey({ token: null, activityToken: "act" }), null, "no push token, nothing to register");
  assert.ok(!shouldRegister({ ...INITIAL, session: "out", token: "tok", registered: null }));
  assert.ok(!shouldRegister({ ...INITIAL, session: "in", token: null, registered: null }), "a simulator has no token");
});

test("the Live page's count of calls in progress ends the call's activity only at none", () => {
  assert.equal(onPageMessage(INITIAL, '{"t":"calls","live":0}').effect, "calls-over");
  assert.equal(onPageMessage(INITIAL, '{"t":"calls","live":1}').effect, "nothing");
});

test("the page's token lands in the state and leaves with the person", () => {
  let r = onPageMessage(INITIAL, '{"t":"token","access":"tok","expires":1800000000}');
  assert.deepEqual(r.state.access, { token: "tok", expires: 1800000000 });
  assert.equal(r.effect, "nothing");
  r = onPageMessage(r.state, '{"t":"token","access":null,"expires":0}');
  assert.equal(r.state.access, null);
  r = onPageMessage({ ...INITIAL, access: { token: "tok", expires: 1 } }, '{"t":"session","state":"out"}');
  assert.equal(r.state.access, null);
});
