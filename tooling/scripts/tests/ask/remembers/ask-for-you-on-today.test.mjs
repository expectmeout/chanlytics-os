/**
 * Ask for you on Today (decision 0070; surfaces/today/pages/ask-for-you.tsx), EXECUTED on the stub React over the morning
 * the seam publishes (surface-values.ts): a card's Not now waits while its Approve is on its way, so a card being sent
 * is never let go under it; and what became of each card is kept on its turn one after another, since the store writes
 * a turn whole and two outcomes over one turn at once kept only the last.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_MORNING_WORDS } from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  all,
  byTestId,
  textOf,
  press,
  kitPages,
  settle,
} from "../../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
Object.assign(globalThis.window, kitPages);
const flashes = [];
Object.assign(globalThis, {
  askAbout: () => {},
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
});
const { TodayAsk } = await import("../../../../../apps/dashboard/src/surfaces/today/pages/ask-for-you.tsx");
const { setSurfaceValue } = await import("../../../../../apps/dashboard/src/surfaces/surface-values.ts");
const W = globalThis.window;

const MESSAGE = "aaaaaaaa-0000-4000-8000-0000000000a1";
const card = (id, title) => ({
  id,
  kind: "message",
  needs: "operator",
  title,
  summary: `${title}, as Ask would send it.`,
  payload: {},
  undo: null,
});
setSurfaceValue("ask_morning", {
  dto: {
    day: "2026-10-22",
    state: "ready",
    offered: true,
    thread_id: "bbbbbbbb-0000-4000-8000-0000000000b1",
    message_id: MESSAGE,
    headline: "Three people are waiting on a reply.",
    detail: "",
    cards: [card("p-1", "Reply to Rosa"), card("p-2", "Reply to Ana"), card("p-3", "Reply to Lu")],
  },
  fetchedAt: Date.now(),
});

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
const draw = () => {
  fresh();
  return W.React.createElement(TodayAsk);
};
const redraw = () => again(() => W.React.createElement(TodayAsk));
const rowOf = (tree, title) =>
  all(tree, (n) => n.props?.["data-testid"] === "today-ask-card").find((r) => textOf(r).includes(title));
const notNow = (row) => byTestId(row, "today-ask-not-now");
const approve = (row) => all(row, (n) => n.type === "button" && textOf(n).includes(ASK_MORNING_WORDS.approve))[0];

test("Not now waits while the card's Approve is on its way: a card being sent is never let go under it", async () => {
  const { commits, outcomes } = door();
  const tree = draw();
  const sending = press(approve(rowOf(tree, "Reply to Rosa")));
  const held = rowOf(redraw(), "Reply to Rosa");
  assert.equal(notNow(held).props.disabled, true, "Not now is held while the Approve is on its way");
  // Pressed anyway (a stale tree, a keyboard): nothing is let go and nothing is recorded.
  await press(notNow(held));
  await settle();
  assert.deepEqual(outcomes, [], "REGRESSION: a Not now under a send recorded 'dismissed' while the send ran");
  commits[0].land({ ok: true, receipt: "Sent to Rosa", undo: null });
  await settle();
  assert.deepEqual(
    outcomes.map((o) => [o.pid, o.state]),
    [["p-1", "done"]],
    "the one outcome: the send",
  );
  outcomes[0].land();
  await sending;
});

test("what became of each card is kept on its turn one after another, never two over one turn at once", async () => {
  const { outcomes } = door();
  const tree = draw();
  const first = press(notNow(rowOf(tree, "Reply to Ana")));
  const second = press(notNow(rowOf(redraw(), "Reply to Lu")));
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
