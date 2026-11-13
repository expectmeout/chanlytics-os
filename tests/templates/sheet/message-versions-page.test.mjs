/**
 * One message, every channel (step 1), on the Templates page: a message's email and text versions beside its WhatsApp
 * ones, run on the stub React over the page's own words (surfaces/campaigns/templates, contracts message-versions.ts)
 * and its verbs stubbed on the one `templates` object the page imports.
 *
 * - A row says, quietly, which channels its message has a version on, in contracts' words; a message with no row on file
 *   says none, and an email of a reach-out is no message's.
 * - An open message has its channels as tabs, WhatsApp | Email | Text, each with its dot, and a language control only
 *   where there is a choice of language (the message sheet's canvas, 12 Nov 2026); WhatsApp is what it always showed. The email is its subject and its body with the message's examples in the slots, and one line that the footer
 *   and the unsubscribe are added when it goes; the text is a bubble with the STOP line under it in the version's
 *   language, and what it comes to on the wire. A marketing message has no text version and cannot have one.
 * - A message with no version is one press that writes it, from the starter's words where it wrote them, else from the
 *   WhatsApp words; the editor checks as it is typed, puts a value in by its name, and keeps Save back until it passes.
 *   It draws each slot as a chip with its name and never as {{n}}, and a value goes in at the caret. In a message's sheet
 *   the words are drawn once: no preview beside them, and what a preview said (a text's length, an email's footer) is
 *   the box's hint (the box's own typing, a browser's, is run in a browser: the pull request says how).
 * - New is one line to Ask (new-said.tsx): no form on the page; the form's own words are tested where it is.
 * - Save calls the route's verb with the words as checked; a refusal is said in the server's words where it was typed;
 *   Send shows once something changed, with its Undo, and Done before; the pencil on the words opens them; Remove, on the
 *   name's menu, asks first, and a role that may not write is offered nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AFTER_VISIT,
  BIZ,
  Confirm,
  HOURS,
  NEW_WORDS,
  Picker,
  SlotName,
  SubTabs,
  VISIT,
  W,
  WINBACK,
  all,
  baseRow,
  bodyOf,
  boxOf,
  byTestId,
  chipsOf,
  composerActsModule,
  contracts,
  custom,
  emailRow,
  fieldOf,
  fillSlots,
  find,
  firstView,
  headSaid,
  headed,
  itemOf,
  itemsOf,
  library,
  lineBox,
  listingOf,
  menuOf,
  messageFacts,
  messagesOf,
  opened,
  ownRow,
  page,
  paneOf,
  press,
  problemOf,
  redraw,
  rowOf,
  saveOf,
  setSurfaceValue,
  settle,
  smsRow,
  smsStopLine,
  standingOf,
  standingWord,
  starterByKey,
  starterRow,
  starterWords,
  stubbed,
  surfaceValue,
  switched,
  tabOf,
  tabsOf,
  textOf,
  toSlotParts,
  toasts,
  valuesOf,
  viewing,
  writing,
} from "./_message-page.mjs";

test("a row says its name and one line; the channels a message has are its tabs' words, from contracts', where it is open", () => {
  const tree = page({
    rows: [starterRow(VISIT), starterRow(WINBACK), custom("fall_hours")],
    versions: [
      emailRow(VISIT),
      smsRow(VISIT),
      // A reach-out's email is no message's: it adds a channel to nothing.
      baseRow({
        id: "r1",
        channel: "email",
        name: "reach_out_abc",
        language: "en",
        header: "Hello",
        body_preview: "Hi",
      }),
    ],
  });
  // Two lines a row (Messages, the canvas of 10 Nov 2026): the channels line went with the words and the columns.
  assert.equal(byTestId(rowOf(tree, VISIT), "template-channels"), null, "no channels line on a row");
  const hints = (name) => standingOf(opened(tree, name));
  assert.equal(hints(VISIT), "WhatsApp · approved, Email · ready, Text · ready", "all three, in the tabs' order");
  assert.equal(hints(WINBACK), "WhatsApp · approved, Email · not written, Text · not for offers");
});

test("a page whose email and text rows were not read draws its WhatsApp rows as it always did", () => {
  const tree = viewing(page({ rows: [starterRow(VISIT)], versions: null }), VISIT, "email");
  assert.ok(rowOf(tree, VISIT), "the row is there");
  assert.equal(tabOf(tree, "email").hint, "Email · not written", "never a channel it did not read");
  assert.ok(byTestId(paneOf(tree), "template-version-none"), "and the pane offers to write the email");
});

/* ---------------------------------- the switch ---------------------------------- */

test("an open message has its channels as tabs, WhatsApp | Email | Text, beside its language control, and opens on WhatsApp's words", () => {
  const tree = opened(page({ rows: [starterRow(VISIT)], versions: [emailRow(VISIT)] }), VISIT);
  const pane = paneOf(tree);
  const bar = find(pane, (n) => n.props?.className === "tpl-viewbar");
  // One language is no choice: the bar holds no language control until the name's menu adds one (the canvas of 12 Nov 2026).
  assert.equal(
    find(bar, (n) => n.props?.["data-testid"] === "template-lang"),
    null,
    "no language control with one language",
  );
  const switchEl = find(bar, (n) => n.type === SubTabs);
  assert.ok(switchEl, "and the tabs");
  assert.deepEqual(
    switchEl.props.tabs.map((o) => [o.id, o.label, o.testid]),
    [
      ["whatsapp", "WhatsApp", "template-channel-whatsapp"],
      ["email", "Email", "template-channel-email"],
      ["sms", "Text", "template-channel-sms"],
    ],
  );
  assert.equal(switchEl.props.value, "whatsapp");
  assert.ok(byTestId(pane, "message-preview"), "WhatsApp: the bubble, as it was");
  assert.equal(byTestId(pane, "template-version"), null, "and no email's or text's version");
  assert.deepEqual(
    itemsOf(tree).map((i) => i.label),
    ["Rename", "Put away", "Add a language", "Delete"],
    "the one menu, on its name, Delete last",
  );
  itemOf(tree, "Add").onSelect();
  assert.ok(byTestId(paneOf(redraw()), "template-lang"), "Add a language draws the language control");
});

test("the email in view is its subject over its body with the slots filled with the message's examples, and a line for what the sender adds", () => {
  const tree = viewing(page({ rows: [starterRow(VISIT)], versions: [emailRow(VISIT)] }), VISIT, "email");
  const pane = paneOf(tree);
  assert.equal(byTestId(pane, "message-preview"), null, "WhatsApp's bubble gives way");
  const want = starterByKey(VISIT).email.en_US;
  const values = valuesOf(VISIT);
  assert.equal(textOf(byTestId(pane, "template-version-subject")), fillSlots(want.subject, values));
  assert.equal(textOf(byTestId(pane, "template-version-subject")), "Your appointment tomorrow at 2:00 PM");
  assert.equal(bodyOf(pane), fillSlots(want.body, values));
  assert.ok(bodyOf(pane).includes(`appointment at ${BIZ} tomorrow at 2:00 PM for a consultation`), bodyOf(pane));
  assert.ok(!/\{\{\d\}\}/.test(textOf(byTestId(pane, "template-version-preview"))), "no hole left");
  assert.equal(
    textOf(byTestId(pane, "template-version-note")),
    "The footer is added when it goes, and an offer also gets its unsubscribe link.",
  );
  assert.equal(byTestId(pane, "template-version-write"), null, "a version on file is not offered to be written");
  // Back to WhatsApp: its words again.
  assert.ok(byTestId(paneOf(switched(tree, "whatsapp")), "message-preview"));
});

test("the text in view is a bubble with the STOP line under it and what it comes to on the wire, STOP line included", () => {
  const sms = baseRow({ id: "s1", channel: "sms", name: "fall_hours", body_preview: "Hi {{1}}, hours start {{2}}." });
  let tree = viewing(page({ rows: [custom("fall_hours")], versions: [sms] }), "fall_hours", "sms");
  let pane = paneOf(tree);
  assert.equal(bodyOf(pane), "Hi Dani, hours start Oct 1.");
  assert.equal(textOf(byTestId(pane, "template-version-stop")), "Reply STOP to opt out");
  // 28 characters as written, the line break and the 21 of the STOP line: one part.
  assert.equal(textOf(byTestId(pane, "template-version-count")), "50 characters · 1 part");
  assert.equal(byTestId(pane, "template-version-note"), null, "an email's footer is not a text's");

  // 140 characters take it past a part: 162 with the STOP line, which is two.
  const long = baseRow({ id: "s2", channel: "sms", name: "long_notice", body_preview: "x".repeat(140) });
  tree = viewing(page({ rows: [custom("long_notice")], versions: [long] }), "long_notice", "sms");
  pane = paneOf(tree);
  assert.equal(textOf(byTestId(pane, "template-version-count")), "162 characters · 2 parts");
});

test("a text in Spanish says its STOP line in Spanish, in the language the pane is on", () => {
  const rows = [starterRow(AFTER_VISIT, "es")];
  const tree = viewing(page({ rows, versions: [smsRow(AFTER_VISIT, "es")] }), AFTER_VISIT, "sms");
  assert.equal(textOf(byTestId(paneOf(tree), "template-version-stop")), smsStopLine("es"));
  assert.equal(smsStopLine("es"), "Responde STOP para darte de baja");
});

test("a marketing message has no text version and cannot have one: it says so in one line, with nothing to write", () => {
  const tree = viewing(page({ rows: [starterRow(WINBACK)], versions: [emailRow(WINBACK)] }), WINBACK, "sms");
  const pane = paneOf(tree);
  assert.equal(textOf(byTestId(pane, "template-version-none")), "Texts carry no offers.");
  assert.equal(byTestId(pane, "template-version-write"), null, "no act to write it");
  assert.equal(byTestId(pane, "template-version-editor"), null);
  // The same message by email is writeable, and has one.
  assert.ok(byTestId(paneOf(switched(tree, "email")), "template-version"), "its email version is on file");
  // A message the workspace wrote and Meta calls marketing is an offer too.
  const offer = custom("autumn_offer", { category: "marketing" });
  const own = viewing(page({ rows: [offer] }), "autumn_offer", "sms");
  assert.equal(textOf(byTestId(paneOf(own), "template-version-none")), "Texts carry no offers.");
});

test("which messages a text may carry is the send's own reading of the category: one filed with none is an offer until Meta says otherwise", () => {
  // contracts purposeOfTemplate fails safe: only utility and authentication are positively not offers. The Library judged
  // it by a regex of its own, where a message with no category read as not an offer, and offered a text version of what a
  // send would never send by text.
  for (const category of [null, undefined, "", "promotional", "MARKETING", "marketing"]) {
    const tree = viewing(page({ rows: [custom("filed_without", { category })] }), "filed_without", "sms");
    assert.equal(
      textOf(byTestId(paneOf(tree), "template-version-none")),
      contracts.CHANNEL_WORDS.noOffersByText,
      `${category}`,
    );
    assert.equal(byTestId(paneOf(tree), "template-version-write"), null, `${category}: nothing to write`);
  }
  // What is positively not an offer may have one, written from here.
  for (const category of ["utility", "authentication"]) {
    const tree = viewing(page({ rows: [custom("a_note", { category })] }), "a_note", "sms");
    // A missing version is its one press, said once (the message sheet's canvas, 12 Nov 2026).
    assert.equal(textOf(byTestId(paneOf(tree), "template-version-write")).trim(), "Write the text", category);
  }
  // The email is never refused for it: every kind of message may go by email.
  const email = viewing(page({ rows: [custom("filed_without", { category: null })] }), "filed_without", "email");
  assert.ok(byTestId(paneOf(email), "template-version-write"));
  // The words are contracts' (channelNeverCarries), said once.
  assert.equal(contracts.channelNeverCarries("sms", "marketing"), contracts.CHANNEL_WORDS.noOffersByText);
});

/* ---------------------------------- writing one ---------------------------------- */

test("a message with no version is one press that writes it, from the starter's own words where it wrote them", () => {
  const tree = viewing(page({ rows: [starterRow(AFTER_VISIT)] }), AFTER_VISIT, "email");
  const pane = paneOf(tree);
  const write = byTestId(pane, "template-version-write");
  assert.equal(textOf(byTestId(pane, "template-version-none")).trim(), "Write the email", "one press, said once");
  assert.equal(textOf(write).trim(), "Write the email");
  press(write);
  const editor = byTestId(redraw(), "template-version-editor");
  assert.ok(editor, "the editor opens in the pane, where the preview was");
  const starter = starterByKey(AFTER_VISIT).email.en_US;
  const next = redraw();
  assert.equal(boxOf(next, "Subject").props.value, starter.subject);
  assert.equal(boxOf(next, "Message").props.value, starter.body);
});

test("with no starter's words it starts from a copy of the WhatsApp words, its subject the message's title", () => {
  let tree = viewing(page({ rows: [custom("fall_hours")] }), "fall_hours", "email");
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  assert.equal(boxOf(tree, "Subject").props.value, "Fall hours");
  assert.equal(boxOf(tree, "Message").props.value, "Hi {{1}}, our hours start {{2}}.");
  // A text has no subject, and starts from the same words.
  tree = switched(tree, "sms");
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  assert.equal(boxOf(tree, "Subject"), null);
  assert.equal(boxOf(tree, "Message").props.value, "Hi {{1}}, our hours start {{2}}.");
});

test("the editor checks as it is typed: what is wrong is the kit's FieldError and Save waits, what only reads badly is a hint", () => {
  let tree = viewing(page({ rows: [custom("fall_hours")] }), "fall_hours", "email");
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  assert.equal(problemOf(tree), null, "what it starts from passes");
  assert.equal(saveOf(tree).props.disabled, false);
  assert.equal(boxOf(tree, "Subject").props.maxLength, contracts.EMAIL_SUBJECT_MAX, "the subject's own limit");
  assert.equal(fieldOf(tree, "Subject").props.hint, `10 of ${contracts.EMAIL_SUBJECT_MAX}`);

  boxOf(tree, "Subject").props.onValueChange("");
  tree = redraw();
  assert.equal(problemOf(tree), "Give the email a subject.");
  assert.equal(saveOf(tree).props.disabled, true, "held until it passes");

  boxOf(tree, "Subject").props.onValueChange("Hours");
  boxOf(redraw(), "Message").props.onValueChange("Hi {{5}}");
  tree = redraw();
  // The slot rule is the check's, said in the names the editor draws (item 16): never the braces it does not show.
  assert.equal(problemOf(tree), "Value 5 is not one of this message's values: it has First name and Date.");

  boxOf(tree, "Message").props.onValueChange("Hi\n\n\n\nthere");
  tree = redraw();
  assert.equal(problemOf(tree), null);
  assert.equal(
    textOf(byTestId(tree, "template-version-warnings")),
    "More than one blank line in a row reads as a gap in most inboxes.",
  );
  assert.equal(saveOf(tree).props.disabled, false, "a warning is not a refusal");
  assert.ok(boxOf(tree, "Message").props.value.startsWith("Hi"), "the box holds what is typed, drawn once");
});

test("a text being written shows what it comes to as it is typed, warns past two parts and holds Save past four", () => {
  let tree = viewing(page({ rows: [custom("fall_hours")] }), "fall_hours", "sms");
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  assert.equal(boxOf(tree, "Message").props.lines, 4);
  // 32 characters and the STOP line under them: one part, said under the box (no preview repeats the words).
  assert.equal(fieldOf(tree, "Message").props.hint, "54 characters · 1 part");
  const type = (words) => {
    boxOf(tree, "Message").props.onValueChange(words);
    tree = redraw();
  };
  type("x".repeat(300));
  assert.equal(fieldOf(tree, "Message").props.hint, "322 characters · 3 parts");
  assert.equal(
    textOf(byTestId(tree, "template-version-warnings")),
    "With the STOP line this text goes as 3 parts, and each part is billed.",
    "each part is billed: said, not refused",
  );
  assert.equal(saveOf(tree).props.disabled, false);
  type("x".repeat(700));
  assert.equal(problemOf(tree), "With the STOP line this text takes 5 parts; keep it to 4.");
  assert.equal(saveOf(tree).props.disabled, true);
});

test("a value goes in by its name: the menu offers each of the message's with its example beside it, and no braces", () => {
  const tree = writing();
  assert.deepEqual(
    menuOf(tree).props.groups.flatMap((g) => g.items.map((i) => [i.label, i.meta])),
    [
      ["First name", "Dani"],
      ["Date", "Oct 1"],
    ],
  );
  assert.equal(textOf(menuOf(tree).props.trigger).trim(), "Add a value");
  assert.equal(menuOf(tree).props.trigger.props["data-testid"], "template-version-values");
  assert.equal(menuOf(tree).props.label, "Add a value to the email");
});

test("a value put in goes where the caret was as the box lost it, replacing what was selected, and the box is drawn again with it", () => {
  let tree = writing();
  const body = () => boxOf(tree, "Message");
  assert.equal(body().props.key, 0, "as it opened");
  assert.equal(body().props.caret, null, "with no caret to place");
  // The caret stood after "Hi ", where the menu took focus.
  body().props.onFocus();
  body().props.onBlur({ start: 3, end: 3 });
  menuOf(tree).props.groups[0].items[1].onSelect();
  tree = redraw();
  assert.equal(
    body().props.value,
    "Hi {{2}}{{1}}, our hours start {{2}}.",
    "the Date at the caret, in the stored words",
  );
  assert.equal(body().props.key, 1, "a box that cannot show it in place is a new box");
  assert.equal(body().props.caret, 8, "its caret after the slot, a place in the stored words");
  assert.deepEqual(chipsOf(body()), [
    ["Date", 2],
    ["First name", 1],
    ["Date", 2],
  ]);
  assert.ok(!textOf(body()).includes("{{"), "and never the braces");
  // A selection is what a value put in replaces: the comma and the space after the first name, here.
  tree = writing();
  boxOf(tree, "Message").props.onFocus();
  boxOf(tree, "Message").props.onBlur({ start: 8, end: 10 });
  menuOf(tree).props.groups[0].items[0].onSelect();
  assert.equal(boxOf(redraw(), "Message").props.value, "Hi {{1}}{{1}}our hours start {{2}}.");
});

test("with no caret to go by a value goes at the end, and the box last used is the one it goes into: the subject as much as the message", () => {
  let tree = writing();
  menuOf(tree).props.groups[0].items[1].onSelect();
  tree = redraw();
  assert.equal(
    boxOf(tree, "Message").props.value,
    "Hi {{1}}, our hours start {{2}}.{{2}}",
    "at the end, where it never had a caret",
  );
  assert.equal(boxOf(tree, "Subject").props.value, "Fall hours", "and the subject is as it was");
  assert.equal(boxOf(tree, "Subject").props.key, 0, "and not drawn again");
  // The subject took focus last, its caret at the start: the value goes there.
  boxOf(tree, "Subject").props.onFocus();
  boxOf(tree, "Subject").props.onBlur({ start: 0, end: 0 });
  menuOf(tree).props.groups[0].items[0].onSelect();
  tree = redraw();
  assert.equal(boxOf(tree, "Subject").props.value, "{{1}}Fall hours");
  assert.equal(boxOf(tree, "Subject").props.caret, 5);
  assert.equal(boxOf(tree, "Subject").props.key, 1);
  assert.equal(boxOf(tree, "Message").props.key, 1, "the message was drawn again once, for its own value only");
  assert.equal(
    fieldOf(tree, "Subject").props.hint,
    `15 of ${contracts.EMAIL_SUBJECT_MAX}`,
    "the subject counts a slot as it is written",
  );
  assert.equal(problemOf(tree), null, "and the check still passes");
  // A text has no subject: its one box takes it.
  const text = writing("fall_hours", "sms");
  assert.equal(boxOf(text, "Subject"), null);
  menuOf(text).props.groups[0].items[0].onSelect();
  assert.equal(boxOf(redraw(), "Message").props.value, "Hi {{1}}, our hours start {{2}}.{{1}}");
});

test("undo is the box's own: a value put in is a step, a step back draws the box again at the words and caret, and the history outlives the box", () => {
  let tree = writing();
  const body = () => boxOf(tree, "Message");
  const keeper = body().props.history;
  assert.equal(typeof keeper.step, "function", "the editor's seats hold each box's history");
  assert.equal(keeper.step("undo"), null, "nothing to undo as it opens");
  body().props.onFocus();
  body().props.onBlur({ start: 3, end: 3 });
  menuOf(tree).props.groups[0].items[1].onSelect();
  tree = redraw();
  assert.equal(body().props.value, "Hi {{2}}{{1}}, our hours start {{2}}.");
  assert.equal(body().props.history, keeper, "a box drawn again is a new element over the same history");
  // Ctrl+Z: the history says where to go, and the box asks to be drawn there; it is no new edit.
  const back = keeper.step("undo");
  assert.deepEqual(
    back,
    { text: "Hi {{1}}, our hours start {{2}}.", caret: 3 },
    "the words before the value, the caret where it went",
  );
  body().props.onRestore(back);
  tree = redraw();
  assert.equal(body().props.value, "Hi {{1}}, our hours start {{2}}.");
  assert.equal(body().props.caret, 3);
  assert.equal(body().props.key, 2, "drawn again for it");
  assert.equal(body().props.history, keeper);
  // And forward again: the value, with the caret after it.
  const forward = keeper.step("redo");
  assert.deepEqual(forward, { text: "Hi {{2}}{{1}}, our hours start {{2}}.", caret: 8 });
  body().props.onRestore(forward);
  assert.equal(boxOf(redraw(), "Message").props.value, forward.text);
  // The subject's history is its own: nothing the message did is in it.
  assert.equal(boxOf(tree, "Subject").props.history.step("undo"), null);
});

test("the box is described by the field's hint and the label hands it focus: no Base UI control stands there to wire either", () => {
  const tree = writing();
  const subject = boxOf(tree, "Subject");
  const field = fieldOf(tree, "Subject");
  assert.ok(field.props.hintId, "the field draws its hint with an id");
  assert.equal(
    subject.props.describedBy,
    field.props.hintId,
    "which the box is described by, so a screen reader hears the count",
  );
  // In a message's sheet the words' box has no label over it and is named by it; its hint is what the sender adds.
  const message = fieldOf(tree, "Message");
  assert.equal(message.props.label, undefined, "no label drawn over the words");
  assert.equal(message.props.control.props.label, "Message", "the box names itself");
  assert.equal(message.props.hint, "The footer is added when it goes, and an offer also gets its unsubscribe link.");
  assert.equal(boxOf(tree, "Message").props.describedBy, message.props.hintId, "and described by its hint");
  assert.notEqual(message.props.hintId, field.props.hintId);
  // Pressing the label hands the box the focus, through the ref the box was given.
  let focused = 0;
  subject.props.inputRef.current = { focus: () => (focused += 1) };
  field.props.onLabelPress();
  assert.equal(focused, 1);
  assert.equal(typeof fieldOf(tree, "Message").props.onLabelPress, "function", "the message's label does too");
});

test("a value is only ever one of the message's: the menu offers no more, and a message with none offers no menu", () => {
  const bare = { body_preview: "No values here.", variables: [] };
  const tree = writing("plain_note", "sms", bare);
  assert.equal(menuOf(tree), null, "nothing to add");
  assert.equal(byTestId(tree, "template-version-values"), null);
  assert.equal(menuOf(writing()).props.groups[0].items.length, 2, "one for each of the message's two");
});

test("the editor shows each slot by its name, as a chip, and never as {{n}}: in the subject, in the message, on either channel", () => {
  // The starter's own email: its slots are the starter's own, by the names the library gave them.
  const tree = viewing(page({ rows: [starterRow(AFTER_VISIT)] }), AFTER_VISIT, "email");
  press(byTestId(paneOf(tree), "template-version-write"));
  const next = redraw();
  const starter = starterByKey(AFTER_VISIT).email.en_US;
  const names = starterByKey(AFTER_VISIT).texts.en_US.slots.map((x) => x.label);
  for (const [label, words] of [
    ["Subject", starter.subject],
    ["Message", starter.body],
  ]) {
    const box = boxOf(next, label);
    assert.equal(box.props.value, words, "the stored words are the string with its slots, as they were");
    assert.deepEqual(
      chipsOf(box).map(([, n]) => n),
      toSlotParts(words).flatMap((part) => (part.kind === "slot" ? [Number(part.slot)] : [])),
      "a chip for each slot, in order",
    );
    for (const [name, n] of chipsOf(box))
      assert.equal(name, names[n - 1], `slot ${n} is called what the library calls it`);
    assert.ok(!textOf(box).includes("{{"), `${label}: never a brace in what is drawn`);
  }
  const message = boxOf(next, "Message");
  assert.ok(chipsOf(message).length > 0, "the message has slots to draw");
  assert.deepEqual(message.props.slots.labels, names, "the names the chips are drawn from are the message's");
  assert.equal(message.props.slots.kind, "numbered", "a campaign message's slots are numbered");
  // The words as the owner reads them in the box: the names in place of the numbers.
  for (const [name] of chipsOf(message)) assert.ok(textOf(message).includes(name), name);
  // A text, too.
  const text = writing("fall_hours", "sms");
  assert.deepEqual(chipsOf(boxOf(text, "Message")), [
    ["First name", 1],
    ["Date", 2],
  ]);
  assert.equal(textOf(boxOf(text, "Message")), "Hi First name, our hours start Date.");
});

test("each box is a textbox to a screen reader: named, several lines or one, and its chips named too", () => {
  const tree = writing();
  const subject = boxOf(tree, "Subject");
  const message = boxOf(tree, "Message");
  assert.equal(subject.props.lines, 1, "the subject is a line of words, which takes no Enter");
  assert.equal(message.props.lines, 8, "an email is a box of sentences");
  assert.equal(subject.props["data-testid"], "template-version-subject-box");
  assert.equal(message.props["data-testid"], "template-version-body-box");
  const textbox = find(message, (n) => n.props?.role === "textbox");
  assert.ok(textbox, "the box itself says what it is");
  assert.equal(textbox.props["aria-label"], "Message");
  assert.equal(textbox.props["aria-multiline"], true);
  assert.equal(find(subject, (n) => n.props?.role === "textbox").props["aria-multiline"], false);
  const chip = find(message, (n) => n.type === SlotName);
  assert.equal(
    chip.props.said,
    "First name, filled in for each person",
    "a chip says what it is, not the braces it is",
  );
  assert.equal(find(chip, (n) => n.props?.role === "img").props["aria-label"], chip.props.said);
});

test("a slot the message has no value for is kept, drawn as a problem with its own name, and said in names: Save waits", () => {
  const filed = baseRow({
    id: "e1",
    channel: "email",
    name: "fall_hours",
    header: "Hours",
    body_preview: "Hi {{1}}, {{5}} and {{2}}",
  });
  const tree = viewing(page({ rows: [custom("fall_hours")], versions: [filed] }), "fall_hours", "email");
  press(byTestId(paneOf(tree), "template-version-edit"));
  const next = redraw();
  const message = boxOf(next, "Message");
  assert.equal(message.props.value, "Hi {{1}}, {{5}} and {{2}}", "what was stored is what the box holds");
  assert.deepEqual(
    all(message, (n) => n.type === SlotName).map((c) => [c.props.label, c.props.unknown]),
    [
      ["First name", false],
      ["Value 5", true],
      ["Date", false],
    ],
  );
  assert.equal(problemOf(next), "Value 5 is not one of this message's values: it has First name and Date.");
  // Unchanged there is nothing to save; changed, Save waits while a value is not the message's.
  assert.equal(saveOf(next), null);
  boxOf(next, "Message").props.onValueChange("Hi {{1}}, {{5}} and {{2}}!");
  assert.equal(saveOf(redraw()).props.disabled, true);
  assert.ok(!textOf(message).includes("{{"));
  assert.ok(find(next, (n) => n.type === SlotName && n.props.said === "Value 5, which this message does not have"));
});

test("a slot typed as braces is a chip: the editor takes the words and the caret and draws the box anew", () => {
  let tree = writing();
  boxOf(tree, "Message").props.onRepaint({ text: "Hi {{1}} and {{2}}.", caret: 19 });
  tree = redraw();
  const message = boxOf(tree, "Message");
  assert.equal(message.props.value, "Hi {{1}} and {{2}}.");
  assert.equal(message.props.key, 1);
  assert.equal(message.props.caret, 19);
  assert.deepEqual(chipsOf(message), [
    ["First name", 1],
    ["Date", 2],
  ]);
  assert.equal(boxOf(tree, "Subject").props.key, 0, "the other box is left alone");
  assert.equal(problemOf(tree), null);
});

test("in a message's sheet the words are drawn once: no preview beside them, and a text counts a slot as it is written, under the box", () => {
  let tree = writing("fall_hours", "sms");
  const type = (words) => {
    boxOf(tree, "Message").props.onValueChange(words);
    tree = redraw();
  };
  assert.equal(
    find(paneOf(tree), (n) => n.props?.className === "tpl-ver-see"),
    null,
    "nothing beside the words",
  );
  assert.equal(byTestId(tree, "template-version-preview"), null, "no preview repeats them");
  type("Hi {{1}}");
  // 8 characters as written ({{1}} is five), the line break and the 21 of the STOP line.
  assert.equal(fieldOf(tree, "Message").props.hint, "30 characters · 1 part");
  type("Hi {{1}}, hours start {{2}}.");
  assert.equal(boxOf(tree, "Message").props.value, "Hi {{1}}, hours start {{2}}.");
  // The email's box says what its sender adds; its subject keeps its label and its count.
  tree = writing();
  assert.equal(fieldOf(tree, "Subject").props.label, "Subject");
  assert.equal(
    fieldOf(tree, "Message").props.hint,
    "The footer is added when it goes, and an offer also gets its unsubscribe link.",
  );
});

test("while a save is out the boxes keep their words and take no typing", async () => {
  const hold = {};
  stubbed({ saveVersion: () => new Promise((resolve) => (hold.resolve = resolve)) });
  let tree = writing();
  assert.equal(boxOf(tree, "Message").props.readOnly, false);
  press(saveOf(tree));
  tree = redraw();
  assert.equal(boxOf(tree, "Message").props.readOnly, true);
  assert.equal(boxOf(tree, "Subject").props.readOnly, true);
  assert.equal(boxOf(tree, "Message").props.value, "Hi {{1}}, our hours start {{2}}.", "the words stay");
  hold.resolve({ ok: true, data: { template: {}, warnings: [] } });
  await settle();
});
test("Save calls the route's verb with the words as checked, says it saved, and closes the editor", async () => {
  const calls = stubbed();
  let tree = viewing(page({ rows: [custom("fall_hours")] }), "fall_hours", "email");
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  boxOf(tree, "Subject").props.onValueChange("  Our   fall hours ");
  boxOf(redraw(), "Message").props.onValueChange("Hi {{1}},\r\nhours start {{2}}.");
  press(saveOf(redraw()));
  await settle();
  assert.deepEqual(calls, [
    [
      "save",
      {
        name: "fall_hours",
        language: "en_US",
        channel: "email",
        subject: "Our fall hours",
        body: "Hi {{1}},\nhours start {{2}}.",
      },
    ],
  ]);
  tree = redraw();
  assert.equal(byTestId(tree, "template-version-editor"), null, "the editor closes once it landed");
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].tone, "ok");
  assert.equal(toasts[0].msg, "Fall hours: the email version in English is saved");

  // A text carries no subject.
  tree = switched(tree, "sms");
  press(byTestId(paneOf(tree), "template-version-write"));
  press(saveOf(redraw()));
  await settle();
  assert.deepEqual(calls[1][1], {
    name: "fall_hours",
    language: "en_US",
    channel: "sms",
    body: "Hi {{1}}, our hours start {{2}}.",
  });
});

test("a refusal is said in the server's words, where the words were typed: the editor stays open and nothing breaks", async () => {
  const refusal = "Email versions are not switched on for this workspace yet.";
  const calls = stubbed({
    saveVersion: async (body) => (
      calls.push(["save", body]),
      { ok: false, code: "invalid", status: 400, message: refusal }
    ),
  });
  let tree = viewing(page({ rows: [custom("fall_hours")] }), "fall_hours", "email");
  press(byTestId(paneOf(tree), "template-version-write"));
  press(saveOf(redraw()));
  await settle();
  tree = redraw();
  assert.equal(calls.length, 1);
  assert.ok(byTestId(tree, "template-version-editor"), "the editor stays, with what was written");
  assert.equal(problemOf(tree), refusal, "the refusal, as the kit's FieldError");
  assert.equal(toasts.length, 0, "not a toast: it is said where it was typed");
  assert.equal(saveOf(tree).props.disabled, false, "and it can be tried again");
  // Typing again takes it away; the check's own sentence is read again as the words change.
  boxOf(tree, "Subject").props.onValueChange("");
  assert.equal(problemOf(redraw()), "Give the email a subject.");

  // A save that never reached the server is said too.
  stubbed({
    saveVersion: async () => {
      throw new Error("offline");
    },
  });
  tree = redraw();
  boxOf(tree, "Subject").props.onValueChange("Hours");
  press(saveOf(redraw()));
  await settle();
  assert.equal(problemOf(redraw()), "That did not save. Try again in a moment.");
});

test("a new version's Save stands from the first, beside Done; something typed is Save and Undo, and Undo puts the words back", () => {
  let tree = viewing(page({ rows: [custom("fall_hours")] }), "fall_hours", "email");
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  assert.ok(saveOf(tree), "nothing is on file yet: the words it opens on are a start to keep");
  assert.equal(textOf(byTestId(tree, "template-version-cancel")).trim(), "Done");
  press(byTestId(tree, "template-version-cancel"));
  tree = redraw();
  assert.equal(byTestId(tree, "template-version-editor"), null, "Done closes at once");

  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  const start = boxOf(tree, "Message").props.value;
  boxOf(tree, "Message").props.onValueChange("Something else");
  tree = redraw();
  assert.equal(byTestId(tree, "template-version-cancel"), null, "no Cancel once something changed");
  assert.ok(saveOf(tree), "Save");
  press(byTestId(tree, "template-version-undo"));
  tree = redraw();
  assert.equal(boxOf(tree, "Message").props.value, start, "Undo puts back the words it opened on");
  assert.ok(byTestId(tree, "template-version-cancel"), "and Done is back");
});

/* ---------------------------------- one on file ---------------------------------- */

test("the pencil opens the editor on the version's own words; Remove, on the name's menu, asks first, and only a yes calls the verb", async () => {
  const calls = stubbed();
  const rows = [starterRow(VISIT)];
  let tree = viewing(page({ rows, versions: [emailRow(VISIT)] }), VISIT, "email");
  // The words' own pencil opens them; the name's menu holds the version's Remove beside the message's own acts.
  assert.deepEqual(
    itemsOf(tree)
      .filter((i) => i.label.includes("email"))
      .map((i) => [i.label, i.tone]),
    [["Remove the email version", "danger"]],
  );
  press(byTestId(paneOf(tree), "template-version-edit"));
  tree = redraw();
  assert.equal(boxOf(tree, "Subject").props.value, starterByKey(VISIT).email.en_US.subject);
  assert.equal(
    boxOf(tree, "Message").props.value,
    starterByKey(VISIT).email.en_US.body,
    "its words, not a copy of WhatsApp's",
  );
  press(byTestId(tree, "template-version-cancel"));

  tree = redraw();
  assert.equal(byTestId(tree, "template-version-editor"), null);
  itemOf(tree, "Remove").onSelect();
  tree = redraw();
  const ask = find(tree, (n) => n.type === Confirm);
  assert.equal(ask.props.question, "Remove the email version in English?", "the question names the version");
  assert.equal(ask.props.danger, true);
  assert.deepEqual(calls, [], "asked, not done");
  ask.props.onNo();
  tree = redraw();
  assert.equal(
    find(tree, (n) => n.type === Confirm),
    null,
    "No puts it away",
  );
  assert.deepEqual(calls, []);

  itemOf(tree, "Remove").onSelect();
  find(redraw(), (n) => n.type === Confirm).props.onYes();
  await settle();
  assert.deepEqual(calls, [["remove", `e-${VISIT}-en_US`]]);
  assert.equal(toasts.at(-1).msg, "Visit reminder: the email version in English is removed");
});

test("a role that may not write is offered nothing to write or change", () => {
  const rows = [starterRow(VISIT), starterRow(AFTER_VISIT)];
  let tree = viewing(page({ rows, versions: [emailRow(VISIT)], role: "viewer" }), VISIT, "email");
  assert.ok(byTestId(paneOf(tree), "template-version-preview"), "a viewer reads it");
  assert.equal(menuOf(tree), null, "with no Edit or Remove");
  tree = viewing(page({ rows, versions: [emailRow(VISIT)], role: "viewer" }), AFTER_VISIT, "email");
  const write = byTestId(paneOf(tree), "template-version-write");
  assert.equal(write.props["aria-disabled"], true, "and its Write is the role's refusal, with its reason");
  press(write);
  assert.equal(byTestId(redraw(), "template-version-editor"), null, "which opens nothing");
});

test("another language is another version: the pane's language decides which one is in view", () => {
  const rows = [starterRow(VISIT, "es")];
  const es = emailRow(VISIT, "es");
  const tree = viewing(page({ rows, versions: [emailRow(VISIT, "en_US"), es] }), VISIT, "email");
  assert.equal(
    textOf(byTestId(paneOf(tree), "template-version-subject")),
    fillSlots(es.header, valuesOf(VISIT, "es")),
    "the Spanish email, where the message opens on Spanish",
  );
});

/* ---------------------------------- a starter not added ---------------------------------- */

test("a starter nobody added shows the version the set wrote, says it comes with the set, and offers nothing to write", () => {
  const tree = page({ rows: [], versions: [] });
  const email = viewing(tree, AFTER_VISIT, "email");
  const pane = paneOf(email);
  assert.ok(byTestId(pane, "template-version-starter"), "the set's own email, as it reads");
  assert.equal(
    textOf(byTestId(pane, "template-version-subject")),
    starterByKey(AFTER_VISIT).email.en_US.subject,
    "its subject as the library wrote it",
  );
  assert.ok(textOf(pane).includes("This version comes with the starter set: adding the message adds it too."));
  assert.equal(byTestId(pane, "template-version-write"), null, "nothing on file to write a version of");
  assert.equal(byTestId(pane, "template-version-menu"), null, "and nothing to edit or remove");
  // An offer the set wrote no text of: texts carry no offers, said as on a message on file.
  const offer = viewing(page({ rows: [], versions: [] }), WINBACK, "sms");
  assert.ok(textOf(paneOf(offer)).includes("Texts carry no offers."));
  assert.equal(byTestId(paneOf(offer), "template-version-write"), null);
  // The call's text has no email: a caller has a phone.
  const call = viewing(page({ rows: [], versions: [] }), "call_text", "email");
  assert.ok(textOf(paneOf(call)).includes("The starter set has no email version of this message."));
  assert.equal(byTestId(paneOf(call), "template-version-write"), null);
});

test("listingOf lists messages, not WhatsApp rows: an own-only message is a group with its languages, a starter whose Spanish is an email counts Spanish as on file, a hidden own-only message is in the fold", () => {
  const langs = library.languages;
  // A message written as an email and a text, and again as an email in Spanish: no WhatsApp row of its name anywhere.
  const own = [
    ownRow("email", HOURS, { category: "utility" }),
    ownRow("sms", HOURS, { category: "utility" }),
    ownRow("email", HOURS, { category: "utility", language: "es" }),
  ];
  let listing = listingOf([], messagesOf([], own), library);
  assert.deepEqual(
    listing.customGroups.map((g) => [
      g.key,
      g.title,
      g.purpose,
      g.rows.map((r) => [r.lang.id, r.row, r.message?.versions.email !== null, r.message?.versions.sms !== null]),
    ]),
    [
      [
        "c:fall_hours",
        "Fall hours",
        "written here",
        [
          ["en_US", null, true, true],
          ["es", null, true, false],
        ],
      ],
    ],
    "a custom group with its languages, each a message though none is a WhatsApp row",
  );
  assert.deepEqual([listing.hiddenGroups.length, listing.hiddenMessages.length], [0, 0]);

  // A starter whose only version in Spanish is an email: Spanish is on file, English is still to add.
  const n = library.list.length;
  listing = listingOf([], messagesOf([], [emailRow(VISIT, "es")]), library);
  const visit = listing.starters.find((g) => g.starter.name === VISIT);
  assert.deepEqual(
    visit.rows.map((r) => [r.lang.id, r.row, r.message !== null]),
    [
      ["en_US", null, false],
      ["es", null, true],
    ],
  );
  assert.equal(listing.missingTotal, 2 * n - 1, "Spanish of that starter is present: one fewer to add");
  assert.equal(listing.allMissing, false, "and the set is part-way, not starting");
  assert.equal(listing.leftToAdd, `${n} in English and ${n - 1} in Spanish`);
  // Nothing on any channel: the whole set is missing.
  listing = listingOf([], [], library);
  assert.deepEqual([listing.missingTotal, listing.allMissing], [2 * n, true]);

  // A hidden own-only message is in the hidden fold, not the list; a message in review beside an email is one message.
  const hidden = ownRow("email", "old_news", { hidden_at: "2026-09-01T00:00:00Z" });
  const pending = custom(HOURS, { meta_status: "pending" });
  listing = listingOf([pending], messagesOf([pending], [hidden, ownRow("email", HOURS)]), library);
  assert.deepEqual(
    listing.hiddenMessages.map((m) => m.name),
    ["old_news"],
  );
  assert.deepEqual(
    listing.hiddenGroups.map((g) => [g.key, g.purpose]),
    [["c:old_news", "hidden from the composers"]],
  );
  assert.deepEqual(
    listing.customGroups.map((g) => g.key),
    ["c:fall_hours"],
    "the message in review has one row, and the hidden one is not in the list",
  );
  const [one] = listing.customGroups;
  assert.equal(one.rows[0].row.meta_status, "pending", "its WhatsApp version is the row's");
  assert.equal(one.rows[0].message.versions.whatsapp.status, "pending", "and its standing is the message's");
  assert.equal(one.rows[0].message.versions.email !== null, true, "with its email beside it");
  assert.deepEqual(
    [listing.shown.length, listing.pending],
    [1, 1],
    "the head's counts of what WhatsApp is reading are still the WhatsApp rows'",
  );

  // Meta's sample is nobody's message, whatever channel it came on.
  const sample = baseRow({ id: "w-sample", name: "hello_world" });
  listing = listingOf([sample], messagesOf([sample], [ownRow("email", "hello_world")]), library);
  assert.deepEqual([listing.customGroups.length, listing.hiddenGroups.length, listing.list.length], [0, 0, 0]);
  assert.equal(langs.length, 2);
});

test("a message's marks: the offer mark is its purpose, whichever channel it has; the tag names a language WhatsApp has not simply approved and says nothing of a message with no WhatsApp version", () => {
  const factsOf = (rows, versions, name) => {
    page({ rows, versions });
    const listing = listingOf(rows, surfaceValue("settings").messages, library);
    const g = [...listing.starters, ...listing.customGroups].find(
      (x) => (x.starter ? x.starter.name : x.key.slice(2)) === name,
    );
    return messageFacts({ g, langs: listing.langs, S: library, versions, view: firstView(g, listing.langs) });
  };
  // An own-only message is an offer (marketing) or a note (utility) by the category its versions were filed with.
  assert.equal(factsOf([], [ownRow("email", HOURS)], HOURS).marks.offer, true, "an offer by email");
  assert.equal(factsOf([], [ownRow("email", HOURS, { category: "utility" })], HOURS).marks.offer, false);
  // A category nobody gave is read as an offer, as every send reads it.
  assert.equal(factsOf([], [ownRow("email", HOURS, { category: null })], HOURS).marks.offer, true);
  // Where WhatsApp has a version its category is the message's, whatever the email beside it says.
  const w = (over) => custom(HOURS, over);
  assert.equal(
    factsOf([w({ category: "marketing" })], [ownRow("email", HOURS, { category: "utility" })], HOURS).marks.offer,
    true,
  );
  assert.equal(factsOf([w({ category: "utility" })], [], HOURS).marks.offer, false);
  // A starter nobody added is what the library declares it.
  assert.equal(factsOf([], [], WINBACK).marks.offer, true);
  assert.equal(factsOf([], [], VISIT).marks.offer, false);

  // A language in review keeps its tag, with an email beside it or not.
  const en = w({ id: "w-en" });
  const es = w({ id: "w-es", language: "es", meta_status: "pending" });
  assert.deepEqual(factsOf([en, es], [ownRow("email", HOURS)], HOURS).marks.tag, {
    words: "Spanish: being checked",
    tone: "info",
  });
  assert.deepEqual(factsOf([en, w({ id: "w-es", language: "es", meta_status: "rejected" })], [], HOURS).marks.tag, {
    words: "Spanish: needs a change",
    tone: "warn",
  });
  // One language on file says its state alone, in words an owner can act on, never WhatsApp's own word for it.
  for (const [status, words] of [
    ["pending", "Being checked"],
    ["rejected", "Needs a change"],
    ["paused", "On hold"],
    ["disabled", "Turned off"],
  ])
    assert.equal(factsOf([w({ meta_status: status })], [], HOURS).marks.tag.words, words);
  // A message with no WhatsApp version has no tag, and no attention asked of a language it holds on another channel.
  assert.equal(factsOf([], [ownRow("email", HOURS)], HOURS).marks.tag, null);
  const sends = (language) =>
    setSurfaceValue("playbooks", {
      // `runs`: on, before its last day, on a moment that runs here (contracts campaignRunsOn), as the surface makes it.
      rows: [
        { id: "pb-1", name: "Hours", template_name: HOURS, template_language: language, state: "running", runs: true },
      ],
    });
  const own = [ownRow("email", HOURS)];
  page({ rows: [], versions: own });
  sends("en_US");
  let listing = listingOf([], messagesOf([], own), library);
  let g = listing.customGroups[0];
  let marks = messageFacts({
    g,
    langs: listing.langs,
    S: library,
    versions: own,
    view: firstView(g, listing.langs),
  }).marks;
  assert.deepEqual([marks.tag, marks.attn], [null, false], "a running playbook sends the English the email holds");
  // It sends Spanish, which the message holds on no channel: that, and only that, is missing.
  sends("es");
  listing = listingOf([], messagesOf([], own), library);
  g = listing.customGroups[0];
  marks = messageFacts({ g, langs: listing.langs, S: library, versions: own, view: firstView(g, listing.langs) }).marks;
  assert.deepEqual(marks.tag, { words: "Spanish missing", tone: "warn" });
  assert.equal(marks.attn, true);
});

test("the open message says where each language stands on each channel, in contracts' words, and opens on the channel its anchor is on", () => {
  const open = (rows, versions, name = HOURS) => opened(page({ rows, versions }), name);
  // WhatsApp in review with an email beside it.
  let tree = open([custom(HOURS, { meta_status: "pending" })], [ownRow("email", HOURS)]);
  assert.equal(standingOf(tree), "WhatsApp · in review, Email · ready, Text · not written");
  assert.equal(tabsOf(tree).props.value, "whatsapp", "opens on WhatsApp's");
  assert.equal(tabOf(tree, "whatsapp").need, "WhatsApp · in review", "and its tab's dot says it waits on WhatsApp");
  // An email and a text, no WhatsApp: the message is whole, and opens on its email.
  const both = [ownRow("email", HOURS, { category: "utility" }), ownRow("sms", HOURS, { category: "utility" })];
  tree = open([], both);
  assert.equal(standingOf(tree), "WhatsApp · not added, Email · ready, Text · ready");
  assert.equal(tabsOf(tree).props.value, "email");
  tree = open([], [ownRow("sms", HOURS, { category: "utility" })]);
  assert.equal(standingOf(tree), "WhatsApp · not added, Email · not written, Text · ready");
  assert.equal(tabsOf(tree).props.value, "sms", "a text alone opens on the text");
  // WhatsApp alone, approved.
  tree = open([custom(HOURS, { category: "utility" })], []);
  assert.equal(standingOf(tree), "WhatsApp · approved, Email · not written, Text · not written");
  // WhatsApp refused, and an offer: its text can never be written, and says so.
  tree = open([custom(HOURS, { meta_status: "rejected", category: "marketing" })], []);
  assert.equal(standingOf(tree), "WhatsApp · refused, Email · not written, Text · not for offers");
  // Said once per channel, each its tab's own (a screen reader hears each tab's), in the order the tabs offer them.
  assert.deepEqual(
    tabsOf(tree).props.tabs.map((t) => t.id),
    ["whatsapp", "email", "sms"],
  );
  // The words are contracts' one set.
  assert.deepEqual(
    contracts.messageStandingWords(
      contracts.campaignMessageOf([custom(HOURS, { meta_status: "pending", category: "marketing" })], HOURS, "en_US"),
    ),
    { whatsapp: "WhatsApp · in review", email: "Email · not written", sms: "Text · not for offers" },
  );
  assert.deepEqual(contracts.messageStandingWords(null), {
    whatsapp: "WhatsApp · not added",
    email: "Email · not written",
    sms: "Text · not written",
  });
});

test("the language control lists a language the message holds on any channel under one heading, with where it stands, and a language on no channel is the library's to add", () => {
  const own = [
    ownRow("email", HOURS, { category: "utility" }),
    ownRow("email", HOURS, { category: "utility", language: "es" }),
  ];
  let tree = opened(page({ rows: [], versions: own }), HOURS);
  const groups = find(paneOf(tree), (n) => n.type === Picker && n.props["data-testid"] === "template-lang").props
    .groups;
  assert.deepEqual(
    groups[0] && [groups[0].label, groups[0].options.map((o) => [o.value, o.meta])],
    [
      contracts.LANGUAGE_GROUP_WORDS.on,
      [
        ["en_US", "Approved"],
        ["es", "Approved"],
      ],
    ],
    "both languages are on file, an email's as much as a WhatsApp version",
  );
  // A message with no WhatsApp version adds a language by its email and text, which need no number (12 Nov 2026).
  assert.equal(groups[1]?.label, contracts.LANGUAGE_GROUP_WORDS.add);
  assert.equal(contracts.LANGUAGE_GROUP_WORDS.on, "On file");
  // The face: the language in view as a quiet word, no code, glyph or count (the message sheet's canvas, 12 Nov 2026).
  const face = find(paneOf(tree), (n) => n.type === Picker && n.props["data-testid"] === "template-lang").props.face;
  assert.equal(textOf(face).trim(), "English");
  // With no WhatsApp number a WhatsApp version is not on offer, and the picker says why in the one sentence.
  tree = opened(page({ rows: [], versions: own, channels: [] }), HOURS);
  const note = find(paneOf(tree), (n) => n.type === Picker && n.props["data-testid"] === "template-lang").props.note;
  assert.equal(textOf(note).trim(), "Connect a WhatsApp number to add a WhatsApp version.");
  assert.equal(contracts.LIBRARY_WORDS.addNeedsNumber, "Connect a WhatsApp number to add a WhatsApp version.");
});

test("an own-only message is a row the Library draws whole: its words quoted, its channels said, found by its words, and the pane writes and removes its versions with no WhatsApp number", async () => {
  const calls = stubbed();
  const own = [ownRow("email", HOURS, { category: "utility" })];
  let tree = page({ rows: [], versions: own, channels: [] });
  const row = rowOf(tree, HOURS);
  assert.ok(row, "the row is there, found by the name it is filed under");
  assert.equal(row.props["data-testid"], "custom-row");
  assert.ok(textOf(row).includes("“Hi {first name}, our hours start {date}.”"), "its email's words: nothing sends it");
  // The search finds it by the words of an email's subject and body, as it finds a WhatsApp message by its own.
  lineBox().props.onChange({
    target: { value: "our hours start" },
  });
  tree = redraw();
  assert.ok(rowOf(tree, HOURS), "found by its words");
  lineBox().props.onChange({
    target: { value: "no such words" },
  });
  tree = redraw();
  assert.equal(rowOf(tree, HOURS), null);
  lineBox().props.onChange({ target: { value: "" } });

  // Opened, its email reads as any message's does, with its pencil, and its name's menu is a message's whole: Rename, Put
  // away and Delete, which need no number (the live demo, 12 Nov 2026: a message with no WhatsApp version had none of
  // them). Its email is its only version, so no Remove: its Delete is the message's.
  tree = opened(redraw(), HOURS);
  assert.equal(
    byTestId(paneOf(tree), "template-version").props["data-channel"],
    "email",
    "its email is in view, on the version it is filed under",
  );
  assert.deepEqual(
    itemsOf(tree).map((i) => i.label),
    ["Rename", "Put away", "Add a language", "Delete"],
    "its Edit is the pencil on its words",
  );
  assert.ok(byTestId(paneOf(tree), "template-version-edit"), "the pencil");
  // Its head says where it stands in the list, never a WhatsApp status it does not have (Messages, the canvas of 10 Nov 2026).
  assert.equal(standingWord(tree), "Not in use", "nothing sends it");
  assert.equal(tabOf(tree, "whatsapp").need, undefined, "and no WhatsApp dot: no WhatsApp version to wait on");
  // The menu is the message's whichever tab is in view: on WhatsApp's, which it has no version on, the same three.
  tree = switched(tree, "whatsapp");
  assert.deepEqual(
    itemsOf(tree).map((i) => i.label),
    ["Rename", "Put away", "Add a language", "Delete"],
  );
  assert.equal(byTestId(paneOf(tree), "template-new-refused") !== null, true);
  // Its text is written, from the email's words, under the message's own name.
  tree = switched(tree, "sms");
  assert.equal(textOf(byTestId(paneOf(tree), "template-version-write")).trim(), "Write the text");
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  assert.equal(boxOf(tree, "Message").props.value, "Hi {{1}}, our hours start {{2}}.", "a copy of the email's words");
  press(saveOf(tree));
  await settle();
  assert.deepEqual(calls, [
    ["save", { name: HOURS, language: "en_US", channel: "sms", body: "Hi {{1}}, our hours start {{2}}." }],
  ]);
  // With a text beside it, the email has its own Remove again, which asks first and removes that version alone.
  const both = [...own, ownRow("sms", HOURS, { category: "utility" })];
  tree = switched(opened(page({ rows: [], versions: both, channels: [] }), HOURS), "email");
  assert.deepEqual(
    itemsOf(tree).map((i) => i.label),
    ["Rename", "Put away", "Add a language", "Remove the email version", "Delete"],
  );
  itemOf(tree, "Remove").onSelect();
  find(redraw(), (n) => n.type === Confirm).props.onYes();
  await settle();
  assert.deepEqual(calls.at(-1), ["remove", `email-${HOURS}-en_US`]);
  // Delete is the message's whole: its question says every version goes, and each goes through its own door.
  tree = redraw();
  itemOf(tree, "Delete").onSelect();
  const ask = find(redraw(), (n) => n.type === Confirm);
  assert.match(ask.props.question, /^Delete “.+”\?$/, "one language: no language named");
  assert.ok(
    ask.props.detail.startsWith("Its email and text versions go, and sends that use it fail from now on."),
    ask.props.detail,
  );
  ask.props.onYes();
  await settle();
  assert.deepEqual(calls.slice(-2), [
    ["remove", `email-${HOURS}-en_US`],
    ["remove", `sms-${HOURS}-en_US`],
  ]);
});

test("with no number the page still lists the starter set and says WhatsApp waits; no banner asks for the set, which files itself as a number connects", () => {
  const tree = page({ rows: [], versions: [], channels: [] });
  const n = library.list.length;
  assert.equal(all(tree, (nd) => nd.props?.["data-testid"] === "starter-row").length, n, "the starter set is listed");
  assert.ok(headed(tree, "template-new"), "New is drawn whenever the person may act, number or none");
  assert.ok(
    textOf(byTestId(tree, "messages-no-number")).startsWith(contracts.LIBRARY_WORDS.noNumber),
    "one quiet notice, in contracts' words",
  );
  assert.equal(
    contracts.LIBRARY_WORDS.noNumber,
    "No WhatsApp number yet. Email and text versions are written here; WhatsApp versions wait until one is connected.",
  );
  // The Messages redesign's step 5: the starters file themselves as a number connects, so nothing asks for the set.
  assert.equal(byTestId(tree, "starters"), null, "no banner");
  assert.equal(byTestId(tree, "starter-add-all"), null, "and no act to add the set");
  const withNumber = page({ rows: [], versions: [] });
  assert.equal(byTestId(withNumber, "messages-no-number"), null);
  assert.equal(byTestId(withNumber, "starters"), null);
});

/* ---------------------------------- New: one line to Ask ---------------------------------- */

test("New is one line to Ask: no form, no channel first, no kind; the owner's words go to Ask, which writes every channel", () => {
  const asked = [];
  W.askAbout = (about) => void asked.push(about);
  let tree = page({ rows: [custom("fall_hours")] });
  press(headed(tree, "template-new"));
  tree = redraw();
  const words = byTestId(tree, "template-new-words");
  assert.ok(words, "one line, in the owner's own words");
  assert.equal(
    find(tree, (n) => n.props?.["data-testid"] === "tpl-composer"),
    null,
    "no form",
  );
  assert.equal(byTestId(tree, "template-new-send").props.disabled, true, "nothing said, nothing sent");
  words.props.onChange({ currentTarget: { value: "20% off colour this week" } });
  tree = redraw();
  press(byTestId(tree, "template-new-send"));
  assert.deepEqual(asked, [
    {
      prompt:
        "New message, with a version for WhatsApp, email and text wherever its kind may go (an offer never by text): 20% off colour this week",
      fresh: true,
    },
  ]);
  assert.equal(byTestId(redraw(), "template-new-words"), null, "the pane goes as Ask comes");
  delete W.askAbout;
});

test("a new message's title, values and words are words: Cancel asks before they go, as it does for a template's", () => {
  const { wroteWords } = composerActsModule;
  const blank = {
    translate: null,
    brief: "",
    body: "",
    footer: "",
    buttonText: "",
    name: "",
    examples: [],
    title: "",
    values: [],
    ownWords: { subject: "", body: "" },
  };
  assert.equal(wroteWords(blank), false);
  assert.equal(wroteWords({ ...blank, title: "Spring offer" }), true, "a title is words");
  assert.equal(wroteWords({ ...blank, values: [{ label: "First name", example: "" }] }), true, "so is a value's name");
  assert.equal(wroteWords({ ...blank, ownWords: { subject: "", body: "Hi" } }), true, "and the words of the email");
  assert.equal(wroteWords({ ...blank, ownWords: { subject: "Hello", body: "" } }), true);
});

test("what a text says for a message written here is channelNeverCarries' sentence and then the way out, set once", () => {
  assert.equal(
    composerActsModule.textSaysWords(),
    `${contracts.CHANNEL_WORDS.noOffersByText} ${NEW_WORDS.textGoesByEmail}`,
  );
  assert.equal(NEW_WORDS.textGoesByEmail, "This one can go by email.");
});

test("what the starter set says it did: what went to WhatsApp, what was written as email and text, what could not be and why, and that WhatsApp waits for a number", () => {
  const none = { submitted: 0, synced: 0, existing: 0, failed: 0 };
  assert.equal(starterWords(none), "Nothing to add");
  assert.equal(starterWords({ ...none, skipped: 7 }), "WhatsApp versions wait for a number");
  assert.equal(
    starterWords({ ...none, existing: 7, versions_saved: 1, skipped: 7 }),
    "7 already on file · 1 email and text version written · WhatsApp versions wait for a number",
  );
  assert.equal(
    starterWords({
      ...none,
      submitted: 2,
      versions_saved: 3,
      versions_failed: 2,
      results: [
        { status: "submitted", title: "Win-back", versions: [{ status: "saved" }] },
        { status: "submitted", title: "Reminder", versions: [{ status: "failed", detail: "Not switched on." }] },
      ],
    }),
    "2 submitted to WhatsApp for review — usually approved within minutes · 3 email and text versions written · 2 email and text versions could not be written: Not switched on.",
  );
  assert.equal(
    starterWords({ ...none, failed: 1, results: [{ status: "failed", title: "Win-back", detail: "Meta said no" }] }),
    "1 could not be added: Win-back (Meta said no)",
    "a WhatsApp failure reads as it did",
  );
});

test("the Library's count says what it holds on hover in contracts' words, whether or not the workspace has a WhatsApp number: every message, by each channel it goes by", () => {
  const tip = () => find(headSaid(), (n) => n.props?.["data-testid"] === "messages-count").props["data-tip"];
  const key = "visit_reminder";
  // A workspace with a number and a message of WhatsApp, email and text.
  page({ rows: [starterRow(key)], versions: [emailRow(key), smsRow(key)] });
  assert.equal(tip(), contracts.LIBRARY_WORDS.headTip);
  // A workspace with no number and a message of an email alone: the same words, true of it too.
  page({ rows: [], versions: [emailRow(key)], channels: [] });
  assert.equal(tip(), contracts.LIBRARY_WORDS.headTip);
  assert.ok(
    contracts.LIBRARY_WORDS.headTip.startsWith(
      "What the receptionist and your campaigns send, as the customer sees it.",
    ),
  );
  assert.ok(contracts.LIBRARY_WORDS.headTip.includes("an email or a text is ready the moment it is saved"));
  assert.ok(!/template/i.test(contracts.LIBRARY_WORDS.headTip));
});

test("the Library's starter set holds the review ask only where Settings says the Google listing keeps a review link, as the starter route files it: its row beside How did it go, and nowhere without one", () => {
  const REVIEW = "after_visit_review";
  const linked = page({ reviewLink: true });
  assert.ok(rowOf(linked, REVIEW), "a row of its own");
  assert.ok(
    library.list.some((s) => s.key === REVIEW),
    "and a starter the composer may start from",
  );
  const keys = library.list.map((s) => s.key);
  assert.equal(keys.indexOf(REVIEW), keys.indexOf(AFTER_VISIT) + 1, "beside How did it go");
  const none = page({ reviewLink: false });
  assert.equal(rowOf(none, REVIEW) ?? null, null, "no row");
  assert.ok(!library.list.some((s) => s.key === REVIEW), "and nothing to start from");
  assert.ok(rowOf(none, AFTER_VISIT), "the rest of the set is there either way");
});
