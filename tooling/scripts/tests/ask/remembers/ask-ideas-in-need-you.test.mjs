/**
 * Ask's ideas in Need you (decisions 0070 and 0071; surfaces/today/need-you/idea-work.tsx), EXECUTED on the stub React:
 * an idea's Not today waits while its Approve is on its way, so a card being sent is never let go under it; what became
 * of each card is kept on its turn one after another, since the store writes a turn whole and two outcomes over one turn
 * at once kept only the last; and the row is kept in its place before the door is asked, so the morning read again
 * without the card does not take the row and its receipt away.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEED_YOU_WORDS } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, textOf, press, kitPages, settle } from "../../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
Object.assign(globalThis.window, kitPages);
const flashes = [];
Object.assign(globalThis, {
  askAbout: () => {},
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
});
const { IdeaWork } = await import("../../../../../apps/dashboard/src/surfaces/today/need-you/idea-work.tsx");
const W = globalThis.window;

const MESSAGE = "aaaaaaaa-0000-4000-8000-0000000000a1";
const THREAD = "bbbbbbbb-0000-4000-8000-0000000000b1";
const card = (id, title) => ({
  id,
  kind: "message",
  needs: "operator",
  title,
  summary: `${title}, as Ask would send it.`,
  payload: {},
  undo: null,
});
const CARDS = [card("p-1", "Write to Rosa"), card("p-2", "Write to Ana"), card("p-3", "Write to Lu")];

/** The member's Ask door, held by the test: each commit and each outcome lands when the test says. */
function door() {
  const commits = [];
  const outcomes = [];
  W.__ask = {
    commit: (p) =>
      new Promise((land) => {
        commits.push({ p, land });
      }),
    outcome: (messageId, pid, o) =>
      new Promise((land) => {
        outcomes.push({ messageId, pid, state: o.state, land: () => land(true) });
      }),
  };
  return { commits, outcomes };
}

/** The ideas as the section draws them: each its own work, each keeping its row through `keep`. */
const kept = [];
const ideas = () =>
  W.React.createElement(
    "div",
    null,
    ...CARDS.map((c) =>
      W.React.createElement(IdeaWork, {
        key: c.id,
        card: c,
        messageId: MESSAGE,
        threadId: THREAD,
        main: "primary",
        flash: (m) => flashes.push(m),
        keep: () => kept.push(c.id),
      }),
    ),
  );
const draw = () => {
  fresh();
  return ideas();
};
const redraw = () => again(ideas);
/** An idea's work in the tree, by the card's place: the three are drawn in order, each with its two presses. */
const buttonsOf = (tree) => all(tree, (n) => n.type === "button");
const pressOf = (tree, i, words) => buttonsOf(tree).filter((b) => textOf(b).includes(words))[i];

test("Not today waits while the idea's Approve is on its way: a card being sent is never let go under it", async () => {
  const { commits, outcomes } = door();
  kept.length = 0;
  const tree = draw();
  const sending = press(pressOf(tree, 0, NEED_YOU_WORDS.idea.approve));
  assert.deepEqual(kept, ["p-1"], "the row is kept in its place before the door is asked");
  const held = pressOf(redraw(), 0, NEED_YOU_WORDS.idea.notToday);
  assert.equal(held.props.disabled, true, "Not today is held while the Approve is on its way");
  // Pressed anyway (a stale tree, a keyboard): nothing is let go and nothing is recorded.
  await press(held);
  await settle();
  assert.deepEqual(outcomes, [], "REGRESSION: a Not now under a send recorded 'dismissed' while the send ran");
  commits[0].land({ ok: true, receipt: "Sent to Rosa", undo: null });
  await settle();
  assert.match(textOf(redraw()), /Sent to Rosa/, "what became of it is said in the row at once");
  assert.deepEqual(
    outcomes.map((o) => [o.pid, o.state]),
    [["p-1", "done"]],
    "the one outcome: the send",
  );
  outcomes[0].land();
  await sending;
});

test("what became of each idea is kept on its turn one after another, never two over one turn at once", async () => {
  const { outcomes } = door();
  const tree = draw();
  const first = press(pressOf(tree, 1, NEED_YOU_WORDS.idea.notToday));
  const second = press(pressOf(redraw(), 1, NEED_YOU_WORDS.idea.notToday));
  await settle();
  assert.deepEqual(
    outcomes.map((o) => o.pid),
    ["p-2"],
    "REGRESSION: the second outcome was sent while the first was on its way, and the store kept only one",
  );
  outcomes[0].land();
  await settle();
  assert.deepEqual(
    outcomes.map((o) => [o.messageId, o.pid, o.state]),
    [
      [MESSAGE, "p-2", "dismissed"],
      [MESSAGE, "p-3", "dismissed"],
    ],
    "the second once the first has landed, each on the morning's own turn",
  );
  outcomes[1].land();
  await Promise.all([first, second]);
});
