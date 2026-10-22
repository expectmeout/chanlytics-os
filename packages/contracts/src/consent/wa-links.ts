/**
 * A WhatsApp chat opened from a link (wa.me): the digits a link takes of a number, the link with words ready to send, and
 * the opt-in's own link, with the phrase a customer sends to say yes to offers. Moved from shared/enums.ts, which holds
 * the closed sets (decision 0070 needed the room there).
 */
import { OFFERS_OPT_IN_PHRASES } from "../shared/enums";

/**
 * What a wa.me link takes of a number: its digits, with no plus, spaces or brackets, from the number as E.164 or as it is shown, or
 * null where there are too few to be one. The one place that says it: the links below (waMeLink) and the Connections row's "try it" note.
 */
export function waMeDigits(number: string | null | undefined): string | null {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits.length < 8 ? null : digits;
}

/** WhatsApp opened on a number, with words ready to send where there are any; null without a usable number. */
export function waMeLink(number: string | null | undefined, text?: string): string | null {
  const digits = waMeDigits(number);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** WhatsApp opened on the workspace's number with the phrase ready to send; null without a usable number. */
export function optInLink(
  numberE164: string | null | undefined,
  phrase: string = OFFERS_OPT_IN_PHRASES.en,
): string | null {
  return waMeLink(numberE164, phrase);
}
