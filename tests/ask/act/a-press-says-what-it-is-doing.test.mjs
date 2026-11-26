/**
 * The press and its foot (the AI chat's feel, lane 1): what a card's press says while it works, what stands where the
 * press was after it, a press that did not go through, and when a foot counts as standing over its card. The card is
 * EXECUTED on the stub React, as cards-together's group is. Where the foot stands in a browser is e2e/ask.spec.ts's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, all, textOf, press, kitPages } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { importSrc } from "../../_source.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

bridgeHolds({ parts: { surfaceState: () => "live", surfaceFailed: () => false } });
installStubReact({});
Object.assign(globalThis, {});
const { AskCards } = await import("../../../apps/dashboard/src/surfaces/ask/card.tsx");
const { askText } = await import("../../../apps/dashboard/src/surfaces/ask/words.ts");
const { ahFootPinned } = await import("../../../apps/dashboard/src/surfaces/ask/hooks.ts");
const { holdAsk } = await importSrc("apps/dashboard/src/surfaces/frame-verbs.ts");
const W = globalThis.window;
const t = askText("en");

const card = (over = {}) => ({
  id: "p-1",
  kind: "playbook",
  needs: "operator",
  title: "Campaign: Reminder",
  summary: "The day before an appointment",
  line: "Reminds tomorrow's 6 appointments, 10:00 AM, by WhatsApp",
  payload: {},
  undo: "Pause it",
  sheet: { holds: [], rows: [{ label: "Runs", value: "Daily" }] },
  ...over,
});
/** The member's door: each press answered as `commit` says. */
const door = (commit) =>
  holdAsk({ commit, outcome: async () => true, undoOpen: () => false, cardOpenRoute: () => "campaigns/new" });
const group = (cards) => W.React.createElement(AskCards, { cards, t, onNav() {} });
const draw = (cards) => {
  fresh();
  return group(cards);
};
/** What the browser would hold: the kit's parts hand their test id down to the element they draw. */
const byTestId = (tree, id) => all(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
const byClass = (tree, name) =>
  all(
    tree,
    (n) =>
      typeof n.type === "string" &&
      String(n.props?.className ?? "")
        .split(" ")
        .includes(name),
  );
/** The card's feet as they stand: its acts while it waits, what a press here made of it after. */
const feetOf = (tree) =>
  all(tree, (n) => typeof n.type === "string" && n.props?.["data-foot"]).map((n) => n.props["data-foot"]);

test("a press says what it is doing while it works, in the Line's language; a press with no word of its own says the house's wait", () => {
  const es = askText("es");
  assert.deepEqual(
    ["save", "keep", "send", "send_to", "post_it", "make", "add", "start"].map((w) => t.pressing(w)),
    ["Saving…", "Saving…", "Sending…", "Sending…", "Posting…", "Making it…", "Adding…", "Starting…"],
  );
  assert.equal(t.pressing("merge"), t.working);
  assert.deepEqual(
    ["save", "send", "post_it", "start"].map((w) => es.pressing(w)),
    ["Guardando…", "Enviando…", "Publicando…", "Empezando…"],
  );
  assert.equal(es.pressing("merge"), es.working);
});

test("while its own press runs, a card's press is held and says what it is doing, and its acts are the card's foot", async () => {
  let release = () => {};
  const held = new Promise((r) => (release = r));
  door(async () => {
    await held;
    return { ok: true, receipt: "It runs", undo: null };
  });
  const cards = [card()];
  const redraw = () => again(() => group(cards));
  const first = draw(cards);
  assert.deepEqual(feetOf(first), ["acts"]);
  const at = byTestId(first, "ask-card-approve")[0];
  assert.equal(textOf(at), "Start it");
  press(at);
  await until(() => byTestId(redraw(), "ask-card-approve")[0]?.props["aria-busy"] === true, "the press is held");
  assert.equal(textOf(byTestId(redraw(), "ask-card-approve")[0]), "Starting…");
  release();
  await until(() => /It runs/.test(textOf(redraw())), "what became of it");
});

test("what became of a card pressed here is its foot, in its done state; a card drawn again from what the conversation kept has none", async () => {
  door(async () => ({ ok: true, receipt: "It runs", undo: null }));
  const cards = [card()];
  const redraw = () => again(() => group(cards));
  press(byTestId(draw(cards), "ask-card-approve")[0]);
  await until(() => /It runs/.test(textOf(redraw())), "what became of it");
  assert.deepEqual(feetOf(redraw()), ["told"], "where the press was");
  const told = byClass(redraw(), "ask-told").find((n) => n.props["data-foot"]);
  assert.match(textOf(told), /It runs/);
  assert.equal(byClass(redraw(), "ask-card-receipt")[0].props["data-state"], "done");
  const kept = draw([card({ outcome: { state: "done", receipt: "It runs", atMs: 1, undo: null } })]);
  assert.match(textOf(kept), /It runs/);
  assert.deepEqual(feetOf(kept), [], "at rest: nothing was pressed here");
});

test("a press that did not go through says why in the failed state, where the press stood, and offers the press again", async () => {
  door(async () => ({ ok: false, message: "That campaign needs a message first." }));
  const cards = [card()];
  const redraw = () => again(() => group(cards));
  press(byTestId(draw(cards), "ask-card-approve")[0]);
  await until(() => /needs a message first/.test(textOf(redraw())), "why it did not go");
  const receipt = byClass(redraw(), "ask-card-receipt")[0];
  assert.equal(receipt.props["data-state"], "failed");
  assert.equal(byClass(receipt, "ok").length, 0, "never a tick");
  assert.ok(all(receipt, (n) => n.type === "button").some((b) => textOf(b) === t.tryAgain));
  assert.deepEqual(feetOf(redraw()), ["told"], "it stands where the press was");
});

test("a foot stands over its card while it is higher than its place under the part before it", () => {
  assert.equal(ahFootPinned({ footTop: 500, prevBottom: 900 }), true, "the card's body runs on under it");
  assert.equal(ahFootPinned({ footTop: 910, prevBottom: 900 }), false, "at rest: the card's gap under the body");
  assert.equal(ahFootPinned({ footTop: 909.5, prevBottom: 900 }), false, "within a pixel of rest");
  assert.equal(ahFootPinned({ footTop: 908, prevBottom: 900 }), true, "two pixels up, it has left its place");
});
