/**
 * The Setup page, rendered loaded, with a line that is answering and tested
 * but not yet activated: the receptionist row carries Activate, and pressing
 * it reaches the bridge with the capability's name. The rows come from the
 * real setupSteps over a real DTO; the page runs for real under the four
 * hooks it uses (the registration-path harness); only the renderer is faked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupSteps } from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-11T12:00:00Z");
const ago = (h) => new Date(NOW - h * 3600_000).toISOString();

const dto = {
  business: { name: "Harbor Nails", hours: true, services: 4, bookingLink: true, address: true, handoff: "+13055550199", broken: false },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: true, active: true, number: "+13055550101", lastInboundAt: ago(3) },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0 },
  requests: { line: null },
  lines: { rows: [{ id: "l1", e164: "+13055550101", kind: "chanlytics", provider: "twilio", area_code: 305, voice_state: "answering", sms_state: "none", reg_mock: false, whatsapp_state: "none", port_state: "none", forwarding_state: "none", step: null, last_error: null, state_since: ago(48), created_at: ago(72) }], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  activations: [],
};
const vm = setupSteps({ ...dto, later: [] }, NOW);

test("the contract: a tested, unactivated receptionist offers Activate and says so", () => {
  const r = vm.rows.find((x) => x.id === "receptionist");
  assert.equal(r.state, "ready");
  assert.deepEqual(r.verb, { label: "Activate", to: "verb:activate:voice" });
  assert.ok(r.details.includes("Tested — activate it to say it is yours"), r.details.join(" | "));
  const live = setupSteps({ ...dto, activations: [{ capability: "voice", activated_at: ago(1), activated_by: "u1", deactivated_at: null }], later: [] }, NOW).rows.find((x) => x.id === "receptionist");
  assert.equal(live.verb.label, "Call it", "activated: the verb goes back to trying it");
  assert.ok(live.details.some((d) => /^Activated /.test(d)));
});

/* ---- the page itself, rendered without a browser ---- */
const calls = { activate: [], deactivate: [], refresh: 0, flash: [], nav: [] };
globalThis.Icon = "Icon";
globalThis.React = { Fragment: "Fragment" };
globalThis.window = {
  location: { origin: "https://app.chanlytics.com", hash: "#/admin/setup" },
  __SETUP: { dto, role: "owner", vm, fetchedAt: NOW },
  __setup: {
    activate: async (kind) => { calls.activate.push(kind); return { ok: true, message: "" }; },
    deactivate: async (kind) => { calls.deactivate.push(kind); return { ok: true, message: "" }; },
    refresh: async () => { calls.refresh += 1; },
  },
  __billing: {},
  __google: {},
  __forwarding: { codes: {}, testOpen: () => false, carriers: [], modes: [], carrierWords: {}, modeWords: {}, display: (x) => x, ago: () => "" },
  __DEMO_MODE: false,
  usePPToast: () => [null, (m) => calls.flash.push(m)],
  appNavigate: (to) => calls.nav.push(to),
  canDo: () => true,
  addEventListener() {},
  removeEventListener() {},
};
await import("../../../apps/dashboard/src/legacy/pages/setup.jsx");
const Page = globalThis.window.PaneSetup;

function mount() {
  const cells = [];
  let seq = 0;
  Object.assign(globalThis.React, {
    createElement: (type, p, ...kids) => ({ type, props: { ...(p || {}), children: kids.flat(Infinity) } }),
    useMemo: (fn) => { const k = seq++; if (!(k in cells)) cells[k] = fn(); return cells[k]; },
    useState: (init) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
      return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }];
    },
    useReducer: (red, init) => {
      const k = seq++;
      if (!(k in cells)) cells[k] = init;
      return [cells[k], (a) => { cells[k] = red(cells[k], a); }];
    },
    useEffect: () => {},
  });
  seq = 0;
  return Page();
}
const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
};

test("the page: the row's Activate reaches the bridge with the capability's name, and the owner is told", async () => {
  const tree = mount();
  let cta = null;
  walk(tree, (n) => { if (!cta && n.props?.cta?.label === "Activate") cta = n.props.cta; });
  assert.ok(cta, "a row offers Activate");
  await cta.onClick();
  assert.deepEqual(calls.activate, ["voice"]);
  assert.equal(calls.flash.length, 1, "the owner is told once");
  assert.equal(calls.nav.length, 0, "and nothing navigated away");
});

test("the page: a row that dials is not itself a dial, an activated row offers Switch off and it reaches the bridge", async () => {
  const before = calls.deactivate.length;
  globalThis.window.__SETUP = { dto, role: "owner", vm: setupSteps({ ...dto, activations: [{ capability: "voice", activated_at: ago(1), activated_by: "u1", deactivated_at: null }], later: [] }, NOW), fetchedAt: NOW };
  const tree = mount();
  let row = null;
  walk(tree, (n) => { if (!row && n.props?.testid === "setup-row-receptionist") row = n.props; });
  assert.ok(row, "the receptionist row");
  assert.equal(row.cta.label, "Call it");
  assert.equal(row.onOpen, undefined, "the row itself does not dial; only its button does");
  assert.equal(row.also.label, "Switch off");
  await row.also.onClick();
  assert.deepEqual(calls.deactivate.slice(before), ["voice"]);
  let nav = null;
  walk(tree, (n) => { if (!nav && n.props?.testid === "setup-row-team") nav = n.props; });
  assert.equal(typeof nav.onOpen, "function", "a row that navigates is a click target");
  globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
});

test("the page: a failed read draws a card with a retry, and the retry reads again", async () => {
  globalThis.window.__SETUP = null;
  const tree = mount();
  let retry = null;
  walk(tree, (n) => { if (!retry && n.props?.["data-testid"] === "setup-retry") retry = n.props; });
  assert.ok(retry, "a retry on the failed card");
  await retry.onClick();
  assert.equal(calls.refresh, 1);
  globalThis.window.__SETUP = { dto, role: "owner", vm, fetchedAt: NOW };
});
