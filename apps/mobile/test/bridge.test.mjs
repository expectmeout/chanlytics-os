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
  signedOut,
} from "../src/shell/bridge.ts";
import { INITIAL } from "../src/shell/state.ts";

test("a page's messages move the state; 'out' is the signed-out state the root layout draws the sign-in screen for", () => {
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
  // What stands over one page is that page's own (Surface.tsx, for Android's Back), never the shell's state.
  const held = r.state;
  r = onPageMessage(r.state, '{"t":"overlay","open":true}');
  assert.equal(r.state, held);
  assert.equal(r.effect, "nothing");
  const before = r.state;
  r = onPageMessage(r.state, "garbage");
  assert.equal(r.state, before, "unparsed: untouched");
  r = onPageMessage(r.state, '{"t":"session","state":"out"}');
  assert.equal(r.state.session, "out");
  assert.equal(r.effect, "nothing");
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
  assert.equal(r.state.registered, null);
  assert.equal(r.state.refused, "tok|", "refused: this pair is not asked again until the next foreground");
  assert.ok(!shouldRegister({ ...r.state, session: "in" }), "not in a loop");
  assert.ok(shouldRegister({ ...r.state, session: "in", refused: null }), "asked once more on the next foreground");
  r = onPageMessage({ ...r.state, session: "in", slug: "acme", registered: "tok" }, '{"t":"session","state":"out"}');
  assert.equal(r.state.registered, null);
  assert.equal(r.state.slug, null);
});

test("out is one state, whichever way the shell learns it: nothing of the person who left is kept", () => {
  const inside = {
    ...INITIAL,
    session: "in",
    slug: "acme",
    needs: 3,
    badge: 5,
    token: "tok",
    registered: "tok|",
    refused: null,
    pendingRoute: "inbox/th-1",
    pendingWorkspace: "22222222-2222-4222-8222-222222222222",
    theme: "light",
  };
  const out = signedOut(inside);
  assert.deepEqual(out, {
    ...inside,
    session: "out",
    slug: null,
    needs: 0,
    badge: 0,
    registered: null,
    refused: null,
    pendingRoute: null,
    pendingWorkspace: null,
  });
  assert.equal(out.token, "tok", "the phone's own token stays: it is the phone's, not the person's");
  assert.equal(out.theme, "light", "the last page's theme stays until the next page says");
  assert.deepEqual(
    onPageMessage(inside, '{"t":"session","state":"out"}').state,
    out,
    "the page's message says the same",
  );
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

test("the page's theme is the shell's: kept in the state and acted on, and Today's refresh keeps nothing", () => {
  let r = onPageMessage(INITIAL, '{"t":"theme","theme":"light"}');
  assert.equal(r.state.theme, "light");
  assert.equal(r.effect, "theme");
  r = onPageMessage(r.state, '{"t":"theme","theme":"dark"}');
  assert.equal(r.state.theme, "dark");
  const snap = { headline: "h", figures: [], waiting: 0, first: null, at: "2026-09-26T10:00:00.000Z" };
  r = onPageMessage(INITIAL, JSON.stringify({ t: "today", snapshot: snap }));
  assert.equal(r.state, INITIAL, "the widget's snapshot is the Surface's to hand on; the state does not change");
  assert.equal(r.effect, "nothing");
});
