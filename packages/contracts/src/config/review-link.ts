/**
 * Where a customer leaves the business a review (22 Nov 2026): the owner's own link if they gave one, else the link the
 * Google listing keeps (google_listings.new_review_uri, 00415). A message's `review_link` slot is filled from it, and the
 * ready-made review ask is offered only where there is one. Until the owner could give a link, a business with no Google
 * listing (every online-only one) was offered no review ask at all.
 *
 * The owner's own is one key of the stored config, `brain.review_link`, beside the booking link, given on Settings ›
 * Details. Here: the rule that picks between the two, the owner's link as the stored config holds it, the check its row
 * runs before a save, and the row's words. The read is db reviewLinkOf, the one reading for a send and a page. Pure.
 */
import { normalizeLink } from "../shared/link";
import { recordOrEmpty } from "../shared/unknown";

/** A review link and where it was read from: the owner's own, or the Google listing's. */
interface ReviewLink {
  link: string;
  from: "own" | "listing";
}

const linkOrNull = (text: string | null | undefined): string | null => text?.trim() || null;

/** The one rule: the owner's own link if they gave one, else the Google listing's, else none. */
export function reviewLinkFrom(links: { own: string | null; listing: string | null }): ReviewLink | null {
  const own = linkOrNull(links.own);
  if (own) return { link: own, from: "own" };
  const listing = linkOrNull(links.listing);
  return listing ? { link: listing, from: "listing" } : null;
}

/**
 * The owner's own review link as the stored config holds it, or null. Read off the config as stored, never through its
 * whole schema: a config another key of which will not parse still says where its reviews go. Kept only where it is a
 * real web address (the house's one normalizer), so nothing else is ever put in a customer's message as a link.
 */
export function ownReviewLinkOf(config: unknown): string | null {
  const typed = recordOrEmpty(recordOrEmpty(config).brain).review_link;
  return typeof typed === "string" ? normalizeLink(typed) : null;
}

/** What the review link's row says: its name, with nothing in it, its box, and what stops a save. */
export const REVIEW_LINK_ROW_WORDS = {
  label: "Review link",
  empty: "Not set",
  /** With no link of the owner's own, where the Google listing keeps one: what messages use. */
  listing: "From your Google listing",
  hint: "Where customers leave a review. Messages send it in place of your Google listing's link.",
  placeholder: "example.com/review",
  problem: "Use a full web address, like example.com/review",
  gate: "change the review link",
} as const;

/** The toast once the row is saved: with a link, what it is used for now. Emptied, the row itself says what stands. */
export const reviewLinkSaved = (own: string | null | undefined): string =>
  own ? "Saved · messages send this link" : "Saved";

/** What stops the row's save, or null: empty is the choice to use the listing's link, and one typed is a web address. */
export function whyNotAReviewLink(typed: string | null | undefined): string | null {
  const text = String(typed ?? "").trim();
  return !text || normalizeLink(text) ? null : REVIEW_LINK_ROW_WORDS.problem;
}
