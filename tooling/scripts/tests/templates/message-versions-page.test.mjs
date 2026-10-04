/**
 * One message, every channel (step 1), on the Templates page: a message's email and text versions beside its WhatsApp
 * ones, run on the stub React over the page's own words (surfaces/campaigns/templates, contracts message-versions.ts)
 * and its verbs stubbed on the one `templates` object the page imports.
 *
 * - A row says, quietly, which channels its message has a version on, in contracts' words; a message with no row on file
 *   says none, and an email of a reach-out is no message's.
 * - An open message has a switch, WhatsApp | Email | Text, beside its language control; WhatsApp is what it always
 *   showed. The email is its subject and its body with the message's examples in the slots, and one line that the footer
 *   and the unsubscribe are added when it goes; the text is a bubble with the STOP line under it in the version's
 *   language, and what it comes to on the wire. A marketing message has no text version and cannot have one.
 * - A message with no version says so and offers to write it, from the starter's words where it wrote them, else from the
 *   WhatsApp words; the editor checks as it is typed, puts a value in by its name, and keeps Save back until it passes.
 *   It draws each slot as a chip with its name and never as {{n}}, a value goes in at the caret, and one person's
 *   preview sits beside the words and follows each keystroke (the review's item 16; the box's own typing, a browser's,
 *   is run in a browser: the pull request says how).
 * - Save calls the route's verb with the words as checked; a refusal is said in the server's words where it was typed;
 *   Remove asks first, and a role that may not write is offered nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
const toasts = [];
Object.assign(W, {
  CHANLY: { nav() {}, R: {} },
  appNavigate() {},
  // The role store's gate is data-bits.jsx's own (window.gate, canDo, gateTitle), over this role and contracts' table.
  ST_STORE: { can: (a) => !!contracts.ROLE_PERMS.owner[a], myRole: () => "owner" },
  __roleGate: contracts.roleGate,
  __surfaceState: () => "live",
  useHotkey: () => {},
});
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
// The toast is the shell's (data-bits.jsx's usePPToast): what the page flashes is recorded in its place.
W.usePPToast = () => [null, (t) => toasts.push(t)];
const S = "../../../../apps/dashboard/src/surfaces";
const { TemplatesPage } = await import(`${S}/campaigns/templates/templates-page.tsx`);
const { templates: verbs } = await import(`${S}/campaigns/templates/verbs.ts`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { Segmented } = await import(`${S}/kit/segmented/segmented.tsx`);
const { Field } = await import(`${S}/kit/field/field.tsx`);
const { Menu } = await import(`${S}/kit/menu/menu.tsx`);
const { Confirm } = await import(`${S}/kit/confirm/confirm.tsx`);
const { FieldError } = await import(`${S}/kit/field-error/field-error.tsx`);
const { SlotBox } = await import(`${S}/campaigns/templates/slots/slot-box.tsx`);
const { SlotName } = await import(`${S}/campaigns/parts/slot.tsx`);

const BIZ = "Harbor";
const { starterByKey, fillSlots, smsStopLine } = contracts;

/* ---------------------------------- the rows ---------------------------------- */

/** A template as GET templates hands it down: the WhatsApp row of a starter carries its own words and slots. */
const baseRow = (over = {}) => ({
  id: "t1",
  channel: "whatsapp",
  name: "x",
  language: "en_US",
  meta_status: "approved",
  category: "utility",
  source: "chanlytics",
  hidden_at: null,
  title: null,
  quality: null,
  rejected_reason: null,
  synced_at: null,
  body_preview: "",
  variables: [],
  header: null,
  footer: null,
  buttons: [],
  blocked: null,
  ...over,
});
const starterRow = (key, language = "en_US") => {
  const s = starterByKey(key);
  const t = s.texts[language];
  return baseRow({
    id: `w-${key}-${language}`,
    name: s.name,
    language,
    category: s.category,
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
  });
};
const emailRow = (key, language = "en_US") => {
  const e = starterByKey(key).email[language];
  return baseRow({
    id: `e-${key}-${language}`,
    channel: "email",
    name: key,
    language,
    header: e.subject,
    body_preview: e.body,
  });
};
const smsRow = (key, language = "en_US") =>
  baseRow({
    id: `s-${key}-${language}`,
    channel: "sms",
    name: key,
    language,
    body_preview: starterByKey(key).sms[language].body,
  });
/** What fills a starter's slots in a preview: its examples, and this business's name where the slot names it. */
const valuesOf = (key, language = "en_US") =>
  starterByKey(key).texts[language].slots.map((x) => (x.kind === "business_name" ? BIZ : x.example));

/** A message the workspace wrote, with two values: no starter, so its email and text start from its WhatsApp words. */
const custom = (name, over = {}) =>
  baseRow({
    id: `w-${name}`,
    name,
    body_preview: "Hi {{1}}, our hours start {{2}}.",
    variables: [
      { position: 1, label: "First name", example: "Dani" },
      { position: 2, label: "Date", example: "Oct 1" },
    ],
    ...over,
  });

/* ---------------------------------- the page ---------------------------------- */

const draw = () => W.React.createElement(TemplatesPage, {});
/** Templates over what the settings surface holds: the WhatsApp rows, the email and text rows, and who is acting. */
const page = ({ rows = [], versions = [], role = "owner" } = {}) => {
  W.ST_STORE.can = (a) => !!contracts.ROLE_PERMS[role][a];
  W.ST_STORE.myRole = () => role;
  W.__TEMPLATES_ALL = rows;
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: BIZ } } },
    facts: null,
    channels: [{ kind: "whatsapp" }],
    templatesAll: rows,
    templateVersions: versions,
    templateUse: null,
    templateSent: null,
  });
  setSurfaceValue("reach_outs", []);
  setSurfaceValue("playbooks", undefined);
  fresh();
  toasts.length = 0;
  return again(draw);
};
const redraw = () => again(draw);
const rowOf = (tree, name) => find(tree, (n) => n.props?.["data-template"] === name);
const paneOf = (tree) => byTestId(tree, "template-pane");
/** A message opened beside the list, as a press on its row opens it. */
const opened = (tree, name) => {
  press(find(rowOf(tree, name), (n) => n.props?.["data-testid"] === "template-open"));
  return redraw();
};
/** The switch's channel picked, as the radio group says it. */
const switched = (tree, channel) => {
  find(paneOf(tree), (n) => n.type === Segmented).props.onValueChange(channel);
  return redraw();
};
/** A message opened, and its channel picked. */
const viewing = (tree, name, channel) => switched(opened(tree, name), channel);
const bodyOf = (tree) => textOf(byTestId(tree, "template-version-body"));
const menuOf = (tree) => find(paneOf(tree), (n) => n.type === Menu);
const itemOf = (tree, words) =>
  menuOf(tree)
    .props.groups.flatMap((g) => g.items)
    .find((i) => i.label === words);
/** One of the editor's fields, by its label: the kit's Field, which holds the label, the hint and the box. */
const fieldOf = (tree, label) => find(paneOf(tree), (n) => n.type === Field && n.props.label === label);
/** The box of words in a field, by its label: where the words are typed, and what the editor reads them from. */
const boxOf = (tree, label) => find(paneOf(tree), (n) => n.type === SlotBox && n.props.label === label);
/** The slots a box draws, as chips: [name, number] in order (a campaign message's slots are numbered; a chip carries its key). */
const chipsOf = (box) =>
  (box ? [...new Set(all(box, (n) => n.type === SlotName))] : []).map((c) => [c.props.label, Number(c.props.slot)]);
const problemOf = (tree) => find(paneOf(tree), (n) => n.type === FieldError)?.props.message ?? null;
const saveOf = (tree) => byTestId(tree, "template-version-save");

/** The verbs, stubbed: each call recorded, each answer the test's. */
const REAL = { ...verbs };
const stubbed = (over = {}) => {
  const calls = [];
  Object.assign(verbs, REAL, {
    saveVersion: async (body) => (calls.push(["save", body]), { ok: true, data: { template: {}, warnings: [] } }),
    removeVersion: async (id) => (calls.push(["remove", id]), { ok: true, data: {} }),
    ...over,
  });
  return calls;
};

const AFTER_VISIT = "after_visit_check";
const VISIT = "visit_reminder";
const WINBACK = "winback_reply";

/* ---------------------------------- the row ---------------------------------- */

test("a row says, quietly, which channels its message has a version on: from contracts' words, and nothing where it has none", () => {
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
  const channels = (name) => byTestId(rowOf(tree, name), "template-channels");
  assert.equal(textOf(channels(VISIT)), "WhatsApp · Email · Text", "all three, in the order the switch offers them");
  assert.equal(textOf(channels(WINBACK)), "WhatsApp", "a message with a WhatsApp row alone");
  assert.equal(textOf(channels("fall_hours")), "WhatsApp");
  assert.equal(channels(AFTER_VISIT), null, "a starter nobody added is on no channel, and the row says nothing of it");
});

test("a page whose email and text rows were not read draws its WhatsApp rows as it always did", () => {
  const tree = viewing(page({ rows: [starterRow(VISIT)], versions: null }), VISIT, "email");
  assert.equal(
    textOf(byTestId(rowOf(tree, VISIT), "template-channels")),
    "WhatsApp",
    "never a channel it did not read",
  );
  assert.ok(byTestId(paneOf(tree), "template-version-none"), "and the pane offers to write the email");
});

/* ---------------------------------- the switch ---------------------------------- */

test("an open message has a switch, WhatsApp | Email | Text, beside its language control, and opens on WhatsApp's words", () => {
  const tree = opened(page({ rows: [starterRow(VISIT)], versions: [emailRow(VISIT)] }), VISIT);
  const pane = paneOf(tree);
  const bar = find(pane, (n) => n.props?.className === "tpl-viewbar");
  assert.ok(
    find(bar, (n) => n.props?.["data-testid"] === "template-lang"),
    "its language control is in the bar",
  );
  const switchEl = find(bar, (n) => n.type === Segmented);
  assert.ok(switchEl, "and the switch");
  assert.deepEqual(
    switchEl.props.options.map((o) => [o.value, o.label, o.testid]),
    [
      ["whatsapp", "WhatsApp", "template-channel-whatsapp"],
      ["email", "Email", "template-channel-email"],
      ["sms", "Text", "template-channel-sms"],
    ],
  );
  assert.equal(switchEl.props.value, "whatsapp");
  assert.ok(byTestId(pane, "message-preview"), "WhatsApp: the bubble, as it was");
  assert.equal(byTestId(pane, "template-version"), null, "and no email's or text's version");
  assert.ok(
    find(pane, (n) => n.type === Menu),
    "its Rename, Hide and Delete stay",
  );
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

/* ---------------------------------- writing one ---------------------------------- */

test("a message with no version says so, and the act writes it from the starter's own words where it wrote them", () => {
  const tree = viewing(page({ rows: [starterRow(AFTER_VISIT)] }), AFTER_VISIT, "email");
  const pane = paneOf(tree);
  assert.match(textOf(byTestId(pane, "template-version-none")), /^No email version in English yet./);
  const write = byTestId(pane, "template-version-write");
  assert.equal(textOf(write), "Write the email version");
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
  assert.ok(bodyOf(tree).startsWith("Hi"), "and the preview follows what is typed");
});

test("a text being written shows what it comes to as it is typed, warns past two parts and holds Save past four", () => {
  let tree = viewing(page({ rows: [custom("fall_hours")] }), "fall_hours", "sms");
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  assert.equal(boxOf(tree, "Message").props.lines, 4);
  // 32 characters and the STOP line under them: one part.
  assert.equal(textOf(byTestId(tree, "template-version-count")), "54 characters · 1 part");
  const type = (words) => {
    boxOf(tree, "Message").props.onValueChange(words);
    tree = redraw();
  };
  type("x".repeat(300));
  assert.equal(textOf(byTestId(tree, "template-version-count")), "322 characters · 3 parts");
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

/** A message the workspace wrote, its email being written: the editor open on the starting words. */
const writing = (name = "fall_hours", channel = "email", over = {}) => {
  const tree = viewing(page({ rows: [custom(name, over)] }), name, channel);
  press(byTestId(paneOf(tree), "template-version-write"));
  return redraw();
};

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
  assert.equal(boxOf(tree, "Message").props.describedBy, undefined, "the message has no hint, so nothing describes it");
  assert.equal(fieldOf(tree, "Message").props.hintId, undefined);
  assert.notEqual(fieldOf(tree, "Message").props.hintId, field.props.hintId);
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
      contracts.toSlotParts(words).flatMap((part) => (part.kind === "slot" ? [Number(part.slot)] : [])),
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
  itemOf(tree, "Edit").onSelect();
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
  assert.equal(saveOf(next).props.disabled, true);
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

test("the preview beside the words follows each keystroke: the examples in the slots, tinted, and a text counts a slot as it is written", () => {
  let tree = writing("fall_hours", "sms");
  const type = (words) => {
    boxOf(tree, "Message").props.onValueChange(words);
    tree = redraw();
  };
  const tinted = () => all(byTestId(tree, "template-version-body"), (n) => n.props?.className === "mp-slot");
  const beside = find(paneOf(tree), (n) => n.props?.className === "tpl-ver-see");
  assert.equal(textOf(find(beside, (n) => n.props?.className === "tpl-ver-caption")), "How one person reads it");
  assert.ok(byTestId(beside, "template-version-preview"), "the preview sits beside the words");
  type("Hi {{1}}");
  assert.equal(bodyOf(tree), "Hi Dani", "the example fills the slot as it is typed");
  assert.deepEqual(
    tinted().map((n) => textOf(n)),
    ["Dani"],
    "in the bubble's tint, so what varies shows",
  );
  // 8 characters as written ({{1}} is five), the line break and the 21 of the STOP line.
  assert.equal(textOf(byTestId(tree, "template-version-count")), "30 characters · 1 part");
  type("Hi {{1}}, hours start {{2}}.");
  assert.equal(bodyOf(tree), "Hi Dani, hours start Oct 1.");
  type("Hi {{9}}");
  // A slot the message has no example for is a hole: drawn by its name as the box draws it, and as a problem, never as braces.
  assert.equal(bodyOf(tree), "Hi Value 9");
  assert.deepEqual(
    tinted().map((n) => [textOf(n), n.props["data-unknown"]]),
    [["Value 9", "true"]],
  );
  // The email's subject and body, each in step.
  tree = writing();
  boxOf(tree, "Subject").props.onValueChange("Hours, {{1}}");
  tree = redraw();
  assert.equal(textOf(byTestId(tree, "template-version-subject")), "Hours, Dani");
  boxOf(tree, "Message").props.onValueChange("Starts {{2}}");
  tree = redraw();
  assert.equal(bodyOf(tree), "Starts Oct 1");
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

test("Cancel closes at once with nothing typed, and asks first when something was written", () => {
  let tree = viewing(page({ rows: [custom("fall_hours")] }), "fall_hours", "email");
  press(byTestId(paneOf(tree), "template-version-write"));
  press(byTestId(redraw(), "template-version-cancel"));
  tree = redraw();
  assert.equal(byTestId(tree, "template-version-editor"), null, "nothing typed, nothing to ask");

  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  boxOf(tree, "Message").props.onValueChange("Something else");
  press(byTestId(redraw(), "template-version-cancel"));
  tree = redraw();
  const ask = byTestId(tree, "template-version-leave-confirm");
  assert.ok(ask, "the one question, where Cancel was");
  assert.equal(byTestId(tree, "template-version-save"), null);
  assert.ok(byTestId(tree, "template-version-editor"), "and the words are still there");
  find(tree, (n) => n.type === Confirm && n.props.testid === "template-version-leave").props.onYes();
  assert.equal(byTestId(redraw(), "template-version-editor"), null, "thrown away on a yes");
});

/* ---------------------------------- one on file ---------------------------------- */

test("Edit opens the editor on the version's own words; Remove asks first, and only a yes calls the verb", async () => {
  const calls = stubbed();
  const rows = [starterRow(VISIT)];
  let tree = viewing(page({ rows, versions: [emailRow(VISIT)] }), VISIT, "email");
  assert.deepEqual(
    menuOf(tree)
      .props.groups.flatMap((g) => g.items)
      .map((i) => [i.label, i.tone]),
    [
      ["Edit", undefined],
      ["Remove", "danger"],
    ],
  );
  itemOf(tree, "Edit").onSelect();
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
