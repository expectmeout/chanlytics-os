import { POLICY_CLASS_WORDS } from "../config/workspace-config/policy-classes.js";
import { appointmentWords } from "../journey/appointment-word.js";
import { campaignRunsOn, nextRunOf } from "../playbooks/playbook-schedule.js";
import { triggerOf } from "../playbooks/playbook-triggers.js";
import { clockDate, clockTime, clockWhen, wallClockAt, zoneDayKey } from "../shared/clock.js";
import { DAY_MS } from "../shared/time.js";
import { plural } from "../shared/words.js";
import { runWaitsOnYou } from "../waits/waits.js";
export const SEQUENCE_WORDS = {
  title: "Sequences",
  newSequence: "New sequence",
  search: "Search sequences",
  empty: "Nothing sends on its own yet. A sequence starts at a moment, when someone joins a list, or on a date.",
  failed: "The sequences couldn\u2019t be loaded right now",
  filters: { all: "All", needs: "Needs you", off: "Paused or off" },
  groups: {
    needs: "Needs you",
    customers: "Your customers",
    leads: "Leads",
    dates: "Dates",
    off: "Paused or off",
    drafts: "Drafts"
  },
  receptionist: "First contact is your receptionist\u2019s",
  /** Where the receptionist's line opens: Settings › Business, as Campaigns' ledger row did (Ruben, 11 Oct 2026). */
  receptionistRoute: "admin/workspace",
  tabs: { steps: "Steps", people: "People", leads: "Leads", history: "History" },
  addFollowUp: "Add a follow-up",
  approve: "Approve",
  skip: "Skip",
  skipAsk: "Skip this batch?",
  skipDetail: "Nobody in it gets this step from this batch; the sequence goes on with its next one.",
  lookFirst: "Look first",
  pause: "Pause",
  resume: "Turn on",
  start: "Start",
  discard: "Discard",
  notStarted: "Not started \xB7 nothing goes yet",
  change: "Change",
  edit: "Edit",
  you: "You approve",
  /** The record's line of what goes next: "Next tomorrow 10:00 AM · 3 people". */
  next: "Next",
  /** How long a customer's batch waits for an OK: an OK sends it at once, and the sweep skips it once its day is gone. */
  untilTonight: "until tonight",
  /** Who approves its batches, said in the record's More, where it is changed (Autonomy, for its whole class). */
  whoApproves: "Who approves",
  turnOff: "Turn this off",
  /** A phone dock's Turn on: it asks first, so it says so. */
  resumeAsk: "Turn on\u2026",
  review: "Review",
  answer: "Answer"
};
const SEQUENCE_APPROVAL_WORDS = {
  auto: "sends on its own",
  veto: "holds each batch for you to stop",
  ask: "asks you first",
  never: "stays quiet"
};
const isApprovalMode = (mode) => mode !== null && Object.prototype.hasOwnProperty.call(SEQUENCE_APPROVAL_WORDS, mode);
const sequenceApprovalWords = (mode) => isApprovalMode(mode) ? SEQUENCE_APPROVAL_WORDS[mode] : SEQUENCE_APPROVAL_WORDS.ask;
export const SEQUENCE_FLOW_WORDS = {
  starts: "Starts",
  stops: "Stops",
  stopsAlways: "never to anyone who said stop",
  from: "From",
  noMessage: "No message yet",
  sent: "sent",
  replied: "replied",
  last30: "last 30 days",
  takeAway: "Take away",
  hour: "Sends at",
  saveHour: "Save",
  cancel: "Cancel",
  goingNow: "Going now",
  done: "Done",
  writtenEach: "Written for each business",
  call: "A call for you, on Today",
  sendsFrom: "Sends from",
  fromYou: "You, from your own inbox",
  fromMailboxes: "Your connected mailboxes",
  connect: "Connect a mailbox",
  mailboxes: "Mailboxes",
  checked: "Each one is checked before it goes",
  takeAwayAsk: (place) => `Take step ${place} away?`,
  takeAwayDetail: "The steps after it go with it; nobody waiting for it hears more from this sequence.",
  /** New words a step waits on WhatsApp for, or that WhatsApp turned down: said without the message's stored name. */
  newWords: (rejected) => rejected ? "WhatsApp turned down the new words" : "New words in review with WhatsApp",
  /** Under a step whose new words wait or were turned down: what it sends meanwhile. */
  keepsWords: "Keeps sending these words until new ones are approved",
  /** A step whose message the workspace no longer offers (deleted, hidden, or never synced here). */
  messageGone: "Its message isn\u2019t in Messages anymore.",
  pickMessage: "Pick a message",
  /** A one-off that waits for its day, let go of (the run's cancel door), asked first. */
  cancelSend: "Cancel this send\u2026",
  cancelAsk: "Cancel this send?",
  cancelDetail: "Nobody gets it. To send it on another day, make it again.",
  cancelYes: "Cancel the send",
  /** A step after a reminder refused (the door): a reminder is said once, the day before; after the visit is its own moment. */
  noFollowUpOnReminder: "A reminder goes once, the day before. To write to them afterwards, start a sequence that sends after it.",
  sample: "The next one, as it reads",
  addLeads: "Add leads",
  /** When the step's next batch goes, with how many where they are counted: "next 9 tomorrow 9:00 AM". */
  next: (people, when) => people > 0 ? `next ${people} ${when}` : `next ${when}`
};
export function takesFollowUps(row) {
  if (row.starts !== "moment" && row.starts !== "list") return false;
  return row.first?.trigger !== "visit_tomorrow";
}
export function stepApprovalOf(status) {
  if (status === "approved") return { label: "Approved", tone: "ok" };
  if (status === "pending") return { label: "In review", tone: "warn" };
  if (status === "rejected") return { label: "Not approved", tone: "danger" };
  if (status === "paused" || status === "disabled") return { label: "Paused by WhatsApp", tone: "danger" };
  return null;
}
export function leadStepStand(place, sent, now) {
  if (now !== null && place === now) return "now";
  if (now !== null ? place < now : sent > 0) return "done";
  return "later";
}
export const SEQUENCE_GROUPS = ["needs", "customers", "leads", "dates", "off", "drafts"];
export function sequenceTwinOf(rows, row) {
  const trigger = row.first?.trigger ?? null;
  if (row.starts !== "moment" || row.state !== "on" || !trigger || triggerOf(trigger)?.kind !== "visit") return null;
  const made = Date.parse(row.created_at);
  const first = (r) => {
    const at = Date.parse(r.created_at);
    return at < made || at === made && r.id < row.id;
  };
  const twin = rows.find(
    (r) => r.id !== row.id && r.starts === "moment" && r.state === "on" && r.first?.trigger === trigger && first(r)
  );
  return twin ? { id: twin.id, name: twin.name } : null;
}
function twinLineOf(row) {
  const trigger = row.first?.trigger;
  if (trigger === "visit_tomorrow") return "Two reminders go to each person";
  if (trigger === "visited") return "Two thank-yous go to each person";
  return "Two messages go to each person";
}
export const visitTwinWords = (name) => `\u201C${name}\u201D already sends at this moment, so each person would get two. Turn it off first.`;
export function needsCount(n) {
  return n.waiting_people + n.held + n.to_send + n.replies + (n.waiting > 0 && n.waiting_people === 0 ? n.waiting : 0);
}
export function sequenceWaitsNow(row, days) {
  const batches = row.needs.batches.filter(
    (b) => runWaitsOnYou(
      { state: "pending_approval", playbook_id: b.step_id, run_for: b.run_for, audience: b.audience },
      days
    )
  );
  if (batches.length === row.needs.batches.length && batches.length === row.needs.waiting) return row;
  return {
    ...row,
    needs: {
      ...row.needs,
      batches,
      waiting: batches.length,
      waiting_people: batches.reduce((n, b) => n + b.people, 0)
    }
  };
}
const isOff = (row) => row.state === "paused" || row.state === "ended";
export function sequenceGroupOf(row, twin = null) {
  if (row.state === "draft") return "drafts";
  if (needsCount(row.needs) > 0 || twin) return "needs";
  if (row.starts === "date") return "dates";
  if (isOff(row)) return "off";
  if (row.starts === "leads") return "leads";
  return "customers";
}
export function needsWords(n) {
  const parts = [];
  if (n.waiting_people > 0) parts.push(`${n.waiting_people} wait for your OK`);
  else if (n.waiting > 0) parts.push("waits for your OK");
  if (n.held > 0) parts.push(`${n.held} held`);
  if (n.to_send > 0) parts.push(`${n.to_send} for you to send`);
  if (n.replies > 0) parts.push(`${plural(n.replies, "wrote back", "wrote back")} \xB7 answer them`);
  return parts.join(" \xB7 ");
}
export function sequenceStartWords(row, word) {
  const W = appointmentWords(word);
  const f = row.first;
  if (row.starts === "date") return "On a date";
  if (row.starts === "leads") return f?.search_name ? `Leads \xB7 ${f.search_name}` : "Leads";
  if (row.starts === "list") return f?.list_name ? `Joins ${f.list_name}` : "Joins a list";
  switch (f?.trigger) {
    case "visit_tomorrow":
      return `Before ${W.a}`;
    case "visited":
      return `After ${W.a}`;
    case "quiet_30":
    case "lapsed":
      return "Gone quiet";
    case "new_week":
      return "New this week";
    case "phoned_only":
      return "Only ever phoned";
    case "everyone_monthly":
      return "Each month";
    case "proposal_waiting":
      return "Proposal out";
    default:
      return "At a moment";
  }
}
export function sequenceStateWords(row) {
  if (row.starts === "date" && row.date) {
    const DATE = {
      pending_approval: "Waits for you",
      scheduled: "Scheduled",
      sending: "Sending",
      sent: "Sent",
      canceled: "Canceled",
      failed: "Failed"
    };
    return DATE[row.date.state] ?? "Scheduled";
  }
  return SEQUENCE_STATE_WORDS[row.state];
}
export const SEQUENCE_STATE_WORDS = {
  draft: "Draft",
  on: "On",
  paused: "Paused",
  ended: "Ended"
};
export function sequenceStateTone(row) {
  if (row.starts === "date" && row.date?.state === "pending_approval") return "warn";
  if (row.starts === "date" && row.date?.state === "failed") return "danger";
  if (row.state === "on") return "ok";
  return "plain";
}
export function sequenceRowState(row) {
  if (row.starts === "date" && row.date) {
    const DATE = { scheduled: "Scheduled", sending: "Sending", canceled: "Canceled" };
    if (row.date.state === "failed") return { label: "Failed", tone: "danger" };
    const label = DATE[row.date.state];
    return label ? { label, tone: "plain" } : null;
  }
  if (row.state === "paused" || row.state === "ended") return { label: SEQUENCE_STATE_WORDS[row.state], tone: "plain" };
  return null;
}
export function sequenceRowLine(row, tz, nowMs, twin = null) {
  if (row.state === "draft") return SEQUENCE_WORDS.notStarted;
  const needs = needsWords(row.needs);
  if (needs) return needs;
  if (twin) return twinLineOf(row);
  if (row.starts === "date" && row.date) {
    const at = Date.parse(row.date.at);
    if (row.last)
      return `Sent ${clockDate(Date.parse(row.last.at), tz, nowMs)} \xB7 ${row.last.sent} \xB7 ${row.last.replied} replied`;
    return `${clockDate(at, tz, nowMs)} \xB7 ${plural(row.date.people, "person", "people")}`;
  }
  if (row.state === "paused") return row.in_it > 0 ? `${row.in_it} waiting` : "Paused";
  if (row.next) return `next ${clockWhen(Date.parse(row.next.at), tz, nowMs)}`;
  if (row.in_it > 0) return `${row.in_it} in it`;
  if (row.last)
    return `${clockDate(Date.parse(row.last.at), tz, nowMs)} \xB7 ${row.last.sent} sent \xB7 ${row.last.replied} replied`;
  return "Nobody yet";
}
export function sequenceHeadLine(row, word, tz, nowMs) {
  const steps = row.steps <= 1 ? "one message" : `${row.steps} steps`;
  return `${sequenceStartWords(row, word)} \xB7 ${steps} \xB7 since ${clockDate(Date.parse(row.created_at), tz, nowMs)}`;
}
export function sequenceSubLine(row, rec, nowMs) {
  if (row.starts === "date" && row.date) {
    const at = Date.parse(row.date.at);
    const DATE = {
      pending_approval: "waits for your OK",
      scheduled: "goes on its own",
      sending: "going out now",
      sent: `went ${clockDate(row.last ? Date.parse(row.last.at) : at, rec.timezone, nowMs)}`,
      canceled: "canceled",
      failed: "didn\u2019t go"
    };
    return `One message \xB7 ${DATE[row.date.state] ?? "goes on its own"}`;
  }
  if (row.starts === "leads") {
    const from = row.first?.search_name ? `Leads from \u201C${row.first.search_name}\u201D` : "Leads";
    return `${from} \xB7 ${row.first?.owner_sends ? "you send each one" : sequenceApprovalWords(rec.mode)}`;
  }
  return `${sequenceStartWords(row, rec.word)} \xB7 ${sequenceApprovalWords(rec.mode)}`;
}
export function sequenceNextOf(row, lastRunFor, tz, nowMs) {
  if (row.state !== "on" || row.starts === "date") return null;
  if (row.next)
    return { at: Date.parse(row.next.at), people: row.next.people > 0 ? row.next.people : null, soon: false };
  const first = row.first;
  if (lastRunFor === void 0 || !first || row.starts !== "moment" && row.starts !== "list") return null;
  const now = new Date(nowMs);
  if (!campaignRunsOn(first, { tz, now, dealsOn: true })) return null;
  const run = nextRunOf({ run_hour: first.run_hour, last_run_for: lastRunFor }, tz, now);
  const today = zoneDayKey(nowMs, tz);
  const day = run.day === "today" ? today : zoneDayKey(wallClockAt(tz, today, 12, 0) + DAY_MS, tz);
  return { at: wallClockAt(tz, day, run.hour, 0), people: null, soon: run.soon };
}
export function sequenceNextWords(next, tz, nowMs) {
  const when = next.soon ? "within the hour" : clockWhen(next.at, tz, nowMs);
  return next.people ? `${when} \xB7 ${plural(next.people, "person", "people")}` : when;
}
export function sequencePausedDock(row) {
  if (row.state !== "paused" || row.starts === "date") return null;
  return {
    line: SEQUENCE_STATE_WORDS.paused,
    fact: row.in_it > 0 ? `${plural(row.in_it, "person waits", "people wait")} for it` : null
  };
}
const isPolicyClass = (c) => !!c && Object.prototype.hasOwnProperty.call(POLICY_CLASS_WORDS, c);
export function sequenceWhoApprovesHint(mode, policyClass) {
  const how = sequenceApprovalWords(mode);
  const said = how.charAt(0).toUpperCase() + how.slice(1);
  return isPolicyClass(policyClass) ? `${said} \xB7 ${POLICY_CLASS_WORDS[policyClass].name}` : said;
}
export const sequenceCancels = (row) => row.starts === "date" && row.date?.state === "scheduled";
const noticeOf = (n) => ({
  batchId: null,
  stepId: null,
  ...n
});
export const batchWaitsUntilTonight = (batch) => batch.audience?.kind === "playbook";
function waitingNotice(steps, batch) {
  const people = batch.people;
  const place = steps.length > 1 ? steps.find((s) => s.id === batch.step_id)?.place : void 0;
  const until = batchWaitsUntilTonight(batch) ? ` \xB7 ${SEQUENCE_WORDS.untilTonight}` : "";
  const fact = [place ? `Step ${place}` : null, until ? SEQUENCE_WORDS.untilTonight : null].filter(Boolean).join(" \xB7 ");
  return noticeOf({
    kind: "waiting",
    words: people > 0 ? `${plural(people, "person waits", "people wait")} for your OK${until}` : `The next batch waits for your OK${until}`,
    line: people > 0 ? `${people} wait${people === 1 ? "s" : ""} for your OK` : "The next batch waits for your OK",
    fact: fact || null,
    act: people > 0 ? `${SEQUENCE_WORDS.approve} ${people}` : SEQUENCE_WORDS.approve,
    batchId: batch.id
  });
}
export function sequenceNotice(row, steps, twin = null) {
  const n = row.needs;
  const batch = n.waiting > 0 ? n.batches[0] ?? null : null;
  if (batch) return waitingNotice(steps, batch);
  if (twin)
    return noticeOf({
      kind: "twin",
      words: `${twinLineOf(row)}: \u201C${twin.name}\u201D sends one too`,
      line: twinLineOf(row),
      fact: `\u201C${twin.name}\u201D sends one too`,
      act: SEQUENCE_WORDS.turnOff
    });
  if (n.held > 0)
    return noticeOf({
      kind: "held",
      words: `${plural(n.held, "email is", "emails are")} held by the check`,
      line: `${n.held} held by the check`,
      fact: null,
      act: SEQUENCE_WORDS.review
    });
  if (n.to_send > 0)
    return noticeOf({
      kind: "to_send",
      words: `${plural(n.to_send, "email waits", "emails wait")} for you to send`,
      line: `${n.to_send} for you to send`,
      fact: "From your own inbox",
      act: SEQUENCE_WORDS.review
    });
  if (n.replies > 0)
    return noticeOf({
      kind: "replies",
      words: `${plural(n.replies, "lead wrote back", "leads wrote back")} \xB7 answer them`,
      line: `${n.replies} wrote back`,
      fact: "Answer them in the Inbox",
      act: SEQUENCE_WORDS.answer
    });
  const refused = steps.find((s) => s.next_words?.status === "rejected");
  if (refused)
    return noticeOf({
      kind: "words",
      words: `WhatsApp did not approve step ${refused.place}'s new words${refused.next_words?.rejected_reason ? `: ${refused.next_words.rejected_reason}` : ""}`,
      line: `Step ${refused.place}\u2019s new words turned down`,
      fact: refused.next_words?.rejected_reason ? `WhatsApp: ${refused.next_words.rejected_reason}` : null,
      act: `${SEQUENCE_WORDS.edit} step ${refused.place}`,
      stepId: refused.id
    });
  return null;
}
function dateSentence(date, tz, nowMs) {
  const at = Date.parse(date.at);
  const who = plural(date.people, "person", "people");
  if (date.state === "sent") return `Went ${clockDate(at, tz, nowMs)} \xB7 ${clockTime(at, tz)}, to ${who}`;
  if (date.state === "canceled") return `Canceled \xB7 it was for ${clockWhen(at, tz, nowMs)}`;
  if (date.state === "failed") return `Didn\u2019t go \xB7 ${clockWhen(at, tz, nowMs)}`;
  return `${clockWhen(at, tz, nowMs)}, to ${who}`;
}
export function sequenceStartsSentence(row, word, tz, nowMs) {
  const f = row.first;
  if (row.starts === "date" && row.date) return dateSentence(row.date, tz, nowMs);
  if (row.starts === "leads") return f?.search_name ? `A lead joins ${f.search_name}` : "A lead joins the list";
  if (row.starts === "list") return listStartsSentence(f?.list_name ?? null, f?.run_hour ?? null);
  return momentStartsSentence(f?.trigger ?? null, f?.run_hour ?? null, word);
}
const atHour = (hour) => `, at ${clockTime(Date.UTC(2026, 0, 1, hour), "UTC")}`;
export function listStartsSentence(list, hour) {
  return `Someone joins ${list ?? "the list"}${hour === null ? "" : atHour(hour)}`;
}
export function momentStartsSentence(trigger, hour, word) {
  const W = appointmentWords(word);
  const at = hour === null ? "" : atHour(hour);
  switch (trigger) {
    case "visit_tomorrow":
      return `The day before each ${W.one}${at}`;
    case "visited":
      return `The day after each ${W.one}${at}`;
    case "quiet_30":
      return `When someone has gone quiet for 30 days${at}`;
    case "lapsed":
      return `When someone has had no ${W.one} in 45 days, and nothing booked${at}`;
    case "new_week":
      return `When someone first gets in touch this week${at}`;
    case "phoned_only":
      return `When someone has only ever phoned${at}`;
    case "everyone_monthly":
      return `Once a month, to everyone who said yes${at}`;
    case "proposal_waiting":
      return `When a proposal waits with nothing back${at}`;
    default:
      return `At its moment${at}`;
  }
}
export function sequenceWaitWords(step) {
  const days = step.after_days ?? 0;
  const lead = step.kind === "reach_out";
  const when = `${plural(days, "day", "days")} later`;
  const noBooking = step.only_if.includes("no_booking");
  const noReply = step.only_if.includes("no_reply") || lead;
  const unless = noBooking && noReply ? ", if they haven\u2019t booked or written back" : noBooking ? ", if they haven\u2019t booked" : noReply ? ", if they haven\u2019t written back" : "";
  return `${when}${unless}`;
}
export function sequenceChannelsWords(channels) {
  const WORD = { whatsapp: "WhatsApp", sms: "text", email: "email" };
  const named = channels.map((c) => WORD[c] ?? c);
  if (named.length <= 1) return named[0] ?? "";
  return `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}, one each`;
}
export function sequenceStopsSentence(row, steps) {
  if (row.starts === "leads") return "A reply, a booking, a no, a bounce or a stop";
  return stepsStopSentence(steps);
}
export function stepsStopSentence(steps) {
  const asks = new Set(steps.flatMap((s) => s.only_if));
  if (steps.length <= 1) return "After this one message";
  if (asks.has("no_booking") && asks.has("no_reply")) return "When they book or write back, or after the last step";
  if (asks.has("no_booking")) return "When they book, or after the last step";
  if (asks.has("no_reply")) return "When they write back, or after the last step";
  return `After step ${steps.length}`;
}
export const PEOPLE_GROUP_WORDS = {
  waiting: "Wait for your OK",
  held: "Held by the check",
  to_send: "For you to send",
  next: "Up next",
  in: "In it",
  done: "Done",
  left: "Left"
};
export function sequenceLeftWords(why) {
  const WHY = {
    booked: "booked",
    replied: "wrote back",
    removed: "taken out",
    started_again: "started again",
    gone: "no longer in People",
    no_yes: "never said yes",
    no_number: "no number",
    stopped: "asked to stop",
    unsubscribed: "unsubscribed",
    no_address: "no address",
    address_stopped: "address stopped",
    no_channel: "no way to reach them",
    outreach_wrote_back: "wrote back",
    said_no: "said no",
    owner_stopped: "you stopped writing",
    owner_skipped: "you skipped it",
    run_canceled: "its day was canceled",
    owner_took_back: "taken back",
    step_removed: "the step was removed",
    kept_waiting: "kept waiting too long",
    stale: "kept waiting too long",
    bounced: "bounced"
  };
  return why ? WHY[why] ?? why.replace(/_/g, " ") : "";
}
export const peopleTabWord = (row) => row.starts === "leads" ? SEQUENCE_WORDS.tabs.leads : SEQUENCE_WORDS.tabs.people;
