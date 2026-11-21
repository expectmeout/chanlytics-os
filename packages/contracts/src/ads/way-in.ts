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
 *              of Meta's word that Connections' row says too, which the caller hands here read).
 *
 * The order is the one an owner mends them in, AI's own stop first. New ad says the first as the one thing missing, Turn on
 * refuses on it at the press and again just before the ad is switched on, and the read of a running ad's way in says it
 * as Needs you. Nothing here reads a database or asks Meta: it is given what was read.
 */
import { samePhone } from "../shared/phone";
import { numberFormat } from "../shared/time";
import { minorPerUnit } from "./money";

/** Why AI can't answer the chat an ad opens, or `open` where it can. */
export type AdWayIn = "open" | "stopped" | "paused" | "no_number" | "unread" | "blocked";

export interface AdWayInFacts {
  /** The number the ad names, as dialled (any punctuation); null for an ad that names none. */
  named: string | null;
  /**
   * The workspace's active WhatsApp number, and whether a reply goes out from it: Meta's word (`can_send`) as it was last
   * read, through lines' one reading of it (repliesGoOf). Null with no active number; `repliesGo` null: not known, from
   * nothing read or a word of Meta's that is none of its three.
   */
  number: { e164: string | null; repliesGo: boolean | null } | null;
  /** The workspace's billing is paused (tenants.status). */
  paused: boolean;
  /** AI is stopped. */
  stopped: boolean;
}

/** The ad's way in: `open` where AI answers the chat it opens, else the first thing that stops it. */
export function adWayInOf(facts: AdWayInFacts): AdWayIn {
  if (facts.stopped) return "stopped";
  if (facts.paused) return "paused";
  // One number however it is written: "+1 (305) 555-0142" is "+13055550142"; nothing named is never a match.
  if (!facts.number || !samePhone(facts.named, facts.number.e164)) return "no_number";
  if (facts.number.repliesGo === null) return "unread";
  return facts.number.repliesGo ? "open" : "blocked";
}

/** Why AI can't answer a running ad's chat, as the bell's row and the ad's drawer say it, in the owner's words. */
export const AD_WAY_IN_SAID: Record<Exclude<AdWayIn, "open">, string> = {
  stopped: "AI is stopped, so nobody answers the people it brings.",
  paused: "Billing is paused, so the people it brings wait in the Inbox for a person.",
  no_number: "The WhatsApp number it opens is no longer the one AI answers.",
  unread: "WhatsApp hasn't said for an hour whether its number can answer.",
  blocked: "Meta stopped its WhatsApp number sending, so AI can't reply.",
};

/** What is left to spend, in the account's own money, exact: "$64.20", "$70", "¥1,284". */
function leftToSpend(minor: number, currency: string): string {
  const perUnit = minorPerUnit(currency);
  const digits = minor % perUnit === 0 ? 0 : String(perUnit).length - 1;
  const fraction = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return /^[A-Za-z]{3}$/.test(currency)
    ? numberFormat("en-US", { style: "currency", currency, ...fraction }).format(minor / perUnit)
    : `${numberFormat("en-US", fraction).format(minor / perUnit)} ${currency}`.trim();
}

/**
 * The bell's row for a running ad whose way in closed (decision 0050, call 11; the database rings it, 00676
 * ad_way_in_keep): which ad, why AI can't answer the people it brings, what it can still spend of its total (where Meta
 * holds one), and the one thing to do.
 */
export function adWayInRowOf(ad: {
  name: string;
  wayIn: Exclude<AdWayIn, "open">;
  leftMinor: number | null;
  currency: string;
}): { title: string; body: string } {
  const name = ad.name.length > 80 ? `${ad.name.slice(0, 79)}…` : ad.name;
  const spends =
    ad.leftMinor === null
      ? "Meta charges while it runs."
      : `It can still spend ${leftToSpend(ad.leftMinor, ad.currency)} of its total.`;
  return {
    title: `“${name}” is on, and AI can't answer it`,
    body: `${AD_WAY_IN_SAID[ad.wayIn]} ${spends} Pause it, or open it to see what to mend.`,
  };
}
