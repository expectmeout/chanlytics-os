/**
 * The sets of channels a campaign may tick, which the server counts a playbook's reach for and the browser counts a
 * broadcast's audiences for (One message, every channel, step 3; contracts reach-for.ts). A count depends on the set
 * ticked -- each person is reached once, on one of them -- so a composer that lets the owner tick and untick reads the
 * count for the set in front of it: the server and the browser both make the same ones, from this.
 */
import {
  DEFAULT_CAMPAIGN_CHANNELS,
  CONSENT_CHANNELS,
  channelChoices,
  type AskedPurpose,
  type ChannelsReady,
  type ConsentChannel,
  type MessageAbout,
} from "@chanlytics/contracts";

/**
 * The channels a campaign of this purpose may go by now: the workspace can send on them and the purpose allows them. `about`
 * is what the campaign's message is about (a visit or proposal moment's is theirs, a broadcast's and any other moment's ours),
 * which decides by email whether the message is an offer (contracts isOfferByEmail, decision D2).
 */
export function channelsOpenFor(ready: ChannelsReady, purpose: AskedPurpose, about: MessageAbout): ConsentChannel[] {
  return channelChoices(ready, purpose, about)
    .filter((c) => c.ok)
    .map((c) => c.channel);
}

/** Whether two ticks are the same set of channels, whatever their order. */
export function sameChannels(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((c) => b.includes(c));
}

/** The channels of a set that are open, in the order the page offers them. */
export function openAmong(channels: readonly string[], open: readonly ConsentChannel[]): ConsentChannel[] {
  return CONSENT_CHANNELS.filter((c) => channels.includes(c) && open.includes(c));
}

/**
 * Every set a campaign of this purpose may tick, except the default (WhatsApp alone, which a count carries beside them):
 * each non-empty choice among the channels open to it, in the page's order. One channel open, or none, has none.
 */
export function otherChannelSets(ready: ChannelsReady, purpose: AskedPurpose, about: MessageAbout): ConsentChannel[][] {
  const open = channelsOpenFor(ready, purpose, about);
  const sets: ConsentChannel[][] = [];
  for (let mask = 1; mask < 1 << open.length; mask += 1) sets.push(open.filter((_, i) => (mask >> i) & 1));
  return sets.filter((s) => !sameChannels(s, DEFAULT_CAMPAIGN_CHANNELS));
}
