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
