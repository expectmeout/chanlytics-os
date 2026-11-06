/**
 * The Line's parts (surfaces/kit/line/line.tsx), EXECUTED on the stub React: what each hands the element it draws. Their
 * skeletons against the gallery's Line family are kit-components.test.mjs's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fresh, installLegacyReact } from "../_legacy-react.mjs";
import { LineField, LinePress } from "../../apps/dashboard/src/surfaces/kit/line/line.tsx";

installLegacyReact();

const h = (type, props, ...children) => globalThis.React.createElement(type, props, ...children);
/** The element a part drew, as the stub holds it: its tag, and its props. */
const drawn = (element) => {
  fresh();
  let node = element;
  while (typeof node.type === "function") node = node.rendered;
  return node;
};
const propsOf = (node) =>
  Object.keys(node.props)
    .filter((k) => k !== "children")
    .sort();

test("a press names its kind, takes the page's class last, hands on its ref and keeps the kit's props off the element", () => {
  const hold = { current: null };
  const onClick = () => undefined;
  const chip = drawn(h(LinePress, { kind: "chip", selected: true, className: "ask-next", ref: hold, onClick }, "Why?"));
  assert.equal(chip.type, "button");
  assert.equal(chip.props.type, "button", "a press submits no form");
  assert.equal(chip.props.className, "line-chip sel ask-next", "the page's layout class comes last");
  assert.equal(chip.props.ref, hold, "the ref reaches the element");
  assert.deepEqual(propsOf(chip), ["className", "onClick", "ref", "type"], "the kit's props stay off it");
  const talk = drawn(h(LinePress, { kind: "talk", on: true, "aria-label": "Talk" }));
  assert.equal(talk.props.className, "line-send line-talk on");
});

test("the field is a textarea that says while a mic listens, and nothing at rest", () => {
  const hold = { current: null };
  const field = drawn(h(LineField, { rows: 1, ref: hold, className: "ask-line-input", listening: true }));
  assert.equal(field.type, "textarea");
  assert.equal(field.props.className, "line-field ask-line-input");
  assert.equal(field.props["data-listening"], "true", "what colours its placeholder while a mic listens");
  assert.equal(field.props.ref, hold);
  assert.equal(drawn(h(LineField, { rows: 1 })).props["data-listening"], undefined, "at rest it says nothing");
});
