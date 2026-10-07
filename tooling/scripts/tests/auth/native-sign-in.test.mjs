/**
 * The native app's sign-in door, the pure part: what the door signs in and where it lands. The app signs in with
 * Apple or Google natively (Google refuses OAuth inside a WebView), and hands the identity token here; the route
 * signs it in through the cookie-backed client so the WebView is signed in the way /auth/callback signs a browser in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { nativeSignInPlan, fromAnotherSite, NATIVE_FAILED, NATIVE_PROVIDERS } = await import(
  at("apps/dashboard/src/server/auth/native-sign-in.ts")
);

test("a form posted from another site is refused; the app's own WebView, which names no site, is not", () => {
  const h = (o) => new Headers(o);
  // An attacker's page auto-submitting their own token: the browser says so.
  assert.equal(fromAnotherSite(h({ "sec-fetch-site": "cross-site", origin: "https://evil.example" })), true);
  assert.equal(fromAnotherSite(h({ "sec-fetch-site": "same-site" })), true);
  assert.equal(fromAnotherSite(h({ origin: "https://evil.example", host: "app.chanlytics.com" })), true);
  assert.equal(fromAnotherSite(h({ origin: "not a url", host: "app.chanlytics.com" })), true);
  // The WebView's POST: no initiator, so `none` or silence, and no Origin.
  assert.equal(fromAnotherSite(h({ "sec-fetch-site": "none" })), false);
  assert.equal(fromAnotherSite(h({})), false);
  assert.equal(fromAnotherSite(h({ host: "app.chanlytics.com" })), false);
  assert.equal(fromAnotherSite(h({ origin: "null", host: "app.chanlytics.com" })), false);
  // Our own page, were it ever to post here.
  assert.equal(fromAnotherSite(h({ "sec-fetch-site": "same-origin" })), false);
  assert.equal(fromAnotherSite(h({ origin: "https://app.chanlytics.com", host: "app.chanlytics.com" })), false);
});
const { ipOf, hashKey } = await import(at("apps/dashboard/src/server/request-ip.ts"));

test("a provider's identity token is signed in and the browser lands on this site only", () => {
  assert.deepEqual(nativeSignInPlan({ provider: "apple", token: "eyJ.a.b", nonce: "n1", next: "/#/inbox" }), {
    signIn: { provider: "apple", token: "eyJ.a.b", nonce: "n1" },
    to: "/#/inbox",
    refused: null,
  });
  assert.deepEqual(nativeSignInPlan({ provider: "google", token: "eyJ.a.b" }), {
    signIn: { provider: "google", token: "eyJ.a.b", nonce: undefined },
    to: "/",
    refused: null,
  });
  assert.equal(nativeSignInPlan({ provider: "apple", token: "t", next: "https://elsewhere.example/" }).to, "/");
  assert.deepEqual(NATIVE_PROVIDERS, ["apple", "google"]);
});

test("anything else is refused by name, to the sign-in page", () => {
  for (const body of [
    null,
    {},
    { provider: "facebook", token: "t" },
    { provider: "apple" },
    { provider: "apple", token: "" },
    { provider: "apple", token: "x".repeat(8193) },
  ]) {
    const plan = nativeSignInPlan(body);
    assert.equal(plan.signIn, null, JSON.stringify(body));
    assert.equal(plan.to, NATIVE_FAILED);
    assert.equal(typeof plan.refused, "string");
  }
});

test("the network a request came from, and its hashed key, the way sign-up reads them", () => {
  assert.equal(
    ipOf(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })),
    "203.0.113.9",
  );
  assert.equal(ipOf(new Request("http://x", { headers: { "x-real-ip": "203.0.113.7" } })), "203.0.113.7");
  assert.equal(ipOf(new Request("http://x")), "unknown");
  assert.match(hashKey("203.0.113.9"), /^[0-9a-f]{32}$/);
});
