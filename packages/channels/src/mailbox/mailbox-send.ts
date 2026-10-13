/**
 * One frozen request sent from a connected mailbox (decision 0056): the wire the email door's `own` route calls.
 *
 * The request is the one approved and kept on its row; it leaves as MIME under a Message-ID minted from the row's id on
 * the mailbox's own host (mailboxMessageId), so a reply and a delivery report find its row by the id alone. A nudge, or
 * a person's answer, goes in the thread of the email it answers: Gmail is asked which thread holds the Message-ID its
 * In-Reply-To names. What the provider kept is read back (Gmail may keep its own Message-ID; Graph's is known from the
 * draft before it leaves) and handed to the door to stamp, since no receipt comes from a mailbox.
 *
 * Returns, never throws. A refusal that is the mailbox's own day used up, or its grant gone, says so (`cause`): the
 * edge rests the mailbox until tomorrow, or asks its owner to connect it again, and the send waits either way.
 */
import type { MailboxProvider } from "@chanlytics/contracts";
import { messageIdHeader } from "../email/header-values";
import type { EmailRequest } from "../email/request";
import type { SendResult } from "../whatsapp";
import { buildMime, mailboxMessageId } from "./mailbox-mime";
import { gmailDayUsed, gmailSend, gmailSentIds, gmailSignedOut, gmailThreadOf } from "./mailbox-gmail";
import { graphDayUsed, graphSend, graphSignedOut } from "./mailbox-graph";

type Deps = Parameters<typeof gmailSend>[4];

export interface MailboxSendInput {
  provider: MailboxProvider;
  /** An access token the edge holds now (mailbox-credentials.ts tokenFor). */
  token: string;
  mailbox: { id: string; host: string };
  request: EmailRequest;
  /** The caller's ceiling, when it has one (Delivery.sendBy). */
  deadlineMs?: number;
  now?: () => number;
}

/** A send from a mailbox, as the door hears it, with why a refusal was the mailbox's own and not the email's. */
export type MailboxSendResult = SendResult & { cause?: "day_used" | "signed_out" };

export async function sendFromMailbox(i: MailboxSendInput, deps?: Deps): Promise<MailboxSendResult> {
  const now = i.now ?? Date.now;
  const minted = mailboxMessageId(i.request.idempotency_key, i.mailbox.host);
  const mime = buildMime(i.request, { messageId: minted, at: new Date(now()) });
  const parent = messageIdHeader(i.request.headers["In-Reply-To"] ?? null);
  if (i.provider === "google") {
    // The thread of the email this answers, when it answers one: a thread Gmail cannot name now is a new one, and the
    // headers still thread it for the person who reads it.
    const thread = parent ? await gmailThreadOf(i.token, parent, deps).catch(() => null) : null;
    const sent = await gmailSend(i.token, mime, thread?.threadId ?? null, { deadlineMs: i.deadlineMs }, deps);
    if (!sent.ok)
      return {
        ok: false,
        wamid: null,
        status: sent.status,
        errorBody: sent.error ?? "gmail_refused",
        outcome: sent.outcome,
        ...(gmailDayUsed(sent.reply) ? { cause: "day_used" as const } : {}),
        ...(gmailSignedOut(sent.reply) ? { cause: "signed_out" as const } : {}),
      };
    // What Gmail kept as its Message-ID; the one minted when it could not be read back, which is the one it was sent
    // under unless Gmail replaced it.
    const kept = sent.id ? await gmailSentIds(i.token, sent.id, deps).catch(() => null) : null;
    return {
      ok: true,
      wamid: sent.id,
      status: sent.status,
      outcome: "ok",
      email: {
        messageId: messageIdHeader(kept?.messageId ?? null) ?? minted,
        threadId: sent.threadId,
        mailboxId: i.mailbox.id,
      },
    };
  }
  const sent = await graphSend(i.token, mime, { deadlineMs: i.deadlineMs }, deps);
  if (!sent.ok)
    return {
      ok: false,
      wamid: sent.id,
      status: sent.status,
      errorBody: sent.error ?? "graph_refused",
      outcome: sent.outcome,
      ...(graphDayUsed(sent.reply) ? { cause: "day_used" as const } : {}),
      ...(graphSignedOut(sent.reply) ? { cause: "signed_out" as const } : {}),
    };
  return {
    ok: true,
    wamid: sent.id,
    status: sent.status,
    outcome: "ok",
    email: { messageId: messageIdHeader(sent.messageId) ?? minted, threadId: sent.threadId, mailboxId: i.mailbox.id },
  };
}
