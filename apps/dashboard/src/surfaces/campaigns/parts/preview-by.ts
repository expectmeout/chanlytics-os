/**
 * A message drawn on the channel a person is reached on (One message, every channel; the Campaigns review's item 15). The
 * composers' preview was WhatsApp's bubble for everyone; a campaign that goes by more than WhatsApp reaches each person once,
 * on one channel (contracts reachFor), and that channel's version is what they read: an email's subject, words and the foot
 * the sender adds, a text's words with its STOP line, else WhatsApp's own template. This works out what MessagePreview is
 * handed for one person (contracts previewOn says what each channel adds); the broadcast composer and the playbook composer
 * both read it, each handing it the WhatsApp words it draws for its own kind of page.
 */
import {
  PREVIEW_CHANNEL_WORDS,
  PREVIEW_WORDS,
  previewOn,
  type ConsentChannel,
  type PreviewVersions,
} from "@chanlytics/contracts";
import type { MessagePreviewProps } from "./message-preview";

/** What the template says on WhatsApp, as the page draws it. */
type WhatsAppWords = Pick<MessagePreviewProps, "body" | "header" | "footer" | "buttons">;

/** What MessagePreview is handed for one person on one channel, with the note that says why a version could not be drawn. */
export type CmPreviewBy = Pick<
  MessagePreviewProps,
  "body" | "header" | "footer" | "buttons" | "kind" | "mail" | "via" | "note"
>;

/**
 * The channel a person is read on: the one the send reaches them on, WhatsApp for a preview made before channels were
 * kept, and none for a person held back (their bubble is WhatsApp's, marked Not sent).
 */
export const cmChannelOfPerson = (p: {
  refusal: string | null;
  channel?: ConsentChannel | null;
}): ConsentChannel | null => (p.refusal ? null : (p.channel ?? "whatsapp"));

/**
 * One person's message: `whatsapp` is what the template says there; `channel` where they are reached; `o.versions` the
 * message's email and text versions as words; `o.labelled` whether to name the channel (said where the campaign goes by more
 * than WhatsApp alone, so a WhatsApp campaign draws what it always drew). Where the version the person is read on is not
 * in hand, WhatsApp's words stand and the note says so, never another channel's words under this one's name.
 */
export function cmPreviewBy(
  whatsapp: WhatsAppWords,
  channel: ConsentChannel | null,
  o: {
    versions: PreviewVersions | undefined;
    language: string;
    business: string;
    address?: string | null;
    facts?: Record<string, unknown>;
    labelled: boolean;
    /** An offer's email carries the offer's foot, the reason and the unsubscribe link (contracts previewOn); absent, a visit's. */
    offer?: "customer" | "asked";
  },
): CmPreviewBy {
  const asWhatsApp = (via: string | null, note: string | null): CmPreviewBy => ({
    ...whatsapp,
    kind: undefined,
    mail: null,
    via,
    note,
  });
  if (!channel) return asWhatsApp(null, null);
  const via = o.labelled ? PREVIEW_CHANNEL_WORDS[channel] : null;
  const on = previewOn(channel, {
    versions: o.versions ?? {},
    language: o.language,
    business: o.business,
    address: o.address,
    facts: o.facts,
    offer: o.offer,
  });
  // Not labelled with a channel whose words are not here.
  if (on.missing) return asWhatsApp(null, on.missing);
  if (!on.version) return asWhatsApp(via, null);
  const own = { body: on.version.body, header: null, buttons: null, via, note: null };
  return channel === "sms"
    ? { ...own, footer: on.foot, kind: PREVIEW_WORDS.kind.sms, mail: null }
    : {
        ...own,
        footer: null,
        kind: PREVIEW_WORDS.kind.email,
        mail: { subject: on.version.subject, foot: on.foot ?? "" },
      };
}
