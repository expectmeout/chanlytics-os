/**
 * A message's sheet, drawn: the message as the customer sees it, its heading and its buttons too, under a title in the
 * owner's words; Rename, from the name's menu, a field and a Save that name every version in view; and the composer's
 * start-from row, which puts a starter's words into the form to change. starter-templates.test.mjs read
 * message-row-parts.tsx's, composer-forms.tsx's and composer.tsx's text for these until 26 Nov 2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BIZ,
  REAL,
  TemplateComposer,
  again,
  all,
  byTestId,
  custom,
  find,
  fresh,
  itemOf,
  library,
  nameMenuOf,
  opened,
  page,
  paneOf,
  redraw,
  stubbed,
  textOf,
  verbs,
} from "./_message-page.mjs";
import { until } from "../../shared/_until.mjs";

const { MessagePreview } = await import("../../../apps/dashboard/src/surfaces/campaigns/parts/message-preview.tsx");

/** A message the workspace wrote and named, with a heading and a button. */
const hours = () =>
  custom("fall_hours", {
    title: "Autumn opening times",
    header: "Our fall hours",
    buttons: [{ text: "Book now", kind: "url" }],
  });

test("an open message is drawn whole, as the customer sees it: its heading and its buttons too, under its title", () => {
  const tree = opened(page({ rows: [hours()] }), "fall_hours");
  const preview = find(paneOf(tree), (n) => n.type === MessagePreview);
  assert.ok(preview, "the message, as a customer reads it in a chat");
  assert.equal(preview.props.header, "Our fall hours", "its heading");
  assert.deepEqual(preview.props.buttons, [{ text: "Book now", kind: "url" }], "and its buttons");
  assert.equal(
    textOf(nameMenuOf(tree).props.trigger),
    "Autumn opening times",
    "named by its title, the owner's own words",
  );
  const said = textOf(paneOf(tree));
  assert.ok(!/Made here|From WhatsApp Manager/.test(said), "and nothing an owner does not act on");
});

test("Rename, from the name's menu, opens a field in the owner's words, and its Save names the message", async () => {
  const renamed = [];
  stubbed({ rename: async (id, title) => (renamed.push([id, title]), { ok: true, data: {} }) });
  try {
    let tree = opened(page({ rows: [hours()] }), "fall_hours");
    const item = itemOf(tree, "Rename");
    assert.ok(item, "Rename is an item of the name's menu");
    assert.equal(item.gate["data-testid"], "template-rename", "its test id rides the item's gate");
    item.onSelect();
    tree = redraw();
    const field = byTestId(tree, "template-title");
    assert.ok(field, "the new name's field");
    assert.equal(field.props.value, "Autumn opening times", "holding the title it has");
    field.props.onValueChange("Autumn hours");
    tree = redraw();
    byTestId(tree, "template-title-save").props.onClick();
    await until(() => renamed.length > 0, "the rename asked of the server");
    assert.deepEqual(renamed, [["w-fall_hours", "Autumn hours"]], "the one version in view, by its new name");
  } finally {
    Object.assign(verbs, REAL);
  }
});

test("the composer starts from a starter: its name, its kind and its words go into the form, to be changed", () => {
  page({ rows: [] });
  fresh();
  const draw = () => again(() => TemplateComposer({ businessName: BIZ, onDone() {}, onCancel() {} }));
  let tree = draw();
  const starts = all(tree, (n) => n.props?.["data-testid"] === "tpl-start-from");
  assert.ok(starts.length > 1, "a row of starters to begin from");
  const pick = starts[1];
  const starter = library.list.find((s) => s.title === textOf(pick).trim());
  assert.ok(starter, `a starter of the library: ${textOf(pick)}`);
  pick.props.onClick();
  tree = draw();
  assert.equal(byTestId(tree, "tpl-name").props.value, starter.name, "its name");
  assert.equal(byTestId(tree, "tpl-body").props.value, library.text(starter, "en_US").body, "and its words, to change");
});
