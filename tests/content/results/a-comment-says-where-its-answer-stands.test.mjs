/**
 * A comment as Inbox lists and opens it, and as Today points to it (00692; the content loop PRD's 9.2, 12.4 and 12.5;
 * the journey canvas's Results board, cells 1 to 8): who wrote and on which post, and where its public answer stands
 * with the one thing to do. AI's draft is the box's words and Send; a comment AI can't answer says why over an empty
 * box, and is Today's point as someone waiting on a word; an answer whose outcome Instagram never told says so and is
 * never sent twice blind; one left unanswered can be answered after all. Its addresses are Inbox's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMMENT_ANSWER_WORDS,
  COMMENT_WORDS,
  commentAddress,
  commentIdOf,
  commentPageSaid,
  commentRowSaid,
  commentStageOf,
  isCommentsParam,
  isPersonRow,
  needYouCountOf,
  needYouGroupsOf,
  needYouVerbOf,
  toTodayVM,
} from "@chanlytics/contracts";
import { NOW as WORLD_NOW, metrics } from "../../today/record/_world.mjs";

const ID = "6f0d8a52-5d0a-4c8e-9a43-1c2b3d4e5f60";
const NOW = Date.parse("2026-11-23T03:30:00Z");
const TZ = "America/New_York";

const answer = (over = {}) => ({
  state: "drafted",
  draft: "Balayage starts at $120. Message us and we'll find you a time.",
  cannot_why: null,
  words: null,
  said: null,
  by_hand: false,
  sent_at: null,
  ...over,
});

const row = (over = {}) => ({
  touch_id: ID,
  at: "2026-11-23T00:12:00Z",
  contact_id: "0b6a0f0e-9a43-4c8e-8d1c-2b3d4e5f6071",
  name: "Lucía M",
  username: "lucia.m",
  words: "How much for balayage?",
  post: {
    id: "1c2b3d4e-5f60-4c8e-9a43-6f0d8a525d0a",
    file_id: "2c2b3d4e-5f60-4c8e-9a43-6f0d8a525d0a",
    title: "The finish",
    kind: "reel",
    place: "instagram",
    caption: "Forty-five minutes, one round brush.",
    permalink: "https://www.instagram.com/reel/abc/",
  },
  answer: answer(),
  ...over,
});

test("a comment's addresses are Inbox's: the list, and one opened by its id; nothing else reads as one", () => {
  assert.equal(commentAddress(ID), `inbox/cm-${ID}`);
  assert.equal(commentIdOf(`cm-${ID}`), ID);
  assert.equal(commentIdOf("cm-th-1"), null);
  assert.equal(commentIdOf(`rq-${ID}`), null);
  assert.equal(commentIdOf(null), null);
  assert.equal(isCommentsParam("comments"), true);
  assert.equal(isCommentsParam("comments:x"), false);
});

test("where an answer stands: AI's draft, can't, on its way, up or by hand, refused or never told, left, or none", () => {
  assert.equal(commentStageOf(null), "none");
  assert.equal(commentStageOf(answer()), "drafted");
  assert.equal(commentStageOf(answer({ state: "cannot", draft: null, cannot_why: "x" })), "cannot");
  assert.equal(commentStageOf(answer({ state: "sending", words: "x" })), "sending");
  assert.equal(commentStageOf(answer({ state: "sent", words: "x" })), "sent");
  assert.equal(commentStageOf(answer({ state: "sent", by_hand: true })), "by_hand");
  assert.equal(commentStageOf(answer({ state: "failed", said: COMMENT_ANSWER_WORDS.refused })), "failed");
  assert.equal(commentStageOf(answer({ state: "failed", said: COMMENT_ANSWER_WORDS.unknown })), "unknown");
  assert.equal(commentStageOf(answer({ state: "left" })), "left");
});

test("its row names who and the post, what they wrote, and says nothing more while AI's answer waits", () => {
  const said = commentRowSaid(row(), "The finish", TZ, NOW);
  assert.equal(said.title, "Lucía M · on The finish");
  assert.equal(said.sub, "Commented “How much for balayage?”");
  assert.equal(said.quiet, false);
  assert.match(said.when, /7:12 PM/, "the time on the business's clock, the day it is there");
  const answered = commentRowSaid(row({ answer: answer({ state: "sent", words: "x" }) }), "The finish", TZ, NOW);
  assert.equal(answered.sub, "Commented “How much for balayage?” · Answered");
  assert.equal(answered.quiet, true);
  const handle = commentRowSaid(row({ name: null }), null, TZ, NOW);
  assert.equal(handle.title, "@lucia.m · on a post", "a handle where no name is known, and a post with no title");
});

test("opened with AI's draft: the box holds it, marked AI's, with Send, Tell AI what to change and Leave it", () => {
  const said = commentPageSaid(row(), "The finish", TZ, NOW);
  assert.equal(said.head, "Lucía M commented");
  assert.match(said.on, /^On The finish · Instagram reel · /);
  assert.deepEqual(said.box, { start: row().answer.draft, typed: true, mark: COMMENT_WORDS.aiWrote });
  assert.equal(said.send, "Send");
  assert.equal(said.change, true);
  assert.equal(said.leave, true);
  assert.equal(said.line, null);
});

test("one AI can't answer safely says why over an empty box, and a price's way where a price is why", () => {
  const said = commentPageSaid(
    row({
      answer: answer({ state: "cannot", draft: null, cannot_why: "It asks about a price you haven't given AI." }),
    }),
    "The finish",
    TZ,
    NOW,
  );
  assert.equal(said.note, "AI can't answer this one safely · It asks about a price you haven't given AI.");
  assert.deepEqual(said.box, { start: "", typed: true, mark: null });
  assert.equal(said.addPrice, true);
  assert.equal(said.change, false, "nothing of AI's to change");
  const complaint = commentPageSaid(
    row({ answer: answer({ state: "cannot", draft: null, cannot_why: "A complaint." }) }),
    null,
    TZ,
    NOW,
  );
  assert.equal(complaint.addPrice, false);
});

test("on its way: the words it sent and the one moving line; nothing to press", () => {
  const said = commentPageSaid(
    row({ answer: answer({ state: "sending", words: "It's $120." }) }),
    "The finish",
    TZ,
    NOW,
  );
  assert.deepEqual(said.box, { start: "It's $120.", typed: false, mark: null });
  assert.deepEqual(said.line, { words: COMMENT_ANSWER_WORDS.sending, tone: "live" });
  assert.equal(said.send, null);
  assert.equal(said.leave, false);
});

test("up: answered on Instagram with its time, and See it; by hand the same, with no box", () => {
  const sent = commentPageSaid(
    row({ answer: answer({ state: "sent", words: "It's $120.", sent_at: "2026-11-23T00:20:00Z" }) }),
    "The finish",
    TZ,
    NOW,
  );
  assert.equal(sent.line?.tone, "ok");
  assert.match(sent.line?.words ?? "", /^Answered on Instagram · .*7:20 PM/);
  assert.deepEqual(sent.look, { label: "See it", href: row().post.permalink });
  const byHand = commentPageSaid(
    row({ answer: answer({ state: "sent", by_hand: true, draft: null, sent_at: "2026-11-23T00:31:00Z" }) }),
    null,
    TZ,
    NOW,
  );
  assert.equal(byHand.box, null);
  assert.match(byHand.line?.words ?? "", /^You answered on Instagram · /);
});

test("refused: the house's words and Send again; never told: look first, then Send again", () => {
  const refused = commentPageSaid(
    row({ answer: answer({ state: "failed", words: "It's $120.", said: COMMENT_ANSWER_WORDS.refused }) }),
    null,
    TZ,
    NOW,
  );
  assert.deepEqual(refused.line, { words: COMMENT_ANSWER_WORDS.refused, tone: "you" });
  assert.equal(refused.send, "Send again");
  assert.equal(refused.box?.start, "It's $120.", "the words that did not go, to change");
  const unknown = commentPageSaid(
    row({ answer: answer({ state: "failed", words: "It's $120.", said: COMMENT_ANSWER_WORDS.unknown }) }),
    null,
    TZ,
    NOW,
  );
  assert.equal(unknown.stage, "unknown");
  assert.deepEqual(unknown.look, { label: "Open in Instagram", href: row().post.permalink });
  assert.equal(unknown.send, "Send again");
});

test("left unanswered: said so, and it can be answered after all", () => {
  const said = commentPageSaid(row({ answer: answer({ state: "left" }) }), null, TZ, NOW);
  assert.equal(said.line?.words, COMMENT_WORDS.left);
  assert.equal(said.answerAfterAll, true);
  assert.equal(said.send, null);
  assert.equal(said.box, null);
});

/** Today with nobody waiting but these commenters. */
const day = (comments) => toTodayVM(metrics(), [], [], [], WORLD_NOW, null, { comments });
const at = (hours) => new Date(WORLD_NOW.getTime() - hours * 3_600_000).toISOString();

test("Today points to a comment AI can't answer and one whose answer didn't go, as someone waiting; not to AI's draft", () => {
  const cannot = "a1a1a1a1-5d0a-4c8e-9a43-1c2b3d4e5f60";
  const untold = "b2b2b2b2-5d0a-4c8e-9a43-1c2b3d4e5f60";
  const vm = day([
    row({ touch_id: cannot, at: at(3), answer: answer({ state: "cannot", draft: null, cannot_why: "A complaint." }) }),
    row({
      touch_id: untold,
      at: at(2),
      answer: answer({ state: "failed", words: "x", said: COMMENT_ANSWER_WORDS.unknown }),
    }),
    row({ touch_id: "c3c3c3c3-5d0a-4c8e-9a43-1c2b3d4e5f60", at: at(1) }),
    row({ touch_id: "d4d4d4d4-5d0a-4c8e-9a43-1c2b3d4e5f60", at: at(1), answer: answer({ state: "left" }) }),
  ]);
  const rows = vm.queue.rows.filter((r) => r.kind === "comment");
  assert.deepEqual(
    rows.map((r) => [r.cta.to, r.status[0]]).sort(),
    [
      [commentAddress(cannot), COMMENT_WORDS.today.status.cannot],
      [commentAddress(untold), COMMENT_WORDS.today.status.failed],
    ].sort(),
    "AI's draft waits in Inbox's comments, and one left is no row",
  );
  for (const r of rows) {
    assert.deepEqual(
      [r.who, r.channel, r.via, r.sentence, r.quoted],
      ["Lucía M", "Instagram", "The finish", "How much for balayage?", true],
    );
    assert.match(r.when, /^waited /);
    assert.equal(needYouVerbOf(r), "reply", "someone waiting on a word");
    assert.equal(isPersonRow(r), true);
  }
  const groups = needYouGroupsOf(vm.queue.rows);
  assert.equal(needYouCountOf(groups, 0), 2, "both in Need you's one count");
  // The Inbox reads a comment's id back from its row's address.
  const [, param] = rows[0].cta.to.split("/");
  assert.ok([cannot, untold].includes(commentIdOf(param)));
});
