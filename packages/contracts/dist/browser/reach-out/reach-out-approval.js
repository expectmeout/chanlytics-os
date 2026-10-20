import { clockNear, clockWhen } from "../shared/clock.js";
import { HELD_REASONS } from "../broadcasts/run-words.js";
import { plural } from "../shared/words.js";
import { runDraftedEmails, runHeldEmails } from "../waits/waits.js";
import { RUN_OPEN_WORDS, WHO_GETS_IT_WORDS } from "../shell/campaign-rooms.js";
import { composeLinksOf } from "./owner/compose.js";
import { holdDoors, HOLD_DOOR_WORDS } from "./reach-out-words.js";
import { reachOutRootOf } from "./reach-out-rules.js";
import { approvalWordsOf, stepLabel } from "./reach-out-sheet.js";
import { TO_SEND_ROUTE, runRoute } from "../sequences/sequence-address.js";
export function skippedReasonWords(reason) {
  switch (reason) {
    case "closed_every_day":
      return "keep no open hour all week";
    case "missing_value":
      return "missing a value your words name";
    case "owner_skipped":
      return "skipped by you";
    case "owner_stopped":
    case "outreach_stopped":
      return "you stopped writing to them";
    case "not_a_fit":
      return "marked Not a fit";
    case "kept_waiting":
      return "waited past fourteen days";
    case "step_removed":
      return "their step was removed";
    case "run_canceled":
      return "the run was stopped";
    case "owner_took_back":
      return "taken back before it was sent";
    case "draft_withdrawn":
      return "were handed to you, then taken back";
    case "erased":
      return "their record was erased";
    case "mailbox_gone":
      return "the mailbox their emails came from was removed";
    case "outreach_country":
      return "are where a cold email may not go without their say";
    // The person door's refusals when its owner said an email went (00429 reach_out_send_said).
    case "lead_closed":
      return "had closed before it went";
    case "already_yours":
      return "are already yours, in People";
    default:
      return HELD_REASONS[reason] ?? "could not be written to";
  }
}
function skippedWordsOf(skipped) {
  return Object.entries(skipped).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, n]) => `${n} skipped \xB7 ${skippedReasonWords(reason)}`);
}
const RUN_WAITING_WORDS_OK = "Waits for your OK";
const STATE_WORDS = {
  pending_approval: RUN_WAITING_WORDS_OK,
  scheduled: "Scheduled",
  sending: "Sending"
};
const STATE_TONES = {
  pending_approval: "warn",
  scheduled: "info",
  sending: "ok"
};
const runStateOf = (state) => state === "scheduled" || state === "sending" ? state : "pending_approval";
export function reachOutRunWordsOf(r, p) {
  const a = approvalWordsOf(r, { timezone: p.timezone, today: p.today, now: p.now, state: runStateOf(p.state) });
  const waiting = p.state === "pending_approval";
  const earlier = !!r.run_for && r.run_for < p.today;
  const checked = r.planned.filter((x) => x.checked);
  const owner = r.owner_sends === true;
  return {
    ...a,
    k: STATE_WORDS[p.state] ?? "To leads",
    kTone: STATE_TONES[p.state] ?? "warn",
    note: waiting ? a.note : null,
    skipped: skippedWordsOf(r.skipped),
    // By day and time; a run from an earlier day, or a time already past, is re-timed when it goes, never a past time.
    list: checked.map((x) => {
      const ms = Date.parse(x.send_at);
      const retimed = earlier || Number.isNaN(ms) || ms <= p.now;
      return {
        id: x.send_id,
        name: x.business_name,
        // Its lead's id, which the name opens over the page; none from a read before the lead was carried.
        leadId: x.lead_id ?? null,
        // An owner's email is handed to them once checked, at any hour (00429), never re-timed to the lead's.
        at: owner ? HANDED : retimed ? RETIMED : clockWhen(ms, p.timezone, p.now),
        // Whether `at` is a time on the clock, which is set in figures; the words that stand for one are not.
        clock: !owner && !retimed
      };
    }),
    skipAsk: `Skip ${r.chain_name}'s run?`,
    // What Approve released, as the flash says it: the checked sends due today, never the run's whole count (R21).
    // Nothing today (planned after hours, or on a closed day) says when they go instead of "0 emails today".
    approved: owner ? `${r.chain_name} approved \u2014 ${plural(r.today + r.later, "email", "emails")} to send from your inbox, handed to you as each is checked` : r.today === 0 && r.later > 0 ? `${r.chain_name} approved \u2014 ${plural(r.later, "email", "emails")} in the coming days, in their hours` : `${r.chain_name} approved \u2014 ${plural(r.today, "email", "emails")} today, in their hours`,
    labels: REACH_OUT_RUN_LABELS,
    // Folded under its own head (WHO_GETS_IT_WORDS), its press at the head's right; what is still being checked said
    // inside it, under the names; none while nothing is checked.
    listHead: WHO_GETS_IT_WORDS.head,
    listCount: checked.length,
    listNote: r.checking > 0 ? `${plural(r.checking, "more is", "more are")} being checked; ${r.checking === 1 ? "it goes once it passes" : "they go once they pass"}` : null
  };
}
const RETIMED = "from now";
const HANDED = "handed to you once checked";
export function toSendWordsOf(r, p) {
  const drafted = r.drafted ?? [];
  if (drafted.length === 0) return null;
  return {
    head: `To send \xB7 ${drafted.length}`,
    /** The caption over the list, its count at its right (the run-to-leads canvas). */
    title: REACH_OUT_RUN_LABELS.toSend,
    count: drafted.length,
    note: REACH_OUT_TO_SEND_LABELS.note,
    rows: drafted.map((d) => toSendRowOf(d, p)),
    labels: REACH_OUT_TO_SEND_LABELS
  };
}
export function toSendRowOf(d, p) {
  return {
    id: d.send_id,
    leadId: d.lead_id,
    followUp: d.follow_up === true,
    name: d.business_name,
    angle: d.angle,
    address: d.to,
    subject: d.subject,
    text: d.text,
    since: `handed to you ${clockNear(Date.parse(d.drafted_at), p.timezone, p.now)}`,
    links: composeLinksOf({ to: d.to, subject: d.subject, text: d.text })
  };
}
const SENT_SINCE_WORDS = {
  lead_gone: "Their lead is gone, so nothing more is written to them.",
  erased: "Their record was erased, so nothing more is written to them.",
  lead_closed: "They had closed before it went, so nothing more is written to them.",
  outreach_suppressed: "Their address is on the never-again list, so nothing more is written to them.",
  outreach_stopped: "You had stopped writing to them, so nothing more is written to them.",
  already_yours: "They are already yours, in People.",
  no_address: "Their address is gone, so nothing more is written to them."
};
export const REACH_OUT_TO_SEND_LABELS = {
  /**
   * How a run's list is worked, in a line (the run-to-leads canvas); what Skip does is the run's foot's (approvalWordsOf),
   * and the whole To send's note says both (TO_SEND_ALL_WORDS).
   */
  note: "Open each in your mail app, send it there, then say Sent.",
  gmail: "Open in Gmail",
  outlook: "Open in Outlook",
  app: "Your mail app",
  copy: "Copy",
  copied: "Copied",
  /** A link too long to carry the words: they are copied as it opens. */
  pasteNote: "The words are copied: paste them in.",
  sent: "Sent",
  skip: "Skip",
  saying: "Saying so\u2026",
  /** What a role that may not is told it cannot do here (gateTitle). */
  gated: "say whether an email went",
  read: "Read it",
  hide: "Hide it",
  /** The row's More, which holds Gmail, Outlook, Copy and its words. */
  more: (name) => `More for the email to ${name}`,
  /** Asked once the owner opened or copied one, as the lead's own draft asks (LEAD_SENT_QUESTION). */
  asked: "Did it go?",
  /** A step after the first, asked at its Sent: the business may have answered the email before in the owner's inbox. */
  noReply: "No reply from them yet?",
  noReplyYes: "No reply: it went",
  sentDone: (name) => `${name}: sent from your inbox`,
  /** Sent, and recorded, though its lead would be refused now (reach_out_send_said's since). */
  sentSince: (name, since) => `${name}: sent from your inbox. ${SENT_SINCE_WORDS[since] ?? "Nothing more is written to them."}`,
  skippedDone: (name) => `${name}: left out. Nothing more is written to them.`,
  /** Left out by the clock or a reply before the owner said a word: why, in the skip's own words. */
  leftOut: (name, why) => `${name} was left out already: they ${why}.`,
  /** Another member, or another tab, said first. */
  already: (state) => state === "sent" ? "Already said: it went." : "Already said: it was left out."
};
export const TO_SEND_ALL_WORDS = {
  title: "To send",
  /** Today's row and the door to it: what it opens. */
  door: "Open To send",
  /** Its row's act: To send opens as a sheet over the page, as a run's row opens its run (Ruben, 20 Oct 2026). */
  open: "Open",
  meta: "Cold email \xB7 to send",
  status: "Handed to you",
  /** "12 emails handed to you, from 3 sequences"; one sequence (its first email and its nudge) says none. */
  sub: (n, from) => `${plural(n, "email", "emails")} handed to you${from > 1 ? `, from ${from} sequences` : ""}`,
  /** Today's one row for them: what waits, and from how many sequences to leads where more than one. */
  sentence: (n, from) => `${plural(n, "email", "emails")} to send from your inbox${from > 1 ? `, from ${from} sequences` : ""}, each written and checked.`,
  /** Today's brief for them, as one run's line: "Your cold emails are waiting for you: …". */
  brief: (from) => from > 1 ? { label: "Your cold emails", verb: "are", waits: "waiting for you" } : { label: "Your cold email", verb: "is", waits: "waiting for you" },
  /**
   * How the list is worked, and what Skip does: the owner's word that it did not go counts as the business's first email
   * (00427's one-first rule; 0059's Risks), so neither this reach-out nor another writes to them after it.
   */
  note: `${REACH_OUT_TO_SEND_LABELS.note} Skip leaves that business out.`,
  /**
   * A run's part of the list: its reach-out, which of its emails (a first email and its nudge are two parts of one
   * reach-out), and how many wait. The step is null until the run's detail is read.
   */
  runHead: (name, step, n) => step === null ? `${name} \xB7 ${n}` : `${name} \xB7 ${step === 0 ? "first email" : stepLabel(step).toLowerCase()} \xB7 ${n}`,
  openRun: RUN_OPEN_WORDS,
  /** A run's own To send, where other runs hand emails over too: the door to all of them. */
  everyRun: (n, from) => `All ${n} to send${from > 1 ? `, from ${from} sequences` : ""}`,
  reading: "Reading its emails\u2026",
  unread: "Its emails could not be read just now. Open the run to see them.",
  /** Every email handed over is said: what the pane says once its list is empty. */
  none: "Nothing left to send: every email handed to you is said.",
  /** What a role that may not is told it cannot do here (gateTitle): the run's own list's words. */
  gated: REACH_OUT_TO_SEND_LABELS.gated
};
export function toSendAllOf(runs) {
  const waiting = runs.filter((r) => runDraftedEmails(r) > 0).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for) || a.id.localeCompare(b.id));
  if (waiting.length === 0) return null;
  return {
    runs: waiting,
    count: waiting.reduce((n, r) => n + runDraftedEmails(r), 0),
    // A reach-out's runs are its steps' (a first email, a nudge): counted as the one reach-out they are.
    from: new Set(waiting.map((r) => reachOutRootOf(r.audience) ?? r.id)).size
  };
}
export function toSendRunsOf(waiting) {
  const folded = waiting.filter((r) => runHeldEmails(r) === 0 && runDraftedEmails(r) > 0);
  const all = toSendAllOf(waiting);
  return all && folded.length > 1 ? { runs: folded, count: all.count, from: all.from } : null;
}
export function toSendEveryOf(runs) {
  const all = toSendAllOf(runs);
  return all && all.runs.length > 1 ? { count: all.count, from: all.from } : null;
}
export function waitingRunsDoor(waiting) {
  const [only] = waiting;
  if (waiting.length === 1 && only) return runRoute(only.id, only.sequence_id);
  const toSend = toSendRunsOf(waiting);
  return toSend && toSend.runs.length === waiting.length ? TO_SEND_ROUTE : NEEDS_YOU_ROUTE;
}
const NEEDS_YOU_ROUTE = "inbox";
const REACH_OUT_RUN_LABELS = {
  back: "Back to Sequences",
  approving: "Approving\u2026",
  skip: "Skip this run",
  skipYes: "Yes, skip it",
  /** Skip's question's No: the run stays, waiting. */
  keep: "Keep it",
  seeHeld: "See them",
  hideHeld: "Hide them",
  /** The caption over a run its owner sends' emails: the count goes at its right. */
  toSend: "To send",
  /** The heads over the email card and what was checked, and what a desk's head says the run is. */
  email: "The email",
  checked: "Checked before it goes",
  toLeads: "To leads",
  deciding: "Saying so\u2026",
  rechecking: "Checking again\u2026",
  gated: "decide a held email or approve a run"
};
export const REACH_OUT_RUN_REREAD_MS = 15e3;
export function reachOutRunMoving(r) {
  return r.checking > 0 || r.owner_sends === true && r.today + r.later > 0;
}
export function toSendSaidWords(name, a) {
  if (!a.said && a.state === "skipped" && a.reason && a.reason !== "owner_skipped")
    return REACH_OUT_TO_SEND_LABELS.leftOut(name, skippedReasonWords(a.reason));
  if (!a.said) return REACH_OUT_TO_SEND_LABELS.already(a.state);
  if (a.state !== "sent") return REACH_OUT_TO_SEND_LABELS.skippedDone(name);
  if (!a.since) return REACH_OUT_TO_SEND_LABELS.sentDone(name);
  const said = REACH_OUT_TO_SEND_LABELS.sentSince(name, a.since);
  return a.since === "already_yours" && a.on_thread ? `${said} It is on their thread.` : said;
}
export function heldNoticeWords(p) {
  const doors = [...new Set(p.reasons.flatMap(holdDoors))].map((d) => HOLD_DOOR_WORDS[d].toLowerCase());
  const say = doors.length > 1 ? `${doors.slice(0, -1).join(", ")} or ${doors[doors.length - 1]}` : doors[0] ?? "";
  return {
    subject: `The check held ${plural(p.held, "email", "emails")} in ${p.name}`,
    body: `${p.held === 1 ? "It waits" : "They wait"} for your say on its run${say ? `: ${say}` : ""}. The rest of the run goes as planned.`
  };
}
