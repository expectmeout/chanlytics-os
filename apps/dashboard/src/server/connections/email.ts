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
  connectedIdentity,
  hostedAddress,
  hostedIdentity,
  mailboxSignatureOf,
  type EmailIdentity,
  type EmailRequest,
} from "@chanlytics/channels";
import {
  AppError,
  emailDomainOf,
  mailboxSendsNow,
  normalizeLocalPart,
  whyNotAFromName,
  whyNotALocalPart,
  type EmailSetupDto,
  type MailboxConnectionDto,
  type MailboxDto,
  type ReplyFrom,
} from "@chanlytics/contracts";
import {
  answeredReachOutEmail,
  lastInboundEmail,
  mailboxConnectionOf,
  mailboxOfTenant,
  type Database,
  type Json,
  type MailboxRow,
} from "@chanlytics/db";
import type { EmailReplyPorts } from "@chanlytics/core";
import { dbRefusal, type RouteContext } from "../with-route";
import {
  mailboxConnectionsFor,
  mailboxConnectionsWithDaysFor,
  mailboxesLeftTodayFor,
  mailboxesReadiness,
} from "./mailbox-connections";
import { env } from "../env";

/** The deployment's mail domain, lower-cased; null when email is off here (contracts emailDomainOf, as the edge reads it). */
export function emailDomain(): string | null {
  return emailDomainOf(env.EMAIL_DOMAIN);
}

/**
 * Where a person's answer on this thread goes out from (C15, N5; decision 0056): the mailbox the business connected
 * that the reach-out it answers left from, when it is still the workspace's and sends now; else the connected mailbox
 * the email it answers was written to (decision 0073, R13: the business's email is its mailbox), when that one sends
 * now; else the hosted mailbox, and why. The freeze and the readings' read both ask this, so the composer never names an
 * address the dashboard will not freeze. `references` are the reply's References; the latest reach-out email on the
 * thread answers when none of them names one (db answeredReachOutEmail).
 */
export async function replyIdentityOf(
  supabase: SupabaseClient<Database>,
  p: {
    tenantId: string;
    conversationId: string;
    references: string[];
    /** The workspace's connected mailboxes, when the caller already read them for many threads. */
    mailboxes?: MailboxConnectionDto[];
    /** Who the email being answered was written to (its To and Cc), where the row kept them. */
    addressedTo?: readonly string[];
  },
): Promise<{ from: "own"; address: string; mailbox: MailboxConnectionDto } | Extract<ReplyFrom, { from: "mailbox" }>> {
  const answered = await answeredReachOutEmail(supabase, p);
  const fromReachOut = addressOf(answered?.from ?? "")?.address.toLowerCase() ?? null;
  const boxes = () => p.mailboxes ?? mailboxConnectionsFor(supabase, p.tenantId);
  if (!answered || !fromReachOut) {
    // Not a reach-out's answer: an email that came to a connected mailbox is answered from it, while it sends (R13).
    const to = new Set((p.addressedTo ?? []).map((a) => a.toLowerCase()));
    if (!to.size) return { from: "mailbox", because: null };
    const box = (await boxes()).find((m) => to.has(m.address.toLowerCase()));
    if (!box) return { from: "mailbox", because: null };
    if (!mailboxSendsNow(box, Date.now())) return { from: "mailbox", because: "own_not_sending", own: box.address };
    return { from: "own", address: box.address, mailbox: box };
  }
  const own = fromReachOut;
  const mailbox = (await boxes()).find((m) => m.address.toLowerCase() === own);
  if (!mailbox) return { from: "mailbox", because: "own_removed", own };
  if (!mailboxSendsNow(mailbox, Date.now())) return { from: "mailbox", because: "own_not_sending", own };
  return { from: "own", address: mailbox.address, mailbox };
}

/** The workspace's mailbox address on this deployment, as the composer names it; null with no mailbox or no email. */
export async function mailboxAddressOf(ctx: RouteContext, tenantId: string): Promise<string | null> {
  const domain = emailDomain();
  const mailbox = domain ? await mailboxOfTenant(ctx.supabase, tenantId) : null;
  return mailbox && domain ? hostedAddress(mailbox.local_part, domain) : null;
}

/** Where an answer on each thread goes out from, as the freeze will decide it: once per thread, the mailboxes read once. */
export async function replyIdentitiesOf(
  ctx: RouteContext,
  tenantId: string,
  conversations: readonly string[],
): Promise<Map<string, Awaited<ReturnType<typeof replyIdentityOf>>>> {
  if (conversations.length === 0) return new Map();
  const mailboxes = await mailboxConnectionsFor(ctx.supabase, tenantId);
  const each = await Promise.all(
    conversations.map(async (id) => {
      const parent = await lastInboundEmail(ctx.supabase, tenantId, id);
      const references = parent ? [...parent.references, ...(parent.rfcMessageId ? [parent.rfcMessageId] : [])] : [];
      const who = await replyIdentityOf(ctx.supabase, { tenantId, conversationId: id, references, mailboxes });
      return [id, who] as const;
    }),
  );
  return new Map(each);
}

/** The words an answer is signed with (00487): its connected mailbox's, where it leaves from one; else none. */
export function signedWordsOf(who: Awaited<ReturnType<typeof replyIdentityOf>>): string | null {
  return who.from === "own" ? who.mailbox.signs.words : null;
}

/** What the composer is told of where an answer goes out from: the address, never the mailbox's row. */
export function replyFromOf(r: Awaited<ReturnType<typeof replyIdentityOf>>): ReplyFrom {
  return r.from === "own" ? { from: "own", address: r.address } : r;
}

/** A request rides in the row's Json as it is (channels email.ts): one shape, written as JSON. */
const requestJson = (r: EmailRequest): Json => r as unknown as Json;

/**
 * A person's own reply, as the request it leaves as. A reply from a mailbox the
 * business connected is signed as that mailbox signs (00487, channels
 * mailboxSignatureOf): the signature its owner keeps in Gmail, their own words
 * or their name, as Gmail signs a reply written there; it left ending on "Talk
 * soon," before. A reply from the hosted mailbox alone carries what was typed.
 * An answer whose connected mailbox sends now is frozen twice (C15, decision
 * 0056): the hosted mailbox's request, which every edge sends, and its twin
 * from the connected mailbox, the same words, signature, parent and id. The
 * edge sends the twin while that mailbox's route holds it, and the hosted
 * mailbox's otherwise (N5). A workspace with no hosted mailbox answers from the
 * connected one alone. Null when neither can. `signature` is the words it went
 * with, which the thread says under the reply.
 */
export async function freezeReply(
  ctx: RouteContext,
  i: Parameters<EmailReplyPorts["freeze"]>[0],
): Promise<{ request: Json; subject: string; own: Json | null; signature: string | null } | null> {
  const domain = emailDomain();
  const mailbox = domain ? await mailboxOfTenant(ctx.supabase, i.tenantId) : null;
  const who = await replyIdentityOf(ctx.supabase, {
    tenantId: i.tenantId,
    conversationId: i.conversationId,
    references: [...i.parent.references, ...(i.parent.rfcMessageId ? [i.parent.rfcMessageId] : [])],
    addressedTo: i.parent.to ?? [],
  });
  // The connected mailbox's row: what it signs with, Gmail's markup included, is on the row, not the page's copy of it.
  const box = who.from === "own" ? await mailboxConnectionOf(ctx.supabase, i.tenantId, who.mailbox.id) : null;
  const signed = box ? mailboxSignatureOf(box) : null;
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
      signature: signed?.text ?? null,
      signatureHtml: signed?.html ?? null,
      actor: "human",
      messageId: i.messageId,
      tenantId: i.tenantId,
    });
  const own = who.from === "own" ? frozen(connectedIdentity(who.mailbox)) : null;
  const request = mailbox && domain ? frozen(hostedIdentity(mailbox, domain)) : own;
  if (!request) return null;
  return {
    request: requestJson(request),
    subject: request.subject,
    own: own ? requestJson(own) : null,
    signature: signed?.text ?? null,
  };
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
 * emailSetupFor, so every read of Today from a workspace with a mailbox also read what it sends reach-outs from and
 * asked the edge what it offers, an answer kept for five minutes by each instance and waited on for up to four seconds
 * by the first read after that (9 Oct 2026). One read, of one row: `mailbox`, where the caller reads the row for more
 * than this (workspace/setup.ts), is how to ask for it, so it is asked once.
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
  // The mailboxes a reach-out writes from (decision 0056) are the business's own, through Google or Microsoft, so they
  // are read whatever the hosted mailbox. A read that fails draws no block rather than failing Setup.
  // What the mailboxes left is read only where there is a mailbox to have left it.
  const [line, read, ready] = await Promise.all([
    emailLineFor(supabase, tenantId, mailbox),
    mailboxConnectionsWithDaysFor(supabase, tenantId)
      .then(async (ms) => ({ ms, left: ms.length ? await mailboxesLeftTodayFor(supabase, tenantId) : null }))
      .catch(() => null),
    mailboxesReadiness().catch(() => ({ providers: [], audience: null })),
  ]);
  const mailboxes = read?.ms ?? null;
  const leftToday = read?.left ?? null;
  return {
    ...line,
    sending: mailboxes
      ? { providers: ready.providers, mailboxes, google_audience: ready.audience, left_today: leftToday }
      : null,
  };
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
