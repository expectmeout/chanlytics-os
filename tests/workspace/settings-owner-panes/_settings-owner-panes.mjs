/**
 * The world the tests of settings-owner-panes/ share. Split by behaviour from settings-owner-panes.test.mjs on 25 Nov 2026 (a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * The owner's panes gate the way the rest of the app does, and Activity reads like a log.
 *
 * - Settings' owner-only controls were refused in ways of their own (the interface audit's "gated six ways"; A7's
 *   list of hand-rolled checks): Notifications' Add and Remove were disabled with a title no keyboard or finger
 *   reaches; Your data's download and Team's Invite were absent for anyone else, under sentences of the page's own;
 *   Activity asked the signed-in role and ignored an owner's View-as preview. Each primary act is now drawn gated --
 *   focusable, described, inert, saying why when pressed, in contracts' words -- and each pane says why once.
 * - Activity (the wiring audit's S21): its filters had no names, the kind filter read the log on every keystroke and
 *   ate typed spaces, a slow answer could land over a newer one, and the first load showed nothing at all.
 * Run against the Settings page (surfaces/settings/frame/page.tsx), which imports the panes it draws (every one TSX:
 * surfaces/settings), on a stub React, over the frame's real gate and contracts' role table.
 */
import assert from "node:assert/strict";
import {
  ROLE_PERMS,
  stateOf,
  clockStamp,
  clockTime,
  clockDateYear,
  clockDayLabel,
  zoneDayKey,
} from "@chanlytics/contracts";
import { useStubHooks } from "../../_stub-react.mjs";
import { bridgeHolds, holdFrameParts } from "../../shell/_bridge-holds.mjs";

export const TID = "t-studio";

/* ---------------------------------- the window ---------------------------------- */

export const listeners = {};

export const tipped = [];

export const storage = () => {
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

bridgeHolds(
  {
    who: {
      workspaces: [
        { id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: "America/New_York" },
      ],
      activeWorkspaceId: TID,
    },
  },
  { fresh: true },
);

globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/admin/notifications",
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
  // The open log's minute (activity/newer.ts): a pane the stub React never unmounts holds no run open.
  setInterval: (fn, ms) => setInterval(fn, ms).unref(),
  clearInterval: (h) => clearInterval(h),
  // As the bridge publishes them (seed-globals.ts): the role table and the gate's sentence are contracts'.
  ROLE_PERMS,
};

/* ------------------------------ a stub React ------------------------------ */

// Hooks are kept per component, by the component's place in the tree and its type; memos and callbacks honour their
// inputs, so an effect that depends on a callback runs when React would run it and not on every draw. A setter marks
// the page changed, and `settle` draws again only then.
export let cells = new Map();

export let frames = [];

export let dirty = false;

export let lastTree = null;

export const slot = () => {
  const f = frames[frames.length - 1];
  return `${f.key}#${f.hook++}`;
};

export const same = (a, b) => !!a && !!b && a.length === b.length && a.every((d, i) => Object.is(d, b[i]));

export const memo = (make, deps) => {
  const k = slot();
  const was = cells.get(k);
  if (!was || !deps || !same(was.deps, deps)) cells.set(k, { value: make(), deps });
  return cells.get(k).value;
};

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
        dirty = true;
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
        dirty = true;
      },
    ];
  },
  useRef: (init) => {
    const k = slot();
    if (!cells.has(k)) cells.set(k, { current: init });
    return cells.get(k);
  },
  useMemo: (fn, deps) => memo(fn, deps),
  useCallback: (fn, deps) => memo(() => fn, deps),
  // A surface's value through the seam (use-surface.ts): what it holds when the component draws.
  useSyncExternalStore: (subscribe, snapshot) => snapshot(),
  useId: () => `id-${slot()}`,
  useEffect: (fn, deps) => {
    const k = slot();
    const prev = cells.get(k);
    if (prev && deps && same(prev.deps, deps)) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    const cell = { deps, cleanup: undefined };
    cells.set(k, cell);
    cell.cleanup = fn();
  },
  Children: { map: (kids, fn) => (kids == null ? kids : [].concat(kids).flat(Infinity).map(fn)) },
  isValidElement: (n) => !!n && typeof n === "object" && "type" in n && "props" in n,
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
};

holdFrameParts();

// frame-globals installs the shell tip on import, so the test tip -- where a pressed gate showed its reason -- goes on after it.
bridgeHolds({ parts: { tip: { show: (el) => tipped.push(el) } } });

useStubHooks();

for (const k of ["EmptyState", "FailedRead", "MoreMenu", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];

export const saved = [];

bridgeHolds({
  parts: {
    chrome: { state: stateOf },
    clock: (() => {
      const TZ = "America/New_York";
      const NOW = Date.parse("2026-09-17T18:00:00Z");
      return {
        zone: () => TZ,
        stamp: (ms) => clockStamp(ms, TZ, NOW),
        time: (ms) => clockTime(ms, TZ),
        dayKey: (ms) => zoneDayKey(ms, TZ),
        dateYear: (ms) => clockDateYear(ms, TZ),
        dayLabel: (ms) => clockDayLabel(ms, TZ, NOW),
      };
    })(),
    href: (key) => `/api/v1/${key.split(" ")[1]}?workspace=studio`,
    saveSettings: (config, version, accepted) => {
      saved.push({ config, version });
      accepted();
      return Promise.resolve({ ok: true });
    },
  },
});

Object.assign(globalThis.window, {
  __inviteState: () => ({ expired: false, words: "invite pending" }),
});
bridgeHolds({ parts: { toast: () => [null, () => {}] } });

await import("../../receptionist/business-tab/_business-parts.mjs");

// The role store the gates ask (window.ST_STORE): the bridge installs it as the app boots (seed-globals), settings.jsx used to.
export const { installRoleStore } = await import("../../../apps/dashboard/src/bridge/identity.ts");

installRoleStore();

// The page is the TSX module (decision 0015 step 11); it imports every pane it draws. Activity's reads are the bridge's
// `activity` object, which a test stands its own feed in on; Notifications reads the settings read over the seam and
// saves through the bridge's saveSettings; Autonomy's rows are the seam's policies and its one door is a module object a
// test stands a door in on; Team's roster is the seam's settings value.
export const { SettingsPage } = await import("../../../apps/dashboard/src/surfaces/settings/frame/page.tsx");

export const { activity } = await import("../../../apps/dashboard/src/bridge/activity.ts");

export const { pageClock } = await import("../../../apps/dashboard/src/bridge/zone.ts");

// The log's lists are the house's menu (the kit's MoreMenu), which runs here as it does in a browser.
export const { MoreMenu } = await import("../../../apps/dashboard/src/surfaces/kit/more-menu/more-menu.tsx");

/** The log's reads answered by `f`: the module's object, which the pane imports. */
export const stand = (f) => Object.assign(activity, f);

export const { setSurfaceValue, surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

/** The record the settings read holds now (the seam's `settings`; a window global, `__SETTINGS`, until 12 Nov 2026). */
export const settingsHeld = () => surfaceValue("settings")?.settings ?? undefined;

export const { autonomyVerbs } = await import("../../../apps/dashboard/src/surfaces/settings/autonomy/verbs.ts");

// The Team tab is the Partner pane's Team (settings/partner/team-card.tsx): the roster, then the workspace's partner
// card, an owner's read answered here as refused, so the card stays out of what these tests look at.
export const { partnerVerbs } = await import("../../../apps/dashboard/src/surfaces/settings/partner/surface.ts");

partnerVerbs.team.read = async () => ({ ok: false, code: "forbidden", message: "Only an owner can do this." });

// Notifications (decision 0040): its saves, its flashes and its verbs, stood in as the pane reads them.
export const { alertVerbs } = await import("../../../apps/dashboard/src/surfaces/settings/notifications/verbs.ts");

export const realVerbs = { ...alertVerbs };

/** The whole-config save answered as the server answers it: accepted, under the next version, holding what was sent. */
alertVerbs.saveConfig = (config, version, accepted) => {
  saved.push({ config, version });
  accepted({ config, version: version + 1 });
  return Promise.resolve({ ok: true });
};

/** What the pane flashed, each `{ msg, undo? }`: the frame's toast, as a list. */
export const flashes = [];

bridgeHolds({ parts: { toast: () => [null, (f) => flashes.push(f)] } });

/** Open the email row's addresses (its Change). */
export const openEmail = (tree) => press(byTestId(tree, "ntf-email-change"));

/** The ticks of one channel, as the buttons a person presses (the kit's Press draws each as one). */
export const ticks = (tree, channel) =>
  all(tree, (n) => n.type === "button" && (n.props?.["data-testid"] ?? "").startsWith(`ntf-${channel}-`));

export const PHONE = { platform: "ios", app_version: "1.4.0", last_seen_at: null };

export const alertsRead = (dto) => setSurfaceValue("alerts", dto ? { dto, fetchedAt: Date.now() } : null);

export const restoreVerbs = () => Object.assign(alertVerbs, { test: realVerbs.test, setPushOff: realVerbs.setPushOff });

export const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  walk(n.props?.children, fn);
  walk(n.rendered, fn);
};

// A drawn component is walked twice, as the children it was given and as what it rendered: each node counts once.
export const all = (tree, pred) => {
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

export const find = (tree, pred) => all(tree, pred)[0] ?? null;

export const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);

export const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};

export const buttonSaying = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);

export const labelled = (tree, tag, label) => find(tree, (n) => n.type === tag && n.props["aria-label"] === label);

export const pressOf = () => ({
  prevented: false,
  stopped: false,
  currentTarget: { control: true },
  preventDefault() {
    this.prevented = true;
  },
  stopPropagation() {
    this.stopped = true;
  },
});

export const press = (node) => {
  const e = pressOf();
  node.props.onClick(e);
  return e;
};

export const type = (node, value) => node.props.onChange({ target: { value } });

export const flush = () => new Promise((r) => setImmediate(r));

export const fresh = () => {
  cells = new Map();
  saved.length = 0;
  tipped.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
};

export const draw = (tab) => {
  frames = [{ key: "root", hook: 0, kids: {} }];
  dirty = false;
  lastTree = SettingsPage({ tab, onTab() {} });
  return lastTree;
};

export const settings = (tab) => {
  fresh();
  return draw(tab);
};

export const again = draw;

export const settle = (tab) => (dirty ? draw(tab) : lastTree);

/** A real workspace as the settings surface reads it, seen by `role`; no View-as preview. */
// The workspace's facts as the settings read resolves them: the seam's alone (the bridge published them on the window
// too, as `__FACTS`, until 11 Nov 2026), read by the Business tab's rows from there (settings/business/shell.ts).
export const FACTS = {
  facts: {
    business_name: { value: "Northside Studio", source: "typed" },
    voice_line: { value: "+13055550100", source: "provisioned" },
    phone_display: { value: "+1 (305) 555-0100", source: "provisioned" },
    handoff_number: { value: null, source: "absent" },
    address: { value: null, source: "absent" },
  },
  conflicts: [],
};

/** The roster the team read answers with, where a test says no other: an owner and an operator. */
export const ROSTER = [
  { membership_id: "m-dana", email: "dana@northside.example", display_name: "Dana", role: "owner" },
  { membership_id: "m-lee", email: "lee@northside.example", display_name: "Lee", role: "operator" },
];

/**
 * A workspace as `role` reads it. Its record, roster, open invitations and policy rows are the settings surface's alone
 * (`record`, `team`, `invites`, `policies`; null is a read that failed); the rest of `over` goes on the window, where its
 * readers still are.
 */
export const workspace = (
  role,
  {
    team = ROSTER,
    invites = [],
    policies = null,
    record = {
      role,
      version: 3,
      config: {
        brain: { business_name: "Northside Studio", booking_link: "https://book.example/northside" },
        notifications: { escalation_emails: ["dana@northside.example", "desk@northside.example"] },
      },
    },
    ...over
  } = {},
) => {
  bridgeHolds({ who: { me: { email: "dana@northside.example", role, display_name: "Dana" } } });
  Object.assign(globalThis.window, {
    ...over,
  });
  // The seam's settings value beside the globals it copies (bridge/surfaces/settings.ts), for the moved panes.
  setSurfaceValue("settings", {
    settings: record,
    facts: FACTS,
    channels: null,
    templatesAll: null,
    templateUse: null,
    templateSent: null,
    policies,
    team,
    invites,
  });
  globalThis.window.ST_STORE.viewAsRole = null;
};

/** The activity bridge, answering when told to: each read waits for `answer`. */
export const feed = (people = []) => {
  const asked = [];
  const waiting = [];
  return {
    asked,
    waiting,
    list: (f) => {
      asked.push(f);
      return new Promise((resolve) => waiting.push(resolve));
    },
    people: async () => people,
  };
};

/** An answer as this tab may still hold one from before the log said names and members: `over` adds them. */
export const answer = (resolve, rows, kinds = ["message.sent", "call.ended"], over = {}) =>
  resolve({ ok: true, message: "", data: { rows, actors: {}, kinds, page: { has_more: false }, ...over } });

export const entry = (id, text) => ({
  id,
  at: "2026-09-15T14:00:00Z",
  text,
  source: "decision",
  actor_type: "human",
  actor_user_id: null,
  subject_type: null,
  subject_id: null,
});

export const rowsOn = (tree) => all(tree, (n) => n.props?.["data-testid"] === "act-row");

/* ------------------------------ Activity ------------------------------ */

/** One of the log's lists (filters.tsx): what it chooses, what it offers and the one chosen, as the page keeps them. */
export const listOf = (tree, id) => find(tree, (n) => n.props?.testid === id && Array.isArray(n.props?.options));

/** Every option a list offers, with its value and its words. */
export const optionsOf = (list) => list.props.options.map((o) => [o.value, o.label]);

/** The house's menu a list is drawn as. */
export const menuOf = (tree, id) => find(tree, (n) => n.type === MoreMenu && n.props?.testid === id);

/**
 * Pick an option of one of the log's lists, as a person does: the box opens the house's menu, and a press on the row
 * that says it picks it. The option is named by its value, as the page keeps it.
 */
export const pick = (tree, id, value) => {
  const words = listOf(tree, id).props.options.find((o) => o.value === value).label;
  press(byTestId(tree, id));
  const open = settle("activity");
  const row = find(open, (n) => n.type === "button" && n.props?.role === "menuitemradio" && textOf(n).trim() === words);
  assert.ok(row, `${id} offers "${words}"`);
  press(row);
};

/* ------------------------------- Autonomy ------------------------------- */
// The matrix's columns were the four words the mode is FILED under -- Auto, Veto,
// Ask, Never -- with the plain sentence for each hidden in a hover the phone
// cannot trigger. And the money row put a tick under one of them, which stops
// being true the moment the headings say what a mode does.

/** The autonomy pane over real policy rows, as the settings read publishes them, seen by `role`. */
export const autonomy = (rows, over = {}, role = "owner") => {
  workspace(role, { ...over, policies: { role, rows } });
  autonomyVerbs.setPolicy = async () => ({ ok: true });
  return settings("autonomy");
};

/** A record row's value, as it is read: the answer a row's act opens the others of (settings/choice-act.tsx). */
export const rowValueOf = (row) => textOf(find(row, (n) => n.props?.className === "rec-row-value"));

export const headCells = (tree) =>
  all(tree, (n) => n.props?.className === "pol-mode").map((n) => ({
    head: textOf(find(n, (k) => k.props?.className === "pol-mode-head")),
    sub: textOf(find(n, (k) => k.props?.className === "pol-mode-sub")),
  }));

/** Sets the world's `frames` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setFrames = (value) => (frames = value);

/** Sets the world's `dirty` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setDirty = (value) => (dirty = value);

/** Sets the world's `lastTree` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setLastTree = (value) => (lastTree = value);
