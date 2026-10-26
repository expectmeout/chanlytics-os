import { PLAYBOOK_BREATH_MS } from "../playbooks/playbook-time.js";
import { HOUR_MS } from "../shared/time.js";
export const REPLY_WINDOW_HOURS = 72;
export const REPLY_WINDOW_MS = REPLY_WINDOW_HOURS * HOUR_MS;
export const REPLY_DAYS = `${REPLY_WINDOW_HOURS / 24} days`;
export const REPLY_WINDOW_WORDS = `within ${REPLY_DAYS}`;
export const STUCK_DAYS = "30 days";
export function isReplyTo(sentAt, at) {
  const s = Date.parse(sentAt);
  const a = Date.parse(at);
  return Number.isFinite(s) && Number.isFinite(a) && a > s && a - s <= REPLY_WINDOW_MS;
}
const RUN_UNDERWAY = /* @__PURE__ */ new Set(["pending_approval", "scheduled", "sending"]);
export function runStillMoving(run, nowMs) {
  if (RUN_UNDERWAY.has(run.state)) return true;
  const ended = Date.parse(run.finished_at ?? run.started_at ?? "");
  return Number.isFinite(ended) && nowMs - ended <= REPLY_WINDOW_MS;
}
export const RECIPIENT_REASON_HEARD = "heard_this_week";
export const LEFT_OUT_FACTS = { breath: RECIPIENT_REASON_HEARD };
export function leftOutByFacts(facts) {
  return facts.breath === RECIPIENT_REASON_HEARD;
}
export function heardWithin(sendsAt, now) {
  const t = Math.max(sendsAt, now);
  return (at) => at >= t - PLAYBOOK_BREATH_MS && at <= t + PLAYBOOK_BREATH_MS;
}
export function breathTouchOf(times, sendsAt, now) {
  const within = heardWithin(sendsAt, now);
  let latest = null;
  for (const at of times.map(Date.parse)) if (within(at) && (latest === null || at > latest)) latest = at;
  return latest;
}
export function leftOutBy(touches, sendsAt, now) {
  return new Set(
    Object.entries(touches).filter(([, times]) => breathTouchOf(times, sendsAt, now) !== null).map(([id]) => id)
  );
}
export function heardFor(heard, sendsAt, now) {
  const within = heardWithin(sendsAt, now);
  const heardBy = { whatsapp: 0, sms: 0, email: 0 };
  for (const h of heard) if (h.times.some(within)) heardBy[h.channel] += 1;
  return { heard: heardBy.whatsapp + heardBy.sms + heardBy.email, heardBy };
}
export function breathSplit(reached, idOf, out) {
  const goes = [];
  const leftOut = [];
  for (const person of reached) (out.has(idOf(person)) ? leftOut : goes).push(person);
  return { goes, leftOut };
}
export function reachAfterBreath(split, heardBy, breathe) {
  if (!breathe) return split;
  const byChannel = {
    whatsapp: split.byChannel.whatsapp - (heardBy.whatsapp ?? 0),
    sms: split.byChannel.sms - (heardBy.sms ?? 0),
    email: split.byChannel.email - (heardBy.email ?? 0)
  };
  return { ...split, byChannel, reached: byChannel.whatsapp + byChannel.sms + byChannel.email };
}
export const BREATH_WHY = "from you within a week of it";
const hearsOrHear = (n) => n === 1 ? "hears" : "hear";
export function breathWaitWords(n, who) {
  return `${who} ${hearsOrHear(n)} from you within a week of today and ${n === 1 ? "waits" : "wait"}`;
}
export function heardWords(n, breathe) {
  if (!(n > 0)) return null;
  if (breathe) return `${n} left out: they hear ${BREATH_WHY}`;
  return `${n === 1 ? "One" : n} of them ${hearsOrHear(n)} ${BREATH_WHY}.`;
}
export function heardTooWords(n) {
  return `Also send to the ${n === 1 ? "one" : n} who ${hearsOrHear(n)} ${BREATH_WHY}`;
}
export function allLeftOutWords(label, n) {
  return `Everyone it reaches on \u201C${label}\u201D hears ${BREATH_WHY}, so ${n === 1 ? "the one person is" : `all ${n} are`} left out.`;
}
export const HEARD_UNREAD_WORDS = `Who hears ${BREATH_WHY} could not be read just now: the send still leaves them out, so it may go to fewer.`;
export function goesToOf(receipt) {
  return receipt.recipient_count - (receipt.left_out ?? 0);
}
export const HELD_REASONS = {
  opted_out: "asked to stop",
  not_opted_in: "no recorded yes",
  // The reason the send job writes when the OTHER yes is the missing one. It was
  // added to the wire (00095) and not to these words, so the owner read the raw
  // enum `no_marketing_consent` on the broadcast's own detail pane -- and the
  // distinction it draws is the entire point of the split, so it is the last one
  // that should have arrived untranslated.
  no_marketing_consent: "no yes to offers",
  no_phone: "no number",
  // The channel picked was email and no address is on file (step 3), or no channel the send ticks could carry it.
  no_address: "no email address",
  no_channel: "no channel it can go by",
  sms_line_not_active: "the texting line is not active",
  // The workspace's month of emails or texts is used up (CAMPAIGN_MONTH_ALLOWANCE): held on its channel, never moved.
  month_allowance: "this month's allowance is used up",
  // A send by hand left them out: another message from a campaign or a broadcast reaches them within a week of it, before
  // or after (the week's breath), and they were never sent it. Spelled out rather than computed from
  // RECIPIENT_REASON_HEARD, as outcome_unknown is below; run-report.test.mjs holds the two spellings together.
  heard_this_week: "not sent: they hear from you within a week of it",
  // The message's WhatsApp version is no longer one a send can use: it holds the people who go by WhatsApp, and only them.
  template_not_approved: "its WhatsApp version is no longer approved",
  // The number is on file but no thread answers to it on this line: a stored
  // number that does not normalise, or one no contact row matches.
  no_thread: "no thread for that number",
  human_has_it: "a person had the thread",
  paused: "the workspace was paused",
  superseded_by_human: "a person answered first",
  // The receptionist's held reply, past the reply horizon after the message it answers: a person answers instead.
  too_late: "too late to send automatically",
  sms_carries_no_promotions: "no offers by text",
  // The campaigns domain offers leave from is not this deployment's to use, or the provider does not verify it: the business's
  // news by email is an offer at the door (decision D2), so it waits as an offer does. Each person's own skip, final.
  email_marketing_disabled: "offers and news by email can't leave yet: the campaigns domain isn't switched on",
  // The workspace's offers by email are paused while complaints or bounces settle (email-offers.ts), and the business's news
  // by email with them (decision D2); a visit's reminder and a reply still go.
  email_offers_paused: "offers and news by email are paused",
  // An offer's foot names the business's address, and it has none on file: the person is held until it does.
  no_business_address: "no business address on file",
  email_suppressed: "their email address stopped accepting mail",
  recipient_changed: "their email address changed",
  erased: "deleted",
  // The provider refused the send, on whichever channel the person was reached by: a page that knows the channel says
  // it by SEND_REFUSED_WORDS, and a row that does not (a person's own page, a run made before rows kept theirs) says this.
  send_failed: "the provider refused it",
  missing_value: "a value was missing",
  // A reminder's appointment moved, was cancelled or marked missed, or left the calendar between the run and the send
  // (calendar/feed-appointments.ts appointmentHolds): held, never sent for a time that no longer stands.
  appointment_changed: "their booking moved or was cancelled",
  // Spelled out rather than computed from OUTCOME_UNKNOWN: a computed key makes
  // this object opaque to the bundler, which then carries the whole map into
  // every package that imports anything from here. core-broadcast.test.mjs
  // holds the two spellings together.
  outcome_unknown: "a run that did not finish",
  // Reach out's (a cold email), short, for a run's line.
  unsubscribed: "unsubscribed",
  outreach_is_email_only: "cold email goes by email only",
  outreach_not_a_lead: "not a business your searches found",
  outreach_lead_closed: "no longer being written to",
  outreach_suppressed: "on the never-again list",
  outreach_wrote_back: "wrote back or called",
  outreach_away: "away until the day they're back",
  outreach_stopped: "you stopped writing to them",
  outreach_without_unsubscribe: "no unsubscribe link",
  outreach_needs_own_mailbox: "not from a mailbox you connected",
  sending_mailbox_not_ready: "the mailbox isn't sending",
  sending_mailbox_at_cap: "the mailbox's day is full"
};
export const DELIVERY_RECEIPTS_WORDS = "each channel's own receipts";
export const DELIVERY_RECEIPTS_TIP = "Each channel's own receipts";
export const HELD_WHEN_COUNTED = [
  // The two the workspace, not the person, holds an email for: its offers and news by email paused by a gate, and a
  // campaigns domain that cannot be used. A run that also goes another way skips each email person for them, one by one,
  // and goes on (core broadcast-stops.ts), and must say that is what happened to them.
  "email_offers_paused",
  "email_marketing_disabled",
  // The week's breath: a send by hand leaves out whoever hears from you within a week of it, and its tally counts them
  // held, as the run's own page files them under Held back.
  RECIPIENT_REASON_HEARD,
  // The workspace's month of emails or texts used up (CAMPAIGN_MONTH_ALLOWANCE).
  "month_allowance"
];
export function finishedRunHeldWhy(counted) {
  const why = [
    HELD_REASONS.not_opted_in,
    HELD_REASONS.opted_out,
    HELD_REASONS.no_phone,
    HELD_REASONS.human_has_it,
    ...HELD_WHEN_COUNTED.filter((r) => counted.includes(r)).map((r) => HELD_REASONS[r])
  ];
  return `${why.join(", ")}, or ${HELD_REASONS.outcome_unknown}`;
}
