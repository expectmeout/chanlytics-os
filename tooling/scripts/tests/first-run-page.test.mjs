/**
 * The first run's page (#/start), drawn without a browser: Setup's rows one step at a time, the rail, the phone's step
 * line, the receptionist card, Finish later, a step already reached opened in place, a failed read and its retry.
 * The steps and every word are contracts' (first-run.ts); the page runs for real under a stub React, with the Setup
 * rows it draws (setup.jsx) loaded beside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupSteps, firstRunOf, receptionistCardOf, setupCardOf, FIRST_RUN_WORDS } from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const blank = {
  business: { name: null, hours: false, services: 0, bookingLink: false, address: false, handoff: null, broken: false },
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
const withFacts = {
  ...blank,
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 2,
    bookingLink: true,
    address: true,
    handoff: null,
    broken: false,
  },
};
const answering = {
  ...withFacts,
  channels: { ...blank.channels, voice: { present: true, active: true, number: "+13055550123", lastInboundAt: null } },
  calendar: { state: "ok" },
};
const surface = (dto) => ({
  dto,
  role: "owner",
  later: [],
  vm: setupSteps({ ...dto, later: [] }, NOW),
  fetchedAt: NOW,
});

/* ---- the window the page draws in ---- */
const went = [];
const replaced = [];
const store = {};
let refreshed = 0;
globalThis.Icon = "Icon";
globalThis.React = { Fragment: "Fragment" };
globalThis.window = {
  location: { hash: "#/start", replace: (to) => replaced.push(to) },
  sessionStorage: {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      store[k] = String(v);
    },
  },
  __SETUP: surface(blank),
  __firstRun: { of: firstRunOf, card: receptionistCardOf, today: setupCardOf, words: FIRST_RUN_WORDS },
  __setup: {
    refresh: async () => {
      refreshed += 1;
    },
    later: async () => ({ ok: true, message: "" }),
  },
  __WORKSPACES: [{ id: "w1", name: "Harbor Moving", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "w1",
  __DEMO_MODE: false,
  usePPToast: () => [null, () => {}],
  appNavigate: () => {},
  canDo: () => true,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document ??= {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.ReactDOM ??= { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.FailedRead = globalThis.window.FailedRead;
// data-bits publishes the shell's toast hook; the page's rows keep this harness's quiet one.
globalThis.window.usePPToast = () => [null, () => {}];
await import("../../../apps/dashboard/src/legacy/pages/setup.jsx");
await import("../../../apps/dashboard/src/legacy/pages/first-run.jsx");

/* ---- a stub React: the Setup page test's, with this page as the one drawn ---- */
let param = null;
const Page = () => globalThis.window.FirstRun({ param, onNavigate: (to) => went.push(to) });
let cells = [];
const frames = hookFrames();
const fresh = () => {
  cells = [];
};
function mount() {
  Object.assign(globalThis.React, {
    createElement: (type, p, ...kids) => {
      const props = { ...(p || {}), children: kids.flat(Infinity) };
      const node = { type, props };
      if (typeof type === "function") node.rendered = frames.render(type, props);
      return node;
    },
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
  frames.begin();
  return Page();
}
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const byTestId = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.["data-testid"] === id) hit = n;
  });
  return hit;
};
/** A Setup row the page drew, by its own test id (AttnRow is not loaded here, so a row is its element's props). */
const rowIn = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.testid === `setup-row-${id}`) hit = n.props;
  });
  return hit;
};
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  return textOf(n.props?.children) + (n.rendered ? textOf(n.rendered) : "");
};

test("a new workspace opens on its business: the rail says where it is, the step draws its own rows, and nothing answers yet", () => {
  window.__SETUP = surface(blank);
  param = null;
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your business");
  assert.ok(byTestId(tree, "fr-rail-business"), "the step on screen is a button on the rail");
  assert.equal(byTestId(tree, "fr-rail-phone"), null, "a step not reached is only its name");
  const rows = byTestId(tree, "fr-rows");
  assert.ok(rowIn(rows, "facts"), "the business step draws the facts row");
  assert.equal(rowIn(rows, "line"), null, "and not the phone's");
  assert.equal(rowIn(rows, "facts").cta.kind, "primary", "its first open row carries the one coral button");
  assert.equal(textOf(byTestId(tree, "fr-phone-line")), "Step 1 of 4 · Your business");
  assert.equal(textOf(byTestId(tree, "fr-card-status")), "Not answering yet");
  assert.equal(byTestId(tree, "fr-back"), null);
  assert.equal(byTestId(tree, "fr-onward"), null);
  assert.equal(store["chanlytics.setup.landed"], "1", "being here is the landing: Today does not send this tab back");
});

test("a step already reached opens in place from the rail, and Continue goes on to where the workspace is", () => {
  window.__SETUP = surface(withFacts);
  param = "business";
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your business");
  byTestId(tree, "fr-onward").props.onClick();
  assert.equal(replaced.at(-1), "#/start");
  byTestId(tree, "fr-rail-phone").props.onClick();
  assert.equal(replaced.at(-1), "#/start", "the current step is the bare address");
  param = null;
  fresh();
  const phone = mount();
  assert.equal(textOf(byTestId(phone, "fr-heading")), "Your phone");
  byTestId(phone, "fr-back").props.onClick();
  assert.equal(
    replaced.at(-1),
    "#/start/business",
    "Back opens the step before, replaced so the browser's Back leaves",
  );
});

test("answering: Live, with what is left, and Finish goes to Today", () => {
  window.__SETUP = surface(answering);
  param = null;
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your receptionist is answering");
  const onward = byTestId(tree, "fr-onward");
  assert.equal(textOf(onward), "Finish");
  onward.props.onClick();
  assert.equal(went.at(-1), "today");
  assert.equal(textOf(byTestId(tree, "fr-card-status")), "Answering · not tried yet");
});

test("Finish later leaves for Today", () => {
  window.__SETUP = surface(blank);
  param = null;
  fresh();
  byTestId(mount(), "fr-later").props.onClick();
  assert.equal(went.at(-1), "today");
});

test("the card fills in from the settings read once it lands", () => {
  window.__SETUP = surface(withFacts);
  window.__SETTINGS = {
    config: { brain: { business_name: "Harbor Moving", booking_link: "https://harbor.example/book" } },
  };
  window.__FACTS = {
    facts: { voice_line: { value: null }, kept_line: { value: null }, handoff_number: { value: "+13055550100" } },
  };
  try {
    param = null;
    fresh();
    const tree = mount();
    assert.equal(textOf(byTestId(tree, "fr-card-books")), "Books withharbor.example/book");
    assert.equal(textOf(byTestId(tree, "fr-card-through")), "Puts through to+1 (305) 555-0100");
    assert.equal(textOf(byTestId(tree, "fr-card-open")), "Open—", "hours set but not read yet: a dash, not a guess");
  } finally {
    delete window.__SETTINGS;
    delete window.__FACTS;
  }
});

test("a failed read says so, and the retry reads again; before the read, Reading your workspace…", () => {
  window.__SETUP = null;
  fresh();
  const failed = mount();
  assert.ok(byTestId(failed, "fr-failed"));
  byTestId(failed, "fr-retry").props.onClick();
  assert.equal(refreshed, 1);
  window.__SETUP = undefined;
  fresh();
  assert.equal(textOf(byTestId(mount(), "fr-reading")), "Reading your workspace…");
});
