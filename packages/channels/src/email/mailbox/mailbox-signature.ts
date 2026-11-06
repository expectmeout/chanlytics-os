/**
 * What a connected mailbox signs its emails with (00487, the email canvas's lane B). A reply sent from Chanlytics left
 * unsigned, ending on "Talk soon,", where the same reply written in Gmail carries the owner's signature. Gmail keeps it
 * as HTML (gmailSignature reads it): sent as it is, cleaned of what an email never carries; said everywhere else as
 * words, never drawn as markup. Which one a mailbox signs with is contracts' rule (mailboxSignsOf).
 */
import { convert } from "html-to-text";
import { mailboxConnectionDtoOf, mailboxSignsOf, type MailboxConnectionDto } from "@chanlytics/contracts";

/** The longest Gmail signature a mailbox keeps (00487's check): a longer one is not kept, never cut through its markup. */
const GMAIL_SIGNATURE_MAX = 10_000;

/** What an email never carries, whoever wrote it: a script, a frame, a form, a style sheet, and a handler or a script link. */
const DROPPED = "script|style|iframe|object|embed|form|frameset|frame|meta|link|base|svg|math";
/** Such an element with all it holds, then any of their tags left on its own (one that was never closed). */
const DROPPED_ELEMENTS = new RegExp(`<(${DROPPED})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
const DROPPED_TAGS = new RegExp(`<\\/?(?:${DROPPED})\\b[^>]*>`, "gi");
const HANDLERS = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_LINKS =
  /\s+(href|src)\s*=\s*("\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*')/gi;

/**
 * Gmail's signature as it goes in an email: its markup, less anything that runs or loads a page; null where nothing of
 * it is left or it is past what a mailbox keeps.
 */
export function cleanGmailSignature(html: string | null | undefined): string | null {
  const clean = (html ?? "")
    .replace(DROPPED_ELEMENTS, "")
    .replace(DROPPED_TAGS, "")
    .replace(HANDLERS, "")
    .replace(SCRIPT_LINKS, "")
    .trim();
  if (!clean || clean.length > GMAIL_SIGNATURE_MAX || !gmailSignatureWords(clean)) return null;
  return clean;
}

/** An element whose own style sets it as a block (`display: block`, in any case or spacing), up to its tag's end. */
const BLOCK_STYLED =
  /(<[a-z][a-z0-9]*\b[^>]*?\bstyle\s*=\s*("[^"]*\bdisplay\s*:\s*block\b[^"]*"|'[^']*\bdisplay\s*:\s*block\b[^']*'))/gi;
/** The attribute a block-styled element is marked with, so the converter's one selector reads it as a line. */
const LINE_MARK = "data-signature-line";

/** Gmail's signature as words: its lines, its links by their words, its pictures left out. Null where it says nothing. */
export function gmailSignatureWords(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  // A line of its own wherever Gmail draws one (0077): a table's row and cell, and anything its style sets as a block,
  // which signature generators lay their spans out with. Otherwise a table's lines ran together ("Sam ReyesFounder").
  const marked = html.replace(BLOCK_STYLED, `$1 ${LINE_MARK}`);
  const words = convert(marked, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { ignoreHref: true } },
      { selector: "p", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      ...["table", "tr", "td", "th", `[${LINE_MARK}]`].map((selector) => ({
        selector,
        format: "block",
        options: { leadingLineBreaks: 1, trailingLineBreaks: 1 },
      })),
    ],
  })
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+$/, ""))
    // A block that held only the logo is a blank line once it is skipped: a signature's lines close up.
    .filter((l) => l.trim() !== "")
    .join("\n")
    .trim();
  return words || null;
}

/** A mailbox's row, as far as its signature goes. */
type SignedRow = {
  signature: string | null;
  signature_off?: boolean;
  from_name: string;
  gmail_signature?: string | null;
  gmail_signature_at?: string | null;
};

/**
 * What an email from this mailbox carries under its words: the words, and Gmail's HTML where it signs with Gmail's;
 * null where its owner sends none.
 */
export function mailboxSignatureOf(row: SignedRow): { text: string; html: string | null } | null {
  const signs = mailboxSignsOf(row, gmailSignatureWords(row.gmail_signature));
  if (signs.from === "none" || !signs.words) return null;
  return { text: signs.words, html: signs.from === "gmail" ? cleanGmailSignature(row.gmail_signature) : null };
}

/** A mailbox's row as the pages are told of it, its Gmail signature said in words (contracts mailboxConnectionDtoOf). */
export function mailboxDtoOf(
  row: Parameters<typeof mailboxConnectionDtoOf>[0] & { gmail_signature: string | null },
  day: Parameters<typeof mailboxConnectionDtoOf>[1] = null,
): MailboxConnectionDto {
  return mailboxConnectionDtoOf(row, day, gmailSignatureWords(row.gmail_signature));
}
