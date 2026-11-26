/**
 * How it answers in your own words, when it can't answer, the card as a whole, and what callers hear first (decision
 * 0051).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roleGate,
  instructionsWords,
  fallbacksWords,
  fallbackMessages,
  FALLBACK_DEFAULTS,
  EARLIER_FALLBACK_DEFAULTS,
  newReceptionistDefaults,
  hasProfile,
  GREETING_TEMPLATE,
  greetingOf,
} from "@chanlytics/contracts";
import { PROFILE_CROSSING_WORDS } from "../../../../apps/dashboard/src/surfaces/settings/business/model/fold-limits.ts";
import { all, find, byTestId, textOf, classes, press } from "../../../_stub-react.mjs";
import {
  brainOf,
  cancelFoldOf,
  drawTab,
  labelled,
  marisa,
  openFold,
  openFolds,
  ownWords,
  partsOf,
  redrawTab,
  saveFoldOf,
  saving,
  settingsHeld,
  W,
  without,
} from "../../../_business-tab-harness.mjs";
import { ROWS, boxIn, cardOf, langBox, langOptions, problemOf, tokensOf, typeIn } from "./_answers.mjs";
import { bridgeHolds, holdRoles, provided } from "../../../shell/_bridge-holds.mjs";

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
    newReceptionistDefaults(settingsHeld().config.brain.business_name).system_prompt,
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
  assert.equal(problemOf(tree, "bt-own-words"), "At most 20,000 characters · this is 20,001.");
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
  assert.equal(hasProfile(settingsHeld().config.brain.profile), false, "the fixture composes nothing");
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
  const stored = structuredClone(settingsHeld().config);
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
      ...settingsHeld().config.brain,
      fallbacks: {
        ...settingsHeld().config.brain.fallbacks,
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
    /^Your booking link is written out here · \{booking link\} keeps it current\./,
  );
  labelled(tree, "It got something it can't read").props.onChange({ target: { value: "Call (212) 555-0142." } });
  tree = redrawTab();
  assert.match(
    textOf(byTestId(tree, "rec-fallback-non_text-written")),
    /^A number is written out here · \{phone\} gives the one you publish\./,
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
    "Only {business}, {booking link} and {phone} are filled in · {phone number} would be sent as written.",
  );
  assert.equal(problemOf(tree, "bt-fallback-greeting"), "At most 2,000 characters · this is 2,001.");
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
  bridgeHolds({ parts: { roles: { can: (perm) => perm !== "settings", myRole: () => "viewer" } } });
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
    bridgeHolds({ parts: { roles: undefined } });
  }
});

test("every act of How it answers is gated as a change to the settings, and named for what it acts on", () => {
  const asked = [];
  const was = provided("roles");
  // What each control asks the role store, and as what (frame/gate.ts): it may.
  holdRoles({
    can: (perm, doing) => {
      asked.push([perm, doing]);
      return true;
    },
  });
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
    bridgeHolds({ parts: { roles: was } });
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
  bridgeHolds({
    parts: {
      saveSettings: (config) => {
        sent.push(config);
        return new Promise(() => {});
      },
    },
  });
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
    /Thanks for calling Marisa's Beauty Salon\. I'm the AI assistant\. How can I help\?/,
  );
  assert.match(
    textOf(byTestId(tree, "rec-greeting-note-adds_ai")),
    /doesn't say it's automated, so callers also hear “I'm the AI assistant.”/,
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
