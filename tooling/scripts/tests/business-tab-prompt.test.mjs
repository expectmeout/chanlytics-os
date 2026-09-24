/**
 * Settings › Business, *What your receptionist is told*, EXECUTED on the stub React (the plan's Phase 5, Task 5.1): the
 * told section at rest, the one door it offers, and the prompt sheet that door opens -- the prompt as a table of
 * contents, every block named for the row that wrote it, each opening that row. The page, the fixture and the presses
 * are _business-tab-harness.mjs; every claim here is something the page drew, or something a press on it did.
 *
 * It replaces PromptPreview, a 4,345-character <pre> behind a Show toggle, and what prompt-preview.test.mjs held about
 * it by reading settings.jsx's source is held here by drawing the sheet.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  promptBlocks,
  blockShareWords,
  promptCostWords,
  promptTotalWords,
  PROMPT_READERS,
  PROMPT_NOW,
} from "@chanlytics/contracts";
import { unmount, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";
import {
  W,
  KNOWN,
  composePromptPreview,
  drawTab,
  melany,
  redrawTab,
  openFolds,
  typeAt,
  went,
} from "./_business-tab-harness.mjs";

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

/** The page with the prompt sheet opened from the told section's door, on the channel asked for. */
const drawPrompt = (channel = "whatsapp", over = {}) => {
  const tree = drawTab({ profile: melany, ...over });
  press(byTestId(tree, "rec-prompt-open"));
  let open = redrawTab();
  if (channel !== "whatsapp") {
    const phone = find(byTestId(open, "rec-prompt-channel"), (n) => n.props?.role === "radio" && textOf(n) === "Phone");
    press(phone);
    open = redrawTab();
  }
  return open;
};
const sheetOf = (tree) => byTestId(tree, "rec-sheet-prompt");
/** The resolved prompt the sheet cuts, cut the way it cuts it: with the stored brain, so a carried prompt is found. */
const cut = (channel) => promptBlocks(W.__SETTINGS.prompt[channel], channel, W.__SETTINGS.config.brain);
const entriesOf = (tree) => all(byTestId(tree, "rec-prompt-contents"), (n) => classes(n).includes("bt-prompt-entry"));
/** An element's description, as a screen reader reads it: the text of every node its aria-describedby names. */
const describedBy = (tree, node) =>
  String(node.props["aria-describedby"] || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => textOf(find(tree, (n) => n.props?.id === id)))
    .join(" ");
/** What is on the glass: every text node outside a visually hidden span. */
const onScreen = (n) => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(onScreen).join("");
  if (classes(n).includes("rec-sr")) return "";
  if (n.rendered !== undefined) return onScreen(n.rendered);
  return onScreen(n.props?.children);
};

/* ------------------------------------ the plan's four ------------------------------------ */

test("the contents lists one entry per block, with what each costs: a share on screen, the count in its description", () => {
  const tree = drawPrompt();
  const blocks = cut("whatsapp");
  const total = W.__SETTINGS.prompt.whatsapp.length;
  const entries = entriesOf(tree);
  assert.equal(entries.length, blocks.length);
  blocks.forEach((b, i) => {
    const entry = entries[i];
    assert.match(textOf(entry), new RegExp(b.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${b.id} is listed`);
    // The plan asked for the count in the entry. The owner's rule (22 Sep) put it where a screen reader and a tip
    // find it and nowhere on the glass: the entry is described by it, and draws the share as a bar.
    assert.equal(describedBy(tree, entry), promptCostWords(b.chars, total), `${b.id} is described by what it costs`);
    assert.match(
      describedBy(tree, entry),
      new RegExp(b.chars.toLocaleString("en-US")),
      "the exact count, for a reader",
    );
    assert.equal(entry.props.title, promptCostWords(b.chars, total), "and for a pointer");
    assert.doesNotMatch(onScreen(entry), /\d/, `${b.id}: no number on the glass`);
    // Nor in its NAME: a visually hidden span inside the button still names it, so the count was heard twice, once as
    // the entry's name and once as its description. The name is everything the button holds, hidden text included.
    assert.doesNotMatch(textOf(entry), /\d/, `${b.id}: the entry's name is its label alone`);
    // No bar of its share either (23 Sep): the rail is a plain list of names, and the cost is the description's.
    assert.equal(
      find(entry, (n) => classes(n).includes("bt-prompt-bar")),
      null,
      `${b.id}: nothing drawn but its name`,
    );
  });
  // The whole is the contents' own name, and nowhere else.
  const contents = byTestId(tree, "rec-prompt-contents");
  const name = String(contents.props["aria-labelledby"])
    .split(" ")
    .map((id) => textOf(find(tree, (n) => n.props?.id === id)))
    .join(" ");
  assert.equal(name, `Written by ${promptTotalWords(total)}`);
});

test("a block carries a door back to the row that wrote it", () => {
  const tree = drawPrompt();
  const block = byTestId(tree, "rec-prompt-block-services");
  const door = find(block, (n) => typeof n.props?.onClick === "function");
  assert.ok(door, "the block opens its row");
  // And pressing it closes the sheet and opens the row, through the one-open-at-a-time registry.
  press(door);
  const next = redrawTab();
  assert.equal(sheetOf(next), null, "the prompt sheet has closed");
  assert.ok(byTestId(next, "rec-sheet-services"), "and the services sheet is open in its place");
  assert.equal(W.__recordFolds.open(), "services");
});

test("the hand-off block says it is always sent", () => {
  for (const channel of ["whatsapp", "voice"]) {
    const block = byTestId(drawPrompt(channel), "rec-prompt-block-handoff");
    assert.match(textOf(block), /always sent/i, channel);
  }
});

test("what is sent beside the prompt is drawn apart, and says why", () => {
  const tree = drawPrompt();
  const now = byTestId(tree, "rec-prompt-now");
  assert.match(textOf(now), /rebuilt/i);
  assert.match(textOf(now), /prompt cache/i, "the reason it is separate is the reason it stays separate");
  assert.ok(textOf(now).includes(W.__composedPrompt("whatsapp").now), "the clock the server composed, as it is");
  assert.ok(textOf(now).includes(PROMPT_NOW.why.whatsapp));
  // Apart: no block of the prompt holds it.
  for (const b of cut("whatsapp")) {
    assert.ok(!textOf(byTestId(tree, `rec-prompt-block-${b.id}`)).includes("Right now"), `${b.id} does not hold it`);
  }
  // On a call it is rebuilt for the call, and it is the call's cache it keeps.
  const call = textOf(byTestId(drawPrompt("voice"), "rec-prompt-now"));
  assert.match(call, /rebuilt for every call/);
  assert.ok(call.includes(PROMPT_NOW.why.voice));
  assert.ok(!call.includes("on every message"), "a call's clock is not rebuilt per message");
});

/* ------------------------------------ the slot ------------------------------------ */

test("the page draws one sheet slot, and it draws one sheet or none", () => {
  // The fold registry opens one editor or sheet at a time, so one slot draws whichever it has open. (The slot was drawn
  // last because the tests' old stub kept every hook in one order; it keeps each component's where it sits now.)
  const slotOf = (tree) => find(tree, (n) => n.type === W.BtSheetSlot);
  const sheets = (tree) => all(tree, (n) => n.type === W.RecordSheet);
  let tree = drawTab({ profile: melany });
  assert.ok(slotOf(tree), "closed");
  assert.equal(sheets(tree).length, 0, "and it draws no sheet");

  press(byTestId(tree, "rec-prompt-open"));
  tree = redrawTab();
  assert.deepEqual(
    sheets(tree).map((s) => s.props.id),
    ["prompt"],
  );
  assert.ok(
    find(slotOf(tree), (n) => n.type === W.BtPromptSheet),
    "drawn by the slot",
  );

  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  W.__recordFolds.request("services");
  tree = redrawTab();
  assert.deepEqual(
    sheets(tree).map((s) => s.props.id),
    ["services"],
  );
});

test("opened after the services sheet, and the services sheet after it, every editor keeps its own", () => {
  // The two sheets share the slot's tail: a draft typed into the services sheet and thrown away, the prompt sheet
  // opened and closed, and the services sheet opened again reads the stored list with no trace of the draft, while
  // every row before the slot says what it said and the prompt sheet drew its own blocks in between.
  const names = (tree) =>
    all(
      byTestId(tree, "rec-sheet-services"),
      (n) => n.type === "input" && /name$/.test(n.props["aria-label"] || ""),
    ).map((n) => n.props.value);
  let tree = drawTab({ profile: melany });
  const rest = textOf(byTestId(tree, "rec-row-hours"));
  press(byTestId(tree, "rec-row-act-services"));
  tree = redrawTab();
  typeAt(tree, "Service 1 name", "A draft nobody saved");
  tree = redrawTab();
  assert.deepEqual(names(tree), ["A draft nobody saved", "Highlights"], "the draft is in the sheet");
  press(find(byTestId(tree, "rec-sheet-services"), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  press(byTestId(tree, "rec-sheet-services-cancel-yes"));
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-sheet-services"), null, "thrown away, and closed");

  press(byTestId(tree, "rec-prompt-open"));
  tree = redrawTab();
  assert.deepEqual(
    all(sheetOf(tree), (n) => /^rec-prompt-block-/.test(n.props?.["data-testid"] || "")).map(
      (n) => n.props["data-testid"],
    ),
    cut("whatsapp").map((b) => `rec-prompt-block-${b.id}`),
    "the prompt sheet draws its own blocks",
  );
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();

  press(byTestId(tree, "rec-row-act-services"));
  tree = redrawTab();
  assert.deepEqual(names(tree), ["Balayage", "Highlights"], "the stored list, and the draft is gone");
  assert.equal(textOf(byTestId(tree, "rec-row-hours")), rest);
});

/* ------------------------------------ the sheet ------------------------------------ */

test("the told section's door opens the sheet, and its Close, Escape and foot all close it again", () => {
  let tree = drawTab({ profile: melany });
  assert.equal(sheetOf(tree), null);
  assert.equal(byTestId(tree, "rec-prompt-open").props["data-rec-act"], "prompt", "focus comes back to the door");
  press(byTestId(tree, "rec-prompt-open"));
  tree = redrawTab();
  const sheet = sheetOf(tree);
  assert.ok(sheet, "open");
  assert.equal(W.__recordFolds.open(), "prompt", "through the registry, so only one editor or sheet is open");
  assert.equal(sheet.props.role, "dialog");
  // The head's Close.
  press(find(sheet, (n) => n.props?.["aria-label"] === "Close"));
  assert.equal(sheetOf(redrawTab()), null);
  // Escape.
  press(byTestId(redrawTab(), "rec-prompt-open"));
  tree = redrawTab();
  sheetOf(tree).props.onKeyDown({ key: "Escape", defaultPrevented: false, preventDefault() {} });
  assert.equal(sheetOf(redrawTab()), null);
  // The foot's Close: there is nothing to save, so it is the foot's one button.
  press(byTestId(redrawTab(), "rec-prompt-open"));
  tree = redrawTab();
  const foot = find(sheetOf(tree), (n) => classes(n).includes("rec-sheet-foot"));
  const buttons = all(foot, (n) => n.type === "button");
  assert.deepEqual(
    buttons.map((b) => textOf(b)),
    ["Close"],
  );
  press(buttons[0]);
  assert.equal(sheetOf(redrawTab()), null);
});

test("the head says what it is and who reads it, and counts nothing", () => {
  for (const channel of ["whatsapp", "voice"]) {
    const tree = drawPrompt(channel);
    const kit = find(tree, (n) => n.type === W.RecordSheet);
    assert.equal(kit.props.title, "What your receptionist is told");
    assert.equal(kit.props.sub, PROMPT_READERS[channel], `${channel}: one muted line`);
    const sheet = sheetOf(tree);
    const head = find(sheet, (n) => classes(n).includes("rec-sheet-head"));
    assert.doesNotMatch(textOf(head), /\d/, `${channel}: no count in the head`);
    // Who reads it is said ONCE in the sheet (PromptPreview carried it twice while open, Task 4.0's I3). The told section
    // behind says it too, but a modal dialog is all a screen reader is given while it is open (aria-modal).
    assert.equal(
      textOf(sheet).split(PROMPT_READERS[channel]).length - 1,
      1,
      `${channel}: who reads it, once in the sheet`,
    );
    // The channel switch is the kit's toggle group, in the sheet's tools.
    const toggle = byTestId(sheet, "rec-prompt-channel");
    assert.equal(toggle.props.role, "radiogroup");
    const on = find(toggle, (n) => n.props?.role === "radio" && n.props["aria-checked"] === true);
    assert.equal(textOf(on), channel === "voice" ? "Phone" : "WhatsApp");
  }
});

test("every block is keyed by its id, and on a call the platform's text is drawn twice", () => {
  const tree = drawPrompt("voice");
  const blocks = cut("voice");
  const ids = blocks.map((b) => b.id);
  assert.deepEqual(
    ids.filter((id) => id.startsWith("platform")),
    ["platform", "platform-2"],
    "the platform speaks before and after the owner's words on a call",
  );
  for (const b of blocks) {
    const block = byTestId(tree, `rec-prompt-block-${b.id}`);
    assert.ok(block, `${b.id} is drawn`);
    assert.ok(textOf(block).includes(b.text), `${b.id} holds its own text, as contracts cut it`);
  }
  // The page composes nothing: every block's text, in order, is every word the receptionist reads.
  const drawn = all(sheetOf(tree), (n) => /^rec-prompt-block-/.test(n.props?.["data-testid"] || ""));
  assert.deepEqual(
    drawn.map((n) => n.props["data-testid"]),
    ids.map((id) => `rec-prompt-block-${id}`),
  );
  assert.equal(entriesOf(tree).length, blocks.length, "one entry for each, the platform's twice");
});

test("each block says what contracts wrote about it, and a block with nothing to say says nothing", () => {
  for (const channel of ["whatsapp", "voice"]) {
    const tree = drawPrompt(channel);
    for (const b of cut(channel)) {
      const block = byTestId(tree, `rec-prompt-block-${b.id}`);
      const note = find(block, (n) => classes(n).includes("bt-prompt-block-note"));
      if (b.note) assert.equal(textOf(note), b.note, `${channel}: ${b.id}`);
      else assert.equal(note, null, `${channel}: ${b.id} carries no note`);
    }
  }
  // The rules block says it carries the YES OFFERS line; the platform's say whose they are.
  const tree = drawPrompt();
  assert.match(textOf(byTestId(tree, "rec-prompt-block-guardrails")), /YES OFFERS/);
  assert.match(textOf(byTestId(tree, "rec-prompt-block-platform")), /Written by Chanlytics/);
});

test("the prompt carried into a blank box is found, because the sheet cuts with the stored brain", () => {
  // No words of the owner's own: the resolver carries the stored prompt in their place, and the sheet names it so.
  const carried = { ...melany, extra_instructions: undefined };
  const tree = drawPrompt("whatsapp", { profile: carried });
  const own = byTestId(tree, "rec-prompt-block-extra_instructions");
  assert.ok(own, "the carried prompt is a block of its own");
  assert.match(textOf(own), /before it had fields/, "and says where it came from");
  assert.ok(textOf(own).includes(W.__SETTINGS.config.brain.system_prompt));
});

test("a phone reads the share on each block's head, as the rail's bar, with the words kept for a screen reader", () => {
  // Under 761px the rail is not drawn (settings.css; the journey measures it at 390px), so each block's head carries
  // the rail's own bar: the same one quiet indicator at every width. The share in contracts' words was on the glass
  // there once, and "less than a tenth of everything it reads" stood under most heads; the words are a screen
  // reader's now (visually hidden on a phone, not drawn above it, where the entry's description says it).
  const tree = drawPrompt();
  const total = W.__SETTINGS.prompt.whatsapp.length;
  for (const b of cut("whatsapp")) {
    const head = find(byTestId(tree, `rec-prompt-block-${b.id}`), (n) => classes(n).includes("bt-prompt-block-head"));
    assert.equal(
      find(head, (n) => classes(n).includes("bt-prompt-bar")),
      null,
      `${b.id}: no bar under the head`,
    );
    const share = find(head, (n) => classes(n).includes("bt-prompt-block-share"));
    assert.equal(textOf(share), blockShareWords(b.chars, total), `${b.id}: the words, for a reader`);
  }
  assert.ok(
    find(sheetOf(tree), (n) => n.type === "nav" && classes(n).includes("bt-prompt-rail")),
    "the rail, which a phone hides",
  );
});

test("an entry takes the reader to its block", () => {
  const tree = drawPrompt();
  const shown = [];
  const was = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => ({
    scrollIntoView: (o) => shown.push(["scroll", id, o && o.block]),
    focus: (o) => shown.push(["focus", id, !!(o && o.preventScroll)]),
  });
  try {
    press(entriesOf(tree).find((e) => textOf(e).includes("Services")));
  } finally {
    globalThis.document.getElementById = was;
  }
  assert.deepEqual(shown, [
    ["scroll", "bt-prompt-block-services", "start"],
    ["focus", "bt-prompt-block-services", true],
  ]);
  assert.equal(byTestId(tree, "rec-prompt-block-services").props.id, "bt-prompt-block-services");
  assert.equal(byTestId(tree, "rec-prompt-block-services").props.tabIndex, -1, "a block takes focus, not a Tab stop");
});

test("every block a row of this page wrote opens that row, and the platform's opens nothing", () => {
  const where = {
    identity: ["inline", "name"],
    hours: ["fold", "hours"],
    notes: ["fold", "notes"],
    booking_rules: ["fold", "booking_rules"],
    handoff: ["fold", "escalate_when"],
    guardrails: ["fold", "guardrails"],
    extra_instructions: ["fold", "extra_instructions"],
  };
  for (const [id, [kind, row]] of Object.entries(where)) {
    const tree = drawPrompt();
    const door = byTestId(tree, `rec-prompt-door-${id}`);
    assert.ok(door, `${id} has a door`);
    // The class the latent-until-approached rule reads (settings.css; the journey measures it by computed style).
    assert.ok(classes(door).includes("bt-prompt-door"), `${id}: a door, drawn on approach on a desktop`);
    press(door);
    const next = redrawTab();
    assert.equal(sheetOf(next), null, `${id}: the sheet closes`);
    assert.equal(W.__recordFolds.open(), row, `${id}: ${row} opens`);
    const editor = byTestId(next, `rec-${kind}-${row}`);
    assert.ok(editor && !editor.props.hidden, `${id}: and its ${kind} is on the page`);
    if (kind === "fold") assert.deepEqual(openFolds(next), [row]);
  }
  const tree = drawPrompt();
  assert.equal(byTestId(tree, "rec-prompt-door-platform"), null, "Chanlytics' own lines are no row's");
});

test("the closed days' block opens the closed days' fold", () => {
  // Melany's record has no closure ahead, so the block exists only on a record with one: a month out, whatever today is.
  const date = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const tree = drawPrompt("whatsapp", { profile: { ...melany, closures: [{ date, note: "Inventory" }] } });
  press(byTestId(tree, "rec-prompt-door-closures"));
  const next = redrawTab();
  assert.equal(sheetOf(next), null, "the sheet closes");
  assert.equal(W.__recordFolds.open(), "closures");
  assert.deepEqual(openFolds(next), ["closures"], "and the closed days' fold is the one open");
});

test("the Autonomy tab's rules open the Autonomy tab", () => {
  // A record whose details compose nothing is answered with its own prompt and only the Autonomy tab's rules after it
  // (resolveSystemPrompt), so those rules are a block of their own -- here, with Booking and FAQ on "ask".
  let tree = drawTab({ profile: null });
  W.__SETTINGS.prompt = composePromptPreview(W.__SETTINGS.config.brain, {
    tz: "America/New_York",
    policy: { booking: { mode: "ask" }, faq: { mode: "ask" } },
    known: KNOWN,
    openings: null,
  });
  tree = redrawTab();
  press(byTestId(tree, "rec-prompt-open"));
  tree = redrawTab();
  const door = byTestId(tree, "rec-prompt-door-autonomy");
  assert.ok(door, "the Autonomy tab's rules offer a door");
  went.length = 0;
  press(door);
  assert.deepEqual(went, ["admin/autonomy"], "to the Autonomy tab");
  assert.equal(sheetOf(redrawTab()), null, "and the sheet has closed");
  assert.equal(W.__recordFolds.open(), null);
});

test("a role that may not change the business reads the whole prompt, and is offered no door into a row", () => {
  const was = W.canDo;
  W.canDo = () => false;
  try {
    const tree = drawPrompt();
    assert.ok(sheetOf(tree), "reading is not changing");
    for (const b of cut("whatsapp")) {
      assert.ok(byTestId(tree, `rec-prompt-block-${b.id}`), `${b.id} is drawn`);
      assert.equal(byTestId(tree, `rec-prompt-door-${b.id}`), null, `${b.id} offers no door`);
    }
  } finally {
    W.canDo = was;
  }
});

/* ------------------------------------ the told section at rest ------------------------------------ */

test("what the receptionist is told says who reads it at rest, with one door, and counts nothing", () => {
  // Task 4.0's guarantee, carried from PromptPreview's head: one phrase and the door at rest, no count anywhere on the
  // glass, and the phrase follows the channel last chosen.
  let tree = drawTab({ profile: melany });
  const told = byTestId(tree, "rec-card-told");
  assert.equal(textOf(find(told, (n) => classes(n).includes("rec-card-title"))), "What your receptionist is told");
  assert.equal(textOf(find(told, (n) => classes(n).includes("rec-card-sub"))), PROMPT_READERS.whatsapp);
  assert.deepEqual(
    all(told, (n) => n.type === "button").map((b) => b.props["data-testid"]),
    ["rec-prompt-open"],
    "one door, and nothing else to press",
  );
  assert.doesNotMatch(onScreen(told), /\d/, "no count at rest");
  assert.equal(sheetOf(tree), null, "and nothing of the prompt is drawn until it is asked for");
  // Opened on Phone and closed, the phrase is the phone's.
  tree = drawPrompt("voice");
  press(find(sheetOf(tree), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  assert.equal(
    textOf(find(byTestId(tree, "rec-card-told"), (n) => classes(n).includes("rec-card-sub"))),
    PROMPT_READERS.voice,
  );
});

test("the sheet draws what the server composed, word for word, and nothing when it composed nothing", () => {
  // Run, not read: prompt-preview.test.mjs held this by finding `window.__composedPrompt` in settings.jsx's source.
  const was = W.__composedPrompt;
  try {
    const text = "A prompt the server composed.\n\nRules you must follow:\n- One rule.";
    W.__composedPrompt = (channel) => ({ text: `${text} (${channel})`, now: "It is 7:23 PM.", tz: "America/New_York" });
    let tree = drawPrompt();
    const sheet = sheetOf(tree);
    const blocks = all(sheet, (n) => /^rec-prompt-block-/.test(n.props?.["data-testid"] || ""));
    assert.equal(
      blocks.map((b) => textOf(find(b, (n) => classes(n).includes("bt-prompt-block-text")))).join("\n\n"),
      `${text} (whatsapp)`,
    );
    assert.ok(textOf(byTestId(sheet, "rec-prompt-now")).includes("It is 7:23 PM."));
    // Nothing composed: no section, no door, no sheet -- an empty box would say "your receptionist is told nothing".
    W.__composedPrompt = () => null;
    tree = drawTab({ profile: melany });
    assert.equal(byTestId(tree, "rec-card-told"), null);
    assert.equal(byTestId(tree, "rec-prompt-open"), null);
  } finally {
    W.__composedPrompt = was;
  }
});
