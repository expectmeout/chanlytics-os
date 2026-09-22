/**
 * Settings › Business on a workspace with NO receptionist, EXECUTED on the stub React: the empty state, the fold its
 * act opens, and the one request that sets a receptionist up (pages/business-tab-create.jsx).
 *
 * This is the one thing the form being replaced did that no row of the new page does. Provisioning inserts an empty
 * tenant_config row (migration 00017), so every workspace starts here, and the old form's create path was the only way
 * out of it from inside the product. Every claim below is something the card drew, or something a press on it sent.
 *
 * It draws the card itself rather than the page (window.BusinessTab draws nothing without a brain, by design), over the
 * stub, the globals and the save stand-in of _business-tab-harness.mjs.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { newReceptionistDefaults, FALLBACK_DEFAULTS, roleGate, whyNotAPhone } from "@chanlytics/contracts";
import { again, unmount, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";
import { W, saving } from "./_business-tab-harness.mjs";

// The last card this file drew goes as React would take it away (the harness says why).
after(() => unmount());

/**
 * The card as PaneWorkspace draws it: a connected workspace whose config holds no brain. `line` is the voice line the
 * platform provisioned, `handoff` the number a caller who insists on a person is transferred to; both absent is the
 * workspace as it arrives, before Connections has given it a line.
 */
const drawCreate = ({ flash = () => {}, line = null, handoff = null, config = {}, read = true } = {}) => {
  W.__SETTINGS = read ? { version: 3, config, prompt: null } : null;
  W.__FACTS = {
    facts: {
      voice_line: { value: line, source: line ? "provisioned" : "absent" },
      handoff_number: { value: handoff, source: handoff ? "typed" : "absent" },
    },
    conflicts: [],
  };
  W.__WORKSPACES = [{ id: "t-new", name: "Bella Nails", timezone: "America/New_York" }];
  W.__ACTIVE_WORKSPACE = "t-new";
  unmount();
  W.__recordFolds.reset();
  W.__businessTabSave.saver.reset();
  W.__businessTabSave.zone.reset();
  return W.React.createElement(W.BtCreateCard, { flash });
};
/** The same card again, over the same hook cells, as React draws it after a state change. */
const redrawCreate = (flash = () => {}) => again(() => W.React.createElement(W.BtCreateCard, { flash }));

/** Press "Set up the receptionist", which is what opens the fold. */
const setUp = (tree) => press(byTestId(tree, "rec-create-open"));
const foldOpen = (tree) => !byTestId(tree, "rec-fold-receptionist").props.hidden;
/** A box of the fold, and typing into it the way a person does. */
const boxIn = (tree, testid) => find(byTestId(tree, testid), (n) => n.type === "input" || n.type === "textarea");
const typeIn = (tree, testid, text) => boxIn(tree, testid).props.onChange({ target: { value: text } });
/** What a box says is wrong with it: the one FieldError under it, or null. */
const wrongIn = (tree, testid) => {
  const field = byTestId(tree, testid);
  const said = field ? find(field, (n) => n.type === W.FieldError && n.props.message) : null;
  return said ? textOf(said) : null;
};
const save = (tree) => press(byTestId(tree, "rec-fold-save-receptionist"));

/* ------------------------------------ at rest ------------------------------------ */

test("a workspace with no receptionist is told so, and offered the one act that changes it", () => {
  const tree = drawCreate();
  const empty = find(tree, (n) => classes(n).includes("empty"));
  assert.match(textOf(empty), /This workspace has no receptionist yet/);
  assert.match(textOf(empty), /no business name, no phone line, no booking link/);
  assert.equal(foldOpen(tree), false, "and the fold is closed until it is asked for");
  // The act carries the fold's id, where the kit gives focus back as the fold closes (record-fold.jsx data-rec-act).
  assert.equal(byTestId(tree, "rec-create-open").props["data-rec-act"], "receptionist");
  // The timezone is the workspace's, not the receptionist's: it decides what "today" means from the first day, so it
  // is reachable before a receptionist exists (S13). It is When you're open's own row, not a copy of it.
  assert.ok(byTestId(tree, "rec-row-timezone"), "and the zone can be set before there is anything to answer with");
});

test("its act opens the three things a receptionist cannot answer anyone without, each named by its visible label", () => {
  let tree = drawCreate();
  setUp(tree);
  tree = redrawCreate();
  assert.equal(foldOpen(tree), true);
  // Named by what is on screen beside them (WCAG 2.5.3), in the old create form's order.
  const labels = all(byTestId(tree, "rec-fold-receptionist"), (n) => classes(n).includes("rec-field-label"))
    .map(textOf)
    .filter(Boolean);
  assert.deepEqual(labels, ["Business name", "Tell customers to call", "Booking link"]);
  // The number's box is named by that same visible label, which is a heading over a choice and a box, not a <label>.
  assert.equal(boxIn(tree, "rec-create-number").props["aria-labelledby"], "bt-create-number-label");
  assert.equal(textOf(find(tree, (n) => n.props?.id === "bt-create-number-label")), "Tell customers to call");
  assert.equal(
    boxIn(tree, "rec-create-name").props.value,
    "",
    "and nothing is filled in for a workspace that has nothing",
  );
  assert.equal(boxIn(tree, "rec-create-link").props.value, "");
});

test("no other business is anyone's example: the boxes are empty and the placeholders are fictional", () => {
  // The setup form's placeholders were the live salon's own name and its working transfer number, shown to the next
  // business as its example. Every box here starts empty, and the one placeholder that is a number is the reserved
  // 555-01xx range (the rows this box is shared with used it; business-tab-who.jsx).
  let tree = drawCreate();
  setUp(tree);
  tree = redrawCreate();
  const boxes = all(byTestId(tree, "rec-fold-receptionist"), (n) => n.type === "input");
  assert.deepEqual(
    boxes.map((b) => b.props.value),
    ["", "", ""],
    "nothing is filled in",
  );
  const said = JSON.stringify(boxes.map((b) => [b.props.placeholder, b.props.title]));
  for (const leak of ["Melany", "932 5775", "932-5775", "booksy", "1817434"]) {
    assert.ok(!said.includes(leak), `a real business's ${leak} must not be a placeholder`);
  }
  assert.ok(said.includes("555 0143"), "555-01xx is the reserved fictional range");
});

test("the line it answers on is named the way people write it, and choosing it is offered first", () => {
  // REGRESSION (L7): the create form showed +13055550100 -- the stored form, which nobody writes or reads out.
  let tree = drawCreate({ line: "+13055550100" });
  setUp(tree);
  tree = redrawCreate();
  const choice = byTestId(tree, "rec-create-number-choice");
  assert.deepEqual(all(choice, (n) => n.props?.role === "radio").map(textOf), ["Your line", "A different number"]);
  const note = textOf(byTestId(tree, "rec-create-number-note"));
  assert.ok(note.startsWith("+1 (305) 555-0100 — the line your receptionist answers"), note);
  assert.ok(!note.includes("+13055550100"), "REGRESSION: the stored form, in front of the owner");
});

test("with nothing read to save onto, the act is not offered at all", () => {
  // A dead button spends a press to reach nothing: the fold cannot work out a draft without a config behind it
  // (btOpening), so it would never open. The row's act asks the same question before it offers one.
  const tree = drawCreate({ read: false });
  assert.match(
    textOf(find(tree, (n) => classes(n).includes("empty"))),
    /This workspace has no receptionist yet/,
    "the state is still said",
  );
  assert.equal(byTestId(tree, "rec-create-open"), null, "and nothing is offered that would do nothing");
});

/* ------------------------------------ what stops it ------------------------------------ */

test("every empty field says so under itself, nothing is sent, and the fold stays open", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawCreate({ flash });
  setUp(tree);
  tree = redrawCreate(flash);
  save(tree);
  tree = redrawCreate(flash);
  assert.equal(sent.length, 0, "nothing goes to the server while a field is empty");
  assert.equal(wrongIn(tree, "rec-create-name"), "The receptionist needs a business name before it can answer anyone.");
  assert.equal(
    wrongIn(tree, "rec-create-number"),
    "There is no line yet, so the receptionist needs a number to give out.",
  );
  assert.equal(wrongIn(tree, "rec-create-link"), "The receptionist needs a booking link before it can answer anyone.");
  assert.equal(foldOpen(tree), true, "and it stays open over what was typed");
});

test("with a line to answer on, the number is not asked for — and a number that is not one is refused", () => {
  const sent = saving();
  let tree = drawCreate({ line: "+13083368109" });
  setUp(tree);
  tree = redrawCreate();
  save(tree);
  tree = redrawCreate();
  assert.equal(wrongIn(tree, "rec-create-number"), null, "the line it answers on is a number to give out");
  assert.equal(wrongIn(tree, "rec-create-name"), "The receptionist needs a business name before it can answer anyone.");
  // Chosen "A different number" and typed something that is not one: the row's own check, said under the box.
  press(
    find(
      byTestId(tree, "rec-create-number-choice"),
      (n) => n.props?.role === "radio" && textOf(n) === "A different number",
    ),
  );
  tree = redrawCreate();
  typeIn(tree, "rec-create-number", "555");
  tree = redrawCreate();
  save(tree);
  tree = redrawCreate();
  assert.equal(wrongIn(tree, "rec-create-number"), whyNotAPhone("555"));
  assert.equal(sent.length, 0);
});

test("a booking link that is not a full web address is refused under its own box", () => {
  const sent = saving();
  let tree = drawCreate({ line: "+13083368109" });
  setUp(tree);
  tree = redrawCreate();
  typeIn(tree, "rec-create-name", "Bella Nails");
  tree = redrawCreate();
  typeIn(tree, "rec-create-link", "bella.example/book");
  tree = redrawCreate();
  save(tree);
  tree = redrawCreate();
  assert.equal(
    wrongIn(tree, "rec-create-link"),
    "That booking link needs to be a full web address, starting with https://",
  );
  assert.equal(wrongIn(tree, "rec-create-name"), null, "and the field that is right says nothing");
  assert.equal(sent.length, 0);
});

/* ------------------------------------ the one request ------------------------------------ */

test("one request carries the three facts and the product's own prompt and messages, and nothing else", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  // A workspace that has an alerts address already: the create save goes ONTO the config, never in place of it.
  let tree = drawCreate({ flash, config: { alerts: { emails: ["owner@example.com"] } } });
  setUp(tree);
  tree = redrawCreate(flash);
  typeIn(tree, "rec-create-name", "  Bella Nails ");
  tree = redrawCreate(flash);
  typeIn(tree, "rec-create-number", " (646) 555-0100 ");
  tree = redrawCreate(flash);
  typeIn(tree, "rec-create-link", " https://bella.example/book ");
  tree = redrawCreate(flash);
  assert.equal(W.__settingsUnsaved(), true, "the rail and the browser ask before this is thrown away");
  save(tree);
  assert.equal(sent.length, 1, "one request, on the version the read handed over");
  assert.equal(sent[0].version, 3);
  assert.deepEqual(sent[0].config, {
    alerts: { emails: ["owner@example.com"] },
    brain: {
      business_name: "Bella Nails",
      phone_display: "(646) 555-0100",
      booking_link: "https://bella.example/book",
      ...newReceptionistDefaults("Bella Nails"),
    },
  });
  assert.deepEqual(
    sent[0].config.brain.fallbacks,
    FALLBACK_DEFAULTS,
    "the product's wording, which names the details rather than copying them in",
  );
  assert.equal(textOf(flashes.at(-1).msg), "Saved — the receptionist picks these up within a minute");
  assert.equal(foldOpen(redrawCreate(flash)), false, "accepted, the fold closes");
});

test("the line it answers on is stored as no number at all, which is what makes it follow the line", () => {
  const sent = saving();
  let tree = drawCreate({ line: "+13083368109" });
  setUp(tree);
  tree = redrawCreate();
  typeIn(tree, "rec-create-name", "Bella Nails");
  tree = redrawCreate();
  typeIn(tree, "rec-create-link", "https://bella.example/book");
  tree = redrawCreate();
  save(tree);
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0].config.brain).sort(), [
    "booking_link",
    "business_name",
    "fallbacks",
    "system_prompt",
  ]);
  assert.equal(
    "phone_display" in sent[0].config.brain,
    false,
    "absent is the schema's way of saying: the line it answers",
  );
});

test("a number typed and then put back to the line is stored as no number, not as the line", () => {
  // The row this box is shared with has the same case (business-tab-page.test.mjs, "A number typed before, put
  // back to the line"): pressing A different number fills the box with the line it answers on, so a draft that
  // kept what was in the box would publish the line as an OVERRIDE -- a stored string that stops following the
  // line the moment the line changes, which is the whole reason absent is the right answer.
  const sent = saving();
  let tree = drawCreate({ line: "+13083368109" });
  setUp(tree);
  tree = redrawCreate();
  typeIn(tree, "rec-create-name", "Bella Nails");
  tree = redrawCreate();
  typeIn(tree, "rec-create-link", "https://bella.example/book");
  tree = redrawCreate();

  const choose = (words) => {
    press(find(byTestId(tree, "rec-create-number-choice"), (n) => n.props?.role === "radio" && textOf(n) === words));
    tree = redrawCreate();
  };
  choose("A different number");
  assert.equal(
    boxIn(tree, "rec-create-number").props.value,
    "+1 (308) 336-8109",
    "the box fills with the line it answers on",
  );
  choose("Your line");
  const box = () => find(byTestId(tree, "rec-create-number"), (n) => classes(n).includes("bt-inline-box"));
  assert.equal(box().props.hidden, true, "and choosing the line puts the box away, with what was in it");
  assert.equal(boxIn(tree, "rec-create-number").props.value, "+1 (308) 336-8109", "which the draft still carries");

  save(tree);
  assert.equal(sent.length, 1);
  assert.equal(
    "phone_display" in sent[0].config.brain,
    false,
    "nothing is stored, so what it gives out follows the line",
  );
});

/* ------------------------------------ who may do it ------------------------------------ */

test("a role that may not change the business is told why, and nothing opens for it", () => {
  W.ST_STORE = { can: (perm) => perm !== "settings", myRole: () => "viewer" };
  try {
    const sent = saving();
    let tree = drawCreate();
    const act = byTestId(tree, "rec-create-open");
    assert.equal(act.props["aria-disabled"], true, "the act is there, refused, and says why at the press");
    assert.equal(act.props["aria-description"], roleGate("viewer", "settings", "set up the receptionist").reason);
    setUp(tree);
    tree = redrawCreate();
    assert.equal(foldOpen(tree), false, "and the fold never opens");
    assert.equal(sent.length, 0);
  } finally {
    delete W.ST_STORE;
  }
});
