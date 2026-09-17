/**
 * The email channel's switch, its wire and its intake, as this deployment holds them.
 *
 * Email is on for a deployment when it names a mail domain (EMAIL_DOMAIN, the
 * subdomain that sends and receives: mail.chanlytics.com). Absent, the channel
 * does not exist here: no wire is bound, the webhook door answers 404, nothing
 * is drawn, and a delivery that names the channel fails as "no sender for
 * channel", the way any channel a runtime does not have fails (deliver.ts
 * Wire). Present with no provider key, the channel exists and cannot send:
 * null, a refusal at the door, never a guess.
 *
 * A workspace's own switch is its mailbox row (00126): without one it has no
 * address to be written to, so nothing arrives and nothing is answered.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailboxOfTenant, type Database } from "./workspace/db.js";
import { emailSender, type Sender } from "./workspace/core.js";
import { fetchReceivedEmail, sendsAs } from "./workspace/channels.js";
import type { JobContext } from "./workspace/jobs.js";
import { erasedBeforeEmail } from "./erased.js";
import { notify, type NotifyMessage } from "./notify.js";
import { loadTenantNotifications } from "./tenant-runtime.js";

type Db = SupabaseClient<Database>;

/** The deployment's mail domain, lower-cased; null when email is off here. */
export function emailDomain(): string | null {
  const d = (process.env.EMAIL_DOMAIN || "").trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/**
 * One workspace's email wire. undefined: no email on this runtime. null: email
 * is on and this workspace cannot send, because the deployment holds no
 * provider key or the workspace has no mailbox. Otherwise a wire that sends
 * only as that mailbox: the provider key is shared by every workspace, so what
 * keeps one business's email from leaving as another's is this binding, the
 * way the WhatsApp wire is bound to the tenant's own credentials.
 */
export async function emailWireFor(db: Db, tenantId: string): Promise<Sender | null | undefined> {
  const domain = emailDomain();
  if (!domain) return undefined;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const mailbox = await mailboxOfTenant(db, tenantId);
  return emailSender({ apiKey }, mailbox ? sendsAs(mailbox, domain) : null);
}

type EmailWaiting = Parameters<NonNullable<JobContext["email"]>["tell"]>[1];

/**
 * "An email is waiting", as words: pure, so what a workspace reads is tested
 * rather than read back off this file (alerts.ts handoffMessage is the same
 * split). The subject line and the first words are the customer's, so they go
 * only to an address that is this workspace's; what the platform may be told
 * about a workspace it cannot address names nobody.
 */
export function emailWaitingMessage(n: EmailWaiting): NotifyMessage {
  const who = n.fromName?.trim() || n.from;
  const kind = n.claim === "automated" ? "An automated email arrived" : `${who} wrote by email`;
  return {
    kind: "handoff",
    route: `inbox/th-${n.conversationId}`,
    about: { type: "conversation", id: n.conversationId },
    subject: n.subject?.trim() ? `${kind}: ${n.subject.trim()}` : kind,
    body:
      `${n.preview?.trim() ? `They wrote: “${n.preview.trim()}”\n\n` : ""}` +
      `Email · ${n.from}\n` +
      "The receptionist does not answer email yet, so nothing was sent. Reply from the Inbox.",
    redactedBody: "An email arrived for a workspace and nobody could be told.",
  };
}

/** Email's intake as the job runner is handed it; undefined when email is off here or there is no provider key to fetch with. */
export function emailIntake(db: Db): JobContext["email"] | undefined {
  const domain = emailDomain();
  const apiKey = process.env.RESEND_API_KEY;
  if (!domain || !apiKey) return undefined;
  return {
    domain,
    fetch: (receivedId) => fetchReceivedEmail({ apiKey }, receivedId),
    erasedBefore: (tenantId, address, receivedAtIso) => erasedBeforeEmail(db, tenantId, address, receivedAtIso),
    // Best-effort by contract: the thread is already flagged, which is the
    // durable half. A notification that could not be sent is logged, and the
    // deadman's sweep still names a thread nobody has opened.
    tell: async (tenantId, note) => {
      try {
        const addressing = await loadTenantNotifications(db, tenantId);
        await notify({ tenantId, ...addressing }, emailWaitingMessage(note));
      } catch (e) {
        console.error("email_tell_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
      }
    },
  };
}
