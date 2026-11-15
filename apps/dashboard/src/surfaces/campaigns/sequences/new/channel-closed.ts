/**
 * Why a channel cannot carry a step's message in New's channel picker (split out of new-sheets.tsx, which it would have
 * taken past its length): a rule that closes it for an offer, said in the rule's own words and with nothing to press (a
 * text never carries one, nor an email where offers by email cannot go here: the clean list, 14 Nov 2026); no version
 * of the message for it; or not connected yet, which the picker draws with the door that connects it.
 */
import { NEW_WORDS as W, type ConsentChannel } from "@chanlytics/contracts";

/** A channel not connected yet: its row says so with the door that connects it, where every "can't send on" door lands. */
export const UNCONNECTED = "unconnected";

/** What the picker knows of the step's message and the workspace, for one channel's row. */
interface StepChannels {
  offer: boolean;
  /** The channels the message has a version for. */
  holds: readonly ConsentChannel[];
  /** The channels the workspace can send on now. */
  ready: readonly ConsentChannel[];
  /** Why an offer cannot go by email here, or null where it can (DraftReads.offersByEmail). */
  offersByEmail?: string | null | undefined;
}

/** Why the channel cannot carry the step's message, or null where it can (UNCONNECTED: not connected yet). */
export function closedReasonOf(channel: ConsentChannel, step: StepChannels): string | null {
  if (step.offer && channel === "sms") return W.channels.noOffer;
  if (step.offer && channel === "email" && step.offersByEmail) return step.offersByEmail;
  if (!step.holds.includes(channel)) return W.channels.noVersion;
  return step.ready.includes(channel) ? null : UNCONNECTED;
}
