/**
 * Whether AI can answer the WhatsApp chat an ad opens: the ad's way in (decision 0050, call 11; the Ads plan's 5.1 and G13).
 *
 * An ad made here names one WhatsApp number (the ad set's `whatsapp_phone_number`), and a tap on it opens a chat with that
 * number. Someone who writes there is answered only where every one of these holds, and each is read where it already is:
 *
 *   stopped    AI is stopped (Stop everything): nothing is answered.
 *   paused     the workspace's billing is paused: new messages wait in the Inbox for a person (lines/caller-gets.ts).
 *   no_number  the number the ad names is not the workspace's active WhatsApp number: none is connected, it was switched
 *              off or disconnected, or another one is (a message to a line that is off is neither answered nor recorded).
 *   unread     what Meta holds about the number is not known: never read, or a word of Meta's that is none of its three.
 *              Not known is not open: Turn on is refused until it is read, and a running ad is told only once it stays so.
 *   blocked    Meta says the number may not send, replies included (lines/number-standing.ts repliesGoOf, the one reading
 *              of Meta's word that Connections' row says too).
 *
 * The order is the one an owner mends them in, AI's own stop first. New ad says the first as the one thing missing, Turn on
 * refuses on it at the press and again just before the ad is switched on, and the read of a running ad's way in says it
 * as Needs you. Nothing here reads a database or asks Meta: it is given what was read.
 */
import { repliesGoOf } from "../lines/number-standing";

/** Why AI can't answer the chat an ad opens, or `open` where it can. */
export type AdWayIn = "open" | "stopped" | "paused" | "no_number" | "unread" | "blocked";

export interface AdWayInFacts {
  /** The number the ad names, as dialled (any punctuation); null for an ad that names none. */
  named: string | null;
  /**
   * The workspace's active WhatsApp number, and Meta's word for whether it may send (`can_send`) as it was last read; null
   * with no active number. `canSend` null: nothing was read.
   */
  number: { e164: string | null; canSend: string | null } | null;
  /** The workspace's billing is paused (tenants.status). */
  paused: boolean;
  /** AI is stopped. */
  stopped: boolean;
}

/** A number as its digits, so "+1 (305) 555-0142" and "+13055550142" are one. */
const digitsOf = (number: string | null): string => (number ?? "").replace(/\D/g, "");

/** The ad's way in: `open` where AI answers the chat it opens, else the first thing that stops it. */
export function adWayInOf(facts: AdWayInFacts): AdWayIn {
  if (facts.stopped) return "stopped";
  if (facts.paused) return "paused";
  const named = digitsOf(facts.named);
  if (!facts.number || named === "" || digitsOf(facts.number.e164) !== named) return "no_number";
  const goes = repliesGoOf(facts.number.canSend);
  if (goes === null) return "unread";
  return goes ? "open" : "blocked";
}
