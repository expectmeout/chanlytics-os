/**
 * Settings hears its own refresh, and says each thing once, truly.
 *
 * - The Business card and the Team card never heard the settings surface re-read: after a save the card drew the
 *   values from before, and an invite, a role change or a removal toasted success over a roster that did not change
 *   (the interface audit's D7, the wiring audit's S11 and S18).
 * - The workspace's timezone could not be reached until a receptionist existed, though nothing about it needs one
 *   (S13); the numbers on Business were raw E.164 where Setup formats them (L7); the Settings rail marked the page it
 *   was on for the eye only (S24).
 * - A failed check wore the green check of success (S16); removing a service or a note had no Undo, where a shift
 *   and a closure had one (S18).
 * - A card titled "This device" held a sign-out that ends every session, and the alerts pane said push alerts were
 *   not built beside the bell's own device alerts (S20).
 * Run against settings.jsx on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stateOf,
  whyNotAHandoff,
  whyNotAPhone,
  samePhone,
  handoffE164,
  formatPhoneDisplay,
  instructionsDraft,
  INSTRUCTIONS_MAX,
  fallbackMessages,
  FALLBACK_DEFAULTS,
  unknownDetails,
} from "@chanlytics/contracts";

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
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: TID,
};

/* ------------------------------ a stub React ------------------------------ */

// Hooks are kept per component the way React keeps them, by the component's place in the tree and its type: a pane
// that swaps its card for its editor must not hand the editor the card's state. A setter marks the page changed, so
// `settle` draws again only when something the page holds did -- what React would show after an event.
let cells = new Map();
let frames = [];
let dirty = false;
let lastTree = null;
const slot = () => {
  const f = frames[frames.length - 1];
  return `${f.key}#${f.hook++}`;
};
const went = [];
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
  useMemo: (fn) => {
    slot();
    return fn();
  },
  useCallback: (fn) => {
    slot();
    return fn;
  },
  useId: () => `id-${slot()}`,
  // SetRow names its control from the row: the three calls it makes, over this stub's nodes.
  Children: { map: (kids, fn) => (kids == null ? kids : [].concat(kids).flat(Infinity).map(fn)) },
  isValidElement: (n) => !!n && typeof n === "object" && "type" in n && "props" in n,
  cloneElement: (el, props) => ({ ...el, props: { ...el.props, ...props } }),
  // An effect runs when its inputs change, after its last cleanup, the way React runs it; with no inputs, on every draw.
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
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["EmptyState", "FailedRead", "MoreMenu", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  __chrome: { state: stateOf },
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner can ${doing}.`,
  canDo: () => true,
  // As the bridge publishes them (seed-globals.ts): the phone checks and a number's written form are contracts'.
  __whyNotAHandoff: whyNotAHandoff,
  __whyNotAPhone: whyNotAPhone,
  __samePhone: samePhone,
  __handoffE164: handoffE164,
  __phoneDisplay: formatPhoneDisplay,
  __identity: {
    member: ({ email, display_name }) => ({ name: display_name || email, sub: display_name ? email : null }),
    initials: (name, email) =>
      String(name || email)
        .slice(0, 2)
        .toUpperCase(),
    words: (me) => ({ name: me.display_name || me.email, email: me.email }),
  },
  __inviteState: () => ({ expired: false, words: "invite pending" }),
  // The bridge's versioned save (inbox-verbs.ts). Without it every save returns before its checks run.
  __saveSettings: (config, version, accepted) => {
    saved.push({ config, version });
    accepted();
    return Promise.resolve({ ok: true });
  },
  // What the instructions box opens with and the most it holds, as the bridge publishes them (S4).
  __instructionsDraft: instructionsDraft,
  __instructionsMax: INSTRUCTIONS_MAX,
  // And the messages sent in the business's name, as the form previews and checks them (S5).
  __fallbackMessages: fallbackMessages,
  __fallbackDefaults: FALLBACK_DEFAULTS,
  __unknownDetails: unknownDetails,
});
await import("../../../apps/dashboard/src/legacy/pages/business-tab-save.jsx");
// How it answers owns the languages the old form offers and its three messages' labels, which settings.jsx reads as
// it loads (business-tab-answers.jsx, before it in both load lists).
await import("../../../apps/dashboard/src/legacy/pages/business-tab-answers.jsx");
await import("../../../apps/dashboard/src/legacy/pages/settings.jsx");

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
// A drawn component is walked twice, as the children it was given and as what it rendered: each node counts once.
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
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const buttonSaying = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const labelled = (tree, tag, label) => find(tree, (n) => n.type === tag && n.props["aria-label"] === label);
const press = (node) => node.props.onClick({ stopPropagation() {}, preventDefault() {} });
const type = (node, value) => node.props.onChange({ target: { value } });
const fresh = () => {
  cells = new Map();
  went.length = 0;
  toasts.length = 0;
  saved.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
};
const draw = (tab) => {
  frames = [{ key: "root", hook: 0, kids: {} }];
  dirty = false;
  lastTree = globalThis.window.SettingsPage({ tab, onTab() {} });
  return lastTree;
};
const settings = (tab) => {
  fresh();
  return draw(tab);
};
const again = draw;
const settle = (tab) => (dirty ? draw(tab) : lastTree);

/**
 * A real workspace, in the shapes the settings surface reads (surface-data.ts, contracts facts.ts): the facts resolve
 * the line it answers as E.164, the number it gives out as the line written for people, and the transfer number as
 * stored; a roster of two; no open invitation.
 */
const workspace = (over = {}) => {
  Object.assign(globalThis.window, {
    __ME: { email: "owner@northside.example", role: "owner", display_name: "Dana" },
    __SETTINGS: {
      role: "owner",
      version: 3,
      config: {
        brain: {
          business_name: "Northside Studio",
          booking_link: "https://book.example/northside",
          profile: {
            handoff_number: "+17865550182",
            services: [{ name: "Cut", duration_min: 45 }, { name: "Color" }],
            notes: [{ title: "Parking", text: "Behind the building." }],
          },
        },
        notifications: { escalation_emails: ["owner@northside.example"] },
      },
    },
    __FACTS: {
      facts: {
        business_name: { value: "Northside Studio", source: "typed" },
        voice_line: { value: "+13055550100", source: "provisioned" },
        phone_display: { value: formatPhoneDisplay("+13055550100"), source: "provisioned" },
        handoff_number: { value: "+17865550182", source: "typed" },
        address: { value: null, source: "absent" },
      },
      conflicts: [],
    },
    __TEAM: [
      { membershipId: "m-dana", email: "owner@northside.example", displayName: "Dana", role: "owner" },
      { membershipId: "m-lee", email: "lee@northside.example", displayName: "Lee", role: "operator" },
    ],
    __TEAM_INVITES: [],
    ...over,
  });
};

/* ------------------------------ the refresh ------------------------------ */

// REGRESSION (D7, S18): the Business card draws again when the settings surface is re-read -- after a save it
// kept the values from before. The card is the Business page since Task 3.7, and it hears the read itself:
// business-tab-open.test.mjs, "the page draws itself again when the settings surface is read again".

test("REGRESSION (D7, S11): the Team card draws again when the settings surface is re-read -- an invitation just sent was not on it", () => {
  workspace();
  settings("team");
  globalThis.window.__TEAM_INVITES = [
    { id: "inv-sam", email: "sam@northside.example", role: "viewer", expires_at: "2026-09-22T12:00:00Z" },
  ];
  globalThis.window.dispatchEvent({ type: "surface:settings" });
  const tree = settle("team");
  assert.ok(textOf(tree).includes("sam@northside.example"), "REGRESSION: the roster on screen did not change");
});

/* ------------------------------ what Business shows ------------------------------ */

// REGRESSION (S13): the timezone can be set before the receptionist exists -- it waited for one it does not
// depend on. The card a workspace with no receptionist sees draws When you're open's own timezone row under the
// empty state: business-tab-create.test.mjs, "a workspace with no receptionist is told so...".

// REGRESSION (L7): Business writes numbers the way Setup does -- it showed +13055550100 and +17865550182. The
// three numbers are three rows of the Business page, each stating a number the way people write it and opening
// its editor on the same: business-tab-page.test.mjs presses every one of them.

// REGRESSION (L7): setting up the receptionist names the line the same way -- the create form showed
// +13055550100. business-tab-create.test.mjs, "the line it answers on is named the way people write it".

test("REGRESSION (S24): the Settings rail says which page is open -- only its colour did", () => {
  workspace();
  const tree = settings("workspace");
  const rows = all(tree, (n) => n.type === "button" && String(n.props?.className || "").includes("set-nav-row"));
  assert.ok(rows.length > 3, "the rail is drawn");
  const current = rows.filter((r) => r.props["aria-current"] === "page");
  assert.equal(current.length, 1, "REGRESSION: no row said it was the page on screen");
  assert.equal(textOf(current[0]).trim(), "Business");
});

/* ------------------------------ checks and removals ------------------------------ */

test("REGRESSION (S16): a check that fails does not wear the green check of success -- the checks on Settings did", () => {
  workspace();
  // The transfer number, the number it gives out and the business's own fields are rows and folds of the
  // Business page since Task 3.7: each check is said under the box it belongs to, and the toast only counts
  // them (business-tab-page.test.mjs, business-tab-open/-offer/-answers.test.mjs). What is still this pane's:
  // Who is alerted.
  let tree = settings("notifications");
  type(labelled(tree, "input", "Add an address to alert"), "nobody");
  tree = again("notifications");
  press(buttonSaying(tree, "Add"));
  assert.match(textOf(toasts.at(-1)?.msg), /email address/);
  assert.equal(toasts.at(-1)?.tone, "warn", "the alert address check");
  // An invitation.
  tree = settings("team");
  press(buttonSaying(tree, "Invite"));
  tree = again("team");
  type(
    find(tree, (n) => n.type === "input" && n.props.type === "email"),
    "nobody",
  );
  tree = again("team");
  press(buttonSaying(tree, "Send invite"));
  assert.match(textOf(toasts.at(-1)?.msg), /email/);
  assert.equal(toasts.at(-1)?.tone, "warn", "the invitation's address check");
});

// REGRESSION (S18): removing a service or a note can be undone, as a shift and a closure can -- it could not.
// The services are a sheet and the notes a fold of the Business page now, and every list in one has the same
// Undo, at its own index and only once: business-tab-offer.test.mjs and business-tab-answers.test.mjs.

/* ------------------------------ words, and seats ------------------------------ */

test("REGRESSION (S20): Profile's sign-out is not titled for one device, and Alerts does not deny the bell's device alerts", () => {
  workspace();
  const profile = textOf(settings("profile"));
  assert.ok(!profile.includes("This device"), "REGRESSION: 'This device' over a sign-out that ends every session");
  assert.ok(profile.includes("Sign out everywhere"), profile);
  const alerts = textOf(settings("notifications"));
  assert.ok(!alerts.includes("push notifications are not built"), "REGRESSION: denied the alerts the bell offers");
  assert.ok(alerts.includes("switch alerts on from the bell"), alerts);
});

test("a real roster is counted in people, never in seats of a plan it does not have, and Invite stays offered", () => {
  workspace({
    __TEAM: ["ana", "bo", "cy", "di", "ed", "flo"].map((n, i) => ({
      membershipId: `m-${n}`,
      email: `${n}@northside.example`,
      displayName: "",
      role: i ? "viewer" : "owner",
    })),
    __ME: { email: "ana@northside.example", role: "owner", display_name: "" },
  });
  const tree = settings("team");
  assert.ok(textOf(tree).includes("6 people"), "six members, more than the mockup's five seats");
  assert.ok(!textOf(tree).includes("seats"), "no seat plan is invented");
  assert.ok(buttonSaying(tree, "Invite"), "and nothing says the seats are full");
});

test("the bridge publishes a number's written form from contracts, beside the phone checks the rows already use", async () => {
  const stub = globalThis.window.__phoneDisplay;
  delete globalThis.window.__phoneDisplay;
  try {
    await import("../../../apps/dashboard/src/legacy-bridge/seed-globals.ts");
    assert.equal(
      typeof globalThis.window.__phoneDisplay,
      "function",
      "REGRESSION: the page had no way to write a stored number for people",
    );
    assert.equal(globalThis.window.__phoneDisplay("+13055550100"), "+1 (305) 555-0100");
    assert.equal(
      globalThis.window.__phoneDisplay("+442071838750"),
      formatPhoneDisplay("+442071838750"),
      "contracts' own rule, not a copy",
    );
  } finally {
    globalThis.window.__phoneDisplay = stub;
  }
});
