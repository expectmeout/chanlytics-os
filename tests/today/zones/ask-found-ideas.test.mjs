/**
 * Ask's cards in Ask found (decisions 0070, 0071 and 0087; Today in three zones, 2 Nov 2026), EXECUTED on the stub React
 * over the rows the page draws (zones/found.tsx), where the old test drew Need you's idea rows no page draws any more (the
 * 3 Nov audit, items 33 to 38 and 41). Each case was red on the page:
 *
 * - an approved card's receipt and Undo stay in its place when the morning is read again without it;
 * - Not today waits while an Approve is on its way, rests the card for the member and keeps "dismissed" on its turn, one
 *   outcome after another;
 * - a new campaign's sentence is its one line, and a press opens its rules, holds first; any other card says what Approve
 *   changes;
 * - a fix card's act is its door, never an Approve that has nothing to approve;
 * - what Ask noticed has its act: replies that fell their door, in the canvas's words, a mode one step on its Approve;
 * - a press refused because what it was about moved on says so and asks for no second press.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_FOUND_WORDS as F, NEED_YOU_WORDS, repliesFellCard } from "@chanlytics/contracts";
import { again, all, byTestId, fresh, press, textOf } from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";
import { until } from "../../shared/_until.mjs";
import { answerWith, json, went, wire } from "./_world.mjs";

const { holdAsk } = await importSrc("apps/dashboard/src/surfaces/frame-verbs.ts");
const { AskFound } = await import("../../../apps/dashboard/src/surfaces/today/zones/found.tsx");
const { clearRowStates } = await import("../../../apps/dashboard/src/surfaces/today/need-you/row-state.ts");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

const MESSAGE = "aaaaaaaa-0000-4000-8000-0000000000a1";
const THREAD = "bbbbbbbb-0000-4000-8000-0000000000b1";
const card = (id, title, over = {}) => ({
  id,
  kind: "message",
  needs: "operator",
  title,
  summary: `${title}, as Ask would send it.`,
  payload: {},
  undo: null,
  ...over,
});
const CARDS = [card("p-1", "Write to Rosa"), card("p-2", "Write to Ana"), card("p-3", "Write to Lu")];

/** The morning as GET ask/morning answers it: these cards offered on its turn, and what Ask noticed beside them. */
const morning = (cards, findings = []) =>
  setSurfaceValue("ask_morning", {
    fetchedAt: Date.now(),
    dto: {
      day: "2026-09-18",
      state: "quiet",
      offered: true,
      thread_id: THREAD,
      message_id: MESSAGE,
      headline: "",
      detail: "",
      cards,
      findings,
      rested: {},
      lately: [],
    },
  });

/**
 * The member's Ask door, held by the test: each commit and each outcome lands when the test says. An outcome keeps how
 * many asked before it were still on their way (`pending`), so a test reads the order without waiting for nothing.
 */
function door() {
  const commits = [];
  const outcomes = [];
  holdAsk({
    commit: (p) =>
      new Promise((land) => {
        commits.push({ p, land });
      }),
    outcome: (messageId, pid, o) =>
      new Promise((land) => {
        const it = {
          messageId,
          pid,
          state: o.state,
          moved: o.moved,
          pending: outcomes.filter((x) => !x.landed).length,
        };
        it.land = () => {
          it.landed = true;
          land(true);
        };
        outcomes.push(it);
      }),
  });
  return { commits, outcomes };
}

/** Ask found drawn fresh, a visit of its own (row-state.ts keeps what a row came to for the visit). */
const draw = () => {
  clearRowStates();
  fresh();
  return again(() => AskFound({ wide: false }));
};
const redraw = () => again(() => AskFound({ wide: false }));
const rowOf = (tree, key) => all(tree, (n) => n.props?.["data-key"] === key)[0] ?? null;
const actOf = (tree, key) => byTestId(rowOf(tree, key), "today-found-act");
const openWhy = async (key) => {
  await press(byTestId(rowOf(redraw(), key), "today-found-sentence"));
  return rowOf(redraw(), key);
};
// The member's rests are a view written through PUT views/ask_found: answered yes.
answerWith(() => json(200, { ok: true, data: {} }));

test("Approve: the receipt is said in the row at once, and stays there with its Undo once the morning is read again without the card", async () => {
  const { commits, outcomes } = door();
  morning(CARDS);
  const tree = draw();
  const sending = press(actOf(tree, "p-1"));
  const held = await openWhy("p-1");
  assert.equal(
    byTestId(held, "today-found-rest").props.disabled,
    true,
    "Not today waits while the Approve is on its way",
  );
  commits[0].land({ ok: true, receipt: "Sent to Rosa", undo: { message_id: "m-1" } });
  await until(() => textOf(rowOf(redraw(), "p-1")).includes("Sent to Rosa"), "what it came to, in its place");
  assert.deepEqual(
    outcomes.map((o) => [o.messageId, o.pid, o.state]),
    [[MESSAGE, "p-1", "done"]],
  );
  // The outcome landed, and the morning read again leaves the card out (morning.ts waitingCards): the row stays.
  outcomes[0].land();
  await sending;
  morning(CARDS.slice(1));
  const after = rowOf(redraw(), "p-1");
  assert.ok(after, "REGRESSION: the approved row left with the next read, its receipt and its Undo with it");
  assert.match(textOf(after), /Sent to Rosa/);
  assert.match(textOf(after), new RegExp(NEED_YOU_WORDS.undo));
  setSurfaceValue("ask_morning", undefined);
});

test("Not today rests an idea for the member and keeps 'dismissed' on its turn, one outcome after another", async () => {
  const { outcomes } = door();
  wire.length = 0;
  morning(CARDS);
  draw();
  const first = press(byTestId(await openWhy("p-2"), "today-found-rest"));
  const second = press(byTestId(await openWhy("p-3"), "today-found-rest"));
  await until(() => outcomes.length > 0, "the first outcome asked for");
  outcomes[0].land();
  await until(() => outcomes.length === 2, "the second, once the first landed");
  assert.equal(outcomes[1].pending, 0, "the second waited for the first to land: the store writes a turn whole");
  assert.deepEqual(
    outcomes.map((o) => [o.messageId, o.pid, o.state]),
    [
      [MESSAGE, "p-2", "dismissed"],
      [MESSAGE, "p-3", "dismissed"],
    ],
    "REGRESSION: an idea set aside on Today wrote nothing on its turn, and came back for every member the next morning",
  );
  outcomes[1].land();
  await Promise.all([first, second]);
  const rests = wire.filter((w) => w.method === "PUT" && w.path === "/api/v1/views/ask_found");
  assert.equal(rests.length, 2, "and each rested for the member");
  assert.deepEqual(Object.keys(JSON.parse(rests[1].body).view.rested).sort(), ["p-2", "p-3"]);
  setSurfaceValue("ask_morning", undefined);
});

/**
 * A new campaign's card, as the propose_sequence act makes it (act/playbook.ts): its one line, and its sheet, what holds
 * it first and then a row a fact. On production Today drew its summary, one run-on paragraph of every rule.
 */
const CAMPAIGN = card("p-c", "Campaign: Meeting reminder", {
  kind: "playbook",
  summary:
    "Meeting reminder — the day before a meeting on the calendar · Daily 10:00 AM · everyone with a meeting tomorrow · up to 25 · …",
  line: "Reminds everyone the day before their meeting, 10:00 AM, by text and by email",
  sheet: {
    holds: ["WhatsApp waits: its WhatsApp version goes to WhatsApp for review when you approve."],
    rows: [
      { label: "Runs", value: "Daily 10:00 AM, everyone with a meeting tomorrow, up to 25" },
      { label: "Reaches", value: "Nobody has a meeting tomorrow" },
    ],
  },
});

test("a campaign says its one line, and a press opens its rules, holds first; any other card's press says what Approve changes", async () => {
  door();
  morning([CAMPAIGN, CARDS[0]]);
  const tree = draw();
  assert.equal(textOf(byTestId(rowOf(tree, "p-c"), "today-found-sentence")), CAMPAIGN.line);
  const opened = await openWhy("p-c");
  const sheet = byTestId(opened, "today-found-sheet");
  const inside = textOf(sheet);
  for (const s of [...CAMPAIGN.sheet.holds, ...CAMPAIGN.sheet.rows.flatMap((r) => [r.label, r.value])])
    assert.ok(inside.includes(s), `${s} is opened`);
  assert.ok(inside.indexOf(CAMPAIGN.sheet.holds[0]) < inside.indexOf("Runs"), "what holds it is read first");
  assert.ok(!textOf(opened).includes("Meeting reminder — the day before"), "never the run-on summary");
  // A card with no line: its title is the sentence, and a press says the exact change.
  const plain = await openWhy("p-1");
  assert.match(textOf(plain), /Write to Rosa, as Ask would send it\./, "REGRESSION: a press opened an empty line");
  setSurfaceValue("ask_morning", undefined);
});

/** The one thing to fix before a campaign can reach anyone (act/playbook-card.ts blockedOutcome): a plain id, its door. */
const FIX = card("p-f", "Get their yes to offers", {
  kind: "fix",
  line: "Nobody has said yes to offers yet, so the “Win-back” campaign would reach no one.",
  payload: { trigger: "quiet_30", door: "Get their yes", to: "clients/get-yes" },
});

test("a fix card's act is its door, never Approve: pressed, it opens where the thing is fixed and records nothing", async () => {
  const { commits, outcomes } = door();
  went.length = 0;
  morning([FIX]);
  const tree = draw();
  const act = actOf(tree, "p-f");
  assert.equal(textOf(act).trim(), "Get their yes", "REGRESSION: Approve on a card with nothing to approve");
  await press(act);
  assert.deepEqual(went, ["clients/get-yes"]);
  assert.deepEqual([commits.length, outcomes.length], [0, 0], "nothing committed or recorded");
  // Not today on it, one of Ask's ideas: rested for the member and kept on its turn, as an idea pressed is (0087).
  wire.length = 0;
  void press(byTestId(await openWhy("p-f"), "today-found-rest"));
  await until(() => outcomes.length === 1, "what became of it, kept on its turn");
  assert.deepEqual(
    outcomes.map((o) => [o.messageId, o.pid, o.state]),
    [[MESSAGE, "p-f", "dismissed"]],
    "REGRESSION: a fix card set aside rested for the member alone, and came back with the next morning",
  );
  assert.ok(
    wire.some((w) => w.method === "PUT" && w.path === "/api/v1/views/ask_found"),
    "and rested for the member",
  );
  outcomes[0].land();
  setSurfaceValue("ask_morning", undefined);
});

test("what Ask noticed, set aside: rested for the member, and kept on no turn, since no turn holds it", async () => {
  const { outcomes } = door();
  wire.length = 0;
  const fell = repliesFellCard({
    key: "fell-seq-3",
    kind: "replies_fell",
    sequenceId: "seq-3",
    name: "Win-back",
    last: { sent: 40, replied: 2 },
    before: { sent: 120, replied: 21 },
  });
  morning([], [fell]);
  draw();
  press(byTestId(await openWhy(fell.id), "today-found-rest"));
  await until(() => wire.some((w) => w.method === "PUT" && w.path === "/api/v1/views/ask_found"), "the rest saved");
  assert.deepEqual(outcomes, [], "REGRESSION guard: what Ask noticed rides no turn, so nothing is kept on one");
  setSurfaceValue("ask_morning", undefined);
});

test("what Ask noticed has its act: replies that fell, its door in the canvas's words; a mode one step on, Approve, kept on no turn", async () => {
  const { commits, outcomes } = door();
  const fell = repliesFellCard({
    key: "fell-seq-1",
    kind: "replies_fell",
    sequenceId: "seq-1",
    name: "Win-back",
    last: { sent: 40, replied: 2 },
    before: { sent: 120, replied: 21 },
  });
  const steady = card("finding-steady-seq-2", "Let Birthday notes go on their own", {
    kind: "playbook_change",
    line: "Your last 3 batches all went out. Each could wait for you to stop it instead of asking.",
    summary: "Birthday notes: each batch waits an hour for you to stop it, then goes.",
  });
  morning([], [fell, steady]);
  const tree = draw();
  const fellRow = rowOf(tree, fell.id);
  assert.match(textOf(fellRow), /Replies fell/);
  assert.equal(
    textOf(byTestId(fellRow, "today-found-sentence")),
    "Win-back drew 2 of 40 replies, down from 21 of 120.",
    "the numbers in its sentence, as the canvas says it",
  );
  assert.equal(textOf(actOf(tree, fell.id)).trim(), "Look at it");
  const act = actOf(tree, steady.id);
  assert.equal(textOf(act).trim(), F.approve, "REGRESSION: a steady finding stood with no act at all");
  assert.equal(
    textOf(byTestId(rowOf(tree, steady.id), "today-found-sentence")),
    steady.line,
    "its number, in a sentence",
  );
  void press(act);
  await until(() => commits.length === 1, "the card's own verb walk");
  commits[0].land({ ok: true, receipt: "Birthday notes now go on their own", undo: null });
  await until(() => textOf(rowOf(redraw(), steady.id)).includes("go on their own"), "the receipt");
  assert.deepEqual(outcomes, [], "no turn holds what Ask noticed: nothing is kept on one");
  setSurfaceValue("ask_morning", undefined);
});

test("a press refused because what the card was about moved on says so, keeps that on its turn, and asks for no second press", async () => {
  const { commits, outcomes } = door();
  morning([CARDS[0]]);
  const tree = draw();
  void press(actOf(tree, "p-1"));
  commits[0].land({ ok: false, message: "This run is not waiting for approval.", moved: true });
  await until(() => outcomes.length === 1, "what became of it, kept on its turn");
  assert.deepEqual(
    outcomes.map((o) => [o.pid, o.state, o.moved]),
    [["p-1", "failed", true]],
  );
  assert.equal(actOf(redraw(), "p-1"), null, "no Approve left to press");
  outcomes[0].land();
  setSurfaceValue("ask_morning", undefined);
});
