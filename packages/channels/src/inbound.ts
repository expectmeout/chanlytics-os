/**
 * One inbound customer message, whatever brought it (decision 0001): the shape each channel's adapter makes at its door
 * and the message path reads. A WhatsApp message (whatsapp.ts inboundFromWhatsapp), a text (lines/sms.ts
 * inboundFromSms) and an Instagram DM (instagram/instagram-events.ts inboundFromInstagram) are made into it; email keeps
 * its own intake (decision 0001, step 6, met by 0071).
 *
 * It is NormalizedInbound (whatsapp.ts) with the wire it came on, and the person as an identity rather than WhatsApp's
 * own two words for them: a wa_id, and the digits a message was sent from, mean nothing in a mailbox or a DM. The rest
 * reads as the normaliser reads it, field for field.
 */
import type { ChannelKind } from "@chanlytics/contracts";
import type { NormalizedInbound, WaMediaRef } from "./whatsapp";

/**
 * An attachment a wire hands over as a link to its bytes rather than an id to ask for them (an Instagram DM's photo, on
 * Meta's CDN): fetched by the link, which expires, so at ingest as WhatsApp's are. Otherwise as WaMediaRef.
 */
export interface LinkedMediaRef {
  url: string;
  mime_type: string | null;
  caption: string | null;
  filename: string | null;
  fetch_state: "pending" | "stored" | "failed";
  storage_path?: string;
}

/** An attachment as a message carries it: by the provider's id (WhatsApp), or by a link to it (an Instagram DM). */
export type MediaRef = WaMediaRef | LinkedMediaRef;

/** Whether an attachment is reached by its link rather than asked for by the provider's id. */
export const isLinkedMedia = (m: MediaRef): m is LinkedMediaRef => "url" in m;

export interface InboundMessage {
  /** The wire it came on: every channel a person writes on, which is every channel kind but a call. */
  channel: Exclude<ChannelKind, "voice">;
  /** The provider's id for this delivery: the replay gate. */
  externalId: string;
  /**
   * How this person is known here: their id on the wire (a wa_id, a number's digits, an Instagram-scoped id), their
   * number in E.164 when the wire has one, their address when it is a mailbox.
   */
  identity: { externalId: string; phoneE164: string | null; email: string | null };
  profileName: string | null;
  /** Text or attachment: what messages.type stores. */
  type: NormalizedInbound["type"];
  /**
   * What KIND arrived, which is not the same question (whatsapp.ts NormalizedInbound.kind). A `share` is a post or a reel
   * a person passed on in a DM: legible to a person, with its link in the words, and not the receptionist's to answer.
   */
  kind: NormalizedInbound["kind"] | "share";
  /** The provider's own word for it, for the words an owner reads ("Customer sent a sticker message"). */
  rawType: string;
  body: string | null;
  channelTsIso: string | null;
  media: MediaRef | null;
  /** What the person said about being written to: the wire's own words for stop and start, and its carrier's verdict. */
  consent: { optOut: boolean; optIn: boolean; optInMarketing: boolean };
  /** The ad, post or link this person came from, when the wire says (K3). */
  referral: NormalizedInbound["referral"];
}
