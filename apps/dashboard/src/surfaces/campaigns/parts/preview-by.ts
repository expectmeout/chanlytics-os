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
  isOfferByEmail,
  previewOn,
  purposeOfTemplate,
  type ConsentChannel,
  type MessageAbout,
  type PreviewVersions,
} from "@chanlytics/contracts";
import type { MessagePreviewProps } from "./message-preview";

/**
 * The foot an email of this message is drawn with, as `cmPreviewBy`'s `offer` option: the offer's (the reason, and the way out)
 * where the message is an offer by email, a visit's otherwise. What makes it one is the send's own question (contracts
 * isOfferByEmail, decision D2): a marketing message, and the business's own news, whatever its template's category. `about` is
 * what the message is about: a broadcast's is ours, a moment's is messageAboutOfTrigger of it.
 */
export function cmOfferFoot(category: string | null | undefined, about: MessageAbout): { offer?: "customer" } {
  return isOfferByEmail({ channel: "email", purpose: purposeOfTemplate(category), proactive: true, about })
    ? { offer: "customer" }
    : {};
}

/** What the template says on WhatsApp, as the page draws it. */
type WhatsAppWords = Pick<MessagePreviewProps, "body" | "header" | "footer" | "buttons">;

/** What MessagePreview is handed for one person on one channel, with the note that says why a version could not be drawn. */
export type CmPreviewBy = Pick<
  MessagePreviewProps,
  "body" | "header" | "footer" | "buttons" | "kind" | "mail" | "via" | "note"
>;

/**
 * The channel a person is read on: the one the send reaches them on, WhatsApp for a preview made before channels were
 * kept, and none for a person held back (their stand-in is the message's own words, marked Not sent: cmPreviewBy).
 */
export const cmChannelOfPerson = (p: {
  refusal: string | null;
  channel?: ConsentChannel | null;
}): ConsentChannel | null => (p.refusal ? null : (p.channel ?? "whatsapp"));

/**
 * One person's message: `whatsapp` is what the template says there; `channel` where they are reached; `o.versions` the
 * message's email and text versions as words; `o.labelled` whether to name the channel (said where the campaign goes by more
 * than WhatsApp alone, so a WhatsApp campaign draws what it always drew). Where the version the person is read on is not
 * in hand, WhatsApp's words stand and the note says so, never another channel's words under this one's name. A person held
 * back (no channel) is drawn the words on `o.standIn`, the channel the page holds the message's words on (cmStandInOf: the
 * WhatsApp version's where the message has one, else its email's or its text's, as previewOn draws them), unlabelled and
 * noted Not sent.
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
    /** The channel a person held back is drawn on: the one the message's words are on (cmStandInOf). */
    standIn: ConsentChannel;
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
  const shown = channel ?? o.standIn;
  const via = channel && o.labelled ? PREVIEW_CHANNEL_WORDS[channel] : null;
  const note = channel ? null : PREVIEW_WORDS.notSent;
  const on = previewOn(shown, {
    versions: o.versions ?? {},
    language: o.language,
    business: o.business,
    address: o.address,
    facts: o.facts,
    offer: o.offer,
  });
  // Not labelled with a channel whose words are not here.
  if (on.missing) return asWhatsApp(null, on.missing);
  if (!on.version) return asWhatsApp(via, note);
  const own = { body: on.version.body, header: null, buttons: null, via, note };
  return shown === "sms"
    ? { ...own, footer: on.foot, kind: PREVIEW_WORDS.kind.sms, mail: null }
    : {
        ...own,
        footer: null,
        kind: PREVIEW_WORDS.kind.email,
        mail: { subject: on.version.subject, foot: on.foot ?? "" },
      };
}
