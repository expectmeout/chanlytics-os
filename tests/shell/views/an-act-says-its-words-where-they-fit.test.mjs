/**
 * An act beside the row of views says its whole words where they fit, and its mark and first word where they do not,
 * in a capsule no wider than what it says (Ruben, 11 Nov 2026: on a phone 360 wide the Pipeline's "+ New" stood in a
 * capsule 124px wide, the words it did not show still asking for their room). The kit's part for an act's words
 * (kit/head/act-words.tsx) measures the room, the row's slot less the other acts in it, against the act's padding and
 * border and its two parts, and marks its fit short where they pass it; it measures again as the browser lays any of
 * them out anew, and a part kept for a reader alone is measured whole, so the words come back with the room.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact } from "../../_stub-react.mjs";

installStubReact({ __DEMO_MODE: false });

/** Each ResizeObserver made; `laidOut()` is the browser telling every one of them their boxes moved. */
const observers = new Set();
globalThis.ResizeObserver = class {
  constructor(fn) {
    this.fn = fn;
    this.boxes = new Set();
    observers.add(this);
  }
  observe(box) {
    this.boxes.add(box);
  }
  disconnect() {
    this.boxes.clear();
    observers.delete(this);
  }
};
const laidOut = () => [...observers].forEach((o) => o.fn([]));

/** An element as far as the part reads one: its box, its style, its children and its marks. */
class Box {
  constructor({ id = "", cls = "", width = 0, scrollWidth = width, style = {}, children = [] }) {
    Object.assign(this, { id, cls, width, scrollWidth, style, children, parentElement: null, marks: new Set() });
    for (const child of children) child.parentElement = this;
  }
  get offsetWidth() {
    return this.width;
  }
  get clientWidth() {
    return this.width;
  }
  getBoundingClientRect() {
    return { width: this.width };
  }
  closest(selector) {
    const cls = selector.slice(1);
    let at = this;
    while (at && at.cls !== cls) at = at.parentElement;
    return at;
  }
  querySelector(selector) {
    const cls = selector.replace(":scope > .", "");
    return this.children.find((c) => c.cls === cls) ?? null;
  }
  hasAttribute(name) {
    return this.marks.has(name);
  }
  toggleAttribute(name, on) {
    if (on) this.marks.add(name);
    else this.marks.delete(name);
  }
}
globalThis.HTMLElement = Box;
globalThis.getComputedStyle = (box) => ({
  paddingLeft: "0px",
  paddingRight: "0px",
  borderLeftWidth: "0px",
  borderRightWidth: "0px",
  columnGap: "0px",
  ...box.style,
});

const { ActWords } = await import("../../../apps/dashboard/src/surfaces/kit/head/act-words.tsx");

/** The row's slot holding one act, its words "+ New" (46px) and " proposal" (60px), its padding and border 28px. */
const row = ({ slot, rest = 60, beside = [] }) => {
  const keep = new Box({ cls: "pg-act-keep", width: 46 });
  const said = new Box({ cls: "pg-act-rest", width: rest });
  const fit = new Box({ cls: "pg-act-fit", width: 46 + rest, children: [keep, said] });
  const act = new Box({
    width: 28 + 46 + rest,
    style: { paddingLeft: "12px", paddingRight: "14px", borderLeftWidth: "1px", borderRightWidth: "1px" },
    children: [fit],
  });
  const page = new Box({ id: "pg-act", children: [act, ...beside] });
  const box = new Box({ cls: "pg-act-slot", width: slot, style: { columnGap: "8px" }, children: [page] });
  return { box, fit, said };
};
/** The ref the part hands its fit, as React would call it with the element drawn. */
const refOf = () => ActWords({ words: "New proposal" }).props.ref;

test("an act's words are whole where the row has room for them, and its first word alone where it has not", () => {
  const roomy = row({ slot: 154 });
  const stop = refOf()(roomy.fit);
  assert.equal(roomy.fit.hasAttribute("data-short"), false, "134px of words in 154px of room: all of them");
  stop();
  const tight = row({ slot: 124 });
  refOf()(tight.fit)();
  assert.equal(tight.fit.hasAttribute("data-short"), true, "134px in 124px: '+ New', the capsule its own width");
});

test("another act in the row takes its width and the gap beside it from the room", () => {
  const tools = new Box({ width: 30 });
  const { fit } = row({ slot: 154, beside: [tools] });
  refOf()(fit)();
  assert.equal(fit.hasAttribute("data-short"), true, "154 less 30 and a gap of 8 is 116: too little for 134");
});

test("the words come back as the room does, measured whole while kept for a reader alone", () => {
  const { box, fit, said } = row({ slot: 124 });
  const stop = refOf()(fit);
  assert.equal(fit.hasAttribute("data-short"), true);
  // Kept for a reader alone the rest is a box one pixel wide, and holds its 60px of words.
  said.width = 1;
  box.width = 160;
  laidOut();
  assert.equal(fit.hasAttribute("data-short"), false, "the row grew to 160: the words are whole again");
  box.width = 120;
  laidOut();
  assert.equal(fit.hasAttribute("data-short"), true, "and short again as it narrows");
  stop();
  assert.equal(observers.size, 0, "a fit taken away is watched no more");
});

test("an act with one word, or drawn outside the row of views, is never measured", () => {
  const one = ActWords({ words: "New" });
  const { fit } = row({ slot: 10 });
  fit.children = fit.children.filter((c) => c.cls !== "pg-act-rest");
  assert.equal(one.props.ref(fit), undefined, "nothing to give way");
  const loose = new Box({ cls: "pg-act-fit", children: [new Box({ cls: "pg-act-rest", width: 60 })] });
  assert.equal(refOf()(loose), undefined, "no row of views: drawn as it is");
  assert.equal(loose.hasAttribute("data-short"), false);
});
