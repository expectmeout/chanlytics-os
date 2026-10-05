/**
 * Why a run failed, in the owner's words, and what to do about it. Moved whole from broadcasts.ts (Reach out Part
 * 2.5), which re-exports it.
 */
import type { DeliveryRefusal } from "../consent/consent";
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import { triggerOf } from "../playbooks/playbook-triggers";

/**
 * The codes a run's `failure` holds: what the send job writes (core messages/broadcast.ts) and the one the job ledger
 * writes when a run died and none took it up again (jobs settle.ts). The column is free text, so the set is closed
 * here, and each table below is keyed by it: a code added without its words does not compile.
 *
 * `campaigns_domain_unverified` and `email_offers_paused` are written only for a run with nobody on it who goes another
 * way than email (RUN_STOPS): on any other run the email person is skipped, their own, and the run goes on.
 */
export const BROADCAST_FAILURES = [
  "paused",
  "template_not_approved",
  "wire_unavailable",
  "run_interrupted",
  "throttled",
  "stalled",
  "people_unreadable",
  "after_hours",
  "provider_limit",
  "campaigns_domain_unverified",
  "email_offers_paused",
] as const;
export type BroadcastFailure = (typeof BROADCAST_FAILURES)[number];

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
  if (!run.playbook_id) return RUN_STOP_AGAIN[why];
  if (triggerOf(run.trigger ?? "")?.kind === "visit")
    return `${RUN_STOP_REMEDY[why]}. It does not run again today, and a visit's message belongs to the day of the visit, so the people it did not reach will not be sent it later.`;
  return `${RUN_STOP_REMEDY[why]}. It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice.`;
}

/** The failures whose words name the wire the run went out on: the rest read the same whichever channel it was. */
const WIRE_FAILURES = ["wire_unavailable", "throttled", "stalled"] as const satisfies readonly BroadcastFailure[];
export type WireFailure = (typeof WIRE_FAILURES)[number];

const isFailure = (code: string): code is BroadcastFailure => (BROADCAST_FAILURES as readonly string[]).includes(code);
const isWireFailure = (code: BroadcastFailure): code is WireFailure =>
  (WIRE_FAILURES as readonly string[]).includes(code);

/**
 * What a run's `failure` holds for a failure that names its wire: the code, and for any channel but WhatsApp the channel
 * after a colon (`wire_unavailable:email`). A code with none is WhatsApp's, which keeps every run written before runs
 * had a channel (00298) readable as it was, and keeps a WhatsApp run's row what an older reader of this column knows.
 */
export function wireFailure(code: WireFailure, channel: ConsentChannel): string {
  return channel === "whatsapp" ? code : `${code}:${channel}`;
}

/** A stored failure read: its code and the channel it names (WhatsApp where it names none); null for any other text. */
function readFailure(stored: string): { code: BroadcastFailure; channel: ConsentChannel } | null {
  const [code, named, ...rest] = stored.split(":");
  if (code === undefined || !isFailure(code) || rest.length > 0) return null;
  if (named === undefined) return { code, channel: "whatsapp" };
  const channel = CONSENT_CHANNELS.find((c) => c === named);
  return channel && isWireFailure(code) ? { code, channel } : null;
}

/** A words entry: the same on every channel, or one for each. */
type Words = string | Record<ConsentChannel, string>;
const wordsFor = (w: Words, channel: ConsentChannel): string => (typeof w === "string" ? w : w[channel]);

/**
 * Why a whole broadcast stopped, in the owner's words: the codes the send job writes (core messages/broadcast.ts)
 * and the one the job ledger writes when a run died and none took it up again (jobs settle.ts). Spelled out, as
 * HELD_REASONS is, so the bundler can see through it. A failure that names its wire (WIRE_FAILURES) has one entry per
 * channel, and a code stored with no channel is read as WhatsApp's (readFailure).
 */
export const BROADCAST_FAILURE_WORDS: Record<BroadcastFailure, Words> = {
  paused: "the workspace was paused",
  template_not_approved: "WhatsApp no longer approves its template",
  wire_unavailable: {
    whatsapp: "WhatsApp could not be reached",
    sms: "the texting provider could not be reached",
    email: "the mail provider could not be reached",
  },
  run_interrupted: "its send stopped partway and did not start again",
  throttled: {
    whatsapp: "WhatsApp kept limiting how fast this number may send",
    sms: "the texting provider kept limiting how fast this line may send",
    email: "the mail provider kept limiting how fast this workspace may send",
  },
  stalled: {
    whatsapp: "its people or its number's credentials could not be read for half an hour",
    sms: "its line's credentials could not be read for half an hour",
    email: "its mailbox could not be read for half an hour",
  },
  people_unreadable: "its people could not be read for half an hour",
  after_hours: "the day's sending hours ran out before it was done",
  provider_limit: "the mail provider's limit for the day or the month was reached",
  campaigns_domain_unverified: "the domain offers by email leave from is not verified with the mail provider",
  email_offers_paused: "the workspace's offers by email were paused while complaints and bounces settled",
};

/**
 * How to get past each reason a run stops, in one sentence: a failed run says
 * what to do next, not only what went wrong. These are the words for a run that
 * reached nobody; one that reached some first says so (BROADCAST_FAILURE_FIX_AFTER).
 */
export const BROADCAST_FAILURE_FIX: Record<BroadcastFailure, Words> = {
  paused: "Unpause it under Settings, then send it again.",
  template_not_approved: "Open it in the Library — it can be resubmitted.",
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
 * The next step past a failed run's reason, by how many it reached first; null for a code nobody has written words for. A
 * playbook's run that stopped for the workspace is told what its own next step is (stoppedRunFix), never to send it again.
 */
export function broadcastFailureFix(
  failure: string | null | undefined,
  reached = 0,
  run?: { playbook_id: string | null; trigger: string | null },
): string | null {
  if (!failure) return null;
  const read = readFailure(failure);
  if (!read) return null;
  if (isRunStop(read.code) && run?.playbook_id) return stoppedRunFix(read.code, run);
  const after = reached > 0 ? BROADCAST_FAILURE_FIX_AFTER[read.code] : undefined;
  return after ? after(reached, read.channel) : wordsFor(BROADCAST_FAILURE_FIX[read.code], read.channel) || null;
}

/** A failed broadcast's reason: its words, a code nobody has written words for yet, or none recorded. */
export function broadcastFailureWords(failure: string | null | undefined): string {
  if (!failure) return "no reason was recorded";
  const read = readFailure(failure);
  return read ? wordsFor(BROADCAST_FAILURE_WORDS[read.code], read.channel) : "it could not finish";
}
