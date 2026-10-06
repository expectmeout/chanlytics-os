/**
 * How fast the receptionist replied, said against the hold the owner set (spec D14, deferred from phase A): where most of the day's
 * replies waited a hold, Today says they went out as it ended (or later than it) by the one rule Reports reads (report-speed.ts
 * `holdOf`, whose slack no sentence here writes); else the median, as it did. The same words in the day's four sentences: the
 * answered figure's clause, the recap's line, Ask's fact and the calm headline's detail.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { holdOf, replyHoldDtoOf, toTodayVM } from "@chanlytics/contracts";

const NOW = new Date("2026-08-27T15:00:00Z"); // 11:00 America/New_York
/** A day of four messages the receptionist answered, its median 62 seconds, and the hold summary the server adds (or none). */
const metrics = (hold, period = {}) => ({
  workspace: { name: "Harbor Studio", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+15550100188" }],
  window: {
    days: 1,
    since: "2026-08-27T04:00:00+00:00",
    since_local: "2026-08-27T00:00:00",
    now_local: "2026-08-27T11:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 4,
    messages_out_ai: 4,
    messages_out_you: 0,
    conversations_active: 4,
    answered_by_ai: 4,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 62,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 0,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
    ...period,
  },
  ...(hold === undefined ? {} : { reply_hold: hold }),
});
/** The four sentences about speed, as the day says them. */
const said = (m) => {
  const vm = toTodayVM(m, [], [], [], NOW);
  return {
    clause: vm.figures.find((f) => f.id === "answered").meta,
    line: vm.recap.line,
    fact: vm.recap.facts.find((f) => f.label === "Typical reply time").value,
    detail: vm.standing.detail,
  };
};
/** The summary the server makes (server/metrics/metrics.ts) of replies that each waited the owner's minute, taking these seconds: the one rule's. */
const held = (...seconds) => replyHoldDtoOf(holdOf(seconds.map((s) => ({ s, hold: 60 }))));
const MEDIAN = {
  clause: "typically in 1m 2s, none handed over",
  line: "4 messages in, 4 answered by the receptionist, typically in 1m 2s.",
  fact: "1m 2s",
  detail: "It answered 4 of the 4 on its own, typically in about 1m 2s.",
};

test("most replies went out as the hold ended: every sentence says so, and none says a minute", () => {
  assert.deepEqual(said(metrics(held(60, 61, 64, 90))), {
    clause: "typically as your 1-minute hold ended, none handed over",
    line: "4 messages in, 4 answered by the receptionist, typically as your 1-minute hold ended.",
    fact: "as your 1-minute hold ended",
    detail: "It answered 4 of the 4 on its own, typically as your 1-minute hold ended.",
  });
});

test("most replies went out after the hold, not as it ended: later than the hold, in the same four places", () => {
  assert.deepEqual(said(metrics(held(100, 120, 75, 61))), {
    clause: "typically later than your 1-minute hold, none handed over",
    line: "4 messages in, 4 answered by the receptionist, typically later than your 1-minute hold.",
    fact: "later than your 1-minute hold",
    detail: "It answered 4 of the 4 on its own, typically later than your 1-minute hold.",
  });
});

test("the edge of 'as it ended' is the one rule's: a reply a few seconds past its hold went out as it ended, a late one did not", () => {
  const ended = "typically as your 1-minute hold ended, none handed over";
  assert.equal(said(metrics(held(70, 70, 70, 70))).clause, ended, "ten seconds past is the queue's own tick");
  assert.equal(said(metrics(held(71, 71, 71, 71))).clause, "typically later than your 1-minute hold, none handed over");
});

test("a hold few replies waited says nothing of the receptionist's speed: the median, as before", () => {
  const some = [
    { s: 12, hold: 0 },
    { s: 70, hold: 60 },
    { s: 8, hold: 0 },
    { s: 9, hold: 0 },
  ];
  assert.deepEqual(said(metrics(replyHoldDtoOf(holdOf(some)))), MEDIAN);
});

test("no summary sent (an older server, a longer window, a failed read), or none made (no reply waited a hold): what it said before, word for word", () => {
  assert.deepEqual(said(metrics(undefined)), MEDIAN);
  assert.deepEqual(said(metrics(null)), MEDIAN);
  const none = replyHoldDtoOf(
    holdOf([
      { s: 62, hold: 0 },
      { s: 62, hold: 0 },
    ]),
  );
  assert.equal(none, null, "replies sent with no hold make no summary");
  assert.deepEqual(said(metrics(none)), MEDIAN, "and say the median");
});

test("no median, no sentence about speed, whatever was read: the figure's clause drops it, Ask's fact says there is not enough, the detail goes", () => {
  const none = said(metrics(held(60, 61, 64, 90), { median_reply_seconds_ai: null }));
  assert.deepEqual(none, {
    clause: "none handed over",
    line: "4 messages in, 4 answered by the receptionist.",
    fact: "—",
    detail: null,
  });
});
