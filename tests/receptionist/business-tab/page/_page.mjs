/**
 * The world the tests of page/ share. Split by behaviour from business-tab-page.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Settings › Business, the page, EXECUTED on the stub React: the gap line, *Who you are* with each row
 * edited where it is stated, the tab's one saver, who may change it, and the two gestures every card draws its rows and
 * folds with (surfaces/settings/business/gestures/), tested through the rows and folds on the page. Each card's own tests are a
 * file of their own (receptionist/business-tab/open/); the page, the fixture and the presses are _business-tab-harness.mjs.
 */
import { after } from "node:test";
import { unmount, all, find, byTestId, textOf, classes, press } from "../../../_stub-react.mjs";
import { foldOf, KNOWN, landFacts, landSettings, marisa, W } from "../../../_business-tab-harness.mjs";

/**
 * The card PaneWorkspace draws INSTEAD of the page for a workspace whose config holds no brain
 * (surfaces/settings/business/create.tsx). Its own tests are business-tab-create.test.mjs; it is here because who may press
 * its one act is the same question as who may press the page's, and the answer has to be one answer.
 */
export const drawCreateCard = () => {
  landSettings({ version: 1, config: {}, prompt: null });
  landFacts({
    facts: { voice_line: { value: null, source: "absent" }, handoff_number: { value: null, source: "absent" } },
    conflicts: [],
  });
  unmount();
  W.__recordFolds.reset();
  W.__businessTabSave.saver.reset();
  return W.React.createElement(W.BtCreateCard, { flash: () => {} });
};

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

/* ------------------------------------ the tab's one saver ------------------------------------ */

export const google = "1200 Maple Ave, Brooklyn, NY 11208, USA";

/** A record Google lists at another address and under another name: two presses, one on each row. */
export const disputed = () => ({
  profile: { ...marisa, address: "1200 Maple Avenue" },
  resolved: { ...KNOWN, listing: { name: "Marisa's Salon & Spa", address: google } },
});

export const useOn = (tree, row) =>
  press(find(byTestId(tree, `rec-row-${row}`), (n) => n.type === "button" && textOf(n) === "Use Google's"));

/** Stand in for the bridge's PUT, holding each save until the test takes it (`accept`) or answers it (`answer`). */
export const holding = () => {
  const sent = [];
  W.__saveSettings = (config, version, accepted) =>
    new Promise((answer) => {
      sent.push({
        config: structuredClone(config),
        version,
        accept: () => accepted({ config: structuredClone(config), version: version + 1 }),
        answer,
      });
    });
  return sent;
};

/* ------------------------------------ on a phone ------------------------------------ */

// On a phone a fold is drawn as a sheet rising from the bottom (record-fold.jsx); the page calls it the same way at
// every width, so everything the page does with a fold holds there: one editor open, the asks, the one-section save.
/** The fold's own box: the voice's textarea. */
export const voiceBox = (tree) =>
  find(foldOf(tree, "tone"), (n) => (n.type === "textarea" || n.type === "input") && classes(n).includes("rec-input"));

export const lastDrawn = (tree) =>
  []
    .concat(tree.rendered.props.children)
    .filter((c) => c != null && c !== false)
    .at(-1);

/* ------------------------------------ motion: what the stub can see of it ------------------------------------ */

// Spec §9. The stub draws no frame and runs no stylesheet, so the motions themselves are the journey's to prove, by
// computed style (e2e/settings/settings-business.spec.ts). What the page decides is here: WHICH line of what a save will tell
// the receptionist has just changed, which is the one line record.css washes.
export const saysLines = (tree, id, part = "says") =>
  all(
    find(byTestId(tree, `rec-fold-says-${id}`), (n) => n.props?.["data-part"] === part),
    (n) => classes(n).includes("rec-says-line"),
  ).map((l) => [textOf(l), l.props["data-changed"] === "true"]);

export const ruleBox = (tree, key) => find(byTestId(tree, `rec-rule-${key}`), (n) => n.type === "input");

/* ------------------------------------ what is on screen at rest ------------------------------------ */

// Spec §11, as amended by Task 6.3 and by the 23 Sep quieting: at rest the page draws what an owner acts on without
// looking for it, and every row's act, quietly (record.css: the dim ink at rest, the ink as the row is approached;
// it was opacity 0 until the row was hovered, which read as nothing to press). What the stub can tell is which
// controls are drawn at rest -- nothing in a closed editor, hidden whole; the journey measures the rest by computed
// style.
export const CONTROL = (n) =>
  ["button", "a", "input", "select", "textarea"].includes(n.type) ||
  n.props?.role === "switch" ||
  n.props?.tabIndex === 0;

/** Every control the page draws at rest, each with the row it is in: a component is walked as what it rendered. */
export const drawnAtRest = (tree) => {
  const out = [];
  const walk = (n, row) => {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((k) => walk(k, row));
    if (n.props?.hidden === true) return;
    const inRow = classes(n).includes("rec-row") ? n : row;
    if (typeof n.type === "string" && CONTROL(n))
      out.push({ id: n.props["data-testid"] || textOf(n).trim(), n, row: inRow });
    if (typeof n.type === "function") walk(n.rendered, inRow);
    else walk(n.props?.children, inRow);
  };
  walk(tree, null);
  return out;
};
