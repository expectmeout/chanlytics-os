/**
 * Two answers the provider gives a call, read: what a refusal means for the next send (resendLimitOf), and what it
 * thinks of the mail domain (mailDomainsFrom). The calls themselves are ./email-resend.ts.
 */

/**
 * What a refusal from the provider means for the next send, read from the
 * names Resend documents for its 429 and 409 answers:
 *   rate       too many requests this second; the next second takes it
 *   in_flight  a request under the same key is still being worked; its result is coming
 *   daily      the day's sending is used up, for every workspace on the key
 *   monthly    the month's is
 * Null for anything else, a success included. A 429 that names nothing is read
 * as the one that passes: the provider did not take the email, and waiting a
 * second costs nothing.
 */
export type ResendLimit = "rate" | "in_flight" | "daily" | "monthly";

export function resendLimitOf(r: { ok?: boolean; status: number; errorBody?: string | null }): ResendLimit | null {
  if (r.ok || (r.status !== 429 && r.status !== 409)) return null;
  let name: unknown;
  try {
    name = (JSON.parse(r.errorBody ?? "") as { name?: unknown } | null)?.name ?? null;
  } catch {
    name = null;
  }
  if (name === "daily_quota_exceeded") return "daily";
  if (name === "monthly_quota_exceeded") return "monthly";
  if (name === "concurrent_idempotent_requests") return "in_flight";
  return r.status === 429 ? "rate" : null;
}

/* ----------------------------------------------------------- the mail domain
 *
 * Every workspace's address is on ONE domain — the deployment's, not a
 * workspace's — so this is the one email fact with no tenant in it. When its
 * DNS stops being seen the provider keeps accepting mail and drops it, and the
 * senders get no bounce; there is nothing in our own rows that changes. So the
 * only way to know is to ask the provider what it thinks of the domain, and
 * this is the reading of that answer.
 */

/** What a domain is configured FOR. Not whether it works: a verified domain can be configured not to receive at all. */
export type MailCapability = "enabled" | "disabled" | "unknown";

/**
 * One domain as the provider describes it. `status` is kept as the word that
 * arrived rather than narrowed to a union: a status this code has never heard
 * of must read as "not verified", never as healthy, and a union would have to
 * guess which. The judgement is the caller's (edge mail-domain.ts).
 */
export interface MailDomainFacts {
  name: string;
  status: string;
  sending: MailCapability;
  receiving: MailCapability;
}

const capabilityOf = (v: unknown): MailCapability => (v === "enabled" || v === "disabled" ? v : "unknown");

/** The domains in a list answer; null when the answer is not a list of domains at all, which is not the same as "no domains". */
export function mailDomainsFrom(body: unknown): MailDomainFacts[] | null {
  const rows = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return null;
  const out: MailDomainFacts[] = [];
  for (const r of rows) {
    const d = (r ?? {}) as Record<string, unknown>;
    const caps = (d.capabilities ?? {}) as Record<string, unknown>;
    if (typeof d.name !== "string" || !d.name) continue;
    out.push({
      name: d.name.trim().toLowerCase(),
      status: typeof d.status === "string" && d.status.trim() ? d.status.trim() : "unknown",
      sending: capabilityOf(caps.sending),
      receiving: capabilityOf(caps.receiving),
    });
  }
  return out;
}
