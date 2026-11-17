/**
 * The call's text on Settings › Business (Campaigns, one tab, call C9, 17 Nov 2026): the message a call sends the booking
 * link to a caller's WhatsApp as (templates/order.ts bookingTemplate), which lived in Messages until Messages folded into
 * Campaigns. It is set up where the abilities card says what AI does on a call, which already asks whether there is one:
 * the booking-link row carries the one press that sends the ready-made call's text to WhatsApp, says WhatsApp is checking
 * it, or opens it where WhatsApp turned it down, where AI writes new words.
 */
import { WHATSAPP_REVIEW_TAKES } from "../../campaigns/templates/templates";
import type { AbilityInputs } from "./abilities";

/** The call's text by its name: the ready-made message (starter-templates/table.ts), filed by its key. */
export const CALL_TEXT_NAME = "call_text";

/**
 * Whether a call wants the call's text and has none it can send: a phone line and WhatsApp live, a booking link to send,
 * bookings not held on the Autonomy tab, and no approved message that carries the link (bookingTemplate). The row then
 * says what a call does instead (abilities.ts bookingLinkDetail) and carries the press.
 */
export function callTextWanted(inputs: AbilityInputs): boolean {
  return (
    inputs.voiceLive &&
    inputs.whatsappLive &&
    inputs.hasBookingLink &&
    !inputs.bookingHeld &&
    !inputs.hasBookingTemplate
  );
}

/** Where the call's text stands on WhatsApp: none on file, WhatsApp checking it, or one to open (turned down, paused). */
export type CallTextStand = "none" | "checking" | "open";

/**
 * The call's text's stand, of the workspace's WhatsApp rows (every status), over every language it is on file in, so the
 * answer is the same whatever order the rows come in: one to open where any of them is no longer WhatsApp's to check
 * (turned down, paused), since that one needs its owner; else WhatsApp checking it.
 */
export function callTextStandOf(rows: readonly { name: string; meta_status?: string | null }[]): CallTextStand {
  const own = rows.filter((r) => r.name === CALL_TEXT_NAME);
  if (own.length === 0) return "none";
  return own.every((r) => r.meta_status === "pending") ? "checking" : "open";
}

/** What the booking-link row says and presses for it. */
export const CALL_TEXT_WORDS = {
  send: "Send the call’s text to WhatsApp",
  sending: "Sending…",
  sent: `The call’s text went to WhatsApp, which looks at it first (${WHATSAPP_REVIEW_TAKES}).`,
  checking: `WhatsApp is checking the call’s text (${WHATSAPP_REVIEW_TAKES}).`,
  open: "Open the call’s text",
} as const;
