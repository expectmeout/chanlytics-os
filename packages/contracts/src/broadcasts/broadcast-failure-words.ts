/**
 * A broadcast failure's code and the owner's words for it: the closed set a run's `failure` holds, how a stored one is
 * read (with the channel it names), and the sentence for each. Moved whole from broadcast-failures.ts, which imports
 * and re-exports it, so a reader of the words alone (the Activity log, in the browser) does not carry the playbook
 * triggers that the fixes beside them need.
 */
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";

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

/** The failures whose words name the wire the run went out on: the rest read the same whichever channel it was. */
const WIRE_FAILURES = ["wire_unavailable", "throttled", "stalled"] as const satisfies readonly BroadcastFailure[];
export type WireFailure = (typeof WIRE_FAILURES)[number];

const isFailure = (code: string): code is BroadcastFailure => (BROADCAST_FAILURES as readonly string[]).includes(code);
const isWireFailure = (code: BroadcastFailure): code is WireFailure =>
  (WIRE_FAILURES as readonly string[]).includes(code);

/** A stored failure read: its code and the channel it names (WhatsApp where it names none); null for any other text. */
export function readFailure(stored: string): { code: BroadcastFailure; channel: ConsentChannel } | null {
  const [code, named, ...rest] = stored.split(":");
  if (code === undefined || !isFailure(code) || rest.length > 0) return null;
  if (named === undefined) return { code, channel: "whatsapp" };
  const channel = CONSENT_CHANNELS.find((c) => c === named);
  return channel && isWireFailure(code) ? { code, channel } : null;
}

/** A words entry: the same on every channel, or one for each. */
export type Words = string | Record<ConsentChannel, string>;
export const wordsFor = (w: Words, channel: ConsentChannel): string => (typeof w === "string" ? w : w[channel]);

/**
 * Why a whole broadcast stopped, in the owner's words: the codes the send job writes (core messages/broadcast.ts)
 * and the one the job ledger writes when a run died and none took it up again (jobs settle.ts). Spelled out, as
 * HELD_REASONS is, so the bundler can see through it. A failure that names its wire (WIRE_FAILURES) has one entry per
 * channel, and a code stored with no channel is read as WhatsApp's (readFailure).
 */
export const BROADCAST_FAILURE_WORDS: Record<BroadcastFailure, Words> = {
  paused: "the workspace was paused",
  template_not_approved: "its WhatsApp version is no longer approved",
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

/** A failed broadcast's reason: its words, a code nobody has written words for yet, or none recorded. */
export function broadcastFailureWords(failure: string | null | undefined): string {
  if (!failure) return "no reason was recorded";
  const read = readFailure(failure);
  return read ? wordsFor(BROADCAST_FAILURE_WORDS[read.code], read.channel) : "it could not finish";
}
