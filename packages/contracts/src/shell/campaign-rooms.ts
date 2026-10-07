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

/** The send screen's picker: no approved template, in review or none. */
export const NO_TEMPLATE_WORDS: NoMessageWords = {
  lead: "No approved template yet — add the starter set, write one here, or sync yours from WhatsApp Manager in the",
  link: library,
};

/** A playbook composer's picker: no approved message, for this moment where the moment has a starter. */
export function noMessageWords(forThisMoment: boolean): NoMessageWords {
  return {
    lead: `No approved message ${forThisMoment ? "for this moment " : ""}yet — write one, or sync yours from WhatsApp Manager, in the`,
    link: library,
  };
}

/** The Library page's own lines: the waiting line, the read that failed, and the empty state before a number is connected. */
export const LIBRARY_WORDS = {
  title: library,
  demo: `The ${library} reads a real workspace — what WhatsApp has approved for it.`,
  reading: `Reading the ${library}…`,
  failed: `The ${library} couldn’t be loaded right now`,
  failedWhat: `the ${library}`,
  failedBody: "The receptionist keeps sending; this page just can't show what it holds at the moment.",
  noNumber: `The ${library} holds what WhatsApp approves for a number, so it needs one.`,
} as const;

/**
 * Why a yes to offers must be in writing, on a person's page: the carriers' rule, and the paper form that answers it, which is
 * under Get their yes in Sent. The link opens it (GET_YES_ROUTE).
 */
export const OFFERS_IN_WRITING_WORDS = {
  lead: "The carriers require it: their own message, or a sign-up form they signed — ",
  link: `print one in ${sent}`,
} as const;
