/**
 * The words of a received email.
 *
 * The plain-text part, when the sender's client wrote one, which every
 * person's client does. An email with only HTML (a form, a notification) is
 * reduced to text by a maintained converter, not by regular expressions:
 * scripts and styles are dropped, images are skipped so nothing remote is ever
 * fetched, and a link keeps its address beside its words. What comes out is
 * what a person reads in the thread, and one day what a model is shown; it is
 * never rendered as markup anywhere.
 */
import { convert } from "html-to-text";
import type { ReceivedEmail } from "./email/intake";

export function emailPlainText(e: Pick<ReceivedEmail, "text" | "html">): string | null {
  const text = (e.text ?? "").replace(/\r\n/g, "\n").trim();
  if (text) return text;
  if (!e.html) return null;
  const converted = convert(e.html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return converted || null;
}
