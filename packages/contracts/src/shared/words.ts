/**
 * The small words every sentence builder needs, said one way.
 *
 * Ten modules spelled out "1 review" · "3 reviews" for themselves, and three capitalised a sentence's first letter
 * on their own. They agreed, so each is one function here. The Business tab keeps its own count, which groups
 * thousands ("1,200 services"): a different thing, under the same name there.
 */

/** "1 review" · "3 reviews" · "2 people": the count, then the word it takes. The plural is the word plus "s" unless given. */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** plural() for a count that can run to thousands, grouped as the product groups one: "1 review" · "1,284 reviews". */
export const groupedPlural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** A place's reviews, ours (the Google card) or another business's (the Leads peek and card): "1 review" · "1,284 reviews". */
export const reviewsPhrase = (n: number): string => groupedPlural(n, "review");

/**
 * What a member is called when the page cannot name them: no name and no address, or a row's member the roster does not
 * hold. THE word on every page that names a member (memberWords, the Activity log, Ask's settings answer): "A member" and
 * "Someone" were two spellings of it. A note whose author has left says more ("A former teammate"), and a thread's holder
 * the roster does not know is "A teammate" (heldPill): those say who they are not, and this says nothing.
 */
export const UNKNOWN_MEMBER_WORD = "Someone";

/** The first letter upper-cased, the rest as written; an empty string stays empty. */
export const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A name as the one something belongs to: "Harbor Salon's", and "Lantern Barbers'" for a name that ends in s. */
export const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/** Words as a list in a sentence: "a", "a and b", "a, b and c". An empty list is an empty string. */
export const joinWords = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Each of a few, as a choice: "a", "a or b", "a, b or c". */
export const joinWordsOr = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

/** The same in a Spanish sentence: "a", "a y b", "a, b y c". */
export const joinWordsEs = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

/** Words cut after a whole word, with an ellipsis, when they run past `max`; whole when they fit. */
export function clipAtWord(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,;:—-]+$/u, "")}…`;
}
