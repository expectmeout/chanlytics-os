/**
 * The Settings rail, and the pane that is the business record.
 *
 * Task 3.7 replaced BusinessEditor with the Business page (surfaces/settings/business/tab.tsx), so what this file used to prove
 * about a form is proved where those fields now live, by drawing them:
 *   every check said under its own field, and the toast only counting them  business-tab-page.test.mjs,
 *                                                                           business-tab-open/-offer/-answers.test.mjs;
 *   Cancel asking before it throws anything typed away                      business-tab-open.test.mjs;
 *   the instructions box (S4) and the three messages (S5)                   business-tab-answers.test.mjs;
 *   the three things a new workspace is asked for                           business-tab-create.test.mjs.
 *
 * What is left here is the Settings page's own (surfaces/settings/frame/page.tsx), and it is what the swap turned on: the rail's one question before it
 * replaces a pane, the browser's before it unloads one, and which of the three cards the pane draws. Both questions
 * are the record kit's fold registry alone now -- the editor used to chain its own answer onto
 * window.__settingsUnsaved and put back what it found -- so a fold holding changes is the only thing either can be
 * holding on to.
 *
 * Run against the page on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, formatPhoneDisplay } from "@chanlytics/contracts";
import { kitPages, useStubHooks } from "../../_legacy-react.mjs";

const TID = "t-studio";

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: { appendChild() {} },
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/admin/workspace",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: TID,
};

/* ------------------------------ a stub React ------------------------------ */

// Hooks are kept per component, by the component's place in the tree and its type (see settings-honest.test.mjs).
let cells = new Map();
let frames = [];
const slot = () => {
  const f = frames[frames.length - 1];
  return `${f.key}#${f.hook++}`;
};
const toasts = [];
const saved = [];
globalThis.Icon = "Icon";
globalThis.StatStrip = "StatStrip";
globalThis.StatCell = "StatCell";
globalThis.Sparkline = "Sparkline";
const MARKED = {};
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    // The Business page and the create card are drawn for real in business-tab-page.test.mjs and business-tab-create.test.mjs:
    // here they are the marks the pane's choice is read by (the page imports them, so the stub stands in for them as drawn).
    if (typeof type === "function" && MARKED[type.name]) type = MARKED[type.name];
    const node = { type, props };
    if (typeof type === "function") {
      const parent = frames[frames.length - 1];
      const name = type.name || "anon";
      parent.kids[name] = (parent.kids[name] || 0) + 1;
      frames.push({ key: `${parent.key}/${name}:${parent.kids[name]}`, hook: 0, kids: {} });
      try {
        node.rendered = type(props);
      } finally {
        frames.pop();
      }
    }
    return node;
  },
  useState: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, typeof init === "function" ? init() : init);
    return [
      cells.get(k),
      (v) => {
        cells.set(k, typeof v === "function" ? v(cells.get(k)) : v);
      },
    ];
  },
  useReducer: (red, init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, init);
    return [
      cells.get(k),
      (a) => {
        cells.set(k, red(cells.get(k), a));
      },
    ];
  },
  useRef: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, { current: init });
    return cells.get(k);
  },
  useMemo: (fn) => {
    slot();
    return fn();
  },
  useCallback: (fn) => {
    slot();
    return fn;
  },
  useId: () => `id-${slot()}`,
  // A store's value as it stands: the stub draws once and is drawn again by hand, so nothing needs to listen.
  useSyncExternalStore: (_subscribe, get) => {
    slot();
    return get();
  },
  useEffect: (fn, deps) => {
    const k = slot();
    const prev = cells.get(k);
    if (
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, i) => Object.is(d, prev.deps[i]))
    )
      return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    const cell = { deps, cleanup: undefined };
    cells.set(k, cell);
    cell.cleanup = fn();
  },
  Children: { map: (kids, fn) => (kids == null ? kids : [].concat(kids).flat(Infinity).map(fn)) },
  isValidElement: (n) => !!n && typeof n === "object" && "type" in n && "props" in n,
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
};
globalThis.ReactDOM = { createPortal: (node) => node };
(await import("../../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
// The record kit's folds answer the rail's question too, and the kit is published before any page, as it is in the app.
Object.assign(globalThis.window, kitPages);
useStubHooks();
const kitUnsaved = globalThis.window.__settingsUnsaved;
for (const k of ["EmptyState", "FailedRead", "MoreMenu", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  __chrome: { state: stateOf },
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner can ${doing}.`,
  canDo: () => true,
  __identity: {
    member: ({ email, display_name }) => ({ name: display_name || email, sub: display_name ? email : null }),
    initials: (name, email) =>
      String(name || email)
        .slice(0, 2)
        .toUpperCase(),
    words: (me) => ({ name: me.display_name || me.email, email: me.email }),
  },
  __inviteState: () => ({ expired: false, words: "invite pending" }),
  __saveSettings: (config, version, accepted) => {
    saved.push({ config, version });
    accepted();
    return Promise.resolve({ ok: true });
  },
  __ME: { email: "dana@northside.example", role: "owner", display_name: "Dana" },
  __SETTINGS: {
    role: "owner",
    version: 5,
    config: {
      brain: {
        business_name: "Northside Studio",
        booking_link: "https://book.example/northside",
        system_prompt: "You answer for Northside Studio.",
        profile: {
          website: "https://northside.example",
          notes: [{ title: "Parking", text: "Behind the building." }],
          booking_rules: { lead_hours: 2 },
        },
      },
    },
  },
  __FACTS: {
    facts: {
      business_name: { value: "Northside Studio", source: "typed" },
      voice_line: { value: "+13055550124", source: "provisioned" },
      phone_display: { value: formatPhoneDisplay("+13055550124"), source: "provisioned" },
      handoff_number: { value: null, source: "absent" },
      address: { value: null, source: "absent" },
    },
    conflicts: [],
  },
  __TEAM: [],
  __TEAM_INVITES: [],
});
await import("./_business-parts.mjs");
// The page and its tabs are the TSX module (decision 0015 step 11), imported as the app imports it.
const { SettingsPage } = await import("../../../../../apps/dashboard/src/surfaces/settings/frame/page.tsx");
const { SET_TABS } = await import("../../../../../apps/dashboard/src/surfaces/settings/frame/tabs.ts");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const all = (tree, pred) => {
  const out = [];
  const seen = new Set();
  walk(tree, (n) => {
    if (!seen.has(n) && pred(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
};
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const buttonSaying = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const fresh = () => {
  cells = new Map();
  toasts.length = 0;
  saved.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  // A pane the stub never unmounts leaves its answer chained onto the rail's question; React's cleanup would put back
  // what it found there, which is the record kit's. And no fold is open.
  globalThis.window.__settingsUnsaved = kitUnsaved;
  globalThis.window.__recordFolds.reset();
};
const draw = (tab, went = []) => {
  frames = [{ key: "root", hook: 0, kids: {} }];
  return SettingsPage({ tab, onTab: (id) => went.push(id) });
};
const again = draw;
const railRow = (tree, label) =>
  find(
    tree,
    (n) => n.type === "button" && String(n.props.className || "").includes("set-nav-row") && textOf(n).trim() === label,
  );

/* ------------------------------ the sections on a phone ------------------------------ */

const classesOf = (n) => String(n.props?.className || "").split(" ");
/** Draw at a phone's width (the frame's phone head, 900px and under) or a desk's, as matchMedia answers. */
const atPhone = (phone, fn) => {
  const was = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (q) => ({
    matches: phone && /max-width:\s*900px/.test(q),
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    return fn();
  } finally {
    globalThis.window.matchMedia = was;
  }
};
test("a section's pane is a view that says which side it arrives from, and keeps saying it while it stays open", () => {
  // The deck every change of view moves by brings it in from there (surfaces/kit/motion/view-deck.ts); it was a class
  // of the page's own that a phone's stylesheet slid.
  const pane = (tree) => find(tree, (n) => classesOf(n).includes("set-pane"));
  assert.equal(pane(draw("workspace")).props["data-slide"], undefined, "the first section drawn arrives with the page");
  assert.equal(pane(draw("team")).props["data-slide"], "next", "Team after Business: from the right");
  assert.equal(pane(draw("team")).props["data-slide"], "next", "drawn again, still");
  assert.equal(pane(draw("profile")).props["data-slide"], "prev", "Profile after Team: from the left");
});

// Ruben, 17 Oct 2026 (the "Settings, split" canvas): on a phone Settings opens on its sections as a list, grouped as the
// rail groups them, and a section opens as a page of its own whose way back is the list. Before it they were every
// page's strip (25 Sep), nine tabs that ran off the screen, whose way back opened Business again.
test("on a phone the bare address is the list of sections: their words in order, each a link to its section, a press goes there", () => {
  const went = [];
  const tree = atPhone(true, () => draw("", went));
  const list = find(tree, (n) => n.props?.["data-testid"] === "set-list");
  assert.ok(list, "the list");
  assert.equal(
    find(tree, (n) => classesOf(n).includes("set-pane")),
    null,
    "and no pane beside it",
  );
  const rows = all(list, (n) => classesOf(n).includes("set-list-row"));
  const listed = SET_TABS.filter((t) => !t.partners);
  assert.deepEqual(
    rows.map((r) => textOf(find(r, (n) => classesOf(n).includes("set-list-name"))).trim()),
    listed.map((t) => t.label),
    "every section a person who is not a partner is offered, in the rail's order",
  );
  assert.deepEqual(
    all(list, (n) => classesOf(n).includes("set-list-head")).map((h) => textOf(h).trim()),
    ["You", "Business", "Receptionist", "Workspace"],
    "under the rail's groups",
  );
  assert.ok(
    rows.every((r, i) => r.type === "a" && String(r.props.href).endsWith(`/${listed[i].id}`)),
    "a section has an address, so its row is a link to it",
  );
  let stopped = 0;
  rows.find((r) => textOf(r).includes("Team")).props.onClick({ button: 0, preventDefault: () => stopped++ });
  assert.deepEqual(went, ["team"]);
  assert.equal(stopped, 1, "the app's own move, not the link's");
  // A section's own address draws its pane on a phone, and the bare address on a desk is Details beside the rail.
  assert.ok(
    find(
      atPhone(true, () => draw("team")),
      (n) => classesOf(n).includes("set-pane"),
    ),
    "a section is a page",
  );
  const desk = atPhone(false, () => draw(""));
  assert.equal(
    find(desk, (n) => n.props?.["data-testid"] === "set-list"),
    null,
    "a desk has no list",
  );
  assert.deepEqual(
    all(
      desk,
      (n) => n.type === "button" && classesOf(n).includes("set-nav-row") && classesOf(n).includes("active"),
    ).map((n) => textOf(n).trim()),
    ["Details"],
  );
});

/* ------------------------------ which card the pane draws ------------------------------ */

// The page and the create card as PaneWorkspace reaches them: it imports both, so the stub's createElement draws a mark
// where either is written (MARKED, above). Drawn for real in business-tab-page.test.mjs and business-tab-create.test.mjs.
const marker = (id) => () => globalThis.React.createElement("div", { "data-testid": id });
MARKED.BusinessTab = marker("the-business-page");
MARKED.BtCreateCard = marker("the-create-card");
// The other panes are each proved where they live; here the page is read by its rail and by which card Business draws.
for (const pane of [
  "PaneProfile",
  "PanePartner",
  "PaneTeam",
  "PaneAutonomyReal",
  "PaneIntegrationsReal",
  "PaneNotificationsReal",
  "PaneBillingReal",
  "PanePlatform",
  "PaneActivity",
])
  MARKED[pane] = marker(`the-${pane}`);

test("the pane is the record, the card that sets one up, or the broken one -- and never a form", () => {
  const was = globalThis.window.__SETTINGS;
  try {
    // A workspace whose config holds a brain: the page, what the receptionist is told, and the owner's copy of it all.
    fresh();
    let tree = draw("workspace");
    assert.ok(byTestId(tree, "the-business-page"), "the record is the pane");
    // The owner's copy of it all is Billing's since 17 Oct 2026, under the plan: the account's own page.
    assert.equal(byTestId(tree, "set-data"), null, "and the owner's copy of the records is not on it");
    assert.ok(byTestId(draw("billing"), "set-data"), "it is Billing's");
    assert.equal(buttonSaying(tree, "Edit"), null, "and no button that opens a second editor of the same config");

    // No brain at all: the empty state and the fold that sets a receptionist up, never the record, never the demo.
    fresh();
    globalThis.window.__SETTINGS = { ...was, config: {} };
    tree = draw("workspace");
    assert.ok(byTestId(tree, "the-create-card"));
    assert.equal(byTestId(tree, "the-business-page"), null, "a page with nothing to draw is not drawn");
    assert.equal(
      textOf(tree).includes("Serenity Spa"),
      false,
      "REGRESSION: an empty workspace was shown an invented business",
    );

    // A config the parser refused is a third thing: it says so, and asks for the repair.
    fresh();
    globalThis.window.__SETTINGS = { ...was, broken: { issues: ["brain.booking_link: Invalid url"] } };
    tree = draw("workspace");
    assert.ok(byTestId(tree, "settings-broken"));
    assert.equal(byTestId(tree, "the-business-page"), null);
    assert.equal(
      byTestId(tree, "the-create-card"),
      null,
      "and no form whose save would replace the broken row with its few fields",
    );
  } finally {
    globalThis.window.__SETTINGS = was;
  }
});

/* ------------------------------ before anything typed is thrown away ------------------------------ */

test("REGRESSION (S22): another Settings tab with unsaved changes asks first -- the pane was replaced, and the changes with it", () => {
  const folds = globalThis.window.__recordFolds;
  // Press Team on the rail of a tree drawn with `went`; say whether the rail asked first, and where it went.
  const pressTeam = (tree, went) => {
    press(railRow(tree, "Team"));
    return { asked: !!byTestId(again("workspace", went), "set-leave-confirm"), went: [...went] };
  };

  fresh();
  let went = [];
  folds.request("hours", { dirty: () => true });
  let tree = draw("workspace", went);
  assert.deepEqual(pressTeam(tree, went), { asked: true, went: [] }, "REGRESSION: the tab changed under the edit");
  // Staying keeps the pane, and the fold with it.
  press(byTestId(again("workspace", went), "set-leave-no"));
  tree = again("workspace", went);
  assert.equal(byTestId(tree, "set-leave-confirm"), null);
  assert.equal(folds.open(), "hours", "staying keeps what was open");
  press(railRow(tree, "Team"));
  tree = again("workspace", went);
  press(byTestId(tree, "set-leave-yes"));
  assert.deepEqual(went, ["team"], "and leaving leaves");

  // Nothing holding changes: a tab is just a tab.
  fresh();
  went = [];
  folds.request("hours", { dirty: () => false });
  assert.deepEqual(pressTeam(draw("workspace", went), went), { asked: false, went: ["team"] });

  // And a fold whose save is OUT is asked about too, in words that are true of a change already on its way.
  fresh();
  went = [];
  // A fold binds its dirty test and its "my save is out" test for as long as its hook is on the page (bind).
  folds.bind(
    "hours",
    () => false,
    () => true,
  );
  folds.request("hours");
  tree = draw("workspace", went);
  press(railRow(tree, "Team"));
  tree = again("workspace", went);
  assert.match(textOf(byTestId(tree, "set-leave-confirm")), /Leave while this saves/);
  assert.deepEqual(went, []);
});

test("REGRESSION (S22): leaving the page with unsaved changes asks the browser to ask -- a reload lost them silently", () => {
  fresh();
  draw("workspace");
  assert.equal(listeners.beforeunload?.size ?? 0, 0, "nothing open: nothing to hold on to");
  globalThis.window.__recordFolds.request("hours", { dirty: () => true });
  assert.equal(listeners.beforeunload?.size ?? 0, 1, "REGRESSION: a reload dropped the edit without a word");
  const ev = {
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  for (const fn of listeners.beforeunload) fn(ev);
  assert.ok(ev.prevented, "the browser is asked to confirm");
  assert.equal(ev.returnValue, "");
});

test("the rail and the browser ask the record kit, and nothing else answers for the pane", () => {
  // BusinessEditor chained its own answer onto window.__settingsUnsaved while it was open and put back what it
  // found when it went. With the form gone the kit's registry is the one answer, set once as the kit loads.
  fresh();
  draw("workspace");
  assert.equal(globalThis.window.__settingsUnsaved, kitUnsaved, "the pane leaves the question where it found it");
  assert.equal(globalThis.window.__settingsUnsaved(), false);
  globalThis.window.__recordFolds.request("services", { dirty: () => true });
  assert.equal(globalThis.window.__settingsUnsaved(), true);
  assert.equal(globalThis.window.__settingsSaving(), false, "and says it is changes, not a save on its way");
});
