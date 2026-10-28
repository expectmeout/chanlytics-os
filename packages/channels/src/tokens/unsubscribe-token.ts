/**
 * The unsubscribe link a campaign email carries: whose "stop" it is, sealed.
 *
 * RFC 8058's one click takes no sign-in, so the link is the authority: it names the workspace, the person and the
 * email it came in, and a keyed MAC makes it unforgeable. It never expires. The law wants the way out working for
 * at least thirty days (CAN-SPAM), a stop pressed late must still stop, and all a token can ever do is narrow what
 * may be sent, so a leaked one costs the person nothing they did not ask for.
 *
 * The seal is sealed-link.ts's, under this link's own label and UNSUBSCRIBE_SECRET, which the edge (minting, Reach
 * out Part 3) and the dashboard (the page, apps/dashboard/app/u/[token]) share. The page also opens a link sealed
 * under UNSUBSCRIBE_SECRET_PREVIOUS, so the secret can be rotated without closing a link already sent.
 */
import { openLink, sealedUrl, sealLink, type SealedClaims } from "./sealed-link";

export type UnsubscribeClaims = SealedClaims;

/** Where the page lives on the dashboard's origin. */
export const UNSUBSCRIBE_PATH = "/u/";

const UNSUBSCRIBE_LABEL = "chanlytics-unsubscribe:";

export function signUnsubscribeToken(secret: string, c: UnsubscribeClaims): string {
  return sealLink("signUnsubscribeToken", UNSUBSCRIBE_LABEL, secret, c);
}

/**
 * The claims a token seals, or null for anything that is not a token one of these secrets made. Never throws.
 * `secrets` is the current secret and, while a rotation settles, the one before it: a link already in somebody's
 * inbox must keep working for at least thirty days (CAN-SPAM), so a rotation never closes one. A blank is skipped.
 */
export function verifyUnsubscribeToken(
  secrets: readonly (string | null | undefined)[],
  token: string,
): UnsubscribeClaims | null {
  return openLink(UNSUBSCRIBE_LABEL, secrets, token);
}

/** The link, on an origin: what the footer shows and List-Unsubscribe carries. */
export function unsubscribeUrl(origin: string, token: string): string {
  return sealedUrl(origin, UNSUBSCRIBE_PATH, token);
}
