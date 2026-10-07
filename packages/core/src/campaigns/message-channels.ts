/**
 * Which channels a campaign may go by, once its message is in view (One message, every channel, step 3; the
 * campaigns-on-every-channel spec, 4.4 and 4.10).
 *
 * A channel is usable for a send only if the workspace is ready on it (contracts reach-for.ts `channelsReady`: its
 * number, its texting line, its mailbox) AND the message holds a version there (contracts messageHolds: WhatsApp's row
 * approved and whole, and for email and text a row of the same name and language on that channel). `readyForMessage`
 * puts the second into the first, in the words contracts messageWhyNot has for it, so every reader of "can this go by
 * email" asks one answer, and `reachFor` never enrols a person on a channel the message cannot be said on.
 */
import {
  AppError,
  CONSENT_CHANNELS,
  DEFAULT_CAMPAIGN_CHANNELS,
  channelChoices,
  channelNeverCarries,
  messageWhyNot,
  type AskedPurpose,
  type CampaignHow,
  type CampaignMessage,
  type ChannelsReady,
  type ConsentChannel,
} from "@chanlytics/contracts";

/** A message the workspace holds no row of (it was deleted): it holds nothing, and says so on every channel. */
const GONE: Pick<CampaignMessage, "versions"> = { versions: { whatsapp: null, email: null, sms: null } };

/**
 * The workspace's channels now, with the message in them: a channel that is ready but whose version the message does
 * not hold is not ready, and says so in the message's own sentence for it ("This message has no email version yet.",
 * "WhatsApp is still reviewing this message's WhatsApp version."). A channel the workspace is not ready on keeps its own
 * reason. What else the channel carries stays (email's `offers`, which the news by email and an offer are judged by:
 * closing the channel for a missing version must not make it say the campaigns domain is missing). `null` is a message
 * the workspace no longer holds.
 */
export function readyForMessage(
  ready: ChannelsReady,
  message: Pick<CampaignMessage, "versions"> | null,
): ChannelsReady {
  const out: ChannelsReady = { ...ready };
  for (const c of CONSENT_CHANNELS) {
    const why = messageWhyNot(message ?? GONE, c);
    if (ready[c].ready && why !== null) out[c] = { ...ready[c], ready: false, why };
  }
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
  const no = channelChoices(how.ready, purpose, how.about).find((c) => how.channels.includes(c.channel) && !c.ok);
  if (!no) return;
  const words = no.why ?? `${no.channel} is not ready to send on.`;
  if (channelNeverCarries(no.channel, purpose)) throw new AppError("validation", words);
  throw new AppError("conflict", words, 409);
}
