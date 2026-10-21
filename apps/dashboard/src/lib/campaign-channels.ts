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
  playbookPoolKey,
  type AskedPurpose,
  type ChannelsReady,
  type ConsentChannel,
  type MessageAbout,
  type RunSplit,
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

/**
 * One moment's count as GET playbooks answers it (server/campaigns/playbook-pools.ts TriggerPool): the figures for WhatsApp
 * alone, as every playbook went before, and, beside them, the same figures for each other set of channels a playbook on it
 * may tick, so the composer reads the count for the set in front of it as the owner ticks and unticks.
 */
export interface PoolRead {
  candidates: number;
  held: number;
  pool: number;
  noYes: number;
  stopped: number;
  noNumber: number;
  saidYes: number;
  no_address?: number;
  address_stopped?: number;
  no_channel?: number;
  by_channel?: Record<ConsentChannel, number>;
  run_split?: RunSplit;
  by?: Array<Omit<PoolRead, "by"> & { channels: readonly string[] }>;
}

/**
 * A count for the channels a playbook goes by: the figures for WhatsApp alone where it ticks that, the widest set the
 * count kept that lies within what it ticks, and, where none can carry it (a channel it ticks is not open to its
 * message), everyone the moment names left out with no channel to go by. Null where the moment was not counted.
 */
export function readingFor(
  pool: PoolRead | null | undefined,
  channels: readonly string[] | null | undefined,
): Omit<PoolRead, "by"> | null {
  if (!pool) return null;
  // None named is a playbook made before channels: WhatsApp alone. An empty set is none: no channel can carry it.
  const want = channels ?? DEFAULT_CAMPAIGN_CHANNELS;
  if (sameChannels(want, DEFAULT_CAMPAIGN_CHANNELS)) return pool;
  const within = (pool.by ?? []).filter((b) => b.channels.every((c) => want.includes(c)));
  const widest = within.sort((a, b) => b.channels.length - a.channels.length)[0];
  if (widest) return widest;
  if (want.includes("whatsapp")) return pool;
  // No channel it goes by can carry it: everyone is held on that, and a closed channel takes back no one's yes.
  return {
    candidates: 0,
    held: 0,
    pool: pool.pool,
    noYes: 0,
    stopped: 0,
    noNumber: 0,
    saidYes: pool.saidYes,
    no_address: 0,
    address_stopped: 0,
    no_channel: pool.pool,
    by_channel: { whatsapp: 0, sms: 0, email: 0 },
  };
}

/**
 * The key of the count a playbook's reach is read from (GET playbooks' `pools`): its own where its message is stricter
 * than its moment (the route's strictMessagePools: its run enrols by the message's yes), else its list's token on a list
 * (`seg:<key>` for People's, `list:<id>` for the workspace's own, decision 0009), else its moment's. The card's count and
 * a sequence's Turn on (readers/sequences.ts sequenceReach) read it so, so the two never say two numbers for one run.
 */
export function playbookCountKey(
  p: { id: string; trigger: string; list_id?: string | null; list_key?: string | null },
  pools: Readonly<Record<string, unknown>>,
): string {
  if (playbookPoolKey(p.id) in pools) return playbookPoolKey(p.id);
  if (p.trigger !== "saved_list") return p.trigger;
  return p.list_key ? `seg:${p.list_key}` : `list:${p.list_id ?? ""}`;
}
