/**
 * When a deploy reloads the pages (src/shell/deploy.ts): a changed sha, at most once in five minutes, never the
 * first sha learnt, never without one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideReload, shaOf, minAppOf, isOlderThan, RELOAD_GAP_MS } from "../src/shell/deploy.ts";

test("reload on a change, not on the first sha, not twice in five minutes, not without a sha", () => {
  const now = 10 * RELOAD_GAP_MS;
  assert.equal(decideReload({ lastSha: null, sha: "abc", lastReloadAt: 0, now }), "keep");
  assert.equal(decideReload({ lastSha: "abc", sha: "abc", lastReloadAt: 0, now }), "keep");
  assert.equal(decideReload({ lastSha: "abc", sha: "def", lastReloadAt: 0, now }), "reload");
  assert.equal(decideReload({ lastSha: "abc", sha: "def", lastReloadAt: now - RELOAD_GAP_MS + 1, now }), "keep");
  assert.equal(decideReload({ lastSha: "abc", sha: "def", lastReloadAt: now - RELOAD_GAP_MS, now }), "reload");
  assert.equal(decideReload({ lastSha: "abc", sha: null, lastReloadAt: 0, now }), "keep");
});

test("the sha is read from the version answer alone", () => {
  assert.equal(shaOf({ sha: "abc123" }), "abc123");
  assert.equal(shaOf({ sha: " " }), null);
  assert.equal(shaOf({ version: "1" }), null);
  assert.equal(shaOf(null), null);
});

test("the site's floor for the app: read when it is a version, compared part by part", () => {
  assert.equal(minAppOf({ sha: "x", min_app: "1.2.0" }), "1.2.0");
  assert.equal(minAppOf({ sha: "x" }), null);
  assert.equal(minAppOf({ min_app: "soon" }), null);
  assert.ok(isOlderThan("1.0.0", "1.2"));
  assert.ok(isOlderThan("1.2.3", "1.10.0"), "ten is more than three");
  assert.ok(!isOlderThan("1.2.0", "1.2"));
  assert.ok(!isOlderThan("2.0.0", "1.9.9"));
});
