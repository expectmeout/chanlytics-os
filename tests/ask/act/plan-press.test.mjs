/**
 * A plan's one press (contracts planPressOf, D2 of the answers canvas): what it keeps and its first send, in order, never a second
 * send at once, and WhatsApp's first read in the way of a send that goes by it. Run as it is, over cards written here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noticeOf,
  noticesInOrder,
  planPressOf,
  searchCardsReplaced,
  waitingCardsWords,
  whoCanHearWords,
} from "@chanlytics/contracts";

const step = (n, kind, silent, extra = {}, after = []) => ({
  id: `p-${n}`,
  kind,
  payload: extra,
  plan: { id: "plan-1", step: n, of: 4, silent, after },
});
const offer = () => [
  step(1, "message", true, { versions: { email: { subject: "x", body: "y" } } }),
  step(2, "settings", true),
  step(3, "playbook_change", true),
  step(4, "playbook", false, { template_id: "@step:1", channels: ["email"] }, [1, 2, 3]),
];

test("the press takes what keeps records and the first send, in order", () => {
  assert.deepEqual(planPressOf(offer()), { steps: [1, 2, 3, 4], send: 4, review: null, undone: null });
});

test("a later send is the next press, since it may build on what the first comes back with", () => {
  const cards = [
    step(1, "list", true),
    step(2, "lead_search", false, {}, [1]),
    step(3, "reach_out_make", false, {}, [1, 2]),
  ];
  assert.deepEqual(planPressOf(cards).steps, [1, 2]);
  const after = cards.map((c, i) => (i < 2 ? { ...c, outcome: { state: "done", receipt: "", atMs: 1 } } : c));
  assert.deepEqual(planPressOf(after).steps, [3]);
  assert.equal(planPressOf(after).send, 3);
});

test("a step made is not made twice, and a press carries on from a stop", () => {
  const cards = offer().map((c, i) =>
    i === 0 ? { ...c, outcome: { state: "done", receipt: "", atMs: 1, made: { kind: "message", id: "v" } } } : c,
  );
  assert.deepEqual(planPressOf(cards).steps, [2, 3, 4]);
  const stopped = cards.map((c, i) => (i === 1 ? { ...c, outcome: { state: "failed", receipt: "no", atMs: 1 } } : c));
  assert.deepEqual(planPressOf(stopped).steps, [2, 3, 4], "what failed is tried again");
});

test("WhatsApp reads new words first: the press files them and stops short of the send, and names why", () => {
  const cards = [
    step(1, "message", true, { versions: { whatsapp: { body: "x" } } }),
    step(2, "broadcast", false, { template_id: "@step:1", channels: ["whatsapp"] }, [1]),
  ];
  assert.deepEqual(planPressOf(cards), { steps: [1], send: null, review: 1, undone: null });
});

test("a step undone stops a send that needs it, said as such", () => {
  const cards = offer().map((c, i) => (i === 0 ? { ...c, outcome: { state: "undone", receipt: "", atMs: 1 } } : c));
  const press = planPressOf(cards);
  assert.equal(press.undone, 1);
  assert.equal(press.send, null);
});

test("Not now on one step leaves it out", () => {
  const cards = offer().map((c, i) => (i === 2 ? { ...c, outcome: { state: "dismissed", receipt: "", atMs: 1 } } : c));
  assert.deepEqual(planPressOf(cards).steps, [1, 2, 4]);
});

test("a yes names a waiting card by its id; a plan is one card, by its first step's head", () => {
  const cards = offer();
  cards[0].title = "New message";
  cards[0].plan.head = { title: "Free posture check", sub: "", press: "offer", says: [] };
  assert.equal(waitingCardsWords(cards), "Cards waiting in this thread for their press: “Free posture check” (p-1).");
  assert.equal(waitingCardsWords([]), null);
});

test("a newer card about the same thing sets the older one aside; about another thing, it stands", () => {
  const reply = (id, conv) => ({ id, kind: "reply", title: "", payload: { conversation_id: conv } });
  const earlier = [{ id: "m1", proposals: [reply("p-a", "c1"), reply("p-b", "c2")] }];
  assert.deepEqual(searchCardsReplaced(earlier, [reply("p-c", "c1")]), [{ messageId: "m1", proposalId: "p-a" }]);
  const offerCards = (id) => [
    { id, kind: "message", payload: {}, plan: { id: `plan-${id}`, step: 1, head: { press: "offer" } } },
  ];
  assert.deepEqual(searchCardsReplaced([{ id: "m2", proposals: offerCards("o1") }], offerCards("o2")), [
    { messageId: "m2", proposalId: "o1" },
  ]);
});

test("what it noticed: in the order worth acting on, a rested one gone, in both languages, and never says what it did not read", () => {
  const room = noticeOf("room_and_yes", { open: 6, yes: 18, words: "a free posture check" }, "en");
  assert.equal(room.says, "6 open slots, and 18 said yes to offers.");
  assert.match(room.ask, /a free posture check/);
  assert.equal(
    noticeOf("room_and_yes", { open: 6, yes: 18, words: null }, "en").ask,
    null,
    "with no words it asks for a line",
  );
  assert.equal(noticeOf("room_and_yes", { open: 6, yes: 18, words: null }, "en").fill, "Offer ");
  assert.match(noticeOf("room_and_yes", { open: 1, yes: 2, words: null }, "es").says, /1 hueco libre/);
  const lists = noticeOf("lists_feed_nothing", { lists: 1, names: ["Regulars"] }, "en");
  assert.deepEqual(
    noticesInOrder([lists, room], () => false).map((n) => n.key),
    ["room_and_yes", "lists_feed_nothing"],
  );
  assert.deepEqual(
    noticesInOrder([lists, room], (k) => k === "room_and_yes").map((n) => n.key),
    ["lists_feed_nothing"],
  );
  assert.equal(noticeOf("no_such_signal", {}, "en"), null);
});

test("what came of a send says since, never because", () => {
  const n = noticeOf("offer_result", { name: "Free posture check", sent: 12, replied: 3, booked: 2 }, "en");
  assert.equal(n.says, "Free posture check: 12 sent, 3 replied, 2 booked since.");
  assert.doesNotMatch(n.says, /because/i);
});

test("who can hear it: nothing where everyone can", () => {
  assert.equal(whoCanHearWords({ can: 18, of: 18, leftOut: 0, paused: null }, "en"), null);
  assert.equal(
    whoCanHearWords({ can: 16, of: 18, leftOut: 2, paused: null }, "en"),
    "16 of 18 can hear this. 2 heard from you this week, so they go next week.",
  );
  assert.match(whoCanHearWords({ can: 16, of: 18, leftOut: 2, paused: null }, "es"), /16 de 18/);
});
