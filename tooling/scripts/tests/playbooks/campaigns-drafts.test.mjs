/**
 * Campaigns, the loading standard's D and G: a playbook's act is said when the server takes it, and a composer's
 * words are kept in the tab, come back when it opens again, and are thrown away only after one question.
 *
 * - A playbook card's Pause, Run now, Approve, Skip and Delete waited for the write AND the refresh map's re-read of
 *   the playbooks and the broadcasts (the second reads every contact page) before saying anything. They say it from
 *   the server's answer (`onAccepted`), and the card's buttons wait for the re-read: a Run now pressed twice before
 *   the first run's rows had landed would be two runs.
 * - The playbook sheet's Escape dropped everything typed; the send screen's Cancel and a trip to another page lost a
 *   name, a typed value and a picked time; a template half-written, or a translation the assistant had just been paid
 *   to write, went with a Cancel. Each is kept per tab (tab-memory.ts) under one rule (record-fold.jsx
 *   useUnsavedWork), the registry holds the tab from closing over it, and Cancel asks once (UnsavedAsk).
 * Run against the pages on a stub React, with the tab's memory installed as the app installs it.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";

const { toBroadcastVM, stateOf, numberHealth } = contracts;
const TID = "t-studio";
const ZONE = "America/New_York";
const NOW = Date.now();

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
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/broadcasts",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
  innerHeight: 800,
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
  setInterval: () => 1,
  clearInterval() {},
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
};
const { installClock } = await import("../../../../apps/dashboard/src/legacy-bridge/zone.ts");
installClock();
const { installTemplates } = await import("../../../../apps/dashboard/src/legacy-bridge/templates.ts");
installTemplates();
const { installPlaybooks } = await import("../../../../apps/dashboard/src/legacy-bridge/playbooks.ts");
installPlaybooks();
// The tab's memory, as the app installs it (surface-cache.ts): the one store every composer keeps its words in.
const { installTabMemory, clearTabMemory } = await import("../../../../apps/dashboard/src/legacy-bridge/tab-memory.ts");
installTabMemory(globalThis.window);
const TM = globalThis.window.__tabMemory;

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
const went = [];
const toasts = [];
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
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: (fn, deps) => {
    const k = frames.key();
    const prev = cells[k];
    if (
      prev &&
      deps &&
      prev.deps &&
      deps.length === prev.deps.length &&
      deps.every((d, i) => Object.is(d, prev.deps[i]))
    )
      return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    cells[k] = { deps, cleanup: undefined };
    cells[k].cleanup = fn();
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
await import("../../../../apps/dashboard/src/legacy/components/record-fold.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill", "PolicyChip", "Confirm"])
  globalThis[k] = globalThis.window[k];
globalThis.useHotkey = () => {};
Object.assign(globalThis.window, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to) => went.push(to),
  __chrome: { state: stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
  __surfaceState: () => "live",
  __DEMO_MODE: false,
});
await import("../../../../apps/dashboard/src/legacy/components/record-sheet.jsx");
await import("../../../../apps/dashboard/src/legacy/components/message-preview.jsx");
await import("../../../../apps/dashboard/src/legacy/components/template-chips.jsx");
await import("../../../../apps/dashboard/src/legacy/components/campaign-bits.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/templates-real.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts-run.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts-ledger.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/broadcasts.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-bits.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-card.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/playbook-composer.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/outbound.jsx");
await import("../../../../apps/dashboard/src/legacy/pages/messages.jsx");

/* ---------------------------------- walking a tree ---------------------------------- */

// What is drawn: a component's own drawing when it has one (the sheet draws the children it is given, and its title
// and foot, where it puts them), else the children.
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  if (n.rendered !== undefined) walk(n.rendered, fn);
  else walk(n.props?.children, fn);
};
const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
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
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const type = (node, value) => node.props.onChange({ target: { value } });
const settle = () => new Promise((r) => setImmediate(r));
/** A fresh mount, as React mounts a page a person came back to: every cell forgotten, every listener gone. */
const fresh = () => {
  cells = [];
  frames.begin();
  went.length = 0;
  toasts.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
};
/** The tree drawn again over the same cells, as React draws it after a state change. */
const redraw = (draw) => {
  frames.begin();
  return draw();
};
/** The tree gone, as React unmounts it: each effect's cleanup, then the cells forgotten. */
const unmount = () => {
  for (const c of Object.values(cells)) if (c && typeof c.cleanup === "function") c.cleanup();
  cells = [];
  frames.begin();
};
/** What the tab keeps, whole: every draft in the slot. */
const drafts = () => JSON.parse(globalThis.sessionStorage.getItem("chanlytics.drafts.v1") || "{}");
/** The browser's own question before the tab closes: whether the registry's listener held it. */
const tabClosing = () => {
  const ev = {
    type: "beforeunload",
    returnValue: undefined,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  globalThis.window.dispatchEvent(ev);
  return ev.prevented;
};

/* ---------------------------------- the surfaces ---------------------------------- */

const D = 24 * 3_600_000;
const iso = (ms) => new Date(NOW + ms).toISOString();
const dto = (over = {}) => ({
  id: "b-sent",
  name: "Win-back · 2026-09-10",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }],
  audience: { kind: "playbook", id: "pb-1", label: "Win-back" },
  state: "sent",
  scheduled_for: iso(-5 * D),
  started_at: iso(-5 * D),
  finished_at: iso(-5 * D + 60_000),
  recipient_count: 3,
  failure: null,
  created_at: iso(-5 * D),
  playbook_id: "pb-1",
  run_for: "2026-09-10",
  counts: { queued: 0, sent: 3, skipped: 0, failed: 0, delivered: 2, read: 1, replied: 1 },
  ...over,
});
const healthyNumber = {
  present: true,
  display: "+1 305-555-0100",
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
};
/** A starter as WhatsApp holds it once approved: the library's words and slots. */
const starterRow = (key, id) => {
  const s = contracts.starterByKey(key);
  const t = contracts.starterText(s, "en_US");
  return {
    id,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    meta_status: "approved",
    category: s.category,
    purpose: s.category === "utility" ? "conversational" : "marketing",
    source: "starter",
    title: null,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  };
};
/** A message written elsewhere, with one slot to type into. */
const ownTemplate = {
  id: "tpl-own",
  channel: "whatsapp",
  name: "autumn_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  purpose: "marketing",
  source: "meta",
  title: "Autumn offer",
  body_preview: "Hi {{1}}, {{2}} this autumn.",
  variables: [
    { position: 1, label: "Name", example: "Dani" },
    { position: 2, label: "Value 2", example: "20% off" },
  ],
};
const broadcastsSurface = (over = {}) => ({
  audiences: [
    { kind: "everyone", id: null, label: "Everyone who said yes", counts: { marketing: 2, conversational: 3 } },
    { kind: "saved", id: "s1", label: "Regulars", counts: { marketing: 1, conversational: 1 } },
  ],
  templates: [ownTemplate],
  rows: [toBroadcastVM(dto(), ZONE)],
  more: false,
  heldReasons: contracts.HELD_REASONS,
  chunk: contracts.BROADCAST_CHUNK,
  number: healthyNumber,
  optIn: null,
  getYes: contracts.GET_YES_ROUTE,
  listsRead: true,
  scheduleMaxDays: 30,
  businessName: "Northside Studio",
  bookingLink: false,
  ...over,
});
const playbook = (over = {}) => ({
  id: "pb-1",
  name: "Win-back",
  trigger: "quiet_30",
  template_id: "tpl-1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: iso(-30 * D),
  triggerLabel: "Quiet 30 days",
  triggerHint: "anyone quiet for a month",
  schedule: "daily at 10:00",
  next: "tomorrow 10:00",
  candidates: 4,
  held: 0,
  totals: { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
  ...over,
});
const playbooksSurface = (over = {}) => ({
  rows: [playbook()],
  templates: [starterRow("winback_offer", "tpl-1")],
  triggers: contracts.PLAYBOOK_TRIGGERS.map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    cls: t.cls,
    list: t.list,
    kind: t.kind,
    candidates: 4,
    held: 0,
  })),
  timezone: ZONE,
  calendar: "none",
  number: { present: true, health: { canSend: true } },
  businessName: "Northside Studio",
  bookingLink: true,
  fetchedAt: NOW,
  ...over,
});
globalThis.window.__broadcasts = {
  failureWords: (code) => contracts.broadcastFailureWords(code),
  noNumberWords: (who, purpose) => contracts.noNumberWords(who, purpose),
  saidYesWords: (who, purpose, sending, saidYes) => contracts.saidYesWords(who, purpose, sending, saidYes),
  report: (d) =>
    contracts.toRunReportVM(d, { windowMs: contracts.REPLY_WINDOW_MS, nowMs: Date.now(), clock: () => null }),
  detail: async () => ({ ok: false, code: "not_found", status: 404, message: "Broadcast not found." }),
  send: async () => ({
    ok: true,
    data: { id: "b-new", name: "Autumn", recipient_count: 2, scheduled_for: iso(0), moved_from: null },
  }),
};

const page = (props = { initialSegment: null, initialRun: null }) => globalThis.window.BroadcastsPage(props);
/** The send's name box, by its own words: the When box's input wears the same class. */
const nameBox = (tree) =>
  find(tree, (n) => n.type === "input" && String(n.props?.placeholder || "").startsWith("Name this broadcast"));
const playbooks = () => globalThis.window.OutboundPage({});
const messagesPage = () => {
  Object.assign(globalThis.window, {
    __TEMPLATES_ALL: [],
    __TEMPLATE_USE: null,
    __TEMPLATE_SENT: null,
    __CHANNELS: [{ kind: "whatsapp" }],
    __SETTINGS: { config: { brain: { business_name: "Northside Studio" } } },
  });
  return globalThis.window.MessagesPage();
};

beforeEach(() => {
  unmount();
  fresh();
  clearTabMemory();
  globalThis.window.__recordFolds.reset();
  globalThis.window.__BROADCASTS = broadcastsSurface();
  globalThis.window.__PLAYBOOKS = playbooksSurface();
});

/* ---------------------------------- D: an act is said when the server takes it ---------------------------------- */

test("a playbook card's act is said the moment the server takes it, with what it answered -- not after the playbooks, the broadcasts and every contact are read again -- and the button waits for the re-read", async () => {
  const keep = { ...globalThis.window.__playbooks };
  const reread = [];
  const acceptThenRead =
    (data) =>
    (_id, opts = {}) => {
      if (opts.onAccepted) opts.onAccepted(data);
      return new Promise((r) => reread.push(() => r({ ok: true, data })));
    };
  try {
    globalThis.window.__playbooks.pause = acceptThenRead({ id: "pb-1", state: "paused" });
    globalThis.window.__playbooks.runNow = acceptThenRead({
      outcome: "sent",
      eligible: 4,
      scheduled_for: iso(0),
      moved_from: null,
    });
    const draw = () =>
      globalThis.window.PlaybookCard({ p: playbook(), canAct: true, onEdit() {}, flash: (t) => toasts.push(t) });
    let card = draw();
    press(byTestId(card, "pb-pause"));
    await settle();
    assert.equal(toasts.length, 1, "said at acceptance, while the surfaces are read again");
    assert.match(textOf(toasts[0].msg), /Win-back paused — nothing runs until you resume it/);
    card = redraw(draw);
    assert.equal(
      byTestId(card, "pb-pause").props.disabled,
      true,
      "the card's buttons wait for the re-read: a second press now would be a second act",
    );
    while (reread.length) reread.shift()();
    await settle();
    assert.equal(toasts.length, 1, "and said once");
    card = redraw(draw);
    assert.equal(byTestId(card, "pb-pause").props.disabled, false, "free once the re-read landed");

    toasts.length = 0;
    press(byTestId(card, "pb-run-now"));
    await settle();
    assert.equal(toasts.length, 1, "Run now says what the run did from the server's answer, at acceptance");
    assert.match(textOf(toasts[0].msg), /Win-back — 4 people/);
    while (reread.length) reread.shift()();
    await settle();
    assert.equal(toasts.length, 1);

    // A client that never says it was accepted (an older bridge): said once the write answers, as before.
    toasts.length = 0;
    globalThis.window.__playbooks.pause = async () => ({ ok: true, data: { id: "pb-1", state: "paused" } });
    card = redraw(draw);
    press(byTestId(card, "pb-pause"));
    await settle();
    assert.equal(toasts.length, 1, "said once, from the answer");
    // A refusal is said as one, and nothing else.
    toasts.length = 0;
    globalThis.window.__playbooks.pause = async () => ({
      ok: false,
      code: "forbidden",
      status: 403,
      message: "Only an owner or operator can pause a playbook.",
    });
    card = redraw(draw);
    press(byTestId(card, "pb-pause"));
    await settle();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].tone, "danger");
    assert.match(textOf(toasts[0].msg), /Only an owner or operator/);
  } finally {
    Object.assign(globalThis.window.__playbooks, keep);
  }
});

/* ---------------------------------- G: the playbook sheet ---------------------------------- */

test("the playbook sheet keeps what was typed in the tab, opens again on it after the page was left, and its Cancel and Escape ask before throwing it away -- Escape dropped everything", () => {
  playbooks();
  globalThis.window.dispatchEvent({ type: "playbooks:new" });
  let tree = redraw(playbooks);
  assert.ok(byTestId(tree, "pb-composer"), "the sheet is open");
  assert.deepEqual(drafts(), {}, "nothing typed, nothing kept");
  // Cancel with nothing changed closes at once, as it did.
  press(byTestId(tree, "pb-cancel"));
  tree = redraw(playbooks);
  assert.equal(byTestId(tree, "pb-composer"), null, "Cancel closes it");

  globalThis.window.dispatchEvent({ type: "playbooks:new" });
  tree = redraw(playbooks);
  type(byTestId(tree, "pb-name"), "Sunday quiet");
  tree = redraw(playbooks);
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet");
  const kept = TM.draft("playbook", "new");
  assert.equal(kept && kept.name, "Sunday quiet", "kept in the tab under the composer's kind, as it is typed");
  assert.equal(tabClosing(), true, "and the tab asks before closing over it (the record kit's registry holds it)");
  assert.equal(globalThis.window.__settingsUnsaved(), true, "the rail's question hears it too");

  // Escape is the sheet's Close (record-sheet.jsx): it asks, where the sheet's buttons were, and closes nothing.
  globalThis.window.dispatchEvent({ type: "keydown", key: "Escape", defaultPrevented: false, preventDefault() {} });
  tree = redraw(playbooks);
  assert.ok(byTestId(tree, "pb-composer"), "REGRESSION: Escape dropped the sheet and everything typed in it");
  assert.ok(byTestId(tree, "pb-leave-confirm"), "the one question");
  assert.equal(textOf(byTestId(tree, "pb-leave-confirm")).includes("Throw away what you've written?"), true);
  assert.equal(byTestId(tree, "pb-cancel"), null, "in the buttons' place");
  press(byTestId(tree, "pb-leave-no"));
  tree = redraw(playbooks);
  assert.ok(byTestId(tree, "pb-cancel"), "Keep writing: the buttons are back");
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet", "and the words with them");

  // The page left (People, a reload) and come back to: the sheet opens again on what was typed.
  unmount();
  assert.equal(tabClosing(), false, "gone from the page, it holds the tab no longer");
  tree = playbooks();
  assert.ok(byTestId(tree, "pb-composer"), "opens again as the page does");
  assert.equal(byTestId(tree, "pb-name").props.value, "Sunday quiet", "on the words that were typed");

  // An empty moment's "Set it up" pressed while a new one is half-written: the sheet opens on THAT moment (the page
  // keys the sheet by the slot, so React mounts it anew), with the words kept. Drawn on its own: the stub keeps one
  // set of cells whatever the key.
  assert.ok(
    textOf(byTestId(tree, "pb-moment")).includes("Welcome"),
    "the draft's moment: the first one nothing is doing yet",
  );
  unmount();
  const sheet = globalThis.window.PlaybookComposer({
    data: globalThis.window.__PLAYBOOKS,
    editing: null,
    initialTrigger: "phoned_only",
    onDone() {},
    onCancel() {},
  });
  assert.ok(
    textOf(byTestId(sheet, "pb-moment")).includes(contracts.triggerOf("phoned_only").label),
    "the moment pressed wins over the draft's",
  );
  assert.equal(byTestId(sheet, "pb-name").props.value, "Sunday quiet", "and the words stay");
  unmount();
  tree = playbooks();

  // Cancel, then Yes: gone, from the sheet and from the tab.
  press(byTestId(tree, "pb-cancel"));
  tree = redraw(playbooks);
  press(byTestId(tree, "pb-leave-yes"));
  tree = redraw(playbooks);
  assert.equal(byTestId(tree, "pb-composer"), null, "thrown away: the sheet closes");
  assert.equal(TM.draft("playbook", "new"), null, "and nothing is kept");
  // The stub draws no unmount of a child the page stopped drawing: React would, and the hold goes with it.
  unmount();
  assert.equal(tabClosing(), false);
});

test("a playbook being changed is kept under its own id, and Save, taken, keeps nothing", async () => {
  const keep = { ...globalThis.window.__playbooks };
  try {
    globalThis.window.__playbooks.update = async (id, body) => ({
      ok: true,
      data: { id, name: body.name || "Win-back" },
    });
    let tree = playbooks();
    press(byTestId(tree, "pb-open"));
    tree = redraw(playbooks);
    press(byTestId(tree, "pb-edit"));
    tree = redraw(playbooks);
    assert.ok(byTestId(tree, "pb-composer"));
    type(byTestId(tree, "pb-name"), "Win-back, gentler");
    tree = redraw(playbooks);
    assert.equal(
      TM.draft("playbook", "pb-1") && TM.draft("playbook", "pb-1").name,
      "Win-back, gentler",
      "under the playbook's id",
    );
    assert.equal(TM.draft("playbook", "new"), null, "not the new one's");
    unmount();
    tree = playbooks();
    assert.ok(byTestId(tree, "pb-composer"), "come back to, the change opens again");
    assert.equal(byTestId(tree, "pb-name").props.value, "Win-back, gentler");
    await press(byTestId(tree, "pb-save"));
    tree = redraw(playbooks);
    assert.equal(byTestId(tree, "pb-composer"), null, "saved, the sheet closes");
    assert.equal(TM.draft("playbook", "pb-1"), null, "and the server has it: nothing to keep");
  } finally {
    Object.assign(globalThis.window.__playbooks, keep);
  }
});

/* ---------------------------------- G: the send screen ---------------------------------- */

test("the send screen keeps its words -- a name, a typed value, a picked time -- and opens again on them; a list or a message chosen alone keeps nothing; Cancel asks once and Yes clears it", () => {
  let tree = page();
  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-composer"));
  // The list and the message are choices, not words: chosen, nothing is kept and Cancel closes at once.
  press(all(tree, (n) => n.props?.["data-testid"] === "bc-audience")[1]);
  tree = redraw(page);
  assert.deepEqual(drafts(), {}, "a choice alone is not work");
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null, "Cancel closes it, as it did");

  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  type(byTestId(byTestId(tree, "bc-vars"), "bc-var-input"), "20% off colour");
  tree = redraw(page);
  type(nameBox(tree), "Autumn colour");
  tree = redraw(page);
  const kept = TM.draft("broadcast");
  assert.equal(kept.name, "Autumn colour");
  assert.deepEqual(
    kept.params["tpl-own"],
    [null, "20% off colour"],
    "the value typed into the second slot (the first is each person's own name)",
  );
  assert.equal(kept.aud, "saved:s1", "and the list it was for");
  assert.equal(tabClosing(), true, "the tab asks before closing over it");

  // Cancel with words asks, where the Cancel was; Keep writing puts it back.
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-composer"), "not closed");
  assert.ok(byTestId(tree, "bc-leave-confirm"), "asked");
  press(byTestId(tree, "bc-leave-no"));
  tree = redraw(page);
  assert.ok(byTestId(tree, "bc-compose-close"));
  assert.equal(byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value, "20% off colour");

  // Left and come back to: the send screen, on the same list, with the same words.
  unmount();
  tree = page();
  assert.ok(byTestId(tree, "bc-composer"), "opens on the send half-written");
  assert.equal(nameBox(tree).props.value, "Autumn colour");
  assert.equal(byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value, "20% off colour");
  const chips = all(tree, (n) => n.props?.["data-testid"] === "bc-audience");
  assert.ok(String(chips[1].props.className).includes("active"), "on Regulars, the list it was for");
  // A link that names a list wins the list.
  unmount();
  tree = page({ initialSegment: "s1", initialRun: null });
  assert.ok(byTestId(tree, "bc-composer"));
  unmount();
  tree = page();

  // Yes, throw it away: closed, cleared, and nothing kept -- New broadcast opens empty.
  press(byTestId(tree, "bc-compose-close"));
  tree = redraw(page);
  press(byTestId(tree, "bc-leave-yes"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null);
  assert.equal(TM.draft("broadcast"), null);
  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  assert.equal(nameBox(tree).props.value, "", "REGRESSION: the last send's words stayed in the page after a Cancel");
  assert.equal(byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value, "");
});

test("a send the server took keeps nothing: the screen closes onto the ledger and the next New broadcast is empty", async () => {
  let tree = page();
  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  type(byTestId(byTestId(tree, "bc-vars"), "bc-var-input"), "20% off colour");
  tree = redraw(page);
  assert.ok(TM.draft("broadcast"));
  press(byTestId(tree, "bc-send"));
  tree = redraw(page);
  await press(byTestId(tree, "bc-send-yes"));
  tree = redraw(page);
  assert.equal(byTestId(tree, "bc-composer"), null, "sent, the screen closes");
  assert.equal(TM.draft("broadcast"), null, "and nothing is kept");
  press(byTestId(tree, "bc-new"));
  tree = redraw(page);
  assert.equal(byTestId(byTestId(tree, "bc-vars"), "bc-var-input").props.value, "", "the next one starts empty");
});

/* ---------------------------------- G: the template composer ---------------------------------- */

test("a template half-written is kept, comes back with the page, and Close asks once; a translation the assistant wrote is kept too, and is not written again", async () => {
  const keep = globalThis.window.__templates;
  const drafted = [];
  globalThis.window.__templates = {
    ...keep,
    draft: async (body) => {
      drafted.push(body);
      return {
        ok: true,
        data: {
          draft: {
            name: "autumn_offer",
            body: "Hola {{1}}, {{2}} este otoño.",
            footer: "",
            examples: ["Dani", "20%"],
            variables: [{ label: "Name" }, { label: "Offer" }],
            warnings: [],
          },
        },
      };
    },
    create: async (b) => ({ ok: true, data: { name: b.name } }),
  };
  try {
    // New, drawn on its own.
    let closed = 0;
    const composeNew = () =>
      globalThis.window.TemplateComposer({
        businessName: "Northside Studio",
        onDone() {},
        onCancel() {
          closed += 1;
        },
      });
    let tree = composeNew();
    type(byTestId(tree, "tpl-body"), "Hi {{1}}, 20% off any colour service this week.");
    tree = redraw(composeNew);
    assert.equal(
      TM.draft("template", "new").body,
      "Hi {{1}}, 20% off any colour service this week.",
      "kept as it is typed",
    );
    press(byTestId(tree, "tpl-close"));
    tree = redraw(composeNew);
    assert.equal(closed, 0, "not closed");
    assert.ok(byTestId(tree, "tpl-leave-confirm"), "Close with words asks");
    assert.equal(byTestId(tree, "tpl-submit"), null, "where the submit was");
    press(byTestId(tree, "tpl-leave-no"));
    tree = redraw(composeNew);
    assert.ok(byTestId(tree, "tpl-submit"));
    // Campaigns > Templates, come back to: the composer is open, on the words.
    unmount();
    tree = messagesPage();
    assert.ok(byTestId(tree, "messages-composer"), "come back to, the composer is open");
    assert.equal(
      byTestId(tree, "tpl-body").props.value,
      "Hi {{1}}, 20% off any colour service this week.",
      "on the words",
    );
    // Submitted and taken: nothing kept.
    unmount();
    tree = composeNew();
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hi {{1}}, 20% off any colour service this week.");
    type(byTestId(tree, "tpl-name"), "autumn_colour");
    tree = redraw(composeNew);
    const ex = find(
      tree,
      (n) => n.type === "input" && String(n.props?.placeholder || "").includes("what a real value"),
    );
    type(ex, "Dani");
    tree = redraw(composeNew);
    await press(byTestId(tree, "tpl-submit"));
    assert.equal(TM.draft("template", "new"), null, "submitted and taken: nothing kept");
    unmount();
    tree = messagesPage();
    assert.equal(byTestId(tree, "messages-composer"), null, "and Templates opens on its rows");

    // A translation: written once by the assistant, kept under the message and its language, and never paid for twice.
    fresh();
    const translate = { ref: "tpl-own", from: "en_US", name: "autumn_offer", language: "es", title: "Autumn offer" };
    const compose = () =>
      globalThis.window.TemplateComposer({ businessName: "Northside Studio", translate, onDone() {}, onCancel() {} });
    tree = compose();
    await settle();
    assert.equal(drafted.length, 1, "written once");
    tree = redraw(compose);
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hola {{1}}, {{2}} este otoño.");
    assert.equal(
      TM.draft("template", "autumn_offer|es").body,
      "Hola {{1}}, {{2}} este otoño.",
      "the assistant's words are work too",
    );
    unmount();
    tree = compose();
    await settle();
    assert.equal(
      drafted.length,
      1,
      "REGRESSION: opened again, it was drafted again -- and the assistant is paid per draft",
    );
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hola {{1}}, {{2}} este otoño.", "the words it had");
    press(byTestId(tree, "tpl-cancel"));
    tree = redraw(compose);
    assert.ok(byTestId(tree, "tpl-leave-confirm"), "Cancel asks");
    press(byTestId(tree, "tpl-leave-yes"));
    assert.equal(TM.draft("template", "autumn_offer|es"), null, "thrown away");
  } finally {
    globalThis.window.__templates = keep;
  }
});

test("the registry's hold: a composer's words hold the tab and the rail, as an open fold's do, and never stand between two folds", () => {
  const folds = globalThis.window.__recordFolds;
  assert.equal(tabClosing(), false);
  let words = true;
  const release = folds.hold("send", () => words);
  assert.equal(tabClosing(), true, "the tab asks");
  assert.equal(globalThis.window.__settingsUnsaved(), true, "the rail asks");
  words = false;
  assert.equal(tabClosing(), false, "read at the moment it asks");
  words = true;
  // A fold asked for while a composer holds opens at once: the hold is not a fold's unsaved changes.
  assert.equal(folds.request("hours", { dirty: () => false }), true);
  assert.equal(
    folds.request("services", { dirty: () => false }),
    true,
    "a clean fold gives way whatever a composer holds",
  );
  release();
  assert.equal(tabClosing(), false, "released, it holds nothing");
  release();
  folds.reset();
});
