/**
 * Campaigns' rooms, said once (3 Oct 2026). Campaigns is one page, its home, and two rooms hang off it: Sent (every run, the
 * send screen, and Get their yes) and the Library (the wording the receptionist and the campaigns send). Broadcasts,
 * Templates and Playbooks are what the routes, the code and the database call them, and what people typed before; a sentence
 * a person reads, on a page, in a toast, a notice or an email, names a room from here, so a word changes in one place. New
 * message is the verb, whichever room it starts from.
 */
export const CAMPAIGN_ROOMS = {
  home: "Campaigns",
  sent: "Sent",
  library: "Library",
  newMessage: "New message",
} as const;

const { sent, library } = CAMPAIGN_ROOMS;

/** What a playbook's delete says: the rule goes, and the runs it sent stay where every run is read. */
export const PLAYBOOK_DELETE_WORDS = {
  /** The toast's tail, after the playbook's name. */
  done: `deleted — its runs stay in ${sent} with their numbers`,
  /** The question's detail. */
  detail: `Its runs stay in ${sent} with their numbers.`,
} as const;

/** A message picker with nothing to pick: what to do, and the Library, which opens as a link after the lead. */
export interface NoMessageWords {
  lead: string;
  link: string;
}

/** The send screen's picker: no message it can send, whichever channel a message is written for. */
export const NO_TEMPLATE_WORDS: NoMessageWords = {
  lead: "No message to send yet — add the starter set, or write one in the",
  link: library,
};

/** A playbook composer's picker: no message, for this moment where the moment has a starter. */
export function noMessageWords(forThisMoment: boolean): NoMessageWords {
  return {
    lead: `No message ${forThisMoment ? "for this moment " : ""}yet — write one in the`,
    link: library,
  };
}

/**
 * The Library page's own lines: the waiting line, the read that failed, what a workspace with no WhatsApp number is told
 * (a message needs none: only its WhatsApp version waits for one) and what writing a WhatsApp version asks of a number.
 */
export const LIBRARY_WORDS = {
  title: library,
  demo: `The ${library} reads a real workspace — the messages it holds, by email, text and WhatsApp.`,
  reading: `Reading the ${library}…`,
  failed: `The ${library} couldn’t be loaded right now`,
  failedWhat: `the ${library}`,
  failedBody: "The receptionist keeps sending; this page just can't show what it holds at the moment.",
  /** The count's hover: what the Library holds is every message, on each channel it goes by, whoever writes its versions. */
  headTip:
    "What the receptionist and your campaigns send, as the customer sees it. A WhatsApp version is approved by WhatsApp, usually within minutes, whether it is written here or in WhatsApp Manager; an email or a text is ready the moment it is saved. A marketing message can only go to people who said yes to offers.",
  noNumber:
    "No WhatsApp number yet. Email and text versions are written here; WhatsApp versions wait until one is connected.",
  /** A template is written to a number's account, which is the edge's own answer (no_channel) when it has none. */
  writeNeedsNumber: "Connect a WhatsApp number first — templates belong to a number's account.",
  /** Why a WhatsApp version, or a language of one, cannot be added with no number; an email or a text needs none. */
  addNeedsNumber: "Connect a WhatsApp number to add a WhatsApp version.",
} as const;

/**
 * What the Library's composer says when a new message begins as an email (a message needs no WhatsApp row). It asks where
 * the message is sent first; an email or a text is written here and reviewed by no one, so the message is an offer or
 * news (the starters alone are about a visit or a proposal), and a text carries no offers: the first sentence of what a
 * text says is the carriers' (contracts channelNeverCarries), this is the second. What keeps a message from being written
 * is said in the person's words before anything is sent.
 */
export const NEW_MESSAGE_WORDS = {
  /** The first choice's name: Email, Text or WhatsApp. */
  where: "Where is it sent",
  /** Under the pane's name while the message is an email's or a text's: what is not WhatsApp's. */
  sub: "Email is written here and ready the moment it is saved; no one reviews it first.",
  /** The one quiet line over the form: what a message written here is, and where the other kind comes from. */
  own: "A message you write here is an offer or news. Visit reminders and follow-ups come from the starter set.",
  /** What a text says after the carriers' sentence: the way out. */
  textGoesByEmail: "This one can go by email.",
  writeAsEmail: "Write it as an email",
  /** The act that takes the last of a message's values away: only the last, so no value is renumbered under words that use it. */
  removeValue: "Remove the last value",
  /** Under the title: the name the message is filed under, which WhatsApp would know it by. */
  knownAs: "WhatsApp would know it as",
  titleMissing: "Give it a title.",
  titleTooLong: (max: number): string => `A title is at most ${max} characters.`,
  titleNeedsWords: "A title needs letters or digits in it.",
  nameTaken: "There is a message by that name already. Give this one another title.",
  valuesNeedWords: "Give each value a name and an example.",
  valueTooLong: (what: "name" | "example", max: number): string => `A value's ${what} is at most ${max} characters.`,
} as const;

/**
 * What the starter set says it does, on the Library's banner and after it is added. Its email and text versions are
 * written at once, whatever the workspace has connected; its WhatsApp versions go to a number's account, so they wait
 * for one, and WhatsApp reviews each.
 */
export const LIBRARY_STARTER_WORDS = {
  /** The banner's second line: the languages it comes in, and what is written now. */
  banner: (languages: string, hasNumber: boolean): string =>
    hasNumber
      ? `In ${languages} — email and text versions are written at once, and WhatsApp reviews each of its versions, usually within minutes.`
      : `In ${languages} — email and text versions are written at once; WhatsApp versions are added when a number is connected.`,
  /** The toast's clauses: what was written, what could not be, and what waits. */
  versionsWritten: (n: number): string => `${n} email and text version${n === 1 ? "" : "s"} written`,
  versionsFailed: (n: number, why: string | null): string =>
    `${n} email and text version${n === 1 ? "" : "s"} could not be written${why ? `: ${why}` : ""}`,
  waitsForNumber: "WhatsApp versions wait for a number",
  /** The route's refusal when the channels it is asked for are none it knows. */
  pickAChannel: "Pick at least one channel: WhatsApp, email or text.",
} as const;

/** What a broadcast is, said where a page defines it (the Sent room's standing line, on hover): one message, and where it goes. */
export const BROADCAST_WORDS = {
  tip: "One message, on the channels it holds, to the people who said yes. Replies land in the Inbox, where the receptionist answers them.",
} as const;

/**
 * Why a yes to offers must be in writing, on a person's page: the carriers' rule, and the paper form that answers it, which is
 * under Get their yes in Sent. The link opens it (GET_YES_ROUTE).
 */
export const OFFERS_IN_WRITING_WORDS = {
  lead: "The carriers require it: their own message, or a sign-up form they signed — ",
  link: `print one in ${sent}`,
} as const;
