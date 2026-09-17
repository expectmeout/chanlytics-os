/**
 * Email, as the dashboard holds it: the deployment's mail domain, and the
 * request a reply leaves as.
 *
 * The dashboard never sends an email. It queues a reply, and an email's queued
 * row is born with the request it will leave as, frozen (channels email.ts says
 * why), so the dashboard has to know the one thing that request needs and a
 * mailbox row does not hold: the domain its addresses are on. EMAIL_DOMAIN here
 * is the same value the edge holds. Absent, email is off on this deployment: no
 * request can be frozen, and a reply by email is refused in words.
 */
import { buildEmailRequest, hostedIdentity } from "@chanlytics/channels";
import { mailboxOfTenant, type Json } from "@chanlytics/db";
import type { EmailReplyPorts } from "@chanlytics/core";
import type { RouteContext } from "./with-route";

/** The deployment's mail domain, lower-cased; null when email is off here. The edge's lib/email.ts reads it the same way. */
export function emailDomain(): string | null {
  const d = (process.env.EMAIL_DOMAIN || "").trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/**
 * A person's own reply, as the request it leaves as. No signature is added:
 * what a person typed is what is sent, the way it is on every other wire.
 */
export async function freezeReply(ctx: RouteContext, i: Parameters<EmailReplyPorts["freeze"]>[0]): Promise<{ request: Json; subject: string } | null> {
  const domain = emailDomain();
  if (!domain) return null;
  const mailbox = await mailboxOfTenant(ctx.supabase, i.tenantId);
  if (!mailbox) return null;
  const request = buildEmailRequest({
    identity: hostedIdentity(mailbox, domain),
    to: i.to,
    parent: { messageId: i.parent.messageId, rfcMessageId: i.parent.rfcMessageId, references: i.parent.references, subject: i.parent.subject },
    body: i.body,
    signature: null,
    actor: "human",
    messageId: i.messageId,
    tenantId: i.tenantId,
  });
  return { request: request as unknown as Json, subject: request.subject };
}
