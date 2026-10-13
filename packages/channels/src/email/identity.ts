/**
 * Who a workspace's email leaves as and is answered at: its hosted address and reply route, a mailbox it connected
 * (decision 0056), the identity a reply or a cold email is frozen with, and the addresses the wire holds a frozen request to (sendsAs, requestLeavesAs). The
 * request itself is request.ts.
 */
import { addressOf } from "./header-values";
import type { EmailIdentity, EmailRequest } from "./request";

/** bestmovers@mail.chanlytics.com: the address a workspace publishes and sends from. */
export function hostedAddress(localPart: string, domain: string): string {
  return `${localPart}@${domain}`;
}

/** r+<token>@mail.chanlytics.com: where a reply comes back. It routes to a workspace; it authenticates nobody. */
export function replyRouteAddress(replyToken: string, domain: string): string {
  return `r+${replyToken}@${domain}`;
}

/** A workspace's hosted identity, from its mailbox row and the deployment's mail domain. */
export function hostedIdentity(
  mailbox: { local_part: string; reply_token: string; from_name: string },
  domain: string,
): EmailIdentity {
  return {
    fromName: mailbox.from_name,
    fromAddress: hostedAddress(mailbox.local_part, domain),
    replyTo: replyRouteAddress(mailbox.reply_token, domain),
  };
}

/** The addresses one workspace's email may leave as and be answered at: what the wire holds a frozen request to. */
export interface EmailSendsAs {
  /** The From address. */
  address: string;
  /** Every Reply-To that still routes to this workspace: the live reply route, and the rotated-out one until it is revoked. */
  replyRoutes: string[];
}

/** What a mailbox row sends as, on the deployment's mail domain. */
export function sendsAs(
  mailbox: { local_part: string; reply_token: string; reply_token_prev: string | null },
  domain: string,
): EmailSendsAs {
  return {
    address: hostedAddress(mailbox.local_part, domain),
    replyRoutes: [mailbox.reply_token, mailbox.reply_token_prev]
      .filter((t): t is string => !!t)
      .map((t) => replyRouteAddress(t, domain)),
  };
}

/**
 * What the mailbox sends OFFERS as (One message, every channel, step 4; the spec's 4.6): From on the campaigns domain, so a
 * complaint about an offer never touches the domain replies and visit messages leave from, and answered at the same reply
 * routes as every other email, on the mail domain (the one that receives): a reply to an offer lands in the Inbox.
 */
export function sendsAsCampaigns(
  mailbox: { local_part: string; reply_token: string; reply_token_prev: string | null },
  campaignsDomain: string,
  mailDomain: string,
): EmailSendsAs {
  return {
    address: hostedAddress(mailbox.local_part, campaignsDomain),
    replyRoutes: sendsAs(mailbox, mailDomain).replyRoutes,
  };
}

/** The identity an offer is frozen with: the mailbox's name and local part on the campaigns domain, Reply-To its live reply route on the mail domain. */
export function campaignsIdentity(
  mailbox: { local_part: string; reply_token: string; from_name: string },
  campaignsDomain: string,
  mailDomain: string,
): EmailIdentity {
  return {
    fromName: mailbox.from_name,
    fromAddress: hostedAddress(mailbox.local_part, campaignsDomain),
    replyTo: replyRouteAddress(mailbox.reply_token, mailDomain),
  };
}

/**
 * What a mailbox the business connected sends as (decision 0056): From its own address, and answered at the same
 * address, since a reply to it lands in it and the sync reads it back. The wire holds a request frozen for it to that
 * address alone.
 */
export function sendsAsConnected(mailbox: { address: string }): EmailSendsAs {
  const address = mailbox.address.trim().toLowerCase();
  return { address, replyRoutes: [address] };
}

/** The identity a request leaving from a connected mailbox is frozen with: its name, its address, its address again to answer. */
export function connectedIdentity(mailbox: { address: string; from_name: string }): EmailIdentity {
  const address = mailbox.address.trim().toLowerCase();
  return { fromName: mailbox.from_name, fromAddress: address, replyTo: address };
}

/**
 * Does this frozen request leave as this workspace and nobody else? The
 * request is JSON on a row; the wire is bound to a workspace's mailbox. A
 * request whose From or Reply-To is another's is refused rather than sent, the
 * same promise the WhatsApp wire keeps by taking its credentials from the
 * tenant and never from the environment.
 */
export function requestLeavesAs(request: EmailRequest, as: EmailSendsAs): boolean {
  return (
    addressOf(request.from)?.address === as.address &&
    request.reply_to.length === 1 &&
    request.reply_to.every((to) => as.replyRoutes.includes(to.trim().toLowerCase()))
  );
}
