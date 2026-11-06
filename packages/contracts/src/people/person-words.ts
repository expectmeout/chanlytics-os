/**
 * A person's wires, where they came from and since when, in the owner's words: the leaf both the person's view model
 * (people.ts) and the list rule language (list-rules.ts) read, so neither loads the other to name a channel (decision
 * 0009), and a thread's sheet loads none of the person page's cards to say a date.
 */
import type { PersonRowVM } from "./person-row";

export type PersonChannel = "whatsapp" | "sms" | "voice" | "email" | "instagram";

/** The wires a reply goes out on: every written one (contracts conversations WrittenChannel, said here as the leaf's own). */
type ReplyWire = "whatsapp" | "sms" | "email" | "instagram";
/** A reply's wire in words. */
export type ReplyVia = "WhatsApp" | "Text" | "Email" | "Instagram";

/** The wire a reply goes out on, in words. */
export const REPLY_VIA: Record<ReplyWire, ReplyVia> = {
  whatsapp: "WhatsApp",
  sms: "Text",
  email: "Email",
  instagram: "Instagram",
};

/** That word's wire: REPLY_VIA read backwards, for a reader that holds a row's word alone (the page's reply, person-cards.ts). */
export const REPLY_WIRE: Record<ReplyVia, ReplyWire> = {
  WhatsApp: "whatsapp",
  Text: "sms",
  Email: "email",
  Instagram: "instagram",
};

/** A channel in the owner's words. */
export const PERSON_CHANNEL_WORDS: Record<PersonChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "Text",
  voice: "Phone",
  email: "Email",
  instagram: "Instagram",
};

/**
 * Where a person first came from, as people_list decides it once (00138): the
 * door that added them (calendar, lead, a client list's import since 00170,
 * a form on the business's own website since 00488, manual), an imported history (import), else their first call (call) or the
 * wire of their first message (whatsapp, sms, email, instagram), or an ad they tapped or answered (ad, 11 Oct 2026: any
 * paid ad, whichever platform). People's "Came from" column says it in these words; a stored value is never shown.
 */
export type PersonCameFrom =
  "whatsapp" | "sms" | "email" | "instagram" | "call" | "calendar" | "manual" | "import" | "lead" | "ad" | "website";

/** The words for each, once: the four wires say what a reply on them says (REPLY_VIA), and a call says what its glyph says (PERSON_CHANNEL_WORDS.voice). */
export const PERSON_CAME_FROM_WORDS: Record<PersonCameFrom, string> = {
  whatsapp: REPLY_VIA.whatsapp,
  sms: REPLY_VIA.sms,
  email: REPLY_VIA.email,
  instagram: REPLY_VIA.instagram,
  call: PERSON_CHANNEL_WORDS.voice,
  calendar: "Your calendar",
  manual: "Added by hand",
  import: "Imported",
  lead: "A lead you found",
  ad: "An ad",
  website: "Your website",
};

/**
 * The platforms an ad runs on, in the words the Ads page says them in (ads/words.ts PLATFORM_WORD, which is that page's
 * alone to load: this is People's copy of three words, and tests/ads/ads-connect.test.mjs holds the two equal).
 */
export const PERSON_AD_ON: Record<"meta" | "google" | "tiktok", string> = {
  meta: "Facebook and Instagram",
  google: "Google",
  tiktok: "TikTok",
};

/** Where an ad brought someone, as a line under a name says it: `From an ad · Spring offer`, or `From an ad` where the ad is not known. */
export const fromAdWords = (name: string | null): string => (name ? `From an ad · ${name}` : "From an ad");

/**
 * Since when they have been in touch, as a person's page says it and a thread's sheet says it again after their address:
 * "Since Jul 14" / "Since before Aug 27" / "". It moved here from person-cards.ts, which the sheet would otherwise load
 * whole (3 Nov 2026: 27 KB more on the first load of the Inbox and of Conversations).
 */
export function sinceWords(base: PersonRowVM): string {
  return base.firstContact.label === "—"
    ? ""
    : base.firstContact.estimate
      ? `Since ${base.firstContact.label.charAt(0).toLowerCase()}${base.firstContact.label.slice(1)}`
      : `Since ${base.firstContact.label}`;
}
