/**
 * A turn's cards together (decision 0088; contracts plan-steps.ts, surfaces/ask/card.tsx AskCards), its rules run as they
 * are and its group EXECUTED on the stub React: one card open and the rest folded to a title and a line, deciding one opens
 * the next, what holds them all said once over them and never again in the answer, and a sheet's rows that no press turns
 * on behind Details. What it comes to in a browser (the first Approve on the first screen, focus after a press, what a
 * screen reader meets) is e2e/ask.spec.ts's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardsTogether, holdsAlike, openCardOf, wordsLessHolds } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, textOf, press, kitPages } from "../../_legacy-react.mjs";
import { until } from "../../shared/_until.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
Object.assign(globalThis.window, kitPages);
Object.assign(globalThis, { canDo: () => true, gate: () => ({}) });
const { AskCards } = await import("../../../apps/dashboard/src/surfaces/ask/card.tsx");
const { AskAnswer } = await import("../../../apps/dashboard/src/surfaces/ask/turn.tsx");
const { askText } = await import("../../../apps/dashboard/src/surfaces/ask/words.ts");
const W = globalThis.window;
const t = askText("en");

const { holdAsk } = await importSrc("apps/dashboard/src/surfaces/legacy-verbs.ts");
const REVIEW = "WhatsApp waits: its version goes for review when you approve, and that cannot be taken back.";
const OWN = "The month has room for 12 of them.";
const card = (n, over = {}) => ({
  id: `p-${n}`,
  kind: "playbook",
  needs: "operator",
  title: `Campaign ${n}`,
  summary: `Summary ${n}`,
  line: `Reminds tomorrow's ${n}, 10:00 AM, by WhatsApp`,
  payload: {},
  undo: "Pause it",
  sheet: {
    holds: [REVIEW],
    rows: [
      { label: "Runs", value: `Daily at ${n}` },
      { label: "Goes by", value: "On WhatsApp" },
      { label: "Sends", value: "Each run waits for you", aside: true },
    ],
  },
  ...over,
});
const plan = (step) => ({ id: "plan-1", step, of: 2, silent: true, after: [] });
const done = { state: "done", receipt: "Done", atMs: 1, undo: null };

/* ---- The rules ---- */

test("cards side by side are one group, a plan another, each where its first card stood", () => {
  const a = card(1);
  const b = card(2);
  const s1 = card(3, { plan: plan(1) });
  const s2 = card(4, { plan: plan(2) });
  const c = card(5);
  assert.deepEqual(cardsTogether([a, b, s1, c, s2]), [{ cards: [a, b] }, { plan: [s1, s2] }, { cards: [c] }]);
});

test("the first card with nothing pressed stands open, a plan's by its step; a refused press stops no other", () => {
  assert.equal(openCardOf([card(1), card(2)]), "p-1");
  assert.equal(openCardOf([card(1, { outcome: done }), card(2)]), "p-2");
  assert.equal(openCardOf([card(1, { outcome: { ...done, state: "dismissed" } }), card(2)]), "p-2");
  assert.equal(openCardOf([card(1, { outcome: { ...done, state: "failed" } }), card(2)]), "p-2", "its refusal stands");
  assert.equal(openCardOf([card(1, { plan: plan(2) }), card(2, { plan: plan(1) })]), "p-2", "by step, not as handed");
  assert.equal(openCardOf([card(1, { outcome: done })]), null, "every card has its outcome");
});

test("a card waits until it is decided or a press found its subject gone; a press refused still waits to be tried again", () => {
  const beside = (outcome) => holdsAlike([card(1, { outcome: done }), card(2, { outcome })]);
  assert.deepEqual(beside(undefined), [REVIEW]);
  assert.deepEqual(beside(done), []);
  assert.deepEqual(beside({ ...done, state: "failed" }), [REVIEW]);
  assert.deepEqual(beside({ ...done, state: "failed", moved: true }), []);
});

test("what holds every card is said once, while one still waits; a hold some of them have stays theirs", () => {
  const own = (n) => card(n, { sheet: { holds: [REVIEW, OWN], rows: [] } });
  assert.deepEqual(holdsAlike([card(1), card(2), card(3)]), [REVIEW]);
  assert.deepEqual(holdsAlike([own(1), card(2)]), [REVIEW], "the month's room is the first card's alone");
  assert.deepEqual(holdsAlike([card(1)]), [], "a card alone says its own");
  assert.deepEqual(holdsAlike([card(1), card(2, { sheet: undefined })]), [], "not on every card");
  assert.deepEqual(holdsAlike([card(1, { outcome: done }), card(2)]), [REVIEW], "one still waits");
  assert.deepEqual(holdsAlike([card(1, { outcome: done }), card(2, { outcome: done })]), [], "none waits");
});

test("the answer drops a line that only says again what holds a card waiting, however it was marked, and no words of its own", () => {
  const cards = [card(1), card(2)];
  const mine = "Approve the reminder first.";
  for (const line of [
    REVIEW,
    `> ${REVIEW}`,
    `> [!WARNING] ${REVIEW}`,
    `- ${REVIEW}`,
    `**${REVIEW}**`,
    REVIEW.toUpperCase(),
    REVIEW.slice(0, -1),
  ])
    assert.equal(wordsLessHolds(`${mine}\n${line}`, cards), mine, line);
  assert.equal(
    wordsLessHolds(`> [!WARNING]\n> ${REVIEW}\n\n${mine}`, cards),
    mine,
    "a callout left with no words goes",
  );
  const said = `${mine}\n\n> [!WARNING]\n> Their own warning.`;
  assert.equal(wordsLessHolds(said, cards), said, "a callout of the answer's own stays");
  assert.equal(wordsLessHolds(`Note that ${REVIEW}`, cards), `Note that ${REVIEW}`, "a line of the answer's own stays");
  assert.equal(wordsLessHolds(REVIEW, [card(1, { outcome: done })]), REVIEW, "a card decided no longer says it");
  assert.equal(wordsLessHolds(mine, []), mine);
});

/* ---- The group, drawn ---- */

/** The member's Ask door: each press answered as `commit` says. */
const door = (commit = async () => ({ ok: true, receipt: "It runs", undo: null })) => {
  holdAsk({ commit, outcome: async () => true, undoOpen: () => false, cardOpenRoute: () => "campaigns/new" });
};
const group = (cards) => W.React.createElement(AskCards, { cards, t, onNav() {} });
const draw = (cards) => {
  fresh();
  return group(cards);
};
const cardsOf = (tree) => all(tree, (n) => n.props?.["data-testid"] === "ask-card");
/** What the browser would hold: the kit's parts hand their test id down to the element they draw. */
const testid = (tree, id) => all(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === id);
const buttonSaying = (tree, words) => all(tree, (n) => n.type === "button").find((b) => textOf(b).includes(words));

test("three cards: one open with its facts, the rest a title and a line and no press, and the warning once, over them", () => {
  door();
  const tree = draw([card(1), card(2), card(3)]);
  const [first, second, third] = cardsOf(tree);
  assert.ok(testid(first, "ask-card-approve")[0], "the first stands open");
  assert.match(textOf(first), /RunsDaily at 1/);
  assert.match(textOf(first), /Goes byOn WhatsApp/);
  for (const [c, n] of [
    [second, 2],
    [third, 3],
  ]) {
    assert.equal(testid(c, "ask-card-approve").length, 0, "a folded card offers no press");
    assert.match(textOf(c), new RegExp(`Reminds tomorrow's ${n}`), "it says its line");
    assert.doesNotMatch(textOf(c), /Daily at/, "and keeps its facts for when it opens");
    assert.equal(testid(c, "ask-card-fold")[0].props["aria-expanded"], false);
  }
  assert.equal(testid(first, "ask-card-fold")[0].props["aria-expanded"], true);
  assert.equal(textOf(tree).split(REVIEW).length - 1, 1, "said once");
  assert.equal(textOf(testid(tree, "ask-holds-alike")[0]), `All 3. ${REVIEW}`);
  assert.equal(textOf(first).includes(REVIEW), false, "not on the card");
});

test("a hold only one card has stays on that card, and a card with no line says its summary", () => {
  door();
  const tree = draw([
    card(1, { sheet: { holds: [REVIEW, OWN], rows: [{ label: "Runs", value: "Daily" }] } }),
    card(2, { line: undefined }),
  ]);
  const [first, second] = cardsOf(tree);
  assert.ok(textOf(first).includes(OWN));
  assert.equal(textOf(first).includes(REVIEW), false);
  assert.match(textOf(second), /Summary 2/);
});

test("deciding a card opens the next, leaves the card its head and what became of it, and the warning stands until none waits", async () => {
  door();
  const cards = [card(1), card(2)];
  const redraw = () => again(() => group(cards));
  press(testid(draw(cards), "ask-card-approve")[0]);
  await until(() => /It runs/.test(textOf(redraw())), "what became of the first card");
  let [first, second] = cardsOf(redraw());
  assert.doesNotMatch(textOf(first), /Daily at 1/, "a decided card keeps no sheet in a group");
  assert.ok(testid(second, "ask-card-approve")[0], "the next stands open");
  assert.match(textOf(second), /Daily at 2/);
  assert.equal(testid(redraw(), "ask-holds-alike").length, 1, "one still waits");
  press(buttonSaying(second, t.notNow));
  assert.equal(testid(redraw(), "ask-holds-alike").length, 0, "none waits");
  assert.equal(testid(redraw(), "ask-card-fold").length, 0, "nothing left to open");
});

test("a head opens its card and folds the one open, and folds its own; what a card became goes back to the first still waiting", async () => {
  door();
  const cards = [card(1), card(2), card(3)];
  const redraw = () => again(() => group(cards));
  const openOf = (tree) => cardsOf(tree).map((c) => testid(c, "ask-card-approve").length);
  press(testid(cardsOf(draw(cards))[2], "ask-card-fold")[0]);
  assert.deepEqual(openOf(redraw()), [0, 0, 1], "the third, and only it");
  press(testid(cardsOf(redraw())[2], "ask-card-fold")[0]);
  assert.deepEqual(openOf(redraw()), [0, 0, 0], "and folded again: none");
  press(testid(cardsOf(redraw())[1], "ask-card-fold")[0]);
  press(testid(cardsOf(redraw())[1], "ask-card-approve")[0]);
  await until(() => /It runs/.test(textOf(redraw())), "what became of the second card");
  assert.deepEqual(openOf(redraw()), [1, 0, 0], "decided, the first still waiting opens");
});

test("a refused press keeps its refusal and Try again, the next opens, and Try again opens the card again", async () => {
  door(async (p) =>
    p.id === "p-1" ? { ok: false, message: "Someone changed it first." } : { ok: true, receipt: "It runs" },
  );
  const cards = [card(1), card(2)];
  const redraw = () => again(() => group(cards));
  press(testid(draw(cards), "ask-card-approve")[0]);
  await until(() => /Someone changed it first\./.test(textOf(redraw())), "the refusal");
  let [first, second] = cardsOf(redraw());
  assert.ok(testid(second, "ask-card-approve")[0], "one step refused stops no other");
  press(buttonSaying(first, t.tryAgain));
  [first, second] = cardsOf(redraw());
  assert.ok(testid(first, "ask-card-approve")[0], "it stands open to be tried again");
  assert.equal(testid(second, "ask-card-approve").length, 0);
});

test("Approve held by its own press keeps its focus: it says so and is not disabled; a second press does nothing", async () => {
  let land = () => {};
  let calls = 0;
  door(
    () =>
      new Promise((r) => {
        calls++;
        land = () => r({ ok: true, receipt: "It runs" });
      }),
  );
  const cards = [card(1), card(2)];
  const redraw = () => again(() => group(cards));
  press(testid(draw(cards), "ask-card-approve")[0]);
  await until(() => calls === 1, "the press reached the door");
  const held = testid(redraw(), "ask-card-approve")[0];
  assert.equal(held.props.disabled, false, "REGRESSION: a disabled button dropped focus on the page's body");
  assert.equal(held.props["aria-disabled"], true);
  assert.equal(held.props["aria-busy"], true);
  await press(held);
  assert.equal(calls, 1, "held all the same");
  land();
  await until(() => /It runs/.test(textOf(redraw())), "the press landing");
});

test("what became of a card fills a status drawn from the first, so it is announced", async () => {
  door();
  const cards = [card(1), card(2)];
  const redraw = () => again(() => group(cards));
  const tree = draw(cards);
  const status = (t2) => all(cardsOf(t2)[0], (n) => n.props?.role === "status");
  assert.equal(status(tree).length, 1, "there, empty, before the press");
  assert.equal(textOf(status(tree)[0]), "");
  press(testid(tree, "ask-card-approve")[0]);
  await until(() => /It runs/.test(textOf(status(redraw())[0])), "the status filled");
});

test("Details gives back what the sheet keeps aside, and Open with it; a sheet with nothing aside offers neither fold", () => {
  door();
  const cards = [card(1)];
  const redraw = () => again(() => group(cards));
  const tree = draw(cards);
  assert.doesNotMatch(textOf(tree), /Each run waits for you/);
  assert.equal(buttonSaying(tree, t.openIt), undefined, "three acts fit a phone's row");
  const details = testid(tree, "ask-card-details")[0];
  assert.equal(details.props["aria-expanded"], false);
  press(details);
  const open = redraw();
  assert.match(textOf(open), /SendsEach run waits for you/);
  assert.equal(testid(open, "ask-card-details")[0].props["aria-expanded"], true);
  assert.ok(buttonSaying(open, t.openIt));
  const plain = draw([card(1, { sheet: { holds: [], rows: [{ label: "Runs", value: "Daily" }] } })]);
  assert.equal(testid(plain, "ask-card-details").length, 0);
  assert.ok(buttonSaying(plain, t.openIt), "nothing to hide it behind");
});

test("a card alone is drawn as it was: its head no press, its own warning on it, its sheet kept beside its receipt", async () => {
  door();
  const cards = [card(1)];
  const redraw = () => again(() => group(cards));
  const tree = draw(cards);
  assert.equal(testid(tree, "ask-card-fold").length, 0);
  assert.equal(testid(tree, "ask-holds-alike").length, 0);
  assert.ok(textOf(tree).includes(REVIEW));
  press(testid(tree, "ask-card-approve")[0]);
  await until(() => /It runs/.test(textOf(redraw())), "what became of it");
  assert.match(textOf(redraw()), /Daily at 1/);
});

test("the answer over its cards says a warning once: the group's, not its own line", () => {
  door();
  const answer = {
    v: 2,
    form: "structured",
    say: { headline: "Three campaigns would cover the gaps.", detail: `Approve the first.\n${REVIEW}` },
    show: { figures: [], items: [], breakdown: null },
    do: { open: null, next: [] },
    language: "en",
  };
  fresh();
  const tree = W.React.createElement(AskAnswer, {
    answer,
    cards: [card(1), card(2)],
    t,
    onNav() {},
    onFollow() {},
  });
  assert.equal(textOf(tree).split(REVIEW).length - 1, 1);
  assert.match(textOf(testid(tree, "ask-say")[0]), /Approve the first\./);
  assert.doesNotMatch(textOf(testid(tree, "ask-say")[0]), /WhatsApp waits/);
});
