/**
 * What a post may say and be made from (decision 0099, step 3), and where its shapes are kept: the server's. The words are held to
 * what the owner said: Ask chooses them, but a price, a number or a promise it did not get from them never reaches a picture.
 * Once the owner presses Save, the words are theirs.
 */
import { namesMoney, priceBreach, priceFigures } from "../config/policy";
import { fileFolderOf } from "./files";
import {
  POST_LIMITS,
  postPhotoWont,
  type PostPhotoWont,
  type PostPlan,
  type PostShapeName,
  type PostUndrawable,
} from "./post";

/** Where a shape of a made file is kept: portrait is the file's original, the others stand beside it. */
export function postPathOf(tenantId: string, fileId: string, shape: PostShapeName): string {
  return `${fileFolderOf(tenantId, fileId)}/${shape === "portrait" ? "original" : shape}.jpg`;
}

/** What a post's band says, with the business's number. */
export const postBandOf = (phone: string, language: "en" | "es"): string =>
  `${language === "es" ? "Reserva" : "Book"} · ${phone}`;

/** What the bundled fonts can draw: Western Latin, its punctuation, and the euro. No emoji. */
const DRAWABLE = /^[\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u2122]*$/;
const POST_CONTACT = /https?:|www\.|@|\b[\w-]+\.[a-z]{2,}\b/i;
/** A run this long is a phone number, which the band says instead. */
const LONG_NUMBER = /\d[\d\s().-]{6,}\d/;
/**
 * The promises a business makes on purpose, in both languages. They read fine and cost money, so each needs the owner's own
 * word: a picture stays up long after a conversation is over.
 */
const PROMISES: readonly RegExp[] = [
  /\b(?:free|gratis|gratuit[oa]s?)\b/i,
  /\bguarantee[sd]?\b|\bgarant[ií]\w*/i,
  /\bwarrant(?:y|ies)\b/i,
  /\b(?:lifetime|permanent(?:e|es|ly)?|painless|risk[- ]free|sin dolor)\b/i,
  /\b(?:best|#\s?1|number one|n[uú]mero uno|mejor(?:es)?)\b/i,
  /\b(?:award|winning|premiad[oa]s?)\b/i,
  /\b(?:certified|licensed|board[- ]certified|certificad[oa]s?|licenciad[oa]s?)\b/i,
  /\b(?:cure[sd]?|heals?|clinically|cura(?:r|mos)?)\b/i,
  /\b(?:today only|last chance|limited|hurry|s[oó]lo hoy|[uú]ltima oportunidad|limitad[oa]s?)\b/i,
];

const numbersIn = (s: string): string[] => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

/** Why these words can't go on a picture, whoever wrote them, or null. */
export function postUndrawable(words: string, limit: number): PostUndrawable | null {
  const text = words.trim();
  if (Array.from(text).length > limit) return "long";
  if (!DRAWABLE.test(text)) return "character";
  if (POST_CONTACT.test(text)) return "contact";
  if (LONG_NUMBER.test(text)) return "number";
  return null;
}

/** The same, said to the model, which can do something about it. */
const UNDRAWABLE_TO_MODEL: Readonly<Record<PostUndrawable, (limit: number) => string>> = {
  long: (limit) => `it is over ${limit} characters, too long to read on a phone`,
  character: () => "it holds a character the post's fonts cannot draw, such as an emoji",
  contact: () => "a link, an email or a handle does not go in the words",
  number: () => "a phone number does not go in the words: set book to true and code adds theirs",
};

/**
 * What is wrong with some words a post would say, in a sentence for the model, or null. `owner` is what the owner has said: their
 * questions in this thread and what they wrote in Settings. Nothing is a stranger's word here: not what a customer wrote, a
 * page shows or a read returned.
 */
export function postWordsProblem(words: string, owner: string, limit: number): string | null {
  const text = words.trim();
  if (!text) return "it is empty";
  const undrawable = postUndrawable(text, limit);
  if (undrawable) return UNDRAWABLE_TO_MODEL[undrawable](limit);
  if (priceBreach(text, new Set(priceFigures(owner))))
    return "it names a price or a share the owner has not said. Use their figure, or ask them";
  const said = new Set(numbersIn(owner));
  const stray = numbersIn(text).find((n) => !said.has(n));
  if (stray) return `the number ${stray} is not one the owner has said. Use theirs, or ask them`;
  if (namesMoney(text) && !namesMoney(owner))
    return "it offers money (a discount, a deposit, a payment term) the owner has not offered. Use their words, or ask them";
  const promise = PROMISES.find((p) => p.test(text) && !p.test(owner));
  if (promise)
    return `it makes a promise the owner has not made ("${promise.exec(text)?.[0]}"). Use their words, or ask them`;
  return null;
}

/** The first problem with a plan's words, naming the part it is in, or null. */
export function postPlanProblem(plan: Pick<PostPlan, "line" | "over" | "under">, owner: string): string | null {
  const parts = [
    ["line", plan.line, POST_LIMITS.line],
    ["over", plan.over, POST_LIMITS.over],
    ["under", plan.under, POST_LIMITS.under],
  ] as const;
  for (const [name, words, limit] of parts) {
    if (name !== "line" && !words) continue;
    const problem = postWordsProblem(words ?? "", owner, limit);
    if (problem) return `${name}: ${problem}`;
  }
  return null;
}

const PHOTO_WONT_TO_MODEL: Readonly<Record<PostPhotoWont, string>> = {
  made: "that is a post Ask already made, with its words on it. Use the photo it came from",
  unkept: "it waits in the Inbox or was set aside: it is the owner's to keep first",
  design: "it already has words or a design on it, so more would clash",
};

/** What a file needs before a post is made from it, in a sentence for the model, or null. */
export function postPhotoProblem(f: Parameters<typeof postPhotoWont>[0]): string | null {
  const wont = postPhotoWont(f);
  return wont ? PHOTO_WONT_TO_MODEL[wont] : null;
}
