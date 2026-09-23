/**
 * The stub Reacts' frames (_hook-frames.mjs): a component keeps its state where it sits, whatever else is drawn.
 *
 * The page tests drew on stubs that kept every hook's cell by the order hooks were called in across a whole draw, so a
 * sheet drawn only while open moved the cell of every hook after it, and the People page was one component with every
 * hook of both of its scopes in one order. Run here on a stub of this file's own, the way the page tests build theirs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hookFrames } from "./_hook-frames.mjs";

const frames = hookFrames();
let cells = [];
const React = {
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
};
const h = React.createElement;

let setCount = null;
const Counter = () => {
  const [n, set] = React.useState(0);
  setCount = set;
  return h("span", null, String(n));
};
const Sheet = () => {
  const [a] = React.useState("a");
  const [b] = React.useState("b");
  return h("div", null, a + b);
};
const Page = ({ open }) => {
  const [title] = React.useState("People");
  return h("main", null, title, open ? h(Sheet) : null, h(Counter));
};
const draw = (props) => {
  frames.begin();
  return Page(props);
};
const counter = (tree) => tree.props.children.find((c) => c && c.type === Counter).rendered.props.children[0];

test("a sheet drawn only while open moves nobody else's state -- by call order, opening it handed the counter the sheet's cell", () => {
  cells = [];
  draw({ open: false });
  setCount(3);
  assert.equal(counter(draw({ open: false })), "3");
  assert.equal(counter(draw({ open: true })), "3", "REGRESSION: the counter read the sheet's cell once it opened");
  assert.equal(counter(draw({ open: false })), "3");
});

test("siblings of one type keep their own cells by their turn, or by their key; a draw begins again at the root", () => {
  cells = [];
  const sets = [];
  const Item = () => {
    const [v, set] = React.useState(0);
    sets.push(set);
    return h("li", null, String(v));
  };
  const List = ({ keys }) => h("ul", null, ...keys.map((k) => h(Item, k === null ? null : { key: k })));
  const words = (tree) => tree.props.children.map((c) => c.rendered.props.children[0]);
  frames.begin();
  List({ keys: [null, null] });
  sets[1](7);
  frames.begin();
  assert.deepEqual(words(List({ keys: [null, null] })), ["0", "7"], "the second of its type keeps the second's state");
  sets.length = 0;
  frames.begin();
  List({ keys: ["x", "y"] });
  sets[0](5);
  frames.begin();
  assert.deepEqual(words(List({ keys: ["y", "x"] })), ["0", "5"], "a keyed child keeps its state wherever it moves");
  frames.begin();
  assert.equal(frames.called(), 0);
  List({ keys: ["x"] });
  assert.equal(frames.called(), 1, "how many hooks the draw called, for a test that counts them");
});

test("a component that calls a different number of hooks from one draw to the next throws, as React does; reset() forgets", () => {
  // Kept apart, a component whose hooks change in number shifts nobody else's cells, so no neighbour's test would see
  // it: the frames throw the error React throws instead.
  cells = [];
  frames.reset();
  const Shifty = ({ more }) => {
    React.useState(0);
    if (more) React.useState(1);
    return h("i", null);
  };
  const Host = ({ more }) => h("div", null, h(Shifty, { more }));
  frames.begin();
  Host({ more: false });
  frames.begin();
  assert.throws(() => Host({ more: true }), /Rendered more hooks than during the previous render/);
  frames.reset();
  frames.begin();
  Host({ more: true });
  frames.begin();
  assert.throws(() => Host({ more: false }), /Rendered fewer hooks/);
});
