// Today with colour, D8 (17 Nov 2026, Ruben: "any replies etc should instead navigate to the respective conversation or
// thread page with the draft written there, not on today page"): a row answered in its conversation opens the thread, and
// its press asks that thread to put AI's draft in its box (inbox/carried-reply.ts carryDraft), which the composer takes
// once (thread/composer.tsx useDraftAsked). Which rows are answered there is rows.ts answersInThread. Run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { installStubReact } from "../_stub-react.mjs";

installStubReact();

test("Reply's ask for AI's draft reaches the conversation it names, by its route or its id, and once", async () => {
  const carried = await importSrc("apps/dashboard/src/surfaces/inbox/carried-reply.ts");
  carried.carryDraft("inbox/th-c9");
  assert.equal(carried.takeCarriedDraft("th-other"), false, "another conversation takes nothing");
  assert.equal(carried.takeCarriedDraft("th-c9"), true, "the conversation it names takes the ask");
  assert.equal(carried.takeCarriedDraft("th-c9"), false, "and only once");
  carried.carryDraft("inbox/th-c9");
  assert.equal(carried.takeCarriedDraft("c9"), true, "said bare, the same conversation");
  // The words a page carries and the draft Today asks for are two hand-overs: neither takes the other.
  carried.carryReply("inbox/th-c9", "Hello");
  assert.equal(carried.takeCarriedDraft("th-c9"), false, "words carried are no ask for the draft");
  assert.equal(carried.takeCarriedReply("th-c9"), "Hello");
});

test("a thread Today opened offers the way back to Today, that thread alone, until Today is drawn again", async () => {
  const carried = await importSrc("apps/dashboard/src/surfaces/inbox/carried-reply.ts");
  carried.carryFromToday("inbox/th-c9");
  assert.equal(carried.cameFromToday("th-c9"), true, "the thread Today opened");
  assert.equal(carried.cameFromToday("th-c9"), true, "read, not taken: the head says it however often it is drawn");
  assert.equal(carried.cameFromToday("th-other"), false, "another thread, opened from the list, goes back to the list");
  carried.forgetFromToday();
  assert.equal(carried.cameFromToday("th-c9"), false, "back on Today, nothing came from it now");
});

test("a reply to write, a time they asked for and a call back are answered in their conversation; a reply that never arrived, AI's own countdown and a step are not", async () => {
  const { answersInThread } = await importSrc("apps/dashboard/src/surfaces/today/need-you/rows.tsx");
  const row = (over) => ({ id: "r", kind: "handoff", conversationId: "c1", ...over });
  assert.equal(answersInThread(row({})), true, "a person waiting on a reply");
  assert.equal(answersInThread(row({ kind: "window" })), true, "a closing window");
  assert.equal(answersInThread(row({ kind: "reply" })), true, "a reach-out's reply");
  assert.equal(answersInThread(row({ kind: "callback" })), true, "a call back opens the thread, ready to call");
  assert.equal(answersInThread(row({ kind: "reply", request: { starts_at: "x" } })), true, "a time they asked for");
  assert.equal(answersInThread(row({ conversationId: null })), false, "no conversation, no thread to open");
  assert.equal(
    answersInThread(row({ failed: { way: "retry" } })),
    false,
    "a reply that never reached them is tried again where it stands",
  );
  assert.equal(answersInThread(row({ kind: "held" })), false, "AI's own reply counting down keeps its Stop");
  assert.equal(answersInThread(row({ kind: "step" })), false, "a step of the owner's own");
  assert.equal(answersInThread(row({ kind: "visit" })), false, "did they come stays one press");
});
