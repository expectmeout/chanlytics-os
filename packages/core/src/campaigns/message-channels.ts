/**
 * Which channels a campaign may go by, once its message is in view (One message, every channel, step 3; the
 * campaigns-on-every-channel spec, 4.4 and 4.10).
 *
 * A channel is usable for a send only if the workspace is ready on it (contracts reach-for.ts `channelsReady`: its
 * number, its texting line, its mailbox) AND the message has a version there: WhatsApp's approved row, and for email
 * and text a row of the same name and language on that channel (contracts message-versions.ts). `readyForMessage` puts
 * the second into the first, so every reader of "can this go by email" asks one answer, and `reachFor` never enrols a
 * person on a channel the message cannot be said on.
 */
import {
  AppError,
  CONSENT_CHANNELS,
  DEFAULT_CAMPAIGN_CHANNELS,
  channelChoices,
  channelNeverCarries,
  type AskedPurpose,
  type CampaignHow,
  type ChannelsReady,
  type ConsentChannel,
} from "@chanlytics/contracts";

/** What a channel says when the message has no version on it. */
const NO_VERSION: Record<ConsentChannel, string> = {
  whatsapp: "This message has no approved WhatsApp version.",
  email: "This message has no email version yet.",
  sms: "This message has no text version yet.",
};

/**
 * The channels a message holds a version on: WhatsApp's when its row is approved (the caller has read it), and each of
 * email and text when the workspace has filed a version of that name and language there. `own` is the channels, of
 * email and text, that hold one (a port's answer); a channel it does not name has none.
 */
export function versionsHeld(own: readonly string[], whatsapp: boolean): Record<ConsentChannel, boolean> {
  return { whatsapp, email: own.includes("email"), sms: own.includes("sms") };
}

/**
 * The workspace's channels now, with the message in them: a channel that is ready but has no version of the message
 * is not ready, and says so in a sentence ("This message has no email version yet."). A channel the workspace is not
 * ready on keeps its own reason.
 */
export function readyForMessage(ready: ChannelsReady, has: Record<ConsentChannel, boolean>): ChannelsReady {
  const out: ChannelsReady = { ...ready };
  for (const c of CONSENT_CHANNELS) if (ready[c].ready && !has[c]) out[c] = { ready: false, why: NO_VERSION[c] };
  return out;
}

/**
 * The channels a request ticks: `channels` as the body names them, WhatsApp alone when it names none (so nothing made
 * before changes), in the product's order (contracts CONSENT_CHANNELS). Anything but a list of the three is refused.
 * `kept` is the channels a playbook already holds, which an edit that names none keeps.
 */
export function parseChannels(asked: unknown, kept: readonly string[] | null = null): ConsentChannel[] {
  if (asked === undefined || asked === null) {
    const base = kept && kept.length > 0 ? kept : DEFAULT_CAMPAIGN_CHANNELS;
    return CONSENT_CHANNELS.filter((c) => base.includes(c));
  }
  const list: unknown[] = Array.isArray(asked) ? asked : [];
  const known = CONSENT_CHANNELS.filter((c) => list.includes(c));
  if (known.length === 0 || known.length !== new Set(list).size)
    throw new AppError("validation", "Pick WhatsApp, text or email to send by.");
  return known;
}

/**
 * A tick the send cannot keep, refused at create (spec 4.10: not at send), in the words of contracts channelChoices: a
 * channel the purpose never carries (texts carry no offers) is a request that is wrong; one the workspace is not ready
 * on, or whose message has no version, is a state of the workspace that is not.
 */
export function refuseTicks(how: CampaignHow, purpose: AskedPurpose): void {
  const no = channelChoices(how.ready, purpose).find((c) => how.channels.includes(c.channel) && !c.ok);
  if (!no) return;
  const words = no.why ?? `${no.channel} is not ready to send on.`;
  if (channelNeverCarries(no.channel, purpose)) throw new AppError("validation", words);
  throw new AppError("conflict", words, 409);
}
