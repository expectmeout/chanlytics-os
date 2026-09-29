/**
 * The comparison the style-equality tool makes (tooling/scripts/checks/style-equality.mjs), on recordings written for
 * it, its reading of a stylesheet's rules, and which requests refuse a page. Recording needs a browser and the
 * harness, so it is a tool a person runs; what decides "moved nothing" is this comparison, and it is held here
 * (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareRecordings, EDGE_TOLERANCE, loadRefusal, rulesOf } from "../../checks/style-equality.mjs";

const PROPERTIES = ["color", "border-top-left-radius"];
const META = {
  format: 2,
  pages: {},
  scenes: {},
  viewports: {},
  themes: ["dark"],
  edgeStep: 1 / 64,
  laidOut: [],
  properties: PROPERTIES,
  browser: "140.0",
};
const PAGE = "salon desk dark #/today";
const BLACK = ["rgb(0, 0, 0)", "8px"];
const SQUARE = ["rgb(0, 0, 0)", "0px"];
const button = ["body:1>div:1>button:1", [10, 20, 90, 50], BLACK];
const label = ["body:1>div:1>span:1", [100, 20, 140, 36], SQUARE];

/** A recording of `pages`, each entry `[path, edges, values]`, with its styles in one table as record() writes them. */
function recording(pages, { meta = {}, rules = {} } = {}) {
  const styles = [];
  const ids = new Map();
  const id = (values) => {
    const k = JSON.stringify(values);
    if (!ids.has(k)) ids.set(k, styles.push(values) - 1);
    return ids.get(k);
  };
  const out = { meta: { ...META, ...meta }, styles, pages: {}, rules };
  for (const [page, list] of Object.entries(pages)) out.pages[page] = list.map(([p, edges, v]) => [p, edges, id(v)]);
  return out;
}

test("one recording against a copy of itself is equal, and says how much it compared", () => {
  const a = recording({ [PAGE]: [button, label] });
  const { equal, mismatch, pages, elements, count, differences } = compareRecordings(a, structuredClone(a));
  assert.deepEqual(
    { equal, mismatch, pages, elements, count, differences },
    {
      equal: true,
      mismatch: [],
      pages: 1,
      elements: 2,
      count: 0,
      differences: [],
    },
  );
});

test("styles are compared by their values, not by where the table keeps them", () => {
  const a = recording({ [PAGE]: [button, label] });
  // The label first: its style is the table's first entry after, the button's before.
  assert.equal(compareRecordings(a, recording({ [PAGE]: [label, button] })).equal, true);
  const b = recording({ [PAGE]: [label, [button[0], button[1], ["rgb(0, 0, 0)", "9px"]]] });
  assert.deepEqual(compareRecordings(a, b).differences, [
    { page: PAGE, element: button[0], what: "border-top-left-radius", before: "8px", after: "9px" },
  ]);
});

test("an edge within the tolerance of where it was has not moved; twice as far, or a box that grew as it moved, has", () => {
  const at = (edges) => recording({ [PAGE]: [[button[0], edges, BLACK]] });
  const here = at([10, 20, 90, 50]);
  // The 2/64 of a pixel one line of text was once laid out apart by, in two recordings of one tree.
  assert.equal(compareRecordings(here, at([10, 20, 90 - 2 / 64, 50])).equal, true);
  assert.equal(compareRecordings(here, at([10 + EDGE_TOLERANCE, 20, 90, 50])).equal, true);
  assert.equal(compareRecordings(here, at([10 + 2 * EDGE_TOLERANCE, 20, 90, 50])).equal, false);
  // Half a pixel further right and half a pixel wider, each within the half pixel boxes were once allowed: the right
  // edge moved a whole pixel, which a person can see.
  assert.deepEqual(compareRecordings(here, at([10.5, 20, 91, 50])).differences, [
    { page: PAGE, element: button[0], what: "edges", before: [10, 20, 90, 50], after: [10.5, 20, 91, 50] },
  ]);
  // A pseudo-element has no edges; two of them agree, and one that gained edges did not.
  const pseudo = (edges) => recording({ [PAGE]: [["body:1>div:1::before", edges, BLACK]] });
  assert.equal(compareRecordings(pseudo(null), pseudo(null)).equal, true);
  assert.equal(compareRecordings(pseudo(null), pseudo([0, 0, 1, 1])).equal, false);
});

test("a pseudo-element's laid-out lengths are held as its edges would be; its other values exactly", () => {
  const meta = { properties: ["width", "transform-origin", "color"], laidOut: ["width", "transform-origin"] };
  const before = ["178px", "89px 1.5px", "rgb(0, 0, 0)"];
  const drawn = (values) => recording({ [PAGE]: [["body:1>div:1::after", null, values]] }, { meta });
  const compare = (values) => compareRecordings(drawn(before), drawn(values)).differences.map((d) => d.what);
  assert.deepEqual(compare(["177.969px", "88.984px 1.5px", "rgb(0, 0, 0)"]), []);
  assert.deepEqual(compare(["179px", "89px 1.5px", "rgb(0, 0, 0)"]), ["width"]);
  assert.deepEqual(compare(["178px", "89px 1.5px", "rgb(0, 0, 1)"]), ["color"]);
  assert.deepEqual(compare(["178px", "center 1.5px", "rgb(0, 0, 0)"]), ["transform-origin"]);
});

test("what is gone or new is listed before what moved, the count is exact and the list is capped", () => {
  const many = Array.from({ length: 40 }, (_, i) => [`body:1>p:${i + 1}`, [0, i, 10, i + 1], BLACK]);
  const recolored = many.slice(1).map(([p, edges]) => [p, edges, ["rgb(1, 1, 1)", "8px"]]);
  const before = recording({ [PAGE]: many, "salon phone dark #/today": many });
  const after = recording({ [PAGE]: [...recolored, ["body:1>i:1", [0, 0, 1, 1], BLACK]] });
  const result = compareRecordings(before, after, 5);
  // 39 colours, the first paragraph gone, an <i> new, and the phone's page missing.
  assert.equal(result.count, 42);
  assert.deepEqual(
    result.differences.map((d) => d.what),
    ["the element is gone after", "the element is new after", "the page is missing after", "color", "color"],
  );
});

test("two recordings made differently are not compared, and say how; a planted fault is not a difference of setup", () => {
  const a = recording({ [PAGE]: [button] });
  const b = recording(
    { [PAGE]: [button] },
    { meta: { browser: "141.0", properties: [...PROPERTIES, "outline-color"] } },
  );
  const result = compareRecordings(a, b);
  assert.equal(result.equal, false);
  assert.deepEqual(result.mismatch, ["the properties", "the browser (140.0 and 141.0)"]);
  assert.equal(result.count, 0);
  const planted = recording({ [PAGE]: [button] }, { meta: { planted: ":root { --radius-md: 9px !important; }" } });
  assert.deepEqual(compareRecordings(a, planted).mismatch, []);
});

test("a rule that changed where no page drew it is named; one a page drew, or one that did not change, is not", () => {
  const sheet = (rules) => ({ "styles/components.css": rules });
  const a = recording(
    { [PAGE]: [button] },
    {
      rules: sheet([
        [".btn { color: red; }", 1],
        [".menu { color: red; }", 0],
        [".chip { padding: 2px; }", 0],
      ]),
    },
  );
  const b = recording(
    { [PAGE]: [button] },
    {
      rules: sheet([
        [".btn { color: blue; }", 1],
        [".menu { color: blue; }", 0],
        [".chip { padding: 2px; }", 0],
      ]),
    },
  );
  const result = compareRecordings(a, b);
  assert.equal(result.equal, true, "nothing the pages drew moved");
  assert.equal(result.changedRules, 4);
  assert.deepEqual(
    result.unseen.map((r) => [r.change, r.sheet, r.rule]),
    [
      ["removed", "styles/components.css", ".menu { color: red; }"],
      ["added", "styles/components.css", ".menu { color: blue; }"],
    ],
  );
});

test("a stylesheet's rules: each named with the group rules around it, comments dropped, none from @keyframes", () => {
  const css = `/* a head { } */
.a { color: red; /* why */ }
.b::before { content: "}{"; }
@media (max-width: 900px) {
  .a,
  .c { padding: 1px; }
}
@keyframes spin { from { opacity: 0 } to { opacity: 1 } }
@font-face { font-family: X; src: local(Arial); }
@supports (display: grid) { @media print { .d { display: grid } } }`;
  const rules = rulesOf(css);
  assert.deepEqual(
    rules.map((r) => r.text),
    [
      ".a { color: red; }",
      '.b::before { content: "}{"; }',
      "@media (max-width: 900px) { .a, .c { padding: 1px; }",
      "@supports (display: grid) { @media print { .d { display: grid }",
    ],
  );
  // Where each rule's brace stands, which a range of the browser's coverage holds when a page drew it.
  assert.deepEqual(
    rules.map((r) => css[r.open]),
    ["{", "{", "{", "{"],
  );
});

test("a stylesheet or a font that did not load, or answered with an error, refuses its page; a redirect, one that loaded, or any other request does not", () => {
  const kit = "http://localhost:3210/w/studio/surfaces/kit/kit.css?v=3";
  assert.equal(loadRefusal({ url: kit, type: "stylesheet", status: 200 }), null);
  assert.equal(loadRefusal({ url: kit, type: "stylesheet", status: 204 }), null, "any 2xx is an answer");
  assert.equal(loadRefusal({ url: kit, type: "stylesheet", status: 301 }), null, "a redirect is on its way to one");
  assert.equal(loadRefusal({ url: kit, type: "stylesheet", status: 304 }), null, "and so is what the cache holds");
  // What step 2.1 met: the page drew without the kit, and the run recorded the difference instead of refusing.
  assert.equal(
    loadRefusal({ url: kit, type: "stylesheet", failure: "net::ERR_ABORTED" }),
    "the stylesheet surfaces/kit/kit.css did not load (net::ERR_ABORTED)",
  );
  assert.equal(
    loadRefusal({ url: kit, type: "stylesheet", status: 404 }),
    "the stylesheet surfaces/kit/kit.css answered 404",
  );
  assert.equal(
    loadRefusal({ url: "http://localhost:3210/styles/tokens.css", type: "stylesheet", status: 500 }),
    "the stylesheet styles/tokens.css answered 500",
    "a page opened at the root names its stylesheets from there",
  );
  // Another host's stylesheet (the fonts) is named by its address: without it, every line of text is laid out anew.
  const fonts = "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&display=swap";
  assert.equal(loadRefusal({ url: fonts, type: "stylesheet", status: 503 }), `the stylesheet ${fonts} answered 503`);
  // A face's file that did not come in: the page draws its text in a fallback face, laid out otherwise.
  const face = "https://fonts.gstatic.com/s/geist/v1/geist-latin.woff2";
  assert.equal(loadRefusal({ url: face, type: "font", status: 200 }), null);
  assert.equal(
    loadRefusal({ url: face, type: "font", failure: "net::ERR_FAILED" }),
    `the font ${face} did not load (net::ERR_FAILED)`,
  );
  assert.equal(loadRefusal({ url: face, type: "font", status: 404 }), `the font ${face} answered 404`);
  // A script's failure is the page's to throw over, and a read's is the page's to say; neither is judged here.
  assert.equal(loadRefusal({ url: "http://localhost:3210/_hx/fixture.js", type: "script", status: 404 }), null);
  assert.equal(
    loadRefusal({ url: "http://localhost:3210/api/v1/me", type: "fetch", failure: "net::ERR_FAILED" }),
    null,
  );
});
