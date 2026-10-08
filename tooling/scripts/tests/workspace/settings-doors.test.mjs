/**
 * The doors that spend, file or disconnect gate the way the rest of the app does, and say what they mean.
 *
 * - Billing's doors to Stripe were disabled for a role that may not press them, with no reason the control could
 *   give; the headline carried Stripe's own word for the state ("trialing", "past due"), and an invoice said "paid" or
 *   "open" as Stripe says it (the wiring audit's S20).
 * - The business record hid Save and File from anyone but an owner, under a sentence of the form's own (the one gate).
 * - Choosing Google's location offered "Disconnect instead", which disconnected at once, where the row's own
 *   Disconnect asks first (S17).
 * Run against Settings › Billing and Settings › Connections (surfaces/settings/billing and surfaces/settings/connections,
 * TSX since decision 0015's step 11: the pane, the business record's form and the sending domains' block) on a stub
 * React, over data-bits' real gate, contracts' role table, view models and rows, the billing surface's own verbs and
 * words, and the connections' verbs (their module objects, stubbed by assignment: nothing here reaches the wire).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { IN_APP_CLASS, ROLE_PERMS, roleGate, stateOf, billingAccountDto, toChannelVM } from "@chanlytics/contracts";
import { kitPages, useStubHooks } from "../_legacy-react.mjs";

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
/** The classes the head's boot script stamps on the document (contracts inAppBootScript): the phone app's, in a case. */
const stamped = new Set();
globalThis.document = {
  documentElement: { classList: { contains: (c) => stamped.has(c) } },
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
/** The timers a page set with window.setInterval, held and run by a test: a tick is a call of its function. */
const intervals = [];
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
  setInterval: (fn, ms) => {
    intervals.push({ fn, ms, live: true });
    return intervals.length;
  },
  clearInterval: (h) => {
    if (intervals[h - 1]) intervals[h - 1].live = false;
  },
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
  // A surface's value through the seam (use-surface.ts): what it holds when the component draws.
  useSyncExternalStore: (subscribe, snapshot) => snapshot(),
  // The record kit's field names itself with React's useId when the page gives it no id.
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
};
globalThis.ReactDOM = { createPortal: (node) => node };
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
// data-bits installs the shell tip on import, so the test tip -- where a pressed gate showed its reason -- goes on after it.
globalThis.window.__tip = { show: (el) => tipped.push(el) };
Object.assign(globalThis.window, kitPages);
useStubHooks();
for (const k of ["EmptyState", "FailedRead", "StatePill", "Confirm"]) globalThis[k] = globalThis.window[k];
Object.assign(globalThis.window, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav() {}, R: {} },
  __chrome: { state: stateOf },
});
// The billing surface as the shell installs it: the pane's verbs are the module's object, which `__billing` is.
const { installBilling } = await import("../../../../apps/dashboard/src/surfaces/settings/billing/surface.ts");
installBilling(globalThis.window);
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
const { PaneBillingReal } = await import("../../../../apps/dashboard/src/surfaces/settings/billing/pane.tsx");
// Settings › Connections (surfaces/settings/connections): the pane, the business record's form, and the verbs each takes
// from a module object of its own (record.ts, domains.ts, mailbox.ts, whatsapp.ts, and the bridge's googleVerbs), which a
// test stubs by assigning onto it.
const SETTINGS = "../../../../apps/dashboard/src/surfaces/settings/connections";
const { PaneIntegrationsReal } = await import(`${SETTINGS}/pane.tsx`);
const { BusinessRecordForm } = await import(`${SETTINGS}/record-form.tsx`);
const { businessRecord } = await import(`${SETTINGS}/record.ts`);
const { sendingDomains } = await import(`${SETTINGS}/domains.ts`);
const { mailbox } = await import(`${SETTINGS}/mailbox.ts`);
const { waConnect, lineCodes, waStanding } = await import(`${SETTINGS}/whatsapp.ts`);
const { googleVerbs } = await import("../../../../apps/dashboard/src/legacy-bridge/google.ts");
const { MoreMenu } = await import("../../../../apps/dashboard/src/surfaces/kit/more-menu/more-menu.tsx");
// What every pane draw asks, and nothing here may send: Meta's door, asked once, has nothing to say, and the browser has
// come back from nowhere on Google's side.
Object.assign(waConnect, { config: async () => null });
// ...and so are what the open page asks beside it: the codes sent to the line, and the check of the number.
Object.assign(lineCodes, { read: async () => [] });
Object.assign(waStanding, { check: async () => true });
Object.assign(googleVerbs, { outcome: () => null, outcomeWords: {} });

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

const Billing = (props) => PaneBillingReal(props);
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
  setSurfaceValue("billing", {
    dto: { ready: true, livemode, account, price: PRICE, trial_days: 14, role: "owner" },
    fetchedAt: Date.now(),
  });
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

const Form = (props) => BusinessRecordForm(props);
/** The record's verbs and words (record.ts's `businessRecord`), assigned onto it: what `sent` collects never reaches the wire. */
const recordApi = (sent) => ({
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
  Object.assign(businessRecord, recordApi(sent));
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

/* ------------------------------ Billing says where WhatsApp is billed ------------------------------ */

test("Billing says, in contracts' words, that the WhatsApp messages the business starts are billed by Meta to the card on its WhatsApp account and not on this bill, and links Meta's own prices in a new tab", () => {
  asRole("owner");
  for (const over of [{ status: "none" }, { status: "active" }, { mode: "direct" }]) {
    billing(over);
    stripe();
    const tree = render(Billing, { flash() {} });
    const row = byTestId(tree, "billing-whatsapp");
    assert.ok(row, JSON.stringify(over));
    assert.equal(
      textOf(byTestId(row, "billing-whatsapp-line")),
      "WhatsApp messages your business starts are billed by Meta to the card on your WhatsApp account, not on this bill.",
      JSON.stringify(over),
    );
    const link = byTestId(row, "billing-whatsapp-link");
    assert.deepEqual(
      [textOf(link), link.props.href, link.props.target, link.props.rel],
      PRICES,
      "Meta's page of current rates (no rate is written in Chanlytics), in a new tab with nothing of this page's",
    );
  }
});

/* ------------------------------ Connections ------------------------------ */

const Connections = (props) => PaneIntegrationsReal(props);

/**
 * What the pane reads over the seam (surface-values.ts, through useSurface): the settings read's channels, Setup's value
 * (undefined before it is read, null where it failed) and Google's. A key a test does not name is held as it was.
 */
const seam = (held) => {
  if ("channels" in held) {
    setSurfaceValue("settings", {
      settings: null,
      facts: null,
      channels: held.channels,
      templatesAll: null,
      templateUse: null,
      templateSent: null,
    });
  }
  if ("setup" in held) setSurfaceValue("setup", held.setup);
  if ("google" in held) setSurfaceValue("google", held.google);
};
test("a connection on a phone offers its acts behind the row: one act is the row's press, two are its menu, Later offers nothing, and a desktop keeps the buttons", async () => {
  // 25 Sep: rows were 77 to 145px on a phone, each over a line of boxed buttons, Remove a thumb from Check now.
  asRole("owner");
  seam({
    channels: [],
    setup: null,
    google: {
      dto: {
        ready: { places: true, profile: false },
        listing: {
          place_id: "p1",
          name: "Northside Studio",
          address: "1 Main St, Springfield",
          maps_uri: null,
          business_status: "OPERATIONAL",
          rating: 4.8,
          review_count: 31,
          linked_at: "2026-09-15T14:00:00Z",
          checked_at: "2026-09-25T09:00:00Z",
          check_error: null,
        },
        connection: null,
      },
    },
  });
  Object.assign(googleVerbs, { unlink: async () => ({ ok: true, message: "" }) });
  render(Connections);
  await flush();
  const tree = settle(Connections);
  const listing = byTestId(tree, "connection-google_listing");
  assert.equal(listing.props["data-offers"], "menu", "Check now and Remove: two acts, a menu");
  // The kit's own MoreMenu, drawn: its node in the tree carries the items the row handed it.
  const menu = find(listing, (n) => n.type === MoreMenu);
  assert.ok(menu, "the row draws the kit's menu");
  assert.deepEqual(
    menu.props.items.map((i) => [i.label, !!i.danger]),
    [
      ["Remove", true],
      ["Check now", false],
    ],
  );
  assert.equal(menu.props.testid, "connection-google_listing-more");
  // The desktop's buttons are still the row's, with their names: the phone hides them (settings.css).
  assert.ok(byTestId(listing, "google-remove") && byTestId(listing, "google-check"));
  // The detail is its own line on a phone: the " · " is a desktop's, in a span of its own.
  const detail = find(listing, (n) => String(n.props?.className || "").includes("set-int-detail"));
  assert.match(textOf(detail), /1 Main St, Springfield/);
  for (const k of ["google_profile", "instagram", "deposits"]) {
    const later = byTestId(tree, `connection-${k}`);
    assert.equal(later.props["data-offers"], "none", `${k}: a Later row offers a thumb nothing`);
    assert.equal(later.props.onClick, undefined, `${k}: and is no press`);
  }
  // Pressing the menu's Remove asks first, as the row's own Remove does.
  menu.props.items[0].onClick();
  await flush();
  assert.match(textOf(settle(Connections)), /Remove the listing\?/);
});

test("REGRESSION (S17): 'Disconnect instead' asks first, as the row's own Disconnect does -- it disconnected Google at once", async () => {
  asRole("owner");
  const done = [];
  seam({
    channels: [],
    setup: null,
    // Connected, with the location still to choose: the row's body is the chooser.
    google: {
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
  });
  Object.assign(googleVerbs, {
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
  // The mailbox's two acts are the module's object (mailbox.ts); its rules for what may be typed stay contracts' own.
  Object.assign(mailbox, {
    create: async (input) => {
      asked.push(input);
      return answer;
    },
  });
  const email = { ready: true, domain: "mail.chanlytics.com", mailbox: null };
  seam({
    channels: [],
    google: null,
    setup: {
      dto: {
        business: { name: "Best Movers" },
        lines: { rows: [], ready: false },
        requests: { line: null },
        calendar: null,
        email,
      },
    },
  });
  Object.assign(globalThis.window, { refusalToast: (r) => ({ tone: "danger", msg: r.message }) });
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

/* ------------------------------ what Connections asks while it is open ------------------------------ */

/** The workspace's own line, as Setup holds it, and what Setup says around it for the pane. */
const OWN_LINE = {
  id: "l1",
  e164: "+16465550100",
  kind: "chanlytics",
  provider: "twilio",
  area_code: 646,
  voice_state: "answering",
  sms_state: "active",
  whatsapp_state: "none",
  port_state: "none",
  forwarding_state: "none",
  step: null,
  last_error: null,
  state_since: "2026-09-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
};
const setupWithLine = () => ({
  dto: {
    business: { name: "Best Movers" },
    lines: { rows: [OWN_LINE], ready: true },
    requests: { line: null },
    calendar: null,
    email: null,
  },
});
/** What a row says under its sentence, one string a note (the words, not the link after them). */
/**
 * Press the quiet press beside a row's name, and draw again: what the row says besides (what Meta will ask, what it costs)
 * opens in place under its name. What happened or waits is on the row without it.
 */
const openAbout = (kind) => {
  press(byTestId(settle(Connections), `connection-${kind}-why`));
  return settle(Connections);
};
const noteTexts = (tree, kind) =>
  all(byTestId(tree, `connection-${kind}`), (n) => n.props?.["data-testid"] === "connection-note-text").map(textOf);
/** The links its notes carry: each one's words, where it goes, and how it opens. */
const noteLinks = (tree, kind) =>
  all(
    byTestId(tree, `connection-${kind}`),
    // The kit's link and what it draws carry one test id: the link itself is the first of them.
    (n) => n.props?.["data-testid"] === "connection-note-link" && n.type?.name === "LinkButton",
  ).map((n) => [textOf(n), n.props.href, n.props.target, n.props.rel]);
/** What WhatsApp costs, said last under the Connect row (contracts WHATSAPP_COST_WORDS): one line, with Meta's prices after it. */
const COST = [
  "Meta bills WhatsApp to the card on your WhatsApp account, not your Chanlytics bill, so add one when Meta asks: replies within 24 hours of a customer's message are free; reminders sent after that, and campaigns, are charged for each one Meta delivers.",
];
const PRICES = [
  "Meta's current prices",
  "https://business.whatsapp.com/products/platform-pricing#rates",
  "_blank",
  "noopener noreferrer",
];
const MIN = 60_000;
/** The WhatsApp channel as the settings read holds it, with what Meta holds about the number and when it was read. */
const whatsappChannel = (standing, readAgoMs, over = {}) =>
  toChannelVM({
    id: "ch-wa",
    kind: "whatsapp",
    number_e164: "+13055550188",
    status: "active",
    created_at: "2026-09-01T00:00:00Z",
    last_inbound_at: null,
    standing,
    standing_read_at: readAgoMs === null ? null : new Date(Date.now() - readAgoMs).toISOString(),
    ...over,
  });

test("a Connect row draws what Meta will ask under its sentence; a sign-up an earlier page left open is named first, and forgotten the moment Connect is pressed again", async () => {
  asRole("owner");
  seam({ channels: [], google: null, setup: null });
  const realStart = waConnect.start;
  let finish;
  Object.assign(waConnect, {
    config: async () => ({ ready: true, reason: null }),
    start: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  // The page that began a sign-up five minutes ago is gone: its mark is what a page that opens now finds.
  globalThis.sessionStorage.setItem("chanlytics.whatsapp.signup", new Date(Date.now() - 5 * MIN).toISOString());
  try {
    render(Connections);
    await flush();
    let tree = settle(Connections);
    // What happened is on the row, always, in the row's own hint style: the sign-up an earlier page left open.
    assert.equal(noteTexts(tree, "whatsapp").length, 1);
    const box = byTestId(tree, "connection-whatsapp-notes");
    assert.match(String(box.props.className), /\bset-int-notes\b/, "each note a line of its own");
    // What Meta will ask and what it costs wait behind the quiet press beside the row's name (7 Oct 2026: "all extra
    // info should be on a need to know"), where they stood under every name, four lines to a row. They open in place.
    assert.equal(byTestId(tree, "connection-whatsapp-about"), null, "shut until asked");
    assert.equal(byTestId(tree, "connection-whatsapp-why").props["aria-expanded"], false);
    tree = openAbout("whatsapp");
    assert.equal(byTestId(tree, "connection-whatsapp-why").props["aria-expanded"], true);
    const notes = noteTexts(tree, "whatsapp");
    assert.equal(notes.length, 4, "the one it left behind, and the three the owner meets before and in Meta's window");
    assert.match(notes[0], /^A WhatsApp sign-up was started here and did not come back to Chanlytics/);
    assert.match(notes[1], /^Meta asks you to sign in with Facebook/);
    assert.match(notes[2], /^Meta texts a code to the number.* Keep this page open until Meta's window closes\.$/);
    assert.deepEqual(notes.slice(3), COST, "what WhatsApp costs and the card Meta asks for, last");
    assert.deepEqual(noteLinks(tree, "whatsapp"), [PRICES], "one link, to Meta's own prices, which opens in a new tab");
    press(byTestId(tree, "connect-whatsapp-btn"));
    tree = settle(Connections);
    assert.equal(
      noteTexts(tree, "whatsapp").length,
      3,
      "pressing Connect again forgets what the earlier page left behind",
    );
    finish({
      ok: false,
      reason: "cancelled",
      message: "The sign-up was closed before it finished. Nothing was connected.",
    });
    await flush();
    assert.equal(
      noteTexts(settle(Connections), "whatsapp").length,
      3,
      "and a sign-up that was cancelled does not bring it back",
    );
  } finally {
    Object.assign(waConnect, { config: async () => null, start: realStart });
    globalThis.sessionStorage.removeItem("chanlytics.whatsapp.signup");
  }
});

test("Meta's SDK is fetched ahead only where the row offers Connect to someone who may press it, and while Meta's window is open the button says it is waiting", async () => {
  // 7 October: on a phone the press did nothing. The window has to be asked for inside the press, so what the press needs is
  // fetched as the page opens (whatsapp.ts prepareSignup); and a sign-up under way dimmed the button without a word.
  asRole("owner");
  const realStart = waConnect.start;
  const realPrepare = waConnect.prepare;
  const prepared = [];
  const door = { ready: true, reason: null, canConnect: true };
  let finish;
  Object.assign(waConnect, {
    config: async () => door,
    prepare: (cfg) => prepared.push(cfg),
    start: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const said = (tree) => textOf(byTestId(tree, "connect-whatsapp-btn"));
  try {
    seam({ channels: [], google: null, setup: null });
    render(Connections);
    assert.deepEqual(prepared, [], "nothing is fetched before Meta's door has answered");
    await flush();
    let tree = settle(Connections);
    assert.deepEqual(prepared, [door], "the door is ready and the row offers Connect: the SDK is fetched, once");
    assert.equal(said(tree), "Connect WhatsApp");
    press(byTestId(tree, "connect-whatsapp-btn"));
    tree = settle(Connections);
    assert.equal(said(tree), "Waiting for Meta…", "a sign-up under way says so on the button it dims");
    assert.equal(byTestId(tree, "connect-whatsapp-btn").props.disabled, true);
    const blocked = "Meta's window was blocked. Press Connect WhatsApp again.";
    finish({ ok: false, reason: "blocked", message: blocked });
    await flush();
    tree = settle(Connections);
    assert.equal(said(tree), "Connect WhatsApp", "and the button is the row's act again once it has ended");
    assert.equal(byTestId(tree, "connect-whatsapp-btn").props.disabled, false);
    assert.equal(prepared.length, 1, "drawing again fetches nothing again");
    // What it came to stays on the row, first and in full: the toast that says it is one line on a phone, and gone in seconds.
    // On the row itself, with no press: what Meta will ask is behind the row's quiet press, and this is not.
    assert.deepEqual(noteTexts(tree, "whatsapp"), [blocked]);
    tree = openAbout("whatsapp");
    assert.deepEqual(noteTexts(tree, "whatsapp").slice(0, 2), [
      blocked,
      "Meta asks you to sign in with Facebook and choose or create your business.",
    ]);
    press(byTestId(tree, "connect-whatsapp-btn"));
    tree = settle(Connections);
    assert.ok(!noteTexts(tree, "whatsapp").includes(blocked), "pressing Connect again forgets it");
    finish({ ok: false, reason: "cancelled", message: "The sign-up was closed before it finished." });
    await flush();
    tree = settle(Connections);
    assert.equal(noteTexts(tree, "whatsapp").length, 3, "a window the owner closed is theirs to know: nothing is kept");

    // A number is connected already: the row has no Connect, and Meta's SDK is nobody's to fetch.
    prepared.length = 0;
    seam({ channels: [whatsappChannel(null, null)], google: null, setup: null });
    render(Connections);
    await flush();
    settle(Connections);
    assert.deepEqual(prepared, []);

    // A member who may not connect a number: the server said so (canConnect), and nothing is fetched for a press they cannot make.
    Object.assign(waConnect, { config: async () => ({ ...door, canConnect: false }) });
    seam({ channels: [], google: null, setup: null });
    render(Connections);
    await flush();
    settle(Connections);
    assert.deepEqual(prepared, []);
  } finally {
    Object.assign(waConnect, { config: async () => null, start: realStart, prepare: realPrepare });
  }
});

test("the codes sent to the workspace's own line are asked for as Connections opens and every three seconds while Meta's window is open, and said on the Texting row; a read that fails changes nothing, and anyone but an owner asks nothing", async () => {
  asRole("owner");
  seam({ channels: [], google: null, setup: setupWithLine() });
  const asked = [];
  let codes = [];
  const realRead = lineCodes.read;
  const realStart = waConnect.start;
  let finish;
  Object.assign(lineCodes, {
    read: async () => {
      asked.push(asked.length);
      if (codes === "down") throw new Error("the edge is down");
      return codes;
    },
  });
  Object.assign(waConnect, {
    config: async () => ({ ready: true, reason: null }),
    start: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  intervals.length = 0;
  try {
    render(Connections);
    await flush();
    let tree = settle(Connections);
    assert.equal(asked.length, 1, "asked once as the page opens");
    assert.deepEqual(
      intervals.filter((i) => i.live),
      [],
      "and not again until Meta's window is open",
    );
    assert.deepEqual(noteTexts(tree, "sms"), [], "no code, no note");

    codes = [{ code: "788-963", from: "WhatsApp", at: new Date(Date.now() - 2 * MIN).toISOString() }];
    press(byTestId(tree, "connect-whatsapp-btn"));
    tree = settle(Connections);
    const timer = intervals.filter((i) => i.live);
    assert.deepEqual(
      timer.map((i) => i.ms),
      [3000],
      "every three seconds while Meta's window is open",
    );
    timer[0].fn();
    await flush();
    tree = settle(Connections);
    assert.equal(asked.length, 2);
    assert.deepEqual(noteTexts(tree, "sms"), [
      "Code from WhatsApp: 788-963 · 2m ago",
      "Codes sent to this line are never answered and never become people.",
    ]);
    codes = "down";
    timer[0].fn();
    await flush();
    tree = settle(Connections);
    assert.equal(asked.length, 3);
    assert.equal(noteTexts(tree, "sms").length, 2, "a read that fails changes nothing: the page keeps what it has");

    finish({
      ok: false,
      reason: "cancelled",
      message: "The sign-up was closed before it finished. Nothing was connected.",
    });
    await flush();
    settle(Connections);
    assert.deepEqual(
      intervals.filter((i) => i.live),
      [],
      "the sign-up ended: nobody is waiting for a code any more",
    );

    asRole("operator");
    const before = asked.length;
    render(Connections);
    await flush();
    assert.equal(asked.length, before, "an operator is never shown a code, so it is never asked for");
  } finally {
    Object.assign(lineCodes, { read: realRead });
    Object.assign(waConnect, { config: async () => null, start: realStart });
    asRole("owner");
  }
});

test("a page that opens on a standing that is missing, or one that is not AVAILABLE and ten minutes old, asks Meta once; a fresh one, an AVAILABLE one, a number that is off, and a page that is not an owner's ask nothing", async () => {
  const checks = [];
  const realCheck = waStanding.check;
  Object.assign(waStanding, {
    check: async () => {
      checks.push("asked");
      return true;
    },
  });
  const LIMITED = {
    can_send: "LIMITED",
    problems: [],
    notes: [],
    name: null,
    name_status: null,
    verification: null,
    limit: null,
    has_payment_method: null,
    owner_business_id: null,
    waba_id: null,
  };
  const opens = async (channels, role = "owner") => {
    checks.length = 0;
    asRole(role);
    seam({ channels, google: null, setup: null });
    render(Connections);
    await flush();
    settle(Connections);
    return checks.length;
  };
  try {
    assert.equal(await opens([whatsappChannel(null, null)]), 1, "nothing was kept");
    assert.equal(
      await opens([whatsappChannel({ ...LIMITED, can_send: "AVAILABLE" }, 2 * 24 * 60 * MIN)]),
      0,
      "AVAILABLE is the clock's to renew",
    );
    assert.equal(await opens([whatsappChannel(LIMITED, 5 * MIN)]), 0, "not available, read five minutes ago");
    assert.equal(
      await opens([whatsappChannel(LIMITED, 11 * MIN)]),
      1,
      "not available and eleven minutes old: a payment method added since shows as fixed now",
    );
    assert.equal(await opens([whatsappChannel(LIMITED, 11 * MIN)], "operator"), 0, "an operator's page never asks");
    assert.equal(await opens([]), 0, "no number connected: nothing to ask about");
    assert.equal(
      await opens([whatsappChannel(null, null, { status: "disabled" })]),
      0,
      "a number that is switched off",
    );
    assert.equal(await opens(null), 0, "the channels could not be read");
  } finally {
    Object.assign(waStanding, { check: realCheck });
    asRole("owner");
  }
});

test("the WhatsApp row draws what Meta holds: a number whose account has no payment method waits on the owner, its one act is Meta's billing page in a new tab, and its one note is the verification with Meta's page after it", async () => {
  asRole("owner");
  const blocked = {
    can_send: "BLOCKED",
    problems: [
      {
        entity: "WABA",
        code: 141006,
        said: "A payment method is required to send messages",
        fix: "Add a payment method in WhatsApp Manager",
      },
    ],
    notes: [],
    name: "Harbor Moving",
    name_status: "APPROVED",
    verification: "not_verified",
    limit: "TIER_250",
    // The account has no payment method on file, and says which business owns it: the row's act is Meta's page to add one.
    has_payment_method: false,
    owner_business_id: "410540000000001",
    waba_id: "205540000000001",
  };
  seam({ channels: [whatsappChannel(blocked, 0)], google: null, setup: null });
  render(Connections);
  await flush();
  const tree = settle(Connections);
  const row = byTestId(tree, "connection-whatsapp");
  assert.equal(row.props["data-state"], "attention");
  assert.equal(
    textOf(find(row, (n) => n.props?.className === "set-team-mail")),
    "Meta needs a payment method on your WhatsApp account before it delivers reminders and campaigns.",
  );
  const verb = byTestId(row, "connection-whatsapp-verb");
  assert.deepEqual(
    [textOf(verb), verb.props.href, verb.props.target, verb.props.rel],
    [
      "Add a card",
      "https://business.facebook.com/billing_hub/accounts/details/?business_id=410540000000001&asset_id=205540000000001&wizard_name=ADD_PM&account_type=whatsapp-business-account",
      "_blank",
      "noopener noreferrer",
    ],
    "the row's one act: Meta's own page for this business and this account, in a new tab",
  );
  // What Meta holds, to act on "when you need more", is behind the row's quiet press: the row says the one thing to do.
  assert.deepEqual(noteTexts(tree, "whatsapp"), []);
  const opened = openAbout("whatsapp");
  assert.deepEqual(noteTexts(opened, "whatsapp"), [
    "Not verified with Meta: customers see your number instead of your name, and you can start conversations with up to 250 people a day. Verify when you need more.",
  ]);
  assert.deepEqual(
    noteLinks(opened, "whatsapp"),
    [
      [
        "Verify in Meta",
        "https://business.facebook.com/settings/security?business_id=410540000000001",
        "_blank",
        "noopener noreferrer",
      ],
    ],
    "Meta's Security Center for the business that owns the account, in a new tab",
  );
  const drawn = textOf(row);
  assert.ok(
    !drawn.includes("WhatsApp Manager") && !drawn.includes("bills"),
    "nothing of Meta's prose, nothing of what it costs",
  );
  assert.deepEqual(noteTexts(tree, "google_profile"), [], "a row with no notes draws no box");
  assert.equal(byTestId(tree, "connection-google_profile-notes"), null);
});

/* ------------------------------ the attention row ------------------------------ */

test("REGRESSION (S23): the attention row's buttons say they are busy and take no second press while their verb is on its way", async () => {
  // The kit's row (surfaces/kit/attention/attn-row.tsx), the one every page draws.
  const { AttnRow } = await import("../../../../apps/dashboard/src/surfaces/kit/attention/attn-row.tsx");
  const row = (cta, also) =>
    render(AttnRow, {
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
  stamped.add(IN_APP_CLASS);
  try {
    const tree = render(Billing, { flash() {} });
    assert.equal(byTestId(tree, "billing-checkout"), null, "no Start the trial");
    assert.equal(byTestId(tree, "billing-portal"), null, "no Manage billing");
    assert.equal(byTestId(tree, "billing-resume"), null);
    assert.equal(textOf(byTestId(tree, "billing-in-app")), "Billing is managed from Chanlytics on the web.");
    assert.ok(byTestId(tree, "billing-headline"), "the status stays");
    assert.ok(!textOf(tree).includes("Stripe"), "and no door names Stripe");
  } finally {
    stamped.delete(IN_APP_CLASS);
  }
  const tree = render(Billing, { flash() {} });
  assert.ok(byTestId(tree, "billing-checkout"), "on the web the door is back");
  assert.equal(byTestId(tree, "billing-in-app"), null);
});

/* ------------------------------ the domains you send from ------------------------------ */

test("the domains you send from: under the Email row, each in contracts' words, its records to copy, and an add judged under its own box", async () => {
  asRole("owner");
  const added = [];
  // The domains' acts are the module's object (domains.ts); the words and rules it holds stay contracts' own.
  Object.assign(sendingDomains, {
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
          sent_days: 16,
          records: [],
        },
      ],
    },
  };
  seam({
    channels: [],
    google: null,
    setup: {
      dto: {
        business: { name: "Harbor Moving" },
        lines: { rows: [], ready: false },
        requests: { line: null },
        calendar: null,
        email,
      },
    },
  });
  Object.assign(globalThis.window, { refusalToast: (r) => ({ tone: "danger", msg: r.message }) });
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
  // The part before the domain, as most registrars ask for it (they add the domain), and the hint that says so.
  assert.match(textOf(records), /resend\._domainkey/);
  assert.doesNotMatch(textOf(records), /resend\._domainkey\.getharbor\.com/, "never the domain twice");
  assert.match(textOf(records), /Some registrars add getharbor\.com for you/);
  assert.match(textOf(records), /_dmarc/, "and the DMARC record we recommend while it has none");
  assert.match(textOf(records), /v=DMARC1; p=none;/);

  const verified = byTestId(tree, "domain-harbor-mail.com");
  assert.match(textOf(verified), /Verified/);
  // The ramp reads the days it sent (D15): sixteen of the twenty since it was clean.
  assert.match(textOf(verified), /16 days sending/);
  assert.match(textOf(verified), /Up to 100 a day/);
  assert.match(textOf(verified), /200 a day after 14 more days of sending/);
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
    seam({
      setup: {
        dto: {
          business: { name: "Harbor Moving" },
          lines: { rows: [], ready: false },
          requests: { line: null },
          calendar: null,
          email,
        },
      },
    });
    const tree = render(Connections);
    assert.equal(byTestId(tree, "sending-domains"), null, JSON.stringify(email.sending));
  }
});

test("a held domain: a DNS hold shows its records and Check, a reputation hold offers Resume instead, and a non-owner is told once why they can't act", () => {
  const now = Date.now();
  const iso = (d) => new Date(now - d * 86_400_000).toISOString();
  const held = (id, host, why) => ({
    id,
    host,
    address: `sam@${host}`,
    from_local: "sam",
    from_name: "Sam",
    state: "held",
    held_why: why,
    held_at: iso(1),
    provider_status: why === "verification" ? "temporary_failure" : "verified",
    dmarc: "found",
    verified_at: iso(30),
    clean_since: iso(9),
    checked_at: null,
    created_at: iso(31),
    records: [
      { label: "DKIM", type: "TXT", name: "resend._domainkey", value: "p=MIGf", priority: null, status: "failed" },
    ],
  });
  const email = {
    ready: true,
    domain: "mail.chanlytics.com",
    mailbox: {
      id: "mb1",
      address: "harbor@mail.chanlytics.com",
      from_name: "Harbor",
      last_received_at: null,
      last_error: null,
    },
    sending: {
      ready: true,
      domains: [held("h1", "broke.example", "verification"), held("h2", "spam.example", "complaint")],
    },
  };
  seam({
    setup: {
      dto: {
        business: { name: "Harbor" },
        lines: { rows: [], ready: false },
        requests: { line: null },
        calendar: null,
        email,
      },
    },
  });
  asRole("owner");
  let tree = render(Connections);
  assert.ok(byTestId(tree, "domain-records-broke.example"), "the records to fix are shown");
  assert.ok(byTestId(tree, "domain-check-broke.example"));
  assert.match(textOf(byTestId(tree, "domain-broke.example")), /it stopped verifying/);
  assert.equal(byTestId(tree, "domain-records-spam.example"), null);
  assert.equal(byTestId(tree, "domain-check-spam.example"), null, "a reputation hold is not lifted by Check");
  assert.match(textOf(byTestId(tree, "domain-spam.example")), /until you resume it/);
  assert.ok(byTestId(tree, "domain-resume-spam.example"), "the owner resumes a reputation hold");
  assert.equal(byTestId(tree, "domain-resume-broke.example"), null, "a DNS hold lifts itself: nothing to resume");

  asRole("operator");
  tree = render(Connections);
  const block = byTestId(tree, "sending-domains");
  assert.match(textOf(block), /add, check, resume or remove a domain/i, "the reason, said once");
  assert.equal(byTestId(tree, "domain-remove-broke.example"), null);
  asRole("owner");
});

test("the records draw as a table a registrar can take: each name and value copied on its own, labelled for a screen reader", () => {
  const now = Date.now();
  const iso = (d) => new Date(now - d * 86_400_000).toISOString();
  const setup = {
    dto: {
      business: { name: "Harbor" },
      lines: { rows: [], ready: false },
      requests: { line: null },
      calendar: null,
      email: {
        ready: true,
        domain: "mail.chanlytics.com",
        mailbox: {
          id: "mb1",
          address: "harbor@mail.chanlytics.com",
          from_name: "Harbor",
          last_received_at: null,
          last_error: null,
        },
        sending: {
          ready: true,
          domains: [
            {
              id: "r1",
              host: "getharbor.com",
              address: "sam@getharbor.com",
              from_local: "sam",
              from_name: "Sam",
              state: "records",
              held_why: null,
              held_at: null,
              provider_status: "not_started",
              dmarc: "missing",
              verified_at: null,
              clean_since: null,
              counted_since: null,
              checked_at: null,
              created_at: iso(1),
              sent_recent: null,
              bounced_recent: null,
              complaints: null,
              records: [
                {
                  label: "SPF",
                  type: "MX",
                  name: "send",
                  value: "feedback-smtp.us-east-1.amazonses.com",
                  priority: 10,
                  status: "not_started",
                },
                {
                  label: "DKIM",
                  type: "TXT",
                  name: "resend._domainkey",
                  value: "p=MIGf",
                  priority: null,
                  status: "verified",
                },
              ],
            },
          ],
        },
      },
    },
  };
  seam({ setup });
  asRole("owner");
  const tree = render(Connections);
  const table = byTestId(tree, "domain-records-getharbor.com");
  assert.ok(table, "the records are drawn");
  const text = textOf(table);
  assert.match(text, /Return path/);
  assert.match(text, /Signing \(DKIM\)/);
  assert.match(text, /Policy \(DMARC\)/);
  assert.match(text, /These records tell Gmail and others/);
  assert.ok(byTestId(tree, "domain-copy-name-send-MX"), "the name has its own Copy");
  assert.ok(byTestId(tree, "domain-copy-value-send-MX"), "and so does the value");
  assert.equal(byTestId(tree, "domain-copy-value-send-MX").props["aria-label"], "Copy the Return path value");
  assert.ok(byTestId(tree, "domain-found-resend._domainkey-TXT"), "a record the provider reads says so");
});

test("a person deletes their own account from Settings, in two steps, and the door's refusal is said where it happened (App Store 5.1.1(v), 00190)", async () => {
  asRole("owner");
  // Profile is TSX (surfaces/settings/profile, decision 0015 step 11); its two doors are the bridge's meVerbs.
  const { PaneProfile } = await import("../../../../apps/dashboard/src/surfaces/settings/profile/pane.tsx");
  const { meVerbs } = await import("../../../../apps/dashboard/src/legacy-bridge/identity.ts");
  const Profile = (props) => PaneProfile(props);
  const calls = [];
  const real = { ...meVerbs };
  Object.assign(meVerbs, {
    setName: async () => ({ ok: true, name: "", message: "" }),
    deleteAccount: async () => {
      calls.push("delete");
      return {
        ok: false,
        message: "You are the only owner of a workspace with other members. Make someone else an owner first.",
      };
    },
  });
  try {
    let tree = render(Profile, { flash() {} });
    assert.ok(byTestId(tree, "set-profile-delete"), "the row is there for everyone");
    assert.equal(byTestId(tree, "set-profile-delete-confirm"), null, "and asks first");
    press(byTestId(tree, "set-profile-delete"));
    tree = settle(Profile, { flash() {} });
    assert.ok(byTestId(tree, "set-profile-delete-confirm"), "armed: the sentence and the one button");
    assert.ok(textOf(tree).includes("keeps its records for the business"), "what stays is said before the button");
    press(byTestId(tree, "set-profile-delete-go"));
    await flush();
    tree = settle(Profile, { flash() {} });
    assert.deepEqual(calls, ["delete"]);
    assert.ok(textOf(tree).includes("Make someone else an owner first"), "the door's refusal, where it happened");
  } finally {
    Object.assign(meVerbs, real);
  }
});
