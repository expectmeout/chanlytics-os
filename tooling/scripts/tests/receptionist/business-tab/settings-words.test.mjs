/**
 * Settings and Setup say one thing about each state, and call a page by its name.
 *
 * - Texting (the wiring audit's S7): for a line that answers calls with nothing filed, Setup said "Texting is not
 *   available yet… this page will say when" while Connections said it waits on the owner's business record.
 * - A broken configuration (S8): Setup said "Open Workspace to repair them" while the Business pane said the form is
 *   closed and Chanlytics repairs it.
 * - "Workspace" (S19): links and sentences named the Business tab after its route.
 * - Autonomy's hard limits (S6): "this workspace's own values" over a reply cap and a pause nobody can change here,
 *   with the page's own copy of their defaults.
 * - The slot length (S2's remainder): a save kept it, and no field could set it.
 * - The Calendar's words (C3): the Business card said the hours as 09:00–18:00 beside a Calendar in 9 AM, and the
 *   editor checked the calendar's address as "the link", the booking link's word.
 * Contracts run as they are; settings.jsx runs on a stub React, with the words the bridge publishes (seed-globals).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { kitPages, useStubHooks } from "../../_legacy-react.mjs";

const { setupSteps, smsStateRow, connectionRows, verbForRoute, formatPhoneDisplay, stateOf } = contracts;
const NOW = Date.parse("2026-09-07T15:00:00Z");
const TID = "t-studio";

/* ------------------------------ the facts, in their real shapes ------------------------------ */

// Setup's input and a line, as setup.test.mjs builds them from the route's own shapes.
const empty = (over = {}) => ({
  business: { name: null, hours: false, services: 0, bookingLink: false, address: false, handoff: null, broken: false },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0, offers: 0 },
  requests: { line: null },
  later: [],
  ...over,
});
const facts = {
  name: "Northside Movers",
  hours: true,
  services: 4,
  bookingLink: true,
  address: true,
  handoff: "+13055550100",
  broken: false,
};
const live = (over = {}) =>
  empty({
    business: facts,
    channels: {
      whatsapp: {
        present: true,
        active: true,
        number: "+13055550123",
        quality: "GREEN",
        lastInboundAt: "2026-09-07T14:30:00Z",
      },
      voice: { present: true, active: true, number: "+13055550124", lastInboundAt: "2026-09-06T14:30:00Z" },
    },
    templates: { approved: 6, pending: 0, startersApproved: 5 },
    calendar: { state: "ok" },
    team: { members: 2, invitesOpen: 0, alertEmails: 1 },
    ...over,
  });
const lineRow = (over = {}) => ({
  id: "0f3c2a1e-1111-4222-8333-444455556666",
  e164: "+13055550124",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 305,
  voice_state: "provisioning",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: "trunk",
  last_error: null,
  state_since: "2026-09-07T14:58:00Z",
  created_at: "2026-09-07T14:57:00Z",
  ...over,
});
const withLines = (rows, ready = true) => ({
  rows,
  ready,
  provider: ready ? "twilio" : null,
  costs: { local_number_month_usd: 1.15 },
});
const row = (vm, id) => vm.rows.find((r) => r.id === id);

/* ------------------------------ the words ------------------------------ */

test("REGRESSION (S7): a line that answers calls with nothing filed says texting waits on the business record on Setup, as Connections does -- Setup said 'not available yet… this page will say when'", () => {
  const line = lineRow({ voice_state: "answering", step: null });
  const vm = setupSteps(live({ lines: withLines([line]) }), NOW);
  const setupLine = row(vm, "line");
  const connections = smsStateRow(line, NOW);
  assert.equal(
    typeof contracts.TEXTING_NEEDS_RECORD_SENTENCE,
    "string",
    "REGRESSION: the two pages had no sentence in common",
  );
  assert.equal(connections.sentence, contracts.TEXTING_NEEDS_RECORD_SENTENCE, "Connections says the shared sentence");
  const opening = "Texting needs your business on record for the carriers";
  assert.ok(connections.sentence.startsWith(opening));
  assert.ok(setupLine.sentence.includes(opening), `REGRESSION: ${setupLine.sentence}`);
  assert.ok(vm.readiness.sentence.includes(opening), `and Setup's top line: ${vm.readiness.sentence}`);
  const said = JSON.stringify(setupLine);
  assert.ok(
    !said.includes("Texting is not available yet"),
    "REGRESSION: 'not available' about something waiting on the owner",
  );
  assert.ok(
    !said.includes("this page will say when"),
    "REGRESSION: a promise to wait for something that waits on the owner",
  );
  assert.match(setupLine.sentence, /Connections/, "and it says where the form is");
  // A line with no voice yet has nothing to fill in for: its words are its own.
  assert.equal(contracts.textingWords(null).sentence, "Texting is not available yet.");
});

test("REGRESSION (S8): a broken configuration is said once, the same on Setup and on Business -- Setup said 'Open Workspace to repair them', Business that Chanlytics repairs it", () => {
  const W = contracts.BROKEN_CONFIG_WORDS;
  assert.ok(
    W && typeof W.clause === "string" && typeof W.title === "string" && typeof W.body === "string",
    "REGRESSION: each page wrote its own",
  );
  const vm = setupSteps(empty({ business: { ...empty().business, broken: true } }), NOW);
  const f = row(vm, "facts");
  assert.equal(f.sentence, W.clause);
  assert.match(f.sentence, /could not be read/);
  assert.match(f.sentence, /Chanlytics/, "who repairs it");
  assert.ok(
    !/repair them before anything else|Open Workspace/.test(JSON.stringify(f)),
    "REGRESSION: the owner was sent to repair what only Chanlytics can",
  );
  assert.deepEqual(
    f.verb,
    { label: W.ask, to: "verb:request-repair" },
    "the owner's one move is the ask for a repair (S8); once asked, the row opens the page that lists what is wrong",
  );
  assert.match(W.body, /Chanlytics has to repair it/);
});

test("REGRESSION (S19): nothing names the Business tab 'Workspace' -- Setup's rows, Connections' calendar row and the bell's verb did", () => {
  const vms = [
    setupSteps(empty(), NOW),
    setupSteps(empty({ business: { ...facts, hours: false, services: 0 } }), NOW),
    setupSteps(live(), NOW),
    setupSteps(empty({ business: { ...empty().business, broken: true } }), NOW),
    setupSteps(empty({ calendar: { state: "unavailable", problem: "The calendar answered 404." } }), NOW),
  ];
  const conn = connectionRows(
    {
      channels: [],
      whatsapp: null,
      lines: { rows: [], ready: false },
      lineRequestedAt: null,
      google: null,
      calendar: { state: "unavailable" },
    },
    NOW,
  );
  const said = JSON.stringify([vms, conn]);
  assert.ok(
    !/\b(in|Open) Workspace\b/.test(said),
    `REGRESSION: ${said.match(/[^"]*\b(in|Open) Workspace\b[^"]*/)?.[0]}`,
  );
  assert.equal(row(vms[0], "facts").verb.label, "Start in Business");
  assert.equal(row(vms[1], "facts").verb.label, "Finish in Business");
  assert.equal(row(vms[2], "facts").verb.label, "Edit in Business");
  assert.match(row(vms[4], "calendar").sentence, /Check the address in Settings › Business\.$/);
  assert.equal(verbForRoute("admin/workspace"), "Open Business", "and the bell's verb for that page");
});

test("REGRESSION (S6): the hard limits say which two never change and which two are the owner's to set, from one home for their defaults -- the card called the last two Chanlytics' and nothing could change them", async () => {
  assert.equal(contracts.REPLY_CAP_DEFAULT, 20, "REGRESSION: the defaults lived in the page and the runtime, apart");
  assert.equal(contracts.PAUSE_HOURS_DEFAULT, 24);
  const steps = await import("../../../../../packages/core/src/inbound/steps.ts");
  assert.equal(
    steps.MAX_REPLIES_PER_DAY,
    contracts.REPLY_CAP_DEFAULT,
    "the receptionist stops at the number the page says",
  );
  assert.equal(
    contracts.pauseMsOf(null),
    contracts.PAUSE_HOURS_DEFAULT * 3600 * 1000,
    "and pauses for the hours it says",
  );
  const H = contracts.hardLimitsWords;
  assert.equal(typeof H, "function");
  const stored = H({ max_replies_day: 12, pause_hours: 48 });
  assert.ok(!/own values|can't be changed here|set by Chanlytics/.test(stored.sub), `REGRESSION: ${stored.sub}`);
  assert.match(stored.sub, /yours to set/);
  assert.deepEqual([stored.cap, stored.hours], [12, 48], "a stored value is the value the dial shows");
  const unset = H({});
  assert.deepEqual([unset.cap, unset.hours], [20, 24], "an unset one is the default");
  assert.match(unset.replies, /20 is the default/);
  assert.match(unset.pause, /24 hours is the default/);
  assert.deepEqual(H(null), unset);
});

/* ------------------------------ the page, on a stub React ------------------------------ */

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
// What the bridge publishes before the pages run: the phone checks, the broken-config words, the hard limits' words.
await import("../../../../../apps/dashboard/src/legacy-bridge/seed-globals.ts");

let cells = new Map();
let frames = [];
let lastTree = null;
const slot = () => {
  const f = frames[frames.length - 1];
  return `${f.key}#${f.hook++}`;
};
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
await import("../../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
Object.assign(globalThis.window, kitPages);
useStubHooks();
for (const k of ["EmptyState", "FailedRead", "MoreMenu", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
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
  __receptionistDefaults: () => ({
    system_prompt: "You answer for Northside Studio.",
    fallbacks: { greeting: "Hello", error: "Sorry", non_text: "Text, please" },
  }),
  __instructionsDraft: contracts.instructionsDraft,
  __instructionsMax: contracts.INSTRUCTIONS_MAX,
  __fallbackMessages: contracts.fallbackMessages,
  __fallbackDefaults: contracts.FALLBACK_DEFAULTS,
  __unknownDetails: contracts.unknownDetails,
  __hoursLines: contracts.hoursLines,
});
await import("../../../../../apps/dashboard/src/legacy/pages/business-tab-save.jsx");
// How it answers owns the languages the old form offers and its three messages' labels, which settings.jsx reads as
// it loads (business-tab-answers.jsx, before it in both load lists).
await import("../../../../../apps/dashboard/src/legacy/pages/business-tab-answers.jsx");
await import("../../../../../apps/dashboard/src/legacy/pages/settings.jsx");

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
const classed = (tree, cls) =>
  find(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes(cls),
  );
const buttonSaying = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const fresh = () => {
  cells = new Map();
  saved.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
};
const draw = (tab) => {
  frames = [{ key: "root", hook: 0, kids: {} }];
  lastTree = globalThis.window.SettingsPage({ tab, onTab() {} });
  return lastTree;
};
const settings = (tab) => {
  fresh();
  return draw(tab);
};

/** A workspace on the settings surface, in its real shape; `rules` are its stored booking rules. */
const workspace = (over = {}, rules = {}) => {
  Object.assign(globalThis.window, {
    __ME: { email: "dana@northside.example", role: "owner", display_name: "Dana" },
    __SETTINGS: {
      role: "owner",
      version: 4,
      config: {
        brain: {
          business_name: "Northside Studio",
          booking_link: "https://book.example/northside",
          system_prompt: "You answer for Northside Studio.",
          profile: { booking_rules: rules },
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
    ...over,
  });
};

test("REGRESSION (S8): the Business pane's broken card says the words Setup's row says, from the bridge", () => {
  const W = globalThis.window.__brokenConfigWords;
  assert.ok(W && W.title && W.body, "REGRESSION: the bridge published no shared words");
  // The words by value; the once-asked sentence by what it says, since the bridge and this file may hold contracts apart.
  const { requested, ...words } = W;
  const { requested: ownRequested, ...ownWords } = contracts.BROKEN_CONFIG_WORDS;
  assert.deepEqual(words, ownWords, "contracts' own");
  assert.equal(
    requested("2026-09-07T13:00:00Z", NOW),
    ownRequested("2026-09-07T13:00:00Z", NOW),
    "and the same sentence once a repair is asked for",
  );
  workspace({
    __SETTINGS: { role: "owner", version: 4, config: {}, broken: { issues: ["brain.business_name must be text"] } },
  });
  const card = byTestId(settings("workspace"), "settings-broken");
  assert.ok(card, "the broken card is drawn");
  assert.equal(textOf(classed(card, "empty-title")), W.title);
  assert.ok(textOf(classed(card, "empty-body")).startsWith(W.body), textOf(classed(card, "empty-body")));
});

test("REGRESSION (S8): the broken card asks for the repair from the card, then says when it was asked -- it said Chanlytics repairs it, with no way to ask", async () => {
  const W = globalThis.window.__brokenConfigWords;
  const asks = [];
  const broken = { role: "owner", version: 4, config: {}, broken: { issues: ["brain.business_name must be text"] } };
  workspace({
    __SETTINGS: broken,
    __SETUP: { dto: { requests: { line: null } } },
    __setup: {
      request: async (what) => {
        asks.push(what);
        return { ok: true, already: false, message: "" };
      },
      refresh: async () => {},
    },
  });
  let tree = settings("workspace");
  const ask = byTestId(tree, "settings-broken-ask");
  assert.ok(ask, "REGRESSION: no way to ask");
  assert.equal(textOf(ask).trim(), W.ask);
  press(ask);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(asks, ["repair"]);
  workspace({ __SETTINGS: broken, __SETUP: { dto: { requests: { line: null, repair: "2026-09-07T13:00:00Z" } } } });
  tree = settings("workspace");
  assert.equal(byTestId(tree, "settings-broken-ask"), null, "asked once");
  assert.match(textOf(byTestId(tree, "settings-broken-requested")), /a person at Chanlytics will repair/);
});

test("REGRESSION (S19): the AI memory pane points at Business by name -- it said 'Open Workspace'", () => {
  workspace();
  const tree = settings("memory");
  assert.ok(buttonSaying(tree, "Open Business"), "REGRESSION: the button named the route, not the page");
  assert.ok(!textOf(tree).includes("Workspace:"), "nor does the sentence");
  // And it names what Business holds in the tab's own row names (spec §10): "notes" and "extra instructions" are
  // nothing an owner finds there.
  assert.ok(!/extra instructions|\bnotes\b/.test(textOf(tree)), "REGRESSION: words the Business tab no longer says");
  assert.match(textOf(tree), /things it should know/);
  assert.match(textOf(tree), /in your own words/);
});

test("REGRESSION (S6): the reply cap and the pause are dials on the Hard limits card, in the bridge's words -- the card listed values nothing on the page could change", () => {
  workspace();
  assert.equal(
    typeof globalThis.window.__hardLimits,
    "function",
    "REGRESSION: the page kept its own words and its own defaults",
  );
  const calls = [];
  Object.assign(globalThis.window, {
    __POLICIES: [],
    __setPolicy: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
    POLICY: {
      ...globalThis.window.POLICY,
      MODES: ["Auto", "Veto", "Ask", "Never"],
      ROWS: [
        {
          id: "reply",
          cls: "reply",
          label: "Replies to customers",
          note: "",
          locked: false,
          modes: ["Auto", "Veto", "Ask"],
          mode: "Auto",
          hints: {},
          limits: { reply_delay_ms: 30000, pause_hours: 48 },
        },
      ],
    },
  });
  const tree = settings("autonomy");
  const text = textOf(tree);
  const H = contracts.hardLimitsWords({ reply_delay_ms: 30000, pause_hours: 48 });
  assert.ok(!/own values|can't be changed here/.test(text), "REGRESSION: the card said nothing here could change them");
  assert.ok(text.includes(H.sub) && text.includes(H.replies) && text.includes(H.pause), text.slice(-600));
  const cap = byTestId(tree, "aut-reply-cap");
  const pause = byTestId(tree, "aut-pause");
  assert.ok(cap && pause, "REGRESSION: no dial for either limit");
  const active = (group) =>
    all(group, (n) => n.type === "button" && String(n.props.className).split(" ").includes("active")).map((n) =>
      textOf(n),
    );
  assert.deepEqual(active(cap), ["20"], "an unset cap shows the default");
  assert.deepEqual(active(pause), ["48h"], "a stored pause shows as stored, even off the usual steps");
  press(find(cap, (n) => n.type === "button" && textOf(n) === "40"));
  assert.deepEqual(calls.at(-1), ["reply", undefined, { maxRepliesDay: 40 }], "only the cap travels, and no mode");
  press(find(pause, (n) => n.type === "button" && textOf(n) === "4h"));
  assert.deepEqual(calls.at(-1), ["reply", undefined, { pauseHours: 4 }], "only the pause travels, and no mode");
});

// REGRESSION (S2): the slot length can be set from the Business editor -- a save kept it, and no field could
// change it. It is a box of the Business page's *Booking rules* fold now, which patches only the rules it renders
// and keeps the rest of what is stored: business-tab-offer.test.mjs types it, and business-tab-folds.test.mjs
// saves the fold over a record carrying a rule no fold draws.

// REGRESSION (C3): the Business card says the hours in the Calendar's clock -- it said 'Mon–Fri 09:00–18:00'
// beside a Calendar in 9 AM. The card is the Business page's *When you're open*, whose summary is the composer's
// own run-collapsing through the bridge (business-tab-open.test.mjs, "the summary sentence is the one the composer
// wrote"); one-hours-algorithm.test.mjs holds it to the one implementation. The editor's "Check the address"
// button went with the form: the calendar row states its last read instead, and says a read that failed with its
// Retry (the spec's When you're open; business-tab-open.test.mjs draws both).

test("a settings control is named by the row it sits in: what the row hands it lands on its element, and what the control takes for itself does not", () => {
  // SetRow mints an id for its label and hands it to its control as aria-labelledby. The switch and the dials each
  // take their own props and give the rest to their element -- spelled out with window.propsWithout, because in the
  // standalone harness an object rest's excluded keys are a `var _excluded` every file shares, and one loaded later
  // put another file's keys in force (legacy-harness.test.mjs). This stub draws a component when it is created, before
  // the row clones it; the row's clone is drawn here, as React draws it.
  workspace();
  const wasGate = globalThis.window.gate;
  // A gate that can be told apart from nothing, so where it lands shows.
  globalThis.window.gate = () => ({ "data-gated": "" });
  /** The element a control draws: a dial on a desk draws the choice of a few, which draws the group. */
  const element = (drawn) => (typeof drawn.type === "function" ? element(drawn.rendered) : drawn);
  const controls = (tab, name) =>
    all(settings(tab), (n) => n.type?.name === "SetRow").flatMap((row) => {
      const label = find(row.rendered, (n) => n.props?.className === "set-row-label")?.props.id;
      return all(row.rendered, (n) => n.type?.name === name).map((clone) => ({
        label,
        drawn: element(clone.type(clone.props)),
      }));
    });
  try {
    // The switches are the mockup's Notifications, drawn where no workspace's settings were read.
    workspace({ __SETTINGS: undefined });
    const switches = controls("notifications", "SetToggle");
    workspace();
    assert.ok(switches.length >= 6, `the switches on Notifications: ${switches.length}`);
    for (const { label, drawn } of switches) {
      assert.equal(drawn.props.role, "switch");
      assert.equal(drawn.props["aria-labelledby"], label, "a switch is announced by its row's words");
      assert.ok(!("on" in drawn.props) && !("onChange" in drawn.props), "and its button never carries on or onChange");
    }

    const dials = controls("autonomy", "SetDial");
    assert.ok(dials.length > 0, "the autonomy pane's dials");
    for (const { label, drawn } of dials) {
      assert.equal(drawn.props.role, "group");
      assert.equal(drawn.props["aria-labelledby"], label, "a dial is announced by its row's words");
      for (const own of ["value", "options", "onChange", "gate", "phone", "label", "data-gated"])
        assert.ok(!(own in drawn.props), `the group never carries ${own}`);
      const options = all(drawn, (n) => n.type === "button");
      assert.ok(options.length && options.every((b) => "data-gated" in b.props), "the gate is on every option instead");
    }
    assert.deepEqual(
      dials.map(({ drawn }) => drawn.props["data-testid"]).filter(Boolean),
      ["aut-reply-cap", "aut-pause"],
      "a test id handed to a dial lands on its group",
    );
  } finally {
    globalThis.window.gate = wasGate;
  }
});
