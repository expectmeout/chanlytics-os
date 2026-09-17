/**
 * Email, as the dashboard holds it: the deployment's mail domain, the request
 * a reply leaves as, and the workspace's mailbox as its pages and its owner's
 * two doors see it.
 *
 * The dashboard never sends an email. It queues a reply, and an email's queued
 * row is born with the request it will leave as, frozen (channels email.ts says
 * why), so the dashboard has to know the one thing that request needs and a
 * mailbox row does not hold: the domain its addresses are on. EMAIL_DOMAIN here
 * is the same value the edge holds. Absent, email is off on this deployment: no
 * request can be frozen, and a reply by email is refused in words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEmailRequest, hostedAddress, hostedIdentity } from "@chanlytics/channels";
import { AppError, normalizeLocalPart, whyNotAFromName, whyNotALocalPart, type EmailSetupDto, type MailboxDto } from "@chanlytics/contracts";
import { mailboxOfTenant, type Database, type Json } from "@chanlytics/db";
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

/** A mailbox row as the pages are told about it: its address on this deployment's domain, and never its reply route. */
function mailboxDto(row: { id: string; local_part: string; from_name: string; last_received_at: string | null }, domain: string): MailboxDto {
  return { id: row.id, address: hostedAddress(row.local_part, domain), from_name: row.from_name, last_received_at: row.last_received_at };
}

/**
 * Email, as Setup and Connections are told it. One function for both readers
 * (a member on the session client, the back office on the service client): it
 * calls nothing that asks who is signed in.
 */
export async function emailSetupFor(supabase: SupabaseClient<Database>, tenantId: string): Promise<EmailSetupDto> {
  const domain = emailDomain();
  if (!domain) return { ready: false, domain: null, mailbox: null };
  const row = await mailboxOfTenant(supabase, tenantId);
  return { ready: true, domain, mailbox: row ? mailboxDto(row, domain) : null };
}

/** A door's refusal, as the envelope says it: the door's own sentence, under the code its SQLSTATE means. */
function doorRefusal(e: { code?: string; message: string }): AppError {
  return new AppError(e.code === "23505" ? "conflict" : e.code === "42501" ? "forbidden" : "validation", e.message);
}

/** An owner gives the workspace its address (00129). Judged here first, so the refusal says which kind of not-an-address it was. */
export async function createMailbox(ctx: RouteContext, tenantId: string, input: { localPart: string; fromName: string }): Promise<MailboxDto> {
  const domain = emailDomain();
  if (!domain) throw new AppError("conflict", "Email is not available here yet.");
  const problem = whyNotALocalPart(input.localPart) ?? whyNotAFromName(input.fromName);
  if (problem) throw new AppError("validation", problem);
  const { error } = await ctx.supabase.rpc("create_mailbox", { p_tenant_id: tenantId, p_local_part: normalizeLocalPart(input.localPart), p_from_name: input.fromName.trim() });
  if (error) throw doorRefusal(error);
  const row = await mailboxOfTenant(ctx.supabase, tenantId);
  if (!row) throw new Error("create_mailbox answered and the mailbox cannot be read back");
  return mailboxDto(row, domain);
}

/** An owner changes the name customers see. The mailbox must be this workspace's: another's is not found, whatever the door would say. */
export async function renameMailbox(ctx: RouteContext, tenantId: string, mailboxId: string, fromName: string): Promise<MailboxDto> {
  const domain = emailDomain();
  if (!domain) throw new AppError("conflict", "Email is not available here yet.");
  const problem = whyNotAFromName(fromName);
  if (problem) throw new AppError("validation", problem);
  const mine = await mailboxOfTenant(ctx.supabase, tenantId);
  if (!mine || mine.id !== mailboxId) throw new AppError("not_found", "That email address is not this workspace's.");
  const { error } = await ctx.supabase.rpc("rename_mailbox", { p_mailbox_id: mailboxId, p_from_name: fromName.trim() });
  if (error) throw doorRefusal(error);
  return mailboxDto({ ...mine, from_name: fromName.trim() }, domain);
}
