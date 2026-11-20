/**
 * A dialog that holds focus (apps/dashboard/src/surfaces/kit/focus/trap.ts trapFocus): Tab wraps inside it, unless its own
 * controls stand outside it on a page the frame has taken away, as AI's field does on a phone's bar (Today, calm, D8),
 * where Tab must go on from the dialog to the field.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { trapFocus } = await import("../../../apps/dashboard/src/surfaces/kit/focus/trap.ts");

/** A dialog with one button, enough of an element for the trap: it hears keys, and holds what has focus. */
const dialogWith = () => {
  const keys = [];
  const button = { tagName: "BUTTON", tabIndex: 0, disabled: false, getClientRects: () => [1], focus() {} };
  const box = {
    attrs: {},
    getAttribute: (k) => box.attrs[k] ?? null,
    setAttribute: (k, v) => (box.attrs[k] = v),
    contains: () => false,
    focus() {},
    addEventListener: (_k, f) => keys.push(f),
    removeEventListener() {},
    querySelectorAll: () => [button],
  };
  return { box, keys, button };
};

test("Tab wraps inside a held dialog, and goes on from one whose controls stand outside it", () => {
  globalThis.document = { activeElement: null };
  const held = dialogWith();
  trapFocus(held.box);
  globalThis.document.activeElement = held.button;
  let stopped = 0;
  for (const f of held.keys) f({ key: "Tab", shiftKey: false, preventDefault: () => (stopped += 1) });
  assert.equal(stopped, 1, "from its last control, Tab comes back to its first");

  const open = dialogWith();
  trapFocus(open.box, { wrap: false });
  globalThis.document.activeElement = open.button;
  let went = 0;
  for (const f of open.keys) f({ key: "Tab", shiftKey: false, preventDefault: () => (went += 1) });
  assert.equal(went, 0, "Tab goes on, to the field on the bar");
  assert.equal(open.box.attrs.tabindex, "-1", "focus is still put in it as it opens, so no keyboard rises");
});
