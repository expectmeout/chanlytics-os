/**
 * A lead's address holds (contracts leadsRoute, `p-`): a link to a lead, or a refresh on one that is open, opens that lead
 * and leaves the address as it stands (page/peek-hooks.ts useLeadPeekAddress).
 *
 * 2 Nov 2026, on the rig: a lead opened by its address drew no sheet, and the address lost its `:p-`. The page's first
 * draw follows the address, and React's StrictMode check, which the app runs in development, runs every effect of a new
 * tree a second time over the SAME draw, before the state the first run set is drawn. That second run found the page
 * without the lead the address had just asked for, took it for the page having closed it, and wrote the address over.
 * The chips did the same (page/reads.ts useLeadChipsAddress): `:f-strong` gave the table its fit, and the second run,
 * finding the table not drawn with it yet, wrote the address from the table and left the two saying different things.
 *
 * Run against the page's hooks that hold the address, the chips, the rows' place, the peek and its address, in the order
 * LeadsReal calls them (page/leads-real.tsx useLeadsView), in a component drawn by hand. leads-honest.test.mjs draws the
 * whole page, and its effects run once; this draws the commit as React makes it: the draw, every effect after it, in the
 * StrictMode check every effect again over that same draw, and only then what they set.
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
  location: { pathname: "/w/harbor/people/leads" },
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

const react = fromDashboard("react");
const { useLeadPeek, useLeadPeekAddress } = fromDashboard("../surfaces/leads/page/peek-hooks.ts");
const { leadChipsOf, leadNarrowings, useLeadChipsAddress } = fromDashboard("../surfaces/leads/page/reads.ts");
const { leadsViewAt } = fromDashboard("../surfaces/leads/page/state.ts");
const { usePlPlace } = fromDashboard("../surfaces/people/hooks/use-place.ts");
const { placeSave } = fromDashboard("../surfaces/people/shell-verbs.ts");

const SEARCH = "5e000000-0000-4000-8000-000000000001";
const UA = "1ead0000-0000-4000-8000-00000000000a";
const UB = "1ead0000-0000-4000-8000-00000000000b";
const UC = "1ead0000-0000-4000-8000-00000000000c";
const ROWS = [UA, UB, UC].map((id) => ({ id, tile: null }));

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
 * Leads' page as far as its lead goes, at an address, drawn by hand. `strict`: React's StrictMode check, on a new tree.
 * `nav` moves the address as the shell does, and the next draw has it. `peek`, what the page holds open now; `close`, the
 * page closing it, as Esc and the sheet's Close do; `chips`, what the table narrows by, its own filters as the kit's table
 * keeps them (kit/table/state.ts); `fit`, the band's fit picked.
 */
const leadsAt = (route, { strict = false, rows = ROWS } = {}) => {
  const cells = [];
  const effects = [];
  const at = { route, rows };
  const navs = [];
  const backs = [];
  let moved = true;
  let shown = { peekId: null, cursor: null, chips: {} };
  let setPeekId = null;
  let setFit = null;
  const draw = () => {
    let i = 0;
    let e = 0;
    react.useState = (first) => {
      const k = i++;
      if (!(k in cells)) cells[k] = typeof first === "function" ? first() : first;
      return [
        cells[k],
        (v) => {
          const next = typeof v === "function" ? v(cells[k]) : v;
          if (Object.is(next, cells[k])) return;
          cells[k] = next;
          moved = true;
        },
      ];
    };
    react.useRef = (v) => ((cells[i] ??= { current: v }), cells[i++]);
    react.useEffect = (fn, deps) => {
      const k = e++;
      const was = effects[k];
      if (was && deps && deps.every((d, n) => Object.is(d, was.deps[n]))) return;
      effects[k] = { fn, deps, cleanup: was?.cleanup, due: true };
    };
    const { leadView, viewRoute, addrPeek } = leadsViewAt(at.route);
    const [peekId, setPeek] = react.useState(null);
    const [peekMode, setPeekMode] = react.useState("info");
    const [armed, setArmed] = react.useState(null);
    const [, setDraft] = react.useState(null);
    const [filters, setFilters] = react.useState({});
    const narrow = leadNarrowings({
      filterOf: (id) => filters[id] ?? null,
      setFilter: (id, value) => setFilters((f) => ({ ...f, [id]: value })),
    });
    setPeekId = setPeek;
    setFit = narrow.setFitChip;
    const nav = (to, opts) => {
      navs.push([to.replace(`s-${SEARCH}`, "s-S"), opts?.replace ? "replace" : "push"]);
      at.route = to;
      moved = true;
    };
    const ids = at.rows.map((r) => r.id);
    useLeadChipsAddress({ leadView, addrPeek, narrow, nav });
    const place = usePlPlace({
      controls,
      page: "leads",
      view: viewRoute,
      ids,
      noun: "lead",
      landed: true,
      selectionOf: viewRoute,
      extra: { map: false },
    });
    useLeadPeek({
      peekId,
      setPeekId: setPeek,
      shownIds: ids,
      leadShown: at.rows,
      cursor: place.cursor,
      setCursor: place.setCursor,
      peekMode,
      armed,
      setArmed,
      reach() {},
    });
    useLeadPeekAddress({
      leadView,
      viewRoute,
      addrPeek,
      peekId,
      setPeekId: setPeek,
      setCursor: place.setCursor,
      setPeekMode,
      setArmed,
      setDraft,
      nav,
    });
    shown = { peekId, cursor: place.cursor, chips: leadChipsOf(narrow) };
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
  /** Draws until nothing moves: what a person sees once the page has settled. */
  const settle = () => {
    for (let n = 0; moved; n += 1) {
      assert.ok(n < 20, "the page settles");
      moved = false;
      draw();
      const ran = commit();
      if (strict && n === 0) checked(ran);
    }
  };
  settle();
  return {
    navs,
    backs,
    get peek() {
      return shown.peekId;
    },
    get cursor() {
      return shown.cursor;
    },
    get chips() {
      return shown.chips;
    },
    get route() {
      return at.route;
    },
    fit(fit) {
      setFit(fit);
      settle();
    },
    go(to) {
      at.route = to;
      moved = true;
      settle();
    },
    land(next) {
      at.rows = next;
      moved = true;
      settle();
    },
    open(id) {
      setPeekId(id);
      settle();
    },
    close() {
      setPeekId(null);
      settle();
    },
  };
};

const fresh = () => {
  held.clear();
  listeners.clear();
  globalThis.window.history = {};
};

for (const [name, strict] of [
  ["its effects run once, as a built page's do", false],
  ["its effects run twice, as React's check runs them in development", true],
]) {
  test(`a link to a lead opens it and leaves the address as it said, however ${name}`, () => {
    fresh();
    const route = `clients/leads:s-${SEARCH}:p-${UB}`;
    const page = leadsAt(route, { strict });
    assert.equal(page.peek, UB, "the lead the address names is open, with nothing pressed");
    assert.equal(page.cursor, UB, "and the rows' cursor is on it");
    assert.deepEqual(page.navs, [], "and the page writes nothing over the address");
    assert.equal(page.route, route);
  });

  test(`a lead with no view named opens the same, however ${name}`, () => {
    fresh();
    const page = leadsAt(`clients/leads:p-${UB}`, { strict });
    assert.equal(page.peek, UB);
    assert.deepEqual(page.navs, []);
  });

  test(`the rows landing after the lead leave it open, however ${name}`, () => {
    fresh();
    const page = leadsAt(`clients/leads:s-${SEARCH}:p-${UC}`, { strict, rows: [] });
    assert.equal(page.peek, UC, "the address opens it before the rows of its view are in");
    page.land(ROWS);
    assert.equal(page.peek, UC, "and the rows arriving move nothing");
    assert.deepEqual(page.navs, []);
  });

  test(`a refresh on a lead, the tab's kept cursor on another row, stays on the lead, however ${name}`, () => {
    fresh();
    const view = `clients/leads:s-${SEARCH}`;
    placeSave("leads", view, { cursor: UC, q: "" });
    const route = `${view}:p-${UA}`;
    const page = leadsAt(route, { strict });
    assert.equal(page.peek, UA, "the kept cursor does not walk the peek off the lead the address names");
    assert.equal(page.cursor, UA);
    assert.deepEqual(page.navs, [], "nor the address with it");
  });

  test(`a lead that came with the address still closes by replacing it, however ${name}`, () => {
    fresh();
    const view = `clients/leads:s-${SEARCH}`;
    const page = leadsAt(`${view}:p-${UB}`, { strict });
    page.close();
    assert.equal(page.peek, null);
    assert.deepEqual(page.navs, [["clients/leads:s-S", "replace"]], "the page's own close is the page's to say");
  });

  test(`a lead opened on the rows still pushes its address, however ${name}`, () => {
    fresh();
    const page = leadsAt(`clients/leads:s-${SEARCH}`, { strict });
    page.open(UA);
    assert.deepEqual(page.navs, [[`clients/leads:s-S:p-${UA}`, "push"]]);
    assert.equal(page.peek, UA);
  });

  test(`a link with a chip narrows the table and leaves the address as it said, however ${name}`, () => {
    fresh();
    const route = `clients/leads:s-${SEARCH}:f-strong`;
    const page = leadsAt(route, { strict });
    assert.deepEqual(page.chips, { fit: "strong" }, "the table takes the address's chip");
    assert.deepEqual(page.navs, [], "and nothing is written back over the address");
    assert.equal(page.route, route);
  });

  test(`a link to a lead keeps every chip it names, however ${name}`, () => {
    fresh();
    const route = `clients/leads:s-${SEARCH}:f-strong:r-email:r-phone:p-${UB}`;
    const page = leadsAt(route, { strict });
    assert.deepEqual(page.chips, { fit: "strong", reach: ["email", "phone"] });
    assert.equal(page.peek, UB);
    assert.deepEqual(page.navs, []);
    assert.equal(page.route, route);
  });

  test(`a chip picked after a link still writes the address in place, however ${name}`, () => {
    fresh();
    const page = leadsAt(`clients/leads:s-${SEARCH}:f-strong`, { strict });
    page.fit("look");
    assert.deepEqual(page.navs, [["clients/leads:s-S:f-look", "replace"]], "the page moved, so it says so");
    page.fit(null);
    assert.deepEqual(page.navs.at(-1), ["clients/leads:s-S", "replace"]);
    assert.deepEqual(page.chips, {});
  });

  test(`a chip taken off after a link goes back to the table it found, however ${name}`, () => {
    fresh();
    const page = leadsAt(`clients/leads:s-${SEARCH}:f-strong`, { strict });
    page.fit(null);
    assert.deepEqual(page.navs, [["clients/leads:s-S", "replace"]], "the table as the address found it is not held");
    assert.deepEqual(page.chips, {});
  });

  test(`an address that moved gives the table its chips and says nothing back, however ${name}`, () => {
    fresh();
    const page = leadsAt(`clients/leads:s-${SEARCH}:f-strong`, { strict });
    page.go(`clients/leads:s-${SEARCH}:f-look`);
    assert.deepEqual(page.chips, { fit: "look" });
    assert.deepEqual(page.navs, []);
  });

  test(`a lead opened under a chip keeps the chip in its address, however ${name}`, () => {
    fresh();
    const page = leadsAt(`clients/leads:s-${SEARCH}:f-strong`, { strict });
    page.open(UA);
    assert.deepEqual(page.navs, [[`clients/leads:s-S:f-strong:p-${UA}`, "push"]]);
    assert.deepEqual(page.chips, { fit: "strong" });
  });
}
