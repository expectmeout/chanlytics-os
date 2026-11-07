/**
 * The small words every sentence builder needs, said one way.
 *
 * Ten modules spelled out "1 review" · "3 reviews" for themselves, and three capitalised a sentence's first letter
 * on their own. They agreed, so each is one function here. The Business tab keeps its own count, which groups
 * thousands ("1,200 services"): a different thing, under the same name there.
 */

/** "1 review" · "3 reviews" · "2 people": the count, then the word it takes. The plural is the word plus "s" unless given. */
export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

/** plural() for a count that can run to thousands, grouped as the product groups one: "1 review" · "1,284 reviews". */
export const groupedPlural = (count: number, one: string, many = `${one}s`): string =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

/** A place's reviews, ours (the Google card) or another business's (the Leads peek and card): "1 review" · "1,284 reviews". */
export const reviewsPhrase = (count: number): string => groupedPlural(count, "review");

/**
 * What a member is called when the page cannot name them: no name and no address, or a row's member the roster does not
 * hold. THE word on every page that names a member (memberWords, the Activity log, Ask's settings answer): "A member" and
 * "Someone" were two spellings of it. A note whose author has left says more ("A former teammate"), and a thread's holder
 * the roster does not know is "A teammate" (heldPill): those say who they are not, and this says nothing.
 */
export const UNKNOWN_MEMBER_WORD = "Someone";

/** The first letter upper-cased, the rest as written; an empty string stays empty. */
export const capitalize = (text: string): string => (text ? text[0].toUpperCase() + text.slice(1) : text);

/** Words as a sentence: ended with a full stop unless they end with one already ("." "!" "?"). */
export const withStop = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

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

/**
 * Every control character and every format character (bidi overrides, tag characters, zero-width marks): none may ride
 * into a prompt's data block unseen. Use with `replace` or `matchAll`: it has the `g` flag, so `test` would keep state.
 */
export const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/gu;

/** A template's numbered slot, `{{1}}`, its number in the first group. Use with `replace` or `matchAll`: it has the `g` flag, so `test` would keep state. */
export const NUMBERED_SLOT = /\{\{(\d+)\}\}/g;

/** The last line of a prompt that asks for JSON. */
export const ANSWER_JSON_ONLY = "Answer with only a JSON object in the shape asked.";

/** What a voice door says of a workspace that may not use it, on the edge and in the dashboard. */
export const VOICE_IS_OFF = "Voice is off while this workspace is paused or its plan has ended.";

/** What a mailbox action says when it failed for no reason a person can act on. */
export const TRY_AGAIN_IN_A_MINUTE = "That didn't go through. Try again in a minute.";
