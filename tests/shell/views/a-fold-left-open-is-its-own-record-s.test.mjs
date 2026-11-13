/**
 * A fold that remembers whether a member left it open (apps/dashboard/src/surfaces/kit/record/remember.ts, drawn by the
 * record kit's RecordDisclosure with `remember`) says and keeps the choice of the record it is drawn for now.
 *
 * Its choice is kept in the tab by the fold's id, and a fold kept on screen while its id moves (a sequence's people,
 * grouped by the sequence's id, as a member walks from one sequence to the next) showed the choice read for the first
 * id it was drawn with: open on a sequence the member never opened it on, and a press then kept the opposite of what
 * they saw under the new id (the interaction review, 13 Nov 2026).
 *
 * EXECUTED on the stub React, over the same hook cells between draws, as React keeps a part it does not remount, with the
 * tab's memory stood in for (shell-verbs.ts tabMemory).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { again, find, installStubReact, press, unmount } from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";

installStubReact({ __DEMO_MODE: false });
const { RecordDisclosure } = await importSrc("apps/dashboard/src/surfaces/kit/record/disclosure.tsx");
const W = globalThis.window;

/** The tab's memory as the record kit reads it: a place per fold, by its id, under the page `folds`. */
function aTabMemory(left = {}) {
  const places = new Map(Object.entries(left).map(([id, open]) => [id, open ? { open: true } : {}]));
  W.__tabMemory = {
    place: (page, id) => (page === "folds" ? places.get(id) : undefined),
    keepPlace: (page, id, v) => {
      if (page === "folds") places.set(id, v);
    },
  };
  return { leftOpen: (id) => places.get(id)?.open === true };
}

const fold = (id) =>
  again(() => W.React.createElement(RecordDisclosure, { id, label: "Queued", remember: true, children: "rows" }));
const isOpen = (tree) => find(tree, (n) => n.props?.className === "rec-disclosure").props["data-open"] === "true";
const pressOf = (tree) => find(tree, (n) => n.props?.className === "rec-disclosure-press");

test("the id moves without a remount: the fold shows the new record's choice, and a press keeps it under the new id", () => {
  unmount();
  const memory = aTabMemory({ "sq-people-a-queued": true });
  assert.equal(isOpen(fold("sq-people-a-queued")), true, "left open on the first sequence: drawn open");
  assert.equal(
    isOpen(fold("sq-people-b-queued")),
    false,
    "REGRESSION: the next sequence's fold, never opened, was drawn open with the last one's choice",
  );
  press(pressOf(fold("sq-people-b-queued")));
  assert.equal(
    memory.leftOpen("sq-people-b-queued"),
    true,
    "REGRESSION: the press kept the opposite of what it showed",
  );
  assert.equal(isOpen(fold("sq-people-b-queued")), true, "and it is drawn open");
  assert.equal(memory.leftOpen("sq-people-a-queued"), true, "the first sequence's choice is its own still");
  assert.equal(isOpen(fold("sq-people-a-queued")), true, "and back on it, its fold is as it was left");
});

test("a fold whose id stays keeps its own choice between draws, as before", () => {
  unmount();
  const memory = aTabMemory();
  assert.equal(isOpen(fold("person-messages")), false, "closed is the default");
  press(pressOf(fold("person-messages")));
  assert.equal(isOpen(fold("person-messages")), true);
  assert.equal(memory.leftOpen("person-messages"), true, "and kept in the tab");
  press(pressOf(fold("person-messages")));
  assert.equal(isOpen(fold("person-messages")), false);
  assert.equal(memory.leftOpen("person-messages"), false, "closed again: nothing kept");
});
