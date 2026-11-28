/**
 * The workspace on screen, as one leaf says it (bridge/workspace-on-screen.ts).
 *
 * bridge/workspace.ts reads the route registry, which imports each page's chrome, so a store a chrome reads could not ask
 * it which workspace the address names, and three read the address themselves, each its own way (the review of
 * 28 Nov 2026). The leaf imports nothing, so anything in the browser can ask it; bridge/workspace.ts says the same two
 * under the same names, as one function each, never a copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";
import { importsOf, parse } from "../../_ast.mjs";

const LEAF = "apps/dashboard/src/bridge/workspace-on-screen.ts";
const win = { location: { pathname: "/w/harbor-studio/inbox", hash: "" } };
globalThis.window = win;

const leaf = await importSrc(LEAF);
const whole = await importSrc("apps/dashboard/src/bridge/workspace.ts");

test("the leaf imports nothing, so a page's chrome and its stores can ask it without a circle", () => {
  assert.deepEqual(
    importsOf(parse(LEAF)).map((each) => each.specifier),
    [],
  );
});

test("it says the workspace the address names, and none off a workspace page", () => {
  assert.equal(leaf.getActiveWorkspace(), "harbor-studio");
  assert.equal(leaf.pathWorkspace("/w/harbor-studio"), "harbor-studio");
  assert.equal(leaf.pathWorkspace("/w/harbor-studio/campaigns/ads"), "harbor-studio");
  assert.equal(
    leaf.pathWorkspace("/w/caf%C3%A9-luna/today"),
    "café-luna",
    "as its name reads, not as the address spells it",
  );
  for (const elsewhere of ["/", "/login", "/console", "/w/", "/wide/harbor"])
    assert.equal(leaf.pathWorkspace(elsewhere), null, elsewhere);
  assert.equal(leaf.pathWorkspace("/w/%E0%A4%A/today"), null, "an address that cannot be read names none");

  win.location.pathname = "/login";
  try {
    assert.equal(leaf.getActiveWorkspace(), null);
  } finally {
    win.location.pathname = "/w/harbor-studio/inbox";
  }
});

test("bridge/workspace says the same two, as the leaf's own functions", () => {
  assert.equal(whole.getActiveWorkspace, leaf.getActiveWorkspace);
  assert.equal(whole.pathWorkspace, leaf.pathWorkspace);
});
