/**
 * The workspace in the address (plan 3.5), run: what a path names, what an
 * address is built as, where the home sends a tab, and what the browser is
 * asked to remember.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { pathWorkspace, workspaceHref, homeHref, lastWorkspace, rememberWorkspace, getActiveWorkspace } =
  await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");

test("a path names its workspace under /w/, by slug or id, decoded; anything else names none", () => {
  assert.equal(pathWorkspace("/w/acme"), "acme");
  assert.equal(pathWorkspace("/w/acme/"), "acme");
  assert.equal(pathWorkspace("/w/a%20b"), "a b", "decoded");
  assert.equal(
    pathWorkspace("/w/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "an id is accepted too: the server takes either",
  );
  assert.equal(pathWorkspace("/"), null);
  assert.equal(pathWorkspace("/login"), null);
  assert.equal(pathWorkspace("/w/"), null);
  assert.equal(pathWorkspace("/w/%E0%A4%A"), null, "a malformed escape names nothing rather than throwing");
  assert.equal(getActiveWorkspace(), null, "outside a browser there is no address");
});

test("an address is the slug encoded, with whatever rides after it", () => {
  assert.equal(workspaceHref("acme"), "/w/acme");
  assert.equal(workspaceHref("a b", "#/inbox"), "/w/a%20b#/inbox");
  assert.equal(workspaceHref("acme", "?billing=success#/admin/billing"), "/w/acme?billing=success#/admin/billing");
});

test("the home sends a tab to the last workspace used, else to the one the server calls active, carrying the query and the hash; an account with no workspace stays", () => {
  const answer = {
    workspaces: [
      { id: "id-a", slug: "acme" },
      { id: "id-b", slug: "bayside" },
    ],
    activeWorkspaceId: "id-b",
  };
  assert.equal(homeHref("acme", answer, "#/today"), "/w/acme#/today", "the last one used wins");
  assert.equal(
    homeHref(null, answer, "?billing=success#/admin/billing"),
    "/w/bayside?billing=success#/admin/billing",
    "else the server's active one",
  );
  assert.equal(homeHref(null, { workspaces: [], activeWorkspaceId: null }), null, "nowhere: the create screen");
  assert.equal(homeHref(null, null), null, "and nowhere when the server could not be asked");
});

test("the browser remembers the last workspace when it can, and nothing throws when it cannot", () => {
  assert.equal(lastWorkspace(), null, "no storage here: nothing remembered");
  assert.doesNotThrow(() => rememberWorkspace("acme"));
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  rememberWorkspace("acme");
  assert.equal(lastWorkspace(), "acme");
  assert.equal(store.get("chanlytics.workspace"), "acme", "the one key localStorage keeps");
  rememberWorkspace(null);
  assert.equal(lastWorkspace(), null);
  delete globalThis.localStorage;
});
