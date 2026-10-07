/**
 * The shell names itself the way the site reads it (src/site.ts against contracts' inAppFrom), and addresses a
 * workspace page the way legacy-bridge/workspace.ts does; a foreign URL is never the WebView's to open.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inAppFrom } from "../../../packages/contracts/src/shell/chrome.ts";

process.env.EXPO_PUBLIC_SITE_ORIGIN = "https://app.example.com/";
const {
  userAgentToken,
  hrefFor,
  isOurs,
  isSignedOutUrl,
  isNativeDoorFailedUrl,
  LOGIN_HREF,
  SITE_ORIGIN,
  DEFAULT_SITE_ORIGIN,
} = await import("../src/site.ts");

test("the User-Agent token round-trips through the site's regex", () => {
  const ua = `Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 ${userAgentToken("1.4.0", "ios")}`;
  assert.deepEqual(inAppFrom(ua), { version: "1.4.0", platform: "ios" });
  assert.deepEqual(inAppFrom(userAgentToken("", "android")), { version: "0.0.0", platform: "android" });
});

test("a workspace page's address, the home when no workspace is known, the origin without its slash", () => {
  assert.equal(SITE_ORIGIN, "https://app.example.com");
  assert.equal(hrefFor("acme-plumbing", "inbox"), "https://app.example.com/w/acme-plumbing#/inbox");
  assert.equal(hrefFor("a b", "today"), "https://app.example.com/w/a%20b#/today");
  assert.equal(hrefFor(null, "today"), "https://app.example.com/");
  assert.equal(LOGIN_HREF, "https://app.example.com/login");
});

test("the default is the product's own address, without a trailing slash", () => {
  assert.equal(DEFAULT_SITE_ORIGIN, "https://app.chanlytics.com");
  assert.equal("https://x.example.com/".replace(/\/+$/, ""), "https://x.example.com");
});

test("ours, and signed out, are read from the address", () => {
  assert.ok(isOurs("https://app.example.com/w/x#/today"));
  assert.ok(!isOurs("https://app.example.com.evil.com/"));
  assert.ok(!isOurs("https://example.com/"));
  assert.ok(!isOurs("not a url"));
  assert.ok(isSignedOutUrl("https://app.example.com/login?error=native"));
  assert.ok(isSignedOutUrl("https://app.example.com/auth/signout"));
  assert.ok(!isSignedOutUrl("https://app.example.com/w/acme#/today"));
  assert.ok(!isSignedOutUrl("https://example.com/login"));
});

test("a native sign-in the door refused is read from where it lands, and nothing else is", () => {
  assert.ok(isNativeDoorFailedUrl("https://app.example.com/login?error=native"));
  assert.ok(!isNativeDoorFailedUrl("https://app.example.com/login"), "the plain login page is the email door");
  assert.ok(!isNativeDoorFailedUrl("https://app.example.com/login?error=expired"));
  assert.ok(!isNativeDoorFailedUrl("https://evil.example/login?error=native"), "only the site's own login page");
  assert.ok(!isNativeDoorFailedUrl("not a url"));
});
