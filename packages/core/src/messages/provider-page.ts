import type { SendPurpose } from "@chanlytics/contracts";
import type { Channel, Delivered } from "../deliver";

/**
 * A provider's limit or a refused key is the platform's to hear, never one thread's or one run's: the page both ways of
 * sending give when the wire answers it, a reply (send.ts) and a broadcast's batch (broadcast.ts), so the one refusal is
 * paged under the same key and in the same words wherever it was met. A broadcast that stopped for a 401 used to tell its
 * owner to check the mailbox and tell nobody else, though the key is the deployment's and every workspace on it fails at
 * once.
 */

/** What the pager is asked for (ports `page`): a key it keeps quiet per window, a subject and a body. */
interface Pager {
  page?(key: string, subject: string, body: string): Promise<unknown>;
}

/** A failed send as the page reads it: the channel and purpose it went by, and what the door answered. */
interface ProviderFailure {
  channel: Channel;
  purpose: SendPurpose;
  out: Extract<Delivered, { outcome: "failed" }>;
}

/**
 * Page the platform when the failure is the provider's limit or credentials; nothing for any other. `about` says whose
 * send it was ("Tenant t, message m", "Tenant t, broadcast b"), and is the first words of the body.
 */
export async function pageTheProvider(pager: Pager, f: ProviderFailure, about: string): Promise<void> {
  const { channel, purpose, out } = f;
  // A limit at the mail provider (named by the door, deliver.ts) is not this thread's fault either. A used-up day or
  // month stops every workspace's email on the key, so it is recorded for the platform (provider_quota:email, shown on
  // /api/diag); the page's own mail rides the same key and cannot leave until the quota resets. "Slow down" is one
  // second's problem, and a try still in flight may yet arrive: neither pages anyone.
  const limit = out.limit ?? null;
  // Cold email leaves through an account of its own (wire-senders.ts emailSender), so its limits and its key are paged
  // under their own name, and say what they do not stop.
  const outreach = channel === "email" && purpose === "outreach";
  if (limit === "daily" || limit === "monthly") {
    await pager.page?.(
      outreach ? "provider_quota:email_outreach" : "provider_quota:email",
      `${outreach ? "cold email" : "email"}: the ${limit} sending limit is used up`,
      outreach
        ? `${about}. Cold email is refused until it resets. Replies and reminders are not affected.`
        : `${about}. Every workspace's email is refused until it resets or the plan grows.`,
    );
  }
  // A 401 or 403 from the provider is the platform's problem, not this
  // thread's: the credentials are wrong for every send on this wire.
  // A 403 that names a domain is the provider refusing to send from one that stopped verifying at its end: the domain's
  // fact, which the domains sweep holds, never our credentials.
  const domainRefused = outreach && out.status === 403 && /domain/i.test(out.errorBody ?? "");
  if (out.reason === "provider" && (out.status === 401 || (out.status === 403 && !domainRefused))) {
    await pager.page?.(
      `provider_auth:${outreach ? "email_outreach" : channel}`,
      `${channel} rejected a send with ${out.status}`,
      `${about}. Credentials, not content.`,
    );
  }
}
