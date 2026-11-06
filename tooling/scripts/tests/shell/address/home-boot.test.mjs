/**
 * The home sends a tab on before anything of the app has run (contracts shell/home-boot.ts): the document's script, run over a
 * stand-in for what a document gives it, against the home's own answer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { homeBootScript, LAST_WORKSPACE_STORAGE } from "../../../../../packages/contracts/src/index.ts";
import { importSrc } from "../../_source.mjs";

const { homeHref, workspaceHref } = await importSrc("apps/dashboard/src/legacy-bridge/workspace.ts");

/** The home's script at an address, with `last` remembered: where it sent the tab. */
function fromHome({ pathname = "/", search = "", hash = "", last = "acme", storageThrows = false }) {
  let went = null;
  const location = { pathname, search, hash, replace: (to) => void (went = to) };
  const localStorage = {
    getItem: (k) => {
      if (storageThrows) throw new Error("blocked");
      return k === LAST_WORKSPACE_STORAGE ? last : null;
    },
  };
  new Function("location", "localStorage", homeBootScript())(location, localStorage);
  return went;
}

test("the home sends a tab on to the workspace it remembers before anything of the app has run, as the home itself would", () => {
  assert.equal(fromHome({}), workspaceHref("acme"));
  assert.equal(fromHome({ last: "café & co" }), workspaceHref("café & co"));
  assert.equal(fromHome({}), homeHref("acme", null, ""));
});

test("what is not the bare home, or remembers nothing, is left to the home's own code", () => {
  assert.equal(fromHome({ last: null }), null, "a first sign-in, or a cleared browser");
  assert.equal(fromHome({ pathname: "/w/acme" }), null);
  assert.equal(fromHome({ pathname: "/login" }), null);
  assert.equal(fromHome({ search: "?w=other" }), null, "a deep link names its own workspace");
  assert.equal(fromHome({ hash: "#/inbox" }), null);
  assert.equal(fromHome({ storageThrows: true }), null);
});
