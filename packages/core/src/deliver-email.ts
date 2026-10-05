/**
 * What the door holds an OFFER by email to (deliver.ts; One message, every channel, step 4; the campaigns-on-every-channel
 * spec, 4.5 and 4.6; decision D2 of the Campaigns wiring review), apart from the person's consent (contracts mayMessageFor,
 * which the door asks too: no unsubscribe, and a relationship on record or their own yes). An offer goes only where all
 * three hold:
 *   - the deployment can send one: its campaigns domain is verified and bound to the wire (`emailOffers`, which the edge
 *     says), else `email_marketing_disabled`;
 *   - the workspace's offers are not paused by a gate (contracts OFFER_GATES), else `email_offers_paused`: reminders and
 *     replies by email, which never reach this, go on;
 *   - the email carries the one-click unsubscribe an offer owes (RFC 8058: both headers), else `outreach_without_unsubscribe`.
 * An offer is what contracts isOfferByEmail says it is: a marketing message by email, and the business's own news by email
 * (a proactive email about "ours", a broadcast or a moment's news), which is a commercial message whatever its template's
 * category. A visit, a proposal, a reply and a cold email are not, and meet none of this.
 * Pure, so the door reads one answer and its length stays its own; the pause itself is read by the door, which holds
 * the database.
 */
import { isOfferByEmail, type DeliveryRefusal, type MessageAbout, type SendPurpose } from "@chanlytics/contracts";
import type { EmailRequest } from "@chanlytics/channels";

/** What makes a send an offer by email (contracts isOfferByEmail): its channel, its purpose, whether it starts a conversation, and what it is about. */
type Offerable = { channel: string; purpose: SendPurpose; proactive: boolean; about: MessageAbout };

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
  d: Offerable,
  emailOffers: boolean | undefined,
  pausedSince: () => Promise<unknown>,
): Promise<OfferFacts> {
  const open = emailOffers === true;
  const asked = open && isOfferByEmail(d);
  return { open, paused: asked ? (await pausedSince()) !== null : false };
}

/** Why an offer by email may not leave, or null when it may (and for any send that is not one). */
export function offerRefusal(d: Offerable & { email?: EmailRequest }, o: OfferFacts): DeliveryRefusal | null {
  if (!isOfferByEmail(d)) return null;
  if (!o.open) return "email_marketing_disabled";
  if (o.paused) return "email_offers_paused";
  const headers = d.email?.headers ?? {};
  const oneClick = !!headers["List-Unsubscribe"] && headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click";
  return oneClick ? null : "outreach_without_unsubscribe";
}

/**
 * An email is written before it is sent, under the id its request was frozen with: every receipt names that row by the
 * request's tag, so a row written after the send (recordOutbound's) is one no receipt can find, and its bounce
 * suppresses nothing. A delivery that breaks this is a caller's mistake, said as one before anything is read.
 */
export function assertFrozenFor(d: {
  channel: string;
  conversationId: string;
  messageId?: string | null;
  email?: EmailRequest;
  ownEmail?: EmailRequest;
}): void {
  if (d.channel !== "email") return;
  const keys = [d.email, d.ownEmail].map((r) => r?.idempotency_key ?? d.messageId);
  if (d.messageId && keys.every((k) => k === d.messageId)) return;
  throw new Error(
    `deliver: an email leaves only from the queued row its request was frozen for (conversation ${d.conversationId})`,
  );
}
