/**
 * What DNS says of a connected mailbox's domain, judged (decision 0056): SPF names the provider's servers, a DKIM key is
 * published under the provider's selector, DMARC has a record, and the domain receives mail. Pure over the answers the
 * edge reads (lib/email/mailbox/mailbox-dns.ts); "could not read" is the edge's to keep apart, never "missing".
 */
import type { MailboxProvider } from "@chanlytics/contracts";

/** TXT answers as a resolver gives them: each record's chunks, which are joined before a test (a record is split at 255). */
export type TxtAnswer = readonly (readonly string[])[];

const joined = (txt: TxtAnswer): string[] => txt.map((chunks) => chunks.join("").trim());

/** Whether a set of TXT answers holds a DMARC record: one beginning `v=DMARC1` (RFC 7489 §6.4). */
export function dmarcOf(txt: TxtAnswer): "found" | "missing" {
  return joined(txt).some((r) => /^v=DMARC1\s*(;|$)/i.test(r)) ? "found" : "missing";
}

/** The SPF include that names each provider's sending servers. */
const SPF_INCLUDES: Record<MailboxProvider, readonly string[]> = {
  google: ["_spf.google.com"],
  microsoft: ["spf.protection.outlook.com"],
};

/** Whether the domain's SPF record names the provider's servers: a `v=spf1` record with its include. */
export function spfOf(txt: TxtAnswer, provider: MailboxProvider): "found" | "missing" {
  const spf = joined(txt).filter((r) => /^v=spf1(\s|$)/i.test(r));
  return spf.some((r) =>
    SPF_INCLUDES[provider].some((inc) =>
      new RegExp(`(^|\\s)\\+?include:${inc.replace(/\./g, "\\.")}(\\s|$)`, "i").test(r),
    ),
  )
    ? "found"
    : "missing";
}

/** The selectors each provider signs under: Google's default, Microsoft's two (published as CNAMEs to its keys). */
export const DKIM_SELECTORS: Record<MailboxProvider, readonly string[]> = {
  google: ["google"],
  microsoft: ["selector1", "selector2"],
};

/** Whether a selector's TXT answer is a DKIM key: `v=DKIM1`, or a `p=` with a key in it. */
export function dkimOf(txt: TxtAnswer): "found" | "missing" {
  return joined(txt).some((r) => /^v=DKIM1\s*(;|$)/i.test(r) || /(^|;)\s*p=[A-Za-z0-9+/=]{20,}/.test(r))
    ? "found"
    : "missing";
}
