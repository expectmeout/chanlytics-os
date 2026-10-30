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
const { clearRowStates } = await import("../../../../../apps/dashboard/src/surfaces/today/need-you/row-state.ts");
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
/** A visit of its own: what a row came to is kept by the row for the visit (row-state.ts), as Today's queue lets it go. */
const draw = () => {
  clearRowStates();
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

/**
 * A new campaign's card, as the propose_sequence act makes it (act/playbook.ts): its one line, and its sheet, what holds
 * it first and then a row a fact. On production Today drew its summary, one run-on paragraph of every rule (the 30 Oct
 * 2026 review, item 6).
 */
const CAMPAIGN = {
  id: "p-c",
  kind: "playbook",
  needs: "operator",
  title: "Campaign: Meeting reminder",
  summary:
    "Meeting reminder — the day before a meeting on the calendar · Daily 10:00 AM · everyone with a meeting tomorrow · up to 25 · sent whatever else they hear from you within a week of it · …",
  line: "Reminds everyone the day before their meeting, 10:00 AM, by text and by email",
  sheet: {
    holds: ["WhatsApp waits: its WhatsApp version goes to WhatsApp for review when you approve."],
    rows: [
      { label: "Runs", value: "Daily 10:00 AM, everyone with a meeting tomorrow, up to 25" },
      { label: "Other messages", value: "Sent whatever else they hear from you within a week of it" },
      { label: "Reaches", value: "Nobody has a meeting tomorrow" },
    ],
  },
  payload: {},
  undo: null,
};

test("a campaign idea's rules fold behind Details, holds first, then a row a fact; an idea with no sheet has no fold", () => {
  door();
  clearRowStates();
  fresh();
  const work = (c) =>
    W.React.createElement(IdeaWork, {
      card: c,
      messageId: MESSAGE,
      threadId: THREAD,
      main: "primary",
      flash: () => {},
      keep: () => {},
    });
  const tree = work(CAMPAIGN);
  const fold = all(tree, (n) => n.props?.["data-testid"] === "queue-idea-details");
  assert.equal(fold.length, 1, "the campaign's rules are one press away");
  const press = all(fold[0], (n) => n.type === "button");
  assert.equal(textOf(press[0]).trim(), NEED_YOU_WORDS.idea.details);
  assert.equal(press[0].props["aria-expanded"], false, "closed until pressed: the line is the card");
  const inside = textOf(fold[0]);
  for (const s of [...CAMPAIGN.sheet.holds, ...CAMPAIGN.sheet.rows.flatMap((r) => [r.label, r.value])])
    assert.ok(inside.includes(s), `${s} is behind Details`);
  assert.ok(inside.indexOf(CAMPAIGN.sheet.holds[0]) < inside.indexOf("Runs"), "what holds it is read first");
  // Approve and Not today stand as they did.
  assert.ok(pressOf(tree, 0, NEED_YOU_WORDS.idea.approve));
  assert.ok(pressOf(tree, 0, NEED_YOU_WORDS.idea.notToday));
  const plain = work(CARDS[0]);
  assert.equal(all(plain, (n) => n.props?.["data-testid"] === "queue-idea-details").length, 0);
});

test("Today's row says a campaign idea in its one line, and any other idea in its summary", async () => {
  const { ideaRows } = await import("../../../../../apps/dashboard/src/surfaces/today/need-you/people-rows.tsx");
  fresh();
  const ctx = {
    nav: () => {},
    verbKind: () => "ghost",
    may: true,
    tz: "America/New_York",
    flash: () => {},
    keep: () => {},
    kept: new Set(),
    expanded: new Set(),
    expand: () => {},
    word: "meeting",
    stepDone: () => {},
    keepIdea: () => {},
    keepReview: () => {},
  };
  const rows = W.React.createElement(
    "div",
    null,
    ...ideaRows([CAMPAIGN, CARDS[0]], { messageId: MESSAGE, threadId: THREAD }, ctx),
  );
  const text = textOf(rows);
  assert.ok(text.includes(CAMPAIGN.line), text);
  assert.ok(
    !text.includes("Meeting reminder — the day before"),
    "REGRESSION: the run-on summary stood as the row's words",
  );
  assert.ok(text.includes(CARDS[0].summary), "a card with no line keeps its summary");
});

/**
 * A card of the one thing to fix before a campaign can reach anyone (act/playbook-card.ts blockedOutcome): its act is its
 * door, never Approve, since it commits nothing (the 30 Oct 2026 review, item 6).
 */
const FIX = {
  id: "p-f",
  kind: "fix",
  needs: "operator",
  title: "Get their yes to offers",
  summary:
    "Nobody has said yes to offers yet, so the “Win-back” campaign would reach no one. It is fixed under People › Get their yes.",
  line: "Nobody has said yes to offers yet, so the “Win-back” campaign would reach no one.",
  payload: { trigger: "quiet_30", door: "Get their yes", to: "clients/get-yes" },
  undo: null,
};

test("a fix idea's act is its door, never Approve: pressed, it opens where the thing is fixed and records nothing; it has no Details", async () => {
  const { commits, outcomes } = door();
  clearRowStates();
  fresh();
  const went = [];
  const tree = W.React.createElement(IdeaWork, {
    card: FIX,
    messageId: MESSAGE,
    threadId: THREAD,
    main: "primary",
    flash: () => {},
    keep: () => {},
    nav: (to) => went.push(to),
  });
  assert.equal(
    pressOf(tree, 0, NEED_YOU_WORDS.idea.approve),
    undefined,
    "REGRESSION: Approve on a card with nothing to approve",
  );
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "queue-idea-details").length, 0);
  // The door is a plain press: it opens at once, with nothing to wait for.
  await press(pressOf(tree, 0, "Get their yes"));
  assert.deepEqual(went, ["clients/get-yes"], "the door opens where it is fixed");
  assert.deepEqual([commits.length, outcomes.length], [0, 0], "nothing is committed or recorded");
  assert.ok(pressOf(tree, 0, NEED_YOU_WORDS.idea.notToday), "Not today stands");
});
