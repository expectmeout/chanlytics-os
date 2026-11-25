/**
 * The world the tests of offer/ share. Split by behaviour from business-tab-offer.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Settings › Business, *What you offer*, EXECUTED on the stub React: the services row and the sheet it opens, the
 * booking rules' fold, and consult-first's. The page, the fixture and the presses are _business-tab-harness.mjs; every
 * claim here is something the page drew, or something a press on it sent.
 */
import { after } from "node:test";
import assert from "node:assert/strict";
import { unmount, all, find, byTestId, textOf, classes, press } from "../../../_stub-react.mjs";
import { marisa, redrawTab, W } from "../../../_business-tab-harness.mjs";
import { bridgeHolds } from "../../../shell/_bridge-holds.mjs";

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

/** Thirty-three services, as the live record holds them: every one quoted at consult. */
export const many = {
  ...marisa,
  services: Array.from({ length: 33 }, (_, i) => ({
    name: `Service ${i + 1}`,
    duration_min: 30 + i,
    price_note: "quoted at consult",
  })),
};

export const LIMIT = 60;

export const full = {
  ...marisa,
  services: Array.from({ length: LIMIT }, (_, i) => ({ name: `Service ${i + 1}`, duration_min: 30 })),
};

export const sheetOf = (tree) => byTestId(tree, "rec-sheet-services");

/** Every row of the sheet, shown or hidden by the search: a row it leaves out stays on the page. */
export const rowsOf = (tree) =>
  all(sheetOf(tree), (n) => classes(n).includes("bt-service-row") && !classes(n).includes("bt-service-head"));

export const shownOf = (tree) => rowsOf(tree).filter((n) => !n.props.hidden);

export const nameOf = (row) =>
  find(row, (n) => n.type === "input" && / name$/.test(n.props["aria-label"] || "")).props.value;

export const namesOf = (rows) => rows.map(nameOf);

export const openSheet = (tree, flash) => {
  press(byTestId(tree, "rec-row-act-services"));
  return redrawTab(flash);
};

export const searchFor = (tree, words) =>
  byTestId(tree, "rec-services-search") &&
  find(byTestId(tree, "rec-services-search"), (n) => n.type === "input").props.onChange({ target: { value: words } });

export const said = (f) => textOf({ props: { children: f.msg } });

/** A sentence the kit's FieldError draws under a box, by the box's id: rec-<id>-problem. */
export const problemOf = (tree, boxId) => {
  const n = find(tree, (m) => m.type === W.FieldError && m.props.id === `rec-${boxId}-problem`);
  return n ? textOf(n) : null;
};

export const saveSheet = (tree) => press(byTestId(tree, "rec-sheet-save-services"));

/**
 * The name a screen reader hears for a box, worked out as a browser works it out: what aria-labelledby points at, else
 * aria-label, else the label that holds the box (the kit's RecordField: its words, then its unit).
 */
export const heard = (tree, box) => {
  if (box.props["aria-labelledby"])
    return box.props["aria-labelledby"]
      .split(" ")
      .map((id) => textOf(find(tree, (n) => n.props?.id === id)))
      .join(" ");
  if (box.props["aria-label"]) return box.props["aria-label"];
  const holder = find(tree, (n) => n.type === "label" && !!find(n, (m) => m === box));
  if (!holder) return "";
  return [
    find(holder, (n) => classes(n).includes("rec-field-label")),
    find(holder, (n) => classes(n).includes("rec-input-unit")),
  ]
    .map((n) => (n ? textOf(n) : ""))
    .filter(Boolean)
    .join(" ");
};

export const heardBox = (tree, name) =>
  find(tree, (n) => (n.type === "input" || n.type === "textarea") && heard(tree, n) === name);

export const typeHeard = (tree, name, text) => heardBox(tree, name).props.onChange({ target: { value: text } });

/* ------------------------------------ what it calls a booking ------------------------------------ */

/**
 * The workspace's courier as the bridge publishes it (bridge/identity.ts `patch`, which the zone's tests run
 * against the route), standing in for it here: it records what it is sent, keeps the page's list of workspaces current
 * as the courier does once the server has taken a change, and answers `answer`, or taken.
 */
export const courier = ({ answer = null } = {}) => {
  const sent = [];
  bridgeHolds({
    parts: {
      workspace: {
        patch: (fields) => {
          sent.push(fields);
          const r = answer || { ok: true, workspace: fields, message: "" };
          if (r.ok)
            W.__WORKSPACES = W.__WORKSPACES.map((t) => (t.id === W.__ACTIVE_WORKSPACE ? { ...t, ...fields } : t));
          return Promise.resolve(r);
        },
      },
    },
  });
  return { sent };
};

export const flush = () => new Promise((r) => setImmediate(r));

export const told = (f) => [f.tone, textOf({ props: { children: f.msg } })];

export const consultHint = (tree) => {
  const hint = find(byTestId(tree, "rec-row-consult_first"), (n) => classes(n).includes("rec-row-hint"));
  return hint ? textOf(hint) : null;
};

/** The word's menu, pressed open, and a word by its label pressed, on a page drawn with the test's toast. */
export const pickWord = async (label, flash = () => {}) => {
  press(byTestId(redrawTab(flash), "appointment_word-menu"));
  const items = all(redrawTab(flash), (n) => n.props?.role === "menuitemradio");
  const item = items.find((i) => textOf(i).startsWith(label));
  assert.ok(item, `the menu offers "${label}": ${items.map(textOf).join(" | ")}`);
  press(item);
  for (let i = 0; i < 5; i++) await flush();
};

/* ------------------------------------ put back between the same two rows ------------------------------------ */

export const ten = {
  ...marisa,
  services: Array.from({ length: 10 }, (_, i) => ({ name: `Service ${i + 1}`, duration_min: 30 })),
};

/** The sheet's list as drawn: each row by its name, and each Undo left in a row's place as <the name it puts back>. */
export const drawnOf = (tree) =>
  all(byTestId(tree, "rec-services-rows"), (n) => /^rec-service-(gone-)?\d+$/.test(n.props?.["data-testid"] || "")).map(
    (n) => (n.props["data-testid"].includes("gone") ? `<${textOf(find(n, (m) => m.type === "b"))}>` : nameOf(n)),
  );

/** What is left in the place of the row named `name`, and the Undo in it. */
export const markFor = (tree, name) =>
  find(
    byTestId(tree, "rec-services-rows"),
    (n) => classes(n).includes("bt-service-gone") && textOf(find(n, (m) => m.type === "b")) === name,
  );

export const undoFor = (tree, name) => find(markFor(tree, name), (n) => n.type === "button");

export const removeNamed = (tree, name) =>
  press(byTestId(tree, `rec-service-remove-${rowsOf(tree).findIndex((r) => nameOf(r) === name)}`));

export const TEN = ten.services.map((s) => s.name);
