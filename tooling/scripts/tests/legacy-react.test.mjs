/**
 * The shared stub React the legacy pages' tests draw on (_legacy-react.mjs): a component keeps its state where it sits.
 *
 * It kept every hook on a page in one call order, so a sheet drawn only while open moved every cell after it. The
 * Business tab was shaped around that: hookless rows, the sheet slot last. Now the stub keys hooks as React does
 * (_hook-frames.mjs), and throws as React does when a component's hooks change in number.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, find } from "./_legacy-react.mjs";

installLegacyReact();
const R = globalThis.React;
const h = R.createElement;

let setCount = null;
const Counter = () => {
  const [n, set] = R.useState(0);
  setCount = set;
  return h("span", { "data-testid": "count" }, String(n));
};
const Sheet = () => {
  const [a] = R.useState("a");
  const box = R.useRef(null);
  R.useEffect(() => undefined, []);
  return h("div", { ref: box }, a);
};
const Page = ({ open }) => h("main", null, open ? h(Sheet) : null, h(Counter));
const count = (tree) => find(tree, (n) => n.props?.["data-testid"] === "count").props.children[0];

test("a sheet drawn before a card only while open moves none of the card's state", () => {
  fresh();
  const draw = (open) => again(() => h(Page, { open }));
  draw(false);
  setCount(4);
  assert.equal(count(draw(false)), "4");
  assert.equal(count(draw(true)), "4", "REGRESSION: by call order the card read the sheet's cell once it opened");
  assert.equal(count(draw(false)), "4");
});

test("a component whose hooks change in number throws, and fresh() starts a new tree", () => {
  fresh();
  const Shifty = ({ more }) => {
    R.useState(0);
    if (more) R.useRef(null);
    return null;
  };
  again(() => h("div", null, h(Shifty, { more: false })));
  assert.throws(() => again(() => h("div", null, h(Shifty, { more: true }))), /Rendered more hooks/);
  fresh();
  assert.doesNotThrow(() => again(() => h("div", null, h(Shifty, { more: true }))));
});
