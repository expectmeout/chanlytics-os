/**
 * What the app knows of a finger (surfaces/legacy-verbs.ts; Ruben, 8 October 2026): a touch screen is the pointer a person
 * mostly uses, never a width, and there no text field takes focus as it is drawn; the kit's phone is its one width;
 * and a gesture's handlers can keep a touch to themselves, so a pull on what is drawn on the body is not read again
 * by whatever drew it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact();
const { editorBox, focusAsDrawn, keepTouch, onAPhone } = await importSrc("apps/dashboard/src/surfaces/legacy-verbs.ts");

/** A window that answers these queries with yes, and every other with no. */
const answering = (yes, run) => {
  const was = globalThis.matchMedia;
  const asked = [];
  globalThis.matchMedia = (q) => {
    asked.push(q);
    return { matches: yes.includes(q) };
  };
  try {
    run(asked);
  } finally {
    globalThis.matchMedia = was;
  }
};

test("a touch screen is the pointer a person mostly uses, and there no field takes focus as it is drawn", () => {
  answering(["(pointer: coarse)"], (asked) => {
    assert.equal(focusAsDrawn(), false, "the keyboard waits for a tap");
    assert.deepEqual(
      [...new Set(asked)],
      ["(pointer: coarse)"],
      "the house's one test for it, as globals.css sizes a field",
    );
  });
  answering(["(max-width: 900px)"], () => {
    assert.equal(focusAsDrawn(), true, "a narrow window on a desk still has its keys: N, then type");
  });
});

test("the kit's phone is its one width, whatever the pointer", () => {
  answering(["(max-width: 900px)"], () => assert.equal(onAPhone(), true));
  answering(["(pointer: coarse)"], () => assert.equal(onAPhone(), false, "a tablet held wide is no phone"));
});

test("where a window answers no query at all, nothing is a touch screen or a phone", () => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = undefined;
  try {
    assert.deepEqual([focusAsDrawn(), onAPhone()], [true, false]);
  } finally {
    globalThis.matchMedia = was;
  }
});

test("a gesture's handlers keep the touch to themselves, and say what they said", () => {
  const heard = [];
  const kept = keepTouch({
    onTouchStart: (e) => heard.push(["start", e.at]),
    onTouchEnd: (e) => heard.push(["end", e.at]),
    min: 80,
  });
  let stopped = 0;
  const touch = (at) => ({ at, stopPropagation: () => (stopped += 1) });
  kept.onTouchStart(touch(1));
  kept.onTouchEnd(touch(2));
  assert.deepEqual(
    heard,
    [
      ["start", 1],
      ["end", 2],
    ],
    "each handler is handed its own event",
  );
  assert.equal(stopped, 2, "and the touch goes no further up: a menu's pull is not its sheet's too");
  assert.equal(kept.min, 80, "what is not a handler is handed on as it was");
  kept.onTouchStart({ at: 3 });
  assert.deepEqual(heard.at(-1), ["start", 3], "an event with nothing to stop is still heard");
});

test("the box of an editor a press opened in place takes focus on a touch screen, and only there", () => {
  // Ruben, 9 October 2026: such an editor opens with no keyboard, so its field does not take focus; the control that
  // was pressed is gone, and focus left on the body sends the next Tab back to the top of the page.
  assert.equal(editorBox.tabIndex, -1, "focusable by this rule, never by Tab");
  const focused = [];
  const box = (holds) => ({ contains: () => holds, focus: (how) => focused.push(how) });
  answering([], () => editorBox.ref(box(false)));
  assert.deepEqual(focused, [], "under a mouse the field has it");
  answering(["(pointer: coarse)"], () => {
    editorBox.ref(null);
    editorBox.ref(box(true));
    assert.deepEqual(focused, [], "nothing to do as the box goes, or where focus is already inside it");
    editorBox.ref(box(false));
  });
  assert.deepEqual(focused, [{ preventScroll: true }], "the box itself, and the page holds still");
});
