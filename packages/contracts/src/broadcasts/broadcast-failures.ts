/**
 * Why a run failed, in the owner's words, and what to do about it. Moved whole from broadcasts.ts (Reach out Part
 * 2.5), which re-exports it.
 */
import type { DeliveryRefusal } from "../consent/consent";
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";

/**
 * The codes a run's `failure` holds: what the send job writes (core messages/broadcast.ts) and the one the job ledger
 * writes when a run died and none took it up again (jobs settle.ts). The column is free text, so the set is closed
 * here, and each table below is keyed by it: a code added without its words does not compile.
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
 * The door's refusals that are a fact about the whole workspace, or about the deployment's lane for its offers by email,
 * and never about the person it was asked of, with the failure a run stops with when it meets one: a billing pause, the
 * workspace's offers by email paused by a gate (email-offers.ts), and the campaigns domain this runtime does not hold, which
 * the business's news by email needs as an offer does (decision D2). Everyone left on the run would meet the same refusal,
 * so the run stops with that failure and leaves them unsent, rather than burn each as a final skip and end as "sent" (core
 * messages/broadcast.ts). THE one list, below; a refusal that is the person's own (a stop, an address that bounced) is not on it.
 */
export type WorkspaceFailure = Extract<
  BroadcastFailure,
  "paused" | "email_offers_paused" | "campaigns_domain_unverified"
>;

/** The failure a run stops with for a refusal that holds for the whole workspace, or null for the person's own. */
export function workspaceRefusalFailure(reason: DeliveryRefusal): WorkspaceFailure | null {
  switch (reason) {
    case "paused":
      return "paused";
    case "email_offers_paused":
      return "email_offers_paused";
    case "email_marketing_disabled":
      return "campaigns_domain_unverified";
    default:
      return null;
  }
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

/** The next step past a failed run's reason, by how many it reached first; null for a code nobody has written words for. */
export function broadcastFailureFix(failure: string | null | undefined, reached = 0): string | null {
  if (!failure) return null;
  const read = readFailure(failure);
  if (!read) return null;
  const after = reached > 0 ? BROADCAST_FAILURE_FIX_AFTER[read.code] : undefined;
  return after ? after(reached, read.channel) : wordsFor(BROADCAST_FAILURE_FIX[read.code], read.channel) || null;
}

/** A failed broadcast's reason: its words, a code nobody has written words for yet, or none recorded. */
export function broadcastFailureWords(failure: string | null | undefined): string {
  if (!failure) return "no reason was recorded";
  const read = readFailure(failure);
  return read ? wordsFor(BROADCAST_FAILURE_WORDS[read.code], read.channel) : "it could not finish";
}
