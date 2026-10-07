/**
 * Free mail: the providers anyone can have an address at. One list, read by the finder (a lead's address at one is
 * a person's, not the business's own) and by the domains a workspace may send from (nobody can publish records at
 * one, and a cold email from one is the spam it looks like).
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
  "mail.com",
]);

/** Is this host a free-mail provider's? Lower-cased and trimmed first. */
export function isFreeMail(host: string | null | undefined): boolean {
  return !!host && FREE_MAIL_DOMAINS.has(host.trim().toLowerCase());
}
