/**
 * What AI is asked where an owner says, in a line, a message to keep (the Messages redesign's step 4, New message): it
 * writes the message for every channel its kind may go by, names it, checks it against WhatsApp's rules and what the
 * business has said, and files every version with one press on its card (propose_sequence's action message, the door
 * POST templates/message). Said from New's line where what was said is a message to keep (Campaigns, one tab, call C12),
 * and from the Inbox's new conversation where no approved message can start a chat yet (call C10). One sentence, so
 * the card is the same card wherever it is asked for.
 */

/** Where the message is asked for: anywhere, or the Inbox, which starts a chat with it. */
export type NewMessageFor = "keep" | "inbox";

/**
 * The ask, the owner's own words inside it: a new message with a version on every channel its kind may go by (an offer
 * never by text), the email kept even where email is not set up yet (the door keeps it). The Inbox's is a message a chat
 * can be started with.
 */
export function newMessageAsked(words: string, use: NewMessageFor = "keep"): string {
  const what = use === "inbox" ? "New message the Inbox can start a chat with" : "New message";
  return `${what}, with a version for WhatsApp, email and text wherever its kind may go (an offer never by text): ${words}`;
}
