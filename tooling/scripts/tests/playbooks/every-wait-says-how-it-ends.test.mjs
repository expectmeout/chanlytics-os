/**
 * Every wait says how it ends, the one way wherever it is shown (decision 0064, step 2): the wait rule and its words
 * (contracts wait-rules.ts), the notices that read them (a batch ready, held for a stop or skipped; a reach-out's; a reply
 * waiting to go in the owner's name), the bell's close of a held reply's row (notice-closes.ts, judged by the threads the
 * Inbox holds), and Today's Going today (waits/going-today.ts): what goes on its own today, soonest first, each with its Stop.
 */
import { test } from "node:test";
import { importSrc } from "../_source.mjs";
import assert from "node:assert/strict";
import {
  ALERT_TOPICS,
  GOING_TODAY_WORDS,
  NOTHING_WAITS_KNOWN,
  NOTICE_ENDS,
  PUSH_KINDS,
  SERVER_NOTIFICATION_KINDS,
  WAIT_KINDS,
  WAIT_RULES,
  clockTime,
  emailsNotificationKind,
  goingTodayOf,
  heldReplyNotice,
  noticeStillWaits,
  readyRunNotice,
  serverNotificationRows,
  skippedRunNotice,
  todayRunWords,
  vetoRunNotice,
  waitEndsWords,
  waitRuleOf,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
// Monday 19 October 2026, 2 PM in New York.
const NOW = Date.parse("2026-10-19T18:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms) => new Date(ms).toISOString();

test("every wait has a rule: what makes it go, when it ends unanswered, and the one act that answers it", () => {
  assert.deepEqual(Object.keys(WAIT_RULES).sort(), [...WAIT_KINDS].sort(), "one rule a kind, no kind without one");
  // What goes on its own goes at its time unless stopped; what waits for an OK ends with its day only where it has one.
  for (const k of ["reply", "batch_hold", "review_hold", "one_off"])
    assert.deepEqual(waitRuleOf(k), { goes: "on_its_own", ends: "at_its_time", act: "stop" }, k);
  assert.deepEqual(waitRuleOf("batch_ask"), { goes: "with_your_ok", ends: "end_of_its_day", act: "approve" });
  for (const k of ["leads_batch", "review_ask"])
    assert.deepEqual(waitRuleOf(k), { goes: "with_your_ok", ends: "never", act: "approve" }, k);
  assert.deepEqual(waitRuleOf("to_send").act, "send");
  assert.deepEqual([waitRuleOf("hold").act, waitRuleOf("held_email").act], ["answer", "answer"]);
});

test("each rule ends in one sentence, the same wherever it is said", () => {
  assert.equal(waitEndsWords("batch_hold", "at 10:30 AM"), "Goes at 10:30 AM unless you stop it");
  assert.equal(waitEndsWords("reply"), "Goes at its time unless you stop it", "no time known: never a made-up one");
  assert.equal(
    waitEndsWords("batch_ask"),
    "Waits for your OK until the end of its day; then it is skipped, and you are told",
  );
  assert.equal(waitEndsWords("leads_batch"), "Waits for your OK; nothing goes until you give it");
  assert.equal(waitEndsWords("to_send"), "Waits for you to send it from your own inbox");
  assert.equal(waitEndsWords("hold"), "Waits for you; nothing more goes until you answer");
});

test("the notices of a batch say its wait by the rule: ready (until its day ends), held for a stop (goes at its time), skipped (told, never silent)", () => {
  const ready = readyRunNotice("Win-back", 4);
  // The title the bell's close and Today's away card find a waiting run by.
  assert.equal(ready.subject, "Campaign “Win-back” is ready: 4 people");
  assert.ok(ready.body.endsWith(`${waitEndsWords("batch_ask")}.`), ready.body);
  assert.equal(readyRunNotice("Win-back", 1).subject, "Campaign “Win-back” is ready: 1 person");
  const held = vetoRunNotice("Win-back", 2, "today 10:30 AM");
  assert.equal(held.subject, "Campaign “Win-back” sends today 10:30 AM: 2 people");
  assert.ok(held.body.includes(waitEndsWords("batch_hold", "today 10:30 AM")), held.body);
  const skipped = skippedRunNotice("Win-back", 3);
  assert.equal(skipped.subject, "“Win-back” didn’t go: nobody approved it");
  assert.match(skipped.body, /^3 people waited for your OK until the day ended, and nothing was sent\./);
  // Today's row for the waiting run says its wait by the same rule: a customer batch's ends with its day, a reach-out's
  // and a one-off's do not.
  const row = { state: "pending_approval", recipient_count: 4, when: "today", counts: { sent: 0, replied: 0 } };
  assert.equal(
    todayRunWords({ ...row, playbook_id: "p1" }).waiting.sentence,
    `4 people. ${waitEndsWords("batch_ask")}.`,
  );
  assert.equal(
    todayRunWords({ ...row, playbook_id: null }).waiting.sentence,
    `4 people. ${waitEndsWords("leads_batch")}.`,
  );
  assert.equal(
    todayRunWords({ ...row, playbook_id: "p2", audience: { kind: "reach_out" } }).waiting.sentence,
    `4 businesses. ${waitEndsWords("leads_batch")}.`,
  );
});

test("a reply waiting to go in the owner's name is told once, on the bell and the phone and never by mail, with when it goes and why it waits", () => {
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("reply_held"));
  assert.ok(PUSH_KINDS.includes("reply_held"), "the phone is where a wait of minutes is seen");
  assert.equal(emailsNotificationKind("reply_held"), false, "never a mail for a wait of minutes");
  const topic = ALERT_TOPICS.find((t) => t.kinds.includes("reply_held"));
  assert.deepEqual([topic.group, topic.email, topic.phone], ["needs_you", null, true]);
  const told = heldReplyNotice({
    who: "Ana Reyes",
    reply: "Yes, 11 works. See you Saturday!",
    at: "at 2:05 PM",
    unsure: false,
  });
  assert.equal(told.subject, "Reply to Ana Reyes goes at 2:05 PM");
  assert.equal(
    told.body,
    "Your hold for replies is on: “Yes, 11 works. See you Saturday!”. Goes at 2:05 PM unless you stop it, from the Inbox.",
  );
  const unsure = heldReplyNotice({ who: "Ana Reyes", reply: "x ".repeat(200), at: "at 2:05 PM", unsure: true });
  assert.match(unsure.body, /^The receptionist was not sure of its reply: “/);
  assert.ok(unsure.body.length < 260, "the reply is quoted short enough for a lock screen");
});

test("a held reply's row waits while its thread has a reply counting down, settles once none does, and a thread not read settles nothing; the server closes it too", () => {
  assert.deepEqual(NOTICE_ENDS.reply_held, { ends: "send", server: "reply_gone" });
  const kept = {
    id: "eeeeeeee-0000-4000-8000-000000000001",
    kind: "reply_held",
    title: "Reply to Ana Reyes goes at 2:05 PM",
    body: "x",
    route: "inbox/th-c1",
    subject_type: "conversation",
    subject_id: "c1",
    created_at: iso(NOW - MIN),
    read: false,
    dismissed: false,
  };
  const row = serverNotificationRows({ notifications: [kept], seen_at: null })[0];
  const sends = (counting, readAt = NOW) => ({ ...NOTHING_WAITS_KNOWN, sends: { readAt, held: new Map(counting) } });
  assert.equal(noticeStillWaits(row, sends([["c1", true]])), true, "still counting down");
  assert.equal(noticeStillWaits(row, sends([["c1", false]])), false, "gone, or stopped");
  assert.equal(noticeStillWaits(row, sends([["c2", true]])), null, "a thread the Inbox did not hold settles nothing");
  assert.equal(noticeStillWaits(row, sends([["c1", false]], NOW - 2 * MIN)), null, "a read from before the row");
  assert.equal(noticeStillWaits(row, NOTHING_WAITS_KNOWN), null, "no read at all");
});

/** A run as the page holds it, for Going today. */
const run = (id, over = {}) => ({
  id,
  state: "scheduled",
  scheduled_for: iso(NOW + 30 * MIN),
  playbook_id: "p1",
  recipient_count: 4,
  title: "Win-back",
  audience: { label: "Win-back" },
  ...over,
});
const going = (runs, replies = []) => goingTodayOf({ runs, replies, tz: TZ, nowMs: NOW });

test("Going today: every run set to start later today and every reply counting down, soonest first, each with when it goes and how its wait ends", () => {
  const rows = going(
    [
      run("b-batch"),
      run("b-once", {
        playbook_id: null,
        title: "Saturday hours",
        scheduled_for: iso(NOW + 10 * MIN),
        recipient_count: 1,
      }),
      run("b-leads", { audience: { kind: "reach_out" }, title: "Movers", scheduled_for: iso(NOW + 3 * HOUR) }),
    ],
    [{ conversationId: "c1", who: "Ana Reyes", endsAtMs: NOW + 2 * MIN, messageId: "m1", draft: "Yes, 11 works." }],
  );
  assert.deepEqual(
    rows.map((r) => [r.kind, r.name]),
    [
      ["reply", "Ana Reyes"],
      ["one_off", "Saturday hours"],
      ["batch", "Win-back"],
      ["batch", "Movers"],
    ],
  );
  const at = (ms) => `at ${clockTime(ms, TZ)}`;
  assert.deepEqual(rows[0], {
    key: "reply-m1",
    kind: "reply",
    name: "Ana Reyes",
    meta: `Reply · goes ${at(NOW + 2 * MIN)}`,
    sentence: `“Yes, 11 works.” ${waitEndsWords("reply", at(NOW + 2 * MIN))}.`,
    atMs: NOW + 2 * MIN,
    stop: { kind: "reply", messageId: "m1", conversationId: "c1" },
    to: "inbox/th-c1",
  });
  assert.equal(rows[1].sentence, `1 person. ${waitEndsWords("one_off", at(NOW + 10 * MIN))}.`);
  assert.equal(rows[1].meta, `Sent once · goes ${at(NOW + 10 * MIN)}`);
  assert.equal(rows[2].sentence, `4 people. ${waitEndsWords("batch_hold", at(NOW + 30 * MIN))}.`);
  assert.deepEqual(
    [rows[2].stop, rows[2].to],
    [{ kind: "run", id: "b-batch" }, "campaigns/sequences/b-batch/runs/b-batch"],
  );
  assert.match(rows[3].sentence, /^4 businesses\. Goes at /);
  assert.match(rows[3].meta, /^Reach-out · goes at /);
});

test("Going today leaves out what is not today's to stop: a run sending, waiting for an OK or done, one set for a later day, a reply already gone; a run within the hour across midnight is today's", () => {
  assert.deepEqual(
    going([
      run("sending", { state: "sending" }),
      run("waiting", { state: "pending_approval" }),
      run("past", { scheduled_for: iso(NOW - MIN) }),
      run("tomorrow", { scheduled_for: iso(NOW + 20 * HOUR) }),
      run("no-time", { scheduled_for: null }),
    ]),
    [],
  );
  assert.deepEqual(
    going([], [{ conversationId: "c1", who: "Ana", endsAtMs: NOW - 1, messageId: "m1", draft: "x" }]),
    [],
  );
  // 11:50 PM in New York: a batch at 12:20 AM is tomorrow's day, and goes within the hour.
  const late = Date.parse("2026-10-20T03:50:00Z");
  const rows = goingTodayOf({
    runs: [
      run("after-midnight", { scheduled_for: iso(late + 30 * MIN) }),
      run("morning", { scheduled_for: iso(late + 9 * HOUR) }),
    ],
    replies: [],
    tz: TZ,
    nowMs: late,
  });
  assert.deepEqual(
    rows.map((r) => r.key),
    ["run-after-midnight"],
  );
});

test("the band's head says what each row does, and how many it did not draw", () => {
  assert.equal(GOING_TODAY_WORDS.title, "Going today");
  assert.equal(GOING_TODAY_WORDS.sub(1, 1), "Goes on its own unless you stop it");
  assert.equal(GOING_TODAY_WORDS.sub(6, 4), "Each goes on its own unless you stop it · 2 more in Sent and the Inbox");
  assert.equal(GOING_TODAY_WORDS.stop, "Stop");
});

test("a message sent once, pressed for now, goes ten minutes on with a Stop: every receipt says when it goes and that it can be stopped (decision 0064, step 3)", async () => {
  const { SEND_ONCE_STOP_MS, SEND_ONCE_STOP_WORDS, PROPOSAL_SPECS, whenItGoes } = await import("@chanlytics/contracts");
  assert.equal(SEND_ONCE_STOP_MS, 10 * MIN);
  assert.equal(SEND_ONCE_STOP_WORDS, "10 minutes");
  const when = (ms) => `today ${clockTime(ms, TZ)}`;
  const goesAt = NOW + SEND_ONCE_STOP_MS;
  assert.equal(
    whenItGoes({ scheduled_for: iso(goesAt), moved_from: null, pressed_now: true }, when, NOW),
    `goes today ${clockTime(goesAt, TZ)} unless you stop it`,
  );
  // Set for a time ahead, it says it is scheduled, as it did; moved out of the hours, it says so.
  assert.equal(
    whenItGoes({ scheduled_for: iso(NOW + 2 * HOUR), moved_from: null, pressed_now: false }, when, NOW),
    `scheduled for today ${clockTime(NOW + 2 * HOUR, TZ)}`,
  );
  assert.match(
    whenItGoes({ scheduled_for: iso(NOW + 15 * HOUR), moved_from: iso(goesAt), pressed_now: true }, when, NOW),
    /^scheduled for .* — messages go out /,
  );
  // Ask's card says it too, and its Undo is that Stop.
  const card = { payload: { name: "Saturday hours", count: 3 } };
  const said = PROPOSAL_SPECS.broadcast.receipt(card, {
    name: "Saturday hours",
    recipient_count: 3,
    left_out: 0,
    scheduled_ahead: false,
    pressed_now: true,
  });
  assert.equal(said, "Broadcast “Saturday hours” — 3 people, goes in 10 minutes unless you stop it");
});

test("each sequence shows its evidence: what its batches did over 90 days, said once, summed under its class's Autonomy row, and never a suggestion (decision 0064, step 5)", async () => {
  const { evidenceWords, evidenceOf, classEvidenceLine } = await import("@chanlytics/contracts");
  // The Campaigns lens's words are its module's own (not the package's surface).
  const { approvalSkippedLine, approvalLine } = await importSrc(
    "packages/contracts/src/reports/campaigns/campaign-words.ts",
  );
  assert.equal(
    evidenceWords({ went: 12, approved: 11, stopped: 1, skipped: 2 }),
    "Last 90 days: 12 batches went: 11 after your OK, 1 on its own · you stopped 1 · 2 skipped: nobody answered in time",
  );
  assert.equal(
    evidenceWords({ went: 3, approved: 3, stopped: 0, skipped: 0 }),
    "Last 90 days: 3 batches went, each after your OK",
  );
  assert.equal(
    evidenceWords({ went: 1, approved: 0, stopped: 0, skipped: 0 }),
    "Last 90 days: 1 batch went on its own",
  );
  assert.equal(evidenceWords({ went: 0, approved: 0, stopped: 0, skipped: 0 }), "No batch in the last 90 days");
  assert.equal(evidenceWords(null), null, "unread: unsaid");
  const rows = [
    { sequence_id: "s1", policy_class: "reengage", went: 4, approved: 4, stopped: 0, skipped: 1 },
    { sequence_id: "s2", policy_class: "reengage", went: 2, approved: 0, stopped: 1, skipped: 0 },
    { sequence_id: "s3", policy_class: "campaign", went: 1, approved: 1, stopped: 0, skipped: 0 },
  ];
  assert.deepEqual(evidenceOf(rows, "s2"), rows[1]);
  assert.deepEqual(evidenceOf(rows, "s9"), { went: 0, approved: 0, stopped: 0, skipped: 0 }, "no batch is zeros");
  assert.equal(evidenceOf(null, "s1"), null);
  assert.equal(
    classEvidenceLine(rows, "reengage"),
    "2 sequences · Last 90 days: 6 batches went: 4 after your OK, 2 on their own · you stopped 1 · 1 skipped: nobody answered in time",
  );
  assert.equal(classEvidenceLine(rows, "follow_up"), null, "a class with no sequence says nothing");
  assert.ok(!/should|could|let it|move it|switch/i.test(classEvidenceLine(rows, "reengage")), "evidence, never advice");
  // Reports' wait for your OK says the runs skipped unanswered beside it.
  assert.equal(approvalSkippedLine(2), "2 runs were skipped: nobody answered before their day ended.");
  assert.equal(
    approvalLine(6, 3600, 1),
    "The middle wait for your OK was 1h, over 6 runs you approved. 1 run was skipped: nobody answered before its day ended.",
  );
});

test("a review's reply waits like everything else: held for an OK, or posted after its wait unless stopped, its bell saying which (decision 0064, step 6)", async () => {
  const { REVIEW_HOLD_MS, heldReviewReplyOf, reviewDraftsBell, reviewHeldReplyWords, reviewReplyModeOf } =
    await import("@chanlytics/contracts");
  assert.equal(REVIEW_HOLD_MS, 30 * MIN);
  assert.equal(reviewReplyModeOf([{ class: "reviews", mode: "veto" }]), "veto");
  const at = iso(NOW + 30 * MIN);
  assert.equal(reviewHeldReplyWords(at, TZ), `Goes after ${clockTime(NOW + 30 * MIN, TZ)} unless you stop it.`);
  assert.equal(reviewHeldReplyWords(null, TZ), `${waitEndsWords("review_ask")}.`);
  // Under its review: its words for the composer and its line; none once a reply is posted, or with no draft.
  assert.deepEqual(heldReviewReplyOf({ reply_text: null, draft_text: " Thank you, Rosa. ", posts_at: at }, TZ), {
    text: "Thank you, Rosa.",
    words: reviewHeldReplyWords(at, TZ),
    posts: true,
  });
  assert.equal(heldReviewReplyOf({ reply_text: null, draft_text: "Thanks!", posts_at: null }, TZ).posts, false);
  assert.equal(heldReviewReplyOf({ reply_text: "Thanks!", draft_text: "Thanks!", posts_at: at }, TZ), null);
  assert.equal(heldReviewReplyOf({ reply_text: null, draft_text: null }, TZ), null);
  // Its Stop is the verbs' one door's (contracts reviewReplyStopSpec): the route, and a receipt for a stop and for none.
  const { PROPOSAL_SPECS } = await import("@chanlytics/contracts");
  const stop = PROPOSAL_SPECS.review_reply_stop;
  assert.deepEqual(stop.commit({ payload: { review_id: "rv1" } }), {
    route: "POST google/reviews/[id]/stop",
    params: { id: "rv1" },
    body: {},
  });
  assert.equal(
    stop.receipt({ payload: {} }, { held: true }),
    "Stopped. The reply waits for your OK, under the review.",
  );
  assert.match(stop.receipt({ payload: {} }, { held: false }), /^Nothing to stop: /);
  assert.deepEqual(reviewDraftsBell([{ author: "Rosa", text: "Thank you, Rosa.", posts_at: at }], TZ), {
    title: `A reply to Rosa's review posts after ${clockTime(NOW + 30 * MIN, TZ)}`,
    body: `Thank you, Rosa. Goes after ${clockTime(NOW + 30 * MIN, TZ)} unless you stop it.`,
  });
  assert.equal(
    reviewDraftsBell([{ author: null, text: "Thanks!", posts_at: null }], TZ).title,
    "A reply to a review waits for your OK",
  );
  assert.equal(
    reviewDraftsBell(
      [
        { author: "A", text: "x", posts_at: at },
        { author: "B", text: "y", posts_at: null },
      ],
      TZ,
    ).title,
    "2 replies to reviews post unless you stop them",
  );
  assert.equal(reviewDraftsBell([], TZ), null);
});
