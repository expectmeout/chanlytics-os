/**
 * Why a run failed, in the owner's words, and what to do about it. Moved whole from broadcasts.ts (Reach out Part
 * 2.5), which re-exports it.
 */
import type { DeliveryRefusal } from "../consent/consent";
import type { ConsentChannel } from "../consent/consent-channels";
import { triggerOf } from "../playbooks/playbook-triggers";
import {
  BROADCAST_FAILURES,
  BROADCAST_FAILURE_WORDS,
  broadcastFailureWords,
  readFailure,
  wordsFor,
  type BroadcastFailure,
  type WireFailure,
  type Words,
} from "./broadcast-failure-words";

export { BROADCAST_FAILURES, BROADCAST_FAILURE_WORDS, broadcastFailureWords };
export type { BroadcastFailure, WireFailure };

/**
 * The failures a run stops with for a fact about the whole workspace, never about the person the door was asked of: a
 * billing pause, and the two holds on its offers and news by email (the workspace's offers paused by a gate,
 * email-offers.ts; a campaigns domain this runtime cannot use). A billing pause stops any run. The two of email stop only a
 * run with nobody on it who goes another way (core broadcast-stops.ts): everyone left would meet the same refusal, so the
 * run stops with it and leaves them unsent, rather than burn each as a final skip and end as "reached nobody". On a run
 * that also goes by WhatsApp or text the email person is skipped, their own, and the run goes on: stopped, it would never
 * reach the others, and the owner, told to send it again, would reach the rest twice.
 */
export type RunStop = Extract<BroadcastFailure, "paused" | "email_offers_paused" | "campaigns_domain_unverified">;
export type EmailRunStop = Exclude<RunStop, "paused">;

/** The stop a run of email alone makes for a refusal at the door, or null for a refusal that is the person's own. */
export function emailRunStop(reason: DeliveryRefusal): EmailRunStop | null {
  if (reason === "email_offers_paused") return "email_offers_paused";
  return reason === "email_marketing_disabled" ? "campaigns_domain_unverified" : null;
}

/** What the owner does about each stop, before what becomes of the run (stoppedRunFix). */
const RUN_STOP_REMEDY: Record<RunStop, string> = {
  paused: "Resume from Settings › Billing",
  email_offers_paused: "Check your list for old or wrong addresses; offers by email come back on once it looks right",
  campaigns_domain_unverified: "Nothing is wrong with your mailbox, and the platform has been told",
};

/** A broadcast the owner made is sent again, once what stopped it is over. */
const RUN_STOP_AGAIN: Record<RunStop, string> = {
  paused: `${RUN_STOP_REMEDY.paused} and send it again.`,
  email_offers_paused: `${RUN_STOP_REMEDY.email_offers_paused}. Send it again then.`,
  campaigns_domain_unverified: `${RUN_STOP_REMEDY.campaigns_domain_unverified}; send it again once the domain is verified.`,
};

const isRunStop = (code: BroadcastFailure): code is RunStop => code in RUN_STOP_REMEDY;

/**
 * What an owner is told to do about a run that stopped for the workspace (RunStop), in one sentence, by whose run it was:
 * the alert says it after the run's cause (core broadcast-stops.ts), and the run's page says it as its fix
 * (broadcastFailureFix). A broadcast the owner made is sent again. A playbook's run is not: it was made for today, one run
 * to a local day, so Run now answers that it already ran, and sending its message again by hand reaches the whole list.
 * Tomorrow's run is made over who is eligible then. A person it never reached was never counted as touched (db touches.ts:
 * a stopped run touched only the people it had sent to), so a moment of a list, a cadence or a deal reaches them tomorrow,
 * and those who got it wait out the playbook's gap. A visit's moment does not: its message belongs to the day of the
 * visit, and tomorrow's run is for tomorrow's.
 */
export function stoppedRunFix(why: RunStop, run: { playbook_id: string | null; trigger: string | null }): string {
  const next = playbookRunNext(run, "tomorrow");
  return next ? `${RUN_STOP_REMEDY[why]}. ${next}` : RUN_STOP_AGAIN[why];
}

/**
 * What becomes of a playbook's run that stopped, WHATEVER stopped it, in one sentence; null for a broadcast the owner made,
 * which is sent again. Said after the cause by every alert of a stopped run (core broadcast.ts thenWhat, broadcast-stops.ts)
 * and as the run's fix on its page (broadcastFailureFix): a run stopped by a limit, a wire or the day's hours told its owner
 * to "send it again", which a playbook's run has no way to do (stoppedRunFix says why, and why tomorrow's run reaches who
 * this one did not).
 *
 * `by` is when the people it did not reach are reached: by tomorrow's run, where what stopped it is over by then or is
 * the owner's to end (a pause to resume, a line to reconnect); or by the next run that can go, where it may outlast
 * tomorrow and is nobody's to end (the mail provider's month, a WhatsApp version waiting on Meta, the platform's key). Saying
 * "tomorrow" of those promised a run that meets the same stop.
 */
export type PlaybookRunNextBy = "tomorrow" | "when_it_can";
export function playbookRunNext(
  run: { playbook_id: string | null; trigger: string | null },
  by: PlaybookRunNextBy,
): string | null {
  if (!run.playbook_id) return null;
  if (triggerOf(run.trigger ?? "")?.kind === "visit")
    return "It does not run again today, and a reminder belongs to its day, so the people it did not reach will not be sent it later.";
  return by === "tomorrow"
    ? "It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice."
    : "It does not run again today; the next run that can go reaches the people this one did not, and nobody who got it is sent it twice.";
}

/** The failures that may outlast tomorrow and are not the owner's to end, as a run's page knows them (playbookRunNext). */
const OUTLASTS_TOMORROW: ReadonlySet<BroadcastFailure> = new Set(["provider_limit", "template_not_approved"]);

/**
 * What a run's `failure` holds for a failure that names its wire: the code, and for any channel but WhatsApp the channel
 * after a colon (`wire_unavailable:email`). A code with none is WhatsApp's, which keeps every run written before runs
 * had a channel (00298) readable as it was, and keeps a WhatsApp run's row what an older reader of this column knows.
 */
export function wireFailure(code: WireFailure, channel: ConsentChannel): string {
  return channel === "whatsapp" ? code : `${code}:${channel}`;
}

/**
 * What to do about a run that stopped because its message's WhatsApp version is no longer one WhatsApp approves and
 * everyone on it went by WhatsApp: that version is resubmitted, or the message is written for another channel, an email
 * or a text, which needs no review.
 */
const WHATSAPP_VERSION_FIX_WORDS =
  "Open it in the Library — its WhatsApp version can be resubmitted, or the message written as an email or a text.";

/**
 * How to get past each reason a run stops, in one sentence: a failed run says
 * what to do next, not only what went wrong. These are the words for a run that
 * reached nobody; one that reached some first says so (BROADCAST_FAILURE_FIX_AFTER).
 */
export const BROADCAST_FAILURE_FIX: Record<BroadcastFailure, Words> = {
  paused: "Unpause it under Settings, then send it again.",
  template_not_approved: WHATSAPP_VERSION_FIX_WORDS,
  wire_unavailable: "Nothing was charged and nobody was written to. Try again.",
  run_interrupted: "Nobody got it, so sending it again reaches nobody twice.",
  throttled: {
    whatsapp: "Nobody got it. WhatsApp lifts these limits on its own; send it again later.",
    sms: "Nobody got it. The texting provider lifts these limits on its own; send it again later.",
    email: "Nobody got it. The mail provider lifts these limits on its own; send it again later.",
  },
  stalled: {
    whatsapp: "Nobody got it. Nothing is wrong with the number; send it again later.",
    sms: "Nobody got it. Nothing is wrong with the line; send it again later.",
    email: "Nobody got it. Nothing is wrong with the mailbox; send it again later.",
  },
  people_unreadable: "Nobody got it. Nothing is wrong with your channels; send it again later.",
  after_hours: "Nobody got it. Send it again tomorrow, inside the day's sending hours.",
  provider_limit: "Nobody got it. The mail provider's limit resets on its own; send it again once it has.",
  campaigns_domain_unverified:
    "Nobody got it. Nothing is wrong with your mailbox: the platform has been told. Send it again once the domain is verified.",
  email_offers_paused:
    "Nobody got it. Check your list for old or wrong addresses; offers by email come back on once it looks right. Send it again then.",
};

/** The wire's own name in the sentences of BROADCAST_FAILURE_FIX_AFTER: who stopped answering, and what they limited. */
const WIRE_NAMES: Record<ConsentChannel, { provider: string; limited: string }> = {
  whatsapp: { provider: "WhatsApp", limited: "WhatsApp limited the number" },
  sms: { provider: "the texting provider", limited: "the texting provider limited the line" },
  email: { provider: "the mail provider", limited: "the mail provider limited the mailbox" },
};

/**
 * The same, for a run that reached some people before it stopped. Nothing sends
 * to "the rest": a broadcast sent again enrols its whole list (createBroadcast
 * leaves out nobody it already reached), so the words say who that includes
 * rather than promise a resend that skips them.
 */
const BROADCAST_FAILURE_FIX_AFTER: Partial<Record<BroadcastFailure, (n: number, channel: ConsentChannel) => string>> = {
  paused: (n) =>
    `Unpause it under Settings. Sending it again reaches the whole list, ${n === 1 ? "the one" : `the ${n}`} who got it included.`,
  wire_unavailable: (n, c) =>
    `The first ${n === 1 ? "one" : n} got it, then ${WIRE_NAMES[c].provider} stopped answering. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  run_interrupted: (n) =>
    `${n === 1 ? "One" : n} got it and the rest did not. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  throttled: (n, c) =>
    `The first ${n === 1 ? "one" : n} got it, then ${WIRE_NAMES[c].limited}. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  stalled: (n) =>
    `The first ${n === 1 ? "one" : n} got it, then its reads failed. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  people_unreadable: (n) =>
    `The first ${n === 1 ? "one" : n} got it, then its people could not be read. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  after_hours: (n) =>
    `The first ${n === 1 ? "one" : n} got it before the day's sending hours ran out. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  provider_limit: (n) =>
    `The first ${n === 1 ? "one" : n} got it, then the mail provider's limit was reached. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  campaigns_domain_unverified: (n) =>
    `The first ${n === 1 ? "one" : n} got it, then the domain offers by email leave from stopped being verified. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  email_offers_paused: (n) =>
    `The first ${n === 1 ? "one" : n} got it, then the workspace's offers by email were paused. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
};

/**
 * What an owner can do about each failure that is not a stop for the workspace (RunStop), with no "send it again": the
 * words a playbook's run says before what becomes of it (playbookRunNext). None where there is nothing to do but wait.
 */
const PLAYBOOK_RUN_REMEDY: Record<Exclude<BroadcastFailure, RunStop>, Words | null> = {
  template_not_approved: WHATSAPP_VERSION_FIX_WORDS,
  wire_unavailable: null,
  run_interrupted: null,
  throttled: {
    whatsapp: "WhatsApp lifts these limits on its own.",
    sms: "The texting provider lifts these limits on its own.",
    email: "The mail provider lifts these limits on its own.",
  },
  stalled: {
    whatsapp: "Nothing is wrong with the number.",
    sms: "Nothing is wrong with the line.",
    email: "Nothing is wrong with the mailbox.",
  },
  people_unreadable: "Nothing is wrong with your channels.",
  after_hours: null,
  provider_limit: "The mail provider's limit resets on its own.",
};

/**
 * A playbook's failed run, on its page: how many got it, what there is to do, and what becomes of it (`next`, the caller's
 * playbookRunNext for this code).
 */
function playbookRunFix(
  read: { code: Exclude<BroadcastFailure, RunStop>; channel: ConsentChannel },
  reached: number,
  next: string,
): string {
  const remedy = PLAYBOOK_RUN_REMEDY[read.code];
  const got = reached > 0 ? `The first ${reached === 1 ? "one" : reached} got it.` : "Nobody got it.";
  return [got, remedy ? wordsFor(remedy, read.channel) : null, next].filter(Boolean).join(" ");
}

/**
 * The next step past a failed run's reason, by how many it reached first; null for a code nobody has written words for. A
 * playbook's run is told what its own next step is (stoppedRunFix for a stop of the workspace's, playbookRunFix for any
 * other), never to send it again.
 */
export function broadcastFailureFix(
  failure: string | null | undefined,
  reached = 0,
  run?: { playbook_id: string | null; trigger: string | null },
): string | null {
  if (!failure) return null;
  const read = readFailure(failure);
  if (!read) return null;
  // The stored limit does not say the day's from the month's, so its page promises no tomorrow.
  const next = run ? playbookRunNext(run, OUTLASTS_TOMORROW.has(read.code) ? "when_it_can" : "tomorrow") : null;
  if (run && next) {
    const { code, channel } = read;
    return isRunStop(code) ? stoppedRunFix(code, run) : playbookRunFix({ code, channel }, reached, next);
  }
  const after = reached > 0 ? BROADCAST_FAILURE_FIX_AFTER[read.code] : undefined;
  return after ? after(reached, read.channel) : wordsFor(BROADCAST_FAILURE_FIX[read.code], read.channel) || null;
}
