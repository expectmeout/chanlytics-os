/**
 * Which channels a campaign may go by, once its message is in view (One message, every channel, step 3; the
 * campaigns-on-every-channel spec, 4.4 and 4.10).
 *
 * A channel is usable for a send only if the workspace is ready on it (contracts reach-for.ts `channelsReady`: its
 * number, its texting line, its mailbox) AND the message holds a version there (contracts messageHolds: WhatsApp's row
 * approved and whole, and for email and text a row of the same name and language on that channel). Contracts'
 * `readyForMessage` puts the second into the first; what is here is which channels a request ticks and the refusal of a
 * tick the send cannot keep.
 */
import {
  AppError,
  CONSENT_CHANNELS,
  DEFAULT_CAMPAIGN_CHANNELS,
  channelChoices,
  channelNeverCarries,
  type AskedPurpose,
  type CampaignHow,
  type ConsentChannel,
} from "@chanlytics/contracts";

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
  const no = channelChoices(how.ready, purpose, how.about).find((c) => how.channels.includes(c.channel) && !c.ok);
  if (!no) return;
  const words = no.why ?? `${no.channel} is not ready to send on.`;
  if (channelNeverCarries(no.channel, purpose)) throw new AppError("validation", words);
  throw new AppError("conflict", words, 409);
}
