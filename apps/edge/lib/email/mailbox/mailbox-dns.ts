/**
 * What DNS says of a connected mailbox's domain (decision 0056): its SPF names the provider, its DKIM key is
 * published under the provider's selector, it has DMARC (at the host, else a parent down to two labels: RFC 7489's
 * organisational fallback, approximated without the public suffix list), and it receives mail. Each record is
 * `found`, `missing`, or left out when DNS could not be read: "could not read" is never "missing".
 */
import { Resolver } from "node:dns/promises";
import { DKIM_SELECTORS, dkimOf, dmarcOf, spfOf, type TxtAnswer } from "../../packages/channels.js";
import type { DnsRecordState, MailboxDnsRecord, MailboxProvider } from "../../packages/contracts.js";

type TxtResolver = (name: string) => Promise<string[][]>;
type MxResolver = (name: string) => Promise<Array<{ exchange: string; priority: number }>>;

/** Each of the resolver's two tries gives up after this. */
const DNS_TRY_TIMEOUT_MS = 3000;

// A resolver of its own each read, so a timeout is this read's alone (a test answers DNS through Resolver itself).
const resolverOf = () => new Resolver({ timeout: DNS_TRY_TIMEOUT_MS, tries: 2 });
const txt: TxtResolver = (name) => resolverOf().resolveTxt(name);
const mx: MxResolver = (name) => resolverOf().resolveMx(name);

/** A name with no record at all, or no such name: an answer. Anything else is DNS not answering. */
const NO_RECORD = new Set(["ENODATA", "ENOTFOUND"]);

async function readTxt(name: string): Promise<TxtAnswer | null> {
  try {
    return await txt(name);
  } catch (e) {
    return NO_RECORD.has((e as { code?: string }).code ?? "") ? [] : null;
  }
}

/** A domain's records, judged for the provider its mailbox is at. */
export async function readMailboxDns(
  host: string,
  provider: MailboxProvider,
): Promise<Partial<Record<MailboxDnsRecord, DnsRecordState>>> {
  const out: Partial<Record<MailboxDnsRecord, DnsRecordState>> = {};
  const [root, mxs] = await Promise.all([
    readTxt(host),
    mx(host).then(
      (r) => r,
      (e: unknown) => (NO_RECORD.has((e as { code?: string }).code ?? "") ? [] : null),
    ),
  ]);
  if (root) out.spf = spfOf(root, provider);
  if (mxs) out.mx = mxs.length > 0 ? "found" : "missing";
  // DKIM: any of the provider's selectors with a key (a TXT read follows Microsoft's CNAME to its key).
  let dkimRead = false;
  for (const selector of DKIM_SELECTORS[provider]) {
    const a = await readTxt(`${selector}._domainkey.${host}`);
    if (!a) continue;
    dkimRead = true;
    if (dkimOf(a) === "found") {
      out.dkim = "found";
      break;
    }
  }
  if (!out.dkim && dkimRead) out.dkim = "missing";
  // DMARC: at the host, else each parent down to two labels.
  const labels = host.split(".");
  let dmarcUnread = false;
  for (let i = 0; i <= labels.length - 2; i++) {
    const a = await readTxt(`_dmarc.${labels.slice(i).join(".")}`);
    if (!a) {
      dmarcUnread = true;
      break;
    }
    if (dmarcOf(a) === "found") {
      out.dmarc = "found";
      break;
    }
  }
  if (!out.dmarc && !dmarcUnread) out.dmarc = "missing";
  return out;
}
