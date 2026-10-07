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
const { setSurfaceValue, surfaceValue } = await import(`${S}/surface-values.ts`);
const { listingOf } = await import(`${S}/campaigns/templates/group.ts`);
const { messageFacts, firstView } = await import(`${S}/campaigns/templates/message-row-facts.ts`);
const { starters: library } = await import(`${S}/campaigns/templates/verbs.ts`);
const { starterWords } = await import(`${S}/campaigns/templates/composer.tsx`);
const { Picker } = await import(`${S}/kit/picker/picker.tsx`);
const { standingSaid } = await import(`${S}/kit/head/standing.ts`);
const { Segmented } = await import(`${S}/kit/segmented/segmented.tsx`);
const { Field } = await import(`${S}/kit/field/field.tsx`);
const { Menu } = await import(`${S}/kit/menu/menu.tsx`);
const { Confirm } = await import(`${S}/kit/confirm/confirm.tsx`);
const { FieldError } = await import(`${S}/kit/field-error/field-error.tsx`);
const { SlotBox } = await import(`${S}/campaigns/templates/slots/slot-box.tsx`);
const { VersionEditor } = await import(`${S}/campaigns/templates/version-editor.tsx`);
const composerActsModule = await import(`${S}/campaigns/templates/composer-acts.ts`);
const { TemplateComposer } = await import(`${S}/campaigns/templates/composer.tsx`);
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
/**
 * Templates over what the settings surface holds: the WhatsApp rows, the email and text rows, who is acting, and the
 * channels the workspace has (a WhatsApp number, unless the test says none).
 */
const page = ({ rows = [], versions = [], role = "owner", channels = [{ kind: "whatsapp" }] } = {}) => {
  W.ST_STORE.can = (a) => !!contracts.ROLE_PERMS[role][a];
  W.ST_STORE.myRole = () => role;
  W.__TEMPLATES_ALL = rows;
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: BIZ } } },
    facts: null,
    channels,
    templatesAll: rows,
    templateVersions: versions,
    // The messages the surface holds, made of those rows as the bridge makes them where the read carries none.
    messages: contracts.campaignMessagesOf([...rows, ...(versions ?? [])]),
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
/** What the page last said to the frame's head (kit/head/standing.ts): its line and its act, which the frame draws, not the page. */
const headSaid = () => {
  const said = standingSaid();
  return { props: { children: [said?.sentence ?? null, said?.act ?? null] } };
};
/** A part of the page, or of its head where the page says it to the frame. */
const headed = (tree, id) => byTestId(tree, id) ?? byTestId(headSaid(), id);
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

/** The Library's composer: a new message's pane, and the first choice in it, where the message is sent. */
const composerOf = (tree) => byTestId(tree, "messages-composer");
const whereOf = (tree) =>
  find(composerOf(tree), (n) => n.type === Segmented && n.props.label === contracts.NEW_MESSAGE_WORDS.where);
const chooseWhere = (tree, where) => {
  whereOf(tree).props.onValueChange(where);
  return redraw();
};
/** New pressed, over the surface as `page` makes it. */
const newOpened = (over = {}) => {
  const tree = page(over);
  press(headed(tree, "template-new"));
  return redraw();
};
const fieldIn = (tree, label) => find(composerOf(tree), (n) => n.type === Field && n.props.label === label);
const boxIn = (tree, label) => find(composerOf(tree), (n) => n.type === SlotBox && n.props.label === label);
const editorIn = (tree) => find(composerOf(tree), (n) => n.type === VersionEditor);
const menuIn = (tree) => find(composerOf(tree), (n) => n.type === Menu);
const NEW_WORDS = contracts.NEW_MESSAGE_WORDS;

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
    assert.match(
      textOf(byTestId(paneOf(tree), "template-version-none")),
      /^No text version in English yet\./,
      category,
    );
    assert.ok(byTestId(paneOf(tree), "template-version-write"), `${category}: the act that writes it`);
  }
  // The email is never refused for it: every kind of message may go by email.
  const email = viewing(page({ rows: [custom("filed_without", { category: null })] }), "filed_without", "email");
  assert.ok(byTestId(paneOf(email), "template-version-write"));
  // The words are contracts' (channelNeverCarries), said once.
  assert.equal(contracts.channelNeverCarries("sms", "marketing"), contracts.CHANNEL_WORDS.noOffersByText);
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

/* ---------------------------------- the Library lists every message ---------------------------------- */

/** An email or a text of a message the workspace wrote, with no WhatsApp row of its name: approved the moment it was saved. */
const ownRow = (channel, name, over = {}) =>
  baseRow({
    id: `${channel}-${name}-${over.language ?? "en_US"}`,
    channel,
    name,
    category: "marketing",
    header: channel === "email" ? "Our hours" : null,
    body_preview: "Hi {{1}}, our hours start {{2}}.",
    variables: [
      { position: 1, label: "First name", example: "Dani" },
      { position: 2, label: "Date", example: "Oct 1" },
    ],
    ...over,
  });
const HOURS = "fall_hours";
const standingOf = (tree) => textOf(byTestId(paneOf(tree), "template-standing"));
const messagesOf = (rows, versions) => contracts.campaignMessagesOf([...rows, ...versions]);

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
    words: "Spanish in review",
    tone: "info",
  });
  assert.deepEqual(factsOf([en, w({ id: "w-es", language: "es", meta_status: "rejected" })], [], HOURS).marks.tag, {
    words: "Spanish rejected",
    tone: "danger",
  });
  // A message with no WhatsApp version has no tag, and no attention asked of a language it holds on another channel.
  assert.equal(factsOf([], [ownRow("email", HOURS)], HOURS).marks.tag, null);
  const sends = (language) =>
    setSurfaceValue("playbooks", {
      rows: [{ id: "pb-1", name: "Hours", template_name: HOURS, template_language: language, state: "running" }],
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
  assert.equal(find(paneOf(tree), (n) => n.type === Segmented).props.value, "whatsapp", "opens on WhatsApp's");
  // An email and a text, no WhatsApp: the message is whole, and opens on its email.
  const both = [ownRow("email", HOURS, { category: "utility" }), ownRow("sms", HOURS, { category: "utility" })];
  tree = open([], both);
  assert.equal(standingOf(tree), "WhatsApp · not added, Email · ready, Text · ready");
  assert.equal(find(paneOf(tree), (n) => n.type === Segmented).props.value, "email");
  tree = open([], [ownRow("sms", HOURS, { category: "utility" })]);
  assert.equal(standingOf(tree), "WhatsApp · not added, Email · not written, Text · ready");
  assert.equal(find(paneOf(tree), (n) => n.type === Segmented).props.value, "sms", "a text alone opens on the text");
  // WhatsApp alone, approved.
  tree = open([custom(HOURS, { category: "utility" })], []);
  assert.equal(standingOf(tree), "WhatsApp · approved, Email · not written, Text · not written");
  // WhatsApp refused, and an offer: its text can never be written, and says so.
  tree = open([custom(HOURS, { meta_status: "rejected", category: "marketing" })], []);
  assert.equal(standingOf(tree), "WhatsApp · refused, Email · not written, Text · not for offers");
  // Said once per channel, as separate words (a screen reader reads each), in the order the switch offers them.
  assert.deepEqual(
    all(byTestId(paneOf(tree), "template-standing"), (n) => n.type === "span").map((n) => n.props["data-channel"]),
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
    groups.map((g) => [g.label, g.options.map((o) => [o.value, o.meta])]),
    [
      [
        contracts.LANGUAGE_GROUP_WORDS.on,
        [
          ["en_US", "Approved"],
          ["es", "Approved"],
        ],
      ],
    ],
    "both languages are on file, an email's as much as a WhatsApp version; a number to add more is not there",
  );
  assert.equal(contracts.LANGUAGE_GROUP_WORDS.on, "On file");
  // The face: the language in view and, where it holds another, how many more.
  const face = find(paneOf(tree), (n) => n.type === Picker && n.props["data-testid"] === "template-lang").props.face;
  assert.equal(textOf(face).trim(), "EN +1");
  assert.equal(
    find(face, (n) => n.type === "svg").props["data-tone"],
    "ok",
    "an own version is approved the moment it is saved",
  );
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
  assert.ok(textOf(row).includes("“Hi {first name}, our hours start {date}.”"), "the words of its email");
  assert.equal(textOf(byTestId(row, "template-channels")), "Email");
  // The search finds it by the words of an email's subject and body, as it finds a WhatsApp message by its own.
  find(tree, (n) => n.props?.["data-testid"] === "templates-search").props.onValueChange("our hours start");
  tree = redraw();
  assert.ok(rowOf(tree, HOURS), "found by its words");
  find(tree, (n) => n.props?.["data-testid"] === "templates-search").props.onValueChange("no such words");
  tree = redraw();
  assert.equal(rowOf(tree, HOURS), null);
  find(tree, (n) => n.props?.["data-testid"] === "templates-search").props.onValueChange("");

  // Opened, its email reads as any message's does, with an Edit and a Remove that need no number.
  tree = opened(redraw(), HOURS);
  assert.equal(
    byTestId(paneOf(tree), "template-version").props["data-channel"],
    "email",
    "its email is in view, on the version it is filed under",
  );
  assert.deepEqual(
    menuOf(tree)
      .props.groups.flatMap((g) => g.items)
      .map((i) => i.label),
    ["Edit", "Remove"],
  );
  assert.equal(byTestId(paneOf(tree), "template-pane-status"), null, "no WhatsApp badge: it has no WhatsApp version");
  // WhatsApp's own verbs are the WhatsApp version's alone (and need a number): its tab has none to rename, hide or delete.
  tree = switched(tree, "whatsapp");
  assert.equal(menuOf(tree), null);
  assert.equal(byTestId(paneOf(tree), "template-new-refused") !== null, true);
  // Its text is written, from the email's words, under the message's own name.
  tree = switched(tree, "sms");
  assert.match(textOf(byTestId(paneOf(tree), "template-version-none")), /^No text version in English yet\./);
  press(byTestId(paneOf(tree), "template-version-write"));
  tree = redraw();
  assert.equal(boxOf(tree, "Message").props.value, "Hi {{1}}, our hours start {{2}}.", "a copy of the email's words");
  press(saveOf(tree));
  await settle();
  assert.deepEqual(calls, [
    ["save", { name: HOURS, language: "en_US", channel: "sms", body: "Hi {{1}}, our hours start {{2}}." }],
  ]);
  // Removing the email asks first, and calls the verb with the version's own id.
  tree = switched(redraw(), "email");
  itemOf(tree, "Remove").onSelect();
  find(redraw(), (n) => n.type === Confirm).props.onYes();
  await settle();
  assert.deepEqual(calls.at(-1), ["remove", `email-${HOURS}-en_US`]);
});

test("with no number the page still lists the starter set, offers it with what is written now, says WhatsApp waits, and writes a template only where there is a number to write it to", async () => {
  const noNumber = (over = {}) => page({ rows: [], versions: [], channels: [], ...over });
  let tree = noNumber();
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
  const banner = textOf(byTestId(tree, "starters"));
  assert.ok(
    banner.includes(
      "In English and Spanish — email and text versions are written at once; WhatsApp versions are added when a number is connected.",
    ),
    banner,
  );
  assert.ok(byTestId(tree, "starter-add-all"), "and the one act that adds it");
  // With a number the same notice says WhatsApp reviews each of its versions.
  tree = page({ rows: [], versions: [] });
  assert.equal(byTestId(tree, "messages-no-number"), null);
  assert.ok(
    textOf(byTestId(tree, "starters")).includes(
      "In English and Spanish — email and text versions are written at once, and WhatsApp reviews each of its versions, usually within minutes.",
    ),
  );

  // Adding the set asks for no channel (the server writes what the workspace can), and says what it wrote.
  const asked = [];
  Object.assign(verbs, REAL, {
    addStarters: async (body) => (
      asked.push(body),
      {
        ok: true,
        data: {
          results: [],
          submitted: 0,
          existing: 0,
          synced: 0,
          failed: 0,
          skipped: 6,
          versions_saved: 11,
          versions_existing: 0,
          versions_failed: 0,
        },
      }
    ),
  });
  tree = noNumber();
  press(byTestId(tree, "starter-add-all"));
  await settle();
  assert.deepEqual(asked, [{ languages: ["en_US", "es"] }]);
  assert.equal(textOf(toasts.at(-1).msg), "11 email and text versions written · WhatsApp versions wait for a number");

  // A new template asks where it is sent, and WhatsApp's is a template written to a number's account: where there is no
  // number the first step still offers WhatsApp, and its composer says so, in place of its rows, and submits nothing.
  // With a number it is the composer it was.
  tree = noNumber();
  press(headed(tree, "template-new"));
  tree = redraw();
  assert.ok(byTestId(tree, "messages-composer"), "the composer opens");
  assert.deepEqual(
    whereOf(tree).props.options.map((o) => o.value),
    ["email", "sms", "whatsapp"],
    "WhatsApp is offered with no number",
  );
  assert.equal(whereOf(tree).props.value, "email", "and the first thing it opens on is what can be written");
  tree = chooseWhere(tree, "whatsapp");
  assert.ok(textOf(byTestId(tree, "tpl-no-number")).startsWith(contracts.LIBRARY_WORDS.writeNeedsNumber));
  assert.equal(byTestId(tree, "tpl-composer"), null, "none of its rows");
  assert.equal(byTestId(tree, "tpl-submit").props.disabled, true);
  tree = page({ rows: [], versions: [] });
  press(headed(tree, "template-new"));
  tree = redraw();
  assert.ok(byTestId(tree, "tpl-composer"));
  assert.equal(byTestId(tree, "tpl-no-number"), null);
});

/* ---------------------------------- a new message asks where it is sent ---------------------------------- */

/** A message the form writes: its title, two values and the words of its email, typed as a person types them. */
const filledIn = (
  tree,
  { title = "Spring offer", subject = "Spring offer", body = "Hi {{1}}, {{2}} off this week." } = {},
) => {
  const type = (get, words) => {
    get(tree).props.onValueChange(words);
    tree = redraw();
  };
  type((t) => fieldIn(t, "Title"), title);
  for (const [n, name, example] of [
    [1, "First name", "Dani"],
    [2, "Offer", "20%"],
  ]) {
    press(byTestId(tree, "tpl-own-value-add"));
    tree = redraw();
    type((t) => byTestId(t, `tpl-own-value-${n}-name`), name);
    type((t) => byTestId(t, `tpl-own-value-${n}-example`), example);
  }
  type((t) => boxIn(t, "Subject"), subject);
  type((t) => boxIn(t, "Message"), body);
  return tree;
};

test("a new message asks where it is sent first -- Email, Text, WhatsApp -- and opens on WhatsApp where there is a number to write to, on Email where there is none", () => {
  let tree = newOpened();
  const choice = whereOf(tree);
  assert.deepEqual(
    choice.props.options.map((o) => [o.value, o.label, o.testid]),
    [
      ["email", "Email", "tpl-where-email"],
      ["sms", "Text", "tpl-where-sms"],
      ["whatsapp", "WhatsApp", "tpl-where-whatsapp"],
    ],
  );
  assert.equal(NEW_WORDS.where, "Where is it sent");
  assert.equal(choice.props.value, "whatsapp", "with a number it is the composer it was");
  assert.ok(byTestId(tree, "tpl-composer"), "WhatsApp's rows");
  assert.ok(byTestId(tree, "tpl-submit"), "and its submit");
  assert.equal(byTestId(tree, "tpl-own"), null);
  assert.equal(textOf(find(tree, (n) => n.props?.className === "cm-pane-title")).trim(), "New template");
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "cm-pane-sub")),
    "WhatsApp reviews it before it can be sent — usually minutes, sometimes a day",
  );

  // Email is the form of a message with no WhatsApp row: no WhatsApp rows or submit, and no word of WhatsApp's review.
  tree = chooseWhere(tree, "email");
  assert.ok(byTestId(tree, "tpl-own"));
  assert.equal(byTestId(tree, "tpl-composer"), null);
  assert.equal(byTestId(tree, "tpl-submit"), null, "its Save is the editor's");
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "cm-pane-sub")),
    "Email is written here and ready the moment it is saved; no one reviews it first.",
  );
  assert.equal(
    textOf(byTestId(tree, "tpl-own-note")),
    "A message you write here is an offer or news. Visit reminders and follow-ups come from the starter set.",
    "one quiet line, in contracts' words",
  );

  // With no number there is nothing to write to on WhatsApp, so it opens where something can be written.
  tree = newOpened({ channels: [] });
  assert.equal(whereOf(tree).props.value, "email");
  assert.ok(byTestId(tree, "tpl-own"));
  assert.equal(byTestId(tree, "tpl-no-number"), null, "no wall of a number it does not need");

  // A composer that cannot begin a message of its own (the send screen's) is WhatsApp's, with no first step.
  fresh();
  const card = again(() =>
    W.React.createElement(TemplateComposer, { pane: true, businessName: BIZ, onDone() {}, onCancel() {} }),
  );
  assert.equal(byTestId(card, "tpl-where-step"), null);
  assert.ok(byTestId(card, "tpl-composer"));
});

test("a text chosen for a new message says the carriers' sentence and the way out, and offers the email: a message written here is an offer, which a text never carries", () => {
  let tree = chooseWhere(newOpened(), "sms");
  assert.equal(
    textOf(byTestId(tree, "tpl-text-says")),
    "Texts carry no offers. This one can go by email.",
    "channelNeverCarries' sentence, then the second",
  );
  assert.equal(
    textOf(byTestId(tree, "tpl-text-says")),
    `${contracts.channelNeverCarries("sms", "marketing")} ${NEW_WORDS.textGoesByEmail}`,
  );
  assert.equal(byTestId(tree, "tpl-composer"), null, "no WhatsApp rows");
  assert.equal(byTestId(tree, "tpl-own"), null, "and nothing to write");
  // The pane's line under "New template" says what an email is (ready when saved, reviewed by no one) and what WhatsApp
  // does; a text is neither written here nor reviewed, and says its own sentence in the form, not that of an email.
  assert.equal(
    find(tree, (n) => n.props?.className === "cm-pane-sub"),
    null,
    "no line under the pane's name on a Text",
  );
  assert.equal(textOf(find(tree, (n) => n.props?.className === "cm-pane-title")).trim(), "New template");
  assert.equal(byTestId(tree, "template-version-editor"), null, "a text takes no words here");
  assert.equal(textOf(byTestId(tree, "tpl-text-email")), "Write it as an email");
  press(byTestId(tree, "tpl-text-email"));
  tree = redraw();
  assert.equal(whereOf(tree).props.value, "email", "the email is offered instead, and taken");
  assert.ok(byTestId(tree, "tpl-own"));
  assert.equal(
    textOf(find(tree, (n) => n.props?.className === "cm-pane-sub")),
    NEW_WORDS.sub,
    "and the email's line comes back with it",
  );
});

test("the form for an email names the message from its title, refuses a title that makes no name or a name already held, and draws the value as many as it takes", () => {
  let tree = chooseWhere(newOpened({ rows: [custom("fall_hours")] }), "email");
  const title = (words) => {
    fieldIn(tree, "Title").props.onValueChange(words);
    tree = redraw();
  };
  const said = () => (byTestId(tree, "tpl-own-title-error") ? textOf(byTestId(tree, "tpl-own-title-error")) : null);
  assert.equal(fieldIn(tree, "Title").props.maxLength, contracts.TEMPLATE_TITLE_MAX);
  assert.equal(fieldIn(tree, "Title").props.hint, undefined, "no name until there is a title");

  // The name is the title's slug, shown read-only as the name WhatsApp would know it by.
  title("Spring Offer 2026!");
  assert.equal(textOf(fieldIn(tree, "Title").props.hint), "WhatsApp would know it as spring_offer_2026");
  assert.equal(contracts.slugTemplateName("Spring Offer 2026!"), "spring_offer_2026");
  assert.equal(said(), null);
  title("Café Día");
  assert.equal(textOf(fieldIn(tree, "Title").props.hint), "WhatsApp would know it as cafe_dia");

  // A title with nothing to make a name of, one too long, and a name the workspace has: a message's, a starter's, a reach-out's.
  title("!!!");
  assert.equal(said(), NEW_WORDS.titleNeedsWords);
  assert.equal(fieldIn(tree, "Title").props.hint, undefined, "and no name to show");
  title("x".repeat(contracts.TEMPLATE_TITLE_MAX + 1));
  assert.equal(said(), NEW_WORDS.titleTooLong(contracts.TEMPLATE_TITLE_MAX));
  assert.equal(NEW_WORDS.titleTooLong(60), "A title is at most 60 characters.");
  title("Fall Hours");
  assert.equal(
    said(),
    NEW_WORDS.nameTaken,
    "a message of that name is on file: a version would be written over its own",
  );
  title("Winback reply");
  assert.equal(said(), NEW_WORDS.nameTaken, "a starter's name is the starter's");
  title("Reach out 1");
  assert.equal(said(), NEW_WORDS.nameTaken, "a reach-out's name is the reach-out's");
  title("Autumn hours");
  assert.equal(said(), null);

  // The values are as many as are added, each a name and an example, in order, and the editor draws them by name.
  assert.equal(editorIn(tree).props.slots.keys.length, 0, "none until one is added");
  assert.equal(byTestId(tree, "tpl-own-value-remove"), null);
  press(byTestId(tree, "tpl-own-value-add"));
  tree = redraw();
  byTestId(tree, "tpl-own-value-1-name").props.onValueChange("First name");
  byTestId(redraw(), "tpl-own-value-1-example").props.onValueChange("Dani");
  press(byTestId(redraw(), "tpl-own-value-add"));
  tree = redraw();
  byTestId(tree, "tpl-own-value-2-name").props.onValueChange("Date");
  byTestId(redraw(), "tpl-own-value-2-example").props.onValueChange("Oct 1");
  tree = redraw();
  assert.equal(textOf(byTestId(tree, "tpl-own-value-2-name").props.label), "Name of value 2");
  assert.equal(byTestId(tree, "tpl-own-value-1-name").props.maxLength, contracts.TEMPLATE_LABEL_MAX);
  assert.equal(byTestId(tree, "tpl-own-value-1-example").props.maxLength, contracts.TEMPLATE_EXAMPLE_MAX);
  const editor = editorIn(tree);
  assert.deepEqual(editor.props.slots.keys, ["1", "2"], "counted: two values");
  assert.deepEqual(editor.props.slots.labels, ["First name", "Date"]);
  assert.deepEqual(editor.props.values, ["Dani", "Oct 1"], "and the example that fills each in a preview");
  assert.equal(editor.props.channel, "email");
  assert.equal(editor.props.language, "en_US");
  assert.deepEqual(
    menuIn(tree).props.groups.flatMap((g) => g.items.map((i) => i.label)),
    ["First name", "Date"],
    "the menu that puts a value in offers each by its name",
  );

  // Only the last may be taken away, so no value is renumbered under words that name it.
  press(byTestId(tree, "tpl-own-value-remove"));
  tree = redraw();
  assert.deepEqual(editorIn(tree).props.slots.labels, ["First name"]);
  assert.equal(byTestId(tree, "tpl-own-value-2-name"), null);
});

test("the form refuses, in the person's words and before anything is sent, a value with no name or example, and words that name a value the message lacks", async () => {
  const calls = stubbed();
  let tree = chooseWhere(newOpened(), "email");
  fieldIn(tree, "Title").props.onValueChange("Spring offer");
  press(byTestId(redraw(), "tpl-own-value-add"));
  tree = redraw();
  const draft = (over = {}) => ({
    name: "spring_offer",
    language: "en_US",
    channel: "email",
    subject: "Spring offer",
    body: "Hi {{1}}.",
    ...over,
  });
  // A value with no name and no example holds the message back.
  let r = await editorIn(tree).props.onSave(draft());
  assert.equal(r.ok, false);
  assert.equal(r.message, NEW_WORDS.valuesNeedWords);
  byTestId(tree, "tpl-own-value-1-name").props.onValueChange("First name");
  tree = redraw();
  r = await editorIn(tree).props.onSave(draft());
  assert.equal(r.message, NEW_WORDS.valuesNeedWords, "a name alone is not a value: it needs an example too");
  byTestId(tree, "tpl-own-value-1-example").props.onValueChange("Dani");
  tree = redraw();

  // The message has one value, so {{2}} is not one of its values: the very sentence the door says.
  r = await editorIn(tree).props.onSave(draft({ body: "Hi {{1}}, {{2}} off." }));
  assert.equal(r.ok, false);
  assert.equal(
    r.message,
    contracts.validateOwnVersion("email", { subject: "Spring offer", body: "Hi {{1}}, {{2}} off." }, 1, "en_US").error,
  );
  assert.equal(r.message, "{{2}} is not one of this message's values: it has {{1}}.");
  // And as it is typed, in the names the editor draws.
  boxIn(tree, "Subject").props.onValueChange("Spring offer");
  boxIn(redraw(), "Message").props.onValueChange("Hi {{1}}, {{2}} off.");
  assert.equal(
    textOf(byTestId(redraw(), "template-version-error")),
    "Value 2 is not one of this message's values: it has First name.",
  );
  assert.equal(saveOf(redraw()).props.disabled, true, "and Save waits");

  // A title that makes no name is refused too, however the words stand.
  fieldIn(tree, "Title").props.onValueChange("!!!");
  r = await editorIn(redraw()).props.onSave(draft());
  assert.equal(r.message, NEW_WORDS.titleNeedsWords);
  fieldIn(redraw(), "Title").props.onValueChange("");
  r = await editorIn(redraw()).props.onSave(draft());
  assert.equal(r.message, NEW_WORDS.titleMissing);
  assert.deepEqual(calls, [], "nothing was sent");
});

test("a message begun as an email is written by ONE request -- an offer, with its values as the edge files them and its title -- and the page opens its row", async () => {
  const written = [];
  Object.assign(verbs, REAL, {
    saveVersion: async (body) => {
      written.push(body);
      // What the write did, as the refresh after it lands: the surface holds the message the door filed.
      const row = baseRow({
        id: "e-spring",
        channel: "email",
        name: body.name,
        language: body.language,
        category: body.message.category,
        title: body.message.title,
        header: body.subject,
        body_preview: body.body,
        variables: body.message.variables,
      });
      setSurfaceValue("settings", {
        ...surfaceValue("settings"),
        templateVersions: [row],
        messages: contracts.campaignMessagesOf([row]),
      });
      return {
        ok: true,
        data: { template: { id: row.id, name: row.name, language: row.language, channel: "email" }, warnings: [] },
      };
    },
  });
  let tree = filledIn(chooseWhere(newOpened({ channels: [] }), "email"), {
    body: "Hi {{1}}, {{2}} off this week.",
  });
  assert.equal(saveOf(tree).props.disabled, false, "its words pass, so Save is open");
  assert.equal(
    byTestId(tree, "template-version-cancel"),
    null,
    "the pane's Cancel is the composer's: the editor draws none",
  );
  press(saveOf(tree));
  await settle();
  assert.deepEqual(
    written,
    [
      {
        name: "spring_offer",
        language: "en_US",
        channel: "email",
        subject: "Spring offer",
        body: "Hi {{1}}, {{2}} off this week.",
        message: {
          category: "marketing",
          variables: [
            { position: 1, label: "First name", example: "Dani" },
            { position: 2, label: "Offer", example: "20%" },
          ],
          title: "Spring offer",
        },
      },
    ],
    "one request, to the one door",
  );
  tree = redraw();
  assert.equal(composerOf(tree), null, "the composer gives way");
  assert.ok(paneOf(tree), "to the message, open");
  assert.equal(textOf(find(paneOf(tree), (n) => n.props?.className === "cm-pane-title")).trim(), "Spring offer");
  assert.equal(
    find(paneOf(tree), (n) => n.type === Segmented).props.value,
    "email",
    "on the channel its first version is on",
  );
  assert.equal(textOf(byTestId(paneOf(tree), "template-version-subject")), "Spring offer");
  assert.equal(bodyOf(paneOf(tree)), "Hi Dani, 20% off this week.");
  assert.ok(rowOf(tree, "spring_offer"), "and its row is in the list");
  assert.equal(
    textOf(toasts.at(-1).msg),
    "Spring offer is in the Library: the email version in English (US) is saved",
    "the page's toast voice",
  );
  assert.equal(toasts.length, 1);
});

test("a refusal from the door is shown as it came, under the words, and nothing else changes: the form keeps what was written and no message is made", async () => {
  const sentence = contracts.MESSAGE_BEGIN_WORDS.doorNotSwitchedOn;
  const written = [];
  Object.assign(verbs, REAL, {
    saveVersion: async (body) => (
      written.push(body),
      {
        ok: false,
        ...contracts.refusalOf({ code: "conflict", status: 409, message: sentence, write: true }),
      }
    ),
  });
  let tree = filledIn(chooseWhere(newOpened({ channels: [] }), "email"));
  const before = surfaceValue("settings");
  press(saveOf(tree));
  await settle();
  tree = redraw();
  assert.equal(written.length, 1);
  assert.equal(textOf(byTestId(tree, "template-version-error")), sentence, "the route's sentence, as it is");
  assert.ok(composerOf(tree), "the composer stays");
  assert.equal(paneOf(tree), null, "no message opens");
  assert.equal(fieldIn(tree, "Title").props.value, "Spring offer", "its title as it was");
  assert.deepEqual(editorIn(tree).props.slots.labels, ["First name", "Offer"], "its values as they were");
  assert.equal(boxIn(tree, "Message").props.value, "Hi {{1}}, {{2}} off this week.", "its words as they were");
  assert.equal(toasts.length, 0, "nothing was said");
  assert.equal(surfaceValue("settings"), before, "and the surface is as it was");
  assert.equal(saveOf(tree).props.disabled, false, "and it may be tried again");
  // Typing again clears the refusal until the next answer.
  boxIn(tree, "Message").props.onValueChange("Hi {{1}}, {{2}} off.");
  assert.equal(byTestId(redraw(), "template-version-error"), null);
});

test("a viewer's Save starts nothing: the act answers null, as the editor reads a save that did not start", async () => {
  const calls = stubbed();
  filledIn(chooseWhere(newOpened({ channels: [] }), "email"));
  // The role store's answer, View-as included, read as the composer draws: the editor's Save carries the gate, and the
  // act itself starts nothing.
  W.ST_STORE.can = (a) => !!contracts.ROLE_PERMS.viewer[a];
  W.ST_STORE.myRole = () => "viewer";
  const r = await editorIn(redraw()).props.onSave({
    name: "spring_offer",
    language: "en_US",
    channel: "email",
    subject: "Spring offer",
    body: "Hi {{1}}.",
  });
  assert.equal(r, null, "it did not start");
  assert.deepEqual(calls, []);
  assert.ok(composerOf(redraw()), "and the form stays as it was");
});

test("a new message's title, values and words are kept in the tab as they are typed, come back as an email's form, and go once the door takes them", async () => {
  const kept = new Map();
  const at = (kind, key) => `${kind}|${key ?? ""}`;
  const had = W.__tabMemory;
  W.__tabMemory = {
    draft: (kind, key) => kept.get(at(kind, key)) ?? null,
    keepDraft: (kind, value, key) => void kept.set(at(kind, key), JSON.parse(JSON.stringify(value))),
    dropDraft: (kind, key) => void kept.delete(at(kind, key)),
  };
  try {
    filledIn(chooseWhere(newOpened({ channels: [] }), "email"));
    const saved = kept.get("template|new");
    assert.deepEqual(
      [saved.where, saved.title, saved.values, saved.ownWords],
      [
        "email",
        "Spring offer",
        [
          { label: "First name", example: "Dani" },
          { label: "Offer", example: "20%" },
        ],
        { subject: "Spring offer", body: "Hi {{1}}, {{2}} off this week." },
      ],
      "all of it, as it was typed",
    );
    // The page, come back to: the composer is open, on the email's form with what was written, whatever the number.
    for (const channels of [[], [{ kind: "whatsapp" }]]) {
      const tree = page({ channels });
      assert.equal(whereOf(tree).props.value, "email");
      assert.equal(fieldIn(tree, "Title").props.value, "Spring offer");
      assert.deepEqual(editorIn(tree).props.slots.labels, ["First name", "Offer"]);
      assert.equal(boxIn(tree, "Subject").props.value, "Spring offer");
      assert.equal(boxIn(tree, "Message").props.value, "Hi {{1}}, {{2}} off this week.");
    }
    // A draft from before there was a first choice is a WhatsApp template's: it is, wherever it was kept as an email, in a
    // composer that cannot begin a message of its own (the send screen's), which has no first step.
    fresh();
    const card = again(() =>
      W.React.createElement(TemplateComposer, { pane: true, businessName: BIZ, onDone() {}, onCancel() {} }),
    );
    assert.equal(byTestId(card, "tpl-where-step"), null);
    assert.equal(byTestId(card, "tpl-own"), null);
    assert.ok(byTestId(card, "tpl-composer"));
    kept.set("template|new", { body: "Hi {{1}}.", name: "old_draft", examples: ["Dani"] });
    let tree = page();
    assert.equal(whereOf(tree).props.value, "whatsapp", "what was kept before the choice is a WhatsApp template's");
    assert.equal(byTestId(tree, "tpl-body").props.value, "Hi {{1}}.");

    // Taken by the door, it goes.
    kept.set("template|new", saved);
    Object.assign(verbs, REAL, {
      saveVersion: async () => ({ ok: true, data: { template: { id: "e1" }, warnings: [] } }),
    });
    tree = page({ channels: [] });
    press(saveOf(tree));
    await settle();
    assert.equal(kept.has("template|new"), false, "nothing is left to come back to");
  } finally {
    W.__tabMemory = had;
  }
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
