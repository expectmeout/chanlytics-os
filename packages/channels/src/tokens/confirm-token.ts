/**
 * The link a sign-up's confirmation email carries (a website's form, 00489): pressed, it is the person's yes to offers
 * by email, proven by the press, since only the inbox the email reached holds the link.
 *
 * It names the workspace, the person and the confirmation email, sealed as the unsubscribe link is (sealed-link.ts)
 * under its own label, so neither kind of link opens as the other though both use UNSUBSCRIBE_SECRET (and its previous
 * value while a rotation settles). It carries no time: how long it works is read off the email's row by the yes door
 * (set_email_offers_yes, confirmed_signup), the one place that says it. The edge mints it; the dashboard's page
 * (apps/dashboard/app/c/[token]) opens it.
 */
import { openLink, sealedUrl, sealLink, type SealedClaims } from "./sealed-link";

export type ConfirmClaims = SealedClaims;

/** Where the page lives on the dashboard's origin. */
export const CONFIRM_PATH = "/c/";

const CONFIRM_LABEL = "chanlytics-confirm:";

export function signConfirmToken(secret: string, c: ConfirmClaims): string {
  return sealLink("signConfirmToken", CONFIRM_LABEL, secret, c);
}

/** The claims a token seals, or null for anything that is not a confirmation link one of these secrets made. */
export function verifyConfirmToken(
  secrets: readonly (string | null | undefined)[],
  token: string,
): ConfirmClaims | null {
  return openLink(CONFIRM_LABEL, secrets, token);
}

/** The link, on the dashboard's origin: what the confirmation email carries. */
export function confirmUrl(origin: string, token: string): string {
  return sealedUrl(origin, CONFIRM_PATH, token);
}
