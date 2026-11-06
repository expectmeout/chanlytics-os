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

/** The SPF include that names each provider's sending servers: the first is the one a record is given. */
export const SPF_INCLUDES: Record<MailboxProvider, readonly [string, ...string[]]> = {
  google: ["_spf.google.com"],
  microsoft: ["spf.protection.outlook.com"],
};

/** The SPF records among a name's TXT answers: those that begin `v=spf1` (RFC 7208 4.5 discards the rest). */
export function spfRecordsOf(txt: TxtAnswer): string[] {
  return joined(txt).filter((r) => /^v=spf1(\s|$)/i.test(r));
}

/** Whether one SPF record names the provider's servers itself: its include, with no qualifier but a pass. */
export function spfNamesProvider(record: string, provider: MailboxProvider): boolean {
  return SPF_INCLUDES[provider].some((inc) =>
    new RegExp(`(^|\\s)\\+?include:${inc.replace(/\./g, "\\.")}(\\s|$)`, "i").test(record),
  );
}

/**
 * What one SPF record spends of SPF's ten lookups by itself (RFC 7208 4.6.4: include, a, mx, ptr, exists, and the
 * redirect modifier; all, ip4 and ip6 spend none), and the names its includes and redirect point at, to follow.
 */
export function spfTermsOf(record: string): { lookups: number; follow: string[] } {
  let lookups = 0;
  const follow: string[] = [];
  for (const term of record.trim().split(/\s+/).slice(1)) {
    const t = term.replace(/^[+\-~?]/, "").toLowerCase();
    const include = /^include:(.+)$/.exec(t)?.[1] ?? /^redirect=(.+)$/.exec(t)?.[1];
    if (include) {
      lookups += 1;
      follow.push(include);
    } else if (/^(a|mx|ptr|exists)([:/]|$)/.test(t)) lookups += 1;
  }
  return { lookups, follow };
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
