/**
 * What the door holds an OFFER by email to (deliver.ts; One message, every channel, step 4; the campaigns-on-every-channel
 * spec, 4.5 and 4.6), apart from the person's consent (contracts mayMessageFor, which the door asks too: no unsubscribe, and
 * a relationship on record or their own yes). An offer goes only where all three hold:
 *   - the deployment can send one: its campaigns domain is verified and bound to the wire (`emailOffers`, which the edge
 *     says), else `email_marketing_disabled`;
 *   - the workspace's offers are not paused by a gate (contracts OFFER_GATES), else `email_offers_paused`: reminders and
 *     replies by email, which never reach this, go on;
 *   - the email carries the one-click unsubscribe an offer owes (RFC 8058: both headers), else `outreach_without_unsubscribe`.
 * Pure, so the door reads one answer and its length stays its own; the pause itself is read by the door, which holds
 * the database.
 */
import type { EmailRequest } from "@chanlytics/channels";
import type { DeliveryRefusal, SendPurpose } from "@chanlytics/contracts";

/**
 * Whether a send is an OFFER by email: the one kind the door asks the offer rules of (the deployment, the pause, the
 * one-click unsubscribe) and the person's relationship with the business. One statement, so what the door reads for it and
 * what it refuses for it never disagree.
 */
export function isOfferByEmail(d: { channel: string; purpose: SendPurpose }): boolean {
  return d.channel === "email" && d.purpose === "marketing";
}

/** What an offer by email asks of the deployment and the workspace, as the door has read it. */
export interface OfferFacts {
  /** The deployment can send an offer by email now (its campaigns domain is verified). */
  open: boolean;
  /** The workspace's offers by email are paused by a gate. Read only for an offer where one could go. */
  paused: boolean;
}

/**
 * The offer facts for one send: whether the deployment can send one, and, for an offer by email where one could go, whether
 * the workspace's offers are paused (`pausedSince` reads it, and is asked only then). A pause set a moment ago holds the
 * very next offer, because it is read at the wire.
 */
export async function offerFacts(
  d: { channel: string; purpose: SendPurpose },
  emailOffers: boolean | undefined,
  pausedSince: () => Promise<unknown>,
): Promise<OfferFacts> {
  const open = emailOffers === true;
  const asked = open && isOfferByEmail(d);
  return { open, paused: asked ? (await pausedSince()) !== null : false };
}

/** Why an offer by email may not leave, or null when it may (and for any send that is not one). */
export function offerRefusal(
  d: { channel: string; purpose: SendPurpose; email?: EmailRequest },
  o: OfferFacts,
): DeliveryRefusal | null {
  if (!isOfferByEmail(d)) return null;
  if (!o.open) return "email_marketing_disabled";
  if (o.paused) return "email_offers_paused";
  const headers = d.email?.headers ?? {};
  const oneClick = !!headers["List-Unsubscribe"] && headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click";
  return oneClick ? null : "outreach_without_unsubscribe";
}
