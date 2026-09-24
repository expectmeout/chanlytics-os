/**
 * The domain says which apps may open its links: Apple's apple-app-site-association and Android's assetlinks.json,
 * each rendered from one variable and absent (404) until it is set — a file with a placeholder team id is a lie the
 * stores cache for a day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { appLinksFor, BROWSER_ONLY } = await import(at("apps/dashboard/src/server/app-links.ts"));
const { GET } = await import(at("apps/dashboard/app/api/app-links/[store]/route.ts"));

test("Apple: every app id opens every path but the ones meant for a browser", () => {
  const file = appLinksFor("apple", {
    apple: "ABCDE12345.com.chanlytics.app, ABCDE12345.com.chanlytics.app.dev",
    android: "",
  });
  assert.deepEqual(file.applinks.details[0].appIDs, [
    "ABCDE12345.com.chanlytics.app",
    "ABCDE12345.com.chanlytics.app.dev",
  ]);
  const components = file.applinks.details[0].components;
  assert.deepEqual(components.at(-1), { "/": "/*" }, "everything else opens the app");
  for (const p of BROWSER_ONLY) {
    assert.ok(
      components.some((c) => c["/"] === p && c.exclude === true),
      `${p} stays in the browser`,
    );
  }
  assert.deepEqual(
    file.webcredentials.apps,
    file.applinks.details[0].appIDs,
    "and passwords may be shared with the same apps",
  );
});

test("Android: one statement per package, its fingerprints upper-cased", () => {
  const file = appLinksFor("android", {
    apple: "",
    android: "com.chanlytics.app=aa:bb|cc:dd; com.chanlytics.app.dev=ee:ff",
  });
  assert.deepEqual(file, [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.chanlytics.app",
        sha256_cert_fingerprints: ["AA:BB", "CC:DD"],
      },
    },
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.chanlytics.app.dev", sha256_cert_fingerprints: ["EE:FF"] },
    },
  ]);
});

test("unset, or a store nobody has, is nothing", () => {
  assert.equal(appLinksFor("apple", { apple: "", android: "" }), null);
  assert.equal(appLinksFor("android", { apple: "x", android: "  " }), null);
  assert.equal(
    appLinksFor("android", { apple: "", android: "com.chanlytics.app=" }),
    null,
    "a package with no fingerprint is nothing",
  );
  assert.equal(appLinksFor("windows", { apple: "x", android: "y" }), null);
});

test("the route answers the file as JSON, cacheable for an hour, and 404 until configured", async () => {
  const req = new Request("http://localhost/.well-known/apple-app-site-association");
  process.env.APP_LINKS_APPLE = "ABCDE12345.com.chanlytics.app";
  try {
    const r = await GET(req, { params: Promise.resolve({ store: "apple" }) });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/json");
    assert.equal(r.headers.get("cache-control"), "public, max-age=3600");
    assert.equal((await r.json()).applinks.details[0].appIDs[0], "ABCDE12345.com.chanlytics.app");
  } finally {
    delete process.env.APP_LINKS_APPLE;
  }
  const none = await GET(req, { params: Promise.resolve({ store: "apple" }) });
  assert.equal(none.status, 404);
  assert.equal((await GET(req, { params: Promise.resolve({ store: "windows" }) })).status, 404);
});
