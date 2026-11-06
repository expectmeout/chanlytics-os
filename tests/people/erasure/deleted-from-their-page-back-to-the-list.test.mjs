/**
 * Leaving a page from inside a sheet (kit/sheet/back.ts leaveSheet). A sheet that Back closes stands an entry in the tab's
 * history while it is open (the sheets as verbs, 14 Oct 2026). A person deleted from their page's sheet then went Back to
 * the list they came from by the browser's own Back, and that step took the sheet's entry instead: the page under the
 * sheet stayed, showing someone who no longer exists (the nightly's people-delete spec, red from 14 Oct 2026). Now the
 * sheet's entry is taken back first, and the step back is made once the tab says it has moved.
 *
 * The real module runs over a tab's history in memory: entries, Back that lands a moment later, and its popstate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

/** A tab: its entries, where it stands, and a Back that lands on the next turn, as a browser's does. */
function tab(entries) {
  const listeners = new Set();
  let at = entries.length - 1;
  const backs = [];
  const history = {
    get state() {
      return entries[at].state;
    },
    pushState(state) {
      entries.splice(at + 1, entries.length, { state });
      at = entries.length - 1;
    },
    replaceState(state) {
      entries[at] = { state };
    },
    back() {
      backs.push(at);
      setTimeout(() => {
        at = Math.max(0, at - 1);
        for (const l of listeners) l({ type: "popstate" });
      }, 5);
    },
  };
  globalThis.window = {
    history,
    location: {
      pathname: "/w/harbor/people/p1",
      search: "",
      hash: "",
      href: "https://app.example.com/w/harbor/people/p1",
    },
    addEventListener: (type, l) => type === "popstate" && listeners.add(l),
    removeEventListener: (type, l) => type === "popstate" && listeners.delete(l),
  };
  return { history, backs, where: () => at };
}

const { leaveSheet } = await importSrc("apps/dashboard/src/surfaces/kit/sheet/back.ts");

test("REGRESSION: standing on a sheet's entry, leaving takes that entry back first and says when the tab has moved", async (t) => {
  t.after(() => delete globalThis.window);
  // The list, the person's page, and the delete question's sheet over it.
  const w = tab([
    { state: { route: "list" } },
    { state: { route: "person" } },
    { state: { route: "person", sheet: 7 } },
  ]);
  const left = leaveSheet(w.history);
  assert.equal(w.where(), 2, "Back lands a moment later, as a browser's does");
  await left;
  assert.deepEqual(w.backs, [2], "one step: the sheet's entry, and no more");
  assert.equal(w.where(), 1, "on the person's page, so their Back now reaches the list");
});

test("standing on no sheet's entry, leaving takes nothing back", async (t) => {
  t.after(() => delete globalThis.window);
  const w = tab([{ state: { route: "list" } }, { state: { route: "person" } }]);
  await leaveSheet(w.history);
  assert.deepEqual(w.backs, [], "the page's own entry is never taken");
  assert.equal(w.where(), 1);
  // No history to stand in (a test's stand-in tab): nothing at all.
  await leaveSheet(null);
});
