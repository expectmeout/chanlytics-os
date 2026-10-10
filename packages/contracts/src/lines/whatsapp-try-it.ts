/**
 * Try a WhatsApp number that has just connected: the link that opens its chat, and the note a Connections row says with it.
 *
 * WhatsApp on a phone keeps its own record of which numbers are on WhatsApp. A phone that looked a number up before it was
 * registered (an owner's own, with the business's number in its contacts) reads "isn't on WhatsApp, invite" for about an
 * hour after the number connects, and an owner takes a number that works for one that does not (6 and 8 October 2026). The
 * number's wa.me link asks WhatsApp afresh and the chat opens, so the link is the test: the row offers it to press, and the
 * toast a connection ends with opens the same one.
 */
import { waMeDigits, waMeLink } from "../shared/enums";
import { DAY_MS } from "../shared/time";
import type { ChannelVM } from "./channels";
import type { ConnectionNote } from "./connection-note";

/** What the try-it link opens the chat with: one word ready to send, so the first test is a tap and a send. */
const TRY_IT_TEXT = "Hi";

/**
 * How long after a number connects its row says how to try it without being asked. The phone's own record lasts about an
 * hour; a day covers the owner who connects in the evening and tries it in the morning. After it the note is explanation
 * again, behind the press beside the row's name.
 */
const TRY_IT_LIVE_WITHIN_MS = DAY_MS;

/** The note's words; the link follows them on the row, its address as its label. */
const TRY_IT_NOTE =
  "Try it from your phone with this link, not by searching your contacts: it opens the chat even while WhatsApp there still says the number isn't on WhatsApp.";

/** WhatsApp opened on a connected number with a word ready to send; null without a usable number. */
export function tryItLink(number: string | null | undefined): string | null {
  return waMeLink(number, TRY_IT_TEXT);
}

/**
 * The try-it note of a number nobody has written to yet, with its link to press; none once a message has arrived. Said by
 * the row itself (`live`) for a day from the number's connection, the stamp a connection writes (a number connected again
 * keeps its row and the row's birth), else the row's birth; kept behind the press after it. The link's words are its
 * address, which an owner reading on a desk can type into the phone.
 */
export function tryItNotes(wa: ChannelVM, nowMs: number): ConnectionNote[] {
  const digits = waMeDigits(wa.number);
  const href = tryItLink(wa.number);
  if (!digits || !href || wa.lastInboundMs !== null) return [];
  const age = nowMs - Date.parse(wa.connectedAt ?? wa.created_at);
  const fresh = age >= 0 && age < TRY_IT_LIVE_WITHIN_MS;
  return [{ text: TRY_IT_NOTE, link: { label: `wa.me/${digits}`, href }, ...(fresh ? { live: true as const } : {}) }];
}
