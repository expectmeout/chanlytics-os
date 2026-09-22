/**
 * A Resend webhook arrives: everything the door decides, apart from the
 * transport (sms-ingress.ts says why the judgement is a function and not the
 * endpoint, and this is the fifth of its kind).
 *
 * The event is proven first: Svix's signature over the raw body, with the
 * endpoint's secret. That proves RESEND sent the event. It says nothing about
 * who sent the email the event is about, and nothing here acts as though it
 * did: a received email becomes a job that fetches it, and what the email may
 * change is decided there (core email-ingest.ts), never from the webhook. A
 * receipt is the other kind of event: the provider's own word on an email WE
 * sent, which is evidence, and is applied (email-receipts.ts).
 *
 * A delivery is routed by the address the platform assigned, exactly: a
 * workspace's published address, or a reply route's token. Never a display
 * name, a header the sender wrote, or a guess. An email addressed to two
 * workspaces is two intakes. An address on the mail domain that no workspace
 * owns is mail for nobody: acknowledged, so the provider does not retry it
 * for a day, and counted.
 *
 * IT RETURNS WHAT TO DO RATHER THAN DOING IT. The door schedules the jobs and
 * writes the count; this reads, and is proved against a database in memory.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./packages/db.js";
import { mailboxFor } from "./packages/db.js";
import {
  emailReceiptFrom,
  emailReceivedEventFrom,
  platformRecipient,
  verifyResendWebhook,
  type EmailReceipt,
  type SvixHeaders,
} from "./packages/channels.js";

type Db = SupabaseClient<Database>;

export interface ResendIngressInput {
  rawBody: string;
  headers: SvixHeaders;
  secret: string | undefined;
  /** The deployment's mail domain (email.ts emailDomain). */
  domain: string;
  db: Db;
  nowMs: number;
}

export type ResendVerdict =
  | { kind: "refuse"; status: 401 | 400; log: string }
  /** An event this door has no work for (a domain event, a contact event), or a received email that names no address of ours. */
  | { kind: "ignore"; log: string; unroutable: number }
  /** What became of an email we sent. */
  | { kind: "receipt"; receipt: EmailReceipt }
  | { kind: "intake"; receivedId: string; jobs: Array<{ tenantId: string; mailboxId: string }>; unroutable: number };

export async function planResendEvent(i: ResendIngressInput): Promise<ResendVerdict> {
  if (!(await verifyResendWebhook(i.secret, i.headers, i.rawBody, i.nowMs)))
    return { kind: "refuse", status: 401, log: "resend_webhook_bad_signature" };
  let payload: unknown;
  try {
    payload = JSON.parse(i.rawBody);
  } catch {
    return { kind: "refuse", status: 400, log: "resend_webhook_not_json" };
  }

  const receipt = emailReceiptFrom(payload);
  if (receipt) return { kind: "receipt", receipt };
  const event = emailReceivedEventFrom(payload);
  if (!event) return { kind: "ignore", log: "resend_webhook_no_work", unroutable: 0 };

  // Only addresses on the platform's own mail domain route anywhere; the rest
  // are the other people an email was also sent to.
  const ours = event.recipients
    .map((r) => platformRecipient(r, i.domain))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const jobs = new Map<string, { tenantId: string; mailboxId: string }>();
  let unroutable = 0;
  for (const to of ours) {
    const mailbox = await mailboxFor(i.db, to);
    if (mailbox) jobs.set(mailbox.id, { tenantId: mailbox.tenant_id, mailboxId: mailbox.id });
    else unroutable += 1;
  }
  // Named no address of ours at all, or only ones no workspace owns: either way it is one email for nobody.
  if (jobs.size === 0) return { kind: "ignore", log: "resend_webhook_for_nobody", unroutable: unroutable || 1 };
  return { kind: "intake", receivedId: event.receivedId, jobs: [...jobs.values()], unroutable };
}
