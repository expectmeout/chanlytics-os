/**
 * A run's report: its figures over time, the people it reached and what each said back. Moved whole from
 * broadcasts.ts (Reach out Part 2.5), which re-exports it.
 */
import { audienceTrigger } from "./audience";
import { broadcastFailureFix, broadcastFailureWords } from "./failures";
import type { BroadcastRecipientDto } from "./broadcasts";
import type { AnswerPurpose } from "./run-answers";
import { HELD_REASONS } from "./run-words";
import { CONSENT_CHANNELS, CONSENT_CHANNEL_WORDS, type ConsentChannel } from "../../consent/channels";
import { STOP_WORDS } from "../../consent/consent";
import { NEEDS_YOU_WORD } from "../../conversations/standing";
import type { ParamSpec } from "../templates/params";
import { pct } from "../../shared/numbers";
import { HOUR_MS } from "../../shared/time";

/* ------------------------------ a run's report ------------------------------ */

export type RunFigureId = "sent" | "delivered" | "replied" | "said_yes" | "stopped";

/** The steps a figure's bars take: the canvas draws eight. */
export const RUN_REPORT_STEPS = 8;

/** The spans the bars can cover, in hours: the shortest that holds everything the run heard back, up to the reply window. */
const RUN_REPORT_SPANS_H = [1, 2, 4, 8, 12, 24, 48, 72];

export interface RunFigure {
  id: RunFigureId;
  label: string;
  n: number;
  /** Of what the run sent, rounded; null for "sent" itself, for none, and for a run that reached nobody. */
  pct: number | null;
  /** The sentence under the figure. */
  sub: string;
  /** "ok" for an answer that came, "warn" for a stop -- the one figure that asks the owner to look -- and plain for none. */
  tone: "plain" | "ok" | "warn";
  /** When each came back, in RUN_REPORT_STEPS equal steps from the first send across the report's span. */
  bars: number[];
}

/** The filters over "Everyone it touched". */
export type RunFilterId = "all" | "replied" | "held" | "stopped";

export const RUN_FILTERS: readonly { id: RunFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "replied", label: "Replied" },
  { id: "held", label: "Held back" },
  { id: "stopped", label: STOP_WORDS.mark },
];

export type RunTone = "plain" | "ok" | "info" | "warn" | "danger";

/** One person's line: what happened to them, in words, with the one door it offers. */
export interface RunPersonVM {
  contact_id: string;
  name: string;
  /** Two letters for the mark, or a dash for someone with no name on file. */
  initials: string;
  pill: { label: string; tone: RunTone };
  words: string;
  /**
   * The channel their message went by, in the words a line says it ("on WhatsApp", "by text", "by email"): said only
   * where the run reached somebody on a channel other than WhatsApp, which is every run before step 3, so a run that
   * went by WhatsApp alone says nothing of it; null for such a run, and for someone whose row names no channel.
   */
  channel: string | null;
  door: { label: string; to: string } | null;
  /** The last thing that happened to them, by the business's clock; null for someone the run never sent to. */
  at: string | null;
  /** Their line asks the owner to look: a stop, or a greeting that went out "Hi there". */
  attn: boolean;
  /** The run never sent to them: held back, refused, or not yet. */
  held: boolean;
  in: RunFilterId[];
}

/** One reply, as "What came back" quotes it: their words, and what has happened since. */
export interface RunReplyVM {
  contact_id: string;
  name: string;
  initials: string;
  /** Their first reply's words; null when it had none. */
  quote: string | null;
  outcome: { words: string; tone: RunTone };
  to: string | null;
}

export interface RunReportVM {
  figures: RunFigure[];
  /** What the bars cover, in words: "the first 4 hours" -- the shortest span holding everything heard back, up to the window. */
  span: string;
  /** How many the run was for: everyone enrolled, reached or not. */
  enrolled: number;
  /** How many each filter of "Everyone it touched" holds. */
  groups: Record<RunFilterId, number>;
  people: RunPersonVM[];
  /** Every reply, the first to come first. */
  replies: RunReplyVM[];
  /** Why a failed run stopped and how to get past it; null for a run that did not fail. */
  stop: { words: string; fix: string | null; tone: "warn" | "danger" } | null;
}

type ReportRecipient = Pick<
  BroadcastRecipientDto,
  | "contact_id"
  | "name"
  | "channel"
  | "first_name"
  | "state"
  | "reason"
  | "sent_at"
  | "message_status"
  | "conversation_id"
  | "delivered_at"
  | "read_at"
  | "replied"
  | "replied_at"
  | "consent_after"
  | "consent_at"
  | "consent_purpose"
  | "reply_words"
  | "answered_by"
  | "answered_at"
  | "waiting_on_you"
>;

/**
 * Which answer a yes or a stop was, said once for a person and once for a
 * figure: a stop to offers leaves every other message going, so the canvas's
 * "they hear nothing again" is only true of a stop to everything. An answer about offers by email is the email's own
 * (the one-click unsubscribe an offer by email invites, or YES OFFERS by email): it stops or starts those alone.
 */
export function consentAnswerWords(consent: "opted_in" | "opted_out", purpose: AnswerPurpose | null): string {
  if (purpose === "email_marketing")
    return consent === "opted_in" ? "said yes to offers by email" : "unsubscribed from offers by email";
  if (consent === "opted_in") return purpose === "marketing" ? "said yes to offers" : "said yes to hearing from you";
  return purpose === "marketing" ? "stopped offers, not messages" : "asked to stop hearing from you";
}

/** "said yes to offers", or both kinds counted apart: "1 to offers · 2 to hearing from you". An answer about offers by email is one about offers. */
function answersWords(rows: readonly ReportRecipient[], consent: "opted_in" | "opted_out"): string {
  const byEmail = rows.filter((r) => r.consent_purpose === "email_marketing").length;
  const offers = byEmail + rows.filter((r) => r.consent_purpose === "marketing").length;
  const rest = rows.length - offers;
  if (rest === 0 && byEmail === offers) return consentAnswerWords(consent, "email_marketing");
  if (offers === 0 || rest === 0) return consentAnswerWords(consent, offers > 0 ? "marketing" : "conversational");
  return consent === "opted_in"
    ? `${offers} to offers · ${rest} to hearing from you`
    : `${offers} stopped offers · ${rest} stopped everything`;
}

const STATUS_WORDS: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "not delivered",
  queued: "sending",
  canceled: "canceled",
};

/** What happened to one person, with the times WhatsApp's receipts gave (00111): "sent 10:31 · delivered 10:32 · read 10:40 · replied 10:52". */
export function receiptWords(
  broadcastRecipient: Pick<
    BroadcastRecipientDto,
    "sent_at" | "message_status" | "delivered_at" | "read_at" | "replied" | "replied_at"
  >,
  clock: (iso: string | null) => string | null,
): string {
  const parts: string[] = [];
  const sent = clock(broadcastRecipient.sent_at);
  parts.push(
    sent
      ? `sent ${sent}`
      : (broadcastRecipient.message_status && STATUS_WORDS[broadcastRecipient.message_status]) ||
          broadcastRecipient.message_status ||
          "sent",
  );
  const delivered = clock(broadcastRecipient.delivered_at);
  const read = clock(broadcastRecipient.read_at);
  if (delivered) parts.push(`delivered ${delivered}`);
  else if (broadcastRecipient.message_status === "delivered" || broadcastRecipient.message_status === "read")
    parts.push("delivered");
  if (read) parts.push(`read ${read}`);
  else if (broadcastRecipient.message_status === "read") parts.push("read");
  if (broadcastRecipient.message_status === "failed") parts.push("not delivered");
  if (broadcastRecipient.replied)
    parts.push(clock(broadcastRecipient.replied_at) ? `replied ${clock(broadcastRecipient.replied_at)}` : "replied");
  return parts.join(" · ");
}

/** The channel a recipient's row names, when it names one of the three; null for a run made before rows kept it. */
const channelOf = (r: Pick<ReportRecipient, "channel">): ConsentChannel | null =>
  CONSENT_CHANNELS.find((c) => c === r.channel) ?? null;

/** Why a message that left was never delivered, for the channel it left by. */
const NOT_DELIVERED_WORDS: Record<ConsentChannel, string> = {
  whatsapp: "WhatsApp could not deliver it",
  sms: "the text was not delivered",
  email: "the email was not delivered",
};

/**
 * Why a person's send was refused at the provider (the recipient's reason `send_failed`), for the channel it went by: the
 * run's words are the channel's, never WhatsApp's on an email or a text.
 */
const SEND_REFUSED_WORDS: Record<ConsentChannel, string> = {
  whatsapp: "WhatsApp refused",
  sms: "the texting provider refused it",
  email: "the mail provider refused it",
};

const initialsOf = (name: string, named: boolean): string =>
  named
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => Array.from(w)[0] ?? "")
        .join("")
        .toUpperCase() || "—"
    : "—";

type RunReportInput = Parameters<typeof toRunReportVM>[0];
type RunReportOpts = Parameters<typeof toRunReportVM>[1];

/**
 * Where a run's bars start and how long each of their steps is: from the first send, across the shortest span that
 * holds everything the run heard back inside the reply window, up to the window itself.
 */
function barSpanOf(reached: readonly ReportRecipient[], opts: RunReportOpts) {
  const starts = reached.map((r) => (r.sent_at ? Date.parse(r.sent_at) : NaN)).filter(Number.isFinite);
  const start = starts.length ? Math.min(...starts) : opts.nowMs;
  const heard = reached
    .flatMap((r) => [r.delivered_at, r.read_at, r.replied ? r.replied_at : null, r.consent_after ? r.consent_at : null])
    .map((s) => (s ? Date.parse(s) : NaN))
    .filter((t) => Number.isFinite(t) && t >= start && t - start <= opts.windowMs);
  const last = heard.length ? Math.max(...heard) - start : 0;
  const windowH = opts.windowMs / HOUR_MS;
  const spanH = RUN_REPORT_SPANS_H.find((h) => h <= windowH && h * HOUR_MS > last) ?? windowH;
  return { start, spanH, step: (spanH * HOUR_MS) / RUN_REPORT_STEPS };
}

/** Why the people a run never reached were not reached, by how the run ended; null for a run still going. */
function cutOffWordsOf(state: string | undefined): string | null {
  // A run that failed or was canceled leaves the people it had not reached queued (jobs settle.ts): they are not
  // "not sent yet" -- nothing more goes to them from this run.
  return state === "failed"
    ? "the run stopped before them"
    : state === "canceled"
      ? "canceled before it reached them"
      : state === "sent"
        ? "never sent"
        : null;
}

/** What a run's report is counted from, once: who it reached, what came back, the bars' span, and how it ended. */
function runFactsOf(runReportInput: RunReportInput, opts: RunReportOpts) {
  const clock = opts.clock ?? ((iso: string | null) => iso);
  const reached = runReportInput.recipients.filter((r) => r.state === "sent");
  const sent = reached.length;
  const delivered = reached.filter((r) => r.message_status === "delivered" || r.message_status === "read");
  const replied = reached.filter((r) => r.replied);
  const waiting = replied.filter((r) => r.waiting_on_you).length;
  const yes = reached.filter((r) => r.consent_after === "opted_in");
  const stopped = reached.filter((r) => r.consent_after === "opted_out");
  const { start, spanH, step } = barSpanOf(reached, opts);
  const never = sent - delivered.length;
  // A first-name slot takes the wire's own first name for each person (firstNameOf), and "there" for someone with none.
  const greets = (runReportInput.broadcast?.params ?? []).some((p) => p && p.kind === "first_name");
  const cutOff = cutOffWordsOf(runReportInput.broadcast?.state);
  // Said only where somebody was reached some other way than WhatsApp: a run of WhatsApp alone reads as it always did.
  const channelsSaid = runReportInput.recipients.some((r) => {
    const c = channelOf(r);
    return c !== null && c !== "whatsapp";
  });
  return {
    d: runReportInput,
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
    channelsSaid,
  };
}

type RunFacts = ReturnType<typeof runFactsOf>;

/** When each stamp came back, in RUN_REPORT_STEPS equal steps from the first send; a stamp outside them is not drawn. */
function barsOf({ start, step }: RunFacts, stamps: (string | null)[]): number[] {
  const out = new Array<number>(RUN_REPORT_STEPS).fill(0);
  for (const s of stamps) {
    const t = s ? Date.parse(s) : NaN;
    if (!Number.isFinite(t)) continue;
    const i = Math.floor((t - start) / step);
    if (i >= 0 && i < RUN_REPORT_STEPS) out[i] += 1;
  }
  return out;
}

/** Of what the run sent, rounded; null for none, and for a run that reached nobody. */
const pctOf = ({ sent }: RunFacts, n: number): number | null => (n > 0 ? pct(n, sent) : null);

/** One person as their line decides it: reached or not, greeted "Hi there" or not, their answer and their quote. */
interface PersonCase {
  out: boolean;
  hiThere: boolean;
  answer: string | null;
  quote: string | null;
  cutOff: string | null;
  clock: (iso: string | null) => string | null;
  /** The channel their message went by: WhatsApp for a row that names none. */
  via: ConsentChannel;
}

/** The pill: the first row that holds, in the order a person's line has always been read. */
const PERSON_PILLS: readonly ((r: ReportRecipient, c: PersonCase) => RunPersonVM["pill"] | null)[] = [
  // A STOP is the one pill and the one tone everywhere (consent.ts STOP_WORDS): it was amber here, grey on People.
  (r, { out }) => (r.consent_after === "opted_out" && out ? { label: STOP_WORDS.pill, tone: STOP_WORDS.tone } : null),
  (r, { out }) => (r.replied && out ? { label: "Replied", tone: "ok" } : null),
  (r, { out }) => (r.consent_after === "opted_in" && out ? { label: "Said yes", tone: "ok" } : null),
  (r) => (r.state === "skipped" ? { label: "Held back", tone: "plain" } : null),
  (r) => (r.state === "failed" ? { label: "Not sent", tone: "danger" } : null),
  (r, { cutOff }) => (r.state === "queued" ? { label: cutOff ? "Not sent" : "Waiting", tone: "plain" } : null),
  (r) => (r.message_status === "failed" ? { label: "Never delivered", tone: "danger" } : null),
  (r) => (r.message_status === "read" ? { label: "Read", tone: "info" } : null),
  (r) => (r.message_status === "delivered" ? { label: "Delivered", tone: "info" } : null),
];

function personPillOf(r: ReportRecipient, c: PersonCase): RunPersonVM["pill"] {
  for (const row of PERSON_PILLS) {
    const pill = row(r, c);
    if (pill) return pill;
  }
  return { label: "Sent", tone: "plain" };
}

/** The words: why they were held back or not reached, what they answered, or what WhatsApp's receipts say. */
function personWordsOf(
  reportRecipient: ReportRecipient,
  { hiThere, answer, quote, cutOff, clock, via }: PersonCase,
): string {
  // `send_failed` is the one reason whose words depend on the channel: the others are the same on every one.
  const sentence =
    reportRecipient.reason === "send_failed"
      ? SEND_REFUSED_WORDS[via]
      : reportRecipient.reason
        ? HELD_REASONS[reportRecipient.reason]
        : undefined;
  if (reportRecipient.state === "skipped") return sentence || reportRecipient.reason || "held back";
  if (reportRecipient.state === "failed") return sentence || SEND_REFUSED_WORDS[via];
  if (reportRecipient.state === "queued") return cutOff ?? "not sent yet";
  if (reportRecipient.consent_after === "opted_out") return quote ? `${quote} — ${answer}` : (answer ?? "");
  if (quote) return quote;
  if (reportRecipient.consent_after === "opted_in") return answer ?? "";
  if (reportRecipient.message_status === "failed") return NOT_DELIVERED_WORDS[via];
  if (hiThere) return "greeted “Hi there” — no name on file";
  return receiptWords(reportRecipient, clock);
}

/** The one door their line offers: their consent after a stop, their card to add a name, or their thread. */
function personDoorOf(r: ReportRecipient, { out, hiThere }: PersonCase): RunPersonVM["door"] {
  if (r.consent_after === "opted_out" && out) return { label: "See consent", to: `clients/${r.contact_id}` };
  if (hiThere) return { label: "Add a name", to: `clients/${r.contact_id}` };
  if (r.replied && r.conversation_id) return { label: "Open the thread", to: `inbox/th-${r.conversation_id}` };
  return null;
}

/** The filters of "Everyone it touched" their line is in. */
function personFiltersOf(r: ReportRecipient, { out, cutOff }: PersonCase): RunFilterId[] {
  const inn: RunFilterId[] = ["all"];
  if (out && r.replied) inn.push("replied");
  if (r.state === "skipped" || r.state === "failed" || (r.state === "queued" && cutOff)) inn.push("held");
  if (out && r.consent_after === "opted_out") inn.push("stopped");
  return inn;
}

/** One person's line: what happened to them, in words, with the one door it offers. */
function personLineOf(
  reportRecipient: ReportRecipient,
  { greets, cutOff, clock, channelsSaid }: RunFacts,
): RunPersonVM {
  const out = reportRecipient.state === "sent";
  const hiThere = out && greets && !reportRecipient.first_name;
  const answer = reportRecipient.consent_after
    ? consentAnswerWords(reportRecipient.consent_after, reportRecipient.consent_purpose)
    : null;
  const quote = reportRecipient.replied && reportRecipient.reply_words ? `“${reportRecipient.reply_words}”` : null;
  const channel = channelOf(reportRecipient);
  const personCase: PersonCase = { out, hiThere, answer, quote, cutOff, clock, via: channel ?? "whatsapp" };
  const pill = personPillOf(reportRecipient, personCase);
  const words = personWordsOf(reportRecipient, personCase);
  const door = personDoorOf(reportRecipient, personCase);
  const inn = personFiltersOf(reportRecipient, personCase);
  return {
    contact_id: reportRecipient.contact_id,
    name: reportRecipient.name,
    initials: initialsOf(reportRecipient.name, !!reportRecipient.first_name),
    pill,
    words,
    channel: channelsSaid && channel ? CONSENT_CHANNEL_WORDS[channel] : null,
    door,
    at: out
      ? clock(
          reportRecipient.replied_at ||
            reportRecipient.consent_at ||
            reportRecipient.read_at ||
            reportRecipient.delivered_at ||
            reportRecipient.sent_at,
        )
      : null,
    attn: (out && reportRecipient.consent_after === "opted_out") || hiThere,
    held: !out,
    in: inn,
  };
}

/** What has happened since a reply: a person is waiting, who answered it and when, or nobody yet. */
function replyOutcomeOf(
  reportRecipient: ReportRecipient,
  clock: (iso: string | null) => string | null,
): RunReplyVM["outcome"] {
  // Its thread waits on a person and nobody has it (the one standing rule): the Inbox's "Needs you".
  if (reportRecipient.waiting_on_you) return { words: NEEDS_YOU_WORD, tone: "warn" };
  if (reportRecipient.answered_by === "receptionist")
    return {
      words: `The receptionist answered${clock(reportRecipient.answered_at) ? ` · ${clock(reportRecipient.answered_at)}` : ""}`,
      tone: "ok",
    };
  if (reportRecipient.answered_by === "team")
    return {
      words: `Your team answered${clock(reportRecipient.answered_at) ? ` · ${clock(reportRecipient.answered_at)}` : ""}`,
      tone: "ok",
    };
  return { words: "Not answered yet", tone: "plain" };
}

/** Every reply, the first to come first, quoted, with what has happened since. */
function repliesOf({ replied, clock }: RunFacts): RunReplyVM[] {
  return replied
    .slice()
    .sort((a, b) => String(a.replied_at ?? "").localeCompare(String(b.replied_at ?? "")))
    .map((r) => ({
      contact_id: r.contact_id,
      name: r.name,
      initials: initialsOf(r.name, !!r.first_name),
      quote: r.reply_words ? `“${r.reply_words}”` : null,
      outcome: replyOutcomeOf(r, clock),
      to: r.conversation_id ? `inbox/th-${r.conversation_id}` : null,
    }));
}

/** Why a failed run stopped and how to get past it: amber for a pause, red for the rest; null for a run that did not fail. */
function runStopOf({ d, sent }: RunFacts): RunReportVM["stop"] {
  const failed = d.broadcast?.state === "failed";
  const code = d.broadcast?.failure ?? null;
  return failed
    ? {
        words: broadcastFailureWords(code),
        fix: broadcastFailureFix(code, sent, {
          playbook_id: d.broadcast?.playbook_id ?? null,
          trigger: audienceTrigger(d.broadcast?.audience),
        }),
        tone: code === "paused" ? "warn" : "danger",
      }
    : null;
}

/** What the bars cover, in words: "the first hour", "the first 4 hours", "the first day", "the first 3 days". */
const spanWordsOf = (spanH: number): string =>
  spanH === 1
    ? "the first hour"
    : spanH < 24
      ? `the first ${spanH} hours`
      : spanH === 24
        ? "the first day"
        : `the first ${spanH / 24} days`;

/** How many each filter of "Everyone it touched" holds. */
const runGroupsOf = (people: readonly RunPersonVM[]): Record<RunFilterId, number> => ({
  all: people.length,
  replied: people.filter((p) => p.in.includes("replied")).length,
  held: people.filter((p) => p.in.includes("held")).length,
  stopped: people.filter((p) => p.in.includes("stopped")).length,
});

/** One of the five figures, over the run's facts. */
type RunFigureOf = (f: RunFacts) => RunFigure;

const sentFigure: RunFigureOf = (item) => ({
  id: "sent",
  label: "Messages sent",
  n: item.sent,
  pct: null,
  sub: `of ${item.d.recipients.length} on the list`,
  tone: "plain",
  bars: barsOf(
    item,
    item.reached.map((r) => r.sent_at),
  ),
});

const deliveredFigure: RunFigureOf = (item) => ({
  id: "delivered",
  label: "Delivered",
  n: item.delivered.length,
  pct: pctOf(item, item.delivered.length),
  sub:
    item.sent === 0
      ? "nothing has gone out"
      : item.never > 0
        ? `${item.never} never reached ${item.channelsSaid ? "them" : "the handset"}`
        : item.channelsSaid
          ? "every one reached them"
          : "every one reached the handset",
  tone: item.delivered.length > 0 ? "ok" : "plain",
  bars: barsOf(
    item,
    item.delivered.map((r) => r.delivered_at ?? r.read_at),
  ),
});

const repliedFigure: RunFigureOf = (item) => ({
  id: "replied",
  label: "Replied",
  n: item.replied.length,
  pct: pctOf(item, item.replied.length),
  sub:
    item.waiting > 0
      ? `${item.waiting} ${item.waiting === 1 ? "needs" : "need"} you in the Inbox`
      : item.replied.length > 0
        ? "each one is a thread in the Inbox"
        : "nobody has written back yet",
  tone: item.replied.length > 0 ? "ok" : "plain",
  bars: barsOf(
    item,
    item.replied.map((r) => r.replied_at),
  ),
});

const saidYesFigure: RunFigureOf = (item) => ({
  id: "said_yes",
  label: "Said yes",
  n: item.yes.length,
  pct: pctOf(item, item.yes.length),
  sub: item.yes.length > 0 ? answersWords(item.yes, "opted_in") : "nobody new said yes",
  tone: item.yes.length > 0 ? "ok" : "plain",
  bars: barsOf(
    item,
    item.yes.map((r) => r.consent_at),
  ),
});

// A STOP is news, never a wait (decision 0048): its figure is in STOP's one tone and words, as the person's pill on the same
// sheet is (consent.ts STOP_WORDS). It was amber, a figure that asked something of the owner (the wiring's second audit, S9-8).
const stoppedFigure: RunFigureOf = (item) => ({
  id: "stopped",
  label: STOP_WORDS.heading,
  n: item.stopped.length,
  pct: pctOf(item, item.stopped.length),
  sub: item.stopped.length > 0 ? answersWords(item.stopped, "opted_out") : `nobody ${STOP_WORDS.short}`,
  tone: STOP_WORDS.tone,
  bars: barsOf(
    item,
    item.stopped.map((r) => r.consent_at),
  ),
});

/** The five figures Reports › Campaigns draws, in its order. */
const RUN_FIGURES: readonly RunFigureOf[] = [sentFigure, deliveredFigure, repliedFigure, saidYesFigure, stoppedFigure];

/**
 * One run's report: the five figures Reports › Campaigns draws for the
 * workspace -- messages sent, delivered, replied, said yes, asked to stop --
 * scoped to this run, from its recipients; everyone it touched, each in the
 * words of what happened to them; every reply, quoted; and, for a failed run,
 * why it stopped and how to get past it.
 *
 * Delivered counts read too: a message read was delivered. Each figure's bars
 * say when its answers came, in eight equal steps from the first send across
 * the shortest span that holds everything the run heard back -- an hour, four,
 * a day, up to the reply window -- so replies that came in the first hour have
 * a shape instead of one bar, and a run whose answers trickled in over three
 * days looks like it.
 *
 * The facts are counted once (runFactsOf); each part has its builder, run in
 * the order the run has always been read.
 */
export function toRunReportVM(
  details: {
    broadcast?: {
      state?: string;
      failure?: string | null;
      params?: readonly ParamSpec[];
      /** A playbook's run: which, and the moment its audience names, which a stop's next step is worded by (stoppedRunFix). */
      playbook_id?: string | null;
      audience?: unknown;
    };
    recipients: readonly ReportRecipient[];
  },
  opts: { windowMs: number; nowMs: number; clock?: (iso: string | null) => string | null },
): RunReportVM {
  const runFacts = runFactsOf(details, opts);
  const people = details.recipients.map((r) => personLineOf(r, runFacts));
  const replies = repliesOf(runFacts);
  const stop = runStopOf(runFacts);
  return {
    enrolled: details.recipients.length,
    span: spanWordsOf(runFacts.spanH),
    groups: runGroupsOf(people),
    people,
    replies,
    stop,
    figures: RUN_FIGURES.map((figure) => figure(runFacts)),
  };
}
