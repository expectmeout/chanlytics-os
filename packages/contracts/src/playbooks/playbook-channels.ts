/**
 * The channels a playbook goes by, read once (the review of 8 October 2026). What it keeps, what it goes by now and how
 * each of WhatsApp, text and email stands for it are one reading, made of the rules that already judge a channel
 * (reach-for.ts channelChoices and channelNeverCarries, campaign-message.ts readyForMessage, playbook-purpose.ts
 * enrolPurpose). The composer's Send by row, the drawer's Goes by row, the marks on the home's rail and the channels a
 * new playbook opens on all read it, so none says of a channel what another denies: the rail read the workspace's
 * readiness alone, and said "could also go by Text" of an offer, which no text carries, and "on" of a channel whose
 * version the message did not hold, which its own drawer said waits.
 */
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import type { AskedPurpose, MessageAbout } from "../consent/consent";
import {
  DEFAULT_CAMPAIGN_CHANNELS,
  channelChoices,
  channelNeverCarries,
  newCampaignChannels,
  type ChannelsReady,
} from "../broadcasts/reach-for";
import { readyForMessage, type CampaignMessage } from "../templates/campaign-message";
import { enrolPurpose, messageAboutOfTrigger } from "./playbook-purpose";
import { triggerOf } from "./playbook-triggers";

/**
 * How a channel stands for one playbook: on, it goes by it now; waits, the playbook keeps it and cannot go by it yet (no
 * line, no version, offers closed, the workspace paused: a run holds those people until it can); could, it may go by it
 * now and does not tick it (what one more tick opens); off, neither.
 */
export type ChannelStand = "on" | "waits" | "could" | "off";

/**
 * A message as far as its channels read it: its category (which with the moment's class says what a run is for) and the
 * versions it holds. A row stamped before messages were kept has WhatsApp's version alone (WHATSAPP_VERSION_ALONE).
 */
export interface PlaybookMessage {
  category: string | null;
  versions: CampaignMessage["versions"];
}

/**
 * The message in view before one is picked, and for a row stamped before messages were kept: WhatsApp's version alone,
 * approved, as every campaign opened. What a page hands readyForMessage where it holds no message.
 */
export const WHATSAPP_VERSION_ALONE: Pick<CampaignMessage, "versions"> = {
  versions: {
    whatsapp: { id: "", status: "approved", hidden: false, blocked: null, reason: null },
    email: null,
    sms: null,
  },
};

/** The channels a campaign's row names, in the product's order: WhatsApp alone where it names none, as one made before them. */
export function campaignChannelsOf(channels: readonly string[] | null | undefined): ConsentChannel[] {
  const named = CONSENT_CHANNELS.filter((c) => (channels ?? []).includes(c));
  return named.length > 0 ? named : [...DEFAULT_CAMPAIGN_CHANNELS];
}

/** One reading of a playbook's channels. */
export interface PlaybookChannelsRead {
  /** What its runs are for (enrolPurpose): the stricter of its moment's class and its message's category. */
  purpose: AskedPurpose;
  /** What its message is about (messageAboutOfTrigger): by email it decides whether the message is an offer. */
  about: MessageAbout;
  /** The workspace's channels with the message's versions laid over them (readyForMessage); the workspace's own with no message in view. */
  ready: ChannelsReady;
  /** Each channel, with whether a playbook of this kind may go by it now and why not (channelChoices). */
  choices: ReturnType<typeof channelChoices>;
  /** What it ticks, in the product's order. */
  ticked: ConsentChannel[];
  /**
   * What it keeps: every channel it ticks that its kind of message may ever go by, open now or not. A save sends these,
   * and a press on one switch starts from these, so a channel kept and waiting is never let go by a press on another.
   */
  kept: ConsentChannel[];
  /** What it goes by now: kept, and open. */
  on: ConsentChannel[];
  stands: Record<ConsentChannel, ChannelStand>;
}

/**
 * A playbook's channels, read. `p` is the playbook, or a composer's fields as one: its moment, and for a playbook on a
 * list the class it sends under. `ticks` are the channels it names (a stored row's through campaignChannelsOf), or
 * "new" for a playbook nobody has ticked a channel for yet, which takes the ones a new playbook opens on
 * (newCampaignChannels) for the message in view. `message` is the message it sends, null where none is in view (a composer
 * before one is picked: only what the workspace cannot send on closes a channel then). `workspace` is what the workspace
 * can send on now.
 */
export function playbookChannelsRead(
  p: { trigger: string | null; policy_class?: string | null },
  ticks: readonly string[] | "new",
  message: PlaybookMessage | null,
  workspace: ChannelsReady,
): PlaybookChannelsRead {
  const trig = triggerOf(p.trigger ?? "");
  const cls = trig?.kind === "saved" ? (p.policy_class ?? null) : (trig?.cls ?? null);
  const purpose = enrolPurpose(cls, message ? { category: message.category } : null);
  const about = messageAboutOfTrigger(p.trigger);
  const ready = message ? readyForMessage(workspace, message) : workspace;
  const choices = channelChoices(ready, purpose, about);
  const open = choices.filter((c) => c.ok).map((c) => c.channel);
  const ticked =
    ticks === "new"
      ? newCampaignChannels("playbook", message ? open : null)
      : CONSENT_CHANNELS.filter((c) => ticks.includes(c));
  const kept = ticked.filter((c) => channelNeverCarries(c, purpose) === null);
  const on = kept.filter((c) => open.includes(c));
  // A paused workspace sends nothing (core deliver.ts): whatever a channel could do, nothing goes by it now, and a
  // channel it keeps waits. What is ticked, kept and open stay as they are: they are the playbook's, not the pause's.
  const paused = workspace.paused === true;
  const stands = Object.fromEntries(
    CONSENT_CHANNELS.map((c): [ConsentChannel, ChannelStand] => [
      c,
      kept.includes(c) ? (on.includes(c) && !paused ? "on" : "waits") : open.includes(c) ? "could" : "off",
    ]),
  ) as Record<ConsentChannel, ChannelStand>;
  return { purpose, about, ready, choices, ticked, kept, on, stands };
}
