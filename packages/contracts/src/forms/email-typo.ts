/**
 * A likely typo in an email address (the Forms plan, 3.2): offered to a visitor beside the field, and to a member
 * whose reply bounced, never used without their press: it may be right as typed. Pure, and apart from the answers'
 * reading, so a page that offers it carries no schema.
 */

/** The mail providers whose addresses are mistyped most, by the ways they are mistyped. */
const PROVIDER_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
};

/** Endings that are a mistyped ".com", whatever the domain. */
const COM_TYPOS = [".con", ".cmo", ".comm", ".vom"];

/**
 * The address the visitor likely meant, offered beside the field ("Did you mean …?"), or null when nothing looks
 * mistyped: a big provider's name mistyped, or ".com" mistyped at the end. A business's own domain is never changed.
 */
export function emailTypoFix(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at < 1) return null;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1).toLowerCase();
  const provider = PROVIDER_TYPOS[domain];
  if (provider) return `${local}@${provider}`;
  const ending = COM_TYPOS.find((typo) => domain.endsWith(typo));
  return ending ? `${local}@${domain.slice(0, -ending.length)}.com` : null;
}
