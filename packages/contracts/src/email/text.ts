/**
 * A plain email's text as it leaves: its words, then the signature under them, then the foot, a blank line between and
 * none of them padded. The wire writes every email's text with it (channels buildEmailRequest), a draft its owner sends
 * is handed as it, and Send me a test mails it, so a test is the email and never a likeness of it (3 Nov 2026: a test
 * that laid its email out its own way read as another email).
 */
interface EmailText {
  /** The words, filled. */
  body: string;
  /** What signs it under the words; null signs with nothing. */
  signature?: string | null;
  /** The foot the law asks for, or a message's own; null has none. */
  footer?: string | null;
}

export function emailTextOf(emailText: EmailText): string {
  return [emailText.body.trim(), emailText.signature?.trim(), emailText.footer?.trim()].filter(Boolean).join("\n\n");
}
