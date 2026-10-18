/**
 * The owner's goal on Settings › Details (the Settings wiring review, item 9, 18 Oct 2026; contracts
 * config/business-tab/goal.ts, settings/business/who.tsx BtGoalCard): what Ask weighs every signal and plan against,
 * kept in Ask's own section of the config (`ask.goal`). Until then only Ask's card could set it, and no page said what it
 * was. The row says it, saves it as that card writes it and says so in the card's own line, refuses one past the
 * config's limit before any round trip, and offers nothing to a role that may not change the settings.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_GOAL_MAX,
  ASK_GOAL_WORDS,
  applySettingsChange,
  askGoalRefusal,
  askGoalSaved,
  describeSettingsChange,
  parseTenantConfigResult,
} from "@chanlytics/contracts";
import { unmount, byTestId, textOf } from "../_legacy-react.mjs";
import { W, drawTab, openFold, redrawTab, saveRow, saving, typeInto } from "../_business-tab-harness.mjs";

after(() => unmount());

test("the goal's words are contracts', its toast is Ask's card's own line, and its limit is the config's", () => {
  assert.equal(
    askGoalSaved("Twenty new clients a month"),
    describeSettingsChange({ op: "set_goal", goal: "Twenty new clients a month" }),
  );
  assert.equal(askGoalSaved("  "), "Your goal, taken away");
  assert.equal(askGoalRefusal("x".repeat(ASK_GOAL_MAX)), null, "the limit itself is kept");
  assert.equal(askGoalRefusal(`  ${"x".repeat(ASK_GOAL_MAX)}  `), null, "space around it is not counted");
  assert.match(askGoalRefusal("x".repeat(ASK_GOAL_MAX + 1)), new RegExp(String(ASK_GOAL_MAX)));
  // The config refuses what the row refuses, so the row's sentence is the only one an owner meets.
  assert.equal(parseTenantConfigResult({ ask: { goal: "x".repeat(ASK_GOAL_MAX + 1) } }).ok, false);
  assert.equal(parseTenantConfigResult({ ask: { goal: "x".repeat(ASK_GOAL_MAX) } }).ok, true);
});

/** The goal's card, on the record as Details draws it. */
const goalCard = (tree) => byTestId(tree, "rec-card-goal");

test("Details says the goal, or that there is none, under a card that says what it is for", () => {
  let tree = drawTab({ config: { ask: { goal: "Twenty new clients a month" } } });
  const card = goalCard(tree);
  assert.ok(card, "drawn on the record");
  assert.match(textOf(card), new RegExp(ASK_GOAL_WORDS.title));
  assert.match(textOf(card), new RegExp(ASK_GOAL_WORDS.sub.replace(/\./g, "\\.")));
  assert.match(textOf(byTestId(card, "rec-row-ask_goal")), /Twenty new clients a month/);
  tree = drawTab();
  const empty = textOf(byTestId(goalCard(tree), "rec-row-ask_goal"));
  assert.match(empty, new RegExp(ASK_GOAL_WORDS.empty));
  assert.match(empty, new RegExp(ASK_GOAL_WORDS.hint.replace(/\./g, "\\.")), "and what one is, while there is none");
});

test("a goal typed is saved as Ask's card saves it, trimmed, with everything else in the config kept", () => {
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  const stored = structuredClone(W.__SETTINGS.config);
  openFold(tree, "ask_goal");
  tree = redrawTab(flash);
  typeInto(tree, "ask_goal", "  Twenty new clients a month  ");
  tree = redrawTab(flash);
  saveRow(tree, "ask_goal");
  assert.equal(sent.length, 1);
  assert.deepEqual(
    sent[0].config,
    applySettingsChange(stored, { op: "set_goal", goal: "Twenty new clients a month" }),
    "the card's own write",
  );
  assert.equal(sent[0].config.ask.goal, "Twenty new clients a month");
  assert.equal(String(flashes.at(-1).msg), askGoalSaved("Twenty new clients a month"));
});

test("an emptied goal is taken away, never kept as an empty line", () => {
  const sent = saving();
  let tree = drawTab({ config: { ask: { goal: "Twenty new clients a month" } } });
  openFold(tree, "ask_goal");
  tree = redrawTab();
  typeInto(tree, "ask_goal", "   ");
  tree = redrawTab();
  saveRow(tree, "ask_goal");
  assert.equal(sent.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(sent[0].config.ask, "goal"), false);
});

test("a goal past the config's limit is refused under the box, and nothing is sent", () => {
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "ask_goal");
  tree = redrawTab();
  typeInto(tree, "ask_goal", "x".repeat(ASK_GOAL_MAX + 1));
  tree = redrawTab();
  saveRow(tree, "ask_goal");
  tree = redrawTab();
  assert.equal(sent.length, 0);
  assert.match(textOf(goalCard(tree)), new RegExp(`Keep it to ${ASK_GOAL_MAX} characters`));
});

test("a role that may not change the settings reads the goal, and is offered no Change", () => {
  const gated = W.canDo;
  W.canDo = () => false;
  try {
    const tree = drawTab({ config: { ask: { goal: "Twenty new clients a month" } } });
    const row = byTestId(goalCard(tree), "rec-row-ask_goal");
    assert.match(textOf(row), /Twenty new clients a month/);
    assert.equal(byTestId(row, "rec-row-act-ask_goal"), null);
  } finally {
    W.canDo = gated;
  }
});
