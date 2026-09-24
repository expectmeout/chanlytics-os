/**
 * A person's wires and where they came from, in the owner's words: the leaf both the person's view model (people.ts)
 * and the list rule language (list-rules.ts) read, so neither loads the other to name a channel (decision 0009).
 */

export type PersonChannel = "whatsapp" | "sms" | "voice" | "email";

/** The wire a reply goes out on, in words. */
export const REPLY_VIA: Record<"whatsapp" | "sms" | "email", "WhatsApp" | "Text" | "Email"> = {
  whatsapp: "WhatsApp",
  sms: "Text",
  email: "Email",
};

/** A channel in the owner's words. */
export const PERSON_CHANNEL_WORDS: Record<PersonChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "Text",
  voice: "Phone",
  email: "Email",
};

/**
 * Where a person first came from, as people_list decides it once (00138): the
 * door that added them (calendar, lead, manual), an imported history (import),
 * else their first call (call) or the wire of their first message (whatsapp,
 * sms, email). People's "Came from" column says it in these words; a stored
 * value is never shown.
 */
export type PersonCameFrom = "whatsapp" | "sms" | "email" | "call" | "calendar" | "manual" | "import" | "lead";

/** The words for each, once: the three wires say what a reply on them says (REPLY_VIA), and a call says what its glyph says (PERSON_CHANNEL_WORDS.voice). */
export const PERSON_CAME_FROM_WORDS: Record<PersonCameFrom, string> = {
  whatsapp: REPLY_VIA.whatsapp,
  sms: REPLY_VIA.sms,
  email: REPLY_VIA.email,
  call: PERSON_CHANNEL_WORDS.voice,
  calendar: "Your calendar",
  manual: "Added by hand",
  import: "Imported history",
  lead: "A lead you found",
};
