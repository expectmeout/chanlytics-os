/**
 * The doors that spend, file or disconnect gate the way the rest of the app does, and say what they mean.
 *
 * - Billing's doors to Stripe were disabled for a role that may not press them, with no reason the control could
 *   give; the headline carried Stripe's own word for the state ("trialing", "past due"), and an invoice said "paid" or
 *   "open" as Stripe says it (the wiring audit's S20).
 * - The business record hid Save and File from anyone but an owner, under a sentence of the form's own (the one gate).
 * - Choosing Google's location offered "Disconnect instead", which disconnected at once, where the row's own
 *   Disconnect asks first (S17).
 * Run against billing-real.jsx, business-record.jsx and integrations-real.jsx on a stub React, over data-bits' real
 * gate, contracts' role table, view models and rows, and the billing bridge's own published words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_PERMS,
  roleGate,
  stateOf,
  billingAccountDto,
  connectionRows,
  CONNECTION_GROUP_WORDS,
} from "@chanlytics/contracts";

/* ---------------------------------- the window ---------------------------------- */

const tipped = [];
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
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
/** Who is looking: the role store answers from contracts' own table, as the bridge publishes it. */
const role = { now: "owner" };
const asRole = (r) => {
  role.now = r;
  globalThis.window.__ME = { email: "dana@northside.example", role: r };
};
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/admin/billing",
    search: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __roleGate: roleGate,
  ST_STORE: { can: (a) => !!(ROLE_PERMS[role.now] || {})[a], myRole: () => role.now },
};

/* ------------------------------ a stub React ------------------------------ */

// Hooks are kept per component, by the component's place in the tree and its type; memos and callbacks honour their
// inputs. A setter marks the page changed, and `settle` draws again only then.
let cells = new Map();
let frames = [];
let dirty = false;
let lastTree = null;
const slot = () => {
  const f = frames[frames.length - 1];
  return `${f.key}#${f.hook++}`;
};
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((d, i) => Object.is(d, b[i]));
const memo = (make, deps) => {
  const k = slot();
  const was = cells.get(k);
  if (!was || !deps || !same(was.deps, deps)) cells.set(k, { value: make(), deps });
  return cells.get(k).value;
};
globalThis.Icon = "Icon";
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
  useEffect: (fn, deps) => {
    const k = slot();
    const prev = cells.get(k);
    if (prev && deps && same(prev.deps, deps)) return;
    if (prev && typeof prev.cleanup === "function") prev.cleanup();
    const cell = { deps, cleanup: undefined };
    cells.set(k, cell);
    cell.cleanup = fn();
  },
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
// data-bits installs the shell tip on import, so the test tip -- where a pressed gate showed its reason -- goes on after it.
globalThis.window.__tip = { show: (el) => tipped.push(el) };
for (const k of ["EmptyState", "FailedRead", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav() {}, R: {} },
  __chrome: { state: stateOf },
});
// The billing bridge as the shell installs it: its view model and its words are the published ones.
const { installBilling } = await import("../../../apps/dashboard/src/legacy-bridge/billing.ts");
installBilling(globalThis.window);
await import("../../../apps/dashboard/src/legacy/pages/billing-real.jsx");
await import("../../../apps/dashboard/src/legacy/pages/business-record.jsx");
await import("../../../apps/dashboard/src/legacy/pages/integrations-real.jsx");

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
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (n.rendered !== undefined) return textOf(n.rendered);
  return textOf(n.props?.children);
};
const buttonSaying = (tree, words) => find(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const pressOf = () => ({
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
const press = (node) => {
  const e = pressOf();
  node.props.onClick(e);
  return e;
};
const flush = () => new Promise((r) => setImmediate(r));
const draw = (C, props) => {
  frames = [{ key: "root", hook: 0, kids: {} }];
  dirty = false;
  lastTree = C(props);
  return lastTree;
};
const render = (C, props = {}) => {
  cells = new Map();
  tipped.length = 0;
  return draw(C, props);
};
const settle = (C, props = {}) => (dirty ? draw(C, props) : lastTree);

/* ------------------------------ Billing ------------------------------ */

const Billing = (props) => globalThis.window.PaneBillingReal(props);
const PRICE = { id: "price_1", currency: "usd", unit_amount: 4900, interval: "month", product_name: "Chanlytics OS" };
/** The row as the edge reads it (contracts billingAccountDto), in one Stripe state, on live keys unless a case says otherwise. */
const billing = (over = {}, livemode = true) => {
  const account = billingAccountDto({
    mode: "stripe",
    status: "none",
    price_id: "price_1",
    current_period_end: null,
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    card_brand: null,
    card_last4: null,
    last_payment_failed_at: null,
    last_paid_at: null,
    updated_at: "2026-09-15T12:00:00Z",
    ...over,
  });
  globalThis.window.__BILLING_ACCOUNT = {
    dto: { ready: true, livemode, account, price: PRICE, trial_days: 14, role: "owner" },
    fetchedAt: Date.now(),
  };
};
const INVOICES = [
  {
    id: "in_2",
    number: "NS-0002",
    status: "open",
    amount_due: 4900,
    amount_paid: 0,
    currency: "usd",
    created_at: "2026-09-15T15:00:00Z",
    hosted_url: "https://invoice.stripe.com/i/2",
    pdf_url: null,
  },
  {
    id: "in_1",
    number: "NS-0001",
    status: "paid",
    amount_due: 4900,
    amount_paid: 4900,
    currency: "usd",
    created_at: "2026-08-15T15:00:00Z",
    hosted_url: "https://invoice.stripe.com/i/1",
    pdf_url: null,
  },
];
/** The bridge's verbs, recorded: nothing here reaches Stripe. */
const stripe = () => {
  const called = [];
  const ok = (what) => async () => {
    called.push(what);
    return { ok: true, message: "" };
  };
  Object.assign(globalThis.window.__billing, {
    checkout: ok("checkout"),
    portal: ok("portal"),
    resume: ok("resume"),
    sync: ok("sync"),
    outcome: () => null,
    invoices: async () => {
      called.push("invoices");
      return { ok: true, invoices: INVOICES, message: "" };
    },
  });
  return called;
};

test("REGRESSION (one gate): Billing's doors to Stripe stay on the page for a role that may not open them, gated, saying why -- they were disabled with no reason at the control", () => {
  asRole("operator");
  billing({ status: "none" });
  const called = stripe();
  let tree = render(Billing, { flash() {} });
  const start = byTestId(tree, "billing-checkout");
  assert.equal(
    start.props["aria-disabled"],
    true,
    "REGRESSION: a disabled Start the trial takes no focus and gives no reason",
  );
  assert.equal(start.props.disabled, false);
  assert.equal(start.props["data-tip"], "Only an owner can start the subscription.");
  assert.ok(press(start).prevented, "pressing it opens nothing");
  assert.equal(tipped.length, 1, "but shows the reason where the control is");
  assert.deepEqual(called, [], "and nothing reached Stripe");
  assert.equal(
    textOf(tree).split("Only an owner can start or manage the subscription.").length - 1,
    1,
    "the pane says why once, as the gate says it",
  );

  billing({ status: "trialing", trial_end: "2026-09-25T15:00:00Z", card_brand: "visa", card_last4: "4242" });
  tree = render(Billing, { flash() {} });
  assert.equal(byTestId(tree, "billing-portal").props["data-tip"], "Only an owner can manage the subscription.");
  assert.equal(byTestId(tree, "billing-sync").props["aria-disabled"], undefined, "an operator may read Stripe again");
  asRole("viewer");
  tree = render(Billing, { flash() {} });
  assert.equal(
    byTestId(tree, "billing-sync").props["data-tip"],
    "Only an owner or operator can read Stripe again.",
    "a viewer may not",
  );

  asRole("owner");
  tree = render(Billing, { flash() {} });
  assert.equal(
    byTestId(tree, "billing-portal").props["aria-disabled"],
    undefined,
    "an owner's doors are ordinary buttons",
  );
  assert.ok(!textOf(tree).includes("Only an owner can"));
});

test("REGRESSION (S20): Billing says what a state means for the receptionist, and an invoice's status in words -- it showed Stripe's 'trialing' and 'paid'", async () => {
  asRole("owner");
  stripe();
  const headline = () => textOf(byTestId(render(Billing, { flash() {} }), "billing-headline"));
  billing({ status: "trialing", trial_end: "2026-09-25T15:00:00Z", card_brand: "visa", card_last4: "4242" });
  let said = headline();
  assert.ok(!said.includes("trialing"), `REGRESSION: ${said}`);
  assert.ok(said.includes("Receptionist answering"), said);
  billing({ status: "past_due", card_brand: "visa", card_last4: "4242" });
  said = headline();
  assert.ok(!said.includes("past due"), `REGRESSION: ${said}`);
  assert.ok(said.includes("Receptionist answering"), "a failed payment still answers while Stripe retries");
  billing({ status: "paused" });
  assert.ok(headline().includes("Receptionist paused"));

  billing({ status: "active", current_period_end: "2026-10-15T15:00:00Z", card_brand: "visa", card_last4: "4242" });
  let tree = render(Billing, { flash() {} });
  press(buttonSaying(tree, "Show invoices"));
  await flush();
  tree = settle(Billing, { flash() {} });
  // The invoices are a table now: a row each, its status a pill in its own cell, in the owner's words.
  const statuses = all(byTestId(tree, "billing-invoices"), (n) => n.props?.["data-testid"] === "billing-invoice").map(
    (row) =>
      all(row, (n) =>
        String(n.props?.className || "")
          .split(" ")
          .includes("pill"),
      )
        .map(textOf)
        .join(""),
  );
  assert.ok(statuses.length > 0, "every invoice is a row of the table");
  assert.ok(statuses.includes("Paid"), `REGRESSION: ${statuses.join(" | ")}`);
  assert.ok(statuses.includes("Not paid yet"), statuses.join(" | "));
  assert.ok(!statuses.some((s) => /^(paid|open)$/.test(s)), "no status in Stripe's words");
});

test("REGRESSION (S9): on Stripe's test keys the pane says test mode, beside its title and under the card -- it said 'Card on file' and nothing about test cards", () => {
  asRole("owner");
  stripe();
  const trialing = { status: "trialing", trial_end: "2026-09-25T15:00:00Z", card_brand: "visa", card_last4: "4242" };
  billing(trialing, false);
  let tree = render(Billing, { flash() {} });
  assert.equal(
    textOf(byTestId(tree, "billing-test-mode")),
    "Test mode",
    "REGRESSION: nothing on the pane said test mode",
  );
  assert.equal(
    textOf(byTestId(tree, "billing-test-mode-note")),
    "Billing is in test mode, so only Stripe's test cards work and no real money moves.",
  );
  // Said once: the sentence about the trial already names the card, so the pane does not add "Card on file" under it.
  assert.equal(textOf(tree).split("Visa ending 4242").length - 1, 1, "the card is still said, and once");

  billing(trialing, true);
  tree = render(Billing, { flash() {} });
  assert.equal(byTestId(tree, "billing-test-mode"), null, "live keys: no badge");
  assert.equal(byTestId(tree, "billing-test-mode-note"), null, "and no sentence");

  billing(trialing, null);
  tree = render(Billing, { flash() {} });
  assert.equal(byTestId(tree, "billing-test-mode"), null, "keys not said: nothing claimed either way");

  billing({ mode: "direct", status: "active" }, false);
  tree = render(Billing, { flash() {} });
  assert.equal(
    byTestId(tree, "billing-test-mode"),
    null,
    "a direct arrangement charges nothing here, whatever the keys",
  );
});

/* ------------------------------ the business record ------------------------------ */

const Form = (props) => globalThis.window.BusinessRecordForm(props);
const businessRecord = (sent) => ({
  read: async () => ({
    ok: true,
    record: { legal_name: "Northside Studio LLC", ein: "12-3456789" },
    path: "standard",
    problems: {},
    message: "",
  }),
  save: async () => {
    sent.push("save");
    return { ok: true, message: "Saved.", problems: {} };
  },
  register: async () => {
    sent.push("file");
    return { ok: true, pending: true, message: "Filed." };
  },
  problems: () => ({}),
  fieldsFor: () => [
    { name: "legal_name", label: "Legal name", group: "business", required: true },
    { name: "ein", label: "Tax ID", group: "business", required: true, hint: "Nine digits" },
  ],
  groupsFor: () => ({
    business: { title: "The business", sub: "" },
    address: { title: "", sub: "" },
    contact: { title: "", sub: "" },
  }),
  paths: ["standard", "sole_proprietor"],
  question: { title: "", sub: "", nudge: "" },
  pathWords: {
    standard: { filed: "A business with a tax ID", sub: "", choice: "" },
    sole_proprietor: { filed: "", sub: "", choice: "" },
  },
  costWords: { standard: "", sole_proprietor: "" },
  limits: () => [],
  forPath: (r) => r,
  empty: () => ({}),
  line: () => "",
  optionWords: (o) => o,
});

test("REGRESSION (one gate): the business record shows Save and File to a role that may not press them, gated, and says why once -- they were hidden under a sentence of the form's own", async () => {
  asRole("operator");
  const sent = [];
  globalThis.window.__businessRecord = businessRecord(sent);
  const props = { line: { id: "l1", sms_state: "none" }, flash() {} };
  render(Form, props);
  await flush();
  let tree = settle(Form, props);
  const save = byTestId(tree, "biz-save");
  assert.ok(save, "REGRESSION: Save was not on the page");
  assert.equal(save.props["aria-disabled"], true);
  assert.equal(save.props["data-tip"], "Only an owner can fill in the business record.");
  assert.ok(press(save).prevented);
  const file = find(tree, (n) => n.type === "button" && n.props["data-testid"] === "biz-file");
  assert.ok(file, "REGRESSION: File was not on the page");
  assert.equal(file.props["data-tip"], "Only an owner can file with the carriers.");
  assert.ok(press(file).prevented);
  await flush();
  tree = settle(Form, props);
  assert.equal(byTestId(tree, "biz-file-confirm"), null, "a gated File arms nothing");
  assert.deepEqual(sent, [], "nothing saved, nothing filed");
  assert.equal(
    textOf(tree).split("Only an owner can fill in the business record.").length - 1,
    1,
    "the form says why once",
  );

  asRole("owner");
  render(Form, props);
  await flush();
  tree = settle(Form, props);
  assert.equal(byTestId(tree, "biz-save").props["aria-disabled"], undefined, "an owner's Save is an ordinary button");
  assert.ok(!textOf(tree).includes("Only an owner can"));
});

/* ------------------------------ Connections ------------------------------ */

const Connections = (props) => globalThis.window.PaneIntegrationsReal(props);

test("REGRESSION (S17): 'Disconnect instead' asks first, as the row's own Disconnect does -- it disconnected Google at once", async () => {
  asRole("owner");
  const done = [];
  Object.assign(globalThis.window, {
    __CHANNELS: [],
    __SETUP: null,
    // Connected, with the location still to choose: the row's body is the chooser.
    __GOOGLE: {
      dto: {
        ready: { places: false, profile: true },
        listing: null,
        connection: {
          google_email: "dana@northside.example",
          account_title: "Northside",
          location_name: null,
          location_title: null,
          connected_at: "2026-09-15T14:00:00Z",
          last_synced_at: null,
          sync_error: null,
        },
      },
    },
    __connections: { rows: connectionRows, groupWords: CONNECTION_GROUP_WORDS },
    __waConnect: { config: async () => null },
    __google: {
      outcome: () => null,
      outcomeWords: {},
      locations: async () => ({
        ok: true,
        locations: [
          {
            account_name: "accounts/1",
            location_name: "locations/1",
            title: "Northside Studio",
            address: "1 Main St",
            account_title: "Northside",
          },
        ],
      }),
      choose: async () => ({ ok: true, read: true, message: "" }),
      disconnect: async () => {
        done.push("disconnect");
        return { ok: true, message: "" };
      },
      unlink: async () => ({ ok: true, message: "" }),
    },
  });
  render(Connections);
  await flush();
  let tree = settle(Connections);
  const instead = byTestId(tree, "google-choose-disconnect");
  assert.ok(instead, "the chooser offers it");
  press(instead);
  await flush();
  tree = settle(Connections);
  assert.deepEqual(done, [], "REGRESSION: pressing it disconnected Google with no question");
  assert.match(
    textOf(byTestId(tree, "google-disconnect-confirm")),
    /Disconnect Google\?/,
    "it asks, in the row's own words",
  );
  press(byTestId(tree, "google-disconnect-yes"));
  await flush();
  assert.deepEqual(done, ["disconnect"], "and Yes disconnects, once");
});

test("the email row's form: offered from the business's name, judged under its own box before anything is asked, a taken address said there too, and closed by the yes", async () => {
  asRole("owner");
  const { installMailbox } = await import("../../../apps/dashboard/src/legacy-bridge/mailbox.ts");
  installMailbox(globalThis.window);
  const asked = [];
  let answer = {
    ok: false,
    code: "conflict",
    status: 409,
    title: "Not possible right now",
    message: "That address is taken. Try another.",
    retryAfterS: null,
    fields: null,
  };
  Object.assign(globalThis.window.__mailbox, {
    create: async (input) => {
      asked.push(input);
      return answer;
    },
  });
  const email = { ready: true, domain: "mail.chanlytics.com", mailbox: null };
  Object.assign(globalThis.window, {
    __CHANNELS: [],
    __GOOGLE: null,
    __SETUP: {
      dto: {
        business: { name: "Best Movers" },
        lines: { rows: [], ready: false },
        requests: { line: null },
        calendar: null,
        email,
      },
    },
    __connections: { rows: connectionRows, groupWords: CONNECTION_GROUP_WORDS },
    __waConnect: { config: async () => null },
    refusalToast: (r) => ({ tone: "danger", msg: r.message }),
  });
  let tree = render(Connections);
  assert.equal(byTestId(tree, "email-setup"), null, "the form waits for its verb");
  press(byTestId(tree, "connection-email-verb"));
  tree = settle(Connections);
  const box = () => find(byTestId(tree, "email-local"), (n) => n.type === "input");
  assert.equal(box().props.value, "best-movers", "an address to start from, never a blank box");
  assert.match(textOf(byTestId(tree, "email-local")), /@mail\.chanlytics\.com/);
  assert.match(textOf(byTestId(tree, "email-local")), /cannot be changed later/);

  box().props.onChange({ target: { value: "best movers" } });
  tree = settle(Connections);
  press(byTestId(tree, "email-save"));
  await flush();
  tree = settle(Connections);
  assert.match(textOf(byTestId(tree, "email-local-problem")), /letters, numbers and hyphens only/);
  assert.equal(box().props["aria-invalid"], true);
  assert.deepEqual(asked, [], "nothing is asked about what the rules already refuse");

  box().props.onChange({ target: { value: "bestmovers" } });
  tree = settle(Connections);
  press(byTestId(tree, "email-save"));
  await flush();
  tree = settle(Connections);
  assert.deepEqual(asked, [{ localPart: "bestmovers", fromName: "Best Movers" }]);
  assert.equal(
    textOf(byTestId(tree, "email-local-problem")),
    "That address is taken. Try another.",
    "said under the box that caused it, not in a toast",
  );

  answer = {
    ok: true,
    data: {
      mailbox: {
        id: "mb1",
        address: "bestmovers2@mail.chanlytics.com",
        from_name: "Best Movers",
        last_received_at: null,
      },
    },
  };
  box().props.onChange({ target: { value: "bestmovers2" } });
  tree = settle(Connections);
  press(byTestId(tree, "email-save"));
  await flush();
  tree = settle(Connections);
  assert.equal(byTestId(tree, "email-setup"), null, "the form closes; the row repaints from Setup's re-read");
});

/* ------------------------------ the attention row ------------------------------ */

test("REGRESSION (S23): the attention row's buttons say they are busy and take no second press while their verb is on its way", async () => {
  await import("../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");
  const row = (cta, also) =>
    render(globalThis.window.AttnRow, {
      name: "Your line",
      sentence: "",
      cta,
      also,
      testid: "row",
      ctaTestid: "row-cta",
    });
  let tree = row(
    { label: "Retry", onClick() {}, busy: true },
    { label: "Later", onClick() {}, busy: true, testid: "row-also" },
  );
  assert.equal(
    byTestId(tree, "row-cta").props.disabled,
    true,
    "REGRESSION: a button whose verb was on its way could be pressed again",
  );
  assert.equal(byTestId(tree, "row-cta").props["aria-busy"], true, "and says so to a screen reader");
  assert.equal(byTestId(tree, "row-also").props.disabled, true, "the row's other button too");
  tree = row({ label: "Retry", onClick() {} }, null);
  assert.equal(byTestId(tree, "row-cta").props.disabled, false, "and it presses as ever when nothing is on its way");
  assert.equal(byTestId(tree, "row-cta").props["aria-busy"], undefined);
});

test("inside the app the billing page keeps its status and says where billing lives; the three Stripe doors are not drawn (App Store 3.1.3(f))", () => {
  asRole("owner");
  stripe();
  billing({ status: "none" });
  globalThis.window.__IN_APP = { version: "1.0.0", platform: "ios" };
  try {
    const tree = render(Billing, { flash() {} });
    assert.equal(byTestId(tree, "billing-checkout"), null, "no Start the trial");
    assert.equal(byTestId(tree, "billing-portal"), null, "no Manage billing");
    assert.equal(byTestId(tree, "billing-resume"), null);
    assert.equal(textOf(byTestId(tree, "billing-in-app")), "Billing is managed from Chanlytics on the web.");
    assert.ok(byTestId(tree, "billing-headline"), "the status stays");
    assert.ok(!textOf(tree).includes("Stripe"), "and no door names Stripe");
  } finally {
    delete globalThis.window.__IN_APP;
  }
  const tree = render(Billing, { flash() {} });
  assert.ok(byTestId(tree, "billing-checkout"), "on the web the door is back");
  assert.equal(byTestId(tree, "billing-in-app"), null);
});

/* ------------------------------ the domains you send from ------------------------------ */

test("the domains you send from: under the Email row, each in contracts' words, its records to copy, and an add judged under its own box", async () => {
  asRole("owner");
  const { installSendingDomains } = await import("../../../apps/dashboard/src/legacy-bridge/sending-domains.ts");
  installSendingDomains(globalThis.window);
  const added = [];
  Object.assign(globalThis.window.__sendingDomains, {
    add: async (input) => {
      added.push(input);
      return {
        ok: false,
        code: "conflict",
        status: 409,
        title: "Not possible",
        message: "This workspace already sends from that domain.",
      };
    },
    check: async () => ({ ok: true, data: { domain: null } }),
    remove: async () => ({ ok: true, data: { removed: true } }),
  });
  const now = Date.now();
  const iso = (daysAgo) => new Date(now - daysAgo * 86_400_000).toISOString();
  const base = {
    from_local: "sam",
    from_name: "Sam at Harbor",
    held_why: null,
    held_at: null,
    checked_at: null,
    created_at: iso(3),
  };
  const email = {
    ready: true,
    domain: "mail.chanlytics.com",
    mailbox: {
      id: "mb1",
      address: "harbor@mail.chanlytics.com",
      from_name: "Harbor Moving",
      last_received_at: null,
      last_error: null,
    },
    sending: {
      ready: true,
      domains: [
        {
          ...base,
          id: "d1",
          host: "getharbor.com",
          address: "sam@getharbor.com",
          state: "records",
          provider_status: "not_started",
          dmarc: "missing",
          verified_at: null,
          clean_since: null,
          records: [
            {
              label: "DKIM",
              type: "TXT",
              name: "resend._domainkey",
              value: "p=MIGf",
              priority: null,
              status: "not_started",
            },
          ],
        },
        {
          ...base,
          id: "d2",
          host: "harbor-mail.com",
          address: "sam@harbor-mail.com",
          state: "verified",
          provider_status: "verified",
          dmarc: "found",
          verified_at: iso(20),
          clean_since: iso(20),
          records: [],
        },
      ],
    },
  };
  Object.assign(globalThis.window, {
    __CHANNELS: [],
    __GOOGLE: null,
    __SETUP: {
      dto: {
        business: { name: "Harbor Moving" },
        lines: { rows: [], ready: false },
        requests: { line: null },
        calendar: null,
        email,
      },
    },
    __connections: { rows: connectionRows, groupWords: CONNECTION_GROUP_WORDS },
    __waConnect: { config: async () => null },
    refusalToast: (r) => ({ tone: "danger", msg: r.message }),
  });
  let tree = render(Connections);
  const block = byTestId(tree, "sending-domains");
  assert.ok(block, "drawn under the Email row");
  assert.match(textOf(block), /Domains you send from/);
  assert.match(textOf(block), /replies come back to harbor@mail\.chanlytics\.com/);

  const pending = byTestId(tree, "domain-getharbor.com");
  assert.match(textOf(pending), /Records to add/);
  assert.match(textOf(pending), /Not sending yet/);
  assert.ok(byTestId(tree, "domain-check-getharbor.com"), "a domain with records to add can be checked");
  const records = byTestId(tree, "domain-records-getharbor.com");
  assert.match(
    textOf(records),
    /resend\._domainkey\.getharbor\.com/,
    "the name written out in full, as a registrar asks",
  );
  assert.match(textOf(records), /_dmarc\.getharbor\.com/, "and the DMARC record we recommend while it has none");
  assert.match(textOf(records), /v=DMARC1; p=none;/);

  const verified = byTestId(tree, "domain-harbor-mail.com");
  assert.match(textOf(verified), /Verified/);
  assert.match(textOf(verified), /20 clean days/);
  assert.match(textOf(verified), /Up to 100 a day/);
  assert.equal(
    byTestId(tree, "domain-check-harbor-mail.com"),
    null,
    "the clock checks a verified domain; nobody needs to",
  );
  assert.equal(byTestId(tree, "domain-records-harbor-mail.com"), null);

  press(byTestId(tree, "domain-add-open"));
  tree = settle(Connections);
  const host = () => find(byTestId(tree, "domain-host"), (n) => n.type === "input");
  const local = () => find(byTestId(tree, "domain-local"), (n) => n.type === "input");
  const name = () => find(byTestId(tree, "domain-name"), (n) => n.type === "input");
  assert.equal(name().props.value, "Harbor Moving", "the mailbox's name to start from");
  host().props.onChange({ target: { value: "gmail.com" } });
  local().props.onChange({ target: { value: "sam" } });
  tree = settle(Connections);
  press(byTestId(tree, "domain-save"));
  await flush();
  tree = settle(Connections);
  assert.match(textOf(byTestId(tree, "domain-host-problem")), /free mail/);
  assert.deepEqual(added, [], "nothing is asked about what the rules already refuse");

  host().props.onChange({ target: { value: "getharbor.com" } });
  tree = settle(Connections);
  assert.match(textOf(byTestId(tree, "domain-local")), /@getharbor\.com/);
  press(byTestId(tree, "domain-save"));
  await flush();
  tree = settle(Connections);
  assert.deepEqual(added, [{ host: "getharbor.com", fromLocal: "sam", fromName: "Harbor Moving" }]);
  assert.equal(
    textOf(byTestId(tree, "domain-host-problem")),
    "This workspace already sends from that domain.",
    "the door's refusal lands under the box that caused it",
  );
});

test("the block is not drawn where own domains are off and there are none, nor before the mailbox exists", () => {
  asRole("owner");
  for (const email of [
    {
      ready: true,
      domain: "mail.chanlytics.com",
      mailbox: {
        id: "mb1",
        address: "harbor@mail.chanlytics.com",
        from_name: "Harbor",
        last_received_at: null,
        last_error: null,
      },
      sending: { ready: false, domains: [] },
    },
    { ready: true, domain: "mail.chanlytics.com", mailbox: null, sending: { ready: true, domains: [] } },
  ]) {
    globalThis.window.__SETUP = {
      dto: {
        business: { name: "Harbor Moving" },
        lines: { rows: [], ready: false },
        requests: { line: null },
        calendar: null,
        email,
      },
    };
    const tree = render(Connections);
    assert.equal(byTestId(tree, "sending-domains"), null, JSON.stringify(email.sending));
  }
});
