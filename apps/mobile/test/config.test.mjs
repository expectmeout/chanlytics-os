/**
 * The app's configuration (app.config.ts) spells two things the app spells too, since the config loader reads no file
 * of the app's: the product's own address (src/site.ts DEFAULT_SITE_ORIGIN) and Google's iOS URL scheme
 * (src/shell/sign-in.ts reversedClientId). Each copy is held to its original here, so the two cannot drift. What an
 * environment sets is read as the config is evaluated, so a test sets it and evaluates again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.EXPO_PUBLIC_SITE_ORIGIN;
process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = "123-abc.apps.googleusercontent.com";
const { default: configOf } = await import("../app.config.ts");
const { DEFAULT_SITE_ORIGIN } = await import("../src/site.ts");
const { reversedClientId } = await import("../src/shell/sign-in.ts");
const appConfig = configOf({ config: {} });

test("the links the stores verify name the product's own host, as the app does", () => {
  const host = new URL(DEFAULT_SITE_ORIGIN).host;
  assert.deepEqual(appConfig.ios.associatedDomains, [`applinks:${host}`]);
  assert.equal(appConfig.android.intentFilters[0].data[0].host, host);
});

test("Google's iOS URL scheme is the client id reversed, as sign-in reverses it", () => {
  const google = appConfig.plugins.find(
    (p) => Array.isArray(p) && p[0] === "@react-native-google-signin/google-signin",
  );
  assert.ok(google, "the plugin is there when the client id is set");
  assert.equal(google[1].iosUrlScheme, reversedClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID));
});

test("Android's Firebase file is the path EAS names for it, and without one the config has no such key", () => {
  delete process.env.GOOGLE_SERVICES_JSON;
  assert.ok(!("googleServicesFile" in configOf({ config: {} }).android), "unset: the build is what it was");
  process.env.GOOGLE_SERVICES_JSON = " /eas/secrets/google-services.json ";
  try {
    assert.equal(configOf({ config: {} }).android.googleServicesFile, "/eas/secrets/google-services.json");
  } finally {
    delete process.env.GOOGLE_SERVICES_JSON;
  }
});

test("the app opens on the dark paper, and its notification wears the three's coral", () => {
  assert.equal(appConfig.backgroundColor, "#0c0d0f");
  const notifications = appConfig.plugins.find((p) => Array.isArray(p) && p[0] === "expo-notifications");
  assert.equal(notifications[1].color, "#fa695c");
});
