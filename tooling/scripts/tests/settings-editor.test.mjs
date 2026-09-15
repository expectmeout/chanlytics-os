/**
 * The business editor says what is wrong where it is wrong, and asks before it throws your changes away.
 *
 * The wiring audit's S22 and the interface audit's "no unsaved-changes guard, Cancel discards silently; every
 * validation message is a toast even where a per-field map exists":
 * - Each check stopped the save at the first problem and said it in a toast that closes -- the website, a half-written
 *   note, the calendar feed, the name, the number, the booking link -- and an out-of-range booking rule was dropped
 *   without a word.
 * - Cancel dropped every edit silently; so did choosing another Settings tab, and so did closing the browser tab.
 * Run against settings.jsx on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, whyNotAHandoff, whyNotAPhone, samePhone, handoffE164, formatPhoneDisplay } from "@chanlytics/contracts";

const TID = "t-studio";

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: { appendChild() {} }, activeElement: null, addEventListener() {}, removeEventListener() {}, getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: { pathname: "/w/studio", hash: "#/admin/workspace", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  history: { replaceState() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: TID,
};

/* ------------------------------ a stub React ------------------------------ */

// Hooks are kept per component, by the component's place in the tree and its type (see settings-honest.test.mjs).
let cells = new Map();
let frames = [];
const slot = () => { const f = frames[frames.length - 1]; return `${f.key}#${f.hook++}`; };
const toasts = [];
const saved = [];
globalThis.Icon = "Icon";
globalThis.StatStrip = "StatStrip";
globalThis.StatCell = "StatCell";
globalThis.Sparkline = "Sparkline";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") {
      const parent = frames[frames.length - 1];
      const name = type.name || "anon";
      parent.kids[name] = (parent.kids[name] || 0) + 1;
      frames.push({ key: `${parent.key}/${name}:${parent.kids[name]}`, hook: 0, kids: {} });
      try { node.rendered = type(props); } finally { frames.pop(); }
    }
    return node;
  },
  useState: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, typeof init === "function" ? init() : init);
    return [cells.get(k), (v) => { cells.set(k, typeof v === "function" ? v(cells.get(k)) : v); }];
  },
  useReducer: (red, init) => { const k = slot(); if (!cells.has(k)) cells.set(k, init); return [cells.get(k), (a) => { cells.set(k, red(cells.get(k), a)); }]; },
  useRef: (init) => { const k = slot(); if (!cells.has(k)) cells.set(k, { current: init }); return cells.get(k); },
  useMemo: (fn) => { slot(); return fn(); },
  useCallback: (fn) => { slot(); return fn; },
  useId: () => `id-${slot()}`,
  useEffect: (fn, deps) => {
    const k = slot();
    const prev = cells.get(k);
    if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, i) => Object.is(d, prev.deps[i]))) return;
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
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["EmptyState", "FailedRead", "MoreMenu", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  __chrome: { state: stateOf },
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner can ${doing}.`,
  canDo: () => true,
  __whyNotAHandoff: whyNotAHandoff,
  __whyNotAPhone: whyNotAPhone,
  __samePhone: samePhone,
  __handoffE164: handoffE164,
  __phoneDisplay: formatPhoneDisplay,
  __identity: {
    member: ({ email, display_name }) => ({ name: display_name || email, sub: display_name ? email : null }),
    initials: (name, email) => String(name || email).slice(0, 2).toUpperCase(),
    words: (me) => ({ name: me.display_name || me.email, email: me.email }),
  },
  __inviteState: () => ({ expired: false, words: "invite pending" }),
  __saveSettings: (config, version, accepted) => { saved.push({ config, version }); accepted(); return Promise.resolve({ ok: true }); },
  __receptionistDefaults: () => ({ system_prompt: "You answer for Northside Studio.", fallbacks: { greeting: "Hello", error: "Sorry", non_text: "Text, please" } }),
  __ME: { email: "dana@northside.example", role: "owner", display_name: "Dana" },
  __SETTINGS: {
    role: "owner", version: 5,
    config: {
      brain: {
        business_name: "Northside Studio", booking_link: "https://book.example/northside", system_prompt: "You answer for Northside Studio.",
        profile: { website: "https://northside.example", notes: [{ title: "Parking", text: "Behind the building." }], booking_rules: { lead_hours: 2 } },
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
  __TEAM: [], __TEAM_INVITES: [],
});
await import("../../../apps/dashboard/src/legacy/pages/settings.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};
const all = (tree, pred) => { const out = []; const seen = new Set(); walk(tree, (n) => { if (!seen.has(n) && pred(n)) { seen.add(n); out.push(n); } }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const classed = (tree, cls) => find(tree, (n) => String(n.props?.className || "").split(" ").includes(cls));
const buttonSaying = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const labelled = (tree, tag, label) => find(tree, (n) => n.type === tag && n.props["aria-label"] === label);
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const type = (node, value) => node.props.onChange({ target: { value } });
const fresh = () => {
  cells = new Map(); toasts.length = 0; saved.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  // A pane the stub never unmounts leaves its registration behind; React's cleanup would clear it.
  delete globalThis.window.__settingsUnsaved;
};
const draw = (tab, went = []) => { frames = [{ key: "root", hook: 0, kids: {} }]; return globalThis.window.SettingsPage({ tab, onTab: (id) => went.push(id) }); };
const again = draw;
const openEditor = (went = []) => { fresh(); press(buttonSaying(draw("workspace", went), "Edit")); return again("workspace", went); };
const saveButton = (tree) => buttonSaying(classed(tree, "set-editor-foot"), "Save");
const railRow = (tree, label) => find(tree, (n) => n.type === "button" && String(n.props.className || "").includes("set-nav-row") && textOf(n).trim() === label);

/* ------------------------------ what is wrong, where ------------------------------ */

test("REGRESSION (S22): a refused website says so under the website box -- only a toast said it, and the toast closes", () => {
  let tree = openEditor();
  type(labelled(tree, "input", "Website"), "not a website");
  tree = again("workspace");
  press(saveButton(tree));
  tree = again("workspace");
  const problem = byTestId(tree, "biz-website-problem");
  assert.ok(problem, "REGRESSION: nothing was said where the problem is");
  assert.match(textOf(problem), /full web address, starting with https:\/\//);
  const box = labelled(tree, "input", "Website");
  assert.equal(box.props["aria-invalid"], true, "the box says it is the one");
  assert.equal(box.props["aria-describedby"], "biz-website-problem", "and names the sentence under it");
  assert.equal(toasts.at(-1)?.tone, "warn");
  assert.equal(textOf(toasts.at(-1)?.msg), "Not saved — 1 field needs a look.", "the toast only counts");
  assert.equal(saved.length, 0, "nothing is sent");
  type(labelled(tree, "input", "Website"), "https://northside.example/new");
  tree = again("workspace");
  assert.equal(byTestId(tree, "biz-website-problem"), null, "and the sentence goes when the box changes");
});

test("REGRESSION (S22): every check is said at once, each under its own box -- the save stopped at the first and said that one", () => {
  let tree = openEditor();
  type(labelled(tree, "input", "Business name"), "");
  tree = again("workspace");
  type(labelled(tree, "input", "Website"), "northside");
  tree = again("workspace");
  type(labelled(tree, "input", "Calendar feed address"), "calendar");
  tree = again("workspace");
  type(labelled(tree, "textarea", "Note text"), "");
  tree = again("workspace");
  press(saveButton(tree));
  tree = again("workspace");
  for (const id of ["biz-name-problem", "biz-website-problem", "biz-feed-problem", "biz-note-0-problem"]) {
    assert.ok(byTestId(tree, id), `REGRESSION: ${id} was not said`);
  }
  assert.match(textOf(byTestId(tree, "biz-name-problem")), /The receptionist needs a business name before it can answer anyone\./);
  assert.match(textOf(byTestId(tree, "biz-note-0-problem")), /both a title and the text/);
  assert.match(textOf(byTestId(tree, "biz-feed-problem")), /https:\/\/ or webcal:\/\//);
  assert.equal(textOf(toasts.at(-1)?.msg), "Not saved — 4 fields need a look.");
  assert.equal(saved.length, 0);
});

test("REGRESSION (S22): an out-of-range booking rule is said, not dropped -- 500 hours of notice vanished on Save without a word", () => {
  let tree = openEditor();
  type(labelled(tree, "input", "Least notice in hours"), "500");
  tree = again("workspace");
  type(labelled(tree, "input", "Slot length in minutes"), "5");
  tree = again("workspace");
  press(saveButton(tree));
  tree = again("workspace");
  assert.match(textOf(byTestId(tree, "biz-lead-problem")), /0 to 168 hours/, "REGRESSION: the rule was dropped silently");
  assert.match(textOf(byTestId(tree, "biz-slot-problem")), /15 to 240 minutes/);
  assert.equal(labelled(tree, "input", "Least notice in hours").props["aria-invalid"], true);
  assert.equal(saved.length, 0, "REGRESSION: saved, with the rule left out");
});

/* ------------------------------ before your changes go ------------------------------ */

test("REGRESSION (S22): Cancel with unsaved changes asks first -- it threw them away without a word", () => {
  let tree = openEditor();
  type(labelled(tree, "input", "Website"), "https://northside.example/new");
  tree = again("workspace");
  press(buttonSaying(classed(tree, "set-editor-foot"), "Cancel"));
  tree = again("workspace");
  assert.ok(byTestId(tree, "biz-cancel-confirm"), "REGRESSION: no question before discarding");
  assert.ok(labelled(tree, "input", "Website"), "and the editor is still open");
  press(byTestId(tree, "biz-cancel-no"));
  tree = again("workspace");
  assert.equal(byTestId(tree, "biz-cancel-confirm"), null);
  assert.equal(labelled(tree, "input", "Website").props.value, "https://northside.example/new", "keeping on editing keeps the edit");
  press(buttonSaying(classed(tree, "set-editor-foot"), "Cancel"));
  tree = again("workspace");
  press(byTestId(tree, "biz-cancel-yes"));
  tree = again("workspace");
  assert.equal(labelled(tree, "input", "Website"), null, "Yes, discard closes the editor");
  assert.equal(saved.length, 0);

  // Nothing changed: Cancel simply closes.
  tree = openEditor();
  press(buttonSaying(classed(tree, "set-editor-foot"), "Cancel"));
  tree = again("workspace");
  assert.equal(byTestId(tree, "biz-cancel-confirm"), null, "nothing to lose, nothing to ask");
  assert.equal(labelled(tree, "input", "Website"), null);
});

test("REGRESSION (S22): another Settings tab with unsaved changes asks first -- the pane was replaced, and the changes with it", () => {
  const went = [];
  let tree = openEditor(went);
  type(labelled(tree, "input", "Website"), "https://northside.example/new");
  tree = again("workspace", went);
  press(railRow(tree, "Team"));
  tree = again("workspace", went);
  assert.deepEqual(went, [], "REGRESSION: the tab changed under the edit");
  assert.ok(byTestId(tree, "set-leave-confirm"), "it asks");
  press(byTestId(tree, "set-leave-no"));
  tree = again("workspace", went);
  assert.equal(byTestId(tree, "set-leave-confirm"), null);
  assert.ok(labelled(tree, "input", "Website"), "staying keeps the editor");
  press(railRow(tree, "Team"));
  tree = again("workspace", went);
  press(byTestId(tree, "set-leave-yes"));
  assert.deepEqual(went, ["team"], "and leaving leaves");

  const went2 = [];
  tree = openEditor(went2);
  press(railRow(tree, "Team"));
  assert.deepEqual(went2, ["team"], "with nothing changed, a tab is just a tab");
});

test("REGRESSION (S22): leaving the page with unsaved changes asks the browser to ask -- a reload lost them silently", () => {
  let tree = openEditor();
  assert.equal(listeners.beforeunload?.size ?? 0, 0, "nothing changed: nothing to hold on to");
  type(labelled(tree, "input", "Website"), "https://northside.example/new");
  tree = again("workspace");
  assert.equal(listeners.beforeunload?.size ?? 0, 1, "REGRESSION: a reload dropped the edit without a word");
  const ev = { returnValue: undefined, prevented: false, preventDefault() { this.prevented = true; } };
  for (const fn of listeners.beforeunload) fn(ev);
  assert.ok(ev.prevented, "the browser is asked to confirm");
  assert.equal(ev.returnValue, "");
  assert.ok(tree, "the tree is still drawn");
});
