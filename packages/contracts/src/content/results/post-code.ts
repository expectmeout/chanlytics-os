/**
 * "Message us" with the post's code (the content loop PRD's 9.2, call 23; Appendix A.4): a post's link opens a chat with
 * the business and carries its code. On Instagram the code rides as the ig.me link's `ref` (the form the first-post
 * sitting proved, `ig.me/<username>?ref=`, which arrives whole, even alone as the chat opens); on WhatsApp it rides only
 * as words in the prefilled message, so it is put there in square brackets and read only in them: a word that happens
 * to look like a code is never one, and a form request's code (round brackets, forms/request-code.ts) never reads as a
 * post's. A person who deletes the words is simply someone who wrote. Pure.
 */

/** A post's code in its square brackets, in a message as it arrived (link_code_new's letters, any case). */
const POST_CODE_IN_BRACKETS = /\[([a-hjkmnp-zA-HJKMNP-Z2-9]{6})\]/;

/** The post's code a message carries, in lower case as links keep it, or null when it carries none. */
export function postCodeIn(text: string | null | undefined): string | null {
  return POST_CODE_IN_BRACKETS.exec(text ?? "")?.[1]?.toLowerCase() ?? null;
}

/** The words that open in a WhatsApp chat from a post's link: a hello, and the code in its brackets, last. */
const WHATSAPP_HELLO = "Hi! I saw your post.";

/** Where a business can be written to from a post's link: its WhatsApp number (E.164), its Instagram username. */
export interface PostChatPlaces {
  code: string;
  whatsapp: string | null;
  instagram: string | null;
}

/**
 * The chat a post's link opens, carrying its code: the business's Instagram where the post is there (the person is
 * already on Instagram), else its WhatsApp; null where it has neither, and the link lands on its page instead.
 */
export function postChatLinkOf(places: PostChatPlaces): string | null {
  const username = places.instagram?.trim().replace(/^@/, "");
  if (username) return `https://ig.me/${encodeURIComponent(username)}?ref=${encodeURIComponent(places.code)}`;
  const digits = places.whatsapp?.replace(/[^\d]/g, "");
  if (digits) return `https://wa.me/${digits}?text=${encodeURIComponent(`${WHATSAPP_HELLO} [${places.code}]`)}`;
  return null;
}
