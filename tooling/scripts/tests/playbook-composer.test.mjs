/**
 * The playbook composer: a new playbook and one being changed, in a sheet beside the page.
 *
 * - Every slot could take any of the six sources, so a starter's first name could be filled with the booking link
 *   and a run greeted everyone "Hi your booking link"; a slot takes only what keeps its message true now
 *   (contracts slotChoices), and a playbook stored the old way is put right the next time it is changed.
 * - A visit's reminder was offered to a win-back, which can fill neither its time nor its service.
 * - It opened on whichever template sorted first when the moment's own was not approved; it opens on the moment's
 *   own, or on nothing, and says what to do.
 * - It was a panel over the grid: opening it pushed the cards down and took the unset moments away.
 * Run against the page on a stub React, over the view models and the starter library the bridge publishes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const TID = "t-studio";
const ZONE = "America/New_York";
const NOW = Date.now();

/** A starter as WhatsApp holds it once approved: the library's words and slots. */
const starterRow = (key, over = {}) => {
  const s = contracts.starterByKey(key);
  const t = contracts.starterText(s, over.language || "en_US");
  return {
    id: `tpl-${key}`, channel: "whatsapp", name: s.name, language: "en_US", meta_status: "approved", category: s.category,
    purpose: s.category === "utility" ? "conversational" : "marketing", source: "starter", title: null, body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })), ...over,
  };
};
/** A message written elsewhere: its slots known only by their labels. */
const ownRow = (over = {}) => ({
  id: "tpl-own", channel: "whatsapp", name: "autumn_offer", language: "en_US", meta_status: "approved", category: "marketing", purpose: "marketing",
  source: "meta", title: "Autumn offer", body_preview: "Hi {{1}}, {{2}} this autumn.", variables: [{ position: 1, label: "Name", example: "Dani" }, { position: 2, label: "Value 2", example: "20% off" }], ...over,
});
const trig = (id, over = {}) => {
  const t = contracts.triggerOf(id);
  return { id, label: t.label, hint: t.hint, cls: t.cls, list: t.list, kind: t.kind, candidates: 12, held: 2, named: { pool: 40, noYes: 20, stopped: 4, noNumber: 2 }, ...over };
};
const playbook = (over = {}) => ({
  id: "pb-1", name: "Win-back", trigger: "quiet_30", template_id: "tpl-winback_offer", template_name: "winback_offer", template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }], policy_class: "reengage", state: "running", run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30,
  last_run_for: null, last_run_at: null, created_at: new Date(NOW - 30 * 86_400_000).toISOString(),
  triggerLabel: "Win-back", triggerHint: "Nothing heard in 30 days", schedule: "daily at 10:00", next: "tomorrow 10:00", candidates: 12, held: 2,
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
const surface = (over = {}) => ({
  rows: [], templates: [starterRow("winback_offer"), starterRow("monthly_offer"), starterRow("visit_reminder"), ownRow()],
  triggers: contracts.PLAYBOOK_TRIGGERS.map((t) => trig(t.id)),
  timezone: ZONE, calendar: "ok", number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio", bookingLink: true, fetchedAt: NOW, ...over,
});

/* ---------------------------------- the window ---------------------------------- */

const listeners = {};
const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {}, activeElement: null, addEventListener() {}, removeEventListener() {}, getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: { pathname: "/w/studio", hash: "#/outbound", origin: "https://app.chanlytics.com", assign() {}, replace() {}, reload() {} },
  history: { replaceState() {} },
  innerHeight: 800,
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); },
  removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
  dispatchEvent: (ev) => { for (const fn of [...(listeners[ev.type] || [])]) fn(ev); return true; },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  setInterval: () => 1,
  clearInterval() {},
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
};
const { installClock } = await import("../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();
const { installTemplates } = await import("../../../apps/dashboard/src/legacy-bridge/templates.ts");
installTemplates();
const { installPlaybooks } = await import("../../../apps/dashboard/src/legacy-bridge/playbooks.ts");
installPlaybooks();

let cells = [];
let seq = 0;
const went = [];
const toasts = [];
const said = [];
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: (fn, deps) => {
    const k = seq++;
    const prev = cells[k];
    if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, i) => Object.is(d, prev.deps[i]))) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: undefined };
    cells[k].cleanup = fn();
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["EmptyState", "FailedRead", "StatePill", "PolicyChip", "Confirm"]) globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to) => went.push(to),
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __DEMO_MODE: false,
});
await import("../../../apps/dashboard/src/legacy/components/record-sheet.jsx");
await import("../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../apps/dashboard/src/legacy/components/campaign-bits.jsx");
await import("../../../apps/dashboard/src/legacy/pages/outbound-real.jsx");
// The verbs, as the bridge publishes them: what the composer sends is what the route would be sent.
globalThis.window.__playbooks = {
  ...globalThis.window.__playbooks,
  create: async (body) => { said.push(["create", body]); return { ok: true, data: { id: "pb-new", name: body.name || "Win-back" } }; },
  update: async (id, body) => { said.push(["update", id, body]); return { ok: true, data: { id, name: body.name || "Win-back" } }; },
};

// What is drawn: a component's own drawing when it has one (the sheet draws the children it is given, and its title
// and foot, where it puts them), else the children -- walking both counted everything inside the sheet twice.
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) { for (const k of n) walk(k, fn); return; }
  fn(n);
  if (n.rendered !== undefined) walk(n.rendered, fn);
  else walk(n.props?.children, fn);
};
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const allByTestId = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const fresh = () => { cells = []; seq = 0; went.length = 0; said.length = 0; toasts.length = 0; for (const k of Object.keys(listeners)) delete listeners[k]; };
const page = () => { seq = 0; return globalThis.window.OutboundPage({}); };
/** The page, then the composer opened the way a person opens it: a moment's Set it up, or New playbook. */
const composing = (over = {}, moment = null) => {
  globalThis.window.__PLAYBOOKS = surface(over);
  fresh();
  const tree = page();
  if (moment) press(find(find(tree, (n) => n.props?.["data-testid"] === "pb-slot" && n.props["data-trigger"] === moment), (n) => n.props?.["data-testid"] === "pb-slot-start"));
  else globalThis.window.dispatchEvent({ type: "playbooks:new" });
  return page();
};
/** Each slot as the composer lists it: what fills it, and what else it offers (nothing, when it has no choice). */
const fillsOf = (tree) => allByTestId(tree, "pb-fill").map((f) => {
  const sel = find(f, (n) => n.props?.["data-testid"] === "pb-fill-source");
  return { kind: f.props["data-kind"], offers: sel ? all(sel, (n) => n.type === "option").map((o) => o.props.value) : [] };
});
const type = (tree, i, words) => allByTestId(tree, "pb-fill-input")[i].props.onChange({ target: { value: words } });
/** Picks from one of the composer's lists (the moment's, the message's): opens it, and presses the option. */
const pick = (testid, id) => {
  press(byTestId(page(), testid));
  const opt = find(page(), (n) => n.props?.["data-testid"] === `${testid}-option` && (n.props["data-lang"] === id));
  assert.ok(opt, `${testid} offers ${id}`);
  press(opt);
  return page();
};

/* ---------------------------------- the slots ---------------------------------- */

test("REGRESSION: a starter's first name is each person's own and offers nothing else -- a run greeted everyone 'Hi your booking link'", () => {
  const tree = composing({}, "quiet_30");
  assert.deepEqual(fillsOf(tree), [
    { kind: "first_name", offers: [] },
    { kind: "business_name", offers: ["business_name", "text"] },
    { kind: "booking_link", offers: ["booking_link", "text"] },
  ], "a first name has no choice; the business name and the link may be typed over, and nothing else");
  assert.ok(textOf(allByTestId(tree, "pb-fill")[0]).includes("“there” when none is on file"), "and it says what a person with no name on file reads");
  assert.equal(allByTestId(tree, "pb-fill-input").length, 0, "nothing to type on a starter that knows every slot");
  assert.equal(byTestId(tree, "pb-save").props.disabled, false);
});

test("a slot on a message written elsewhere may take anything, its guess first; a link the workspace lacks is typed", () => {
  // Only the message written elsewhere is approved, so the composer opens on nothing and it is picked.
  let tree = composing({ templates: [ownRow()], bookingLink: false }, "quiet_30");
  tree = pick("pb-template", "autumn_offer");
  assert.deepEqual(fillsOf(tree), [
    { kind: "first_name", offers: ["first_name", "text", "business_name"] },
    { kind: "text", offers: ["text", "first_name", "business_name"] },
  ], "a guess, and every source there is on a list moment with no link on file");
  // Typed over, a slot keeps its row: an input where the words were, no row added or taken away.
  const src = find(allByTestId(tree, "pb-fill")[0], (n) => n.props?.["data-testid"] === "pb-fill-source");
  src.props.onChange({ target: { value: "text" } });
  tree = page();
  assert.deepEqual(fillsOf(tree).map((f) => f.kind), ["text", "text"]);
  assert.equal(allByTestId(tree, "pb-fill").length, 2);
});

test("the business name typed over starts from it, and goes out as typed words", async () => {
  let tree = composing({}, "quiet_30");
  find(allByTestId(tree, "pb-fill")[1], (n) => n.props?.["data-testid"] === "pb-fill-source").props.onChange({ target: { value: "text" } });
  tree = page();
  assert.equal(allByTestId(tree, "pb-fill-input")[0].props.value, "Northside Studio", "it starts from the name on file");
  type(tree, 0, "Northside");
  tree = page();
  await press(byTestId(tree, "pb-save"));
  const [, body] = said.at(-1);
  assert.deepEqual(body.params, [{ kind: "first_name" }, "Northside", { kind: "booking_link" }]);
});

test("REGRESSION: a visit's reminder is not offered to a list moment, and is to a visit moment -- a win-back could pick it and no run could fill it", () => {
  let tree = composing({}, "quiet_30");
  press(byTestId(tree, "pb-template"));
  tree = page();
  const names = allByTestId(tree, "pb-template-option").map((o) => o.props["data-lang"]);
  assert.ok(!names.includes("visit_reminder"), `REGRESSION: ${names.join(", ")}`);
  assert.deepEqual(names, ["winback_offer", "monthly_offer", "autumn_offer"], "the moment's own first, then the rest");
  assert.equal(allByTestId(tree, "pb-template-option")[0].props["data-group"], "own");
  // The moment's own leads wherever the library puts it: the month's offer sorts after the win-back there.
  tree = composing({}, "everyone_monthly");
  press(byTestId(tree, "pb-template"));
  tree = page();
  assert.deepEqual(allByTestId(tree, "pb-template-option").map((o) => o.props["data-lang"]), ["monthly_offer", "winback_offer", "autumn_offer"]);


  tree = composing({}, "visit_tomorrow");
  assert.deepEqual(fillsOf(tree), [
    { kind: "first_name", offers: [] },
    { kind: "business_name", offers: ["business_name", "text"] },
    { kind: "visit_when", offers: [] },
    { kind: "visit_service", offers: [] },
  ], "the visit reminder, its visit's words each visit's own");
  assert.ok(textOf(allByTestId(tree, "pb-fill")[2]).includes("Their visit's time"));
  assert.ok(textOf(byTestId(tree, "pb-clock")).includes("one message per visit"), "no cap and no gap: a reminder is owed to every visit");
  assert.equal(byTestId(tree, "pb-cap"), null);
  assert.equal(byTestId(tree, "pb-gap"), null);
});

/* ---------------------------------- what it opens on ---------------------------------- */

test("it opens on the moment's own message, and on nothing when that is not approved -- it opened on whichever sorted first", () => {
  let tree = composing({}, "everyone_monthly");
  assert.ok(textOf(byTestId(tree, "pb-template")).includes("This month's offer"), textOf(byTestId(tree, "pb-template")));
  assert.ok(textOf(byTestId(tree, "pb-template")).includes("Written for this moment"));

  // Welcome's own is not held: nothing is picked for it, and the message's place says what to do.
  tree = composing({}, "new_week");
  assert.ok(textOf(byTestId(tree, "pb-template")).includes("Pick a message"), `REGRESSION: ${textOf(byTestId(tree, "pb-template"))}`);
  assert.equal(byTestId(tree, "pb-preview"), null);
  assert.ok(byTestId(tree, "pb-add-starter"), "its own is one press away");
  assert.equal(byTestId(tree, "pb-save").props.disabled, true);
  assert.equal(textOf(byTestId(tree, "pb-foot-say")), "Pick the message it sends.");
  tree = pick("pb-template", "autumn_offer");
  assert.ok(byTestId(tree, "pb-preview"), "picked, it is drawn");
});

test("New playbook opens on the first moment nothing is doing yet", () => {
  const tree = composing({ rows: [playbook()] });
  assert.ok(textOf(byTestId(tree, "pb-moment")).includes("Welcome"), textOf(byTestId(tree, "pb-moment")));
});

test("a moment moved to keeps the message chosen when it can send it, and gives way to its own when it cannot", () => {
  let tree = composing({}, "visit_tomorrow");
  assert.ok(textOf(byTestId(tree, "pb-template")).includes("Visit reminder"));
  tree = pick("pb-moment", "quiet_30");
  assert.ok(textOf(byTestId(tree, "pb-template")).includes("Win-back"), `the reminder cannot go to a list: ${textOf(byTestId(tree, "pb-template"))}`);
  tree = pick("pb-template", "autumn_offer");
  tree = pick("pb-moment", "phoned_only");
  assert.ok(textOf(byTestId(tree, "pb-template")).includes("Autumn offer"), "a message chosen goes with the owner");
});

/* ---------------------------------- what it sends ---------------------------------- */

test("words to write hold Start until they are written, and the name is the route's until it is typed", async () => {
  let tree = composing({}, "everyone_monthly");
  assert.equal(byTestId(tree, "pb-save").props.disabled, true);
  assert.equal(textOf(byTestId(tree, "pb-foot-say")), "Fill in “The offer” to start it.");
  assert.equal(byTestId(tree, "pb-name").props.value, "The month's offer", "the name the route gives it (contracts playbookName)");
  type(tree, 0, "20% off colour this week.");
  tree = page();
  assert.equal(byTestId(tree, "pb-save").props.disabled, false);
  await press(byTestId(tree, "pb-save"));
  const [verb, body] = said.at(-1);
  assert.equal(verb, "create");
  assert.deepEqual(body, {
    name: null, trigger: "everyone_monthly", template_id: "tpl-monthly_offer",
    params: [{ kind: "first_name" }, { kind: "business_name" }, "20% off colour this week.", { kind: "booking_link" }],
    run_hour: 10, cap_per_run: 25, gap_days: 90, cadence_days: 30,
  }, "no name: the route names it, as the sheet said it would");

  tree = composing({}, "everyone_monthly");
  type(tree, 0, "20% off colour this week.");
  byTestId(page(), "pb-name").props.onChange({ target: { value: "  October offer " } });
  // The month's offer's repeat is its cadence: a person hears it once in that many days.
  byTestId(page(), "pb-gap").props.onChange({ target: { value: "60" } });
  byTestId(page(), "pb-cap").props.onChange({ target: { value: "100" } });
  tree = page();
  assert.ok(textOf(byTestId(tree, "pb-clock")).includes("people a run"));
  await press(byTestId(tree, "pb-save"));
  const [, named] = said.at(-1);
  assert.equal(named.name, "October offer");
  assert.equal(named.cadence_days, 60);
  assert.equal(named.gap_days, 90);
  assert.equal(named.cap_per_run, 100);
});

test("REGRESSION: a playbook stored with its first name filled by the booking link is put right when it is changed, and its card says so until then", async () => {
  const broken = playbook({ params: [{ kind: "booking_link" }, { kind: "business_name" }, { kind: "booking_link" }] });
  globalThis.window.__PLAYBOOKS = surface({ rows: [broken] });
  fresh();
  const flashed = [];
  let edited = null;
  const card = globalThis.window.PlaybookCard({ p: broken, canAct: true, onEdit: (p) => { edited = p; }, flash: (t) => flashed.push(t) });
  const wrong = byTestId(card, "pb-slot-wrong");
  assert.ok(textOf(wrong).includes("“First name” is filled with the booking link"), textOf(wrong));
  press(byTestId(card, "pb-slot-wrong-edit"));
  assert.equal(edited, broken, "Edit opens the composer on it");
  assert.equal(byTestId(globalThis.window.PlaybookCard({ p: playbook(), canAct: true, onEdit() {}, flash() {} }), "pb-slot-wrong"), null, "and a playbook whose slots are right says nothing");

  // Changed: the first name is each person's own again, and Save sends it so.
  fresh();
  let tree = page();
  const tile = byTestId(tree, "pb-card");
  press(find(tile, (n) => n.props?.["data-testid"] === "pb-open"));
  tree = page();
  press(byTestId(tree, "pb-edit"));
  tree = page();
  assert.equal(fillsOf(tree)[0].kind, "first_name");
  assert.equal(textOf(byTestId(tree, "pb-save")), "Save changes");
  await press(byTestId(tree, "pb-save"));
  const [verb, id, body] = said.at(-1);
  assert.deepEqual([verb, id], ["update", "pb-1"]);
  assert.deepEqual(body.params, [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }]);
  assert.equal(body.name, "Win-back", "a stored name stays its own");
});

test("a playbook whose message WhatsApp no longer approves says so when changed, and is never moved to another behind its back", () => {
  const p = playbook({ template_id: "tpl-gone", template_name: "old_offer" });
  globalThis.window.__PLAYBOOKS = surface({ rows: [p] });
  fresh();
  let tree = page();
  press(find(byTestId(tree, "pb-card"), (n) => n.props?.["data-testid"] === "pb-open"));
  tree = page();
  press(byTestId(tree, "pb-edit"));
  tree = page();
  assert.ok(textOf(byTestId(tree, "pb-template-lost")).includes("no longer approves it"), textOf(byTestId(tree, "pb-template-lost")));
  assert.ok(textOf(byTestId(tree, "pb-template")).includes("Pick a message"), "no other message is put in its place");
  assert.equal(byTestId(tree, "pb-save").props.disabled, true);
});

/* ---------------------------------- the page under it ---------------------------------- */

test("REGRESSION: opening the composer moves nothing on the page -- the unset moments stood down and the cards moved down under a panel", () => {
  globalThis.window.__PLAYBOOKS = surface({ rows: [playbook()] });
  fresh();
  const before = page();
  const slots = (t) => allByTestId(t, "pb-slot").map((s) => s.props["data-trigger"]);
  const was = slots(before);
  globalThis.window.dispatchEvent({ type: "playbooks:new" });
  const after = page();
  assert.ok(byTestId(after, "pb-composer"), "the sheet is open");
  assert.deepEqual(slots(after), was, "every unset moment is where it was");
  assert.equal(allByTestId(after, "pb-card").length, 1);
  // The sheet is the record kit's: a dialog, modal, named by its title.
  const sheet = byTestId(after, "pb-composer");
  assert.equal(sheet.props.role, "dialog");
  assert.equal(sheet.props["aria-modal"], true);
  press(byTestId(after, "pb-cancel"));
  assert.equal(byTestId(page(), "pb-composer"), null, "Cancel closes it");
});

/* ---------------------------------- the rules, in contracts ---------------------------------- */

test("slotChoices: what keeps a known slot true, anything for a guessed one; templateSlots refuses a message a moment cannot fill; playbookName is the route's", () => {
  const { slotChoices, templateSlots, playbookName } = contracts;
  const o = { known: true, visits: false, bookingLink: true };
  assert.deepEqual(slotChoices("first_name", o), ["first_name"]);
  assert.deepEqual(slotChoices("business_name", o), ["business_name", "text"]);
  assert.deepEqual(slotChoices("booking_link", o), ["booking_link", "text"]);
  assert.deepEqual(slotChoices("booking_link", { ...o, bookingLink: false }), ["text"]);
  assert.deepEqual(slotChoices("visit_when", o), []);
  assert.deepEqual(slotChoices("visit_when", { ...o, visits: true }), ["visit_when"]);
  assert.deepEqual(slotChoices("text", o), ["text"]);
  assert.deepEqual(slotChoices("first_name", { ...o, known: false }), ["first_name", "text", "business_name", "booking_link"]);
  assert.deepEqual(slotChoices("text", { known: false, visits: true, bookingLink: false }), ["text", "first_name", "business_name", "visit_when", "visit_service"]);
  assert.equal(templateSlots(starterRow("visit_reminder"), { visits: false, bookingLink: true }), null);
  assert.equal(templateSlots(starterRow("visit_reminder"), { visits: true, bookingLink: true }).length, 4);
  assert.equal(playbookName({ id: "quiet_30", label: "Win-back" }, { name: "winback_offer" }), "Win-back");
  assert.equal(playbookName({ id: "quiet_30", label: "Win-back" }, { name: "autumn_offer", title: "Autumn offer" }), "Win-back · Autumn offer");
});
