/**
 * The world the tests of answers/ share. Split by behaviour from business-tab-answers.test.mjs on 25 Nov 2026 (layer
 * 14: a test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Settings › Business, *How it answers*, EXECUTED on the stub React: the voice, the languages, the rules it always
 * keeps, how it hands you a customer, the things it should know, what it is told in your own words, and the three
 * messages sent in your name. The page, the fixture and the presses are _business-tab-harness.mjs; every claim here is
 * something the page drew, or something a press on it sent.
 */
import { after } from "node:test";
import { unmount, all, find, byTestId, textOf, classes } from "../../../_stub-react.mjs";
import { drawTab, foldOf, openFold, ownWords, redrawTab, W } from "../../../_business-tab-harness.mjs";

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

export const ROWS = ["tone", "languages", "guardrails", "escalate_when", "notes", "extra_instructions", "fallbacks"];

export const SAVED = "Saved · AI picks it up within a minute";

export const said = (f) => textOf({ props: { children: f.msg } });

export const cardOf = (tree) => byTestId(tree, "rec-card-answers");

/** The box a fold's field draws, by the fold it is in: the kit's RecordField, an input or a textarea. */
export const boxIn = (tree, fold) =>
  find(foldOf(tree, fold), (n) => (n.type === "input" || n.type === "textarea") && classes(n).includes("rec-input"));

export const typeIn = (tree, fold, text) => boxIn(tree, fold).props.onChange({ target: { value: text } });

/** A button by the words on it, inside a node: what a person sees and presses. */
/** The sentence the kit's FieldError draws for a box, by the box's id: rec-<id>-problem. */
export const problemOf = (tree, boxId) => {
  const n = find(tree, (m) => m.type === W.FieldError && m.props.id === `rec-${boxId}-problem`);
  return n ? textOf(n) : null;
};

export const switchOf = (tree, key) => byTestId(tree, `rec-rule-switch-${key}`);

export const langBox = (tree) => find(byTestId(tree, "rec-languages-add"), (n) => n.props?.role === "combobox");

export const langOptions = (tree) => all(byTestId(tree, "rec-languages-add"), (n) => n.props?.role === "option");

export const tokensOf = (tree) =>
  all(byTestId(tree, "rec-languages-tokens"), (n) => classes(n).includes("bt-token")).map((n) => ownWords(n));

export const key = (k, value = "") => ({
  key: k,
  target: { value },
  defaultPrevented: false,
  preventDefault() {
    this.defaultPrevented = true;
  },
});

export const noteRows = (tree) => all(byTestId(tree, "rec-notes-rows"), (n) => classes(n).includes("bt-note"));

export const titlesOf = (tree) => noteRows(tree).map((r) => find(r, (n) => n.type === "input").props.value);

/** A record with n notes, titled A, B, C… */
export const notesOf = (n) =>
  Array.from({ length: n }, (_, i) => ({
    title: String.fromCharCode(65 + i),
    text: `Note ${String.fromCharCode(65 + i)} says this.`,
  }));

/* --- the three strengths, in the fold (Task 4.2) --- */

/** The rules fold, opened: its three rules are drawn in it. */
export const rulesOpen = (over = {}) => {
  let tree = drawTab(over);
  openFold(tree, "guardrails");
  return redrawTab();
};

/** A rule's row in the fold, and the strength word on it: quiet under its name, no pill (the fitted sheets, 14 Oct 2026). */
export const ruleRow = (tree, key) => byTestId(tree, `rec-rule-${key}`);

/** Each rule's label, as the fold names it. */
export const BTA_LABELS = {
  never_quote_prices: "Never quote a price",
  never_confirm_booking: "Never confirm a booking",
  disclose_ai: "Says it's an AI assistant",
  no_health_advice: "No health advice",
};

export const badgesOn = (row) =>
  all(row, (n) => String(n.props?.["data-testid"] ?? "").startsWith("rec-rule-strength-")).map(textOf);
