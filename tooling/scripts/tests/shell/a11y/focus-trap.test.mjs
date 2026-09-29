/**
 * A modal dialog holds focus while it is open, with one helper (data-bits trapFocus and dialogRef): focus goes in, Tab
 * and Shift+Tab stay inside and count only what Tab stops at, and focus goes back to what opened it. Run on the real
 * helper over a document that keeps focus the way a browser does; the pages that use it (the notifications panel, the
 * shortcuts sheet, People's phone sheet, the Calendar's appointment) name it, and the Ask Line keeps Tab in with trapTab.
 *
 * Before it, the Calendar's dialog had a trap of its own that counted a control Tab never reaches (one taken out of the
 * tab order, one not on screen), so focus walked out of it past the last control that Tab did stop at.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../../_legacy-react.mjs";

installLegacyReact();
const doc = { body: { name: "body" }, activeElement: null, addEventListener() {}, removeEventListener() {} };
globalThis.document = doc;
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { trapFocus, dialogRef, trapTab } = globalThis.window;
// The way out a dialog carries (data-bits leaving), as a record of when an element arrives and leaves.
const leavings = [];
globalThis.window.leaving = (key) => (el) => leavings.push([key, el ? "in" : "out"]);

const control = (name, { tabIndex = 0, onScreen = true, disabled = false } = {}) => ({
  name,
  tabIndex,
  disabled,
  isConnected: true,
  getClientRects: () => (onScreen ? [{}] : []),
  focus() {
    doc.activeElement = this;
  },
});
/** A dialog's element: its controls, its own keydown listeners and the tabindex it is given. */
const dialogOf = (controls) => {
  const heard = new Set();
  const box = {
    name: "the dialog",
    tabIndex: -1,
    attrs: {},
    isConnected: true,
    querySelectorAll: () => controls,
    contains: (n) => n === box || controls.includes(n),
    getAttribute: (k) => (k in box.attrs ? box.attrs[k] : null),
    setAttribute: (k, v) => {
      box.attrs[k] = v;
    },
    addEventListener: (type, fn) => type === "keydown" && heard.add(fn),
    removeEventListener: (type, fn) => type === "keydown" && heard.delete(fn),
    focus() {
      doc.activeElement = box;
    },
    heard,
    /** A key pressed in the dialog: whether it was taken. */
    press(key, shiftKey = false) {
      let taken = false;
      const e = { key, shiftKey, preventDefault: () => (taken = true) };
      for (const fn of [...heard]) fn(e);
      return taken;
    },
  };
  return box;
};

test("focus goes into the dialog itself, so a phone's keyboard stays down, and stays where it already is inside", () => {
  const [a, b] = [control("a"), control("b")];
  const opener = control("the button that opened it");
  doc.activeElement = opener;
  const box = dialogOf([a, b]);
  const release = trapFocus(box);
  assert.equal(doc.activeElement, box, "the dialog, not its first control");
  assert.equal(box.attrs.tabindex, "-1", "made focusable for it");
  release();
  // A page that put focus on its own field as it opened (Ask's on a desktop) keeps it.
  doc.activeElement = opener;
  const again = dialogOf([a, b]);
  again.contains = (n) => n === b || n === again;
  b.focus();
  trapFocus(again);
  assert.equal(doc.activeElement, b, "focus already inside stays");
});

test("Tab and Shift+Tab walk the dialog's own controls and wrap, counting only what Tab stops at", () => {
  const first = control("first");
  const skipped = control("taken out of the tab order", { tabIndex: -1 });
  const hidden = control("not on screen", { onScreen: false });
  const off = control("disabled", { disabled: true });
  const middle = control("middle");
  const last = control("last");
  // The ends are what Tab does not stop at: the trap waits on the last control Tab does reach.
  const box = dialogOf([first, middle, last, skipped, hidden, off]);
  doc.activeElement = control("opener");
  trapFocus(box);
  last.focus();
  assert.equal(box.press("Tab"), true, "past the last control Tab stops at, round to the first");
  assert.equal(doc.activeElement, first);
  assert.equal(box.press("Tab", true), true, "before the first, round to the last");
  assert.equal(doc.activeElement, last);
  box.focus();
  assert.equal(box.press("Tab", true), true, "from the dialog itself, Shift+Tab takes the last");
  assert.equal(doc.activeElement, last);
  middle.focus();
  assert.equal(box.press("Tab"), false, "in between, the browser's own order");
  assert.equal(box.press("Escape"), false, "Escape is the page's, not the helper's");
  assert.equal(
    (() => {
      const e = { key: "Tab", shiftKey: false, preventDefault() {} };
      return trapTab(e, box);
    })(),
    undefined,
    "trapTab is the same rule, for the Ask Line, which keeps its own focus",
  );
});

test("a dialog with nothing to press keeps Tab to itself", () => {
  const box = dialogOf([]);
  doc.activeElement = control("opener");
  trapFocus(box);
  assert.equal(box.press("Tab"), true);
});

test("letting go puts focus back on what opened the dialog, and the dialog stops hearing keys", () => {
  const opener = control("the bell");
  doc.activeElement = opener;
  const box = dialogOf([control("x")]);
  const release = trapFocus(box);
  assert.equal(box.heard.size, 1);
  release();
  assert.equal(box.heard.size, 0, "no Tab is held after it closes");
  assert.equal(doc.activeElement, opener, "the way back");
  // An opener that has left the page is not focused; nor is the body.
  const gone = control("gone");
  doc.activeElement = gone;
  const second = dialogOf([]);
  const done = trapFocus(second);
  gone.isConnected = false;
  done();
  assert.equal(doc.activeElement, second, "nothing to give focus back to");
  doc.activeElement = doc.body;
  const third = dialogOf([]);
  trapFocus(third)();
  assert.equal(doc.activeElement, third, "the body is not somewhere to return to");
});

test("dialogRef is one ref for a key, holds the element for its whole life, and carries the way out too", () => {
  const opener = control("opener");
  doc.activeElement = opener;
  const ref = dialogRef("test-sheet");
  assert.equal(dialogRef("test-sheet"), ref, "a new ref every draw would let go and take hold again on each");
  assert.notEqual(dialogRef("another"), ref);
  const box = dialogOf([control("x")]);
  leavings.length = 0;
  ref(box);
  assert.equal(doc.activeElement, box, "held as it mounts");
  assert.equal(box.heard.size, 1);
  ref(null);
  assert.equal(box.heard.size, 0, "let go as it unmounts");
  assert.equal(doc.activeElement, opener);
  assert.deepEqual(leavings, [
    ["test-sheet", "in"],
    ["test-sheet", "out"],
  ]);
});

test("nothing to hold is nothing done", () => {
  assert.equal(typeof trapFocus(null), "function");
  assert.doesNotThrow(() => trapFocus(null)());
  assert.doesNotThrow(() => dialogRef("empty")(null));
});
