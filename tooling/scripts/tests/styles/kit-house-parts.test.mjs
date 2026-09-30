/**
 * The kit's house parts, EXECUTED on the stub React: Confirm (the one way an act is confirmed), FieldError (the one way a
 * field says what is wrong) and the record kit's row (RecordRow, RecordChips). They are TSX in surfaces/kit, the one
 * implementation the pages that have not moved read by name (kit-globals.ts, published by seed-globals). The record
 * kit's fold, sheet and fields are held by shell/record-kit.test.mjs; this is the small part any page draws.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, find, all, byTestId, textOf, classes } from "../_legacy-react.mjs";
import { KIT_GLOBALS } from "../../../../apps/dashboard/src/surfaces/kit/kit-globals.ts";

// The chrome's words for a fact's source, as the app's bridge publishes them (legacy-bridge/shell.ts).
installLegacyReact({ __chrome: { state: stateOf } });
const { Confirm, FieldError, RecordRow, RecordChips } = KIT_GLOBALS;
const draw = (Comp, props = {}) => {
  fresh();
  return globalThis.React.createElement(Comp, props);
};
const event = () => {
  const said = [];
  return { said, stopPropagation: () => said.push("stop"), preventDefault: () => said.push("prevent") };
};

test("a Confirm asks a question, says what happens, and takes its test ids from one", () => {
  const tree = draw(Confirm, {
    question: "Disconnect Google?",
    detail: "The listing stays.",
    yes: "Yes, disconnect",
    danger: true,
    testid: "gd",
  });
  assert.equal(textOf(byTestId(tree, "gd-confirm")), "Disconnect Google?The listing stays.Yes, disconnectNo");
  assert.equal(byTestId(tree, "gd-confirm").props.role, "group");
  assert.equal(byTestId(tree, "gd-confirm").props["aria-label"], "Disconnect Google?");
  assert.ok(classes(byTestId(tree, "gd-confirm")).includes("confirm-danger"));
  assert.ok(classes(byTestId(tree, "gd-yes")).includes("btn-danger"));
  assert.equal(byTestId(tree, "gd-yes").props.autoFocus, true, "the Yes takes focus as the question appears");
});

test("Escape is No, and it is not said while the answer is on its way", () => {
  const asked = [];
  const tree = draw(Confirm, {
    question: "Sure?",
    onYes: () => asked.push("yes"),
    onNo: () => asked.push("no"),
    testid: "c",
  });
  const e = event();
  byTestId(tree, "c-confirm").props.onKeyDown({ key: "Escape", ...e });
  byTestId(tree, "c-confirm").props.onKeyDown({ key: "Enter", ...event() });
  assert.deepEqual(asked, ["no"]);
  assert.deepEqual(e.said, ["stop"], "the Escape goes no further");
  const busy = draw(Confirm, { question: "Sure?", onNo: () => asked.push("busy no"), busy: true, testid: "c" });
  byTestId(busy, "c-confirm").props.onKeyDown({ key: "Escape", ...event() });
  assert.deepEqual(asked, ["no"], "busy: Escape asks nothing");
  assert.equal(byTestId(busy, "c-yes").props.disabled, true);
  assert.equal(textOf(byTestId(busy, "c-yes")), "Working…");
});

test("a typed match gates the Yes, and the page can say it knows better", () => {
  const gated = (extra) =>
    byTestId(draw(Confirm, { question: "Erase?", typed: "Acme", testid: "e", ...extra }), "e-yes").props.disabled;
  assert.equal(gated({ value: "" }), true);
  assert.equal(gated({ value: "acme" }), true);
  assert.equal(gated({ value: "  Acme  " }), false, "the words typed are trimmed");
  assert.equal(gated({ value: "", ready: true }), false, "ready overrides the match");
  assert.equal(gated({ value: "Acme", ready: false }), true);
  const typed = [];
  const tree = draw(Confirm, {
    question: "Erase?",
    typed: "Acme",
    value: "Ac",
    onType: (v) => typed.push(v),
    testid: "e",
  });
  byTestId(tree, "e-typed").props.onChange({ target: { value: "Acm" } });
  assert.deepEqual(typed, ["Acm"]);
  assert.equal(byTestId(tree, "e-typed").props.placeholder, "Acme");
  assert.equal(byTestId(tree, "e-yes").props.autoFocus, false, "the typed box takes focus, not the Yes");
});

test("a FieldError says nothing without words, and is announced with its words", () => {
  assert.equal(textOf(draw(FieldError, { message: null })), "");
  assert.equal(
    find(draw(FieldError, { message: "" }), (n) => n.props?.role === "alert"),
    null,
  );
  const tree = draw(FieldError, { id: "list-name-error", message: "Not a number.", testid: "fe" });
  const span = byTestId(tree, "fe");
  assert.equal(span.props.role, "alert");
  assert.equal(span.props.id, "list-name-error");
  assert.equal(textOf(span), "Not a number.");
  assert.equal(all(tree, (n) => n.type === "Icon" || n.type?.name === "Icon").length >= 1, true, "the alert glyph");
});

test("a row draws its label, its value, where the value came from and one act; a press on the row is a press on the act", () => {
  const acted = [];
  const tree = draw(RecordRow, {
    id: "website",
    label: "Website",
    value: "marisas.example.com",
    source: "verified",
    act: { label: "Change", onClick: () => acted.push("act") },
  });
  const row = byTestId(tree, "rec-row-website");
  assert.equal(row.props["data-act"], "true");
  assert.equal(row.props["data-empty"], "false");
  assert.match(textOf(row), /Website.*marisas\.example\.com.*Change/);
  assert.equal(find(tree, (n) => classes(n).includes("rec-src")).props["data-state"], "verified");
  const act = { click: () => acted.push("clicked") };
  row.props.onClick({
    currentTarget: { querySelector: () => act, contains: () => false },
    target: { closest: () => null },
  });
  assert.deepEqual(acted, ["clicked"], "the whole row is the act's press");
  const own = { closest: () => ({}) };
  row.props.onClick({ currentTarget: { querySelector: () => act, contains: () => true }, target: own });
  assert.deepEqual(acted, ["clicked"], "something pressable of its own in the row keeps its own press");
});

test("a typed source is not said, an empty row says so, a serious disagreement is on the row at full strength", () => {
  const typed = draw(RecordRow, { label: "Name", value: "Marisa", source: "typed" });
  assert.equal(
    find(typed, (n) => classes(n).includes("rec-src")),
    null,
  );
  const empty = draw(RecordRow, { label: "Website", value: "", empty: "Not set" });
  assert.equal(empty.rendered.props["data-empty"], "true");
  assert.match(textOf(empty), /Not set/);
  const pressed = [];
  const disputed = draw(RecordRow, {
    id: "phone",
    label: "Phone",
    value: "+1 555 0100",
    disputed: {
      value: "+1 555 0199",
      source: "verified",
      severity: "serious",
      onUse: () => pressed.push("use"),
      onKeep: () => pressed.push("keep"),
    },
  });
  assert.equal(disputed.rendered.props["data-state"], "warn");
  const buttons = all(disputed, (n) => n.type === "button");
  assert.deepEqual(
    buttons.map((b) => textOf(b)),
    ["Use Google's", "Keep mine"],
  );
});

test("a row of chips is capped, and the words for the rest are the page's", () => {
  const chips = ["A", "B", "C", "D"].map((label) => ({ label }));
  const said = [];
  const tree = draw(RecordChips, { chips, max: 2, more: (cut) => (said.push(cut), `+${cut} more`) });
  assert.deepEqual(said, [2]);
  assert.match(textOf(tree), /AB\+2 more/);
  assert.equal(textOf(draw(RecordChips, { chips, max: 9, more: (cut) => `+${cut} more` })), "ABCD");
});
