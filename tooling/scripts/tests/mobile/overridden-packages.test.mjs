/**
 * The phone app's two advisories are lifted by overrides (pnpm-workspace.yaml), and what reads the lifted packages
 * still works: run here, as the app and its build tools call them.
 *
 * decode-uri-component 0.5 (GHSA-vcc3-ghjq-m6fr: malformed percent-encoding decoded in exponential time) is an ES
 * module only. expo-router reads a URL's query through query-string 7, which `require`s it and calls what it gets back,
 * so the override alone would hand query-string a module where it expects a function and throw on the first link
 * with a query. patches/query-string@7.1.3.patch reads the module's default export. uuid 11 (GHSA-w5hq-g745-h8pq)
 * keeps the CommonJS `v4` that xcode, under Expo's config plugins, calls when it writes an iOS project.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../_source.mjs";

const fromApp = createRequire(path.join(ROOT, "apps/mobile/package.json"));
/** The installed version, from the package's own manifest above the entry it resolves to (neither exports it). */
function version(name) {
  for (let dir = path.dirname(fromApp.resolve(name)); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const file = path.join(dir, "package.json");
    if (!fs.existsSync(file)) continue;
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    if (manifest.name === name) return manifest.version;
  }
  throw new Error(`${name}: no package.json above its entry`);
}

test("the lifted versions are the ones installed", () => {
  const [major, minor] = version("decode-uri-component").split(".").map(Number);
  assert.ok(major > 0 || minor >= 5, `decode-uri-component ${version("decode-uri-component")}`);
  assert.ok(Number(version("uuid").split(".")[0]) >= 11, `uuid ${version("uuid")}`);
});

test("expo-router's query-string decodes a query through the ES-module decoder, malformed escapes kept as written", () => {
  const queryString = fromApp(fromApp.resolve("query-string", { paths: [fromApp.resolve("expo-router")] }));
  assert.deepEqual(
    { ...queryString.parse("?q=a%20b&name=Jos%C3%A9&bad=%E0%A4%A") },
    { q: "a b", name: "José", bad: "%E0%A4%A" },
  );
  const started = Date.now();
  queryString.parse(`?x=${"%E0%A4%A".repeat(2000)}`);
  assert.ok(Date.now() - started < 2000, "a long malformed value is decoded in linear time");
});

test("xcode's uuid, as Expo's config plugins load it, still makes a v4", () => {
  const xcodeRequire = createRequire(fromApp.resolve("xcode"));
  const uuid = xcodeRequire("uuid");
  assert.match(uuid.v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
