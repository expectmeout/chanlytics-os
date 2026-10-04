/**
 * People's scopes are the page's VIEWS, and the frame draws them: the one strip of views every page has (SurfaceTabs, the
 * Inbox's Needs you / Conversations / Live), fed by what the page's chrome says (surfaces/people/chrome.ts `views`). The
 * page used to draw a strip of its own (PeopleScopeTabs, a copy of the markup) inside the route view, so it blinked with
 * the page, rode its entrance, and gave none of the glide, the warming or the instant answer the Inbox's strip gives.
 *
 * Run on the real chrome and the real strip, over a stub React:
 * - the chrome says People, Leads, and the Pipeline only where deals are on; which one is picked follows the address; a
 *   person's page says none; and nothing is said before People has landed, so the strip never gains a tab after it shows;
 * - the strip draws what the page said, with the test ids the page's specs read, marks the picked one as the page, moves
 *   to the route a tab names, and warms the routes it can move to;
 * - a page that says no views is drawn from the group it is in, as the Inbox's still is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hookFrames } from "../../_hook-frames.mjs";

let cells = [];
const frames = hookFrames();
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [cells[k], (a) => (cells[k] = red(cells[k], a))];
  },
  useEffect: (fn) => {
    fn();
  },
};
const warmed = [];
globalThis.window = {
  __DEMO_MODE: false,
  CHANLY: { address: { warmSoon: (routes) => warmed.push(...routes), warm: (r) => warmed.push(r) } },
  addEventListener() {},
  removeEventListener() {},
  setTimeout: () => 1,
  clearTimeout() {},
};
const win = globalThis.window;

const { peopleChrome } = await import("../../../../../apps/dashboard/src/surfaces/people/chrome.ts");
const { setSurfaceValue } = await import("../../../../../apps/dashboard/src/surfaces/surface-values.ts");
await import("../../../../../apps/dashboard/src/legacy/components/surface-tabs.jsx");

const people = (dealsOn) => ({ rows: [], lists: [], saved: [], dealsOn });
const viewsAt = (param) => peopleChrome({ param, backToPeople: null }).views ?? null;
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) return n.forEach((k) => walk(k, fn));
  fn(n);
  walk(n.props?.children, fn);
};
const tabsOf = (tree) => {
  const out = [];
  walk(tree, (n) => n.type === "button" && out.push(n));
  return out;
};
const strip = (props) => {
  cells = [];
  frames.begin();
  return win.SurfaceTabs({ onNavigate() {}, ...props });
};

test("the chrome says People and Leads, and the Pipeline only where deals are on", () => {
  setSurfaceValue("people", people(false));
  assert.deepEqual(
    viewsAt(null).tabs.map((t) => [t.id, t.label, t.to, t.testid]),
    [
      ["people", "People", "clients", "scope-people"],
      ["leads", "Leads", "clients/leads", "scope-leads"],
    ],
    "a workspace whose customers book is never offered a Pipeline",
  );
  setSurfaceValue("people", people(true));
  assert.deepEqual(
    viewsAt(null).tabs.map((t) => [t.label, t.to]),
    [
      ["People", "clients"],
      ["Leads", "clients/leads"],
      ["Pipeline", "clients/pipeline"],
    ],
  );
  assert.equal(viewsAt(null).label, "Which people");
  assert.equal(viewsAt(null).testid, "people-scope");
  setSurfaceValue("people", undefined);
});

test("which view is picked follows the address: a list is People's, Leads and its searches are Leads', the Pipeline is the Pipeline's where deals are on", () => {
  setSurfaceValue("people", people(true));
  for (const [param, picked] of [
    [null, "people"],
    ["new-list", "people"],
    ["seg:needs-you", "people"],
    ["list:vips", "people"],
    ["state:waiting", "people"],
    ["leads", "leads"],
    ["leads:s-austin:c-ready", "leads"],
    ["pipeline", "pipeline"],
    ["pipeline:v-board:p-x", "pipeline"],
  ])
    assert.equal(viewsAt(param).picked, picked, `${param} is on ${picked}`);
  // Where deals are off the Pipeline's address draws People's own page, and People is the view it is on.
  setSurfaceValue("people", people(false));
  assert.equal(viewsAt("pipeline").picked, "people");
  assert.equal(viewsAt("pipeline").tabs.length, 2);
  setSurfaceValue("people", undefined);
});

test("a person's page says no views, and nothing is said before People has landed", () => {
  setSurfaceValue("people", people(true));
  assert.equal(viewsAt("ed2244f3-9f88-49c5-863e-fbdea4b60e12"), null, "a person's page is on no strip");
  setSurfaceValue("people", undefined);
  assert.equal(viewsAt(null), null, "a strip that gained its third tab as People landed would move");
  assert.equal(viewsAt("leads"), null);
});

test("the strip draws the page's views as the Inbox's: the picked one active and current, a test id each, a press moves to the route", () => {
  setSurfaceValue("people", people(true));
  const moved = [];
  const tree = strip({
    page: "clients",
    param: "leads:s-a",
    views: viewsAt("leads:s-a"),
    onNavigate: (to) => moved.push(to),
  });
  assert.equal(tree.type, "nav");
  assert.match(tree.props.className, /\bstabs\b/, "the one strip of views");
  assert.equal(tree.props["aria-label"], "Which people");
  assert.equal(tree.props["data-testid"], "people-scope");
  const tabs = tabsOf(tree);
  assert.deepEqual(
    tabs.map((b) => [b.props["data-testid"], b.props.className.includes("active"), b.props["aria-current"]]),
    [
      ["scope-people", false, undefined],
      ["scope-leads", true, "page"],
      ["scope-pipeline", false, undefined],
    ],
  );
  tabs[2].props.onClick({ currentTarget: { parentElement: { querySelector: () => null, hasAttribute: () => true } } });
  tabs[0].props.onClick({ currentTarget: { parentElement: { querySelector: () => null, hasAttribute: () => true } } });
  assert.deepEqual(moved, ["clients/pipeline", "clients"], "a view is a move to the route its tab names");
  setSurfaceValue("people", undefined);
});

test("the strip warms the routes it can move to, as the Inbox's does, and draws nothing for one view", () => {
  setSurfaceValue("people", people(true));
  warmed.length = 0;
  strip({ page: "clients", param: null, views: viewsAt(null) });
  assert.deepEqual(warmed, ["clients", "clients/leads", "clients/pipeline"]);
  setSurfaceValue("people", undefined);
  const one = {
    name: "people",
    label: "x",
    picked: "people",
    tabs: [{ id: "people", label: "People", to: "clients" }],
  };
  assert.equal(strip({ page: "clients", param: null, views: one }), null, "a strip of one draws nothing");
});

test("a page that says no views is drawn from its group: the Inbox's still reads Needs you, Conversations, Live", () => {
  const tree = strip({ page: "conversations", param: null, views: null });
  assert.match(tree.props.className, /stabs-inbox/);
  assert.equal(tree.props["aria-label"], "Section views");
  assert.deepEqual(
    tabsOf(tree).map((b) => b.props.className.includes("active")),
    [false, true, false],
  );
  // A person's page (no views said) keeps the strip hidden, as it was.
  win.__DEMO_MODE = true;
  assert.equal(strip({ page: "clients", param: "c-aisha", views: null }), null);
  win.__DEMO_MODE = false;
});
