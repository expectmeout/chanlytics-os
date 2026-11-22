/**
 * The short code a request's thank-you carries into a chat (the Forms plan, 3.4 and 3.5): six characters of capitals and
 * digits nobody misreads (no I, O, 0 or 1; the database makes it, form_code_new), the workspace's own, good once and for
 * 30 days. The message that opens in the chat is the visitor's own: who they are, what they asked, and the code in
 * brackets at its end, so what is answered there is their own words and the conversation knows its request. A code is
 * read only in its brackets, wherever they stand, so a word that happens to look like one is never one. Pure.
 */
import { fillWords, type FormPageWords } from "./page-words";

/** How long a request's code is good for, in days. */
export const REQUEST_CODE_DAYS = 30;

/** A code in its brackets, in a message as it arrived. */
const CODE_IN_BRACKETS = /\(([A-HJ-NP-Za-hj-np-z2-9]{6})\)/;

/** The most the message that opens in a chat holds: a long answer is cut to fit, the code never. */
const MESSAGE_MAX = 500;

/** The request's code a message carries, in capitals, or null when it carries none. */
export function requestCodeOf(text: string): string | null {
  return CODE_IN_BRACKETS.exec(text)?.[1]?.toUpperCase() ?? null;
}

/** What the chat's first message says of a request. */
export interface ContinuedRequest {
  business: string;
  name: string | null;
  heading: string;
  /** What they asked, in their own words: the first long answer, or nothing. */
  lead: string | null;
  code: string;
}

/**
 * The message that opens in the chat, in the form's language: a hello, what the request is, what they asked (cut to
 * fit), and the code in its brackets last. The code is put there by this rule and never by a line of words, so no
 * language can lose it.
 */
export function continueMessage(words: FormPageWords, request: ContinuedRequest): string {
  const hello = request.name
    ? fillWords(words.chat_hello, { business: request.business, name: request.name })
    : fillWords(words.chat_hello_plain, { business: request.business });
  const head = `${hello} ${fillWords(words.chat_about, { heading: request.heading })}`;
  const tail = `(${request.code})`;
  const room = MESSAGE_MAX - head.length - tail.length - 4;
  const lead = (request.lead ?? "").replace(/\s+/g, " ").trim();
  const quoted = lead && room > 20 ? ` "${lead.length > room ? `${lead.slice(0, room - 1).trimEnd()}…` : lead}"` : "";
  return `${head}${quoted} ${tail}`;
}
