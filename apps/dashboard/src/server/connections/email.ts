/**
 * Email, as the dashboard holds it: the deployment's mail domain, the request
 * a reply leaves as, and the workspace's mailbox as its pages and its owner's
 * two doors see it.
 *
 * The dashboard never sends an email. It queues a reply, and an email's queued
 * row is born with the request it will leave as, frozen (channels email/request.ts says
 * why), so the dashboard has to know the one thing that request needs and a
 * mailbox row does not hold: the domain its addresses are on. EMAIL_DOMAIN here
 * is the same value the edge holds. Absent, email is off on this deployment: no
 * request can be frozen, and a reply by email is refused in words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addressOf,
  buildEmailRequest,
  hostedAddress,
  hostedIdentity,
  ownDomainIdentity,
  type EmailIdentity,
  type EmailRequest,
} from "@chanlytics/channels";
import {
  AppError,
  emailDomainOf,
  normalizeLocalPart,
  whyNotAFromName,
  whyNotALocalPart,
  type EmailSetupDto,
  type MailboxDto,
  type ReplyFrom,
  type SendingDomainDto,
} from "@chanlytics/contracts";
import { answeredReachOutEmail, mailboxOfTenant, type Database, type Json, type MailboxRow } from "@chanlytics/db";
import type { EmailReplyPorts } from "@chanlytics/core";
import { dbRefusal, type RouteContext } from "../with-route";
import { domainsReadiness, sendingDomainsFor } from "./sending-domains";
import { env } from "../env";

/** The deployment's mail domain, lower-cased; null when email is off here (contracts emailDomainOf, as the edge reads it). */
export function emailDomain(): string | null {
  return emailDomainOf(env.EMAIL_DOMAIN);
}

/** The host of an address, lower-cased; null when it names none. */
const hostOf = (address: string | null): string | null =>
  addressOf(address ?? "")
    ?.address.split("@")[1]
    ?.toLowerCase() ?? null;

/**
 * Where a person's answer on this thread goes out from (C15, N5): the domain the reach-out it answers left from, when
 * that domain is one of the workspace's and verified now, with the reply domain that email was answered on; else the
 * mailbox, and why. The freeze and the readings' read both ask this, so the composer never names an address the
 * dashboard will not freeze. `references` are the reply's References; the latest reach-out email on the thread
 * answers when none of them names one (db answeredReachOutEmail).
 */
export async function replyIdentityOf(
  supabase: SupabaseClient<Database>,
  p: {
    tenantId: string;
    conversationId: string;
    references: string[];
    /** The workspace's domains, when the caller already read them for many threads. */
    domains?: SendingDomainDto[];
  },
): Promise<
  | { from: "own"; address: string; domain: SendingDomainDto; replyDomain: string }
  | Extract<ReplyFrom, { from: "mailbox" }>
> {
  const { tenantId, domains } = p;
  const answered = await answeredReachOutEmail(supabase, p);
  const own = addressOf(answered?.from ?? "")?.address.toLowerCase() ?? null;
  const host = hostOf(own);
  if (!answered || !own || !host) return { from: "mailbox", because: null };
  const domain = (domains ?? (await sendingDomainsFor(supabase, tenantId))).find((d) => d.host.toLowerCase() === host);
  if (!domain) return { from: "mailbox", because: "domain_removed", own };
  if (domain.state !== "verified") return { from: "mailbox", because: "domain_held", own: domain.address };
  const replyDomain = hostOf(answered.replyTo) ?? emailDomain();
  if (!replyDomain) return { from: "mailbox", because: null };
  return { from: "own", address: domain.address, domain, replyDomain };
}

/** The workspace's mailbox address on this deployment, as the composer names it; null with no mailbox or no email. */
export async function mailboxAddressOf(ctx: RouteContext, tenantId: string): Promise<string | null> {
  const domain = emailDomain();
  const mailbox = domain ? await mailboxOfTenant(ctx.supabase, tenantId) : null;
  return mailbox && domain ? hostedAddress(mailbox.local_part, domain) : null;
}

/** What the composer is told of where an answer goes out from: the address, never the domain's row. */
export function replyFromOf(r: Awaited<ReturnType<typeof replyIdentityOf>>): ReplyFrom {
  return r.from === "own" ? { from: "own", address: r.address } : r;
}

/** A request rides in the row's Json as it is (channels email.ts): one shape, written as JSON. */
const requestJson = (r: EmailRequest): Json => r as unknown as Json;

/**
 * A person's own reply, as the request it leaves as. No signature is added:
 * what a person typed is what is sent, the way it is on every other wire.
 * An answer to a reach-out whose own domain is verified now is frozen twice
 * (C15): the mailbox's request, which every edge sends, and its twin on that
 * domain, the same words, parent and id, answered at the mailbox's reply route
 * on the reply domain the reach-out was answered on. The edge sends the twin
 * while that domain's route holds it, and the mailbox's otherwise (N5).
 */
export async function freezeReply(
  ctx: RouteContext,
  i: Parameters<EmailReplyPorts["freeze"]>[0],
): Promise<{ request: Json; subject: string; own: Json | null } | null> {
  const domain = emailDomain();
  if (!domain) return null;
  const mailbox = await mailboxOfTenant(ctx.supabase, i.tenantId);
  if (!mailbox) return null;
  const frozen = (identity: EmailIdentity) =>
    buildEmailRequest({
      identity,
      to: i.to,
      parent: {
        messageId: i.parent.messageId,
        rfcMessageId: i.parent.rfcMessageId,
        references: i.parent.references,
        subject: i.parent.subject,
      },
      body: i.body,
      signature: null,
      actor: "human",
      messageId: i.messageId,
      tenantId: i.tenantId,
    });
  const request = frozen(hostedIdentity(mailbox, domain));
  const who = await replyIdentityOf(ctx.supabase, {
    tenantId: i.tenantId,
    conversationId: i.conversationId,
    references: [...i.parent.references, ...(i.parent.rfcMessageId ? [i.parent.rfcMessageId] : [])],
  });
  const own = who.from === "own" ? frozen(ownDomainIdentity(who.domain, mailbox, who.replyDomain)) : null;
  return { request: requestJson(request), subject: request.subject, own: own ? requestJson(own) : null };
}

/**
 * A person's first email on a thread, as the request it leaves as: no email of theirs to thread under, the subject its
 * own, from the workspace's mailbox. No signature is added, as on a reply. Null with no mail domain or no mailbox.
 */
export async function freezeFirst(
  ctx: RouteContext,
  i: Parameters<EmailReplyPorts["first"]>[0],
): Promise<{ request: Json; subject: string } | null> {
  const domain = emailDomain();
  if (!domain) return null;
  const mailbox = await mailboxOfTenant(ctx.supabase, i.tenantId);
  if (!mailbox) return null;
  const request = buildEmailRequest({
    identity: hostedIdentity(mailbox, domain),
    to: i.to,
    parent: null,
    subject: i.subject,
    body: i.body,
    signature: null,
    actor: "human",
    messageId: i.messageId,
    tenantId: i.tenantId,
  });
  return { request: requestJson(request), subject: request.subject };
}

/** A mailbox row as the pages are told about it: its address on this deployment's domain, and never its reply route. */
function mailboxDto(
  row: {
    id: string;
    local_part: string;
    from_name: string;
    last_received_at: string | null;
    last_error?: string | null;
  },
  domain: string,
): MailboxDto {
  return {
    id: row.id,
    address: hostedAddress(row.local_part, domain),
    from_name: row.from_name,
    last_received_at: row.last_received_at,
    last_error: row.last_error ?? null,
  };
}

/**
 * The workspace's email line and nothing of how it sends: whether this deployment has email, and the mailbox the owner
 * made. What Today counts as a wire (contracts emailWires), which is all its read asks of email. It took the whole of
 * emailSetupFor, so every read of Today from a workspace with a mailbox also read its sending domains and asked the
 * edge whether own domains are switched on, an answer kept for five minutes by each instance and waited on for up to
 * four seconds by the first read after that (9 Oct 2026). One read, of one row: `mailbox`, where the caller reads the
 * row for more than this (workspace/setup.ts), is how to ask for it, so it is asked once.
 */
export async function emailLineFor(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  mailbox: () => Promise<MailboxRow | null> = () => mailboxOfTenant(supabase, tenantId),
): Promise<EmailSetupDto> {
  const domain = emailDomain();
  if (!domain) return { ready: false, domain: null, mailbox: null, sending: null };
  const row = await mailbox();
  return { ready: true, domain, mailbox: row ? mailboxDto(row, domain) : null, sending: null };
}

/**
 * Email, as Setup and Connections are told it. One function for both readers
 * (a member on the session client, the back office on the service client): it
 * calls nothing that asks who is signed in.
 */
export async function emailSetupFor(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  mailbox?: () => Promise<MailboxRow | null>,
): Promise<EmailSetupDto> {
  const line = await emailLineFor(supabase, tenantId, mailbox);
  if (!line.mailbox) return line;
  // The block draws only under a mailbox, so nothing else waits on the edge. A domains read that fails draws no
  // block rather than failing Setup (and Today's email line with it).
  const [domains, ready] = await Promise.all([
    sendingDomainsFor(supabase, tenantId).catch(() => null),
    domainsReadiness().catch(() => false),
  ]);
  return { ...line, sending: domains ? { ready, domains } : null };
}

/** An owner gives the workspace its address (00129). Judged here first, so the refusal says which kind of not-an-address it was. */
export async function createMailbox(
  ctx: RouteContext,
  tenantId: string,
  input: { localPart: string; fromName: string },
): Promise<MailboxDto> {
  const domain = emailDomain();
  if (!domain) throw new AppError("conflict", "Email is not available here yet.");
  const problem = whyNotALocalPart(input.localPart) ?? whyNotAFromName(input.fromName);
  if (problem) throw new AppError("validation", problem);
  const { error } = await ctx.supabase.rpc("create_mailbox", {
    p_tenant_id: tenantId,
    p_local_part: normalizeLocalPart(input.localPart),
    p_from_name: input.fromName.trim(),
  });
  if (error) throw dbRefusal(error);
  const row = await mailboxOfTenant(ctx.supabase, tenantId);
  if (!row) throw new Error("create_mailbox answered and the mailbox cannot be read back");
  return mailboxDto(row, domain);
}

/** An owner changes the name customers see. The mailbox must be this workspace's: another's is not found, whatever the door would say. */
export async function renameMailbox(
  ctx: RouteContext,
  tenantId: string,
  mailboxId: string,
  fromName: string,
): Promise<MailboxDto> {
  const domain = emailDomain();
  if (!domain) throw new AppError("conflict", "Email is not available here yet.");
  const problem = whyNotAFromName(fromName);
  if (problem) throw new AppError("validation", problem);
  const mine = await mailboxOfTenant(ctx.supabase, tenantId);
  if (!mine || mine.id !== mailboxId) throw new AppError("not_found", "That email address is not this workspace's.");
  const { error } = await ctx.supabase.rpc("rename_mailbox", { p_mailbox_id: mailboxId, p_from_name: fromName.trim() });
  if (error) throw dbRefusal(error);
  return mailboxDto({ ...mine, from_name: fromName.trim() }, domain);
}
