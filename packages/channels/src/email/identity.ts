/**
 * Who a workspace's email leaves as and is answered at: its hosted address and reply route, the identity a reply or
 * a cold email is frozen with, and the addresses the wire holds a frozen request to (sendsAs, requestLeavesAs). The
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
 * What one of a workspace's own domains sends as (Reach out): From on the
 * workspace's domain, answered at the mailbox's own reply routes, so a reply
 * to a cold email lands in the same Inbox as every other. With cold reply
 * domains (D17) the routes are on them too: a cold email is frozen with the
 * one set now, and one frozen before a switch still leaves as it was.
 */
export function sendsAsOwnDomain(
  domain: { host: string; from_local: string },
  mailbox: { local_part: string; reply_token: string; reply_token_prev: string | null },
  mailDomain: string,
  coldReplyDomains: string | readonly string[] | null = null,
): EmailSendsAs {
  const cold = typeof coldReplyDomains === "string" ? [coldReplyDomains] : (coldReplyDomains ?? []);
  return {
    address: `${domain.from_local}@${domain.host}`.toLowerCase(),
    replyRoutes: [
      ...sendsAs(mailbox, mailDomain).replyRoutes,
      ...cold.filter((d) => d !== mailDomain).flatMap((d) => sendsAs(mailbox, d).replyRoutes),
    ],
  };
}

/**
 * The identity a cold email is frozen with: the own domain's name and address, and the mailbox's live reply route on
 * the domain its replies come back on (the mail domain, or the cold reply domain when it is set, D17).
 */
export function ownDomainIdentity(
  domain: { host: string; from_local: string; from_name: string },
  mailbox: { reply_token: string },
  replyDomain: string,
): EmailIdentity {
  return {
    fromName: domain.from_name,
    fromAddress: `${domain.from_local}@${domain.host}`.toLowerCase(),
    replyTo: replyRouteAddress(mailbox.reply_token, replyDomain),
  };
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
