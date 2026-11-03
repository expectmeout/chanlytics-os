/**
 * What the WhatsApp door does with one change of a delivery, once its number has been looked up: a pure function a
 * test runs every way (tests/whatsapp/a-change-is-planned-before-it-is-taken.test.mjs), as planSmsIngress (../sms/sms-ingress.ts)
 * is the text door's. The door (./webhook.ts handleChange) asks it, then does what it says.
 *
 * A change is about something (`field`): a customer's messages, the receipts of ours, an owner's echoes from the
 * WhatsApp Business app, the app's history, or anything else Meta sends (the account's own news is routed by its WABA
 * before this is asked). What it carried is the database's to keep, so nothing the door could not keep is
 * acknowledged: Meta retries any non-200 for up to seven days, and each kind is safe to receive twice (the replay gate,
 * the monotone receipt, one echo one row, the same history run).
 *
 *   routed         taken in: messages recorded and their answers scheduled, receipts and echoes kept, history handed on.
 *   lookup_failed  the database did not answer the routing read, which is a blip, not a decision: nothing is kept and
 *                  nothing said in anyone's voice, and every message, receipt and echo is owed (503), so Meta sends the
 *                  change again. Messages are told to the platform, once a window (`whatsapp_unreadable`).
 *   unroutable     the database answered, and the number is nobody's here (switched off, deleted, never ours), or the
 *                  change names none: its messages are kept nowhere and owed nothing, and are told to the platform once
 *                  a window (`whatsapp`), since nobody is answering those customers.
 *   no_database    a deployment with nothing to keep them in: messages are owed, as a routing failure.
 */
export type WaRouting = "routed" | "lookup_failed" | "unroutable" | "no_database";

/** What one change carried, by kind. */
export interface WaChangeCounts {
  messages: number;
  statuses: number;
  echoes: number;
}

export interface WaChangePlan {
  /** What is taken in: the change's messages, receipts, echoes or history; null when nothing is. */
  take: "messages" | "receipts" | "echoes" | "history" | null;
  /** How many of what it carried are owed without being taken: the door does not acknowledge them. */
  owed: number;
  /** The line the door says, by name, for a change it takes nothing from. */
  log: "wa_skip_routing_failed" | "wa_skip_unroutable" | "wa_event" | null;
  /** The platform's alert, for messages nobody will answer. */
  alert: "whatsapp" | "whatsapp_unreadable" | null;
}

const TAKES_NOTHING: WaChangePlan = { take: null, owed: 0, log: null, alert: null };

/** The plan for one change: its field, what it carried, how its number was found, and whether it is history. */
export function planWhatsappChange(
  field: string | undefined,
  c: WaChangeCounts,
  routing: WaRouting,
  isHistory: boolean,
): WaChangePlan {
  if (field === "messages" && c.messages > 0) {
    if (routing === "routed") return { ...TAKES_NOTHING, take: "messages" };
    if (routing === "unroutable") return { ...TAKES_NOTHING, log: "wa_skip_unroutable", alert: "whatsapp" };
    return {
      ...TAKES_NOTHING,
      owed: c.messages,
      log: "wa_skip_routing_failed",
      alert: routing === "lookup_failed" ? "whatsapp_unreadable" : null,
    };
  }
  const echoes = field === "smb_message_echoes";
  if ((field === "messages" && c.statuses > 0) || echoes) {
    if (routing === "lookup_failed")
      return { ...TAKES_NOTHING, owed: echoes ? c.echoes : c.statuses, log: "wa_skip_routing_failed" };
    return { ...TAKES_NOTHING, take: echoes ? "echoes" : "receipts" };
  }
  if (isHistory) return { ...TAKES_NOTHING, take: "history" };
  return { ...TAKES_NOTHING, log: "wa_event" };
}
