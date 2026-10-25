/**
 * The first run's page (/start), drawn without a browser: the world its three page suites share
 * (first-run-page.test.mjs: the frame, Your business, Your receptionist and Rehearse; first-run-channels-page.test.mjs:
 * Where it answers; first-run-golive-page.test.mjs: Go live). The steps and every word are contracts' (first-run.ts and
 * its step modules); the page runs for real under a stub React -- the TSX page (surfaces/setup/first-run/page.tsx,
 * decision 0015 step 10) with the Setup rows it draws (surfaces/setup/rows) imported beside it, as the app imports them.
 *
 * What the page reads is the seam's, typed: Setup, the settings read and Live through `useSurface` (so a test sets them
 * with `setSurfaceValue`, never by assigning a window global, which is only the seam's mirror), and Setup's verbs through
 * the module object `setupVerbs` (surfaces/setup/surface.ts), which a test stubs by assigning onto it. The tab's drafts are
 * `tabMemoryFor(window)` over the window's sessionStorage, keyed by the workspace in the address. What still comes off the
 * window is the shell's: Google and Stripe's doors, the Business tab's saver, the role gate and the toast.
 */
import assert from "node:assert/strict";
import { setupSteps, RECEPTIONIST_MET, REHEARSE_SKIPPED } from "@chanlytics/contracts";
import { hookFrames } from "../_hook-frames.mjs";
import { useStubHooks } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";

export const NOW = Date.parse("2026-09-07T15:00:00Z");
export const blank = {
  business: {
    name: null,
    hours: false,
    services: 0,
    bookingLink: false,
    address: false,
    handoff: null,
    broken: false,
    receptionist: "none",
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
};
export const withFacts = {
  ...blank,
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 2,
    bookingLink: true,
    address: true,
    handoff: null,
    broken: false,
    receptionist: "set",
  },
};
export const answering = {
  ...withFacts,
  channels: {
    ...blank.channels,
    voice: { present: true, active: true, number: "+13055550123", lastInboundAt: "2026-09-07T14:00:00Z" },
  },
  calendar: { state: "ok" },
};
/** The member's own marks past Your receptionist and Rehearse (decision 0073): the first run's later steps are reached. */
export const MET = [RECEPTIONIST_MET, REHEARSE_SKIPPED];
/**
 * Setup's read as the seam holds it (surfaces/setup/surface.ts `publish`): the dto, the member's put-off rows, the number
 * they chose at Where it answers and what else they chose, and the view model over all of them.
 */
export const surface = (dto, { later = [], want = null, choices = { whatsapp: null } } = {}) => ({
  dto,
  role: "owner",
  later,
  want,
  choices,
  vm: setupSteps({ ...dto, later, want, choices }, NOW),
  fetchedAt: NOW,
});

/* ---- the window the page draws in ---- */
export const went = [];
export const replaced = [];
export const store = {};
/** What the page asked of Setup's read and of the first receptionist, and what the route answers next (made, unless a test says). */
export const asks = { refreshed: 0, receptionist: [], receptionistSays: null };
// The stub React's element: a TSX module draws elements as it loads (a constant sentence is a fragment), so it is in place
// before any of them is imported; mount() adds the hooks.
const frames = hookFrames();
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
};
globalThis.window = {
  // The address names the workspace the tab's drafts are kept for (tab-memory.ts: /w/<slug>/...).
  location: { hash: "#/start", pathname: "/w/harbor/start", search: "" },
  sessionStorage: {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = String(v);
    },
    removeItem: (k) => {
      delete store[k];
    },
  },
  __WORKSPACES: [{ id: "w1", name: "Harbor Moving", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "w1",
  __DEMO_MODE: false,
  usePPToast: () => [null, () => {}],
  appNavigate: () => {},
  canDo: () => true,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
};
globalThis.document ??= {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.ReactDOM ??= { createPortal: (node) => node };
// The shell's role gate, refusal toast and the rest of what a surface still asks of it by name (legacy-verbs.ts).
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
// frame-globals publishes the shell's toast hook; this harness keeps its own, which remembers what was said.
export const flashes = [];
globalThis.window.usePPToast = () => [null, (m) => flashes.push(m)];

// The page, the seam's store, Setup's verbs and the tab's memory: one instance of each, the one the page itself imports.
const { FirstRun } = await importSrc("apps/dashboard/src/surfaces/setup/first-run/page.tsx");
const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
export const { setupVerbs } = await importSrc("apps/dashboard/src/surfaces/setup/surface.ts");
// The Business tab's saver, as the first run imports it (setup/shell.ts): a world stubs its sends in place.
export const { businessTabSave } = await importSrc("apps/dashboard/src/surfaces/settings/business/saver.ts");
export const tabSaver = { save: businessTabSave.saver.save, base: businessTabSave.saver.base };
const { tabMemoryFor, clearTabMemory } = await importSrc("apps/dashboard/src/legacy-bridge/tab-memory.ts");

/** Setup's read as the page draws it: a value, undefined while it is read, null where it failed. */
export const setSetup = (value) => setSurfaceValue("setup", value);
/** The settings read as the page draws it (`settings` is what the Business tab holds, `facts` the resolved numbers), or none. */
export const setSettings = (settings, facts = null) =>
  setSurfaceValue(
    "settings",
    settings
      ? { settings, facts, channels: null, templatesAll: null, templateUse: null, templateSent: null }
      : undefined,
  );
/** The Live page's calls as the page draws them, or none. */
export const setLive = (live) => setSurfaceValue("live", live);

// Setup's verbs are the module's own object, stubbed by assigning onto it (the `lines`, `request` and `forwarding` a test
// needs are set by its world, and `window.__setup` is the same object, so a test reads and sets them there). Finish on
// Live switches calls on by `activate`: a stub that is always ready, which the tests that prove it replace and put back.
export const readyActivate = async () => ({ ok: true, message: "" });
export const readyLater = async () => ({ ok: true, message: "" });
Object.assign(setupVerbs, {
  refresh: async () => {
    asks.refreshed += 1;
  },
  later: readyLater,
  receptionist: async () => {
    asks.receptionist.push(1);
    return asks.receptionistSays ?? { ok: true, wrote: true, message: "" };
  },
  makeAgent: async () => ({ made: true }),
  peek: async () => {},
  activate: readyActivate,
});
globalThis.window.__setup = setupVerbs;
// The billing verbs are the module's object too (surfaces/settings/billing/surface.ts), which `__billing` is: a world
// stubs Stripe by assigning onto it.
export const { billingVerbs, installBilling } = await importSrc(
  "apps/dashboard/src/surfaces/settings/billing/surface.ts",
);
installBilling(globalThis.window);
// And Google's (legacy-bridge/google.ts `googleVerbs`), which Find and Connect it to Google import: a world stubs Google
// by assigning onto it. Nothing came back from Google unless a test says.
export const { googleVerbs } = await importSrc("apps/dashboard/src/legacy-bridge/google.ts");
googleVerbs.outcome = () => null;
// The tab's drafts, read and written through the window's sessionStorage, where the page reads them.
globalThis.window.__tabMemory = tabMemoryFor(globalThis.window);

/* ---- a stub React: the Setup page test's, with this page as the one drawn ---- */
/** The address's step (`start/<param>`), or null for the bare address. */
export const page = { param: null };
// A step move replaces the address (the shell's navigate with { replace: true }); a way out is a new entry.
const Page = () =>
  FirstRun({ param: page.param, onNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to) });
let cells = [];
/** A new mount: every hook's cell empty, as a page opened again. */
export const fresh = () => {
  cells = [];
};
export function mount() {
  return mountWith(Page);
}
/** Any component drawn under the stub React, as the page is (Today's Brought in draws the first run's lines). */
export function mountWith(Component, props = {}) {
  Object.assign(globalThis.React, {
    useMemo: (fn) => {
      const k = frames.key();
      if (!(k in cells)) cells[k] = fn();
      return cells[k];
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
    useCallback: (fn) => fn,
    // The seam's hook (use-surface.ts) reads the store as it stands: this stub draws when a test asks, not on a notice.
    useSyncExternalStore: (subscribe, snapshot) => snapshot(),
    useId: () => {
      const k = frames.key();
      if (!(k in cells)) cells[k] = `:r${k}:`;
      return cells[k];
    },
    useRef: (init) => {
      const k = frames.key();
      if (!(k in cells)) cells[k] = { current: init };
      return cells[k];
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
    useEffect: (fn) => {
      const k = frames.key();
      if (!(k in cells)) {
        cells[k] = true;
        fn();
      }
    },
  });
  useStubHooks();
  frames.begin();
  return Component(props);
}
/** The page opened at an address (null: the bare one), freshly mounted. */
export const open = (param = null) => {
  page.param = param;
  fresh();
  return mount();
};
export const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
export const byTestId = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
/** Every node a test id names (a list drawn twice, a row per item). */
export const allByTestId = (tree, id) => {
  const out = [];
  walk(tree, (n) => {
    if (n.props?.["data-testid"] === id) out.push(n);
  });
  return out;
};
export const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  // A component's words are what it drew (the kit's button draws its children inside its own element): never both.
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
/**
 * What a node says to a screen reader: textOf, less what is aria-hidden. A press with a steady label (parts.tsx
 * SteadyLabel) draws both its words, one hidden, so it keeps its width as it turns busy; this is the one it says.
 */
export const saidOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(saidOf).join("");
  if (n.props?.["aria-hidden"] === true || n.props?.["aria-hidden"] === "true") return "";
  if (n.rendered !== undefined) return saidOf(n.rendered);
  return saidOf(n.props?.children);
};
/** The options of one of the kit's choices (the record kit's group, by its test id): its radios, as drawn. */
export const optionsOf = (tree, id) => {
  const out = [];
  walk(byTestId(tree, id), (n) => {
    if (n.type === "button" && n.props.role === "radio") out.push(n);
  });
  return out;
};
/** The option of one of the kit's choices whose words are these, pressed. */
export const pick = (tree, id, words) => {
  const hit = optionsOf(tree, id).find((o) => textOf(o).startsWith(words));
  assert.ok(hit, `no ${words} under ${id}`);
  hit.props.onClick();
  return hit;
};
/** The box of one of the kit's fields (by the field's test id): the input it drew. */
export const boxOf = (tree, id) => {
  let hit = null;
  walk(byTestId(tree, id), (n) => {
    if (!hit && n.type === "input") hit = n;
  });
  return hit;
};
/** An element by its id: what a field says is wrong with it is named by the field's (`rec-<id>-problem`). */
export const byId = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.id === id && typeof n.type === "string") hit = n;
  });
  return hit;
};
/** The first form under a node, submitted. */
export const submit = async (tree) => {
  let form = null;
  walk(tree, (n) => {
    if (!form && n.type === "form") form = n;
  });
  assert.ok(form, "no form drawn");
  await form.props.onSubmit({ preventDefault() {} });
};
export const tick = () => new Promise((r) => setTimeout(r, 0));

// The page looks again when a buy's mark goes stale (minutes away); this stub never clears an effect, so a wait that
// long is held here rather than keeping the run open. A test reads what was asked for.
export const heldWaits = [];
const shortTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...rest) =>
  ms > 1000 ? (heldWaits.push({ fn, ms }), 0) : shortTimeout(fn, ms, ...rest);
// Try it's clock ticks each second while a call is on screen; the stub never clears it, so the interval is held too.
export const heldTicks = [];
globalThis.setInterval = (fn, ms) => (heldTicks.push({ fn, ms }), 0);
globalThis.clearInterval = () => {};

/* ---- the phone, the plan and the line: Where it answers chooses, Go live spends ---- */
export const PRICE = {
  id: "price_example",
  currency: "usd",
  unit_amount: 4900,
  interval: "month",
  product_name: "Plan",
};
/** A workspace whose facts are in, whose listing has a number, with a line provider and Stripe here. */
export const phoneReady = (billing = {}) => ({
  ...withFacts,
  lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  google: { ready: true, places: true, listing: null, connected: false, phone: "+13055550100" },
  billing: {
    ready: true,
    livemode: true,
    mode: "stripe",
    status: "none",
    trial_end: null,
    current_period_end: null,
    trial_days: 14,
    price: PRICE,
    ...billing,
  },
});
/** The listing's number, kept: the choice Where it answers saves to the member's view. */
export const KEEP = { way: "keep", number: "+13055550100" };
/** Setup at Where it answers: the receptionist met and Rehearse put off, nothing chosen yet. */
export const atChannels = (dto) => surface(dto, { later: MET });
/** Setup at Go live: the number chosen (the listing's, kept, unless a test says) and what else was chosen. */
export const atLive = (dto, { want = KEEP, later = [], choices } = {}) =>
  surface(dto, { later: [...MET, ...later], want, ...(choices ? { choices } : {}) });
/** What the tab has kept under a draft's name, read where the page keeps it (the window's sessionStorage). */
export const draftOf = (kind) => globalThis.window.__tabMemory.draft(kind);
/** A choice kept in the tab, as the page keeps it (memory.ts). */
export const keepChoice = (choice) => globalThis.window.__tabMemory.keepDraft("first-run-phone", choice);
/** A tab with nothing kept in it: the drafts the last world left are gone, as a new world's own were. */
export const emptyTab = () => clearTabMemory(globalThis.window.sessionStorage);
/** The tab's drafts (empty), Stripe and the line doors, each remembering what it was asked. */
export const phoneWorld = ({
  outcome = null,
  numbers = [{ e164: "+13055550142", friendly: "(305) 555-0142" }],
  startNow = { ok: true, message: "" },
  checkoutInPage = { ok: true, left: true },
  lookup = null,
} = {}) => {
  const asked = { checkout: [], search: [], buy: [], request: [], startNow: 0, lookup: [], want: [], later: [] };
  emptyTab();
  Object.assign(billingVerbs, {
    outcome: () => outcome,
    checkout: async (back) => {
      asked.checkout.push(back);
      return { ok: true, message: "" };
    },
    checkoutInPage: async (back) => {
      asked.checkout.push(back);
      return checkoutInPage;
    },
    startNow: async () => {
      asked.startNow += 1;
      return startNow;
    },
  });
  globalThis.window.__setup.lines = {
    search: async (area) => {
      asked.search.push(area);
      return { ok: true, numbers, message: "" };
    },
    buy: async (e164, area) => {
      asked.buy.push([e164, area]);
      return { ok: true, queued: true, message: "" };
    },
    lookup: async (number) => {
      asked.lookup.push(number);
      return lookup;
    },
  };
  globalThis.window.__setup.request = async (what) => {
    asked.request.push(what);
    return { ok: true, already: false, message: "" };
  };
  // The choices said to the member's view, shown at once as Setup's own verbs show them (surface.ts).
  globalThis.window.__setup.want = async (w) => {
    asked.want.push(w);
    const s = surfaceNow();
    if (s) setSetup(surface(s.dto, { later: s.later, want: w, choices: s.choices }));
    return { ok: true, message: "" };
  };
  globalThis.window.__setup.later = async (id, on) => {
    asked.later.push([id, on]);
    const s = surfaceNow();
    if (s) {
      const ids = Array.isArray(id) ? id : [id];
      const later = on ? [...new Set([...s.later, ...ids])] : s.later.filter((x) => !ids.includes(x));
      setSetup(surface(s.dto, { later, want: s.want, choices: s.choices }));
    }
    return { ok: true, message: "" };
  };
  globalThis.window.__setup.choose = async (next) => {
    const s = surfaceNow();
    if (s) setSetup(surface(s.dto, { later: s.later, want: s.want, choices: { ...s.choices, ...next } }));
    return { ok: true, message: "" };
  };
  return { asked };
};
/** Setup as the seam holds it now. */
const surfaceNow = () => surfaceValue("setup");
/** Setup's verbs as the world found them: a suite that replaced one puts it back. */
export const restoreSetupVerbs = () => Object.assign(setupVerbs, { later: readyLater, activate: readyActivate });

/** The three ways, in the order the calls tile draws them. */
export const WAYS = ["keep", "new", "move"];
export const wayOf = (tree, way) => optionsOf(tree, "fr-ways")[WAYS.indexOf(way)];

/* ---- the line that answers, the forwarding saved, the test call ---- */
export const VOICE_LINE = "+13055550142";
export const answeringLine = (extra = []) => ({
  ...phoneReady({ status: "active" }),
  channels: { ...withFacts.channels, voice: { present: true, active: true, number: VOICE_LINE, lastInboundAt: null } },
  lines: {
    rows: [
      {
        id: "line-1",
        e164: VOICE_LINE,
        kind: "chanlytics",
        provider: "twilio",
        area_code: 305,
        voice_state: "answering",
        sms_state: "none",
        whatsapp_state: "none",
        port_state: "none",
        forwarding_state: "none",
        step: null,
        last_error: null,
        state_since: "2026-09-07T14:00:00Z",
        created_at: "2026-09-07T14:00:00Z",
      },
      ...extra,
    ],
    ready: true,
    provider: "twilio",
    costs: { local_number_month_usd: 1.15 },
  },
});
export const forwardedRow = (carrier, state = "instructed") => ({
  id: "fw-1",
  e164: "+13055550100",
  kind: "forwarded",
  provider: "carrier",
  area_code: 305,
  voice_state: "none",
  sms_state: "none",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: state,
  step: null,
  last_error: null,
  state_since: "2026-09-07T14:30:00Z",
  created_at: "2026-09-07T14:30:00Z",
  forwarding: {
    carrier,
    mode: "unanswered",
    destination_e164: VOICE_LINE,
    test_until: null,
    verified_at: null,
  },
});
/** A question's answer pressed, by its words: the record kit's radiogroup, as the page draws it. */
export const choose = (tree, key, words) => {
  let hit = null;
  walk(byTestId(tree, `fr-q-${key}`), (n) => {
    if (!hit && n.props?.role === "radio" && textOf(n) === words) hit = n;
  });
  assert.ok(hit, `no ${words} under ${key}`);
  hit.props.onClick();
  return hit;
};
export const chosen = (tree, key) => {
  let hit = null;
  walk(byTestId(tree, `fr-q-${key}`), (n) => {
    if (!hit && n.props?.role === "radio" && n.props["aria-checked"]) hit = textOf(n);
  });
  return hit;
};
/** The forwarding's door: what was saved, and the test windows opened (`saved.tests`). */
export const forwardingSays = () => {
  const saved = [];
  // Beside what was saved, not in it: a test compares what was saved by value.
  Object.defineProperty(saved, "tests", { value: [], enumerable: false });
  globalThis.window.__setup.forwarding = {
    set: async (o) => {
      saved.push(o);
      return { ok: true, message: "" };
    },
    test: async (lineId) => {
      saved.tests.push(lineId);
      return { ok: true, message: "" };
    },
  };
  return saved;
};
export const liveCall = (over = {}) => ({
  callId: "c1",
  cvId: "cv-c1",
  number: "+1 (786) 555-0199",
  from: "+17865550199",
  direction: "inbound",
  status: "ongoing",
  live: true,
  missed: false,
  startedAtMs: Date.now() - 20_000,
  startedLabel: "2:59 PM",
  duration: null,
  lengthWords: null,
  transcript: [
    { speaker: "agent", text: "Thank you for calling Harbor Moving!", t: "0:01" },
    { speaker: "client", text: "Are you open on Sunday?", t: "0:05" },
  ],
  ...over,
});
/** Try it's world: Setup's verbs and the tab's saver answer here, the saver's own put back once the test is over. */
export const tryWorld = (t) => {
  const asked = { later: [], saves: [], request: [] };
  t.after(() => Object.assign(businessTabSave.saver, tabSaver));
  emptyTab();
  globalThis.window.__setup.later = async (id, on) => {
    asked.later.push([id, on]);
    return { ok: true, message: "" };
  };
  globalThis.window.__setup.request = async (what) => {
    asked.request.push(what);
    return { ok: true, already: false, message: "" };
  };
  // A save is counted, never sent, over a settings read that is in; the patch is the tab's own.
  Object.assign(businessTabSave.saver, { save: (job) => asked.saves.push(job), base: () => ({ brain: {} }) });
  return asked;
};
/** The Business tab's saver, counting what a press would save (never sent), put back once the test is over. */
export const saverWorld = (t, base = { brain: { profile: {} } }) => {
  const saves = [];
  t.after(() => Object.assign(businessTabSave.saver, tabSaver));
  Object.assign(businessTabSave.saver, { save: (job) => saves.push(job), base: () => base });
  return saves;
};
