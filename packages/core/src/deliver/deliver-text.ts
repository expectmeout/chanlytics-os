/**
 * What the door holds a text to (deliver.ts): the texting line is registered with the carriers for replies and
 * appointment messages, so a text carries no promotion, and it leaves only on a line they approved. Pure, so the door
 * reads one answer and its length stays its own.
 */
import type { DeliveryRefusal, SendPurpose } from "@chanlytics/contracts";

/**
 * Why a text may not leave, or null when it may. The line is registered with the carriers for replies and appointment
 * messages, and nothing else: an informational campaign, filed that way after the fourth refusal (30896). A promotion
 * by text would go out under a consent the carriers were never told about, whatever the person said to us -- so it does
 * not, whoever asks. Offers and news go by WhatsApp. And a text leaves only on a line the carriers have approved
 * (`sms_state` active) and that is no test filing (`reg_mock`), as the inbound door holds the same
 * (sms-ingress.ts); contracts channelsReady judges the line by the same two facts, so the composer's tick and the door
 * agree. `line` is the workspace's texting line (db textLineFacts), null with none.
 */
export function textRefusal(
  purpose: SendPurpose,
  line: { sms_state: string | null; reg_mock: boolean | null } | null,
): DeliveryRefusal | null {
  if (purpose === "marketing") return "sms_carries_no_promotions";
  return line?.sms_state === "active" && !line.reg_mock ? null : "sms_line_not_active";
}
