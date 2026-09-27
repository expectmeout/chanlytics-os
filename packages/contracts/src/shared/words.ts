/**
 * The small words every sentence builder needs, said one way.
 *
 * Ten modules spelled out "1 review" · "3 reviews" for themselves, and three capitalised a sentence's first letter
 * on their own. They agreed, so each is one function here. The Business tab keeps its own count, which groups
 * thousands ("1,200 services"): a different thing, under the same name there.
 */

/** "1 review" · "3 reviews" · "2 people": the count, then the word it takes. The plural is the word plus "s" unless given. */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The first letter upper-cased, the rest as written; an empty string stays empty. */
export const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
