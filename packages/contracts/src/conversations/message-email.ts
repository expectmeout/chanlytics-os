/**
 * What an email carries beyond its own words: its subject, what the intake left out, and the chain it quoted
 * back at us. message-words.ts says an email's words with it; the Inbox's thread (inbox-thread.ts) shows the rest.
 */
import type { MessageDto } from "./thread-dto";

/** An email's subject, as the intake kept it (core email-ingest.ts). */
export function emailSubjectOf(m: MessageDto): string | null {
  const email = (m.meta as { email?: { subject?: unknown } } | null)?.email;
  return typeof email?.subject === "string" && email.subject.trim() ? email.subject.trim() : null;
}

/**
 * What an email carried that the thread does not show. The intake keeps the
 * names of an email's files and never the files, and a bounded amount of its
 * words (core email-ingest.ts); an owner reading "see the attached floor plan"
 * above nothing at all would take the email for the whole of it. Said in one
 * line under the words, and only when something was left out.
 */
export function emailLeftOutOf(meta: unknown): string | null {
  const email = (meta as { email?: { attachments?: unknown; more_attachments?: unknown; truncated?: unknown } } | null)
    ?.email;
  if (!email) return null;
  const files = Array.isArray(email.attachments) ? email.attachments : [];
  const unnamed = typeof email.more_attachments === "number" && email.more_attachments > 0 ? email.more_attachments : 0;
  const names = files
    .map((f) => (f as { filename?: unknown } | null)?.filename)
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  const total = files.length + unnamed;
  const said: string[] = [];
  if (total) {
    const rest = total - names.length;
    const listed = names.length ? `: ${names.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}` : "";
    said.push(`${total === 1 ? "1 attachment was" : `${total} attachments were`} not kept${listed}.`);
  }
  if (email.truncated === true) said.push("This email was longer than Chanlytics keeps; the rest was left out.");
  return said.length ? said.join(" ") : null;
}

/** Windows-1252's bytes 0x80 to 0x9F, by the character each is drawn as: where UTF-8 read as 1252 shows "â€™" for "’". */
const CP1252_CODES = [
  0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8e, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f,
];
const CP1252_BYTE: ReadonlyMap<string, number> = new Map(
  Array.from("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ", (ch, i) => [ch, CP1252_CODES[i] ?? 0]),
);
/** A run that reads as UTF-8 drawn byte by byte: a lead byte's character, then continuation bytes' characters. */
const MOJIBAKE_RUN = /[Â-ô][\u0080-¿€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]+/g;
/**
 * The strict decoder, made the first time a run is read back rather than as the module loads: every page imports this
 * module, and the shell's harness runs the bundles where there is no TextDecoder at all (legacy-harness.test.mjs).
 */
let strictUtf8: TextDecoder | null = null;
const readStrict = (bytes: Uint8Array): string =>
  (strictUtf8 ??= new TextDecoder("utf-8", { fatal: true })).decode(bytes);

/**
 * Words whose UTF-8 was read as Latin-1 or Windows-1252, given back their own characters: "youâ€™re" is "you’re". A
 * sender that labels a UTF-8 part as Latin-1, or encoded its words twice, gives an email this; the import kept three
 * such, which People then said as their last words (27 Oct 2026). Only a run that is whole UTF-8 once read back as
 * bytes is changed, so a word truly written in Latin-1 ("café") stays as it is. The mailbox's import repairs what it
 * reads (channels mailbox-read.ts), and an email's parts repair what was kept before it did: a message's words never
 * change once written (00486's guard), so the three are said right without being rewritten.
 */
export function repairMojibake(text: string): string {
  if (!/[Â-ô]/.test(text)) return text;
  return text.replace(MOJIBAKE_RUN, (run) => {
    const bytes = Array.from(run, (ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x100 ? code : (CP1252_BYTE.get(ch) ?? -1);
    });
    if (bytes.some((b) => b < 0)) return run;
    try {
      return readStrict(Uint8Array.from(bytes));
    } catch {
      return run;
    }
  });
}

/* An email replies by quoting the whole of what it answers. "Got it, thanks!" arrived as six
   lines of "On Thu, Sep 17, 2026 at 10:44 PM Marisa's Beauty Salon <…> wrote: > testing back at
   you >", and the thread drew every one of them. The chain is kept — an operator may need to see
   what the customer was answering — but it is not what the bubble says.

   Only the shapes a mail client actually writes are cut, each anchored to the START of a line:
   an attribution line ending in "wrote:", Outlook's divider, and a run of "> " quotes. Anything
   else is left alone, because a false positive silently hides a customer's words. */
/* A divider, or a run of ">" quotes, each at the start of its own line. */
const QUOTE_BLOCK = /^[ \t]*(?:(?:-{2,}[ \t]*Original Message[ \t]*-{2,})|(?:_{5,})|(?:>[ \t]?))/m;
/* "On <date> <someone> wrote:", which the wire does NOT always put on its own line. The body this
   was written against arrived flattened — "Got it, thanks! On Thu, Sep 17, 2026 at 10:44 PM
   Marisa's Beauty Salon <…> wrote: > testing back at you >", all one line — so it is not anchored
   to a line start. Instead the attribution only counts when a quote actually follows it: a newline
   or a ">". "On Tuesday my friend wrote: yes" is a customer's sentence, and stays one. */
const QUOTE_ATTRIBUTION = /\bOn\b[\s\S]{0,240}?\bwrote:[ \t]*(?=\r?\n|>)/;

/** An email's own words, and the chain it quoted back at us. `quoted` is null when there is none. */
export function splitQuotedReply(body: string): { text: string; quoted: string | null } {
  const cuts = [QUOTE_ATTRIBUTION.exec(body), QUOTE_BLOCK.exec(body)]
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m.index);
  if (cuts.length === 0) return { text: body, quoted: null };
  const cut = Math.min(...cuts);
  const text = body.slice(0, cut).trim();
  const quoted = body.slice(cut).trim();
  // A reply that is ONLY the quote keeps its words: better a long bubble than an empty one.
  if (!text || !quoted) return { text: body, quoted: null };
  return { text, quoted };
}

/* An email in its parts (27 Oct 2026, the email canvas's lane A): what they wrote, the signature under it, and the
   chain it quoted. Gmail's plain text puts no "-- " before a signature, so "needs you test" arrived as six lines of
   "Ruben Segura / Founder, RJ Capital / [image: RJ Capital] <https://rjcapital.io> / …", every one drawn as their
   words. The signature is found in the words as they were kept, and only where it looks like one: hiding a customer's
   words is worse than a long bubble, so a sign-off and their name stay words, and so does a form's "Phone: …". */

/** What an email says, in its parts; `signature` and `quoted` are null when it has none. */
export interface EmailParts {
  said: string;
  signature: string | null;
  quoted: string | null;
}

const SIG_DASHES = /^--\s*$/;
const IMAGE_STAND_IN = /\[image:[^\]\n]*\]/i;
const LABELLED = /^[A-Za-z][\w ./-]{0,30}:\s+\S/;
const SIGN_OFF =
  /^(thanks|thank you|many thanks|best|best regards|kind regards|regards|warm regards|warmly|cheers|sincerely|talk soon|all the best|take care|gracias|saludos|un saludo|atentamente)\b[^.?]*$/i;
const CONTACT =
  /(https?:\/\/|www\.|\b[\w-]+\.(com|io|co|net|org|agency|us|ca|uk|app|dev|info|biz)\b|@[\w-]+\.|\+?\d[\d\s().-]{6,}\d)/i;
const NAME_LIKE = /^[A-Z][\p{L}'’.-]+(?:\s+[A-Z][\p{L}'’.-]+){0,3}$/u;
const SENT_FROM = /^(sent from my\b|get outlook for\b|enviado desde mi\b)/i;
const SIG_MAX_LINES = 8;
const SIG_LINE_MAX = 90;
const SIG_LINE_PARTS = 3;

const blankLine = (l: string): boolean => l.trim() === "";

/** Whether a line names the person the email is from: a word of their name, in a line that is not a sentence. */
function namesSender(line: string, fromName: string | null): boolean {
  if (!fromName || /[?!]/.test(line) || line.split(/\s+/).length > 5) return false;
  const words = fromName
    .toLowerCase()
    .split(/[^\p{L}'’-]+/u)
    .filter((w) => w.length > 1);
  const said = line.toLowerCase();
  return words.some((w) => said.includes(w));
}

/**
 * Where a signature begins among the lines of what they wrote, or null when none is plainly there: after a "-- " line;
 * a "Sent from my …" last line; or the last block after a blank line, when it is a card (a name, then a way to reach
 * them), carries Gmail's picture stand-in, or names the sender. A sign-off ("Best,") stays with the words above it.
 */
function signatureStart(lines: readonly string[], fromName: string | null): number | null {
  const first = lines.findIndex((l) => !blankLine(l));
  if (first < 0) return null;
  const dashes = lines.findIndex((l, i) => i > first && SIG_DASHES.test(l));
  if (dashes > 0) return dashes;
  const lineAt = (i: number): string => (lines.at(i) ?? "").trim();
  let last = lines.length - 1;
  while (last > first && !lineAt(last)) last--;
  if (last > first && SENT_FROM.test(lineAt(last))) return last;
  // The last blank line above the last words: the block under it is the one that may be a card.
  let blank = last;
  while (blank > first && lineAt(blank)) blank--;
  if (blank <= first) return null;
  const block = lines.slice(blank + 1, last + 1).map((l) => l.trim());
  if (block.length > SIG_MAX_LINES || block.some((l) => l.length > SIG_LINE_MAX || LABELLED.test(l))) return null;
  const [head = "", ...rest] = block;
  const signedOff = SIGN_OFF.test(head) || head.endsWith(",");
  const card = signedOff ? rest : block;
  const [name = "", ...under] = card;
  if (!name) return null;
  const pictured = card.some((l) => IMAGE_STAND_IN.test(l));
  const named = card.length >= 2 && namesSender(name, fromName);
  const shaped = NAME_LIKE.test(name) && under.some((l) => CONTACT.test(l));
  return pictured || named || shaped ? blank + 1 + (signedOff ? 1 : 0) : null;
}

/** An address as a bubble compares it: no scheme, no "www.", no closing slash. */
const bareAddress = (s: string): string =>
  s
    .toLowerCase()
    .replace(/^(https?:\/\/|mailto:)/, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

/**
 * An email's words as a person reads them: one line ending, no line of spaces, no run of blank lines, and Gmail's
 * plain-text stand-ins gone. "[image: RJ Capital] <https://rjcapital.io>" is a picture and its link, said as text; a
 * linked word arrives as the word and its address in angle brackets, "rjcapital.io <https://rjcapital.io>", kept as the
 * address alone when they are the same, which the bubble then links.
 */
export function tidyEmailWords(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const pictured = IMAGE_STAND_IN.test(line);
    const tidy = line
      .replace(/\[image:[^\]\n]*\](?:[ \t]*<(?:https?:|mailto:)[^>\s]*>)?/gi, "")
      .replace(/(\S+)[ \t]*<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, (_, word: string, url: string) => {
        const address = url.replace(/^mailto:/i, "");
        return bareAddress(word) === bareAddress(url) ? address : `${word} ${address}`;
      })
      .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, (_, url: string) => url.replace(/^mailto:/i, ""))
      .replace(/[ \t]+$/, "");
    // A line that held only a picture is gone, not left as a blank line inside a signature.
    if (pictured && blankLine(tidy)) continue;
    kept.push(blankLine(tidy) ? "" : tidy);
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * An email in its parts. `fromName` is the name the sender's own client gave (the intake keeps it as meta.email
 * from_name); null for words of ours, which carry no signature in what was typed. A body whose every word looks like a
 * signature keeps them as words: a bubble is never empty.
 */
export function emailPartsOf(body: string, fromName: string | null): EmailParts {
  const { text, quoted } = splitQuotedReply(repairMojibake(body).replace(/\r\n?/g, "\n"));
  const lines = text.split("\n");
  const at = fromName === null ? null : signatureStart(lines, fromName);
  const said = tidyEmailWords(at === null ? text : lines.slice(0, at).join("\n"));
  if (at === null || !said)
    return { said: tidyEmailWords(text), signature: null, quoted: quoted && tidyEmailWords(quoted) };
  const signed = lines.slice(SIG_DASHES.test(lines.at(at) ?? "") ? at + 1 : at).join("\n");
  return { said, signature: tidyEmailWords(signed) || null, quoted: quoted && tidyEmailWords(quoted) };
}

/** A link written the way a mail list writes it in plain text: "[Conditions of Use](https://…)". */
const MARKDOWN_LINK = /\[([^\]\n]+)\]\((?:https?:|mailto:)[^)\s]*\)/gi;
/** A link a line can do without: a whole address with its scheme, or a phone's in angle brackets ("<tel:+1…>"). */
const LINK_OUT = /[ \t]*(?:<(?:tel|sms):[^>\s]*>|\bhttps?:\/\/[^\s<>]+)/gi;
/** A line with something to read in it: a run of dashes or underscores under "Dear …" is a rule, not words. */
const HAS_WORDS = /[\p{L}\p{N}]/u;

/**
 * An email as one line that previews it, as People's row says their last words: what they wrote, without the chain it
 * quoted or the signature under it (emailPartsOf), a list's links as their words alone, an address with its scheme gone
 * (a bare "example.com" stays), a rule of dashes gone, and the lines run together, a form's "Label: value" lines each
 * after a " · ". The row said the whole body flattened: "needs you test Ruben Segura Founder, RJ Capital [image: RJ
 * Capital] <https://rjcapital.io> …", and a signup form as one run of "Email: … Language: … Source: …". A sender's name is
 * not known here, so a signature is found by its shape.
 */
export function emailPreviewOf(body: string): string {
  const lines = emailPartsOf(body, "")
    .said.replace(MARKDOWN_LINK, "$1")
    .replace(LINK_OUT, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => HAS_WORDS.test(l));
  return lines.reduce((out, l) => (out ? `${out}${LABELLED.test(l) ? " · " : " "}${l}` : l), "");
}

/** A signature in one line: its first few parts, as "Ruben Segura · Founder, RJ Capital · rjcapital.io". */
export function emailSignatureLine(signature: string): string {
  return signature
    .split(/\n|[ \t]+\|[ \t]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, SIG_LINE_PARTS)
    .join(" · ");
}

/**
 * What an email about to be sent will be signed with, in a line under the words written for it (decision 0081): the
 * Inbox's box and a new conversation's email say it the same way, the whole signature on hover.
 */
export function emailSignedLine(signature: string): string {
  return `Signed ${emailSignatureLine(signature)}`;
}

/** The words an email of ours was signed with, as the reply that sent it kept them (00487 meta.email.signature); else null. */
export function emailSignedWithOf(m: MessageDto): string | null {
  if (m.sender === "customer") return null;
  const signed = (m.meta as { email?: { signature?: unknown } } | null)?.email?.signature;
  return typeof signed === "string" && signed.trim() ? signed.trim() : null;
}

/** A subject as a thread compares it: "Re: test need you" and "Fwd: Test need you" are "test need you". */
const REPLY_PREFIX = /^((re|fwd?|fw|aw|sv|tr)\s*:\s*)+/i;
const subjectKey = (s: string): string => s.replace(REPLY_PREFIX, "").trim().toLowerCase();

/**
 * A thread's subject, said once: its first email's, without "Re:", which the thread's head says, and each email's own
 * where it changes from the one before, which that bubble says. "test need you" above the question and "Re: test need
 * you" above the answer said the same thing twice.
 */
export function emailSubjectsOf(messages: readonly MessageDto[]): {
  thread: string | null;
  changed: Map<string, string>;
} {
  let thread: string | null = null;
  let key = "";
  const changed = new Map<string, string>();
  for (const m of messages) {
    const subject = m.channel === "email" ? emailSubjectOf(m) : null;
    if (!subject) continue;
    if (thread === null) thread = emailTopicOf(m);
    else if (subjectKey(subject) !== key) changed.set(m.id, subject);
    key = subjectKey(subject);
  }
  return { thread, changed };
}

/** An email's subject without "Re:" or "Fwd:", as a line that leads with it says it; null on another wire or with none. */
export function emailTopicOf(m: MessageDto): string | null {
  const subject = m.channel === "email" ? emailSubjectOf(m) : null;
  return subject ? subject.replace(REPLY_PREFIX, "").trim() || subject : null;
}

/** The name the sender's client gave an email of theirs, as the intake kept it; null on one of ours or with none. */
export function emailFromNameOf(m: MessageDto): string | null {
  if (m.sender !== "customer") return null;
  const name = (m.meta as { email?: { from_name?: unknown } } | null)?.email?.from_name;
  return typeof name === "string" && name.trim() ? name.trim() : "";
}
