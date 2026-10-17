import { audienceTrigger } from "./broadcast-audience.js";
import { broadcastFailureFix, broadcastFailureWords } from "./broadcast-failures.js";
import { HELD_REASONS } from "./run-words.js";
import { CONSENT_CHANNELS, CONSENT_CHANNEL_WORDS } from "../consent/consent-channels.js";
import { STOP_WORDS } from "../consent/consent.js";
import { NEEDS_YOU_WORD } from "../conversations/standing.js";
import { pct } from "../shared/numbers.js";
import { HOUR_MS } from "../shared/time.js";
export const RUN_REPORT_STEPS = 8;
const RUN_REPORT_SPANS_H = [1, 2, 4, 8, 12, 24, 48, 72];
export const RUN_FILTERS = [
  { id: "all", label: "All" },
  { id: "replied", label: "Replied" },
  { id: "held", label: "Held back" },
  { id: "stopped", label: STOP_WORDS.mark }
];
export function consentAnswerWords(consent, purpose) {
  if (purpose === "email_marketing")
    return consent === "opted_in" ? "said yes to offers by email" : "unsubscribed from offers by email";
  if (consent === "opted_in") return purpose === "marketing" ? "said yes to offers" : "said yes to hearing from you";
  return purpose === "marketing" ? "stopped offers, not messages" : "asked to stop hearing from you";
}
function answersWords(rows, consent) {
  const byEmail = rows.filter((r) => r.consent_purpose === "email_marketing").length;
  const offers = byEmail + rows.filter((r) => r.consent_purpose === "marketing").length;
  const rest = rows.length - offers;
  if (rest === 0 && byEmail === offers) return consentAnswerWords(consent, "email_marketing");
  if (offers === 0 || rest === 0) return consentAnswerWords(consent, offers > 0 ? "marketing" : "conversational");
  return consent === "opted_in" ? `${offers} to offers \xB7 ${rest} to hearing from you` : `${offers} stopped offers \xB7 ${rest} stopped everything`;
}
const STATUS_WORDS = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "not delivered",
  queued: "sending",
  canceled: "canceled"
};
export function receiptWords(r, clock) {
  const parts = [];
  const sent = clock(r.sent_at);
  parts.push(
    sent ? `sent ${sent}` : r.message_status && STATUS_WORDS[r.message_status] || r.message_status || "sent"
  );
  const delivered = clock(r.delivered_at);
  const read = clock(r.read_at);
  if (delivered) parts.push(`delivered ${delivered}`);
  else if (r.message_status === "delivered" || r.message_status === "read") parts.push("delivered");
  if (read) parts.push(`read ${read}`);
  else if (r.message_status === "read") parts.push("read");
  if (r.message_status === "failed") parts.push("not delivered");
  if (r.replied) parts.push(clock(r.replied_at) ? `replied ${clock(r.replied_at)}` : "replied");
  return parts.join(" \xB7 ");
}
const channelOf = (r) => CONSENT_CHANNELS.find((c) => c === r.channel) ?? null;
const NOT_DELIVERED_WORDS = {
  whatsapp: "WhatsApp could not deliver it",
  sms: "the text was not delivered",
  email: "the email was not delivered"
};
const SEND_REFUSED_WORDS = {
  whatsapp: "WhatsApp refused",
  sms: "the texting provider refused it",
  email: "the mail provider refused it"
};
const initialsOf = (name, named) => named ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0] ?? "").join("").toUpperCase() || "\u2014" : "\u2014";
function barSpanOf(reached, opts) {
  const starts = reached.map((r) => r.sent_at ? Date.parse(r.sent_at) : NaN).filter(Number.isFinite);
  const start = starts.length ? Math.min(...starts) : opts.nowMs;
  const heard = reached.flatMap((r) => [r.delivered_at, r.read_at, r.replied ? r.replied_at : null, r.consent_after ? r.consent_at : null]).map((s) => s ? Date.parse(s) : NaN).filter((t) => Number.isFinite(t) && t >= start && t - start <= opts.windowMs);
  const last = heard.length ? Math.max(...heard) - start : 0;
  const windowH = opts.windowMs / HOUR_MS;
  const spanH = RUN_REPORT_SPANS_H.find((h) => h <= windowH && h * HOUR_MS > last) ?? windowH;
  return { start, spanH, step: spanH * HOUR_MS / RUN_REPORT_STEPS };
}
function cutOffWordsOf(state) {
  return state === "failed" ? "the run stopped before them" : state === "canceled" ? "canceled before it reached them" : state === "sent" ? "never sent" : null;
}
function runFactsOf(d, opts) {
  const clock = opts.clock ?? ((iso) => iso);
  const reached = d.recipients.filter((r) => r.state === "sent");
  const sent = reached.length;
  const delivered = reached.filter((r) => r.message_status === "delivered" || r.message_status === "read");
  const replied = reached.filter((r) => r.replied);
  const waiting = replied.filter((r) => r.waiting_on_you).length;
  const yes = reached.filter((r) => r.consent_after === "opted_in");
  const stopped = reached.filter((r) => r.consent_after === "opted_out");
  const { start, spanH, step } = barSpanOf(reached, opts);
  const never = sent - delivered.length;
  const greets = (d.broadcast?.params ?? []).some((p) => p && p.kind === "first_name");
  const cutOff = cutOffWordsOf(d.broadcast?.state);
  const channelsSaid = d.recipients.some((r) => {
    const c = channelOf(r);
    return c !== null && c !== "whatsapp";
  });
  return {
    d,
    clock,
    reached,
    sent,
    delivered,
    replied,
    waiting,
    yes,
    stopped,
    start,
    spanH,
    step,
    never,
    greets,
    cutOff,
    channelsSaid
  };
}
function barsOf({ start, step }, stamps) {
  const out = new Array(RUN_REPORT_STEPS).fill(0);
  for (const s of stamps) {
    const t = s ? Date.parse(s) : NaN;
    if (!Number.isFinite(t)) continue;
    const i = Math.floor((t - start) / step);
    if (i >= 0 && i < RUN_REPORT_STEPS) out[i] += 1;
  }
  return out;
}
const pctOf = ({ sent }, n) => n > 0 ? pct(n, sent) : null;
const PERSON_PILLS = [
  // A STOP is the one pill and the one tone everywhere (consent.ts STOP_WORDS): it was amber here, grey on People.
  (r, { out }) => r.consent_after === "opted_out" && out ? { label: STOP_WORDS.pill, tone: STOP_WORDS.tone } : null,
  (r, { out }) => r.replied && out ? { label: "Replied", tone: "ok" } : null,
  (r, { out }) => r.consent_after === "opted_in" && out ? { label: "Said yes", tone: "ok" } : null,
  (r) => r.state === "skipped" ? { label: "Held back", tone: "plain" } : null,
  (r) => r.state === "failed" ? { label: "Not sent", tone: "danger" } : null,
  (r, { cutOff }) => r.state === "queued" ? { label: cutOff ? "Not sent" : "Waiting", tone: "plain" } : null,
  (r) => r.message_status === "failed" ? { label: "Never delivered", tone: "danger" } : null,
  (r) => r.message_status === "read" ? { label: "Read", tone: "info" } : null,
  (r) => r.message_status === "delivered" ? { label: "Delivered", tone: "info" } : null
];
function personPillOf(r, c) {
  for (const row of PERSON_PILLS) {
    const pill = row(r, c);
    if (pill) return pill;
  }
  return { label: "Sent", tone: "plain" };
}
function personWordsOf(r, { hiThere, answer, quote, cutOff, clock, via }) {
  const said = r.reason === "send_failed" ? SEND_REFUSED_WORDS[via] : r.reason ? HELD_REASONS[r.reason] : void 0;
  if (r.state === "skipped") return said || r.reason || "held back";
  if (r.state === "failed") return said || SEND_REFUSED_WORDS[via];
  if (r.state === "queued") return cutOff ?? "not sent yet";
  if (r.consent_after === "opted_out") return quote ? `${quote} \u2014 ${answer}` : answer;
  if (quote) return quote;
  if (r.consent_after === "opted_in") return answer;
  if (r.message_status === "failed") return NOT_DELIVERED_WORDS[via];
  if (hiThere) return "greeted \u201CHi there\u201D \u2014 no name on file";
  return receiptWords(r, clock);
}
function personDoorOf(r, { out, hiThere }) {
  if (r.consent_after === "opted_out" && out) return { label: "See consent", to: `clients/${r.contact_id}` };
  if (hiThere) return { label: "Add a name", to: `clients/${r.contact_id}` };
  if (r.replied && r.conversation_id) return { label: "Open the thread", to: `inbox/th-${r.conversation_id}` };
  return null;
}
function personFiltersOf(r, { out, cutOff }) {
  const inn = ["all"];
  if (out && r.replied) inn.push("replied");
  if (r.state === "skipped" || r.state === "failed" || r.state === "queued" && cutOff) inn.push("held");
  if (out && r.consent_after === "opted_out") inn.push("stopped");
  return inn;
}
function personLineOf(r, { greets, cutOff, clock, channelsSaid }) {
  const out = r.state === "sent";
  const hiThere = out && greets && !r.first_name;
  const answer = r.consent_after ? consentAnswerWords(r.consent_after, r.consent_purpose) : null;
  const quote = r.replied && r.reply_words ? `\u201C${r.reply_words}\u201D` : null;
  const channel = channelOf(r);
  const c = { out, hiThere, answer, quote, cutOff, clock, via: channel ?? "whatsapp" };
  const pill = personPillOf(r, c);
  const words = personWordsOf(r, c);
  const door = personDoorOf(r, c);
  const inn = personFiltersOf(r, c);
  return {
    contact_id: r.contact_id,
    name: r.name,
    initials: initialsOf(r.name, !!r.first_name),
    pill,
    words,
    channel: channelsSaid && channel ? CONSENT_CHANNEL_WORDS[channel] : null,
    door,
    at: out ? clock(r.replied_at || r.consent_at || r.read_at || r.delivered_at || r.sent_at) : null,
    attn: out && r.consent_after === "opted_out" || hiThere,
    held: !out,
    in: inn
  };
}
function replyOutcomeOf(r, clock) {
  if (r.waiting_on_you) return { words: NEEDS_YOU_WORD, tone: "warn" };
  if (r.answered_by === "receptionist")
    return {
      words: `The receptionist answered${clock(r.answered_at) ? ` \xB7 ${clock(r.answered_at)}` : ""}`,
      tone: "ok"
    };
  if (r.answered_by === "team")
    return { words: `Your team answered${clock(r.answered_at) ? ` \xB7 ${clock(r.answered_at)}` : ""}`, tone: "ok" };
  return { words: "Not answered yet", tone: "plain" };
}
function repliesOf({ replied, clock }) {
  return replied.slice().sort((a, b) => String(a.replied_at ?? "").localeCompare(String(b.replied_at ?? ""))).map((r) => ({
    contact_id: r.contact_id,
    name: r.name,
    initials: initialsOf(r.name, !!r.first_name),
    quote: r.reply_words ? `\u201C${r.reply_words}\u201D` : null,
    outcome: replyOutcomeOf(r, clock),
    to: r.conversation_id ? `inbox/th-${r.conversation_id}` : null
  }));
}
function runStopOf({ d, sent }) {
  const failed = d.broadcast?.state === "failed";
  const code = d.broadcast?.failure ?? null;
  return failed ? {
    words: broadcastFailureWords(code),
    fix: broadcastFailureFix(code, sent, {
      playbook_id: d.broadcast?.playbook_id ?? null,
      trigger: audienceTrigger(d.broadcast?.audience)
    }),
    tone: code === "paused" ? "warn" : "danger"
  } : null;
}
const spanWordsOf = (spanH) => spanH === 1 ? "the first hour" : spanH < 24 ? `the first ${spanH} hours` : spanH === 24 ? "the first day" : `the first ${spanH / 24} days`;
const runGroupsOf = (people) => ({
  all: people.length,
  replied: people.filter((p) => p.in.includes("replied")).length,
  held: people.filter((p) => p.in.includes("held")).length,
  stopped: people.filter((p) => p.in.includes("stopped")).length
});
const sentFigure = (f) => ({
  id: "sent",
  label: "Messages sent",
  n: f.sent,
  pct: null,
  sub: `of ${f.d.recipients.length} on the list`,
  tone: "plain",
  bars: barsOf(
    f,
    f.reached.map((r) => r.sent_at)
  )
});
const deliveredFigure = (f) => ({
  id: "delivered",
  label: "Delivered",
  n: f.delivered.length,
  pct: pctOf(f, f.delivered.length),
  sub: f.sent === 0 ? "nothing has gone out" : f.never > 0 ? `${f.never} never reached ${f.channelsSaid ? "them" : "the handset"}` : f.channelsSaid ? "every one reached them" : "every one reached the handset",
  tone: f.delivered.length > 0 ? "ok" : "plain",
  bars: barsOf(
    f,
    f.delivered.map((r) => r.delivered_at ?? r.read_at)
  )
});
const repliedFigure = (f) => ({
  id: "replied",
  label: "Replied",
  n: f.replied.length,
  pct: pctOf(f, f.replied.length),
  sub: f.waiting > 0 ? `${f.waiting} ${f.waiting === 1 ? "needs" : "need"} you in the Inbox` : f.replied.length > 0 ? "each one is a thread in the Inbox" : "nobody has written back yet",
  tone: f.replied.length > 0 ? "ok" : "plain",
  bars: barsOf(
    f,
    f.replied.map((r) => r.replied_at)
  )
});
const saidYesFigure = (f) => ({
  id: "said_yes",
  label: "Said yes",
  n: f.yes.length,
  pct: pctOf(f, f.yes.length),
  sub: f.yes.length > 0 ? answersWords(f.yes, "opted_in") : "nobody new said yes",
  tone: f.yes.length > 0 ? "ok" : "plain",
  bars: barsOf(
    f,
    f.yes.map((r) => r.consent_at)
  )
});
const stoppedFigure = (f) => ({
  id: "stopped",
  label: STOP_WORDS.heading,
  n: f.stopped.length,
  pct: pctOf(f, f.stopped.length),
  sub: f.stopped.length > 0 ? answersWords(f.stopped, "opted_out") : `nobody ${STOP_WORDS.short}`,
  tone: STOP_WORDS.tone,
  bars: barsOf(
    f,
    f.stopped.map((r) => r.consent_at)
  )
});
const RUN_FIGURES = [sentFigure, deliveredFigure, repliedFigure, saidYesFigure, stoppedFigure];
export function toRunReportVM(d, opts) {
  const f = runFactsOf(d, opts);
  const people = d.recipients.map((r) => personLineOf(r, f));
  const replies = repliesOf(f);
  const stop = runStopOf(f);
  return {
    enrolled: d.recipients.length,
    span: spanWordsOf(f.spanH),
    groups: runGroupsOf(people),
    people,
    replies,
    stop,
    figures: RUN_FIGURES.map((figure) => figure(f))
  };
}
