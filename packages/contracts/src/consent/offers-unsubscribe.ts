/**
 * What the unsubscribe page says to a customer who pressed it on an OFFER (One message, every channel, step 4; the
 * campaigns-on-every-channel spec, 4.6 and decision 12). The page is one door with two roads: the link in the offer, and the
 * mail client's one click (RFC 8058). Either ends offers by email and nothing else: "Unsubscribe is not STOP". The page then
 * offers a second, confirmed act for someone who means everything: "Stop all messages", which sets do-not-contact.
 *
 * The same page answers a reach-out's cold email (reach-out/reach-out.ts unsubscribePageWords), which speaks to a business
 * the finder found, not to a customer; which of the two a link belongs to is read from the email it came in. A link that
 * does not work, and a press that did not go through, are the same words for both. Pure: every sentence is here.
 */

/** One button the page draws: a form that posts `name=value`. A quiet one is the second act, not the page's main one. */
export interface OfferPageButton {
  label: string;
  name: "unsubscribe" | "stop_all";
  value: "yes" | "ask";
  quiet: boolean;
}

/** What the page is showing a customer: the question, the answer, the second act's question and its answer. */
export type OfferUnsubscribeView =
  | { kind: "ask"; business: string | null }
  | { kind: "done"; business: string | null }
  | { kind: "stop_ask"; business: string | null }
  | { kind: "stopped"; business: string | null };

export interface OfferPageWords {
  title: string;
  lead: string;
  body: string;
  buttons: OfferPageButton[];
  foot: string | null;
}

/**
 * Why "Stop all messages" was refused, said to whoever pressed it (a plain-text answer, not the page): the link is a
 * reach-out's, which speaks to a business and has no visit messages to stop; or the email it came in could not be read just
 * now, so nothing was changed and the press can be made again.
 */
export const STOP_ALL_REFUSALS = {
  not_an_offer:
    "This link is for a business's email, not an offer: it has no other messages to stop, and nothing was changed.",
  unread: "We couldn't check this link just now, so nothing was stopped. Try again in a minute.",
} as const;

/** The word for the business on the page: its name, else the plainest stand-in. */
const who = (b: string | null): string => b?.trim() || "this business";

/** Every sentence the page says to a customer on an offer. The business's name is the only value in them. */
export function offerUnsubscribeWords(v: OfferUnsubscribeView): OfferPageWords {
  const b = who(v.business);
  const foot = `${b} sends its email with Chanlytics.`;
  switch (v.kind) {
    case "ask":
      return {
        title: "Unsubscribe",
        lead: `Stop offers from ${b}?`,
        body: `Press the button and ${b} won't send you offers by email again. You'll still get messages about your visits.`,
        buttons: [{ label: "Unsubscribe from offers", name: "unsubscribe", value: "yes", quiet: false }],
        foot,
      };
    case "done":
      return {
        title: "Unsubscribed",
        lead: `You're unsubscribed from offers from ${b}.`,
        body: "You'll still get messages about your visits.",
        buttons: [{ label: "Stop all messages", name: "stop_all", value: "ask", quiet: true }],
        foot,
      };
    case "stop_ask":
      return {
        title: "Stop all messages",
        lead: `Stop every message from ${b}?`,
        body: "That includes reminders and confirmations about your visits. Nothing more will go to you by email, text or WhatsApp.",
        buttons: [{ label: "Yes, stop all messages", name: "stop_all", value: "yes", quiet: false }],
        foot,
      };
    case "stopped":
      return {
        title: "Messages stopped",
        lead: `You won't get any more messages from ${b}.`,
        body: "Nothing more will go to you by email, text or WhatsApp.",
        buttons: [],
        foot,
      };
  }
}
