/**
 * One inbound customer message, whatever brought it (decision 0001): the shape each channel's adapter makes at its door
 * and the message path reads. A WhatsApp message (whatsapp.ts inboundFromWhatsapp) and a text (lines/sms.ts
 * inboundFromSms) are made into it today; an email and a Meta DM join it at the decision's steps 6 and 8.
 *
 * It is NormalizedInbound (whatsapp.ts) with the wire it came on, and the person as an identity rather than WhatsApp's
 * own two words for them: a wa_id, and the digits a message was sent from, mean nothing in a mailbox. The rest reads as
 * the normaliser reads it, field for field, so the message path can take either for the one release the doors take to
 * move onto this one (core inbound/context.ts).
 */
import type { ChannelKind } from "@chanlytics/contracts";
import type { NormalizedInbound, WaMediaRef } from "./whatsapp";

export interface InboundMessage {
  /** The wire it came on: every channel a person writes on, which is every channel kind but a call. */
  channel: Exclude<ChannelKind, "voice">;
  /** The provider's id for this delivery: the replay gate. */
  externalId: string;
  /**
   * How this person is known here: their id on the wire (a wa_id, a number's digits), their number in E.164 when the wire
   * has one, their address when it is a mailbox.
   */
  identity: { externalId: string; phoneE164: string | null; email: string | null };
  profileName: string | null;
  /** Text or attachment: what messages.type stores. */
  type: NormalizedInbound["type"];
  /** What KIND arrived, which is not the same question (whatsapp.ts NormalizedInbound.kind). */
  kind: NormalizedInbound["kind"];
  /** The provider's own word for it, for the words an owner reads ("Customer sent a sticker message"). */
  rawType: string;
  body: string | null;
  channelTsIso: string | null;
  media: WaMediaRef | null;
  /** What the person said about being written to: the wire's own words for stop and start, and its carrier's verdict. */
  consent: { optOut: boolean; optIn: boolean; optInMarketing: boolean };
  /** The ad or post this person clicked to write, when the wire says (K3). */
  referral: NormalizedInbound["referral"];
}
