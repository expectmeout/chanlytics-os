/**
 * A reply to a reach-out on Today and in the bell (Reach out Part 5, PR 8): contracts' withReplies over Today's queue,
 * the reply's row in place of its thread's handoff (Task 8.1); the bell's door for a reply whose draft waits, and two
 * replies grouped under their own noun (Task 8.3); and the words the phone is sent, which stay the notice's own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withReplies, replyRowOf, bellActionOf, bellSections, pushFor } from "@chanlytics/contracts";

const C1 = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";
const C2 = "cccccccc-cccc-4ccc-8ccc-cccccccccc02";
const handoff = (id, conversationId, waitedMs) => ({
  id,
  kind: "handoff",
  conversationId,
  callId: null,
  who: "Brightwater & Co.",
  initials: "BC",
  channel: "Email",
  when: "waited 2h",
  sentence: "They wrote back to your reach-out. Nothing is sent without you.",
  quoted: false,
  status: ["Escalated", "Needs review", "since 2:04 PM"],
  tone: "escalated",
  warn: false,
  cta: { label: "Open and reply", to: `inbox/th-${conversationId}` },
  also: { label: "Snooze", verb: "snooze", conversationId, escalationId: `e-${id}` },
  waitedMs,
});
const reading = (over = {}) => ({
  message_id: "m1",
  conversation_id: C1,
  read_at: "2026-09-29T14:06:00.000Z",
  intent: "interested",
  claim: "person",
  summary: "Wants more details",
  unread: null,
  undone: false,
  draft: "Thank you for writing.",
  draft_state: "written",
  ...over,
});

test("a handoff whose reply was read becomes the reply's row, in its place, with its Snooze", () => {
  const rows = [handoff("h1", C1, 7_200_000), handoff("h2", C2, 3_600_000)];
  const out = withReplies(rows, [reading()]);
  assert.deepEqual(
    out.map((r) => r.id),
    ["h1", "h2"],
    "the order is by wait, and a reading does not change the wait",
  );
  const [row] = out;
  assert.deepEqual(
    [row.kind, row.channel, row.status, row.sentence, row.cta],
    [
      "reply",
      "Email",
      ["Wrote back", "interested"],
      "Wants more details",
      { label: "Read the draft", to: `inbox/th-${C1}` },
    ],
  );
  assert.deepEqual(row.also, rows[0].also, "Snooze stays");
  assert.equal(out[1], rows[1], "a thread with no reading is untouched");
  assert.equal(
    replyRowOf(rows[0], reading({ draft: null, draft_state: "not_written" })).cta.label,
    "Open and reply",
    "no draft, the thread",
  );
  assert.deepEqual(replyRowOf(rows[0], reading({ intent: "other", summary: null })).status, ["Wrote back"]);
});

test("no row is added for a reading without a handoff; a no, an automatic reply and an undone reading leave the row", () => {
  assert.deepEqual(withReplies([], [reading()]), [], "the queue is what needs a person");
  const rows = [handoff("h1", C1, 1)];
  for (const r of [reading({ intent: "no" }), reading({ claim: "auto_reply" }), reading({ undone: true })])
    assert.equal(withReplies(rows, [r])[0], rows[0]);
  const newest = withReplies(rows, [reading({ intent: "question" }), reading({ intent: "not_now" })]);
  assert.deepEqual(newest[0].status, ["Wrote back", "a question"], "the thread's newest reading");
});

test("the bell's door for a reply: Read the draft while one waits, else the row's own", () => {
  const row = (over = {}) => ({
    kind: "reach_out_replied",
    action: "Open the thread",
    about: { type: "conversation", id: C1 },
    ...over,
  });
  assert.equal(bellActionOf(row(), [reading()]), "Read the draft");
  assert.equal(bellActionOf(row(), [reading({ draft: null, draft_state: "none" })]), "Open the thread");
  assert.equal(bellActionOf(row(), [reading({ undone: true })]), "Open the thread");
  assert.equal(bellActionOf(row(), []), "Open the thread", "the readings not read yet");
  assert.equal(bellActionOf(row({ kind: "handoff", action: "Open the Inbox" }), [reading()]), "Open the Inbox");
  assert.equal(bellActionOf(row({ about: null }), [reading()]), "Open the thread");
});

test("replies fold under their own noun in the bell, and the phone is sent the notice's own words", () => {
  const bellRow = (id) => ({
    id,
    kind: "reach_out_replied",
    title: `Business ${id} wrote back · interested`,
    message: "",
    tone: "",
    icon: "mail",
    unread: true,
    time: "1h",
    about: null,
    actions: [{ label: "Open the thread", to: "inbox", primary: true }],
  });
  const [section] = bellSections([bellRow("a"), bellRow("b")]);
  assert.deepEqual(
    section.lines.map((l) => [l.title ?? l.row.title, l.count]),
    [["2 replies to a reach-out", 2]],
  );
  const [push] = pushFor(
    {
      id: "n1",
      tenant_id: "t1",
      title: "Brightwater & Co. wrote back · interested",
      body: "Wants more details.\n“This sounds useful.”",
      route: `inbox/th-${C1}`,
    },
    [{ token: "ExponentPushToken[x]", badge: 1 }],
  );
  assert.equal(push.title, "Brightwater & Co. wrote back · interested");
  assert.equal(push.body, "Wants more details.", "the summary a phone shows, never their words");
});
