/**
 * Instagram DMs as Meta's webhook sends them (the Instagram API with Instagram Login, `messages` field), read into what
 * the door acts on: the events of a delivery (instagramEventsOf), and each person's message in the one inbound shape
 * (inboundFromInstagram, decision 0001 step 8: the decision's `inboundFromMetaDm`).
 *
 * The envelope is `{ object: "instagram", entry: [{ id, time, messaging: [...] }] }`. `entry.id` is always the business's
 * Instagram professional account: the routing key, as a phone number id is WhatsApp's. A person is an Instagram-scoped
 * id (IGSID), never a number, so a DM makes its own person, found by that id and joined to nobody by a name (decision
 * 0001, third answer). Each `messaging[]` item carries one of: a `message` (words, attachments, a reply to a story, a
 * quick reply), a `postback` (an icebreaker or a button tapped), a `reaction`, a `read`, a `message_edit`, or a message
 * marked `is_deleted` (unsent). The business's own messages come back as echoes (`is_echo`), sender and recipient
 * swapped: one sent from the Instagram app is a person on the team speaking, one we sent is ours, and which is the
 * door's to tell (its row holds our message ids).
 *
 * Nothing is assumed of a payload's shape: a field may be absent or of another type, and a malformed item reads as
 * nothing rather than throwing, so one odd item never costs a delivery its other messages.
 */
import { CONVERSATION_OPT_IN_PATTERN } from "@chanlytics/contracts";
import { asksToStop } from "../stop-request";
import { storableReferral } from "../whatsapp";
import type { InboundMessage, LinkedMediaRef } from "../inbound";

/** A referral as an Instagram message carries it: a click-to-Instagram ad's id, or an ig.me link's `ref`. */
export interface IgReferral {
  source?: string;
  type?: string;
  ad_id?: string;
  ref?: string;
}

/** One `messaging[]` item, as Meta documents it; every field optional, as a payload read defensively is. */
export interface IgMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  /** Epoch milliseconds. */
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string; title?: string } }>;
    reply_to?: { mid?: string; story?: { id?: string; url?: string } };
    quick_reply?: { payload?: string };
    referral?: IgReferral;
  };
  postback?: { mid?: string; title?: string; payload?: string };
  reaction?: { mid?: string; action?: string; reaction?: string; emoji?: string };
  read?: { mid?: string };
  message_edit?: { mid?: string; text?: string; num_edit?: number };
  referral?: IgReferral;
}

/**
 * What one item of a delivery is, for the door:
 *  - message: a person wrote (or tapped): answered through the one shape.
 *  - echo: the business's own message on the thread, from the Instagram app or from us.
 *  - unsent: the person took a message back; its words are not kept.
 *  - ignored: asks nothing of anyone (a reaction, a read, an edit), or is not a message at all.
 */
export type InstagramEvent =
  | { kind: "message"; account: string; from: string; mid: string; item: IgMessaging }
  | { kind: "echo"; account: string; to: string; mid: string; text: string | null; atIso: string | null }
  | { kind: "unsent"; account: string; from: string; mid: string }
  | { kind: "ignored"; account: string; what: "reaction" | "read" | "edit" | "unknown" };

const trimmed = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** An item's moment, from Meta's epoch milliseconds; null when it gave none a clock can read. */
function atIsoOf(item: IgMessaging): string | null {
  const ms = item.timestamp;
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

/** What one item is: its account is the entry's, its people the item's own. */
function eventOf(account: string, item: IgMessaging): InstagramEvent {
  const from = trimmed(item.sender?.id);
  const to = trimmed(item.recipient?.id);
  const message = isObject(item.message) ? item.message : null;
  const mid = trimmed(message?.mid) || trimmed(item.postback?.mid);
  if (message && from && (message.is_echo === true || from === account))
    return mid
      ? { kind: "echo", account, to, mid, text: trimmed(message.text) || null, atIso: atIsoOf(item) }
      : { kind: "ignored", account, what: "unknown" };
  if (message?.is_deleted === true && from && mid) return { kind: "unsent", account, from, mid };
  if ((message || isObject(item.postback)) && from && mid) return { kind: "message", account, from, mid, item };
  if (isObject(item.reaction)) return { kind: "ignored", account, what: "reaction" };
  if (isObject(item.read)) return { kind: "ignored", account, what: "read" };
  if (isObject(item.message_edit)) return { kind: "ignored", account, what: "edit" };
  return { kind: "ignored", account, what: "unknown" };
}

/** Every item of an Instagram delivery, in the order Meta sent them; anything that is not its envelope is none. */
export function instagramEventsOf(body: unknown): InstagramEvent[] {
  if (!isObject(body) || body.object !== "instagram" || !Array.isArray(body.entry)) return [];
  const events: InstagramEvent[] = [];
  for (const entry of body.entry) {
    if (!isObject(entry)) continue;
    const account = trimmed(entry.id);
    if (!account || !Array.isArray(entry.messaging)) continue;
    for (const item of entry.messaging) if (isObject(item)) events.push(eventOf(account, item));
  }
  return events;
}

/** The attachment kinds that are bytes a person sent: a photo, a moving one, a video, a voice note, a file. */
const MEDIA_KINDS: ReadonlySet<string> = new Set(["image", "animated_image", "video", "audio", "file"]);
/** The attachment kinds that are something of Instagram's passed on, by the word a sentence calls it. */
const SHARED_AS: Readonly<Record<string, string>> = {
  share: "a post",
  ig_post: "a post",
  post: "a post",
  ig_reel: "a reel",
  reel: "a reel",
  story: "a story",
};

/**
 * What one attachment becomes. Meta serves a DM's photo as a JPEG from its CDN, which is what lets the receptionist look at
 * it before the bytes are fetched (core inbound/unreadable.ts reads the type up front); the bytes' own type is read when
 * they are. Any other attachment's type is the bytes' to say.
 */
function attachmentOf(a: { type?: string; payload?: { url?: string; title?: string } } | undefined): {
  kind: InboundMessage["kind"];
  rawType: string;
  body: string | null;
  media: LinkedMediaRef | null;
} {
  const rawType = trimmed(a?.type) || "attachment";
  const url = trimmed(a?.payload?.url);
  const title = trimmed(a?.payload?.title);
  if (MEDIA_KINDS.has(rawType) && url)
    return {
      kind: "media",
      rawType,
      body: null,
      media: {
        url,
        mime_type: rawType === "image" ? "image/jpeg" : null,
        caption: null,
        filename: null,
        fetch_state: "pending",
      },
    };
  const shared = SHARED_AS[rawType];
  if (shared && url)
    return { kind: "share", rawType, body: `Shared ${shared}${title ? ` (${title})` : ""}: ${url}`, media: null };
  // Being mentioned in someone's story asks nothing: kept on the thread, and answered by nobody.
  if (rawType === "story_mention")
    return { kind: "system", rawType, body: "Mentioned you in their story", media: null };
  return { kind: "unsupported", rawType, body: null, media: null };
}

/** The ad or link a DM came from: a click-to-Instagram ad's id, else an ig.me link's `ref`, through the one rule. */
function referralOf(item: IgMessaging): InboundMessage["referral"] {
  const r = isObject(item.message?.referral) ? item.message.referral : isObject(item.referral) ? item.referral : null;
  if (!r) return null;
  if (r.ad_id !== undefined) return storableReferral(r.ad_id, "ad");
  return r.ref !== undefined ? storableReferral(r.ref, "link") : null;
}

/**
 * A person's DM as the one inbound shape: the item's `mid` is the replay gate, the sender's IGSID their identity (no
 * number, no address), and what they called themselves is the door's to hand in (Meta's webhook carries no name; the
 * door reads it from the person's profile). Typed words, a quick reply's words and a tapped icebreaker's title are words,
 * answered; an attachment is what attachmentOf says. A stop in words stops, START is the way back (both as WhatsApp's
 * reading, stop-request.ts); a DM is never a yes to offers, which go by WhatsApp alone. Null for an item with no id or
 * no sender: there is no replay gate, and nobody to answer.
 */
export function inboundFromInstagram(
  item: IgMessaging,
  profileName: string | null,
): (InboundMessage & { channel: "instagram" }) | null {
  const from = trimmed(item.sender?.id);
  const said = whatWasSaid(item);
  if (!from || !said) return null;
  const { kind, body, attached } = said;
  return {
    channel: "instagram",
    externalId: said.mid,
    identity: { externalId: from, phoneE164: null, email: null },
    profileName,
    type: kind === "text" || (body !== null && kind !== "media") ? "text" : "media",
    kind,
    rawType: said.rawType,
    body,
    channelTsIso: atIsoOf(item),
    media: attached?.media ?? null,
    consent: consentOf(kind, said.consentText),
    referral: referralOf(item),
  };
}

/**
 * What a DM item said, by its id: words typed (a quick reply's are words), an icebreaker's or a button's title, or its
 * first attachment; the words a stop or a START is read in (a tapped button's payload too, as a WhatsApp button's id
 * is: a localised one says "stop" there). Null for an item with no id.
 */
function whatWasSaid(item: IgMessaging) {
  const message = isObject(item.message) ? item.message : null;
  const tapped = !message && isObject(item.postback) ? item.postback : null;
  const mid = trimmed(message?.mid) || trimmed(tapped?.mid);
  if (!mid) return null;
  const typed = trimmed(message?.text);
  const words = typed || trimmed(tapped?.title);
  const attached = !words && message?.attachments?.length ? attachmentOf(message.attachments[0]) : null;
  const kind: InboundMessage["kind"] = words ? "text" : (attached?.kind ?? "unsupported");
  const rawType = typed
    ? "text"
    : tapped
      ? "postback"
      : message?.is_unsupported
        ? "unsupported"
        : (attached?.rawType ?? "unsupported");
  const consentText = [words, trimmed(tapped?.payload)].filter(Boolean);
  return { mid, kind, rawType, body: words || attached?.body || null, attached, consentText };
}

/** A stop in words stops, START is the way back (WhatsApp's reading, stop-request.ts); a DM is never a yes to offers. */
function consentOf(kind: InboundMessage["kind"], consentText: readonly string[]): InboundMessage["consent"] {
  const isText = kind === "text";
  return {
    optOut: isText && consentText.some((s) => asksToStop(s, "whatsapp")),
    optIn: isText && consentText.some((s) => CONVERSATION_OPT_IN_PATTERN.test(s)),
    optInMarketing: false,
  };
}
