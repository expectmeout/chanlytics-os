/**
 * A person's address holds (contracts peopleRoute, `p-`): a link to a person, or a refresh on one who is open, opens that
 * person and leaves the address and the tab's history as they stand (people/peek/use-people-peek.ts usePeekAddress).
 *
 * 2 Nov 2026, on the rig: a person opened by their address, with the tab's cursor kept on another row, drew the OTHER
 * row's person, and the address walked to them. With no cursor kept it came right by itself, an entry too many in the
 * tab's history. React's StrictMode check, which the app runs in development, runs every effect of a new tree a second
 * time over the SAME draw: the second run found the page without the person the address had just asked for, took it for
 * the page having closed them, and wrote the address without them; the rows' place, run again first, put the kept cursor
 * back, and the peek follows the cursor. The same defect as leads/finder/an-address-keeps-its-lead.test.mjs.
 *
 * Run against the rows' place and the peek, in the order the page calls them (people/page/state.ts), in a component drawn
 * by hand, as that file does: the draw, every effect after it, in the StrictMode check every effect again over that same
 * draw, and only then what they set.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fromDashboard = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/dashboard/src/bridge/_.js"),
);

const listeners = new Map();
const held = new Map();
globalThis.window = {
  location: { pathname: "/w/harbor/people" },
  sessionStorage: {
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v) => held.set(k, v),
    removeItem: (k) => held.delete(k),
  },
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: (name) => listeners.delete(name),
  document: { getElementById: () => null, activeElement: null },
};
globalThis.document = globalThis.window.document;
// A person's read goes nowhere: who is open is what this proves, not what they are read as.
globalThis.fetch = () => new Promise(() => {});

const react = fromDashboard("react");
const { parsePeopleRoute } = fromDashboard("@chanlytics/contracts");
const { usePeoplePeek } = fromDashboard("../surfaces/people/peek/use-people-peek.ts");
const { usePlPlace } = fromDashboard("../surfaces/people/hooks/use-place.ts");
const { placeSave } = fromDashboard("../surfaces/people/shell-verbs.ts");

const PA = "c0de0000-0000-4000-8000-00000000000a";
const PB = "c0de0000-0000-4000-8000-00000000000b";
const PC = "c0de0000-0000-4000-8000-00000000000c";
const ROWS = [PA, PB, PC].map((id) => ({ id }));

/** What the page's controls hand the rows' place: nothing of them is under test. */
const controls = {
  phone: false,
  setBulkSheet() {},
  selectMode: false,
  setSelectMode() {},
  sel: new Set(),
  setSel() {},
  toggleSel() {},
  setAllMatching() {},
  clearSelection() {},
  q: "",
  setQ() {},
  searchRef: { current: null },
  scrollRef: { current: null },
};

/**
 * People's page as far as its peek goes, at an address, drawn by hand. `strict`: React's StrictMode check, on a new tree.
 * `entries`: the tab's history from where the page opened, which `nav` writes as the shell does and Back walks. An address
 * a commit moved is drawn before what that commit set, as the rig logged them: it is why the page came right by itself.
 */
const peopleAt = (route, { strict = false, rows = ROWS } = {}) => {
  const cells = [];
  const effects = [];
  const at = { rows };
  const entries = [route];
  const navs = [];
  const sets = [];
  let moved = true;
  let addressMoved = false;
  let shown = { peekId: null, cursor: null };
  let doors = null;
  const here = () => entries[entries.length - 1];
  globalThis.window.history = {
    back() {
      entries.pop();
      moved = true;
    },
  };
  const draw = () => {
    let i = 0;
    let e = 0;
    react.useState = (first) => {
      const k = i++;
      if (!(k in cells)) cells[k] = typeof first === "function" ? first() : first;
      return [
        cells[k],
        (v) => {
          sets.push(() => (cells[k] = typeof v === "function" ? v(cells[k]) : v));
        },
      ];
    };
    react.useRef = (v) => ((cells[i] ??= { current: v }), cells[i++]);
    react.useCallback = (fn) => fn;
    react.useEffect = (fn, deps) => {
      const k = e++;
      const was = effects[k];
      if (was && deps && deps.every((d, n) => Object.is(d, was.deps[n]))) return;
      effects[k] = { fn, deps, cleanup: was?.cleanup, due: true };
    };
    const { view, peek } = parsePeopleRoute(here());
    const ids = at.rows.map((r) => r.id);
    const place = usePlPlace({
      controls,
      page: "people",
      view: view ?? "all",
      ids,
      noun: "person",
      selectionOf: view ?? "all",
    });
    const open = usePeoplePeek({
      addrPeek: peek,
      view,
      phone: false,
      shownIds: ids,
      cursor: place.cursor,
      setCursor: place.setCursor,
      nav: (to, opts) => {
        navs.push([to, opts?.replace ? "replace" : "push"]);
        if (opts?.replace) entries[entries.length - 1] = to;
        else entries.push(to);
        moved = true;
        addressMoved = true;
      },
      rows: at.rows,
    });
    doors = { ...open, setCursor: place.setCursor };
    shown = { peekId: open.peekId, cursor: place.cursor };
  };
  /** Every effect due, in the order the hooks declared them, as React runs them after a draw. */
  const commit = () => {
    const due = effects.filter((ef) => ef?.due);
    for (const ef of due) {
      ef.due = false;
      if (typeof ef.cleanup === "function") ef.cleanup();
      ef.cleanup = ef.fn();
    }
    return due;
  };
  /** React's check of a new tree: every effect let go of, and run again over the draw it was made in. */
  const checked = (ran) => {
    for (const ef of ran) if (typeof ef.cleanup === "function") ef.cleanup();
    for (const ef of ran) ef.cleanup = ef.fn();
  };
  /** Draws until nothing moves: what a person sees once the page has settled. `isNew`: the first commit of a new tree. */
  const settle = (isNew = false) => {
    for (let n = 0; moved || sets.length; n += 1) {
      assert.ok(n < 20, "the page settles");
      moved = false;
      if (!addressMoved) for (const set of sets.splice(0)) set();
      addressMoved = false;
      draw();
      const ran = commit();
      if (isNew && strict && n === 0) checked(ran);
    }
  };
  settle(true);
  return {
    navs,
    entries,
    get peek() {
      return shown.peekId;
    },
    get cursor() {
      return shown.cursor;
    },
    get route() {
      return here();
    },
    land(next) {
      at.rows = next;
      moved = true;
      settle();
    },
    press(id) {
      doors.openPeek(id);
      settle();
    },
    walk(id) {
      doors.setCursor(id);
      settle();
    },
    close() {
      doors.closePeek();
      settle();
    },
    go(to) {
      entries.push(to);
      moved = true;
      settle();
    },
  };
};

const fresh = () => {
  held.clear();
  listeners.clear();
};

for (const [name, strict] of [
  ["its effects run once, as a built page's do", false],
  ["its effects run twice, as React's check runs them in development", true],
]) {
  test(`a link to a person opens them and leaves the address and the history as they stood, however ${name}`, () => {
    fresh();
    const route = `clients/state:all:p-${PB}`;
    const page = peopleAt(route, { strict });
    assert.equal(page.peek, PB, "the person the address names is open, with nothing pressed");
    assert.equal(page.cursor, PB, "and the rows' cursor is on them");
    assert.deepEqual(page.navs, [], "and the page writes nothing over the address");
    assert.deepEqual(page.entries, [route], "so Back leaves as it would have, with no entry of the page's in the way");
  });

  test(`a view's person opens the same, however ${name}`, () => {
    fresh();
    const route = `clients/state:new:p-${PB}`;
    const page = peopleAt(route, { strict });
    assert.equal(page.peek, PB);
    assert.deepEqual(page.navs, []);
  });

  test(`a person opened with the tab's cursor on another row stays open, however ${name}`, () => {
    fresh();
    placeSave("people", "all", { cursor: PA, q: "" });
    const route = `clients/state:all:p-${PB}`;
    const page = peopleAt(route, { strict });
    assert.equal(page.peek, PB, "the kept cursor does not walk the peek off the person the address names");
    assert.equal(page.cursor, PB);
    assert.deepEqual(page.navs, [], "nor the address with it");
  });

  test(`the rows landing after the person leave them open, however ${name}`, () => {
    fresh();
    const page = peopleAt(`clients/state:all:p-${PC}`, { strict, rows: [] });
    assert.equal(page.peek, PC, "the address opens them before the rows of the view are in");
    page.land(ROWS);
    assert.equal(page.peek, PC, "and the rows arriving move nothing");
    assert.deepEqual(page.navs, []);
  });

  test(`a person who came with the address still closes by replacing it, however ${name}`, () => {
    fresh();
    const page = peopleAt(`clients/state:all:p-${PB}`, { strict });
    page.close();
    assert.equal(page.peek, null);
    assert.deepEqual(page.navs, [["clients", "replace"]], "the page's own close is the page's to say");
    assert.deepEqual(page.entries, ["clients"], "with no entry of the page's to go back to");
  });

  test(`a person opened on the rows still pushes their address, and closes by going back, however ${name}`, () => {
    fresh();
    const page = peopleAt("clients", { strict });
    page.press(PA);
    assert.deepEqual(page.navs, [[`clients/state:all:p-${PA}`, "push"]]);
    assert.equal(page.peek, PA);
    page.close();
    assert.equal(page.peek, null);
    assert.deepEqual(page.entries, ["clients"], "Back goes to the entry the opening made");
  });

  test(`walking the rows from a person who came with the address replaces it, however ${name}`, () => {
    fresh();
    const page = peopleAt(`clients/state:all:p-${PA}`, { strict });
    page.walk(PB);
    assert.equal(page.peek, PB, "the peek follows the cursor, as it does for one pressed open");
    assert.deepEqual(page.navs, [[`clients/state:all:p-${PB}`, "replace"]]);
  });

  test(`an address that moves to another person opens them, however ${name}`, () => {
    fresh();
    const page = peopleAt(`clients/state:all:p-${PA}`, { strict });
    page.go(`clients/state:all:p-${PC}`);
    assert.equal(page.peek, PC);
    assert.equal(page.cursor, PC);
    assert.deepEqual(page.navs, [], "the page follows an address, and says nothing back");
  });
}
