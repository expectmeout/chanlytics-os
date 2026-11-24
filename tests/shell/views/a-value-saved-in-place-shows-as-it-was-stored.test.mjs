/**
 * A value typed in place (kit/record/in-place.tsx), saved and read back, on the stub React. The door stores what it is
 * sent in its own spelling (an email address in lower case, contacts/[id]/details), and the page reads the stored value
 * back after the save: by the save's own refresh, or sooner, by the change the database pushes. Whichever lands first,
 * once both have the box shows the stored spelling. When the push landed before the save's answer, the box went on
 * holding what was typed ("Robin.E2E@Example.COM") until a reload: the nightly's consent check met it on 23 Nov 2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, again, unmount, byTestId, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";

installStubReact();
const { useInPlace } = await import("../../../apps/dashboard/src/surfaces/kit/record/in-place.tsx");
const W = globalThis.window;

const STORED = "ana@example.com";
const TYPED = "Bo@Example.COM";
const KEPT = "bo@example.com";

/** A field over a value the test moves, whose save answers when the test says. */
function emailField() {
  const world = { value: STORED, answer: null };
  const Field = () => {
    const edit = useInPlace({
      value: world.value,
      start: world.value,
      max: 254,
      same: (typed) => typed.toLowerCase() === world.value,
      save: () =>
        new Promise((done) => {
          world.answer = done;
        }),
      said: () => {},
    });
    return W.React.createElement(
      "span",
      { ...edit.box, "aria-busy": edit.busy || undefined, "data-testid": "box" },
      edit.shown,
    );
  };
  const box = () =>
    byTestId(
      again(() => W.React.createElement(Field)),
      "box",
    );
  return { world, box };
}

/** Typed into the box and asked for with Enter, as a person does: the box keeps the keys until the door answers. */
async function typeAndAsk({ world, box }, words) {
  box().props.onFocus({ currentTarget: {} });
  box().props.onInput({ currentTarget: { textContent: words } });
  box().props.onKeyDown({ key: "Enter", nativeEvent: {}, preventDefault() {} });
  await until(() => world.answer !== null && box().props["aria-busy"] === true, "the save asked for");
}

/** The door answers, and the box is let go as the browser lets it go once the save asks it to. */
async function answered({ world, box }) {
  world.answer(null);
  await until(() => box().props["aria-busy"] === undefined, "the door's answer taken");
  box().props.onBlur({ currentTarget: {} });
}

test("a saved value read back before its save answers shows in its stored spelling, not as it was typed", async () => {
  unmount();
  const field = emailField();
  await typeAndAsk(field, `  ${TYPED} `);
  // The page reads the person again while the door has not answered yet: the stored spelling is in.
  field.world.value = KEPT;
  field.box();
  await answered(field);
  assert.equal(textOf(field.box()), KEPT, "the stored spelling, as a reload would show it");
});

test("a saved value whose answer comes first stands as typed until the page reads it back, then in its stored spelling", async () => {
  unmount();
  const field = emailField();
  await typeAndAsk(field, `  ${TYPED} `);
  await answered(field);
  assert.equal(textOf(field.box()), TYPED, "what was typed, trimmed, while the read is on its way");
  field.world.value = KEPT;
  // The read lands, and the hold it lets go draws the page again, as React does after a state change.
  field.box();
  assert.equal(textOf(field.box()), KEPT, "then what the page read");
});
