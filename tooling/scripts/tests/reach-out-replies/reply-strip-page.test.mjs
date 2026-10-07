/**
 * The Inbox's strip and chip for a reply to a reach-out (Reach out Part 5, PR 7; surfaces/inbox/thread/reply-strip.tsx), run on the stub React over the
 * bridge's own words (legacy-bridge/reach-out/replies.ts over contracts reach-out-reply-words.ts) and the readings as
 * `__REPLIES` holds them. The undo is the one verb stubbed, so what is proved is what the page draws and what it asks
 * of the bridge: each intent's strip and doors; the undo pressed once, its refusal said in its own words and its
 * success in the page's; "Use the draft" handing the draft to the composer's door; the composer's seed; a thread with
 * no reading drawing nothing new; the strip gone once a person has answered; the composer's line; and the row's chip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, unmount, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
const role = { real: "owner" };
Object.assign(W, {
  CHANLY: { nav: () => {}, R: {} },
  ST_STORE: {
    myRole: () => role.real,
    can: (a) => !!(contracts.ROLE_PERMS[role.real] || {})[a],
    get: (k, fallback) => fallback,
  },
  __clock: { zone: () => "America/New_York" },
});
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
const { ReplyStrip, ReplyChip, useReplyDraftDoor } =
  await import("../../../../apps/dashboard/src/surfaces/inbox/thread/reply-strip.tsx");
const bridge = await import("../../../../apps/dashboard/src/legacy-bridge/reach-out/replies.ts");

const CONV = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
const reading = (over = {}) => ({
  message_id: "m1",
  conversation_id: CONV,
  read_at: "2026-09-29T14:06:00.000Z",
  intent: "interested",
  claim: "person",
  summary: "Wants more details",
  named_day: null,
  refer_to: null,
  unread: null,
  reread: false,
  rereads: 0,
  undone: false,
  can_undo: false,
  draft: "Thank you for writing.\n\nSam",
  draft_state: "written",
  draft_why: null,
  business: "Brightwater & Co.",
  chain: "Reach out · Movers",
  step: 1,
  reply_from: { from: "own", address: "sam@owndomain.example.com" },
  said_no: null,
  step_day: null,
  until_at: null,
  ...over,
});
/** The readings as the surface holds them, and the bridge with its undo stubbed: each press recorded. */
const world = (replies, undo = { ok: true, data: { undone: true } }) => {
  W.__REPLIES = { replies, mailbox: "hello@mail.example.com" };
  const pressed = [];
  W.__replies = { ...bridge.replies, undo: async (id) => (pressed.push(id), undo) };
  return pressed;
};
const THREAD = (over = {}) => ({
  id: `th-${CONV}`,
  real: true,
  timeline: [{ type: "msg", messageId: "m1", from: "client" }],
  ...over,
});
const strip = (thread = THREAD()) => {
  const draw = () => W.React.createElement(ReplyStrip, { thread });
  fresh();
  return { tree: again(draw), draw: () => again(draw) };
};

test("interested: what it was read as, their words, what it did, and Use the draft", () => {
  world([reading()]);
  const { tree } = strip();
  assert.equal(textOf(byTestId(tree, "ix-th-reply-title")), "Wrote back · interested");
  assert.equal(textOf(byTestId(tree, "ix-th-reply-said")), "“Wants more details”");
  assert.equal(
    textOf(byTestId(tree, "ix-th-reply-did")),
    "Talking now. The receptionist drafted an answer: it's in the reply box.",
  );
  assert.ok(byTestId(tree, "ix-th-reply-use-draft"));
  assert.equal(byTestId(tree, "ix-th-reply-undo"), null, "only a no is undone");
  assert.equal(textOf(byTestId(tree, "ix-th-reply-from")), "Goes from sam@owndomain.example.com.");
});

test("Use the draft hands the draft to the composer's door, and the door takes it for its own thread alone", () => {
  world([reading()]);
  const { tree } = strip();
  const sent = [];
  W.addEventListener("inbox:use-draft", (e) => sent.push(e.detail));
  press(byTestId(tree, "ix-th-reply-use-draft"));
  assert.deepEqual(sent, [{ threadId: `th-${CONV}`, text: "Thank you for writing.\n\nSam" }]);

  // The composer's side (thread/composer.tsx calls it with its thread's id and its own writer).
  const got = [];
  fresh();
  again(() =>
    W.React.createElement(() => {
      useReplyDraftDoor(`th-${CONV}`, (text) => got.push(text));
      return null;
    }),
  );
  W.dispatchEvent(new CustomEvent("inbox:use-draft", { detail: { threadId: "th-someone-else", text: "Not yours" } }));
  W.dispatchEvent(new CustomEvent("inbox:use-draft", { detail: { threadId: `th-${CONV}`, text: "Yours" } }));
  assert.deepEqual(got, ["Yours"]);
});

test("the composer is seeded with the draft once written, by the thread's id either way it is spelled", () => {
  world([reading()]);
  assert.equal(W.__replies.draftOf(`th-${CONV}`), "Thank you for writing.\n\nSam");
  assert.equal(W.__replies.draftOf(CONV), "Thank you for writing.\n\nSam");
  world([reading({ draft_state: "waiting", draft: null })]);
  assert.equal(W.__replies.draftOf(CONV), "", "nothing seeded until it is written");
  world([reading({ intent: "no", undone: true })]);
  assert.equal(W.__replies.draftOf(CONV), "", "an undone reading seeds nothing");
});

test("a no: its undo is pressed once; a refusal says the door's words, a success says it came back", async () => {
  const refusal = {
    ok: false,
    ...contracts.refusalOf({ code: "conflict", status: 409, message: "It's been more than seven days." }),
  };
  const pressed = world([reading({ intent: "no", can_undo: true, draft: null, draft_state: "none" })], refusal);
  const s = strip();
  assert.equal(textOf(byTestId(s.tree, "ix-th-reply-title")), "Said no");
  assert.equal(byTestId(s.tree, "ix-th-reply-use-draft"), null);
  await press(byTestId(s.tree, "ix-th-reply-undo"));
  await settle();
  assert.deepEqual(pressed, ["m1"], "the bridge is asked once, for this reading");
  assert.match(textOf(s.draw()), /It's been more than seven days\./);
  unmount(); // the toast's clock goes with its tree, as it does in React

  const ok = world([reading({ intent: "no", can_undo: true, draft: null, draft_state: "none" })]);
  const s2 = strip();
  await press(byTestId(s2.tree, "ix-th-reply-undo"));
  await settle();
  assert.deepEqual(ok, ["m1"]);
  assert.match(textOf(s2.draw()), /Undone: it no longer reads as a no\./);
  unmount();
});

test("a viewer sees the doors gated, never pressed through", () => {
  role.real = "viewer";
  try {
    world([reading({ intent: "no", can_undo: true })]);
    const { tree } = strip();
    assert.equal(byTestId(tree, "ix-th-reply-undo").props["aria-disabled"], true);
  } finally {
    role.real = "owner";
  }
});

test("nothing new: no reading, a thread not real, readings unread, or a person's reply after it", () => {
  world([]);
  assert.equal(byTestId(strip().tree, "ix-th-reply"), null, "no reading on this thread");
  world([reading()]);
  assert.equal(byTestId(strip(THREAD({ real: false })).tree, "ix-th-reply"), null, "the mockup's threads");
  W.__REPLIES = null;
  assert.equal(byTestId(strip().tree, "ix-th-reply"), null, "the readings could not be read");
  world([reading()]);
  const answered = THREAD({
    timeline: [
      { type: "msg", messageId: "m1", from: "client" },
      { type: "msg", messageId: "m2", from: "agent", byYou: true },
    ],
  });
  assert.equal(byTestId(strip(answered).tree, "ix-th-reply"), null, "a person answered since");
  const receptionist = THREAD({
    timeline: [
      { type: "msg", messageId: "m1", from: "client" },
      { type: "msg", messageId: "m2", from: "agent" },
    ],
  });
  assert.ok(byTestId(strip(receptionist).tree, "ix-th-reply"), "an automated message is not a person's answer");
});

test("the composer's line says why an answer goes from the mailbox; a reply to nothing says nothing", () => {
  world([reading({ reply_from: { from: "mailbox", because: "domain_held", own: "sam@owndomain.example.com" } })]);
  assert.equal(
    textOf(byTestId(strip().tree, "ix-th-reply-from")),
    "sam@owndomain.example.com is held, so this goes from hello@mail.example.com.",
  );
  world([reading({ reply_from: { from: "mailbox", because: null } })]);
  assert.equal(byTestId(strip().tree, "ix-th-reply-from"), null);
});

test("the row's chip says what the newest reply was read as, and nothing for a thread without one", () => {
  world([reading({ intent: "no" })]);
  fresh();
  const chip = again(() => W.React.createElement(ReplyChip, { thread: THREAD() }));
  assert.equal(textOf(chip), "Said no");
  world([]);
  fresh();
  assert.equal(textOf(again(() => W.React.createElement(ReplyChip, { thread: THREAD() }))), "");
});

test("the surface reads the readings, and says so at once when it could not", async () => {
  assert.deepEqual(bridge.repliesOverride.globals, ["__REPLIES"]);
  assert.deepEqual(bridge.repliesOverride.refreshOnTables, ["reach_out_replies"]);
});
