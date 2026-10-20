import { toSendRowOf } from "../reach-out/reach-out-approval.js";
import { HELD_TAKE_OUT, heldAnswersOf, heldWhyOf } from "./sequence-held.js";
import { isReachOutHold } from "../reach-out/reach-out-words.js";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../reach-out/reach-out-replies.js";
import { REPORT_MIN_N } from "../reports/report-tiles.js";
import { addressOf } from "../activity/record-address.js";
import { clockHistoryDay, clockTime, clockWhen, zoneDayKey } from "../shared/clock.js";
import { pct } from "../shared/numbers.js";
import { RUN_OPEN_WORDS, RUN_WAITING_SHORT } from "../shell/campaign-rooms.js";
import { plural } from "../shared/words.js";
import { DAY_MS } from "../shared/time.js";
export const SEQUENCE_EDIT_WORDS = {
  after: "After the step before",
  days: (n) => n === 1 ? "1 day" : `${n} days`,
  only: "Only",
  /** What must still hold for a step after the first to go, as the editor offers it. */
  holds: {
    always: "Whatever they did since",
    no_booking: "If they haven\u2019t booked",
    no_reply: "If they haven\u2019t written back",
    neither: "If they haven\u2019t booked or written back"
  },
  message: "Message",
  value: (at) => `Value ${at + 1}`,
  cancel: "Cancel",
  save: "Save",
  add: "Add the step",
  previewAs: "As one person reads it",
  oneEach: "Each person gets one version, on the channel they are reached on.",
  inMessages: "Change the words in Messages",
  /** The words written where the step is read (the canvas's step editor): the message's own pane, in place of its preview. */
  editHere: "Edit the words here",
  previewBack: "Back to the preview",
  /** Who the preview is read as: the example, or someone of the batch that waits (the canvas's "As Ana Morales"). */
  as: "As",
  example: (name) => `${name}, an example`,
  /** Who gets which: "Ana gets it on WhatsApp." */
  getsIt: (name, on) => `${name} gets it ${on.charAt(0).toLowerCase()}${on.slice(1)}.`,
  noFirstName: "No first name on file: the message opens \u201CHi there\u201D.",
  savedIn: (title) => `\u201C${title}\u201D, saved in Messages`,
  noMessages: "No message is ready to send yet. Write one in Messages first.",
  /** What a save reaches: a wait counts from each person's next send; new words go once WhatsApp approves them. */
  reaches: (first) => first ? "Your change reaches the next batch" : "Your change reaches everyone who gets the step before from now; anyone already waiting keeps their day",
  whatsAppFirst: "WhatsApp reviews new words first; until it approves them, the step keeps the words approved now"
};
export const SEQUENCE_NEEDS_WORDS = {
  title: "Needs you",
  held: "Held by the check",
  /** Over the held whose hold judged the lead, never the words (LEAD_HOLDS): what may go as written in one press. */
  sendAll: (n) => `Send ${n} as written`,
  sending: "Sending\u2026",
  wentAll: (n) => n === 1 ? "1 email goes as written" : `${n} emails go as written`,
  toSend: "For you to send from your inbox",
  /** Leads who wrote back, answered in the Inbox (its threads that answered the sequence). */
  wroteBack: "Wrote back",
  inbox: "Inbox",
  /** A reply's own door: its thread in the Inbox, where the answer is written. */
  answer: "Answer",
  /** What they wrote, read: "Wrote back · a question". */
  said: (intent) => `Wrote back \xB7 ${intent}`,
  oneByOne: "Send them one by one",
  reading: "Reading what it holds\u2026",
  /** What a failed read could not read: "Couldn't read this batch's emails". */
  failed: "this batch\u2019s emails",
  /** A batch whose emails to send this read carries no draft of: its run's sheet in Sent lays them out. */
  inSent: "Open their run"
};
const LEAD_HOLDS = /* @__PURE__ */ new Set(["chain", "language", "abroad", "customer_domain"]);
export function peopleNeedsOf(rows, at) {
  const held = rows.flatMap((r) => {
    const reason = r.why;
    if (r.group !== "held" || !r.send_id || !isReachOutHold(reason)) return [];
    return [
      {
        id: r.send_id,
        name: r.name ?? SEQUENCE_PEOPLE_WORDS.someone,
        leadId: r.lead_id,
        place: r.place,
        why: heldWhyOf(reason, r.hold_detail),
        reason,
        // Its answers as a run's screen offers them, one rule (contracts heldAnswersOf): Take out at step 1.
        answers: heldAnswersOf({ reason, detail: r.hold_detail }, r.place),
        batchId: r.batch_id
      }
    ];
  });
  const handed = rows.filter((r) => r.group === "to_send" && r.send_id && r.lead_id);
  const toSend = handed.flatMap(
    (r) => r.draft && r.send_id && r.lead_id ? [
      {
        ...toSendRowOf(
          {
            send_id: r.send_id,
            lead_id: r.lead_id,
            business_name: r.name ?? SEQUENCE_PEOPLE_WORDS.someone,
            angle: r.draft.angle,
            to: r.draft.to,
            subject: r.draft.subject,
            text: r.draft.text,
            drafted_at: r.draft.drafted_at,
            follow_up: r.draft.follow_up
          },
          at
        ),
        batchId: r.batch_id
      }
    ] : []
  );
  const unread = [...new Set(handed.filter((r) => !r.draft && r.batch_id).map((r) => r.batch_id ?? ""))];
  const asIs = held.filter((h) => LEAD_HOLDS.has(h.reason) && h.answers.some((a) => a.door === "include"));
  const replied = rows.filter((r) => r.group === "replied");
  const wroteBack = replied.length > 0 || rows.some((r) => r.reply !== void 0) ? replied.map((r) => {
    const intent = r.reply?.intent ?? r.why;
    return {
      key: r.lead_id ?? r.contact_id ?? r.enrollment_id ?? "",
      name: r.name ?? SEQUENCE_PEOPLE_WORDS.someone,
      said: SEQUENCE_NEEDS_WORDS.said(
        isReplyIntent(intent) ? REPLY_INTENT_WORDS[intent] : REPLY_INTENT_WORDS.other
      ),
      summary: r.reply?.summary ?? null,
      answer: r.reply?.conversation_id ? addressOf({ kind: "conversation", id: r.reply.conversation_id }) : null,
      to: r.contact_id ? addressOf({ kind: "person", id: r.contact_id }) : r.lead_id ? addressOf({ kind: "lead", id: r.lead_id }) : null
    };
  }) : null;
  return { held, asIs, toSend, unread, wroteBack };
}
export const SEQUENCE_PEOPLE_WORDS = {
  nobody: "Nobody is in it yet.",
  failed: "who is in it",
  someone: "Someone",
  step: (place) => `step ${place}`,
  takeOut: HELD_TAKE_OUT,
  takeOutAll: (n) => `Take these ${n} out`,
  more: (n) => `and ${n} more`,
  /** A fold of people still to hear from it: when the soonest of them goes. */
  next: (when) => `next ${when}`,
  /** Why someone finished with no reason of their own: they had the last step. */
  lastStep: "had the last step",
  /** A lead added and not planned yet, under its name: when it joined the list. */
  added: "Added",
  addedAt: (at) => `Added ${at}`,
  /** Leads added and not planned yet, by the sequence's state: what the Added fold says beside its count. */
  queued: { draft: "they join when you start it", paused: "they wait until it's on", on: "in its next batch" }
};
export const SEQUENCE_HISTORY_PERIODS = [
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "all", label: "All", days: null }
];
export const SEQUENCE_HISTORY_WORDS = {
  period: "Over",
  inReports: "Reports",
  /** The batch to come, over the days that went: "Next · goes on its own", or waiting for an OK. */
  upcoming: (waits) => waits ? "Next \xB7 waits for your OK" : "Next \xB7 goes on its own",
  dayByDay: "Day by day",
  nothing: "Nothing has gone out yet.",
  nothingIn: "Nothing went out in these days.",
  older: "Older",
  replies: "What came back",
  noReplies: "Nobody has written back to this one yet.",
  everyone: (n) => `All ${n} who got it`,
  openRun: RUN_OPEN_WORDS,
  thread: "Thread",
  waits: RUN_WAITING_SHORT,
  counting: "Counting\u2026",
  step: (place) => `step ${place}`,
  reading: "Reading the day\u2026",
  /** What a failed read could not read: "Couldn't read this day". */
  failed: "this day",
  /** How many days the counted batches went on: "26 days it sent". */
  days: (n) => n === 0 ? "" : `${plural(n, "day")} it sent`,
  /** The door to the Inbox over the same days (sequenceRepliesRoute): "All 41 replies in the Inbox". */
  inInbox: (n) => n === 1 ? "Its reply in the Inbox" : `All ${n} replies in the Inbox`
};
export const SEQUENCE_REPLIES_WORDS = {
  period: { "30": "the last 30 days", "90": "the last 90 days", all: "since it began" },
  line: (name, period, n) => n === 0 ? `Nobody wrote back to ${name} in ${SEQUENCE_REPLIES_WORDS.period[period]}` : `${plural(n, "reply", "replies")} to ${name}, ${SEQUENCE_REPLIES_WORDS.period[period]}`,
  /** Some of them are older than the threads the Inbox holds: "9 of them are here; the rest are older". */
  shown: (here, n) => here === n ? null : `${here} of them are here; the rest are older`,
  reading: "Reading its replies\u2026",
  failed: "its replies",
  leave: "Show every thread"
};
const DEFINITIONS = {
  sent: "Messages that left, one a person a step. Held, skipped and failed sends are not counted.",
  delivered: "Of those sent, the share the channel says reached the person: WhatsApp's and a text's receipts, an email accepted.",
  read: "WhatsApp's own read receipt. Email and text do not say when they are read, so they are not counted here.",
  replied: "People who wrote back in their own words within three days of the message, as Reports counts them."
};
export const batchWent = (b) => b.state === "sent" || b.state === "sending" || b.state === "failed";
export function historySince(period, tz, nowMs) {
  const p = SEQUENCE_HISTORY_PERIODS.find((x) => x.id === period);
  return p && p.days !== null ? zoneDayKey(nowMs - (p.days - 1) * DAY_MS, tz) : null;
}
export function historyIn(batches, since, tz) {
  return since === null ? [...batches] : batches.filter((b) => (b.run_for ?? zoneDayKey(Date.parse(b.at), tz)) >= since);
}
export function historyCovers(h, since, tz) {
  if (!h.more) return true;
  if (since === null) return false;
  const last = h.batches[h.batches.length - 1];
  return !!last && (last.run_for ?? zoneDayKey(Date.parse(last.at), tz)) < since;
}
export function historyFigures(batches) {
  const went = batches.filter(batchWent);
  const sum = (k) => went.reduce((n, b) => n + (b.counts[k] ?? 0), 0);
  const sent = sum("sent");
  const delivered = sum("delivered");
  const read = sum("read");
  const replied = sum("replied");
  const share = (n) => {
    const p = pct(n, sent);
    return p === null ? "\u2014" : `${p}%`;
  };
  return [
    { id: "sent", label: "Sent", value: String(sent), meta: null, definition: DEFINITIONS.sent, n: null, minN: null },
    {
      id: "delivered",
      label: "Delivered",
      value: share(delivered),
      meta: sent > 0 ? `${delivered} of ${sent}` : null,
      definition: DEFINITIONS.delivered,
      n: sent,
      minN: REPORT_MIN_N
    },
    {
      id: "read",
      label: "Read",
      value: String(read),
      meta: "on WhatsApp",
      definition: DEFINITIONS.read,
      n: null,
      minN: null
    },
    {
      id: "replied",
      label: "Replied",
      value: String(replied),
      meta: sent > 0 ? `${share(replied)} of those sent` : null,
      definition: DEFINITIONS.replied,
      n: null,
      minN: null
    }
  ];
}
export function historyStamp(atMs, tz, nowMs) {
  const time = clockTime(atMs, tz);
  if (atMs <= nowMs || zoneDayKey(atMs, tz) === zoneDayKey(nowMs, tz))
    return `${clockHistoryDay(atMs, tz, nowMs)} \xB7 ${time}`;
  const when = clockWhen(atMs, tz, nowMs);
  return when.startsWith("tomorrow ") ? `Tomorrow \xB7 ${time}` : when;
}
export function historyUpcomingWords(people, mode) {
  const goes = mode === "auto" || mode === "veto";
  return { end: people ? plural(people, "person", "people") : "", said: SEQUENCE_HISTORY_WORDS.upcoming(!goes) };
}
export function historyDays(batches, tz) {
  return new Set(batches.filter(batchWent).map((b) => b.run_for ?? zoneDayKey(Date.parse(b.at), tz))).size;
}
export function historyDayWords(b, place) {
  const c = b.counts;
  const forWhom = [b.people > 0 ? plural(b.people, "person", "people") : null, place].filter(Boolean).join(" \xB7 ");
  if (b.state === "pending_approval") return { end: SEQUENCE_HISTORY_WORDS.waits, said: forWhom };
  if (b.state === "scheduled") return { end: "Scheduled", said: forWhom };
  if (b.state === "canceled") return { end: "Canceled", said: [place].filter(Boolean).join(" \xB7 ") || "Nothing went" };
  const parts = [`${c.read ?? 0} read`, (c.replied ?? 0) > 0 ? `${c.replied} replied` : "no replies"];
  if ((c.held ?? 0) > 0) parts.push(`${c.held} held`);
  if ((c.to_send ?? 0) > 0) parts.push(`${c.to_send} for you to send`);
  if ((c.failed ?? 0) > 0) parts.push(`${c.failed} failed`);
  return {
    end: b.state === "sending" ? "Going out" : b.state === "failed" ? "Failed" : `${c.sent ?? 0} sent`,
    said: [place, parts.join(" \xB7 "), b.failure].filter(Boolean).join(" \xB7 ")
  };
}
