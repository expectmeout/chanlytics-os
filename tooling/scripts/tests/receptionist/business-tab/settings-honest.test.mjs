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
 * Run against the Settings page (surfaces/settings/frame/page.tsx) on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, formatPhoneDisplay } from "@chanlytics/contracts";
import { useStubHooks, kitPages } from "../../_legacy-react.mjs";

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
  // A surface's value through the seam (use-surface.ts): what it holds when the component draws, and, as React does, a
  // draw again when the seam says the surface moved (one subscription for the hook's place).
  useSyncExternalStore: (subscribe, snapshot) => {
    const k = slot();
    if (!cells.has(k))
      cells.set(
        k,
        subscribe(() => {
          dirty = true;
        }),
      );
    return snapshot();
  },
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
(await import("../../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
Object.assign(globalThis.window, kitPages);
useStubHooks();
for (const k of ["EmptyState", "FailedRead", "MoreMenu", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
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
  // The bridge's versioned save (inbox-verbs.ts). Without it every save returns before its checks run.
  __saveSettings: (config, version, accepted) => {
    saved.push({ config, version });
    accepted();
    return Promise.resolve({ ok: true });
  },
});
await import("./_business-parts.mjs");
// The page is the TSX module (decision 0015 step 11); it imports every pane it draws, and the panes read the settings
// read over the seam.
const { SettingsPage } = await import("../../../../../apps/dashboard/src/surfaces/settings/frame/page.tsx");
const { setSurfaceValue } = await import("../../../../../apps/dashboard/src/surfaces/surface-values.ts");
const { hearSurfaces } = await import("../../../../../apps/dashboard/src/legacy-bridge/surface-status.ts");
// The Team tab is the Partner pane's Team (settings/partner/team-card.tsx): the roster, then the workspace's partner
// card, an owner's read answered here as refused, so the card stays out of what these tests look at.
const { partnerVerbs } = await import("../../../../../apps/dashboard/src/surfaces/settings/partner/surface.ts");
partnerVerbs.team.read = async () => ({ ok: false, code: "forbidden", message: "Only an owner can do this." });
/** The seam's settings value, beside the globals it copies (legacy-bridge/surfaces/settings.ts). */
const seam = () =>
  setSurfaceValue("settings", {
    settings: globalThis.window.__SETTINGS,
    facts: globalThis.window.__FACTS ?? null,
    channels: null,
    templatesAll: null,
    templateUse: null,
    templateSent: null,
    team: globalThis.window.__TEAM ?? null,
    invites: globalThis.window.__TEAM_INVITES ?? null,
  });

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
  lastTree = SettingsPage({ tab, onTab() {} });
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
  seam();
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
  // The read lands as the bridge lays it: the globals, the seam's value, and the event, which the bridge hears as the
  // surface moving (surface-status.ts hearSurfaces), the move the card's useSurface listens for.
  seam();
  const stop = hearSurfaces([{ key: "settings", events: ["surface:settings"] }], globalThis.window);
  globalThis.window.dispatchEvent({ type: "surface:settings" });
  stop();
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
  assert.equal(textOf(current[0]).trim(), "Details");
});

// What the receptionist is told says who reads it at rest, and counts nothing there: the Business tab's own since Phase
// 5, where PromptPreview stood under it. Drawn with the sheet it opens, and the phrase following the channel last
// chosen, in business-tab-prompt.test.mjs ("what the receptionist is told says who reads it at rest, with one door,
// and counts nothing"); the phrase is contracts' PROMPT_READERS, where this file kept a hand copy of it.

/* ------------------------------ checks and removals ------------------------------ */

test("REGRESSION (S16): a check that fails does not wear the green check of success -- the checks on Settings did", () => {
  workspace();
  // The transfer number, the number it gives out and the business's own fields are rows and folds of the
  // Business page since Task 3.7: each check is said under the box it belongs to, and the toast only counts
  // them (business-tab-page.test.mjs, business-tab-open/-offer/-answers.test.mjs). What is still this pane's:
  // Who is alerted.
  // The addresses open under the email row (decision 0040).
  let tree = settings("notifications");
  press(find(tree, (n) => n.props?.["data-testid"] === "ntf-email-change"));
  tree = again("notifications");
  type(labelled(tree, "input", "Add an address to email"), "nobody");
  tree = again("notifications");
  press(buttonSaying(tree, "Add"));
  assert.match(textOf(toasts.at(-1)?.msg), /email address/);
  assert.equal(toasts.at(-1)?.tone, "warn", "the alert address check");
  // An invitation: the address that is not one is said under its box (the redesign of 9 Oct 2026), and nothing is
  // sent or toasted as sent.
  tree = settings("team");
  const before = toasts.length;
  press(buttonSaying(tree, "Invite"));
  tree = again("team");
  type(
    find(tree, (n) => n.type === "input" && n.props["data-testid"] === "team-invite-email"),
    "nobody",
  );
  tree = again("team");
  press(buttonSaying(tree, "Send invitation"));
  tree = again("team");
  assert.match(textOf(find(tree, (n) => String(n.props?.className || "").includes("field-error"))), /email address/);
  assert.equal(toasts.length, before, "no toast says it went: the invitation's address check");
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
  // This browser is a row of where alerts reach you, drawn where a browser can alert (decision 0040): no sentence points
  // at a card that the phone app's view does not draw ("This device, above" did).
  assert.ok(!alerts.includes("This device, above"), alerts);
  assert.ok(alerts.includes("Where alerts reach you"), alerts);
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

test("the tab writes a stored number for people by contracts' rule, beside the phone checks the rows already use", async () => {
  const { phoneShown } = await import("../../../../../apps/dashboard/src/surfaces/settings/business/save.tsx");
  assert.equal(phoneShown("+13055550100"), "+1 (305) 555-0100", "REGRESSION: a stored number was shown as E.164");
  assert.equal(phoneShown("+442071838750"), formatPhoneDisplay("+442071838750"), "contracts' own rule, not a copy");
  assert.equal(phoneShown("ask for Dana"), "ask for Dana", "anything but E.164 is shown as it was written");
});
