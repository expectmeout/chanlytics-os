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
 * How long a new number's row says how to try it without being asked. The phone's own record that the number "isn't on
 * WhatsApp" lasts about an hour; a day covers the owner who connects in the evening and tries it in the morning. After
 * it the note is explanation again, behind the press beside the row's name.
 */
const TRY_IT_SAID_FOR_MS = DAY_MS;

const TRY_IT_NOTE =
  "Try it from your phone with this link. It opens the chat even while WhatsApp there still says the number isn't on WhatsApp.";

/**
 * WhatsApp opened on a connected number with a word ready to send: the way to try a number that skips the phone's own
 * record of who is on WhatsApp. Null without a usable number. The row's note and the toast a connection ends with open
 * the same link.
 */
export function tryItLink(number: string | null | undefined): string | null {
  return waMeLink(number, TRY_IT_TEXT);
}

/**
 * What a connected number says until a customer has written to it: how to try it from a phone, as a link to press.
 * WhatsApp on a phone keeps its own record of which numbers are on WhatsApp, and one that looked the number up before it
 * was registered reads "isn't on WhatsApp, invite" for about an hour (6 and 8 October: an owner took a number that had
 * just connected for one that had not). Its wa.me link asks WhatsApp afresh and the chat opens, so the link is the test:
 * said by the row itself for the number's first day (`live`), and kept behind the press after it. The link's words are
 * its address, which an owner reading on a desk can type into the phone.
 */
export function tryItNotes(wa: ChannelVM, nowMs: number): ConnectionNote[] {
  const digits = waMeDigits(wa.number);
  const href = tryItLink(wa.number);
  if (!digits || !href || wa.lastInboundMs !== null) return [];
  const age = nowMs - Date.parse(wa.created_at);
  const fresh = age >= 0 && age < TRY_IT_SAID_FOR_MS;
  return [{ text: TRY_IT_NOTE, link: { label: `wa.me/${digits}`, href }, ...(fresh ? { live: true as const } : {}) }];
}
