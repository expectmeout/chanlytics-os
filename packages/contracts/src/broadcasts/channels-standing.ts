/**
 * Where the workspace stands on its channels, said once at the head of Campaigns (the spec of 8 October 2026, "A campaign
 * says where it goes"): the channels it can send on now as one clause ("Sending on WhatsApp and by email"), then each
 * closed one with the reason the readiness already carries ("Text: no texting line yet"), the reason being a door to
 * Settings › Connections where the owner can mend it there. Every word is one the product already says of a channel
 * (VERSION_CHANNEL_WORDS, CONSENT_CHANNEL_WORDS, CHANNEL_WORDS): nothing here is a second spelling.
 */
import { CONSENT_CHANNELS, CONSENT_CHANNEL_WORDS, type ConsentChannel } from "../consent/consent-channels";
import { VERSION_CHANNEL_WORDS } from "../templates/message-versions";
import { joinWords } from "../shared/words";
import { WORKSPACE_PAUSED_FACT } from "../workspace/billing";
import { CHANNEL_WORDS, type ChannelsReady } from "./reach-for";

/** Where the closed channels are mended: Settings › Connections (the shell's address for it). */
export const CHANNELS_DOOR = "admin/integrations";

/** Where a paused workspace is resumed: Settings › Billing. */
const BILLING_DOOR = "admin/billing";

/** One part of the head's line: the open channels together, or one closed channel with its reason. */
export interface ChannelStandingPart {
  /** The channel a closed part is about; null for the clause of the open ones. */
  channel: ConsentChannel | null;
  /** The open channels this part names (every one, for the open clause; the one, for a closed part). */
  channels: ConsentChannel[];
  open: boolean;
  words: string;
  /** Where the owner mends it, for a closed channel the workspace can mend; null for the open clause and for what no setting fixes. */
  door: string | null;
}

/**
 * What no setting of the workspace fixes: a check that could not be made just now, a deployment without an email wire,
 * and a texting line that waits on the carriers or is a test filing. A closed channel with any other reason has its door.
 */
const NO_DOOR: readonly string[] = [
  CHANNEL_WORDS.unchecked,
  CHANNEL_WORDS.noEmailDomain,
  CHANNEL_WORDS.textLineNotActive,
  CHANNEL_WORDS.textLineMock,
];

/** A reason as a line's words: the sentence the readiness carries, without its full stop, after the channel's name. */
function closedWords(channel: ConsentChannel, why: string | null): string {
  const reason = (why ?? "").replace(/\.$/, "");
  return reason ? `${VERSION_CHANNEL_WORDS[channel]}: ${reason}` : `${VERSION_CHANNEL_WORDS[channel]} is off`;
}

/**
 * The head's channel line in parts: the open channels first as one clause, then each closed channel. Null where the
 * readiness could not be read (the page then says nothing of channels, as the composer says nothing); an empty clause
 * where nothing is open ("Nothing can send yet"). A workspace paused for billing sends on none of them, whatever each
 * could do (core deliver.ts): the line is that fact alone, with its door to Billing, never "Sending on WhatsApp" over a
 * week of rows that say nothing goes.
 */
export function channelsStandingParts(ready: ChannelsReady | null | undefined): ChannelStandingPart[] | null {
  if (!ready) return null;
  if (ready.paused === true)
    return [{ channel: null, channels: [], open: false, words: WORKSPACE_PAUSED_FACT, door: BILLING_DOOR }];
  const open = CONSENT_CHANNELS.filter((c) => ready[c].ready);
  const closed = CONSENT_CHANNELS.filter((c) => !ready[c].ready);
  const parts: ChannelStandingPart[] = [
    {
      channel: null,
      channels: open,
      open: true,
      words:
        open.length > 0 ? `Sending ${joinWords(open.map((c) => CONSENT_CHANNEL_WORDS[c]))}` : "Nothing can send yet",
      door: null,
    },
  ];
  for (const c of closed) {
    const why = ready[c].why;
    parts.push({
      channel: c,
      channels: [c],
      open: false,
      words: closedWords(c, why),
      door: why && NO_DOOR.includes(why) ? null : CHANNELS_DOOR,
    });
  }
  return parts;
}

/** The same line as one string, for a screen reader, a test or a toast: the parts joined by the page's dot. */
export function channelsStandingWords(parts: readonly ChannelStandingPart[]): string {
  return parts.map((p) => p.words).join(" · ");
}
