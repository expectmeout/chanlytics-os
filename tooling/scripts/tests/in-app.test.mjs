/**
 * The document knows when it is inside the native shell.
 *
 * The shell says who it is in its WebView's User-Agent, once: "ChanlyticsApp/<version> (ios|android)". One regex
 * reads it, in TypeScript and in the script the document inlines beside the theme's, so the class on <html> and the
 * global the legacy shell reads are stamped before first paint — a tab bar that appears for a frame under the native
 * one is the jolt this exists to prevent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inAppFrom, inAppBootScript, IN_APP_CLASS } from "../../../packages/contracts/src/chrome.ts";

test("the shell's User-Agent token names the app, its version and its platform; a browser has none", () => {
  assert.deepEqual(
    inAppFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 ChanlyticsApp/1.2.0 (ios)"),
    { version: "1.2.0", platform: "ios" },
  );
  assert.deepEqual(inAppFrom("Mozilla/5.0 (Linux; Android 16) ChanlyticsApp/1.2.0 (android)"), {
    version: "1.2.0",
    platform: "android",
  });
  assert.deepEqual(inAppFrom("ChanlyticsApp/0.1.0"), { version: "0.1.0", platform: "unknown" });
  assert.equal(inAppFrom("Mozilla/5.0 (iPhone) Safari/605.1.15"), null);
  assert.equal(inAppFrom(null), null);
});

function boot(userAgent) {
  const classes = new Set();
  const document = { documentElement: { classList: { add: (c) => classes.add(c) } } };
  const window = {};
  new Function("document", "navigator", "window", inAppBootScript())(document, { userAgent }, window);
  return { classes: [...classes], inApp: window.__IN_APP };
}

test("the boot script stamps the document before paint, from the same regex, and leaves a browser untouched", () => {
  assert.deepEqual(boot("Mozilla/5.0 ChanlyticsApp/1.2.0 (ios)"), {
    classes: [IN_APP_CLASS],
    inApp: { version: "1.2.0", platform: "ios" },
  });
  assert.deepEqual(boot("Mozilla/5.0 Safari/605.1.15"), { classes: [], inApp: undefined });
});
