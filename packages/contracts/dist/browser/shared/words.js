export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const groupedPlural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export const reviewsPhrase = (n) => groupedPlural(n, "review");
export const UNKNOWN_MEMBER_WORD = "Someone";
export const capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
export const joinWords = (items) => items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
export const joinWordsEs = (items) => items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
