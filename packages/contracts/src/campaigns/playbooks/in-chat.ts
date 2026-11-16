/**
 * A follow-up's reply in a person's open WhatsApp chat (decision 0135): which step asks for it, the workspace's switch for
 * it, and the mark a run leaves on the row of whoever it reaches that way. The run (core campaigns/paced.ts) and the send
 * (core messages/broadcast-channels.ts) read them, and the edge reads the switch; no page does, so they live apart from the
 * moment's own rules (purpose.ts), which every page that counts a run carries.
 */
import { type AskedPurpose, purposeOfPlaybook, purposeOfTemplate } from "../../consent/consent";

/**
 * The yes a step's reply in a person's open WhatsApp chat asks, or null for a step that never replies there: one whose
 * moment is about something of theirs (its class's yes is to messages) and whose message WhatsApp approved as an offer.
 * The ready-made booking follow-up, filed as a notice and approved as an offer, then reached nobody from a US number
 * (15 Nov 2026), though the person it is for wrote within the day. An offer's own moment is an offer wherever it goes, a
 * message WhatsApp approved as a notice goes as it always did, and one with no approved WhatsApp version has no words to
 * send in the chat.
 */
export function inChatPurposeOf(
  policyClass: string | null | undefined,
  message: { category: string | null; whatsappApproved: boolean },
): AskedPurpose | null {
  const byClass = purposeOfPlaybook(policyClass);
  if (byClass === "marketing" || !message.whatsappApproved) return null;
  return purposeOfTemplate(message.category) === "marketing" ? byClass : null;
}

/**
 * Whether a workspace's config turns on the reply in the open chat (`features.reply_in_chat`, the flag registry's
 * `reply_in_chat`). Read off the config as stored, so anything but `true` is off. The one reader of the flag: the run's
 * context asks it.
 */
export function replyInChatOf(config: unknown): boolean {
  if (typeof config !== "object" || config === null || !("features" in config)) return false;
  const features: unknown = config.features;
  return (
    typeof features === "object" && features !== null && "reply_in_chat" in features && features.reply_in_chat === true
  );
}

/**
 * The fact a run keeps on the row of a person it reaches in their open WhatsApp chat: the send goes by it, asks their chat
 * again, and replies in it with the message's words, naming no saved message.
 */
export const IN_CHAT_FACT = "in_chat";
