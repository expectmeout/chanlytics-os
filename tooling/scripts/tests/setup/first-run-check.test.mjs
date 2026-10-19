/**
 * The first run's Check (canvas R2, V2, P2), EXECUTED on the stub React over the Business tab's own harness: the first
 * run's page (surfaces/setup/first-run, TSX since decision 0015 step 10) drawn beside every file the tab draws, so what
 * Check draws is the tab's own rows, saving through the tab's one saver and the workspace's door. Every claim below is
 * something the page drew, or something a press on it sent.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_HELPERS, setupSteps, PROFILE_LIMITS, profileRefusal } from "@chanlytics/contracts";
import { again, unmount, settle, all, byTestId, textOf, press } from "../_legacy-react.mjs";
import { importSrc } from "../_source.mjs";
import { W, saving, settings, facts, typeInto, saveRow } from "../_business-tab-harness.mjs";

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

// The first run's own globals, beside the tab's: the tab's memory of landing, and a toast that remembers what it said.
// The page's helpers (FIRST_RUN_HELPERS) and the tab's state of a row are imported by the TSX, not read off the window.
const flashes = [];
Object.assign(W, {
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  usePPToast: () => [null, (m) => flashes.push(m)],
});
// Setup's verbs are the module object the TSX calls; stubbed in place, and `window.__setup` is the same object.
const { setupVerbs } = await importSrc("apps/dashboard/src/surfaces/setup/surface.ts");
Object.assign(setupVerbs, { refresh: async () => {}, later: async () => ({ ok: true, message: "" }) });
W.__setup = setupVerbs;
// The seam the page reads Setup and the settings read from, and the kit's registry of open folds it asks before a move.
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { recFolds } = await importSrc("apps/dashboard/src/surfaces/kit/record/registry.ts");
const { FirstRun } = await importSrc("apps/dashboard/src/surfaces/setup/first-run/page.tsx");

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
    receptionist: "set",
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
  google: {
    ready: true,
    places: true,
    listing: LISTING,
    connected: false,
    unsure: [],
    type: "moving_company",
    ...google,
  },
});
const surface = (d, later = []) => ({
  dto: d,
  role: "owner",
  later,
  vm: setupSteps({ ...d, later }),
  fetchedAt: Date.now(),
});

let param = null;
// A move to another step is a pushed entry (`went`); a move within the step drawn replaces the address (`replaced`).
const replaced = [];
const went = [];
/** Every move the page made, of either kind. */
const moves = () => replaced.length + went.length;
const page = () =>
  W.React.createElement(FirstRun, {
    param,
    onNavigate: (to, o) => {
      (o && o.replace ? replaced : went).push(to);
    },
  });
/**
 * The settings read as the settings override lands it (legacy-bridge/surfaces/settings.ts): the window globals the
 * Business tab's rows and its saver still read (`__SETTINGS`, `__FACTS`), and the seam's value the first run reads.
 */
const landSettings = (record, known) => {
  W.__SETTINGS = record;
  W.__FACTS = known;
  setSurfaceValue("settings", {
    settings: record,
    facts: known,
    channels: null,
    templatesAll: null,
    templateUse: null,
    templateSent: null,
  });
};
/**
 * Draw the first run over a workspace, as React replaces a tree: the last one unmounted, the fold registry told nothing
 * is open, and the tab's saver and doors reset, since they outlive every page drawn in the tab (the harness says why).
 */
const draw = ({ setup = dto(), at = null, later = [], link = undefined, profile = HARBOR } = {}) => {
  param = at;
  setSurfaceValue("setup", surface(setup, later));
  landSettings(
    settings(profile, {}, { business_name: "Harbor Moving", booking_link: link }),
    facts({
      facts: {
        business_name: { value: "Harbor Moving", source: "typed" },
        address: { value: HARBOR.address, source: "typed" },
        website: { value: HARBOR.website, source: "typed" },
        booking_link: { value: null, source: "absent" },
        voice_line: { value: null, source: "absent" },
      },
    }),
  );
  W.__WORKSPACES = [{ id: "t-harbor", name: "Harbor Moving", timezone: "America/New_York" }];
  W.__ACTIVE_WORKSPACE = "t-harbor";
  unmount();
  recFolds.reset();
  W.__businessTabSave.saver.reset();
  W.__businessTabSave.zone.reset();
  W.__businessTabSave.word.reset();
  return page();
};
const redraw = () => again(page);
/** The workspace's door (PATCH workspaces), recording what it was sent: the first run sends it nothing now. */
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

/* ------------------------------------ Check ------------------------------------ */

test("Check draws the Business tab's own rows over the settings read's brain, and asks nothing of how customers buy", () => {
  const tree = draw();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Here's what we found");
  for (const id of ["hours", "timezone", "address", "website", "booking_link", "guardrails", "services"]) {
    assert.ok(byTestId(tree, `rec-row-${id}`), `the tab's ${id} row`);
  }
  assert.equal(byTestId(tree, "rec-row-languages"), null, "the languages are chips, at rest in the row's place");
  assert.ok(byTestId(tree, "fr-chips-languages"));
  assert.match(textOf(byTestId(tree, "rec-row-address")), /12 Pier Rd, Brooklyn, NY 11231/);
  assert.equal(
    byTestId(tree, "fr-sells-by"),
    null,
    "every workspace has deals (0008, amended 18 Oct 2026): nothing to ask",
  );
  assert.equal(byTestId(tree, "fr-rows"), null, "not Setup's rows");
});

test("the booking link is an offer to every business: with none, its row says it takes their details instead", () => {
  const tree = draw();
  assert.match(textOf(byTestId(tree, "rec-row-booking_link")), /None — it takes their details instead/);
  assert.equal(byTestId(tree, "fr-check-quotes"), null, "no note in the row's place: the row is drawn");
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

test("a link on file is the row's value: nothing it stored is hidden", () => {
  const tree = draw({ link: "https://book.example.com/harbor" });
  assert.match(textOf(byTestId(tree, "rec-row-booking_link")), /book\.example\.com\/harbor/);
  assert.equal(byTestId(tree, "fr-check-quotes"), null);
});

test("Check stays on screen once its last fact lands, and Looks right goes on: the page does not move under the owner", async () => {
  const sent = courier();
  try {
    let tree = draw();
    assert.equal(textOf(byTestId(tree, "fr-held")), "Still missing: services.");
    // A service saved in the sheet: Setup reads again, and the business step is done.
    setSurfaceValue("setup", surface(dto({ services: 1 })));
    tree = redraw();
    assert.equal(textOf(byTestId(tree, "fr-heading")), "Here's what we found", "still Check, not the phone");
    assert.equal(byTestId(tree, "fr-held"), null, "and Looks right is not held");
    const before = replaced.length;
    byTestId(tree, "fr-onward").props.onClick();
    await settle();
    assert.deepEqual(sent, [], "nothing of how customers buy is sent");
    assert.equal(replaced.length, before + 1);
    tree = redraw();
    assert.equal(
      textOf(byTestId(tree, "fr-heading")),
      "Your phone",
      "once the owner goes on, the first run is where the workspace is",
    );
  } finally {
    delete W.__workspace;
  }
});

test("a role that may not change the business goes on with Looks right and sends nothing it would be refused", () => {
  const sent = courier();
  const was = W.canDo;
  W.canDo = (a) => a !== "settings";
  try {
    const tree = draw({ setup: dto({ services: 2 }), at: "business" });
    byTestId(tree, "fr-onward").props.onClick();
    assert.deepEqual(sent, [], "nothing sent to a door that would refuse it");
    assert.equal(went.at(-1), "start/phone", "and the step goes on");
  } finally {
    W.canDo = was;
    delete W.__workspace;
  }
});

/* ------------------------------------ (D) moving between steps ------------------------------------ */

test("(D) the step's heading takes focus when the step on screen changes -- so a screen reader says where the owner is -- and not on the page's arrival", () => {
  const focused = [];
  const was = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => (id === "fr-heading" ? { focus: (o) => focused.push(o) } : null);
  try {
    let tree = draw({ setup: dto({ services: 2 }), at: "business" });
    tree = redraw();
    assert.deepEqual(focused, [], "arriving is not a move");
    assert.equal(
      byTestId(tree, "fr-heading").props.tabIndex,
      -1,
      "a heading that can take focus, and is not a stop for Tab",
    );
    param = "phone";
    redraw();
    assert.deepEqual(focused, [{ preventScroll: true }], "the move: the heading, without jumping the page");
    redraw();
    assert.equal(focused.length, 1, "once a move");
    // The move is the step drawn, never the address: the bare address draws the step the workspace is on, the same one.
    param = null;
    redraw();
    assert.equal(focused.length, 1, "the same step at another address is no move");
  } finally {
    globalThis.document.getElementById = was;
    delete W.__workspace;
  }
});

test("(D) the heading takes focus when the step changes under ONE address: Looks right goes on from the bare address, where the button pressed is gone", () => {
  const focused = [];
  const was = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => (id === "fr-heading" ? { focus: (o) => focused.push(o) } : null);
  try {
    // Check at the bare address, a fact still missing; its last fact lands and it stays on screen (the owner is on it).
    let tree = draw();
    tree = redraw();
    setSurfaceValue("setup", surface(dto({ services: 2 })));
    tree = redraw();
    assert.equal(textOf(byTestId(tree, "fr-heading")), "Here's what we found", "Check stays while the owner is on it");
    assert.deepEqual(focused, [], "nothing on screen moved");
    byTestId(tree, "fr-onward").props.onClick();
    assert.equal(replaced.at(-1), "start/business", "the bare address being left is named for its step");
    assert.equal(went.at(-1), "start/phone", "and the way on is a new entry, named for the step it opens");
    tree = redraw();
    assert.equal(byTestId(tree, "first-run").props["data-step"], "phone", "the phone step, drawn in Check's place");
    assert.deepEqual(focused, [{ preventScroll: true }], "the step changed under one address: the heading has focus");
  } finally {
    globalThis.document.getElementById = was;
    delete W.__workspace;
  }
});

test("(D) a move while a row holds typing never saved asks first: Stay keeps the typing, Yes goes -- and a save on its way is asked about in its own words", () => {
  // The registry's own answer to "is a save out" (the page asks `recFolds.saving()`), stood in for where a save is on its way.
  const was = recFolds.saving;
  try {
    let tree = draw({ setup: dto({ services: 2 }), at: "business" });
    press(byTestId(tree, "rec-row-act-website"));
    tree = redraw();
    typeInto(tree, "website", "harbor-moving.example");
    tree = redraw();
    const before = moves();
    byTestId(tree, "fr-onward").props.onClick();
    tree = redraw();
    const words = FIRST_RUN_HELPERS.words.leave;
    assert.equal(moves(), before, "nothing moved");
    assert.match(textOf(byTestId(tree, "fr-leave-confirm")), new RegExp(words.question.replace("?", "\\?")));
    assert.match(textOf(byTestId(tree, "fr-leave-confirm")), new RegExp(words.detail));
    press(byTestId(tree, "fr-leave-no"));
    tree = redraw();
    assert.equal(byTestId(tree, "fr-leave-confirm"), null);
    assert.equal(moves(), before, "Stay: still here");
    // The Rail's step, and Finish later, ask the same.
    byTestId(tree, "fr-later").props.onClick();
    tree = redraw();
    assert.ok(byTestId(tree, "fr-leave-confirm"), "Finish later asks too");
    press(byTestId(tree, "fr-leave-no"));
    tree = redraw();
    byTestId(tree, "fr-onward").props.onClick();
    tree = redraw();
    press(byTestId(tree, "fr-leave-yes"));
    assert.equal(moves(), before + 1, "Yes: the move it asked about");

    // A save on its way is not "without saving": asked in other words, and never as a danger.
    tree = draw({ setup: dto({ services: 2 }), at: "business" });
    press(byTestId(tree, "rec-row-act-website"));
    tree = redraw();
    typeInto(tree, "website", "harbor-moving.example");
    tree = redraw();
    recFolds.saving = () => true;
    byTestId(tree, "fr-onward").props.onClick();
    tree = redraw();
    assert.match(textOf(byTestId(tree, "fr-leave-confirm")), /Leave while this saves\?/);
    assert.match(textOf(byTestId(tree, "fr-leave-confirm")), new RegExp(words.savingDetail.slice(0, 30)));
  } finally {
    recFolds.saving = was;
    delete W.__workspace;
  }
});

test("(D) with nothing typed, a move goes at once: nothing is asked", () => {
  try {
    const tree = draw({ setup: dto({ services: 2 }), at: "business" });
    const before = moves();
    byTestId(tree, "fr-onward").props.onClick();
    assert.equal(moves(), before + 1);
    assert.equal(byTestId(redraw(), "fr-leave-confirm"), null);
  } finally {
    delete W.__workspace;
  }
});

/* ------------------------------------ the chips ------------------------------------ */

const chip = (tree, list, name) => byTestId(tree, `fr-chip-${list}-${name}`);

test("a mover is offered what a mover offers: a tap adds the service through the tab's one saver, and its chip is on at once", () => {
  const sent = saving();
  let tree = draw();
  assert.equal(textOf(byTestId(tree, "fr-chips-services-label")), "Tap what you offer. A few is enough.");
  assert.equal(chip(tree, "services", "Local move").props["aria-pressed"], false);
  press(chip(tree, "services", "Local move"));
  assert.deepEqual(sent.at(-1).config.brain.profile.services, [{ name: "Local move" }]);
  tree = redraw();
  assert.equal(chip(tree, "services", "Local move").props["aria-pressed"], true, "on the config the next save goes on");
});

test("a tap on a chip that is on takes out every service of its name, and the toast's Undo puts each back where it was, whole", () => {
  const sent = saving();
  const listed = {
    ...HARBOR,
    services: [
      { name: "Local move", duration_min: 180, price_note: "From $400" },
      { name: "Packing" },
      { name: "local move" },
    ],
  };
  const tree = draw({ profile: listed });
  assert.equal(chip(tree, "services", "Local move").props["aria-pressed"], true);
  press(chip(tree, "services", "Local move"));
  assert.deepEqual(sent.at(-1).config.brain.profile.services, [{ name: "Packing" }]);
  const said = flashes.at(-1);
  assert.equal(textOf(said.msg), "Removed Local move");
  said.undo();
  assert.deepEqual(
    sent.at(-1).config.brain.profile.services,
    listed.services,
    "back at their places, with what they held",
  );
});

test("the languages are chips: a tap adds one, and + Other opens the tab's own languages editor", () => {
  const sent = saving();
  let tree = draw();
  assert.equal(textOf(byTestId(tree, "fr-chips-languages-label")), "Languages it answers in");
  press(chip(tree, "languages", "Spanish"));
  assert.deepEqual(sent.at(-1).config.brain.profile.languages, ["Spanish"]);
  press(byTestId(tree, "fr-chip-other-language"));
  tree = redraw();
  assert.ok(byTestId(tree, "rec-fold-languages"), "the Business tab's own editor, open over the first run");
});

test("+ Your own opens the services sheet", () => {
  let tree = draw();
  press(byTestId(tree, "fr-chip-own-service"));
  tree = redraw();
  assert.ok(byTestId(tree, "rec-sheet-services"));
});

test("a role that may not change the business sees the chips gated, a press saying why, and no way to the editors", () => {
  const sent = saving();
  const was = { canDo: W.canDo, gate: W.gate };
  const told = [];
  W.canDo = (a) => a !== "settings";
  W.gate = (perm, doing) => (perm === "settings" ? { "aria-disabled": true, onClick: () => told.push(doing) } : {});
  try {
    const tree = draw();
    const c = chip(tree, "services", "Packing");
    assert.equal(c.props["aria-disabled"], true);
    press(c);
    press(chip(tree, "languages", "Spanish"));
    assert.equal(sent.length, 0);
    assert.deepEqual(
      told,
      ["change your services", "change the languages it speaks"],
      "the gate's own press, which says why",
    );
    assert.equal(byTestId(tree, "fr-chip-own-service"), null);
    assert.equal(byTestId(tree, "fr-chip-other-language"), null);
  } finally {
    Object.assign(W, was);
  }
});

test("at what the profile keeps, no chip that is off is offered: the ones on stay, over the cap's own sentence", () => {
  const sent = saving();
  const many = Array.from({ length: PROFILE_LIMITS.services - 1 }, (_, i) => ({ name: `Service ${i + 1}` }));
  const tree = draw({ profile: { ...HARBOR, services: [...many, { name: "Packing" }] } });
  const drawn = all(
    byTestId(tree, "fr-chips-services"),
    (n) => typeof n.type === "string" && n.props && n.props["aria-pressed"] !== undefined,
  );
  assert.deepEqual(drawn.map(textOf), ["Packing"]);
  assert.equal(textOf(byTestId(tree, "fr-chips-services-full")), profileRefusal("services"));
  press(chip(tree, "services", "Packing"));
  assert.deepEqual(sent.at(-1).config.brain.profile.services, many, "one that is on still takes one out");
});

test("+ Other's editor, opened over languages the record has, closes on a Save with nothing typed, as a row's does", () => {
  const sent = saving();
  // A hand-edited list the editor's own check would refuse: judged, the untouched Save would say so and stay open.
  let tree = draw({ profile: { ...HARBOR, languages: ["English", "X"] } });
  press(byTestId(tree, "fr-chip-other-language"));
  tree = redraw();
  assert.equal(byTestId(tree, "rec-fold-languages").props["data-open"], "true");
  press(byTestId(tree, "rec-fold-save-languages"));
  tree = redraw();
  assert.equal(byTestId(tree, "rec-fold-languages").props["data-open"], "false", "closed");
  assert.equal(sent.length, 0);
});

test("a business Google lists no kind for is offered no services, and still the languages", () => {
  const tree = draw({ setup: dto({}, { type: null }) });
  assert.equal(byTestId(tree, "fr-chips-services"), null);
  assert.ok(byTestId(tree, "fr-chips-languages"));
});

/* ------------------------------------ the booking page the website names ------------------------------------ */

const FOUND = "https://calendly.com/harbor-moving-example/estimate";

/** The booking link row's other answer, as the kit draws a disagreement: its words, and the press that takes it. */
const offerOf = (tree) => {
  const row = byTestId(tree, "rec-row-booking_link");
  const said = row ? all(row, (n) => n.props && n.props.id === "rec-row-booking_link-other")[0] : null;
  const use = row ? all(row, (n) => n.type === "button" && textOf(n) === "Use it")[0] : null;
  return { said: said ? textOf(said) : null, use: use || null };
};

test("a business that books is offered the booking page its website names, in the row's own words, and Use it saves it through the row", () => {
  const sent = saving();
  let tree = draw({ setup: dto({}, { bookingPage: FOUND }) });
  assert.deepEqual(offerOf(tree).said, `Found on your website: ${FOUND}`);
  assert.equal(
    all(byTestId(tree, "rec-row-booking_link"), (n) => n.props && n.props["data-state"] === "disputed").length,
    0,
    "an empty row offered a page disagrees with nothing",
  );
  press(offerOf(tree).use);
  assert.equal(
    sent.at(-1).config.brain.booking_link,
    FOUND,
    "the row's own check and save, through the tab's one saver",
  );
  tree = redraw();
  assert.deepEqual(
    offerOf(tree),
    { said: null, use: null },
    "gone at once: the link is on the config the next save goes on",
  );
});

test("nothing is offered over a link the record holds", () => {
  const none = { said: null, use: null };
  assert.deepEqual(
    offerOf(draw({ setup: dto({}, { bookingPage: FOUND }), link: "https://book.example.com/harbor" })),
    none,
  );
  assert.deepEqual(offerOf(draw()), none, "nothing found, nothing offered");
});

test("a role that may not change the business reads what the website names, and is offered no press, as with any disagreement", () => {
  const sent = saving();
  const was = W.canDo;
  W.canDo = (a) => a !== "settings";
  try {
    const offer = offerOf(draw({ setup: dto({}, { bookingPage: FOUND }) }));
    assert.equal(offer.said, `Found on your website: ${FOUND}`);
    assert.equal(offer.use, null);
    assert.equal(sent.length, 0);
  } finally {
    W.canDo = was;
  }
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
    const before = moves();
    onward.props.onClick();
    assert.deepEqual(sent, []);
    assert.equal(moves(), before, "and goes nowhere");
  } finally {
    delete W.__workspace;
  }
});

test("Looks right, the step done, goes on at once and sends nothing: every row saved as it was changed", async () => {
  const sent = courier();
  try {
    const done = dto({ services: 2 });
    const tree = draw({ setup: done, at: "business" });
    assert.equal(byTestId(tree, "fr-held"), null);
    const before = went.length;
    byTestId(tree, "fr-onward").props.onClick();
    await settle();
    assert.deepEqual(sent, [], "nothing of how customers buy is sent");
    assert.equal(went.length, before + 1);
    assert.equal(went.at(-1), "start/phone", "on to the phone step, a new entry");
  } finally {
    delete W.__workspace;
  }
});
