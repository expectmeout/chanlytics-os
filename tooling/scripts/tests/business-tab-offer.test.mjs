/**
 * Settings › Business, *What you offer*, EXECUTED on the stub React: the services row and the sheet it opens, the
 * booking rules' fold, and consult-first's. The page, the fixture and the presses are _business-tab-harness.mjs; every
 * claim here is something the page drew, or something a press on it sent.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  standingLine,
  bookingRulesWords,
  BOOKING_RULE_HINTS,
  roleGate,
  needsConsultation,
  foldName,
  serviceUndoName,
  bookingRuleRefusal,
  servicesFoundWords,
  sellsByVM,
  sellsBySaved,
  SELLS_BY_REFUSAL,
  CONSULT_FIRST_DEAL_HINT,
} from "@chanlytics/contracts";
import { unmount, settle, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";
import {
  W,
  cancelFoldOf,
  composePromptPreview,
  drawTab,
  escape,
  foldOf,
  labelled,
  marisa,
  openFold,
  openFolds,
  openRows,
  ownWords,
  redrawTab,
  saveFoldOf,
  saving,
  typeAt,
  without,
} from "./_business-tab-harness.mjs";

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

/** Thirty-three services, as the live record holds them: every one quoted at consult. */
const many = {
  ...marisa,
  services: Array.from({ length: 33 }, (_, i) => ({
    name: `Service ${i + 1}`,
    duration_min: 30 + i,
    price_note: "quoted at consult",
  })),
};
const LIMIT = 60;
const full = {
  ...marisa,
  services: Array.from({ length: LIMIT }, (_, i) => ({ name: `Service ${i + 1}`, duration_min: 30 })),
};

const sheetOf = (tree) => byTestId(tree, "rec-sheet-services");
/** Every row of the sheet, shown or hidden by the search: a row it leaves out stays on the page. */
const rowsOf = (tree) =>
  all(sheetOf(tree), (n) => classes(n).includes("bt-service-row") && !classes(n).includes("bt-service-head"));
const shownOf = (tree) => rowsOf(tree).filter((n) => !n.props.hidden);
const nameOf = (row) => find(row, (n) => n.type === "input" && / name$/.test(n.props["aria-label"] || "")).props.value;
const namesOf = (rows) => rows.map(nameOf);
const openSheet = (tree, flash) => {
  press(byTestId(tree, "rec-row-act-services"));
  return redrawTab(flash);
};
const searchFor = (tree, words) =>
  byTestId(tree, "rec-services-search") &&
  find(byTestId(tree, "rec-services-search"), (n) => n.type === "input").props.onChange({ target: { value: words } });
const said = (f) => textOf({ props: { children: f.msg } });
/** A sentence the kit's FieldError draws under a box, by the box's id: rec-<id>-problem. */
const problemOf = (tree, boxId) => {
  const n = find(tree, (m) => m.type === W.FieldError && m.props.id === `rec-${boxId}-problem`);
  return n ? textOf(n) : null;
};
const saveSheet = (tree) => press(byTestId(tree, "rec-sheet-save-services"));
/**
 * The name a screen reader hears for a box, worked out as a browser works it out: what aria-labelledby points at, else
 * aria-label, else the label that holds the box (the kit's RecordField: its words, then its unit).
 */
const heard = (tree, box) => {
  if (box.props["aria-labelledby"])
    return box.props["aria-labelledby"]
      .split(" ")
      .map((id) => textOf(find(tree, (n) => n.props?.id === id)))
      .join(" ");
  if (box.props["aria-label"]) return box.props["aria-label"];
  const holder = find(tree, (n) => n.type === "label" && !!find(n, (m) => m === box));
  if (!holder) return "";
  return [
    find(holder, (n) => classes(n).includes("rec-field-label")),
    find(holder, (n) => classes(n).includes("rec-input-unit")),
  ]
    .map((n) => (n ? textOf(n) : ""))
    .filter(Boolean)
    .join(" ");
};
const heardBox = (tree, name) =>
  find(tree, (n) => (n.type === "input" || n.type === "textarea") && heard(tree, n) === name);
const typeHeard = (tree, name, text) => heardBox(tree, name).props.onChange({ target: { value: text } });

/* ------------------------------------ the plan's five ------------------------------------ */

test("the services row counts them and names the first three, and says nothing of how they are priced", () => {
  const row = byTestId(drawTab({ profile: many }), "rec-row-services");
  assert.equal(textOf(find(row, (n) => classes(n).includes("rec-row-value"))), "33", "the count alone");
  assert.equal(all(row, (n) => classes(n).includes("rec-chip")).length, 4, "three services and a +30");
  // "None names a price." stood under the names of nearly every record (24 Sep): a price is the sheet's to write.
  assert.equal(byTestId(row, "rec-services-priced"), null);
  assert.doesNotMatch(textOf(row), /names a price|quoted at consult|on record/i);
  assert.deepEqual(all(row, (n) => classes(n).includes("rec-chip")).map(textOf), [
    "Service 130 min",
    "Service 231 min",
    "Service 332 min",
    "+30",
  ]);
});

test("the sheet holds every service, and the search narrows them", () => {
  const tree = drawTab({ profile: many });
  press(byTestId(tree, "rec-row-act-services"));
  const open = () => redrawTab();
  assert.equal(rowsOf(open()).length, 33);
  const search = find(sheetOf(open()), (n) => classes(n).includes("rec-input"));
  assert.equal(search.props["aria-label"], "Search services", "the first box in the sheet is its search");
  search.props.onChange({ target: { value: "Service 1" } });
  const shown = shownOf(open());
  assert.ok(shown.length < 33 && shown.length > 0, "the search narrows without emptying");
  assert.equal(rowsOf(open()).length, 33, "and every row stays on the page, hidden, not taken off it");
});

test("removing a service offers it back at its own index", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const tree = drawTab({ profile: many, flash });
  press(byTestId(tree, "rec-row-act-services"));
  press(byTestId(redrawTab(flash), "rec-service-remove-2"));

  const toast = flashes.at(-1);
  assert.equal(typeof toast.undo, "function");
  assert.equal(said(toast), "Removed Service 3");
  assert.equal(rowsOf(redrawTab(flash)).length, 32);
  toast.undo();
  const rows = rowsOf(redrawTab(flash));
  assert.equal(rows.length, 33);
  assert.equal(nameOf(rows[2]), "Service 3", "and it comes back where it was, not at the end");
});

test("the booking-rules fold shows what the composer will write", () => {
  let tree = drawTab({ profile: marisa });
  openFold(tree, "booking_rules");
  tree = redrawTab();
  const S = W.__businessTabSave;
  const base = S.saver.base();
  const block = W.__businessTab.consequenceOf(
    "booking_rules",
    S.saveFold("booking_rules", base, S.draftOf("booking_rules", base)).brain,
    "whatsapp",
  );
  assert.equal(
    textOf(byTestId(tree, "rec-fold-says-booking_rules")).includes(block.text),
    true,
    "the composer's own block, whole",
  );
  assert.match(block.text, /At least 2 hours' notice/);
  assert.match(textOf(byTestId(tree, "rec-fold-says-booking_rules")), /Your receptionist will be told/);
});

test("consult-first is its own row with its own name", () => {
  const row = byTestId(drawTab({ profile: marisa }), "rec-row-consult_first");
  assert.match(textOf(row), /Needs a consult first/i);
  assert.match(textOf(row), /Color correction, Extensions/);
  const empty = byTestId(
    drawTab({ profile: { ...marisa, booking_rules: without(marisa.booking_rules, "consult_first") } }),
    "rec-row-consult_first",
  );
  assert.match(textOf(empty), /None/);
  assert.equal(textOf(byTestId(empty, "rec-row-act-consult_first")).trim(), "Add one");
});

/* ------------------------------------ the card at rest ------------------------------------ */

test("What you offer draws four rows under its title, and the booking rules in one sentence contracts wrote", () => {
  const card = byTestId(drawTab(), "rec-card-offer");
  assert.equal(textOf(find(card, (n) => classes(n).includes("rec-card-title"))), "What you offer");
  assert.equal(textOf(find(card, (n) => classes(n).includes("rec-card-sub"))), "And the rules for offering it");
  // How customers buy first (0008): it decides whether any of the rest leads to a deal.
  assert.deepEqual(all(card, (n) => classes(n).includes("rec-row-key")).map(textOf), [
    "How customers buy",
    "Services",
    "Booking rules",
    "Needs a consult first",
  ]);
  const rules = byTestId(card, "rec-row-booking_rules");
  assert.match(textOf(rules), new RegExp(escape(bookingRulesWords(marisa.booking_rules).line)));
  assert.equal(
    bookingRulesWords(marisa.booking_rules).line,
    "At least 2 hours' notice · 30-minute slots · up to 14 days ahead · up to 4 people",
    "the canvas's line",
  );
  // The notes under it, as sentences.
  const noted = drawTab({
    profile: {
      ...marisa,
      booking_rules: {
        ...marisa.booking_rules,
        notes: ["No chemical services after 4 PM", "Bridal parties are booked by phone"],
      },
    },
  });
  assert.equal(
    textOf(byTestId(noted, "rec-rules-notes")),
    "No chemical services after 4 PM. Bridal parties are booked by phone.",
  );
  // None of the five set: what the openings are worked out with, not "no rule".
  const bare = byTestId(
    drawTab({ profile: { ...marisa, booking_rules: { consult_first: ["Extensions"] } } }),
    "rec-row-booking_rules",
  );
  assert.match(textOf(bare), /The calendar's own — at least 2 hours' notice, up to 14 days ahead, in 30-minute slots/);
  assert.equal(textOf(byTestId(bare, "rec-row-act-booking_rules")).trim(), "Change");
});

test("a chip names a service alone where it has no duration", () => {
  const chips = all(
    byTestId(drawTab({ profile: { ...marisa, services: [{ name: "Cut" }] } }), "rec-row-services"),
    (n) => classes(n).includes("rec-chip"),
  );
  assert.deepEqual(chips.map(textOf), ["Cut"]);
});

test("with no services the row says none yet, and its act adds one", () => {
  const tree = drawTab({ profile: without(marisa, "services") });
  const row = byTestId(tree, "rec-row-services");
  assert.match(textOf(row), /None yet/);
  assert.equal(row.props["data-empty"], "true");
  assert.equal(textOf(byTestId(row, "rec-row-act-services")).trim(), "Add one");
  assert.equal(all(row, (n) => classes(n).includes("rec-chip")).length, 0);
  assert.equal(byTestId(row, "rec-services-priced"), null);
});

test("each act of What you offer is gated as a change to the settings, and named for what it acts on", () => {
  const asked = [];
  const was = W.gate;
  W.gate = (perm, doing) => {
    asked.push([perm, doing]);
    return {};
  };
  // How customers buy is offered only where there is a courier to save it through, as the zone is.
  W.__workspace = { patch: async () => ({ ok: true, workspace: {}, message: "" }) };
  try {
    const tree = drawTab();
    const mine = asked.filter(([, doing]) => /customers buy|services|booking rules|consult/.test(doing));
    assert.deepEqual(mine.slice(0, 4), [
      ["settings", "change how customers buy"],
      ["settings", "change your services"],
      ["settings", "change the booking rules"],
      ["settings", "change what needs a consult first"],
    ]);
    const heard = (row) => byTestId(tree, `rec-row-act-${row}`).props["aria-label"];
    assert.deepEqual(["sells_by", "services", "booking_rules", "consult_first"].map(heard), [
      "Choose how customers buy",
      "Open the list of services",
      "Change the booking rules",
      "Change what needs a consult first",
    ]);
    assert.equal(textOf(byTestId(tree, "rec-row-act-services")).trim(), "Open the list", "the canvas's act");
  } finally {
    W.gate = was;
    delete W.__workspace;
  }
});

test("a viewer reads what is offered and is offered no act on any of it, and nothing opens the sheet", () => {
  W.ST_STORE = { can: (perm) => perm !== "settings", myRole: () => "viewer" };
  // A courier to save the answer through, so that only the role stops it.
  const patched = [];
  W.__workspace = { patch: async (fields) => (patched.push(fields), { ok: true, workspace: fields, message: "" }) };
  try {
    const sent = saving();
    const tree = drawTab({ profile: many, sellsBy: "proposal" });
    const card = byTestId(tree, "rec-card-offer");
    assert.deepEqual(
      all(card, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")),
      [],
      "no row offers a change",
    );
    assert.equal(textOf(find(byTestId(card, "rec-row-services"), (n) => classes(n).includes("rec-row-value"))), "33");
    assert.match(textOf(card), /Color correction, Extensions/, "and everything is there to read");
    assert.match(textOf(card), /Some get a proposal first/, "how customers buy too");
    // The page says why once, and this card does not say it again.
    const why = roleGate("viewer", "settings", "change the business").reason;
    assert.equal(all(tree, (n) => ownWords(n).includes(why)).length, 1);
    for (const id of ["sells_by", "services", "booking_rules", "consult_first"]) {
      W.__recordFolds.request(id);
      const again = redrawTab();
      assert.deepEqual([openFolds(again), sheetOf(again)], [[], null], id);
      W.__recordFolds.reset();
    }
    assert.equal(sent.length, 0);
    assert.deepEqual(patched, [], "and nothing goes to the workspace's courier");
  } finally {
    delete W.ST_STORE;
    delete W.__workspace;
  }
});

/* ------------------------------------ how customers buy ------------------------------------ */

/**
 * The workspace's courier as the bridge publishes it (legacy-bridge/identity.ts `patch`, which the zone's tests run
 * against the route), standing in for it here: it records what it is sent, keeps the page's list of workspaces current
 * as the courier does once the server has taken a change, and answers `answer`, or taken. With `hold` each answer waits
 * for release().
 */
const courier = ({ answer = null, hold = false } = {}) => {
  const sent = [];
  let release = () => {};
  W.__workspace = {
    patch: (fields) => {
      sent.push(fields);
      const answered = () => {
        const r = answer || { ok: true, workspace: fields, message: "" };
        if (r.ok) W.__WORKSPACES = W.__WORKSPACES.map((t) => (t.id === W.__ACTIVE_WORKSPACE ? { ...t, ...fields } : t));
        return r;
      };
      if (!hold) return Promise.resolve(answered());
      return new Promise((resolve) => {
        release = () => resolve(answered());
      });
    },
  };
  return { sent, release: () => release() };
};
const buysRow = (tree) => byTestId(tree, "rec-row-sells_by");
/** What a row states: its value, or the words it says with none. */
const stated = (row) =>
  textOf(
    find(row, (n) => classes(n).includes("rec-row-value")) || find(row, (n) => classes(n).includes("rec-row-empty")),
  );
const actWords = (act) => textOf(find(act, (n) => classes(n).includes("rec-row-act-words")));
const answers = (tree) => all(byTestId(tree, "rec-sells-by-choice"), (n) => n.props?.role === "radio");
const labelOf = (radio) => textOf(find(radio, (n) => classes(n).includes("rec-seg-label")));
const choose = (tree, label) => press(answers(tree).find((r) => labelOf(r) === label));
const told = (f) => [f.tone, textOf({ props: { children: f.msg } })];
const consultHint = (tree) => {
  const hint = find(byTestId(tree, "rec-row-consult_first"), (n) => classes(n).includes("rec-row-hint"));
  return hint ? textOf(hint) : null;
};

test("How customers buy states the answer, or that it was never said, and its act chooses one: every word contracts'", () => {
  const c = courier();
  try {
    const unsaid = buysRow(drawTab());
    assert.equal(textOf(find(unsaid, (n) => classes(n).includes("rec-row-key"))), "How customers buy");
    assert.equal(unsaid.props["data-empty"], "true");
    assert.equal(stated(unsaid), "Not said yet");
    const act = byTestId(unsaid, "rec-row-act-sells_by");
    assert.deepEqual([actWords(act), act.props["aria-label"]], ["Choose one", "Choose how customers buy"]);
    for (const answer of [null, "booking", "proposal"]) {
      const vm = sellsByVM(answer);
      const row = buysRow(drawTab({ sellsBy: answer }));
      const a = byTestId(row, "rec-row-act-sells_by");
      assert.deepEqual([stated(row), actWords(a), a.props["aria-label"]], [vm.value ?? vm.empty, vm.act, vm.name]);
    }
    assert.equal(stated(buysRow(drawTab({ sellsBy: "booking" }))), "They book an appointment");
    const proposes = buysRow(drawTab({ sellsBy: "proposal" }));
    assert.deepEqual(
      [stated(proposes), proposes.props["data-empty"], actWords(byTestId(proposes, "rec-row-act-sells_by"))],
      ["Some get a proposal first", "false", "Change"],
    );
    assert.deepEqual(c.sent, [], "drawing it sends nothing");
  } finally {
    delete W.__workspace;
  }
  // With no courier to save it through (the standalone mockup has none), it is stated and offers nothing, as the zone.
  const bare = buysRow(drawTab({ sellsBy: "booking" }));
  assert.equal(stated(bare), "They book an appointment");
  assert.equal(byTestId(bare, "rec-row-act-sells_by"), null);
});

test("its fold is the two answers as one choice, each with what choosing it means, and says nothing it will be told", () => {
  courier();
  try {
    let tree = drawTab({ sellsBy: "proposal" });
    openFold(tree, "sells_by");
    tree = redrawTab();
    assert.deepEqual(openFolds(tree), ["sells_by"]);
    // Named by the fold's own label, the words on screen above it.
    const group = find(byTestId(tree, "rec-sells-by-choice"), (n) => n.props?.role === "radiogroup");
    assert.equal(group.props["aria-labelledby"], "rec-fold-sells_by-label");
    assert.equal(textOf(find(tree, (n) => n.props?.id === "rec-fold-sells_by-label")), "How customers buy");
    // Each answer named by its label and described by what choosing it means, contracts' words; the stored one chosen.
    const heard = (r, by) => textOf(find(tree, (n) => n.props?.id === r.props[by]));
    assert.deepEqual(
      answers(tree).map((r) => [heard(r, "aria-labelledby"), heard(r, "aria-describedby"), r.props["aria-checked"]]),
      sellsByVM("proposal").choices.map((ch) => [ch.label, ch.hint, ch.value === "proposal"]),
    );
    assert.deepEqual(
      answers(tree).map((r) => r.props.tabIndex),
      [-1, 0],
      "one tab stop, on the answer chosen",
    );
    // The answer is in no draft of the brain: there is nothing it will tell the receptionist.
    assert.equal(byTestId(tree, "rec-fold-says-sells_by"), null);
    // Never asked: neither is chosen, and the first is the tab stop.
    tree = drawTab();
    openFold(tree, "sells_by");
    tree = redrawTab();
    assert.deepEqual(
      answers(tree).map((r) => [r.props["aria-checked"], r.props.tabIndex]),
      [
        [false, 0],
        [false, -1],
      ],
    );
  } finally {
    delete W.__workspace;
  }
});

test("an answer saved goes through the workspace's courier as { sells_by } alone, never the settings save, and the page follows it", async () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const c = courier({ hold: true });
  try {
    let tree = drawTab({ flash, sellsBy: "booking" });
    assert.equal(consultHint(tree), null, "deals are off: consult-first is a booking rule and says nothing of a deal");
    openFold(tree, "sells_by");
    tree = redrawTab(flash);
    choose(tree, "Some get a proposal first");
    tree = redrawTab(flash);
    assert.deepEqual(
      answers(tree).map((r) => r.props["aria-checked"]),
      [false, true],
    );
    assert.equal(W.__settingsUnsaved(), true, "a choice not yet saved is asked about before it is thrown away");
    saveFoldOf(tree, "sells_by");
    tree = redrawTab(flash);
    // While it is out: the fold is busy, a press on the other answer chooses nothing, and the tab's door holds it.
    assert.equal(byTestId(tree, "rec-fold-save-sells_by").props["aria-busy"], true);
    assert.deepEqual(
      answers(tree).map((r) => r.props["aria-disabled"]),
      [true, true],
    );
    assert.equal(W.__businessTabSave.sellsBy.pending(), true, "the save is the tab's, not the page's");
    choose(tree, "They book an appointment");
    tree = redrawTab(flash);
    assert.equal(answers(tree)[1].props["aria-checked"], true, "nothing is chosen while the save is out");
    c.release();
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual(c.sent, [{ sells_by: "proposal" }], "the answer alone: the zone is not sent with it");
    assert.equal(sent.length, 0, "the settings save is never sent: the answer is the workspace's");
    assert.deepEqual(openFolds(tree), [], "taken, the fold closes");
    assert.deepEqual(told(flashes.at(-1)), ["ok", sellsBySaved("booking", "proposal")]);
    assert.equal(told(flashes.at(-1))[1], "Saved — deals are on.");
    assert.equal(stated(buysRow(tree)), "Some get a proposal first", "the row states what the courier kept");
    // Deals are on now, and the row holds a list: it states the list and stops. What a consultation starts is an
    // empty row's sentence (below).
    assert.equal(consultHint(tree), null);

    // And back again: deals off, and the toast says those on file are kept.
    openFold(tree, "sells_by");
    tree = redrawTab(flash);
    choose(tree, "They book an appointment");
    tree = redrawTab(flash);
    saveFoldOf(tree, "sells_by");
    c.release();
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual(c.sent, [{ sells_by: "proposal" }, { sells_by: "booking" }]);
    assert.deepEqual(told(flashes.at(-1)), ["ok", "Saved — deals are off. Any already recorded are kept."]);
    assert.equal(stated(buysRow(tree)), "They book an appointment");
    assert.equal(consultHint(tree), null);
    assert.equal(sent.length, 0);
  } finally {
    delete W.__workspace;
  }
});

test("Save with nothing chosen says why under the choice; saved as it opened, nothing is sent; refused, the server's words", async () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  const c = courier();
  try {
    // Never asked, and nothing chosen: refused under the choice in the route's own words, and nothing is sent.
    let tree = drawTab({ flash });
    openFold(tree, "sells_by");
    tree = redrawTab(flash);
    saveFoldOf(tree, "sells_by");
    tree = redrawTab(flash);
    assert.equal(textOf(byTestId(tree, "rec-sells-by-problem")), SELLS_BY_REFUSAL);
    assert.deepEqual([openFolds(tree), c.sent], [["sells_by"], []]);
    // A choice answers it, and the sentence goes with it.
    choose(tree, "They book an appointment");
    tree = redrawTab(flash);
    assert.equal(byTestId(tree, "rec-sells-by-problem"), null);
    saveFoldOf(tree, "sells_by");
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual(c.sent, [{ sells_by: "booking" }]);
    assert.deepEqual(told(flashes.at(-1)), ["ok", "Saved — customers book an appointment."]);

    // Answered, and saved as it opened, or chosen and chosen back: nothing is sent, and the fold closes.
    tree = drawTab({ flash, sellsBy: "booking" });
    openFold(tree, "sells_by");
    tree = redrawTab(flash);
    saveFoldOf(tree, "sells_by");
    tree = redrawTab(flash);
    assert.deepEqual(openFolds(tree), []);
    openFold(tree, "sells_by");
    tree = redrawTab(flash);
    choose(tree, "Some get a proposal first");
    tree = redrawTab(flash);
    choose(tree, "They book an appointment");
    tree = redrawTab(flash);
    saveFoldOf(tree, "sells_by");
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual([openFolds(tree), c.sent.length], [[], 1], "nothing more was sent");

    // Refused: the server's words in the danger tone, and the fold stays open with the choice as it was.
    const no = "How that workspace's customers buy could not be changed.";
    W.__workspace.patch = async () => ({ ok: false, workspace: {}, message: no });
    openFold(tree, "sells_by");
    tree = redrawTab(flash);
    choose(tree, "Some get a proposal first");
    tree = redrawTab(flash);
    saveFoldOf(tree, "sells_by");
    await settle();
    tree = redrawTab(flash);
    assert.deepEqual(told(flashes.at(-1)), ["danger", no]);
    assert.deepEqual(openFolds(tree), ["sells_by"]);
    assert.equal(answers(tree)[1].props["aria-checked"], true);
    // Cancel with a change asks first, as every fold's does.
    cancelFoldOf(tree, "sells_by");
    tree = redrawTab(flash);
    assert.match(textOf(byTestId(tree, "rec-fold-sells_by-cancel-confirm")), /Discard your changes\?/);
    assert.equal(sent.length, 0, "and never once the settings save");
  } finally {
    delete W.__workspace;
  }
});

test("only an owner is offered the answer's act: an operator reads it, and nothing opens for them", () => {
  W.ST_STORE = { can: (perm) => perm !== "settings", myRole: () => "operator" };
  const c = courier();
  try {
    const tree = drawTab({ sellsBy: "proposal" });
    const row = buysRow(tree);
    assert.equal(stated(row), "Some get a proposal first");
    assert.equal(byTestId(row, "rec-row-act-sells_by"), null, "no act, as no row of the business offers one");
    W.__recordFolds.request("sells_by");
    assert.deepEqual(openFolds(redrawTab()), []);
    assert.deepEqual(c.sent, []);
  } finally {
    delete W.ST_STORE;
    delete W.__workspace;
  }
});

test("Needs a consult first says a consultation starts a deal while it is empty, and only where deals are on", () => {
  // A row that holds a list states the list and stops (24 Sep): "A consultation for these is the first step of a deal."
  // stood under every filled list where deals are on.
  assert.equal(consultHint(drawTab({ sellsBy: "proposal" })), null, "filled: the list, and nothing under it");
  assert.match(
    textOf(byTestId(drawTab({ sellsBy: "proposal" }), "rec-row-consult_first")),
    /Color correction, Extensions/,
  );
  assert.equal(consultHint(drawTab({ sellsBy: "booking" })), null);
  assert.equal(consultHint(drawTab()), null, "never asked: deals are off");
  // With nothing that needs one, the row says what one would start: the hint is the answer's, and an empty row's.
  const bare = (sellsBy) => ({
    sellsBy,
    profile: { ...marisa, booking_rules: without(marisa.booking_rules, "consult_first") },
  });
  const none = drawTab(bare("proposal"));
  assert.match(textOf(byTestId(none, "rec-row-consult_first")), /None/);
  assert.equal(consultHint(none), CONSULT_FIRST_DEAL_HINT);
  assert.equal(consultHint(none), sellsByVM("proposal").consultHint);
  assert.equal(consultHint(drawTab(bare("booking"))), null, "empty, deals off: a booking rule says nothing of a deal");
});

/* ------------------------------------ the sheet ------------------------------------ */

test("the sheet is the canvas's: its head, a search and Add, three columns, a consult-first mark, and a foot that says what it will be told", () => {
  let tree = drawTab({
    profile: {
      ...many,
      services: [
        { name: "Color correction", duration_min: 180, price_note: "quoted at consult" },
        ...many.services.slice(1),
      ],
    },
  });
  tree = openSheet(tree);
  const sheet = sheetOf(tree);
  assert.ok(sheet, "the act opens the sheet");
  assert.equal(textOf(find(sheet, (n) => classes(n).includes("rec-sheet-title"))), "What you offer");
  assert.equal(
    textOf(find(sheet, (n) => classes(n).includes("rec-sheet-sub"))),
    "Names and rough timings. A price only if you can state it flatly.",
  );
  assert.equal(
    find(byTestId(tree, "rec-services-search"), (n) => n.type === "input").props.placeholder,
    "Search services",
  );
  assert.match(textOf(byTestId(tree, "rec-services-add")), /Add/);
  assert.equal(textOf(find(sheet, (n) => classes(n).includes("bt-service-head"))), "ServiceTakes (min)Price");
  // Each row is three boxes and a remove, each box named for its row.
  const third = rowsOf(tree)[2];
  assert.deepEqual(
    all(third, (n) => n.type === "input").map((n) => [n.props.id, n.props["aria-label"]]),
    [
      ["svc-2-name", "Service 3 name"],
      ["svc-2-minutes", "Service 3 takes (min)"],
      ["svc-2-price", "Service 3 price"],
    ],
  );
  assert.equal(all(third, (n) => n.type === "input")[1].props.inputMode, "numeric");
  assert.equal(byTestId(third, "rec-service-remove-2").props["aria-label"], "Remove Service 3");
  // A service the consult-first list names carries a mark, to read: that list is its own fold's.
  assert.equal(textOf(byTestId(tree, "rec-service-consult-0")), "consult first");
  assert.equal(byTestId(tree, "rec-service-consult-1"), null);
  // The foot.
  assert.equal(textOf(byTestId(tree, "rec-sheet-save-services")), "Save 33 services");
  assert.match(textOf(find(sheet, (n) => classes(n).includes("rec-sheet-foot"))), /Removing one offers an undo\./);
  // With services in it the foot counts nothing (23 Sep: the count and its share went; the Save says how many).
  assert.equal(byTestId(tree, "rec-sheet-services-told-words"), null);
});

test("the foot says only what an owner must know: the Save counts what it writes, and nothing counts the characters", () => {
  // The count, the characters and the share of the prompt went from the foot on 23 Sep ("33 services, 1,085 characters
  // — about a fifth of everything it reads" under thirty-three rows was the clutter it counted). What is left is the
  // Save, which says how many it writes, and the one sentence for a list with nothing in it (the empty record's test).
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  const words = () => byTestId(tree, "rec-sheet-services-told-words");
  assert.equal(words(), null, "nothing is counted on the glass");
  assert.equal(textOf(byTestId(tree, "rec-sheet-save-services")), "Save 33 services");
  press(byTestId(tree, "rec-service-remove-0"));
  tree = redrawTab();
  assert.equal(words(), null);
  assert.equal(textOf(byTestId(tree, "rec-sheet-save-services")), "Save 32 services");
  // A row nobody named is not one the save writes, so it is not counted.
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-sheet-save-services")), "Save 32 services");
  assert.equal(words(), null, "a row with no name is not 'no services'");
});

test("the search reads names only, and never reorders: what it leaves out is hidden in place", () => {
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  searchFor(tree, "service 2");
  tree = redrawTab();
  // Service 2, and 20 to 29, in the stored order: the order the receptionist reads them in.
  assert.deepEqual(namesOf(shownOf(tree)), ["Service 2", ...Array.from({ length: 10 }, (_, i) => `Service ${20 + i}`)]);
  // Hidden in place, each at its own index: nothing is taken off the page or moved.
  assert.deepEqual(
    namesOf(rowsOf(tree)),
    many.services.map((s) => s.name),
  );
  assert.equal(rowsOf(tree)[0].props.hidden, true);
  // Names only: a price note or a duration is not searched.
  searchFor(tree, "consult");
  tree = redrawTab();
  assert.deepEqual(
    [shownOf(tree).length, !!byTestId(tree, "rec-services-none")],
    [0, true],
    "no service is called that",
  );
  searchFor(tree, "45");
  tree = redrawTab();
  assert.equal(shownOf(tree).length, 0, "Service 16 takes 45 minutes, and is not found by it");
  // A name typed over until it no longer matches keeps its row in sight: the box being typed in never vanishes.
  searchFor(tree, "Service 3");
  tree = redrawTab();
  typeAt(tree, "Service 3 name", "Balayage");
  tree = redrawTab();
  assert.ok(namesOf(shownOf(tree)).includes("Balayage"), "REGRESSION: the row being typed in was hidden by the search");
  // And a row just added shows whatever the search says.
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  assert.equal(namesOf(shownOf(tree)).at(-1), "");
  // Emptied, every row shows, in the order they were.
  searchFor(tree, "");
  tree = redrawTab();
  assert.equal(shownOf(tree).length, 34);
  assert.deepEqual(namesOf(shownOf(tree)).slice(0, 4), ["Service 1", "Service 2", "Balayage", "Service 4"]);
});

test("a removed row leaves an Undo where it was, and that Undo and the toast's both put it back at its index, once", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: many, flash });
  tree = openSheet(tree, flash);
  press(byTestId(tree, "rec-service-remove-4"));
  tree = redrawTab(flash);
  const gone = markFor(tree, "Service 5");
  assert.match(textOf(gone), /Removed Service 5/, "where the row was, inside the sheet's Tab ring");
  // It sits in the row's place: before the row that moved up into its index.
  assert.deepEqual(drawnOf(tree).slice(3, 6), ["Service 4", "<Service 5>", "Service 6"]);
  assert.equal(nameOf(rowsOf(tree)[4]), "Service 6");
  // The inline Undo.
  press(undoFor(tree, "Service 5"));
  tree = redrawTab(flash);
  assert.equal(nameOf(rowsOf(tree)[4]), "Service 5", "back at its own index");
  assert.equal(markFor(tree, "Service 5"), null, "and its Undo goes with it");
  // The toast's Undo, pressed after, has nothing left to put back: the row is not put back twice.
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, 33, "REGRESSION: a second copy of the row");

  // The toast's Undo first: the row comes back where it was, and the Undo in its place goes.
  press(byTestId(tree, "rec-service-remove-0"));
  tree = redrawTab(flash);
  assert.ok(markFor(tree, "Service 1"));
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.deepEqual([nameOf(rowsOf(tree)[0]), markFor(tree, "Service 1")], ["Service 1", null]);
});

test("a toast's Undo pressed after the sheet has closed puts nothing back, and says so", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: many, flash });
  tree = openSheet(tree, flash);
  press(byTestId(tree, "rec-service-remove-2"));
  tree = redrawTab(flash);
  const undo = flashes.at(-1).undo;
  press(byTestId(tree, "rec-sheet-cancel-services"));
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = redrawTab(flash);
  assert.equal(sheetOf(tree), null, "the sheet has closed, and its draft with it");
  undo();
  assert.deepEqual(
    [flashes.at(-1).tone, said(flashes.at(-1))],
    ["warn", "Not put back — the editor it was in has closed. Open it again to change it."],
  );
  tree = openSheet(tree, flash);
  assert.equal(rowsOf(tree).length, 33, "it opens on what is stored");
  assert.equal(
    all(sheetOf(tree), (n) => classes(n).includes("bt-service-gone")).length,
    0,
    "and no Undo from the last opening is left in it",
  );
  assert.equal(sent.length, 0);
});

test("the list keeps its cap of sixty through Add and through both Undos", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: full, flash });
  tree = openSheet(tree, flash);
  assert.equal(rowsOf(tree).length, LIMIT);
  assert.equal(byTestId(tree, "rec-services-add"), null, "no Add past the cap the save's schema keeps");
  assert.match(
    textOf(byTestId(tree, "rec-services-cap")),
    /That is the most services the receptionist keeps \(60\)\. Remove one first\./,
  );
  press(byTestId(tree, "rec-service-remove-0"));
  tree = redrawTab(flash);
  const toast = flashes.at(-1).undo;
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, LIMIT);
  assert.equal(byTestId(tree, "rec-services-add"), null);
  toast();
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, LIMIT, "REGRESSION: the toast's Undo put a sixty-first back");
  assert.deepEqual(
    [flashes.at(-1).tone, said(flashes.at(-1))],
    ["warn", "Not put back — That is the most services the receptionist keeps (60). Remove one first."],
  );
  press(undoFor(tree, "Service 1"));
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, LIMIT, "nor the Undo left where it was");
  assert.ok(markFor(tree, "Service 1"), "which stays, to put it back once there is room");
  // With room again, it goes back where it was.
  press(byTestId(tree, "rec-service-remove-59"));
  tree = redrawTab(flash);
  press(undoFor(tree, "Service 1"));
  tree = redrawTab(flash);
  assert.deepEqual([rowsOf(tree).length, nameOf(rowsOf(tree)[0])], [LIMIT, "Service 1"]);
  // And Add itself keeps the cap, pressed twice in one breath with room for one.
  tree = drawTab({ profile: { ...full, services: full.services.slice(0, LIMIT - 1) }, flash });
  tree = openSheet(tree, flash);
  press(byTestId(tree, "rec-services-add"));
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab(flash);
  assert.equal(rowsOf(tree).length, LIMIT);
});

test("a save sends the stored config with the services changed, and nothing else", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: many, flash });
  const stored = structuredClone(W.__SETTINGS.config);
  tree = openSheet(tree, flash);
  typeAt(tree, "Service 3 takes (min)", "75");
  tree = redrawTab(flash);
  typeAt(tree, "Service 3 price", "  from a consult  ");
  tree = redrawTab(flash);
  saveSheet(tree);
  tree = redrawTab(flash);
  assert.equal(sent.length, 1);
  const expected = structuredClone(stored);
  expected.brain.profile.services[2] = { name: "Service 3", duration_min: 75, price_note: "from a consult" };
  assert.deepEqual(
    sent[0].config,
    expected,
    "the whole config, with one service changed and every other key as it was",
  );
  assert.equal(sheetOf(tree), null, "taken, the sheet closes");
  assert.equal(said(flashes.at(-1)), "Saved — the receptionist picks it up within a minute");
});

test("an unchanged Save sends nothing and closes, and so does one typed and typed back", () => {
  const sent = saving();
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  saveSheet(tree);
  tree = redrawTab();
  assert.deepEqual([sent.length, sheetOf(tree)], [0, null]);
  tree = openSheet(tree);
  typeAt(tree, "Service 3 takes (min)", "75");
  tree = redrawTab();
  typeAt(tree, "Service 3 takes (min)", "32");
  tree = redrawTab();
  saveSheet(tree);
  tree = redrawTab();
  assert.deepEqual([sent.length, sheetOf(tree)], [0, null]);
});

test("what stops a save is said under its box, and nothing is sent", () => {
  const sent = saving();
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  typeAt(tree, "Service 2 takes (min)", "1.5");
  tree = redrawTab();
  typeAt(tree, "Service 4 name", "x".repeat(81));
  tree = redrawTab();
  saveSheet(tree);
  tree = redrawTab();
  assert.equal(sent.length, 0);
  assert.ok(sheetOf(tree), "the sheet stays open with what was typed");
  assert.equal(problemOf(tree, "svc-1-minutes"), "Minutes are a whole number, like 45.");
  assert.equal(problemOf(tree, "svc-3-name"), "At most 80 characters — this is 81.");
  assert.equal(labelled(tree, "Service 2 takes (min)").props["aria-invalid"], true);
  // Put right, its sentence goes with the change, and the save goes.
  typeAt(tree, "Service 2 takes (min)", "15");
  tree = redrawTab();
  assert.equal(problemOf(tree, "svc-1-minutes"), null);
  typeAt(tree, "Service 4 name", "Service 4");
  tree = redrawTab();
  saveSheet(tree);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.services[1].duration_min, 15);
});

test("while the sheet saves its boxes take nothing, and a press that would add or remove refuses the way Save does", () => {
  const sent = [];
  W.__saveSettings = (config, version, accepted) =>
    new Promise(() => {
      sent.push({
        config: structuredClone(config),
        accept: () => accepted({ config: structuredClone(config), version: version + 1 }),
      });
    });
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: many, flash });
  tree = openSheet(tree, flash);
  typeAt(tree, "Service 1 takes (min)", "40");
  tree = redrawTab(flash);
  saveSheet(tree);
  tree = redrawTab(flash);
  assert.deepEqual(
    [sheetOf(tree).props["aria-busy"], textOf(byTestId(tree, "rec-sheet-save-services"))],
    [true, "Saving…"],
  );
  assert.deepEqual(
    all(sheetOf(tree), (n) => n.type === "input" && / (name|minutes|price)$/.test(n.props["aria-label"] || ""))
      .map((n) => n.props.readOnly)
      .filter((r) => r !== true),
    [],
    "every box is read-only",
  );
  const held = (node) => [node.props["aria-disabled"], node.props.disabled];
  assert.deepEqual(
    [
      held(byTestId(tree, "rec-service-remove-0")),
      held(byTestId(tree, "rec-services-add")),
      held(byTestId(tree, "rec-sheet-save-services")),
    ],
    [
      [true, undefined],
      [true, undefined],
      [true, undefined],
    ],
  );
  const before = flashes.length;
  typeAt(tree, "Service 1 takes (min)", "41");
  press(byTestId(tree, "rec-service-remove-0"));
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab(flash);
  assert.deepEqual(
    [labelled(tree, "Service 1 takes (min)").props.value, rowsOf(tree).length, flashes.slice(before)],
    ["40", 33, []],
    "nothing typed or pressed under Saving… is held, or said",
  );
  // Escape and Close are Cancel, and nothing cancels a save that is out.
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab(flash);
  assert.ok(sheetOf(tree));
  sent[0].accept();
  tree = redrawTab(flash);
  assert.equal(sheetOf(tree), null, "the server took it, and the sheet closed");
  assert.equal(sent[0].config.brain.profile.services[0].duration_min, 40);
});

/* ------------------------------------ one editor at a time ------------------------------------ */

test("Escape and Close are the sheet's Cancel: with changes they ask first, and with none they close", () => {
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  assert.equal(sheetOf(tree), null, "nothing typed: it closes at once");
  tree = openSheet(tree);
  typeAt(tree, "Service 1 price", "varies");
  tree = redrawTab();
  const esc = {
    key: "Escape",
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  find(sheetOf(tree), (n) => classes(n).includes("rec-sheet")).props.onKeyDown(esc);
  tree = redrawTab();
  assert.ok(sheetOf(tree), "typed in: it stays open");
  assert.match(
    textOf(byTestId(tree, "rec-sheet-services-cancel-confirm")),
    /Discard your changes\?/,
    "and asks, above its Save",
  );
  press(byTestId(tree, "rec-sheet-services-cancel-no"));
  tree = redrawTab();
  assert.equal(labelled(tree, "Service 1 price").props.value, "varies", "Keep editing keeps what was typed");
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = redrawTab();
  assert.equal(sheetOf(tree), null);
  tree = openSheet(tree);
  assert.equal(labelled(tree, "Service 1 price").props.value, "quoted at consult", "what was thrown away is gone");
  // A service row with no name is asked about too, though the save would drop it.
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-cancel-services"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-sheet-services-cancel-confirm"));
});

test("opening the sheet with a fold holding changes asks about the fold, and opening a fold with the sheet holding changes asks about the sheet", () => {
  let tree = drawTab({ profile: many });
  openFold(tree, "booking_rules");
  tree = redrawTab();
  typeHeard(tree, "Least notice hours", "5");
  tree = redrawTab();
  tree = openSheet(tree);
  assert.deepEqual(
    [openFolds(tree), sheetOf(tree)],
    [["booking_rules"], null],
    "the fold's changes are not thrown away",
  );
  assert.match(textOf(byTestId(tree, "rec-fold-booking_rules-ask-confirm")), /Discard your changes\?/);
  press(byTestId(tree, "rec-fold-booking_rules-ask-yes"));
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), !!sheetOf(tree)], [[], true], "answered, the sheet opens");

  typeAt(tree, "Service 2 name", "Balayage");
  tree = redrawTab();
  assert.equal(W.__settingsUnsaved(), true, "the rail asks before the pane goes");
  openFold(tree, "consult_first");
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), !!sheetOf(tree)], [[], true], "the sheet's changes are not thrown away");
  assert.match(
    textOf(byTestId(tree, "rec-sheet-services-ask-confirm")),
    /Discard your changes\?/,
    "and it asks, in the sheet, since Tab never leaves it",
  );
  press(byTestId(tree, "rec-sheet-services-ask-no"));
  tree = redrawTab();
  assert.equal(labelled(tree, "Service 2 name").props.value, "Balayage");
  openFold(tree, "consult_first");
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-services-ask-yes"));
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), sheetOf(tree)], [["consult_first"], null]);
  // A clean sheet gives way at once.
  cancelFoldOf(tree, "consult_first");
  tree = openSheet(redrawTab());
  openFold(tree, "booking_rules");
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), sheetOf(tree)], [["booking_rules"], null]);
});

test("the standing line's services door opens the sheet, guarded like any row", () => {
  const bare = without(marisa, "services");
  let tree = drawTab({ profile: bare });
  assert.equal(standingLine(W.__SETTINGS.config.brain, true, null).missing.row, "services");
  press(byTestId(byTestId(tree, "rec-standing"), "rec-standing-door"));
  tree = redrawTab();
  assert.ok(sheetOf(tree), "the door opens the sheet, which no fold is");
  assert.deepEqual(
    [rowsOf(tree).length, textOf(byTestId(tree, "rec-sheet-services-told-words"))],
    [0, "No services, so it cannot say what you offer."],
  );
  press(byTestId(tree, "rec-services-add"));
  tree = redrawTab();
  typeAt(tree, "Service 1 name", "Balayage");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-sheet-save-services")), "Save 1 service");
  // With a fold holding changes, the door asks about them first.
  tree = drawTab({ profile: bare });
  openFold(tree, "consult_first");
  tree = redrawTab();
  typeHeard(tree, "Needs a consult first", "Keratin");
  tree = redrawTab();
  press(byTestId(byTestId(tree, "rec-standing"), "rec-standing-door"));
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), sheetOf(tree)], [["consult_first"], null]);
  assert.ok(byTestId(tree, "rec-fold-consult_first-ask-confirm"));
});

test("the sheet is the page's last hook-holding child: opened, drawn again and closed, every editor before it keeps its own", () => {
  // The kit's sheet holds hooks and is drawn only while it is open, and the stub keeps every hook on the page in one
  // order (_legacy-react.mjs). Drawn before a card, it read that card's cells as its own the moment it opened.
  const sent = saving();
  let tree = drawTab({ profile: many });
  const at = (t) => [
    textOf(byTestId(t, "rec-row-hours")),
    textOf(byTestId(t, "rec-row-booking_rules")),
    textOf(byTestId(t, "rec-row-consult_first")),
  ];
  const rest = at(tree);
  tree = openSheet(tree);
  typeAt(tree, "Service 1 name", "Balayage");
  tree = redrawTab();
  tree = redrawTab();
  assert.equal(labelled(tree, "Service 1 name").props.value, "Balayage", "the sheet keeps its draft over two draws");
  assert.deepEqual(at(tree), rest, "and every row before it says what it said");
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = redrawTab();
  assert.deepEqual(at(tree), rest);
  // Every editor before it opens, is typed in and asks as it did before the sheet ever opened.
  openFold(tree, "hours");
  tree = redrawTab();
  typeAt(tree, "Monday closes", "17:00");
  tree = redrawTab();
  assert.equal(labelled(tree, "Monday closes").props.value, "17:00");
  openFold(tree, "booking_rules");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["hours"]);
  press(byTestId(tree, "rec-fold-hours-ask-yes"));
  tree = redrawTab();
  typeHeard(tree, "Least notice hours", "6");
  tree = redrawTab();
  saveFoldOf(tree, "booking_rules");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.booking_rules.lead_hours, 6);
  // Opened again after all that, it opens on what is stored, and its rows read their own.
  tree = openSheet(redrawTab());
  assert.deepEqual(namesOf(rowsOf(tree)).slice(0, 2), ["Service 1", "Service 2"]);
  assert.deepEqual(openRows(tree), []);
});

test("an editor whose page goes away lets go of the sheet: back on the tab, it does not open by itself", async () => {
  let tree = drawTab({ profile: many });
  tree = openSheet(tree);
  assert.equal(W.__recordFolds.open(), "services");
  unmount();
  await settle();
  assert.equal(
    W.__recordFolds.open(),
    null,
    "REGRESSION: the sheet was still the open one, and opened again with the tab",
  );
  tree = W.React.createElement(W.BusinessTab, { flash: () => {} });
  assert.equal(sheetOf(tree), null);
});

/* ------------------------------------ the booking rules ------------------------------------ */

test("the booking rules fold holds the five numbers, each with its unit and what empty means, and the notes", () => {
  let tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  const fold = foldOf(tree, "booking_rules");
  const boxes = all(fold, (n) => n.type === "input");
  // Named by the words on screen and the unit beside them, never by a second name: "Offers times up to" was named
  // "Days ahead", which a person using speech to press it could not say (WCAG 2.5.3, the quality review).
  assert.deepEqual(
    boxes.map((n) => n.props["aria-label"]),
    [undefined, undefined, undefined, undefined, undefined],
  );
  assert.deepEqual(
    boxes.map((n) => heard(tree, n)),
    [
      "Least notice hours",
      "Slot length minutes",
      "Gap between appointments minutes",
      "Offers times up to days ahead",
      "Most people per booking people",
    ],
  );
  assert.deepEqual(
    boxes.map((n) => n.props.placeholder),
    ["2", "30", "0", "14", "4"],
    "and its placeholders",
  );
  assert.deepEqual(
    boxes.map((n) => n.props.value),
    ["2", "30", "", "14", "4"],
    "each as its box holds it",
  );
  assert.ok(boxes.every((n) => n.props.inputMode === "numeric"));
  assert.deepEqual(all(fold, (n) => classes(n).includes("rec-field-label")).map(textOf), [
    "Least notice",
    "Slot length",
    "Gap between appointments",
    "Offers times up to",
    "Most people per booking",
    "Anything else about booking",
  ]);
  assert.deepEqual(all(fold, (n) => classes(n).includes("rec-input-unit")).map(textOf), [
    "hours",
    "minutes",
    "minutes",
    "days ahead",
    "people",
  ]);
  // What an empty box means is contracts' (the canvas said "Empty means no rule." of the least notice; it is two hours').
  assert.deepEqual(all(fold, (n) => classes(n).includes("rec-hint")).map(textOf), [
    BOOKING_RULE_HINTS.lead_hours,
    BOOKING_RULE_HINTS.slot_min,
    BOOKING_RULE_HINTS.max_days_ahead,
    BOOKING_RULE_HINTS.party_max,
    "One per line.",
  ]);
  assert.equal(heardBox(tree, "Anything else about booking").type, "textarea");
  assert.match(textOf(fold), /Saves these five rules, the switch and the notes, and nothing else on the page\./);
  assert.match(textOf(fold), /It never books\. It says which times are open and sends the link\./);
});

test("the booking rules fold's switch asks for an email when the link goes out: off unless stored, and saved as true or as no key", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  let fold = foldOf(tree, "booking_rules");
  let sw = byTestId(fold, "rec-rule-ask-email");
  assert.equal(sw.props.role, "switch");
  assert.equal(sw.props["aria-checked"], false, "off by default: nothing stored is no");
  // Named by the words beside it, which a person using speech can say (as the guardrails' switches are).
  assert.equal(heard(tree, sw), "Ask for an email when sending the booking link");
  // Under the five numbers, above the notes.
  assert.deepEqual(
    all(fold, (n) => n === sw || n.type === "input" || n.type === "textarea").map((n) =>
      n === sw ? "switch" : n.type,
    ),
    ["input", "input", "input", "input", "input", "switch", "textarea"],
  );
  press(sw);
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-rule-ask-email").props["aria-checked"], true);
  saveFoldOf(tree, "booking_rules");
  tree = redrawTab();
  assert.deepEqual(
    sent[0].config.brain.profile.booking_rules,
    { ...marisa.booking_rules, ask_email: true },
    "on is stored as true, beside the rules as they were",
  );
  // Stored on, the switch is on; off again, the key goes rather than a false being written.
  tree = drawTab({ profile: { ...marisa, booking_rules: { ...marisa.booking_rules, ask_email: true } } });
  openFold(tree, "booking_rules");
  tree = redrawTab();
  fold = foldOf(tree, "booking_rules");
  sw = byTestId(fold, "rec-rule-ask-email");
  assert.equal(sw.props["aria-checked"], true, "as stored");
  press(sw);
  tree = redrawTab();
  saveFoldOf(tree, "booking_rules");
  tree = redrawTab();
  assert.deepEqual(sent[1].config.brain.profile.booking_rules, marisa.booking_rules, "off is no key at all");
});

test("each booking rule saves within its range; outside it, or not a whole number, it is refused under its box with its sentence", () => {
  const sent = saving();
  const S = W.__businessTabSave;
  const labels = {
    lead_hours: "Least notice hours",
    slot_min: "Slot length minutes",
    buffer_min: "Gap between appointments minutes",
    max_days_ahead: "Offers times up to days ahead",
    party_max: "Most people per booking people",
  };
  for (const [key, lo, hi] of S.RULES) {
    const words = bookingRuleRefusal(key);
    for (const bad of [String(hi + 1), String(lo - 1), "2.5", "30min", "1e2"]) {
      if (bad === "-1" && lo === 0) continue;
      let tree = drawTab();
      openFold(tree, "booking_rules");
      tree = redrawTab();
      typeHeard(tree, labels[key], bad);
      tree = redrawTab();
      saveFoldOf(tree, "booking_rules");
      tree = redrawTab();
      assert.equal(sent.length, 0, `${key} ${bad}`);
      assert.equal(problemOf(tree, `bt-rule-${key}`), words, `${key} ${bad}: said under its own box`);
      assert.deepEqual(openFolds(tree), ["booking_rules"]);
    }
    for (const good of [lo, hi]) {
      let tree = drawTab({ profile: { ...marisa, booking_rules: { consult_first: ["Extensions"] } } });
      openFold(tree, "booking_rules");
      tree = redrawTab();
      typeHeard(tree, labels[key], String(good));
      tree = redrawTab();
      saveFoldOf(tree, "booking_rules");
      const last = sent.at(-1);
      assert.equal(last.config.brain.profile.booking_rules[key], good, `${key} ${good}`);
      assert.deepEqual(last.config.brain.profile.booking_rules.consult_first, ["Extensions"], "consult-first is kept");
      sent.length = 0;
    }
  }
});

test("the booking rules' save writes those rules and their notes, and nothing else on the page", () => {
  const sent = saving();
  // Consult-first is stored inside the booking rules and is not this fold's: it is the key the fold does not render.
  let tree = drawTab();
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "booking_rules");
  tree = redrawTab();
  typeHeard(tree, "Least notice hours", "");
  tree = redrawTab();
  typeHeard(tree, "Gap between appointments minutes", "15");
  tree = redrawTab();
  typeHeard(
    tree,
    "Anything else about booking",
    "No chemical services after 4 PM\n\nBridal parties are booked by phone  ",
  );
  tree = redrawTab();
  // What it will be told, as the composer writes it for this draft.
  assert.match(
    textOf(byTestId(tree, "rec-fold-says-booking_rules")),
    /- No chemical services after 4 PM\n- Bridal parties are booked by phone/,
  );
  saveFoldOf(tree, "booking_rules");
  const expected = structuredClone(stored);
  const rules = expected.brain.profile.booking_rules;
  delete rules.lead_hours;
  rules.buffer_min = 15;
  rules.notes = ["No chemical services after 4 PM", "Bridal parties are booked by phone"];
  assert.deepEqual(
    sent[0].config,
    expected,
    "only the fold's own keys: an emptied box deletes its key, and consult-first is kept as it was",
  );
  assert.deepEqual(sent[0].config.brain.profile.booking_rules.consult_first, marisa.booking_rules.consult_first);
  assert.deepEqual(openFolds(redrawTab()), []);
});

test("consult-first saves one service to a line, under its own name, and says what it will be told in the booking rules' block", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "consult_first");
  tree = redrawTab();
  const fold = foldOf(tree, "consult_first");
  assert.equal(heardBox(tree, "Needs a consult first").props.value, "Color correction\nExtensions");
  assert.match(
    textOf(fold),
    /Services that need a consultation before they can be booked, one per line\./,
    "the old form's sentence, as its hint",
  );
  typeHeard(tree, "Needs a consult first", "Color correction\nExtensions\n  Keratin  \n");
  tree = redrawTab();
  assert.match(
    textOf(byTestId(tree, "rec-fold-says-consult_first")),
    /These need a consultation before they can be booked: Color correction, Extensions, Keratin\./,
  );
  saveFoldOf(tree, "consult_first");
  assert.deepEqual(sent[0].config.brain.profile.booking_rules, {
    ...marisa.booking_rules,
    consult_first: ["Color correction", "Extensions", "Keratin"],
  });
  // Too many, or one too long, is said under the box, and nothing is sent.
  tree = drawTab();
  openFold(tree, "consult_first");
  tree = redrawTab();
  typeHeard(tree, "Needs a consult first", Array.from({ length: 21 }, (_, i) => `Service ${i}`).join("\n"));
  tree = redrawTab();
  saveFoldOf(tree, "consult_first");
  tree = redrawTab();
  assert.equal(sent.length, 1);
  assert.equal(problemOf(tree, "bt-consult-first"), "At most 20 services, one to a line — this is 21.");
});

test("consult-first and the booking rules share one stored object, and saved one after the other, both land", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "consult_first");
  tree = redrawTab();
  typeHeard(tree, "Needs a consult first", "Keratin");
  tree = redrawTab();
  saveFoldOf(tree, "consult_first");
  tree = redrawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  typeHeard(tree, "Least notice hours", "6");
  tree = redrawTab();
  saveFoldOf(tree, "booking_rules");
  assert.equal(sent.length, 2);
  assert.deepEqual(
    sent[1].config.brain.profile.booking_rules,
    { ...marisa.booking_rules, lead_hours: 6, consult_first: ["Keratin"] },
    "REGRESSION: one fold put the other's keys back as they were",
  );
  assert.equal(sent[1].version, 8, "the second on the first's answer");
  // The other way round.
  sent.length = 0;
  tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  typeHeard(tree, "Most people per booking people", "8");
  tree = redrawTab();
  saveFoldOf(tree, "booking_rules");
  tree = redrawTab();
  openFold(tree, "consult_first");
  tree = redrawTab();
  typeHeard(tree, "Needs a consult first", "");
  tree = redrawTab();
  saveFoldOf(tree, "consult_first");
  assert.deepEqual(sent[1].config.brain.profile.booking_rules, {
    ...without(marisa.booking_rules, "consult_first"),
    party_max: 8,
  });
});

test("the consult-first mark and the search's folding are contracts' own rules, the Calendar's and the phone tool's", () => {
  // The spec review's probe: the sheet folded names with a copy of contracts' foldName, and matched the consult-first list
  // with a copy of needsConsultation. A second implementation of a rule is a bug even when it agrees (root CLAUDE.md).
  const services = [{ name: "Colour Correction" }, { name: "Uñas de gel" }, { name: " Extensions" }, { name: "Cut" }];
  const rules = { ...marisa.booking_rules, consult_first: ["colour correction ", "EXTENSIONS"] };
  let tree = drawTab({ profile: { ...marisa, services, booking_rules: rules } });
  tree = openSheet(tree);
  const marked = services.map((_, i) => !!byTestId(tree, `rec-service-consult-${i}`));
  assert.deepEqual(
    marked,
    services.map((s) => needsConsultation(s.name, rules)),
    "each row marked as contracts answers for it",
  );
  assert.deepEqual(marked, [true, false, true, false]);
  for (const words of ["unas", "UÑAS", " uñas "]) {
    searchFor(tree, words);
    tree = redrawTab();
    assert.deepEqual(
      namesOf(shownOf(tree)),
      ["Uñas de gel"],
      `${JSON.stringify(words)} finds the name as a caller's words find it`,
    );
    assert.ok(foldName("Uñas de gel").includes(foldName(words.trim())));
  }
});

/* ------------------------------------ put back between the same two rows ------------------------------------ */

const ten = {
  ...marisa,
  services: Array.from({ length: 10 }, (_, i) => ({ name: `Service ${i + 1}`, duration_min: 30 })),
};
/** The sheet's list as drawn: each row by its name, and each Undo left in a row's place as <the name it puts back>. */
const drawnOf = (tree) =>
  all(byTestId(tree, "rec-services-rows"), (n) => /^rec-service-(gone-)?\d+$/.test(n.props?.["data-testid"] || "")).map(
    (n) => (n.props["data-testid"].includes("gone") ? `<${textOf(find(n, (m) => m.type === "b"))}>` : nameOf(n)),
  );
/** What is left in the place of the row named `name`, and the Undo in it. */
const markFor = (tree, name) =>
  find(
    byTestId(tree, "rec-services-rows"),
    (n) => classes(n).includes("bt-service-gone") && textOf(find(n, (m) => m.type === "b")) === name,
  );
const undoFor = (tree, name) => find(markFor(tree, name), (n) => n.type === "button");
const removeNamed = (tree, name) =>
  press(byTestId(tree, `rec-service-remove-${rowsOf(tree).findIndex((r) => nameOf(r) === name)}`));
const TEN = ten.services.map((s) => s.name);

test("a row taken out goes back between the same two rows, whatever was taken out after it: the review's repro", () => {
  // The spec review's probe. Service 6 out, then Service 3: Service 6's Undo was drawn between 7 and 8, and pressed it
  // gave 1, 2, 4, 5, 7, 6, 8. Each Undo kept the index its row had when it went, and put the row back there.
  let tree = openSheet(drawTab({ profile: ten }));
  removeNamed(tree, "Service 6");
  tree = redrawTab();
  removeNamed(tree, "Service 3");
  tree = redrawTab();
  assert.deepEqual(
    drawnOf(tree),
    [
      "Service 1",
      "Service 2",
      "<Service 3>",
      "Service 4",
      "Service 5",
      "<Service 6>",
      "Service 7",
      "Service 8",
      "Service 9",
      "Service 10",
    ],
    "each Undo where its row was",
  );
  press(undoFor(tree, "Service 6"));
  tree = redrawTab();
  assert.deepEqual(
    namesOf(rowsOf(tree)),
    [
      "Service 1",
      "Service 2",
      "Service 4",
      "Service 5",
      "Service 6",
      "Service 7",
      "Service 8",
      "Service 9",
      "Service 10",
    ],
    "REGRESSION: 1, 2, 4, 5, 7, 6, 8",
  );
  assert.deepEqual(
    drawnOf(tree).slice(0, 3),
    ["Service 1", "Service 2", "<Service 3>"],
    "the Undo still waiting stays in its row's place",
  );
  press(undoFor(tree, "Service 3"));
  tree = redrawTab();
  assert.deepEqual(namesOf(rowsOf(tree)), TEN);
  assert.equal(all(byTestId(tree, "rec-services-rows"), (n) => classes(n).includes("bt-service-gone")).length, 0);
});

test("two rows taken out go back in either order, apart or from the same gap, and the toast's Undo and the one in the row's place put a row back once", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  // Apart, the later removal put back first.
  let tree = openSheet(drawTab({ profile: ten, flash }), flash);
  removeNamed(tree, "Service 6");
  tree = redrawTab(flash);
  const six = flashes.at(-1).undo;
  removeNamed(tree, "Service 3");
  tree = redrawTab(flash);
  press(undoFor(tree, "Service 3"));
  tree = redrawTab(flash);
  assert.deepEqual(drawnOf(tree), [
    "Service 1",
    "Service 2",
    "Service 3",
    "Service 4",
    "Service 5",
    "<Service 6>",
    "Service 7",
    "Service 8",
    "Service 9",
    "Service 10",
  ]);
  // The toast's Undo for Service 6, then the one in its place, pressed in the same breath before the page draws again: once.
  const inPlace = undoFor(tree, "Service 6");
  six();
  press(inPlace);
  tree = redrawTab(flash);
  assert.deepEqual(namesOf(rowsOf(tree)), TEN, "REGRESSION: a second Service 6");
  assert.equal(undoFor(tree, "Service 6"), null, "and its Undo in the row's place goes with it");

  // From the same gap: Service 3, then Service 4, which had moved up into its place.
  for (const first of ["Service 3", "Service 4"]) {
    tree = openSheet(drawTab({ profile: ten, flash }), flash);
    removeNamed(tree, "Service 3");
    tree = redrawTab(flash);
    const three = flashes.at(-1).undo;
    removeNamed(tree, "Service 4");
    tree = redrawTab(flash);
    assert.deepEqual(
      drawnOf(tree).slice(0, 5),
      ["Service 1", "Service 2", "<Service 3>", "<Service 4>", "Service 5"],
      "two Undos in one gap, in their rows' order",
    );
    press(undoFor(tree, first));
    tree = redrawTab(flash);
    press(undoFor(tree, first === "Service 3" ? "Service 4" : "Service 3"));
    tree = redrawTab(flash);
    assert.deepEqual(namesOf(rowsOf(tree)), TEN, `${first} put back first`);
    // The toast's Undo for Service 3, pressed after the one in its place put it back, puts nothing back again.
    three();
    assert.deepEqual(namesOf(rowsOf(redrawTab(flash))), TEN);
  }

  // A row put back before a waiting one moves it down with the rows around it; one taken out after it leaves it be.
  tree = openSheet(drawTab({ profile: ten, flash }), flash);
  removeNamed(tree, "Service 2");
  tree = redrawTab(flash);
  removeNamed(tree, "Service 9");
  tree = redrawTab(flash);
  removeNamed(tree, "Service 5");
  tree = redrawTab(flash);
  press(undoFor(tree, "Service 2"));
  tree = redrawTab(flash);
  removeNamed(tree, "Service 10");
  tree = redrawTab(flash);
  for (const name of ["Service 9", "Service 10", "Service 5"]) {
    press(undoFor(tree, name));
    tree = redrawTab(flash);
  }
  assert.deepEqual(namesOf(rowsOf(tree)), TEN);
});

test("while the sheet could not open, the services row offers no act, as a fold offers none; and nothing is taken down", () => {
  // The spec review's probe: a stored list whose draft cannot be worked out (here a hand-edited record whose services
  // are not a list). BtFold hides its act then; the services row offered one that opened nothing.
  const errors = [];
  const was = console.error;
  console.error = (...args) => errors.push(args);
  try {
    let tree = drawTab({ profile: { ...marisa, services: { Balayage: 180 } } });
    const row = byTestId(tree, "rec-row-services");
    assert.equal(byTestId(row, "rec-row-act-services"), null, "REGRESSION: an act that opened nothing");
    assert.match(textOf(row), /None yet/, "and the row still says what it says");
    W.__recordFolds.request("services");
    tree = redrawTab();
    assert.equal(sheetOf(tree), null);
    assert.ok(byTestId(tree, "rec-card-offer"), "the page is still there");
  } finally {
    console.error = was;
  }
  // With a list, the act is there.
  assert.ok(byTestId(drawTab({ profile: many }), "rec-row-act-services"));
});

test("an Undo from an earlier opening says the editor it was in has closed, even on a list that is full now", () => {
  // The quality review's P2: the sheet closed and opened again on sixty services, and the old toast's Undo said the
  // list was full, as if the row could go back once one was taken out. It cannot: its editor went.
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = openSheet(drawTab({ profile: full, flash }), flash);
  press(byTestId(tree, "rec-service-remove-0"));
  tree = redrawTab(flash);
  const old = flashes.at(-1).undo;
  press(byTestId(tree, "rec-sheet-cancel-services"));
  tree = redrawTab(flash);
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = openSheet(redrawTab(flash), flash);
  assert.equal(rowsOf(tree).length, LIMIT);
  old();
  assert.deepEqual(
    [flashes.at(-1).tone, said(flashes.at(-1))],
    ["warn", "Not put back — the editor it was in has closed. Open it again to change it."],
    "REGRESSION: it said the list was full",
  );
  assert.equal(rowsOf(redrawTab(flash)).length, LIMIT);
});

test("a row put back while the search says something else comes back in sight, pinned to that search and no later one", () => {
  // The quality review's P6: a row taken out while searching "Service 5" and put back while searching "Service 7" came
  // back hidden, so its Undo put it somewhere nobody could see, and focus went to a hidden box. A row changed since the
  // sheet opened stays in sight under the search in force when it changed; it was pinned against every later search too.
  let tree = openSheet(drawTab({ profile: ten }));
  searchFor(tree, "Service 5");
  tree = redrawTab();
  removeNamed(tree, "Service 5");
  tree = redrawTab();
  searchFor(tree, "Service 7");
  tree = redrawTab();
  press(undoFor(tree, "Service 5"));
  tree = redrawTab();
  assert.deepEqual(namesOf(shownOf(tree)), ["Service 5", "Service 7"], "REGRESSION: it came back hidden");
  // Pinned to the search it came back under, not to every one after it.
  searchFor(tree, "Service 9");
  tree = redrawTab();
  assert.deepEqual(namesOf(shownOf(tree)), ["Service 9"]);
  // And a name typed over under one search stays in sight under that search, and is searched as any other after it.
  searchFor(tree, "Service 3");
  tree = redrawTab();
  typeAt(tree, "Service 3 name", "Balayage");
  tree = redrawTab();
  assert.deepEqual(namesOf(shownOf(tree)), ["Balayage"]);
  searchFor(tree, "Service 8");
  tree = redrawTab();
  assert.deepEqual(
    namesOf(shownOf(tree)),
    ["Service 8"],
    "REGRESSION: a row changed once was shown under every search after",
  );
  searchFor(tree, "bala");
  tree = redrawTab();
  assert.deepEqual(namesOf(shownOf(tree)), ["Balayage"], "found by its new name like any other");
});

test("every box of What you offer is named by the words on screen beside it, so a person who says them reaches it", () => {
  // WCAG 2.5.3, label in name (the quality review): "Offers times up to" was named "Days ahead", and "Anything else
  // about booking, one per line" was named "Booking notes".
  let tree = drawTab();
  openFold(tree, "booking_rules");
  tree = redrawTab();
  const fold = foldOf(tree, "booking_rules");
  for (const box of all(fold, (n) => n.type === "input" || n.type === "textarea")) {
    const holder = find(fold, (n) => n.type === "label" && !!find(n, (m) => m === box));
    const visible = textOf(find(holder, (n) => classes(n).includes("rec-field-label")));
    assert.ok(heard(tree, box).startsWith(visible), `${heard(tree, box)} starts with ${visible}`);
  }
  cancelFoldOf(tree, "booking_rules");
  openFold(redrawTab(), "consult_first");
  tree = redrawTab();
  const consult = find(foldOf(tree, "consult_first"), (n) => n.type === "textarea");
  assert.equal(
    heard(tree, consult),
    "Needs a consult first",
    "the fold's own label, which is the words on screen above it",
  );
  // The sheet's boxes: each is named for its row and the column it is in, whose head is the words on screen.
  cancelFoldOf(tree, "consult_first");
  tree = openSheet(redrawTab());
  const head = all(
    find(sheetOf(tree), (n) => classes(n).includes("bt-service-head")),
    (n) => n.type === "span",
  )
    .map(textOf)
    .filter(Boolean);
  assert.deepEqual(head, ["Service", "Takes (min)", "Price"]);
  const boxes = all(rowsOf(tree)[1], (n) => n.type === "input");
  boxes.forEach((box, i) =>
    assert.match(
      heard(tree, box),
      new RegExp(head[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${heard(tree, box)} holds ${head[i]}`,
    ),
  );
  assert.match(heard(tree, boxes[1]), /min/, "and the minutes box its unit, min, as it is on screen");
});

test("Ctrl or Cmd with Enter saves the sheet, as it saves a fold", () => {
  const sent = saving();
  let tree = openSheet(drawTab({ profile: many }));
  typeAt(tree, "Service 3 takes (min)", "75");
  tree = redrawTab();
  const box = labelled(tree, "Service 3 takes (min)");
  find(sheetOf(tree), (n) => classes(n).includes("rec-sheet")).props.onKeyDown({
    key: "Enter",
    ctrlKey: true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    currentTarget: { contains: () => true },
    target: box,
  });
  assert.equal(sent.length, 1, "REGRESSION: the sheet had no key to save it");
  assert.equal(sent[0].config.brain.profile.services[2].duration_min, 75);
  assert.equal(sheetOf(redrawTab()), null, "taken, and closed");
});

test("the services sheet is drawn by the page's last child, its one sheet slot, with the sheet closed and open", () => {
  // The rule the page's comment stated and nothing held: the kit's sheet holds hooks and is drawn only while open, so
  // a card drawn after it reads shifted hook cells whenever it opens (business-tab-gestures.jsx BtSheet). A card
  // composed below the sheet's line is the first thing this catches, before any of its rows misbehave. Since Phase 5
  // the last child is the slot both sheets go through (business-tab.jsx BtSheetSlot; the prompt sheet's half of this is
  // business-tab-prompt.test.mjs).
  const drawnIn = (node) => [].concat(node.rendered.props.children).filter((c) => c != null && c !== false);
  let tree = drawTab({ profile: many });
  assert.equal(drawnIn(tree).at(-1).type, W.BtSheetSlot, "closed");
  assert.deepEqual(
    drawnIn(drawnIn(tree).at(-1)).map((c) => c.type),
    [W.BtServicesSheet],
    "the services sheet in it",
  );
  tree = openSheet(tree);
  assert.ok(sheetOf(tree));
  const slot = drawnIn(tree).at(-1);
  assert.equal(slot.type, W.BtSheetSlot, "and open");
  // And the kit's sheet is the last thing the slot draws, so the last hook-holding thing on the page.
  const sheet = drawnIn(slot).at(-1);
  assert.deepEqual(
    [sheet.type, sheet.rendered.type, sheet.rendered.rendered.type],
    [W.BtServicesSheet, W.BtSheet, W.RecordSheet],
  );
});

test("each Undo left in a row's place has its own name and id, from what it puts back, two in one gap included", () => {
  // The quality review: two Undos waiting in one gap shared one test id (it was their place), and each was named only
  // "Undo", so a screen reader could not tell which row it put back.
  let tree = openSheet(drawTab({ profile: ten }));
  removeNamed(tree, "Service 3");
  tree = redrawTab();
  removeNamed(tree, "Service 4");
  tree = redrawTab();
  const marks = all(byTestId(tree, "rec-services-rows"), (n) => classes(n).includes("bt-service-gone"));
  const ids = marks.map((n) => n.props["data-testid"]);
  assert.equal(new Set(ids).size, 2, "REGRESSION: one id for two Undos");
  const undos = marks.map((n) => find(n, (m) => m.type === "button"));
  assert.deepEqual(
    undos.map((b) => b.props["aria-label"]),
    [serviceUndoName("Service 3"), serviceUndoName("Service 4")],
  );
  assert.equal(serviceUndoName("Service 3"), "Undo removing Service 3");
  assert.equal(serviceUndoName(""), "Undo removing a service");
  assert.ok(
    undos.every((b) => b.props["aria-label"].startsWith(textOf(b))),
    "and each name holds the word on it (WCAG 2.5.3)",
  );
  // Each by its own id: the one for Service 4 puts Service 4 back.
  press(byTestId(tree, ids[1].replace("gone", "undo")));
  tree = redrawTab();
  assert.deepEqual(drawnOf(tree).slice(0, 5), ["Service 1", "Service 2", "<Service 3>", "Service 4", "Service 5"]);
});

test("a hand-edited record whose consult-first list or rule notes are not lists draws its rows, and the sheet opens", () => {
  // The quality review's probe: each threw as the card drew, and the whole of Settings went with it.
  const errors = [];
  const was = console.error;
  console.error = (...args) => errors.push(args);
  try {
    // The preview is composed from a sane record (the server's composer parses what it composes); the stored config the
    // page reads is then hand-edited, as the probe did, and the page drawn again over it.
    drawTab({ profile: many });
    // Replaced, never changed in place: the stored profile is the harness's fixture object, which every later test reads.
    const brain = W.__SETTINGS.config.brain;
    brain.profile = {
      ...brain.profile,
      booking_rules: { ...brain.profile.booking_rules, consult_first: "Extensions", notes: "Cash only" },
    };
    W.__businessTabSave.saver.reset();
    // A page drawn afresh over it, as it is drawn when the tab opens on such a record.
    unmount();
    let tree = W.React.createElement(W.BusinessTab, { flash: () => {} });
    assert.match(textOf(byTestId(tree, "rec-row-consult_first")), /None/, "a list that is not one is none");
    assert.doesNotMatch(textOf(byTestId(tree, "rec-row-booking_rules")), /Cash only/);
    tree = openSheet(tree);
    assert.ok(sheetOf(tree), "and the sheet opens over it");
    assert.equal(all(sheetOf(tree), (n) => classes(n).includes("bt-service-consult")).length, 0);
  } finally {
    console.error = was;
  }
});

test("Escape in a search with words in it clears the search first, and the next Escape is the sheet's", () => {
  // The quality review: Escape in the search closed the sheet (or asked), where a search box's Escape clears it.
  let tree = openSheet(drawTab({ profile: ten }));
  searchFor(tree, "Service 3");
  tree = redrawTab();
  const box = () => find(byTestId(tree, "rec-services-search"), (n) => n.type === "input");
  const esc = () => ({
    key: "Escape",
    defaultPrevented: false,
    stopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  });
  const first = esc();
  box().props.onKeyDown(first);
  assert.deepEqual(
    [first.stopped, first.defaultPrevented],
    [true, false],
    "the sheet never hears it, and the box's own clear is not stopped",
  );
  tree = redrawTab();
  assert.deepEqual(
    [box().props.value, shownOf(tree).length, !!sheetOf(tree)],
    ["", 10, true],
    "cleared, every row back, the sheet open",
  );
  // Empty, the search leaves Escape to the sheet: it goes on to close it.
  const second = esc();
  box().props.onKeyDown(second);
  assert.equal(second.stopped, false);
  find(sheetOf(tree), (n) => classes(n).includes("rec-sheet")).props.onKeyDown(second);
  assert.equal(sheetOf(redrawTab()), null, "nothing typed: it closes");
});

test("the search says politely how many rows it found, in contracts' words", () => {
  // The quality review: nothing told a screen reader what the search had done to the list.
  let tree = openSheet(drawTab({ profile: many }));
  const status = () => byTestId(tree, "rec-services-found");
  assert.deepEqual(
    [status().props.role, status().props["aria-live"], textOf(status())],
    ["status", "polite", ""],
    "nothing to say with no search",
  );
  searchFor(tree, "Service 2");
  tree = redrawTab();
  assert.equal(textOf(status()), servicesFoundWords(shownOf(tree).length, 33));
  assert.equal(textOf(status()), "11 of 33 services");
  searchFor(tree, "zzz");
  tree = redrawTab();
  assert.equal(textOf(status()), "No service is called that.");
  // A cleared search says nothing again: every row is back, which the list itself shows.
  searchFor(tree, "");
  tree = redrawTab();
  assert.equal(textOf(status()), "");
  // The one region, drawn from the sheet's first draw, so what it says is heard as it changes.
  assert.equal(all(sheetOf(tree), (n) => n.props?.role === "status").length, 1);
});

test("a consult-first mark describes its row's name box, so it is heard with the box", () => {
  // The quality review: the mark beside a name was a word nobody heard with the box it stood beside.
  const tree = openSheet(
    drawTab({ profile: { ...many, booking_rules: { ...marisa.booking_rules, consult_first: ["Service 2"] } } }),
  );
  const mark = byTestId(tree, "rec-service-consult-1");
  const nameBox = labelled(tree, "Service 2 name");
  assert.ok(mark.props.id, "the mark has an id");
  const by = String(nameBox.props["aria-describedby"] || "").split(" ");
  assert.ok(by.includes(mark.props.id), "and the name box is described by it");
  assert.equal(
    textOf(find(tree, (n) => n.props?.id === mark.props.id)),
    "consult first",
    "which says what the mark says",
  );
  // Only one row's box: an id is the page's once, and a row it does not mark is described by nothing of it.
  assert.equal(all(tree, (n) => n.props?.id === mark.props.id).length, 1);
  assert.ok(
    !String(labelled(tree, "Service 3 name").props["aria-describedby"] || "").includes("consult"),
    "a row it does not mark",
  );
});
