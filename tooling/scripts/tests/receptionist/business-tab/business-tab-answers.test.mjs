/**
 * Settings › Business, *How it answers*, EXECUTED on the stub React: the voice, the languages, the rules it always
 * keeps, how it hands you a customer, the things it should know, what it is told in your own words, and the three
 * messages sent in your name. The page, the fixture and the presses are _business-tab-harness.mjs; every claim here is
 * something the page drew, or something a press on it sent.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  businessGap,
  roleGate,
  TONE_PRESETS,
  handoffWords,
  handoffCallRow,
  handoffChatRow,
  HANDOFF_ANYWAY,
  notesWords,
  noteEndedWords,
  composeSystemPrompt,
  DAY_MS,
  instructionsWords,
  fallbacksWords,
  fallbackMessages,
  RULES_WITHOUT_FIELDS_WORDS,
  PROFILE_CROSSING_WORDS,
  FALLBACK_DEFAULTS,
  EARLIER_FALLBACK_DEFAULTS,
  newReceptionistDefaults,
  hasProfile,
  GUARDRAIL_KEYS,
  ruleStrength,
  ALWAYS_ON,
  PRICE_CHOICE_WORDS,
  VISION_SWITCH_WORDS,
  rulesKept,
  guardrailsInForce,
  GREETING_TEMPLATE,
  greetingOf,
} from "@chanlytics/contracts";
import { unmount, all, find, byTestId, textOf, classes, press } from "../../_legacy-react.mjs";
import {
  KNOWN,
  W,
  brainOf,
  composePromptPreview,
  composed,
  drawTab,
  foldOf,
  labelled,
  marisa,
  openFold,
  openFolds,
  openRows,
  ownWords,
  partsOf,
  problemUnder,
  redrawTab,
  saveFoldOf,
  cancelFoldOf,
  escape,
  saving,
  went,
  without,
} from "../../_business-tab-harness.mjs";

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

const ROWS = ["tone", "languages", "guardrails", "escalate_when", "notes", "extra_instructions", "fallbacks"];
const SAVED = "Saved — the receptionist picks it up within a minute";
const said = (f) => textOf({ props: { children: f.msg } });
const cardOf = (tree) => byTestId(tree, "rec-card-answers");
/** The box a fold's field draws, by the fold it is in: the kit's RecordField, an input or a textarea. */
const boxIn = (tree, fold) =>
  find(foldOf(tree, fold), (n) => (n.type === "input" || n.type === "textarea") && classes(n).includes("rec-input"));
const typeIn = (tree, fold, text) => boxIn(tree, fold).props.onChange({ target: { value: text } });
/** A button by the words on it, inside a node: what a person sees and presses. */
/** The sentence the kit's FieldError draws for a box, by the box's id: rec-<id>-problem. */
const problemOf = (tree, boxId) => {
  const n = find(tree, (m) => m.type === W.FieldError && m.props.id === `rec-${boxId}-problem`);
  return n ? textOf(n) : null;
};
const switchOf = (tree, key) => byTestId(tree, `rec-rule-switch-${key}`);
const langBox = (tree) => find(byTestId(tree, "rec-languages-add"), (n) => n.props?.role === "combobox");
const langOptions = (tree) => all(byTestId(tree, "rec-languages-add"), (n) => n.props?.role === "option");
const tokensOf = (tree) =>
  all(byTestId(tree, "rec-languages-tokens"), (n) => classes(n).includes("bt-token")).map((n) => ownWords(n));
const key = (k, value = "") => ({
  key: k,
  target: { value },
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
});
const noteRows = (tree) => all(byTestId(tree, "rec-notes-rows"), (n) => classes(n).includes("bt-note"));
const titlesOf = (tree) => noteRows(tree).map((r) => find(r, (n) => n.type === "input").props.value);
/** A record with n notes, titled A, B, C… */
const notesOf = (n) =>
  Array.from({ length: n }, (_, i) => ({
    title: String.fromCharCode(65 + i),
    text: `Note ${String.fromCharCode(65 + i)} says this.`,
  }));

/* ------------------------------------ the plan's three ------------------------------------ */

test("the voice's box is the first row of How it answers, reading Not set on a record with no tone", () => {
  // Marisa's record, with no tone on it.
  const tree = drawTab({ profile: without(marisa, "tone") });
  const card = cardOf(tree);
  const rows = all(card, (n) => classes(n).includes("rec-row"));
  assert.match(textOf(rows[0]), /Its voice/);
  assert.match(textOf(rows[0]), /Not set/);
  assert.equal(rows[0].props["data-empty"], "true");
  assert.equal(textOf(byTestId(rows[0], "rec-row-act-tone")).trim(), "Give it one", "the canvas's act for the gap");
  // How it talks: the voice, then the languages, under its title and sub. What callers hear first is On calls' (18 Oct
  // 2026), What it knows holds the next three, and the rules it always keeps and how it hands you a customer are
  // limits, on Autonomy's Limits card (17 Oct 2026).
  assert.deepEqual(all(card, (n) => classes(n).includes("rec-row-key")).map(textOf), ["Its voice", "Languages"]);
  assert.equal(textOf(find(card, (n) => classes(n).includes("rec-card-title"))), "How it talks");
  assert.equal(
    textOf(find(card, (n) => classes(n).includes("rec-card-sub"))),
    "Its voice, and the languages it speaks",
  );
  const knows = byTestId(tree, "rec-card-knows");
  assert.deepEqual(all(knows, (n) => classes(n).includes("rec-row-key")).map(textOf), [
    "Things it should know",
    "In your own words",
    "When it can't answer",
  ]);
  // The record whole, as its three pages draw it in turn, and How it answers alone as Settings draws it: its two cards,
  // What it can do and what it is told, then the sheet slot, the page's last drawn child.
  assert.deepEqual(
    all(drawTab(), (n) => classes(n).includes("rec-card")).map((n) => n.props["data-testid"]),
    [
      "rec-card-who",
      "rec-card-offer",
      "rec-card-goal",
      "rec-card-open",
      "rec-card-booking",
      "rec-card-answers",
      "rec-card-calls",
      "rec-card-knows",
      "rec-card-can",
      "rec-card-told",
      "rec-card-try",
    ],
  );
  const page = drawTab({ part: "receptionist" });
  assert.deepEqual(
    all(page, (n) => classes(n).includes("rec-card")).map((n) => n.props["data-testid"]),
    ["rec-card-answers", "rec-card-calls", "rec-card-knows", "rec-card-can", "rec-card-told", "rec-card-try"],
  );
  const tail = [].concat(page.rendered.props.children).filter((c) => c != null && c !== false);
  assert.equal(tail.at(-1).type, W.BtSheetSlot);
  const cards = [].concat(tail.at(-2).props.children).filter((c) => c != null && c !== false);
  assert.deepEqual(
    cards.map((c) => c.type.name),
    ["BtTalksCard", "BtCallsCard", "BtKnowsCard", "LearnedFromYou", "BtCanCard", "BtPromptTold", "BtTryIt"],
    "How it talks, On calls, What it knows and what the corrections suggest, What it can do, what it is told, and Try it, at rest, last",
  );
});

test("typing a voice reaches the composer: the fold says the Tone line it will be told, and the save writes the tone alone", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: without(marisa, "tone"), flash });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "tone");
  tree = redrawTab(flash);
  assert.deepEqual(openFolds(tree), ["tone"]);
  assert.equal(
    byTestId(tree, "rec-fold-says-tone"),
    null,
    "nothing typed, nothing it will be told: never an empty block",
  );
  typeIn(tree, "tone", "Calm and kind.");
  tree = redrawTab(flash);
  const next = structuredClone(W.__SETTINGS.config.brain);
  next.profile.tone = "Calm and kind.";
  const line = composed("tone", next).find((l) => l.startsWith("Tone:"));
  assert.equal(line, "Tone: Calm and kind.", "the composer's own line");
  assert.deepEqual(
    partsOf(byTestId(tree, "rec-fold-says-tone")),
    [["Preview what it's told", line]],
    "the one line it changes, not the whole of Who you are",
  );
  saveFoldOf(tree, "tone");
  tree = redrawTab(flash);
  assert.equal(sent.length, 1);
  const expected = structuredClone(stored);
  expected.brain.profile.tone = "Calm and kind.";
  assert.deepEqual(sent[0].config, expected, "the stored config with the tone written, and nothing else");
  assert.deepEqual([openFolds(tree), said(flashes.at(-1))], [[], SAVED], "taken, the fold closes and says so");

  // Over a voice that is stored, what goes is said beside what comes.
  tree = drawTab({ profile: marisa });
  openFold(tree, "tone");
  tree = redrawTab();
  assert.equal(boxIn(tree, "tone").props.value, marisa.tone, "it opens with the voice as stored");
  typeIn(tree, "tone", "Calm and kind.");
  tree = redrawTab();
  assert.deepEqual(partsOf(byTestId(tree, "rec-fold-says-tone")), [
    ["Preview what it's told", "Tone: Calm and kind."],
    ["No longer told", `Tone: ${marisa.tone}`],
  ]);
});

test("hand-off is one row, one line: the reasons counted and what a call does", () => {
  const row = byTestId(drawTab({ profile: marisa }), "rec-row-escalate_when");
  // The line is contracts' (handoffWords), and the number is the resolved fact, written for people as the Who you are
  // row writes it. The reasons themselves are the fold's: quoted on the row they were two lines and an ellipsis.
  const words = handoffWords(marisa.escalate_when, "+1 (212) 555-0142");
  assert.equal(textOf(byTestId(row, "rec-handoff-line")), words.line);
  assert.equal(words.line, "For 2 reasons · on a call, transfers to +1 (212) 555-0142");
  assert.doesNotMatch(textOf(row), /They ask for a person|WhatsApp|Phone/);
  assert.equal(all(row, (n) => classes(n).includes("rec-row-hint")).length, 0, "the row states its fact and stops");
  // No number: it takes a message, as the Who you are row says.
  const none = byTestId(
    drawTab({
      profile: without(marisa, "handoff_number"),
      facts: { handoff_number: { value: null, source: "absent" } },
    }),
    "rec-row-escalate_when",
  );
  assert.match(textOf(byTestId(none, "rec-handoff-line")), /takes a message$/);
  // The number is read as the Who you are row reads it, the resolved fact first: the two rows never say two things.
  const tree = drawTab({ facts: { handoff_number: { value: null, source: "absent" } } });
  assert.match(textOf(byTestId(tree, "rec-row-handoff_number")), /Takes a message instead/);
  assert.match(
    textOf(byTestId(tree, "rec-handoff-line")),
    /takes a message$/,
    "not the number the profile still holds",
  );
});

/* ------------------------------------ the voice ------------------------------------ */

test("a starting point fills the voice with its sentence, which is contracts', and saves as typed", () => {
  const sent = saving();
  let tree = drawTab({ profile: without(marisa, "tone") });
  openFold(tree, "tone");
  tree = redrawTab();
  // One small menu where three boxes stood (23 Sep): its items are the starting points, in contracts' order.
  const menu = byTestId(tree, "rec-tone-presets");
  assert.match(textOf(menu), /Start from/, "the menu says what it is for");
  assert.equal(menu.props["aria-haspopup"], "menu");
  const items = (t) => all(byTestId(t, "rec-fold-tone"), (n) => n.props?.role === "menuitem");
  assert.equal(items(tree).length, 0, "closed, its items are not on the page");
  press(menu);
  tree = redrawTab();
  assert.deepEqual(
    items(tree).map((b) => textOf(b).trim()),
    TONE_PRESETS.map((p) => p.label),
  );
  press(items(tree).find((b) => textOf(b).trim() === "Professional, no small talk"));
  tree = redrawTab();
  assert.equal(items(tree).length, 0, "a pick closes the menu");
  const tone = TONE_PRESETS.find((p) => p.label === "Professional, no small talk").tone;
  assert.equal(boxIn(tree, "tone").props.value, tone, "the press fills the box");
  assert.deepEqual(partsOf(byTestId(tree, "rec-fold-says-tone")), [["Preview what it's told", `Tone: ${tone}`]]);
  saveFoldOf(tree, "tone");
  assert.equal(sent[0].config.brain.profile.tone, tone);
});

test("a voice past what the profile keeps is refused under its box, and nothing is sent", () => {
  const sent = saving();
  let tree = drawTab({ profile: without(marisa, "tone") });
  openFold(tree, "tone");
  tree = redrawTab();
  typeIn(tree, "tone", "x".repeat(201));
  tree = redrawTab();
  saveFoldOf(tree, "tone");
  tree = redrawTab();
  assert.equal(sent.length, 0);
  assert.equal(problemOf(tree, "bt-tone"), "At most 200 characters — this is 201.");
  assert.equal(boxIn(tree, "tone").props["aria-invalid"], true);
  assert.deepEqual(openFolds(tree), ["tone"], "the fold stays open with what was typed");
});

test("the gap line's tone door opens the voice's fold, with its box in it", () => {
  let tree = drawTab({ profile: without(marisa, "tone") });
  const gap = businessGap(W.__SETTINGS.config.brain, null);
  assert.equal(gap.row, "tone");
  const door = byTestId(byTestId(tree, "rec-gap"), "rec-gap-door");
  // Heard as the gap's sentence, then the act of the row it opens.
  const heard = door.props["aria-labelledby"]
    .split(" ")
    .map((id) => find(tree, (n) => n.props?.id === id))
    .filter(Boolean)
    .map(textOf)
    .join(" ");
  assert.equal(heard, `${gap.sentence} Give it one Its voice`);
  press(door);
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["tone"]);
  assert.equal(
    boxIn(tree, "tone").props["aria-labelledby"],
    "rec-fold-tone-label",
    "the box is named by the fold's own label",
  );
  assert.equal(textOf(find(tree, (n) => n.props?.id === "rec-fold-tone-label")), "Its voice");
});

/* ------------------------------------ the languages ------------------------------------ */

test("a language is added from the list or as typed, removed with its Undo, and given back by Backspace in the empty box", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  const row = byTestId(tree, "rec-row-languages");
  assert.match(textOf(row), /English, Spanish/);
  // The list is the fact, and the row stops there (24 Sep): "It answers in whichever of these a customer uses." stood
  // under every filled list, a sentence about what a list of languages is. The fold's sentence says it, once.
  assert.doesNotMatch(textOf(row), /whichever/);
  assert.equal(all(row, (n) => classes(n).includes("rec-row-hint")).length, 0);
  openFold(tree, "languages");
  tree = redrawTab(flash);
  assert.deepEqual(tokensOf(tree), ["English", "Spanish"]);
  // The box is named by the words on screen in it, and the tokens by the fold's label.
  assert.deepEqual(
    [langBox(tree).props["aria-label"], langBox(tree).props.placeholder],
    ["Add a language", "Add a language"],
  );
  assert.equal(byTestId(tree, "rec-languages-tokens").props["aria-labelledby"], "rec-fold-languages-label");
  // The list offers the common ones not chosen; a name it does not hold is offered as typed, after the matches.
  langBox(tree).props.onChange({ target: { value: "Fre" } });
  tree = redrawTab(flash);
  assert.deepEqual(langOptions(tree).map(textOf), ["French", "Add “Fre”"]);
  press(langOptions(tree)[0]);
  tree = redrawTab(flash);
  assert.deepEqual(tokensOf(tree), ["English", "Spanish", "French"]);
  assert.deepEqual(partsOf(byTestId(tree, "rec-fold-says-languages")), [
    [
      "Preview what it's told",
      "The business serves customers in: English, Spanish, French. Reply in the language the customer writes in, and switch if they do.",
    ],
    [
      "No longer told",
      "The business serves customers in: English, Spanish. Reply in the language the customer writes in, and switch if they do.",
    ],
  ]);
  langBox(tree).props.onChange({ target: { value: "Xhosa" } });
  tree = redrawTab(flash);
  assert.deepEqual(langOptions(tree).map(textOf), ["Add “Xhosa”"]);
  langBox(tree).props.onKeyDown(key("Enter", "Xhosa"));
  tree = redrawTab(flash);
  assert.deepEqual(tokensOf(tree), ["English", "Spanish", "French", "Xhosa"]);
  // One already chosen, however it is written, is not offered or added twice.
  langBox(tree).props.onChange({ target: { value: "spanish" } });
  tree = redrawTab(flash);
  assert.deepEqual(langOptions(tree).map(textOf), []);

  // A remove says so with an Undo, which puts it back where it was.
  press(byTestId(tree, "rec-language-remove-Spanish"));
  tree = redrawTab(flash);
  assert.deepEqual(tokensOf(tree), ["English", "French", "Xhosa"]);
  assert.equal(said(flashes.at(-1)), "Removed Spanish");
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.deepEqual(
    tokensOf(tree),
    ["English", "Spanish", "French", "Xhosa"],
    "back at its own place, as a word, not an object",
  );
  // Backspace on the empty box takes the last one back, with its Undo; on a box with words in it, it is the box's.
  const typing = key("Backspace", "Ha");
  langBox(tree).props.onKeyDown(typing);
  assert.equal(typing.defaultPrevented, false);
  const back = key("Backspace", "");
  langBox(tree).props.onKeyDown(back);
  tree = redrawTab(flash);
  assert.equal(back.defaultPrevented, true);
  assert.deepEqual(tokensOf(tree), ["English", "Spanish", "French"]);
  assert.equal(said(flashes.at(-1)), "Removed Xhosa");

  saveFoldOf(tree, "languages");
  assert.equal(sent.length, 1);
  const expected = structuredClone(stored);
  expected.brain.profile.languages = ["English", "Spanish", "French"];
  assert.deepEqual(sent[0].config, expected, "the languages, and nothing else");
});

test("a language is one language however it is written, by contracts' one rule, which the first run's chips ask too", () => {
  let tree = drawTab({ profile: { ...marisa, languages: ["English", "Haitian Créole"] } });
  openFold(tree, "languages");
  tree = redrawTab();
  langBox(tree).props.onChange({ target: { value: "Haitian Creole" } });
  tree = redrawTab();
  assert.deepEqual(
    langOptions(tree).map(textOf),
    [],
    "chosen as Haitian Créole, it is not offered again as Haitian Creole",
  );
});

test("a language typed and left in the box is added as focus leaves it, as the old form's was, and saved", () => {
  // The review's probe: "Xhosa" typed, then Save, closed "Saved" with no Xhosa. The old form added what was typed as its
  // box lost focus (settings.jsx addLang), and so does this one, through the kit's onLeave.
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "languages");
  tree = redrawTab();
  langBox(tree).props.onChange({ target: { value: "Xhosa" } });
  tree = redrawTab();
  langBox(tree).props.onBlur();
  tree = redrawTab();
  assert.deepEqual(tokensOf(tree), ["English", "Spanish", "Xhosa"]);
  // A listed one, however it is typed, is added as the list spells it; one already chosen is not added twice.
  langBox(tree).props.onChange({ target: { value: "french" } });
  tree = redrawTab();
  langBox(tree).props.onBlur();
  tree = redrawTab();
  langBox(tree).props.onChange({ target: { value: "SPANISH" } });
  tree = redrawTab();
  langBox(tree).props.onBlur();
  tree = redrawTab();
  assert.deepEqual(tokensOf(tree), ["English", "Spanish", "Xhosa", "French"]);
  saveFoldOf(tree, "languages");
  assert.deepEqual(sent.at(-1).config.brain.profile.languages, ["English", "Spanish", "Xhosa", "French"]);
});

test("the languages stop at what the profile keeps, through Add and through an Undo", () => {
  const eight = ["English", "Spanish", "Portuguese", "French", "Mandarin", "Arabic", "Russian", "Polish"];
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: { ...marisa, languages: eight }, flash });
  openFold(tree, "languages");
  tree = redrawTab(flash);
  const hidden = (t) => find(foldOf(t, "languages"), (n) => classes(n).includes("bt-languages-add")).props.hidden;
  assert.equal(hidden(tree), true, "no box to add a ninth");
  assert.equal(
    textOf(byTestId(tree, "rec-languages-cap")),
    "That is the most languages it keeps. Remove one to add another.",
  );
  press(byTestId(tree, "rec-language-remove-Polish"));
  tree = redrawTab(flash);
  const undo = flashes.at(-1).undo;
  assert.equal(hidden(tree), undefined, "room again, so the box is back");
  assert.equal(byTestId(tree, "rec-languages-cap"), null);
  langBox(tree).props.onChange({ target: { value: "Hindi" } });
  tree = redrawTab(flash);
  press(langOptions(tree)[0]);
  tree = redrawTab(flash);
  assert.equal(tokensOf(tree).length, 8);
  // Full again, the Undo puts nothing back past the cap, and says why.
  assert.equal(undo(), false);
  tree = redrawTab(flash);
  assert.equal(tokensOf(tree).length, 8);
  assert.deepEqual(
    [flashes.at(-1).tone, said(flashes.at(-1))],
    ["warn", "Not put back — That is the most languages it keeps. Remove one to add another."],
  );
});

/* ------------------------------------ the rules it always keeps ------------------------------------ */

test("the rules at rest are a chip for each rule in force, and each is a row of one element in the fold", () => {
  let tree = drawTab({
    profile: {
      ...marisa,
      guardrails: {
        never_quote_prices: true,
        never_confirm_booking: false,
        disclose_ai: true,
        no_health_advice: false,
      },
    },
  });
  const chips = all(byTestId(tree, "rec-rules-chips"), (n) => classes(n).includes("rec-chip")).map(textOf);
  // The booking rule holds whatever a row stores (18 Oct 2026: nothing books), and the price rule is a row of its own
  // beside this one, so it is not named here; photos are an ability on What it can do (contracts rulesKept).
  assert.deepEqual(chips, ["Never confirms a booking", "Says it's an assistant"]);
  // Three rules at most, never past the cap every row of chips keeps (contracts CHIPS_SHOWN, through the kit).
  tree = drawTab();
  assert.deepEqual(all(byTestId(tree, "rec-rules-chips"), (n) => classes(n).includes("rec-chip")).map(textOf), [
    "Never confirms a booking",
    "Says it's an assistant",
    "No health advice",
  ]);
  openFold(tree, "guardrails");
  tree = redrawTab();
  // One element per rule, holding its label, its strength, its tip and its switch; the two that are always on (saying
  // it is an assistant, decision 0051, and the booking rule) say so where a switch would be.
  for (const [k, label] of [
    ["never_confirm_booking", "Never confirm a booking"],
    ["disclose_ai", "Says it's an automated assistant"],
  ]) {
    const always = byTestId(tree, `rec-rule-${k}`);
    assert.match(textOf(always), new RegExp(label));
    assert.equal(textOf(byTestId(always, `rec-rule-always-${k}`)), "Always on");
    assert.equal(switchOf(tree, k), null, `no switch for ${k}, which is not one`);
  }
  const r = byTestId(tree, "rec-rule-no_health_advice");
  assert.ok(
    find(r, (n) => n === switchOf(tree, "no_health_advice")),
    "the health rule's switch is in its row",
  );
  assert.equal(
    textOf(find(r, (n) => n.props?.id === switchOf(tree, "no_health_advice").props["aria-labelledby"])),
    "No health advice",
    "the switch is named by the label beside it",
  );
  // Neither the price rule nor the photo switch is in the fold any more: each is said once, where it is chosen.
  assert.equal(byTestId(tree, "rec-rule-never_quote_prices"), null);
  assert.equal(byTestId(tree, "rec-rule-vision"), null);
});

test("the rules the fold draws are the schema's own, in its order, but the price rule, which is a row of its own", () => {
  // The page lists its rules with their words (BTA_RULES), and cites contracts GUARDRAIL_KEYS without reading it, so
  // this is the pin: the rows the fold DRAWS, in order, are the schema's own keys (GuardrailsSchema.keyof()) less the
  // price rule (the price row's, 18 Oct 2026), so a rule added to the schema and not here has no row and fails.
  let tree = drawTab();
  openFold(tree, "guardrails");
  tree = redrawTab();
  const rows = all(byTestId(tree, "rec-rules-switches"), (n) => classes(n).includes("bt-line"));
  const drawn = rows.map((n) => String(n.props["data-testid"]).replace("rec-rule-", ""));
  assert.deepEqual(
    drawn,
    GUARDRAIL_KEYS.filter((k) => k !== "never_quote_prices"),
  );
  for (const key of drawn) {
    if (ALWAYS_ON.has(key)) assert.ok(byTestId(tree, `rec-rule-always-${key}`), `${key} is always on`);
    else assert.ok(switchOf(tree, key), `${key} has a switch`);
  }
});

test("the fold's one switch saves only its own key, and leaves the price rule and the photo switch as stored", () => {
  const sent = saving();
  let tree = drawTab({
    profile: { ...marisa, guardrails: { ...marisa.guardrails, never_quote_prices: false } },
    config: { features: { vision: true } },
  });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "guardrails");
  tree = redrawTab();
  press(switchOf(tree, "no_health_advice"));
  tree = redrawTab();
  assert.equal(switchOf(tree, "no_health_advice").props["aria-checked"], false);
  saveFoldOf(tree, "guardrails");
  const expected = structuredClone(stored);
  expected.brain.profile.guardrails.no_health_advice = false;
  assert.deepEqual(
    sent.map((s) => s.config),
    [expected],
    "the health rule alone: the price rule off and photos on, both kept",
  );
});

test("absent means as contracts reads it: a record that stores no rules opens with health advice off, and a Save that changes nothing sends nothing", () => {
  const sent = saving();
  let tree = drawTab({ profile: without(marisa, "guardrails") });
  assert.deepEqual(all(byTestId(tree, "rec-rules-chips"), (n) => classes(n).includes("rec-chip")).map(textOf), [
    "Never confirms a booking",
    "Says it's an assistant",
  ]);
  openFold(tree, "guardrails");
  tree = redrawTab();
  assert.equal(switchOf(tree, "no_health_advice").props["aria-checked"], false);
  saveFoldOf(tree, "guardrails");
  tree = redrawTab();
  assert.deepEqual([sent.length, openFolds(tree)], [0, []], "nothing to write is nothing sent");
  // Switched and switched back is nothing too.
  openFold(tree, "guardrails");
  tree = redrawTab();
  press(switchOf(tree, "no_health_advice"));
  tree = redrawTab();
  press(switchOf(tree, "no_health_advice"));
  tree = redrawTab();
  saveFoldOf(tree, "guardrails");
  assert.equal(sent.length, 0);
});

test("the rules fold says the rules block it will be told, with the Autonomy tab's lines in it and its note beside it", () => {
  let tree = drawTab();
  // The settings read resolved its preview with the Autonomy tab's Booking row on ask: the block the fold shows is
  // resolved with the same rows.
  const policy = { booking: { mode: "ask" } };
  W.__SETTINGS = {
    ...W.__SETTINGS,
    prompt: composePromptPreview(brainOf(marisa), { tz: "America/New_York", policy, known: KNOWN, openings: null }),
  };
  openFold(tree, "guardrails");
  tree = redrawTab();
  const says = byTestId(tree, "rec-fold-says-guardrails");
  const block = W.__businessTab.consequenceOf("guardrails", W.__SETTINGS.config.brain, "whatsapp");
  assert.deepEqual(partsOf(says), [["Preview what it's told", block.text]]);
  assert.match(
    block.text,
    /Booking: when someone wants to book, reschedule or cancel, do not send the booking link/,
    "Autonomy's line is in the block",
  );
  assert.equal(
    textOf(find(says, (n) => classes(n).includes("rec-says-note"))),
    block.note,
    "and inside the fold, the block's own note says whose lines they are",
  );
  assert.equal(byTestId(tree, "rec-fold-says-guardrails-note"), null, "only a crossing stands over the folded line");
  assert.equal(byTestId(tree, "rec-rules-unread"), null, "a record that composes says nothing of reaching nothing");
});

test("on a record whose details compose nothing, the rules fold says why once, and draws no empty block", () => {
  const profile = {
    guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: false },
    handoff_number: "+12125550142",
  };
  assert.equal(hasProfile(profile), false, "the fixture composes nothing");
  let tree = drawTab({ profile });
  openFold(tree, "guardrails");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-rules-unread")), RULES_WITHOUT_FIELDS_WORDS);
  assert.equal(all(tree, (n) => ownWords(n) === RULES_WITHOUT_FIELDS_WORDS).length, 1, "said once");
  assert.equal(byTestId(tree, "rec-fold-says-guardrails"), null, "never an empty It will be told");
  press(switchOf(tree, "no_health_advice"));
  tree = redrawTab();
  assert.equal(
    byTestId(tree, "rec-fold-says-guardrails"),
    null,
    "and a switch that reaches nothing says nothing it will be told",
  );
  assert.equal(all(tree, (n) => ownWords(n) === RULES_WITHOUT_FIELDS_WORDS).length, 1);
});

test("at rest the rules are ONE row: the words are contracts', and no strength is said on it", () => {
  // The four strengths live in the fold. At rest this row states one fact -- which rules it keeps -- and Task 4.0's
  // rule allows it one quiet signal, not four badges and four sentences stacked under a chevron nobody pressed.
  const tree = drawTab();
  const row = byTestId(tree, "rec-row-guardrails");
  assert.deepEqual(
    all(byTestId(tree, "rec-rules-chips"), (n) => classes(n).includes("rec-chip")).map(textOf),
    rulesKept({ rules: guardrailsInForce(marisa.guardrails), composes: true }),
    "the words are contracts'",
  );
  const words = textOf(row);
  for (const key of GUARDRAIL_KEYS) {
    const r = ruleStrength(key);
    assert.doesNotMatch(words, new RegExp(escape(r.chip)), `${key}'s strength waits in the fold`);
    assert.doesNotMatch(words, new RegExp(escape(r.sentence.slice(0, 40))), `${key}'s sentence waits in the fold`);
  }
  assert.doesNotMatch(words, /In chat|On a call/, "and so do the two channels");
});

test("M-2: on a record that composes nothing, the row names only what holds, in contracts' words", () => {
  // The fold says once that its switch changes nothing it is told (RULES_WITHOUT_FIELDS_WORDS). At rest the row must
  // not then list rules as if they were lines it reads: what is left is the appointments table that does not exist,
  // and the one line every prompt carries.
  const profile = { guardrails: marisa.guardrails, handoff_number: "+12125550142" };
  assert.equal(hasProfile(profile), false, "the fixture composes nothing");
  const tree = drawTab({ profile });
  const chips = all(byTestId(tree, "rec-rules-chips"), (n) => classes(n).includes("rec-chip")).map(textOf);
  assert.deepEqual(chips, ["Cannot book anything", "Says it's an assistant"]);
  assert.deepEqual(
    chips,
    rulesKept({ rules: guardrailsInForce(profile.guardrails), composes: false }),
    "contracts', not the page's",
  );
  // And a record that DOES compose says the two it is told as well.
  const told = all(byTestId(drawTab(), "rec-rules-chips"), (n) => classes(n).includes("rec-chip")).map(textOf);
  assert.ok(told.includes("Says it's an assistant"));
  assert.ok(told.includes("Never confirms a booking"), "a line it reads, so the claim is covered too");
});

test("at rest the rules row says nothing of prices either way, and a stored booking false still reads as on", () => {
  // Prices are said once, on the price row beside this one (18 Oct 2026).
  const chips = (t) => all(byTestId(t, "rec-rules-chips"), (n) => classes(n).includes("rec-chip")).map(textOf);
  for (const never_quote_prices of [true, false]) {
    const said = chips(drawTab({ profile: { ...marisa, guardrails: { ...marisa.guardrails, never_quote_prices } } }));
    assert.ok(!said.some((w) => /price/i.test(w)), String(never_quote_prices));
  }
  // Nothing in the product books, so no row of the owner's turns the booking rule off (guardrailsInForce).
  const noBooking = { ...marisa, guardrails: { ...marisa.guardrails, never_confirm_booking: false } };
  assert.ok(chips(drawTab({ profile: noBooking })).includes("Never confirms a booking"));
});

/* --- the three strengths, in the fold (Task 4.2) --- */

/** The rules fold, opened: its three rules are drawn in it. */
const rulesOpen = (over = {}) => {
  let tree = drawTab(over);
  openFold(tree, "guardrails");
  return redrawTab();
};
/** A rule's row in the fold, and the strength word on it: quiet under its name, no pill (the fitted sheets, 14 Oct 2026). */
const ruleRow = (tree, key) => byTestId(tree, `rec-rule-${key}`);
/** Each rule's label, as the fold names it. */
const BTA_LABELS = {
  never_quote_prices: "Never quote a price",
  never_confirm_booking: "Never confirm a booking",
  disclose_ai: "Says it's an automated assistant",
  no_health_advice: "No health advice",
};
const badgesOn = (row) =>
  all(row, (n) => String(n.props?.["data-testid"] ?? "").startsWith("rec-rule-strength-")).map(textOf);

test("each rule in the fold says how far it goes, in the words contracts wrote", () => {
  const tree = rulesOpen();
  for (const key of GUARDRAIL_KEYS.filter((k) => k !== "never_quote_prices")) {
    const row = ruleRow(tree, key);
    const r = ruleStrength(key);
    // ONE word, and it is the strength's own: four identical switches over three different guarantees was the
    // quietest dishonesty this page had. Quiet under the name, with no dot, no pill and no tip beside the switch: one
    // signal a row (the fitted sheets, 14 Oct 2026).
    assert.deepEqual(badgesOn(row), [r.chip], `${key} says one word, its strength's`);
    assert.deepEqual(
      all(row, (n) => classes(n).includes("pill") || classes(n).includes("rec-tip")),
      [],
      `${key} wears no pill and no tip`,
    );
    assert.equal(
      textOf(byTestId(tree, `rec-rule-how-${key}`)),
      `${BTA_LABELS[key]}. ${r.sentence}`,
      `${key}'s sentence is read under How these rules work`,
    );
    assert.match(textOf(row), new RegExp(escape(r.sentence)), `${key} says what actually happens`);
    // On a phone the sentence is not drawn (settings.css), so the switch carries it as its description
    // whatever the width: a badge word alone says nothing about what the switch does.
    const says = find(row, (n) => n.props?.id === `bt-rule-${key}-says`);
    assert.equal(textOf(says), r.sentence, `${key}'s sentence is one element`);
    if (ALWAYS_ON.has(key)) continue;
    assert.equal(
      switchOf(tree, key).props["aria-describedby"],
      `bt-rule-${key}-says`,
      `${key}'s switch is described by it`,
    );
  }
  // Three strengths, not four: the two told-and-trusted rules wear the same word.
  assert.equal(new Set(GUARDRAIL_KEYS.map((k) => ruleStrength(k).chip)).size, 3);
});

test("how these rules work says each rule's sentence, and no channel lines: none of the three is checked", () => {
  const tree = rulesOpen();
  const how = byTestId(tree, "rec-rules-checked");
  assert.equal(textOf(find(how, (n) => classes(n).includes("rec-disclosure-label"))), "How these rules work");
  // The checked rule, prices, is its own row (18 Oct 2026): the three here land the same way on both channels.
  assert.deepEqual(
    all(how, (n) => classes(n).includes("bt-fold-note")),
    [],
  );
});

test("saying the prices you wrote, the price row lists what it may say, as the save would leave it", () => {
  // Decision 0051: off, it may say the prices the owner wrote and any other is swapped out; the detector runs either way.
  const off = { ...marisa, guardrails: { ...marisa.guardrails, never_quote_prices: false } };
  const tree = drawTab({ profile: off });
  const row = byTestId(tree, "rec-row-price_choice");
  assert.match(textOf(row), new RegExp(escape(PRICE_CHOICE_WORDS.options.written.label)));
  assert.match(textOf(row), /(It may say |You haven't written a price yet)/);
  // Never saying a price, it lists none.
  assert.doesNotMatch(textOf(byTestId(drawTab(), "rec-row-price_choice")), /It may say/);
});

test("what it may say leaves out a note that has ended on the workspace's own day, as the notes fold calls it ended", (t) => {
  // Noon UTC on 11 October: already the 12th in Auckland, still the 11th in New York and UTC. A note whose last day is
  // the 11th has ended only on the workspace's day, so a list read in any other zone would still offer its price.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-11T12:00:00Z") });
  const offer = { title: "Offer: Colour for $60", text: "Colour is $60 this week.", until: "2026-10-11" };
  const parking = { title: "Parking", text: "Parking is $5." };
  const off = { ...marisa, notes: [offer, parking], guardrails: { ...marisa.guardrails, never_quote_prices: false } };
  const tree = drawTab({ profile: off, zone: "Pacific/Auckland" });
  const listed = textOf(byTestId(tree, "rec-row-price_choice"));
  assert.match(listed, /It may say 5 \(Notes\), as you wrote them\./);
  assert.doesNotMatch(listed, /60/, "the ended offer's price is not one it may say");
  assert.equal(noteEndedWords(offer.until, "Pacific/Auckland", new Date()), "ended Oct 11", "the fold's word for it");
});

test("the photo switch is on What it can do's own row, not among the rules it keeps", () => {
  const sent = saving();
  drawTab();
  const stored = structuredClone(W.__SETTINGS.config);
  assert.equal(byTestId(rulesOpen(), "rec-rule-vision"), null, "no longer in the rules fold");
  const tree = redrawTab();
  const row = byTestId(tree, "rec-can-vision");
  const sw = byTestId(row, "rec-can-vision-switch");
  assert.ok(sw, "the switch is on the ability's row");
  assert.equal(sw.props["aria-checked"], false);
  assert.equal(sw.props["aria-label"], VISION_SWITCH_WORDS.label);
  press(sw);
  assert.deepEqual(
    sent.map((s) => s.config),
    [{ ...stored, features: { ...(stored.features || {}), vision: true } }],
    "features.vision, and nothing else",
  );
});

/* ------------------------------------ how it hands you a customer ------------------------------------ */

test("the transfer number is shown in the hand-off fold, never edited there, and its door opens On calls' row on How it answers", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "escalate_when");
  tree = redrawTab();
  const fold = foldOf(tree, "escalate_when");
  assert.equal(textOf(byTestId(fold, "rec-handoff-number")), "Rings +1 (212) 555-0142");
  const boxes = all(fold, (n) => n.type === "input" || n.type === "textarea");
  assert.equal(boxes.length, 1, "one box, the reasons'");
  assert.ok(
    boxes.every((b) => !/212|0142/.test(String(b.props.value))),
    "and no box holds the number",
  );
  // The door is On calls' row's (How it answers, since 18 Oct 2026), by that row's id: the hand-off is on Autonomy, so
  // it goes to the page that holds the row, the row open (frame/tabs.ts settingsRowRoute). It opened nothing there.
  const door = byTestId(fold, "rec-handoff-door");
  assert.equal(textOf(door), "Change");
  assert.equal(door.props["aria-label"], "Change the transfer number", "named whole for a screen reader");
  went.length = 0;
  press(door);
  assert.deepEqual(went, ["admin/receptionist/handoff_number"]);
  // A fold holding changes asks before the door throws them away.
  tree = drawTab();
  openFold(tree, "escalate_when");
  tree = redrawTab();
  typeIn(tree, "escalate_when", "Refunds");
  tree = redrawTab();
  went.length = 0;
  press(byTestId(foldOf(tree, "escalate_when"), "rec-handoff-door"));
  tree = redrawTab();
  assert.deepEqual([openFolds(tree), openRows(tree), went], [["escalate_when"], [], []], "nothing left behind unsaved");
  assert.ok(byTestId(tree, "rec-fold-escalate_when-ask-confirm"), "asked, beside the changes");
  // Saved, the reasons are written and the number is not touched.
  press(byTestId(tree, "rec-fold-escalate_when-ask-no"));
  tree = redrawTab();
  saveFoldOf(tree, "escalate_when");
  assert.deepEqual(sent.at(-1).config.brain.profile.escalate_when, ["Refunds"]);
  assert.equal(sent.at(-1).config.brain.profile.handoff_number, marisa.handoff_number);
});

test("the hand-off fold says what each channel does in contracts' words, and the chat block it will be told with its note", () => {
  let tree = drawTab();
  openFold(tree, "escalate_when");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-handoff-chat-says")), handoffChatRow(undefined).sub);
  assert.equal(textOf(byTestId(tree, "rec-handoff-call-says")), handoffCallRow("+1 (212) 555-0142").sub);
  // Who it hands over without a reason is the tip beside the box (the kit's RecordTip carries its words).
  assert.equal(byTestId(tree, "rec-handoff-tip").props["data-tip"], HANDOFF_ANYWAY);
  assert.doesNotMatch(
    textOf(foldOf(tree, "escalate_when")),
    /your staff|do not reach it/,
    "REGRESSION: the canvas's two untrue sentences",
  );
  // What it will be told is the chat hand-off block, whole, with the reasons as typed, and its note.
  typeIn(tree, "escalate_when", "Refunds\n\n  A price they want held  ");
  tree = redrawTab();
  const next = structuredClone(W.__SETTINGS.config.brain);
  next.profile.escalate_when = ["Refunds", "A price they want held"];
  const block = W.__businessTab.consequenceOf("escalate_when", next, "whatsapp");
  assert.deepEqual(partsOf(byTestId(tree, "rec-fold-says-escalate_when"))[0], ["Preview what it's told", block.text]);
  assert.match(block.text, /\[\[HUMAN\]\][\s\S]*- Refunds\n- A price they want held/);
  const says = byTestId(tree, "rec-fold-says-escalate_when");
  assert.equal(
    textOf(find(says, (n) => classes(n).includes("rec-says-note"))),
    block.note,
    "its note, inside the fold",
  );
  // The rows say what happens, reasons or none: with none typed, they say the same.
  typeIn(tree, "escalate_when", "  ");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-handoff-chat-says")), handoffChatRow(undefined).sub);
  assert.doesNotMatch(textOf(byTestId(tree, "rec-handoff-call-says")), /Your reasons/);
});

test("with no transfer number, the fold's call sentence says it takes a message, and its door adds one", () => {
  let tree = drawTab({
    profile: without(marisa, "handoff_number"),
    facts: { handoff_number: { value: null, source: "absent" } },
  });
  openFold(tree, "escalate_when");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-handoff-number")), "Takes a message");
  assert.equal(textOf(byTestId(tree, "rec-handoff-call-says")), handoffCallRow(null).sub);
  assert.equal(textOf(byTestId(tree, "rec-handoff-call-says")), "No transfer number");
  const door = byTestId(tree, "rec-handoff-door");
  assert.equal(textOf(door), "Add one");
  assert.equal(door.props["aria-label"], "Add a transfer number", "named for what it does with no number to change");
  went.length = 0;
  press(door);
  assert.deepEqual(went, ["admin/receptionist/handoff_number"], "to On calls, where it is added");
});

test("a workspace that takes no calls is told nothing a call does: no call sentence and no door in the fold", () => {
  // The transfer row's rule (On calls): no sentence is shown that no receptionist of the workspace receives. The
  // row at rest still says it takes a message, as that row says so too.
  const tree0 = drawTab({
    profile: without(marisa, "handoff_number"),
    facts: { voice_line: { value: null, source: "absent" }, handoff_number: { value: null, source: "absent" } },
  });
  assert.match(textOf(byTestId(tree0, "rec-handoff-line")), /takes a message$/);
  assert.match(textOf(byTestId(tree0, "rec-row-handoff_number")), /Takes a message instead/);
  openFold(tree0, "escalate_when");
  const tree = redrawTab();
  assert.equal(
    byTestId(tree, "rec-handoff-call-says"),
    null,
    "REGRESSION: a WhatsApp-only workspace was told what a call does",
  );
  assert.equal(byTestId(tree, "rec-handoff-door"), null);
  assert.ok(byTestId(tree, "rec-handoff-chat-says"), "and WhatsApp's sentence is there as it was");
});

test("how long a hand-off holds off is the Autonomy tab's, and a failed read of it is said where the sentence would be", () => {
  try {
    let tree = drawTab({
      policies: { rows: [{ class: "reply", mode: "auto", limits: { pause_hours: 4 } }], role: "owner" },
    });
    openFold(tree, "escalate_when");
    tree = redrawTab();
    assert.match(textOf(byTestId(tree, "rec-handoff-chat-says")), /replies again after 4 hours/);
    W.__POLICIES = null;
    tree = redrawTab();
    assert.equal(byTestId(tree, "rec-handoff-chat-says"), null, "no sentence it cannot back");
    assert.match(textOf(byTestId(tree, "rec-handoff-unread")), /Couldn't read the Autonomy tab/);
  } finally {
    delete W.__POLICIES;
  }
});

test("more reasons than the profile keeps are refused under the reasons' box", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "escalate_when");
  tree = redrawTab();
  typeIn(tree, "escalate_when", Array.from({ length: 21 }, (_, i) => `Reason ${i + 1}`).join("\n"));
  tree = redrawTab();
  saveFoldOf(tree, "escalate_when");
  tree = redrawTab();
  assert.equal(sent.length, 0);
  assert.equal(problemOf(tree, "bt-escalate-when"), "At most 20 reasons, one to a line — this is 21.");
  assert.equal(
    labelled(tree, "Your reasons"),
    null,
    "the box is named by its label, which holds it, not a second name",
  );
});

/* ------------------------------------ the things it should know ------------------------------------ */

test("the notes at rest are their titles as chips, three and how many more, and None with an act to add one", () => {
  let row = byTestId(drawTab({ profile: { ...marisa, notes: notesOf(6) } }), "rec-row-notes");
  const vm = notesWords(notesOf(6));
  assert.deepEqual(all(row, (n) => classes(n).includes("rec-chip")).map(textOf), [...vm.chips, vm.more]);
  assert.equal(vm.more, "+3");
  row = byTestId(drawTab({ profile: without(marisa, "notes") }), "rec-row-notes");
  assert.match(textOf(row), /None/);
  assert.equal(textOf(byTestId(row, "rec-row-act-notes")).trim(), "Add one");
});

test("a note is added, and one removed comes back at its own place with its Undo", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: { ...marisa, notes: notesOf(3) }, flash });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "notes");
  tree = redrawTab(flash);
  assert.deepEqual(titlesOf(tree), ["A", "B", "C"]);
  // Each box carries its row's place and its column's name, which the head says on screen.
  assert.deepEqual(
    all(
      find(foldOf(tree, "notes"), (n) => classes(n).includes("bt-note-head")),
      (n) => n.type === "span",
    ).map(textOf),
    ["Title", "What it says", "Until (optional)", ""],
  );
  assert.equal(labelled(tree, "Note 2 title").props.value, "B");
  assert.equal(labelled(tree, "Note 2, what it says").type, "textarea");
  assert.equal(byTestId(tree, "rec-note-remove-1").props["aria-label"], "Remove B");
  press(byTestId(tree, "rec-note-remove-1"));
  tree = redrawTab(flash);
  assert.deepEqual(titlesOf(tree), ["A", "C"]);
  assert.equal(said(flashes.at(-1)), "Removed B");
  flashes.at(-1).undo();
  tree = redrawTab(flash);
  assert.deepEqual(titlesOf(tree), ["A", "B", "C"], "back between A and C, not at the end");
  press(byTestId(tree, "rec-notes-add"));
  tree = redrawTab(flash);
  assert.equal(noteRows(tree).length, 4);
  const added = noteRows(tree)[3];
  assert.equal(added.props["data-rec-row"], "note-3", "named for focus to go to its first box");
  find(added, (n) => n.type === "input").props.onChange({ target: { value: "Parking" } });
  tree = redrawTab(flash);
  find(noteRows(tree)[3], (n) => n.type === "textarea").props.onChange({ target: { value: "Behind the building." } });
  tree = redrawTab(flash);
  // What it will be told is the notes block, whole.
  const next = structuredClone(W.__SETTINGS.config.brain);
  next.profile.notes = [...notesOf(3), { title: "Parking", text: "Behind the building." }];
  assert.deepEqual(partsOf(byTestId(tree, "rec-fold-says-notes")), [
    ["Preview what it's told", W.__businessTab.consequenceOf("notes", next, "whatsapp").text],
  ]);
  saveFoldOf(tree, "notes");
  const expected = structuredClone(stored);
  expected.brain.profile.notes = next.profile.notes;
  assert.deepEqual(
    sent.map((s) => s.config),
    [expected],
  );
});

test("the notes stop at ten through Add and through an Undo, and half a note is refused under its row", () => {
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ profile: { ...marisa, notes: notesOf(10) }, flash });
  openFold(tree, "notes");
  tree = redrawTab(flash);
  assert.equal(byTestId(tree, "rec-notes-add"), null, "no Add past ten");
  assert.equal(textOf(byTestId(tree, "rec-notes-cap")), "That is the most notes it keeps. Remove one to add another.");
  press(byTestId(tree, "rec-note-remove-9"));
  tree = redrawTab(flash);
  const undo = flashes.at(-1).undo;
  press(byTestId(tree, "rec-notes-add"));
  tree = redrawTab(flash);
  assert.equal(undo(), false, "full again, nothing is put back");
  assert.equal(said(flashes.at(-1)), "Not put back — That is the most notes it keeps. Remove one to add another.");
  // The new row has a title and no text: half a note, said once under its row, both its boxes wrong by it, and its
  // Until box, which half a note says nothing of, not.
  const sent = saving();
  find(noteRows(tree)[9], (n) => n.type === "input").props.onChange({ target: { value: "Parking" } });
  tree = redrawTab(flash);
  saveFoldOf(tree, "notes");
  tree = redrawTab(flash);
  assert.equal(sent.length, 0);
  assert.equal(textOf(byTestId(tree, "rec-note-problem-9")), "Each note needs both a title and the text to say.");
  assert.deepEqual(
    all(noteRows(tree)[9], (n) => n.type === "input" || n.type === "textarea").map((b) => b.props["aria-invalid"]),
    [true, true, undefined],
  );
});

test("a note's last day is its Until box, a date: a save of another note writes it back as it was stored, and the box sets and clears it", () => {
  const sent = saving();
  const ending = { title: "Holiday hours", text: "Open 10 to 2 this week.", until: "2099-12-31" };
  let tree = drawTab({ profile: { ...marisa, notes: [ending, ...notesOf(2)] } });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "notes");
  tree = redrawTab();
  // Drawn as a closure's day is: the kit's RecordBox, type date, named for its row.
  const until = labelled(tree, "Note 1, until");
  assert.deepEqual([until.props.type, until.props.value], ["date", "2099-12-31"]);
  assert.equal(labelled(tree, "Note 2, until").props.value, "", "a note with no end has an empty box");
  // Another note changed and saved: the note with its last day is written back exactly as it was stored.
  find(noteRows(tree)[2], (n) => n.type === "textarea").props.onChange({ target: { value: "Note B, again." } });
  tree = redrawTab();
  saveFoldOf(tree, "notes");
  const expected = structuredClone(stored);
  expected.brain.profile.notes = [ending, notesOf(1)[0], { title: "B", text: "Note B, again." }];
  assert.deepEqual(
    sent.map((s) => s.config),
    [expected],
  );
  // Set on a note that had none, and cleared on the one that had it: the save writes the one and drops the other.
  const again = saving();
  tree = drawTab({ profile: { ...marisa, notes: [ending, ...notesOf(1)] } });
  openFold(tree, "notes");
  tree = redrawTab();
  labelled(tree, "Note 2, until").props.onChange({ target: { value: "2099-01-15" } });
  tree = redrawTab();
  labelled(tree, "Note 1, until").props.onChange({ target: { value: "" } });
  tree = redrawTab();
  saveFoldOf(tree, "notes");
  assert.equal(again.length, 1);
  assert.deepEqual(again[0].config.brain.profile.notes, [
    { title: "Holiday hours", text: "Open 10 to 2 this week." },
    { title: "A", text: "Note A says this.", until: "2099-01-15" },
  ]);
});

test("a note whose last day has passed on the business's own day reads ended, with the day, beside its title", () => {
  const ended = { title: "Summer offer", text: "Colour at 20% off.", until: "2020-06-30" };
  const lasting = { title: "Holiday hours", text: "Open 10 to 2 this week.", until: "2099-12-31" };
  let tree = drawTab({ profile: { ...marisa, notes: [lasting, ended, ...notesOf(1)] }, zone: "Pacific/Auckland" });
  openFold(tree, "notes");
  tree = redrawTab();
  const endedOf = (i) => find(noteRows(tree)[i], (n) => classes(n).includes("rec-input-unit"));
  // Contracts' words, on the workspace's day, as the closed days' row counts what is still ahead.
  const words = noteEndedWords("2020-06-30", "Pacific/Auckland", new Date());
  assert.equal(words, "ended Jun 30");
  assert.equal(textOf(endedOf(1)), words);
  const title = labelled(tree, "Note 2 title");
  assert.equal(title.props.value, "Summer offer", "the title box keeps its name and its words");
  assert.equal(title.props["aria-describedby"], "bt-note-1-ended", "and is described by the words beside it");
  assert.deepEqual([endedOf(0), endedOf(2)], [null, null], "a note still lasting, and one with no end, say nothing");
});

test("in a workspace with no zone a note's end is judged as the composer judges it, never by the zone the page shows times in", (t) => {
  // With no zone the composer's day is UTC's a day back: a note whose last day is that day is still told to the
  // receptionist, so the form does not call it ended; one whose last day is the day before is not, and the form does.
  // Noon UTC, where New York's day and UTC's are both a day past the composer's: on the real clock, from midnight to
  // four or five UTC, New York's day IS UTC's a day back, and a form that slipped to the page's zone passed then.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-11T12:00:00Z") });
  const at = Date.now();
  const lastDay = new Date(at - DAY_MS).toISOString().slice(0, 10);
  const dayBefore = new Date(at - 2 * DAY_MS).toISOString().slice(0, 10);
  const told = { title: "Holiday hours", text: "Open 10 to 2.", until: lastDay };
  const gone = { title: "Summer offer", text: "Colour at 20% off.", until: dayBefore };
  let tree = drawTab({ profile: { ...marisa, notes: [told, gone] }, zone: null });
  openFold(tree, "notes");
  tree = redrawTab();
  const endedOf = (i) => find(noteRows(tree)[i], (n) => classes(n).includes("rec-input-unit"));
  const base = { business_name: "Marisa's Beauty Salon", booking_link: null, whatsapp_line: null };
  const composed = composeSystemPrompt(base, { notes: [told, gone] }, "whatsapp", null, new Date(at));
  assert.ok(composed.includes("\n- Holiday hours (until "), "the composer, with no zone, still says it");
  assert.equal(endedOf(0), null, "so the form does not call it ended");
  assert.ok(!composed.includes("Summer offer"), "the composer has stopped saying the one before");
  assert.equal(textOf(endedOf(1)), noteEndedWords(dayBefore, null, new Date(at)));
  assert.match(textOf(endedOf(1)), /^ended [A-Z][a-z]{2} \d{1,2}$/);
});

test("a note's last day that is not on the calendar is refused under its Until box, in a closed day's words, and nothing is sent", () => {
  const sent = saving();
  let tree = drawTab({ profile: { ...marisa, notes: notesOf(2) } });
  openFold(tree, "notes");
  tree = redrawTab();
  labelled(tree, "Note 2, until").props.onChange({ target: { value: "2026-11-31" } });
  tree = redrawTab();
  saveFoldOf(tree, "notes");
  tree = redrawTab();
  assert.equal(sent.length, 0, "nothing is sent");
  // The save's one check of a stored day, the closures' own (config-write-rules.test.mjs holds the two to one sentence).
  assert.equal(textOf(problemUnder(tree, "rec-note-1-until")), "2026-11-31 is not a date on the calendar.");
  assert.equal(labelled(tree, "Note 2, until").props["aria-invalid"], true);
  assert.equal(byTestId(tree, "rec-note-problem-1"), null, "said under its own box, not the row's");
  // A change to that note's last day answers its sentence, as a closed day's does.
  labelled(tree, "Note 2, until").props.onChange({ target: { value: "2026-11-30" } });
  tree = redrawTab();
  assert.equal(problemUnder(tree, "rec-note-1-until"), null);
});

test("a note's sentence goes when that note is changed or a note before it is taken out, and stays while another is changed", () => {
  // Each note's sentence is under its own field key (note-<i>): a change to note i answers its own, and a removal moves
  // every later note up a place, so it answers theirs too (BtFold's rows, keysOf).
  const sent = saving();
  let tree = drawTab({ profile: { ...marisa, notes: notesOf(3) } });
  openFold(tree, "notes");
  tree = redrawTab();
  const half = () => {
    find(noteRows(tree)[1], (n) => n.type === "textarea").props.onChange({ target: { value: "" } });
    tree = redrawTab();
    saveFoldOf(tree, "notes");
    tree = redrawTab();
    assert.equal(textOf(byTestId(tree, "rec-note-problem-1")), "Each note needs both a title and the text to say.");
  };
  half();
  find(noteRows(tree)[2], (n) => n.type === "input").props.onChange({ target: { value: "C, again" } });
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-note-problem-1"), "a change to note 3 answers nothing of note 2's");
  find(noteRows(tree)[1], (n) => n.type === "textarea").props.onChange({
    target: { value: "Note B says this again." },
  });
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-note-problem-1"), null, "note 2 changed, its sentence goes with the change");
  half();
  press(byTestId(tree, "rec-note-remove-0"));
  tree = redrawTab();
  assert.deepEqual(
    noteRows(tree).map((_, i) => byTestId(tree, `rec-note-problem-${i}`)),
    [null, null],
    "the note before it went, so every later sentence is asked again at Save",
  );
  assert.equal(sent.length, 0);
});

/* ------------------------------------ in your own words ------------------------------------ */

test("own words carried from the prompt before the form say so, and the save writes them as the owner's and the product's lines as the prompt", () => {
  const sent = saving();
  const before = "You answer for the studio. Parking is behind the building, and we never book walk-ins after five.";
  let tree = drawTab({ brain: { system_prompt: before } });
  // At rest: its opening, contracts' words, and no count of any kind.
  const words = instructionsWords(before);
  assert.equal(textOf(byTestId(tree, "rec-own-words")), words.opening);
  assert.equal(textOf(byTestId(tree, "rec-row-extra_instructions")).includes("characters"), false);
  openFold(tree, "extra_instructions");
  tree = redrawTab();
  assert.match(textOf(byTestId(tree, "rec-own-carried")), /^Carried over from its earlier instructions\./);
  assert.equal(boxIn(tree, "extra_instructions").props.value, before, "the box opens with the prompt it carries");
  // Untouched, a Save sends nothing: sent, it would have written the prompt twice.
  saveFoldOf(tree, "extra_instructions");
  tree = redrawTab();
  assert.deepEqual([sent.length, openFolds(tree)], [0, []]);
  openFold(tree, "extra_instructions");
  tree = redrawTab();
  typeIn(tree, "extra_instructions", `${before} Cash only.`);
  tree = redrawTab();
  saveFoldOf(tree, "extra_instructions");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.extra_instructions, `${before} Cash only.`, "the owner's own field");
  assert.equal(
    sent[0].config.brain.system_prompt,
    newReceptionistDefaults(W.__SETTINGS.config.brain.business_name).system_prompt,
    "and the product's own lines as the prompt (S4)",
  );
  // An owner's own words open as theirs, with nothing said of where they came from.
  tree = drawTab({ profile: { ...marisa, extra_instructions: "Cash only." } });
  openFold(tree, "extra_instructions");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-own-carried"), null);
});

test("emptying the only words a record composes from says it stops composing, and the box counts the room left", () => {
  const profile = { extra_instructions: "Only these words.", guardrails: { never_quote_prices: true } };
  let tree = drawTab({ profile });
  openFold(tree, "extra_instructions");
  tree = redrawTab();
  typeIn(tree, "extra_instructions", "");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-fold-says-extra_instructions-note")), PROFILE_CROSSING_WORDS.stops);
  assert.deepEqual(
    partsOf(byTestId(tree, "rec-fold-says-extra_instructions")),
    [],
    "no block to quote a line of: the sentence says all of it",
  );
  // Under the box, how much room is left, with the limit in it, in contracts' words, once the room runs out: under a
  // box with room to spare, a count is a number to read and nothing to do (Ruben, 10 Oct 2026).
  const long = "x".repeat(18001);
  typeIn(tree, "extra_instructions", long);
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-own-count")), instructionsWords(long).limit);
  typeIn(tree, "extra_instructions", "Short.");
  tree = redrawTab();
  assert.equal(byTestId(tree, "rec-own-count"), null, "room to spare: no count");
  // Past what it takes, the refusal is said under the box, and the count gives way to it: one sentence, not two.
  const over = "x".repeat(20001);
  typeIn(tree, "extra_instructions", over);
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-own-count")), instructionsWords(over).limit, "counted as it is typed");
  saveFoldOf(tree, "extra_instructions");
  tree = redrawTab();
  assert.equal(problemOf(tree, "bt-own-words"), "At most 20,000 characters — this is 20,001.");
  assert.equal(byTestId(tree, "rec-own-count"), null, "and the count gives way to the refusal under the box");
  // With nothing written, the row says None.
  const none = byTestId(
    drawTab({
      profile: without(marisa, "extra_instructions"),
      brain: { system_prompt: newReceptionistDefaults("Marisa's Beauty Salon").system_prompt },
    }),
    "rec-row-extra_instructions",
  );
  assert.match(textOf(none), /None/);
});

test("a fold nobody typed in promises no crossing: on a record that composes nothing, the carried words open with no sentence, and Save sends nothing", () => {
  // The review's probe P1. The record composes nothing, so it is answered with its stored prompt, which the box opens
  // with, carried. Written as the save writes it, that draft would compose (S4), and the fold said the details would
  // start being given; but nothing was typed, so Save sends nothing.
  const sent = saving();
  let tree = drawTab({ profile: { guardrails: { disclose_ai: true } } });
  assert.equal(hasProfile(W.__SETTINGS.config.brain.profile), false, "the fixture composes nothing");
  openFold(tree, "extra_instructions");
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-own-carried"), "the box opens with the stored prompt, carried");
  assert.equal(
    byTestId(tree, "rec-fold-says-extra_instructions-note"),
    null,
    "REGRESSION: it said the details would start being given, of a save that sends nothing",
  );
  saveFoldOf(tree, "extra_instructions");
  tree = redrawTab();
  assert.deepEqual([sent.length, openFolds(tree)], [0, []]);
  // Typed in, the save goes and crosses, and says so.
  openFold(tree, "extra_instructions");
  tree = redrawTab();
  typeIn(tree, "extra_instructions", "Cash only.");
  tree = redrawTab();
  assert.equal(textOf(byTestId(tree, "rec-fold-says-extra_instructions-note")), PROFILE_CROSSING_WORDS.starts);
  saveFoldOf(tree, "extra_instructions");
  assert.equal(sent.length, 1);
  assert.equal(hasProfile(sent[0].config.brain.profile), true, "and the record it saves composes");
});

/* ------------------------------------ when it can't answer ------------------------------------ */

test("the three messages at rest are one line: how many there are, and whose words they are in", () => {
  const row = byTestId(drawTab(), "rec-row-fallbacks");
  const vm = fallbacksWords(brainOf(marisa).fallbacks);
  assert.equal(textOf(byTestId(row, "rec-fallbacks-words")), vm.line);
  assert.equal(vm.line, "3 messages, in your words");
  const defaults = byTestId(drawTab({ brain: { fallbacks: FALLBACK_DEFAULTS } }), "rec-row-fallbacks");
  assert.match(textOf(defaults), /3 messages, the product's wording/);
});

test("each message shows what a customer reads, points at a link or a number written out, and offers the default wording back", () => {
  const sent = saving();
  let tree = drawTab();
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "fallbacks");
  tree = redrawTab();
  const part = (t, k) => byTestId(t, `rec-fallback-${k}`);
  // Each is a line that opens onto it: its label and when it goes out, its box named by the label, and nothing it
  // will be told.
  assert.match(textOf(part(tree, "error")), /It couldn't write a reply/);
  assert.match(textOf(part(tree, "error")), /Then it waits for you/);
  assert.equal(labelled(tree, "It couldn't write a reply").type, "textarea");
  // The details it may name are presses under its box, one each.
  assert.deepEqual(
    all(byTestId(tree, "rec-fallback-error-details"), (n) => n.type === "button").map((b) => b.props["aria-label"]),
    ["Put {business} in the message", "Put {booking link} in the message", "Put {phone} in the message"],
  );
  assert.equal(byTestId(tree, "rec-fold-says-fallbacks"), null, "never part of the prompt");
  assert.equal(byTestId(tree, "rec-fallback-error-reads"), null, "a message naming no detail reads as written");
  // A message naming a detail shows it filled, as it goes out.
  labelled(tree, "It couldn't write a reply").props.onChange({
    target: { value: "Thanks for writing to {business}! Book: {booking link}" },
  });
  tree = redrawTab();
  const reads = fallbackMessages(
    {
      ...W.__SETTINGS.config.brain,
      fallbacks: {
        ...W.__SETTINGS.config.brain.fallbacks,
        error: "Thanks for writing to {business}! Book: {booking link}",
      },
    },
    { channels: [{ kind: "voice", number_e164: "+13055550123", status: "active" }] },
  ).error;
  assert.equal(textOf(byTestId(tree, "rec-fallback-error-reads")), `Reads as ${reads}`);
  assert.match(reads, /Marisa's Beauty Salon! Book: https:\/\/book\.example\.com/);
  // A link or a number written out stays as written: said.
  labelled(tree, "It got something it can't read").props.onChange({
    target: { value: "Book at https://book.example.com/en-us/4471902 or call (212) 555-0142." },
  });
  tree = redrawTab();
  assert.match(
    textOf(byTestId(tree, "rec-fallback-non_text-written")),
    /^Your booking link is written out here — \{booking link\} keeps it current\./,
  );
  labelled(tree, "It got something it can't read").props.onChange({ target: { value: "Call (212) 555-0142." } });
  tree = redrawTab();
  assert.match(
    textOf(byTestId(tree, "rec-fallback-non_text-written")),
    /^A number is written out here — \{phone\} gives the one you publish\./,
  );
  // The default wording, in one press, heard with the message it is for; gone once the message is it.
  const back = byTestId(tree, "rec-fallback-greeting-default");
  assert.equal(textOf(find(tree, (n) => n.props?.id === back.props["aria-describedby"])), "The AI is down");
  press(back);
  tree = redrawTab();
  assert.equal(labelled(tree, "The AI is down").props.value, FALLBACK_DEFAULTS.greeting);
  assert.equal(byTestId(tree, "rec-fallback-greeting-default"), null);
  saveFoldOf(tree, "fallbacks");
  const expected = structuredClone(stored);
  expected.brain.fallbacks = {
    greeting: FALLBACK_DEFAULTS.greeting,
    error: "Thanks for writing to {business}! Book: {booking link}",
    non_text: "Call (212) 555-0142.",
  };
  assert.deepEqual(
    sent.map((s) => s.config),
    [expected],
    "the three messages, and nothing else",
  );
});

test("what stops a message is said under its own box, each at once, and nothing is sent", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "fallbacks");
  tree = redrawTab();
  labelled(tree, "It couldn't write a reply").props.onChange({ target: { value: "   " } });
  tree = redrawTab();
  labelled(tree, "It got something it can't read").props.onChange({ target: { value: "Call {phone number}." } });
  tree = redrawTab();
  labelled(tree, "The AI is down").props.onChange({ target: { value: "x".repeat(2001) } });
  tree = redrawTab();
  saveFoldOf(tree, "fallbacks");
  tree = redrawTab();
  assert.equal(sent.length, 0);
  assert.equal(problemOf(tree, "bt-fallback-error"), "Write this message, or use the default wording.");
  assert.equal(
    problemOf(tree, "bt-fallback-non_text"),
    "Only {business}, {booking link} and {phone} are filled in — {phone number} would be sent as written.",
  );
  assert.equal(problemOf(tree, "bt-fallback-greeting"), "At most 2,000 characters — this is 2,001.");
  assert.equal(byTestId(tree, "rec-fallback-non_text-reads"), null, "a message that is refused shows no reading of it");
  // A message that stops the save stands open, marked, so the sentence under its box is seen.
  for (const k of ["error", "non_text", "greeting"]) {
    const line = byTestId(tree, `rec-fallback-${k}`);
    assert.equal(line.props["data-open"], "true", `${k} stands open`);
    assert.equal(textOf(find(line, (n) => classes(n).includes("rec-disclosure-mark"))), "Check it", k);
  }
});

/* ------------------------------------ the card as a whole ------------------------------------ */

test("a viewer reads How it answers and is offered no act on any of it, and nothing opens a fold", () => {
  W.ST_STORE = { can: (perm) => perm !== "settings", myRole: () => "viewer" };
  try {
    const sent = saving();
    const tree = drawTab();
    const card = cardOf(tree);
    assert.deepEqual(
      all(card, (n) => /^rec-row-act-/.test(n.props?.["data-testid"] || "")),
      [],
      "no row offers a change",
    );
    assert.match(textOf(card), /English, Spanish/, "and everything is there to read");
    // How it hands you a customer, read on Autonomy's Limits card.
    assert.match(textOf(byTestId(tree, "rec-handoff-line")), /transfers to \+1 \(212\) 555-0142/);
    const why = roleGate("viewer", "settings", "change the business").reason;
    assert.equal(
      all(tree, (n) => ownWords(n).includes(why)).length,
      1,
      "the page says why once, and this card does not say it again",
    );
    for (const id of ROWS) {
      W.__recordFolds.request(id);
      assert.deepEqual(openFolds(redrawTab()), [], id);
      W.__recordFolds.reset();
    }
    assert.equal(sent.length, 0);
  } finally {
    delete W.ST_STORE;
  }
});

test("every act of How it answers is gated as a change to the settings, and named for what it acts on", () => {
  const asked = [];
  const was = W.gate;
  W.gate = (perm, doing) => {
    asked.push([perm, doing]);
    return {};
  };
  try {
    const tree = drawTab({ profile: without(marisa, "tone") });
    const mine = asked.filter(([, doing]) =>
      /voice|languages|rules it always|hands you|should know|own words|can't answer/.test(doing),
    );
    // How it answers' rows in its order (On calls' voice after How it talks), then the two it keeps as limits, drawn
    // after the record on Autonomy's card.
    assert.deepEqual(mine.slice(0, 8), [
      ["settings", "change its voice"],
      ["settings", "change the languages it speaks"],
      ["settings", "change the voice callers hear"],
      ["settings", "change the things it should know"],
      ["settings", "change what it is told in your own words"],
      ["settings", "change the messages sent when it can't answer"],
      ["settings", "change the rules it always keeps"],
      ["settings", "change how it hands you a customer"],
    ]);
    // Each act's name holds the words on it (WCAG 2.5.3).
    for (const id of ROWS) {
      const act = byTestId(tree, `rec-row-act-${id}`);
      const words = textOf(find(act, (n) => classes(n).includes("rec-row-act-words"))).trim();
      assert.ok(act.props["aria-label"].startsWith(words), `${id}: "${act.props["aria-label"]}" holds "${words}"`);
    }
  } finally {
    W.gate = was;
  }
});

test("an unchanged Save sends nothing and closes, on every fold of the card", () => {
  const sent = saving();
  for (const id of ROWS) {
    let tree = drawTab();
    openFold(tree, id);
    tree = redrawTab();
    assert.deepEqual(openFolds(tree), [id]);
    saveFoldOf(tree, id);
    tree = redrawTab();
    assert.deepEqual([sent.length, openFolds(tree)], [0, []], id);
  }
});

test("one editor at a time: a fold holding changes asks before another opens, and Cancel with changes asks", () => {
  let tree = drawTab();
  openFold(tree, "notes");
  tree = redrawTab();
  press(byTestId(tree, "rec-notes-add"));
  tree = redrawTab();
  openFold(tree, "tone");
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["notes"], "another row's act does not throw the new note away");
  assert.ok(byTestId(tree, "rec-fold-notes-ask-confirm"));
  press(byTestId(tree, "rec-fold-notes-ask-yes"));
  tree = redrawTab();
  assert.deepEqual(openFolds(tree), ["tone"]);
  typeIn(tree, "tone", "Calm.");
  tree = redrawTab();
  cancelFoldOf(tree, "tone");
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-fold-tone-cancel-confirm"), "Cancel asks first");
  assert.deepEqual(openFolds(tree), ["tone"]);
});

test("Save stays a button focus can rest on while it saves, and the boxes take nothing meanwhile", () => {
  // A save the server has not answered yet.
  const sent = [];
  W.__saveSettings = (config) => {
    sent.push(config);
    return new Promise(() => {});
  };
  let tree = drawTab();
  openFold(tree, "tone");
  tree = redrawTab();
  typeIn(tree, "tone", "Calm.");
  tree = redrawTab();
  saveFoldOf(tree, "tone");
  tree = redrawTab();
  const save = byTestId(tree, "rec-fold-save-tone");
  assert.deepEqual(
    [save.type, save.props.disabled, save.props["aria-disabled"], save.props["aria-busy"], textOf(save)],
    ["button", undefined, true, true, "Saving…"],
  );
  saveFoldOf(tree, "tone");
  assert.equal(sent.length, 1, "a second press sends nothing more");
  assert.equal(boxIn(tree, "tone").props.readOnly, true);
  const preset = byTestId(tree, "rec-tone-presets");
  assert.deepEqual(
    [preset.props.disabled, preset.props["aria-disabled"]],
    [false, true],
    "the starting points say they wait as Save does, and keep focus",
  );
  press(preset);
  tree = redrawTab();
  assert.equal(
    all(byTestId(tree, "rec-fold-tone"), (n) => n.props?.role === "menuitem").length,
    0,
    "a press while it saves opens nothing",
  );
  assert.equal(boxIn(tree, "tone").props.value, "Calm.", "and changes nothing");
});

test("the services sheet opened and closed beside this card, every fold of it keeps its own", () => {
  // The sheet comes and goes; this card's rows and folds must not move with it.
  let tree = drawTab();
  const at = (t) => ROWS.map((id) => textOf(byTestId(t, `rec-row-${id}`)));
  const rest = at(tree);
  press(byTestId(tree, "rec-row-act-services"));
  tree = redrawTab();
  assert.ok(byTestId(tree, "rec-sheet-services"));
  assert.deepEqual(at(tree), rest, "the sheet open, every row of How it answers says what it said");
  press(find(byTestId(tree, "rec-sheet-services"), (n) => n.props?.["aria-label"] === "Close"));
  tree = redrawTab();
  assert.deepEqual(at(tree), rest);
  openFold(tree, "languages");
  tree = redrawTab();
  langBox(tree).props.onChange({ target: { value: "Fre" } });
  redrawTab();
  tree = redrawTab();
  assert.deepEqual(
    langOptions(tree).map(textOf),
    ["French", "Add “Fre”"],
    "the combobox keeps what was typed over two draws",
  );
  press(langOptions(tree)[0]);
  tree = redrawTab();
  assert.deepEqual(tokensOf(tree), ["English", "Spanish", "French"]);
});

test("a message in the product's earlier wording is the product's: no default wording is offered back for it", () => {
  let tree = drawTab({ brain: { fallbacks: { ...EARLIER_FALLBACK_DEFAULTS } } });
  assert.match(textOf(byTestId(tree, "rec-row-fallbacks")), /3 messages, the product's wording/);
  openFold(tree, "fallbacks");
  tree = redrawTab();
  for (const key of ["greeting", "error", "non_text"])
    assert.equal(byTestId(tree, `rec-fallback-${key}-default`), null, key);
});

/* --- what callers hear first (decision 0051) --- */

test("the greeting row: what callers hear at rest; the box opens on the standard line, says what callers hear and every note, and saves anything", () => {
  const sent = saving();
  let tree = drawTab();
  // At rest, the words a caller hears, named by the business.
  assert.equal(
    textOf(byTestId(tree, "rec-greeting-line")),
    greetingOf({ name: "Marisa's Beauty Salon", stored: undefined, paused: false }).text,
  );
  openFold(tree, "phone_greeting");
  tree = redrawTab();
  assert.equal(
    boxIn(tree, "phone_greeting").props.value,
    GREETING_TEMPLATE,
    "the standard line, {business} where the name goes",
  );
  assert.equal(byTestId(tree, "rec-greeting-default"), null, "nothing to go back to yet");
  // A line that never says it is automated: callers hear the product's words added, and the note says so first.
  typeIn(tree, "phone_greeting", "Thanks for calling {business}. How can I help?");
  tree = redrawTab();
  assert.match(
    textOf(byTestId(tree, "rec-greeting-hears")),
    /Thanks for calling Marisa's Beauty Salon\. I'm the automated assistant\. How can I help\?/,
  );
  assert.match(
    textOf(byTestId(tree, "rec-greeting-note-adds_ai")),
    /doesn't say it's automated, so callers also hear “I'm the automated assistant.”/,
  );
  assert.ok(byTestId(tree, "rec-greeting-note-no_recording"), "every note that applies, not the first alone");
  assert.ok(byTestId(tree, "rec-greeting-default"), "the way back to the standard line");
  // Nothing about a greeting stops a save: no cap, no refusal, the recording sentence the owner's to drop.
  saveFoldOf(tree, "phone_greeting");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.phone_greeting, "Thanks for calling {business}. How can I help?");
});

test("the greeting row is drawn only where the workspace answers calls", () => {
  const tree = drawTab({ facts: { voice_line: { value: null, source: "none" } } });
  assert.equal(byTestId(tree, "rec-greeting-line"), null);
});
