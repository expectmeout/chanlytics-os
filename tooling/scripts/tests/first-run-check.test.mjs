/**
 * The first run's Check (canvas R2, V2, P2), EXECUTED on the stub React over the Business tab's own harness: the first
 * run's page drawn beside every file the tab draws, so what Check draws is the tab's own rows, saving through the tab's
 * one saver and the workspace's door. Every claim below is something the page drew, or something a press on it sent.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_HELPERS, setupSteps } from "@chanlytics/contracts";
import { again, unmount, settle, all, byTestId, textOf, press } from "./_legacy-react.mjs";
import { W, saving, settings, facts, typeInto, saveRow } from "./_business-tab-harness.mjs";

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

// The first run's own globals, beside the tab's: its helpers as the bridge publishes them, the tab's memory of landing,
// and a toast that remembers what it said.
const flashes = [];
Object.assign(W, {
  __firstRun: FIRST_RUN_HELPERS,
  sessionStorage: { getItem: () => null, setItem() {} },
  usePPToast: () => [null, (m) => flashes.push(m)],
  __setup: { refresh: async () => {}, later: async () => ({ ok: true, message: "" }) },
});
await import("../../../apps/dashboard/src/legacy/pages/setup.jsx");
await import("../../../apps/dashboard/src/legacy/pages/first-run.jsx");

/* ------------------------------------ the workspace ------------------------------------ */

const NINE_TO_FIVE = { open: "09:00", close: "17:00" };
const HARBOR = {
  address: "12 Pier Rd, Brooklyn, NY 11231",
  website: "https://harbor.example.com/",
  hours: {
    mon: NINE_TO_FIVE,
    tue: NINE_TO_FIVE,
    wed: NINE_TO_FIVE,
    thu: NINE_TO_FIVE,
    fri: NINE_TO_FIVE,
    sat: {},
    sun: {},
  },
};
const LISTING = { name: "Harbor Moving", rating: 4.8, review_count: 12, checked_at: null, check_error: null };
/** What Setup read: a receptionist set up from Google's listing, with no services yet. */
const dto = (business = {}, google = {}) => ({
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 0,
    bookingLink: false,
    address: true,
    handoff: null,
    broken: false,
    ...business,
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
  google: { ready: true, places: true, listing: LISTING, connected: false, unsure: [], ...google },
});
const surface = (d, later = []) => ({
  dto: d,
  role: "owner",
  later,
  vm: setupSteps({ ...d, later }),
  fetchedAt: Date.now(),
});

let param = null;
const replaced = [];
const page = () =>
  W.React.createElement(W.FirstRun, {
    param,
    onNavigate: (to, o) => {
      if (o && o.replace) replaced.push(to);
    },
  });
/**
 * Draw the first run over a workspace, as React replaces a tree: the last one unmounted, the fold registry told nothing
 * is open, and the tab's saver and doors reset, since they outlive every page drawn in the tab (the harness says why).
 */
const draw = ({ setup = dto(), sellsBy = null, at = null, later = [] } = {}) => {
  param = at;
  W.__SETUP = surface(setup, later);
  W.__SETTINGS = settings(HARBOR, {}, { business_name: "Harbor Moving", booking_link: undefined });
  W.__FACTS = facts({
    facts: {
      business_name: { value: "Harbor Moving", source: "typed" },
      address: { value: HARBOR.address, source: "typed" },
      website: { value: HARBOR.website, source: "typed" },
      booking_link: { value: null, source: "absent" },
      voice_line: { value: null, source: "absent" },
    },
  });
  W.__WORKSPACES = [{ id: "t-harbor", name: "Harbor Moving", timezone: "America/New_York", sells_by: sellsBy }];
  W.__ACTIVE_WORKSPACE = "t-harbor";
  unmount();
  W.__recordFolds.reset();
  W.__businessTabSave.saver.reset();
  W.__businessTabSave.zone.reset();
  W.__businessTabSave.sellsBy.reset();
  return page();
};
const redraw = () => again(page);
/** The workspace's door for how customers buy (PATCH workspaces), recording what it was sent. */
const courier = () => {
  const sent = [];
  W.__workspace = {
    patch: async (fields) => {
      sent.push(fields);
      W.__WORKSPACES = W.__WORKSPACES.map((t) => (t.id === W.__ACTIVE_WORKSPACE ? { ...t, ...fields } : t));
      return { ok: true, workspace: fields, message: "" };
    },
  };
  return sent;
};
const answers = (tree) => all(byTestId(tree, "fr-sells-by-choice"), (n) => n.props?.role === "radio");

/* ------------------------------------ Check ------------------------------------ */

test("Check draws the Business tab's own rows over the settings read's brain, and how customers buy drawn open", () => {
  const tree = draw();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Here's what we found");
  for (const id of ["hours", "timezone", "address", "website", "booking_link", "guardrails", "services", "languages"]) {
    assert.ok(byTestId(tree, `rec-row-${id}`), `the tab's ${id} row`);
  }
  assert.match(textOf(byTestId(tree, "rec-row-address")), /12 Pier Rd, Brooklyn, NY 11231/);
  assert.ok(byTestId(tree, "fr-sells-by"), "the choice, not a row to open");
  assert.equal(byTestId(tree, "fr-rows"), null, "not Setup's rows");
});

test("a tap on how customers buy saves through the workspace's door, and the booking link's words follow the answer", async () => {
  const sent = courier();
  try {
    let tree = draw();
    assert.deepEqual(
      answers(tree).map((r) => r.props["aria-checked"]),
      [true, false],
      "until it is said, the first answer is shown",
    );
    assert.match(textOf(byTestId(tree, "rec-row-booking_link")), /Not set/);
    press(answers(tree)[1]);
    await settle();
    assert.deepEqual(sent, [{ sells_by: "proposal" }]);
    tree = redraw();
    assert.deepEqual(
      answers(tree).map((r) => r.props["aria-checked"]),
      [false, true],
    );
    assert.match(textOf(byTestId(tree, "rec-row-booking_link")), /None — it takes their details instead/);
    assert.equal(textOf(flashes.at(-1).msg), "Saved — deals are on.");
  } finally {
    delete W.__workspace;
  }
});

test("a row saves through the Business tab's one saver, as it does on the tab", () => {
  const sent = saving();
  let tree = draw();
  press(byTestId(tree, "rec-row-act-website"));
  tree = redraw();
  typeInto(tree, "website", "https://harbor-moving.example.com");
  tree = redraw();
  saveRow(tree, "website");
  assert.equal(sent.at(-1).config.brain.profile.website, "https://harbor-moving.example.com");
  assert.equal(sent.at(-1).config.brain.business_name, "Harbor Moving", "on the brain as it is stored");
});

test("the services row opens the Business tab's own sheet over the first run", () => {
  let tree = draw();
  assert.equal(byTestId(tree, "rec-sheet-services"), null);
  press(byTestId(tree, "rec-row-act-services"));
  tree = redraw();
  assert.ok(byTestId(tree, "rec-sheet-services"));
});

test("not on Google, said, where Google can be searched: the basics are asked, and Find is one press away", () => {
  const tree = draw({ setup: dto({}, { listing: null }), later: ["google"] });
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Tell us the basics");
  const find = byTestId(tree, "fr-check-find");
  assert.equal(textOf(find), "On Google after all? Find it");
  find.props.onClick();
  assert.equal(replaced.at(-1), "start/find");
  assert.equal(byTestId(draw(), "fr-check-find"), null, "a listing linked: nothing to find");
});

test("the days Google's hours could not be copied for are named under the hours", () => {
  const tree = draw({ setup: dto({}, { unsure: ["fri"] }) });
  assert.equal(
    textOf(byTestId(tree, "fr-check-unsure")),
    "Google's hours for Friday could not be copied: check that day.",
  );
  assert.equal(byTestId(draw(), "fr-check-unsure"), null, "and nothing when none");
});

test("Looks right is held with the facts row's own sentence until the step is done, and a press then sends nothing", () => {
  const sent = courier();
  try {
    const tree = draw();
    const onward = byTestId(tree, "fr-onward");
    assert.equal(textOf(onward), "Looks right");
    assert.equal(onward.props["aria-disabled"], true);
    assert.equal(onward.props["aria-describedby"], "fr-held");
    assert.equal(textOf(byTestId(tree, "fr-held")), "Still missing: services.");
    const before = replaced.length;
    onward.props.onClick();
    assert.deepEqual(sent, []);
    assert.equal(replaced.length, before, "and goes nowhere");
  } finally {
    delete W.__workspace;
  }
});

test("Looks right, the step done, sends the answer shown where none is stored and goes on once it is taken; with one stored, it goes on", async () => {
  const sent = courier();
  try {
    const done = dto({ services: 2 });
    let tree = draw({ setup: done, at: "business" });
    assert.equal(byTestId(tree, "fr-held"), null);
    const before = replaced.length;
    byTestId(tree, "fr-onward").props.onClick();
    await settle();
    assert.deepEqual(sent, [{ sells_by: "booking" }], "they book an appointment, as Check showed");
    assert.equal(replaced.length, before + 1);
    assert.equal(replaced.at(-1), "start");
    tree = draw({ setup: done, at: "business", sellsBy: "proposal" });
    byTestId(tree, "fr-onward").props.onClick();
    assert.equal(replaced.at(-1), "start");
    assert.equal(sent.length, 1, "an answer stored is not sent again");
  } finally {
    delete W.__workspace;
  }
});
