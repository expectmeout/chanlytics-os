import { RUN_GOING_STATES } from "../broadcasts/broadcasts.js";
import { NEW_REVIEW_NEWS, reviewNoticeIsAbout } from "../google/google.js";
import { REVIEW_REPLY_HELD_TITLE } from "../google/review-reply.js";
import { parseLeadsRoute } from "../leads/lead-plan.js";
import {
  SERVER_KEY_PREFIX,
  serverNotificationRows,
  settledRow
} from "../today/notifications.js";
import { runWaitsOnYou } from "./waits.js";
export const NOTHING_WAITS_KNOWN = {
  runs: null,
  days: null,
  heldEmails: null,
  reviews: null,
  holds: null,
  sends: null,
  searches: null
};
const heldFor = (source, kept) => source && kept <= source.readAt ? source.held : null;
export const NOTICE_ENDS = {
  handoff: { ends: "hold", server: "hold_resolved" },
  deadman: { ends: "hold", server: "hold_resolved" },
  call: { ends: "hold", server: "hold_resolved" },
  // A run approved, skipped or skipped by the night's sweep, or ended, closes its rows on the server (00461
  // batch_closes_its_notices): a browser that held the run among Sent's alone closed them, and the phone's icon never.
  playbook: { ends: "run", server: "run_decided" },
  booking_notice: { ends: "email" },
  review: { ends: "review" },
  leads_question: { ends: "search", server: "question_settled" },
  // A number's flag, a sending domain held or the offers paused, a payment that did not go through, a message refused:
  // closed by their mend. A number given back, an account restricted, a connection removed are told once.
  number: { ends: "mended" },
  sweep: { ends: "mended" },
  billing: { ends: "mended" },
  template_blocked: { ends: "mended" },
  job_failed: {
    ends: "news",
    why: "A job that did not finish is told once; the next try is its own news, and nothing is left to answer here."
  },
  broadcast_stopped: {
    ends: "news",
    why: "A run that stopped is told once; what is left to do is a new run, made on Sent."
  },
  calendar_people: {
    ends: "news",
    why: "Who is on the calendar is told once; the Calendar keeps the names to look at."
  },
  alert: {
    ends: "news",
    why: "An alert is told once; what it asks is done where its door goes, and nothing here waits."
  },
  template_ready: { ends: "news", why: "A message approved is good news, told once." },
  broadcast_sent: { ends: "news", why: "A run that finished is told once, with what it did." },
  leads_ready: { ends: "news", why: "A search that finished is told once; its places wait in Leads." },
  note_for_you: { ends: "news", why: "A note left for you is read when you open it." },
  reach_out_replied: { ends: "news", why: "A reply is told once per reading; its thread holds the rest." },
  reach_out_day: { ends: "news", why: "The day's reach-out numbers are a line, told once at six." },
  opted_out: { ends: "news", why: "A customer's stop is news, told once; there is nothing to answer." },
  booking: { ends: "news", why: "A booking that arrived is news; the Calendar holds it." },
  member_joined: { ends: "news", why: "A teammate who joined is news, told once." },
  member_left: { ends: "news", why: "A teammate who left is news, told once." },
  note_to_keep: {
    ends: "news",
    why: "A note to keep is told once; its answer, Keep or Dismiss, closes the row for everyone (fact_suggestion_answer)."
  },
  // A reply counting down: it waits while its thread has one, and the server closes it once the reply leaves the queue
  // (sent or stopped: 00461 messages_reply_held_closes).
  reply_held: { ends: "send", server: "reply_gone" },
  ask_cards: {
    ends: "news",
    why: "Ask's morning is told once, to the member it is for; its cards wait on Today, where each is approved or let go."
  },
  website_form: {
    ends: "news",
    why: "A form sent on the website is told once; the person is in People, and what they asked waits on their page."
  }
};
export function kindsEndedBy(source) {
  return Object.keys(NOTICE_ENDS).filter((k) => NOTICE_ENDS[k].ends === source);
}
const RUN_WAITS_TITLE = /^(?:(?:Campaign|Playbook) “.*” is ready\b|A reach-out waits for you:|.+ waits for your OK$)/u;
const RUN_GOES_TITLE = /^(?:Campaign|Playbook) “.*” sends /u;
const RUN_HELD_TITLE = /^The check held \d+ emails? in /u;
const isGoing = (state) => RUN_GOING_STATES.includes(state);
function judgeRun(row, about, waits) {
  if (about.type !== "broadcast") return null;
  const run = heldFor(waits.runs, row.at)?.get(about.id);
  if (run === void 0) return null;
  if (RUN_WAITS_TITLE.test(row.title))
    return waits.days ? runWaitsOnYou(run, waits.days) : run.state === "pending_approval";
  if (RUN_GOES_TITLE.test(row.title)) return run.state === "scheduled";
  if (RUN_HELD_TITLE.test(row.title)) {
    if (!isGoing(run.state)) return false;
    return typeof run.held === "number" ? run.held > 0 : null;
  }
  return null;
}
function judgeEmail(row, about, waits) {
  if (about.type !== "booking_notice") return null;
  const held = heldFor(waits.heldEmails, row.at);
  return held ? held.has(about.id) : null;
}
function judgeReview(row, about, waits) {
  const asks = row.title.startsWith(NEW_REVIEW_NEWS) || row.title.startsWith(REVIEW_REPLY_HELD_TITLE);
  if (about.type !== "review" || !asks) return null;
  const review = heldFor(waits.reviews, row.at)?.find((r) => reviewNoticeIsAbout(about, r));
  return review ? !review.replied : null;
}
function judgeHold(row, about, waits) {
  if (about.type !== "conversation") return null;
  const needsYou = heldFor(waits.holds, row.at)?.get(about.id);
  return needsYou === void 0 ? null : needsYou;
}
function judgeSend(row, about, waits) {
  if (about.type !== "conversation") return null;
  const counting = heldFor(waits.sends ?? null, row.at)?.get(about.id);
  return counting === void 0 ? null : counting;
}
function judgeSearch(row, about, waits) {
  if (about.type !== "lead_round") return null;
  const searchId = row.to ? parseLeadsRoute(row.to)?.searchId : null;
  const s = searchId ? heldFor(waits.searches, row.at)?.get(searchId) : void 0;
  if (!s) return null;
  return s.roundId === about.id && s.state === "waiting_on_owner";
}
const JUDGES = {
  run: judgeRun,
  email: judgeEmail,
  review: judgeReview,
  hold: judgeHold,
  send: judgeSend,
  search: judgeSearch
};
export function noticeStillWaits(row, waits) {
  const end = Object.hasOwn(NOTICE_ENDS, row.kind) ? NOTICE_ENDS[row.kind] : null;
  if (!row.about || !end || end.ends === "news" || end.ends === "mended") return null;
  return JUDGES[end.ends](row, row.about, waits);
}
export function closeSettledNotices(rows, waits) {
  return rows.map(
    (row) => !row.key.startsWith(SERVER_KEY_PREFIX) || noticeStillWaits(row, waits) !== false ? row : settledRow(row)
  );
}
export function settledNoticeIds(dto, waits) {
  return new Set(
    serverNotificationRows(dto).filter((r) => noticeStillWaits(r, waits) === false).map((r) => r.key.slice(SERVER_KEY_PREFIX.length))
  );
}
