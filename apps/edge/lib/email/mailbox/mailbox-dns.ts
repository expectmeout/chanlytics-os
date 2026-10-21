/**
 * What DNS says of a connected mailbox's domain (decision 0056): its SPF names the provider, its DKIM key is
 * published under the provider's selector, it has DMARC (at the host, else a parent down to two labels: RFC 7489's
 * organisational fallback, approximated without the public suffix list), and it receives mail. Each record is
 * `found`, `missing`, or left out when DNS could not be read: "could not read" is never "missing".
 *
 * SPF is read whole: the record the domain publishes now (kept, so the page offers it back changed rather than a second
 * one beside it), and its includes followed, for a provider named under one of them and for the lookups the record
 * spends of SPF's ten (RFC 7208 4.6.4). A domain with two SPF records has none that counts.
 */
import { Resolver } from "node:dns/promises";
import {
  DKIM_SELECTORS,
  SPF_INCLUDES,
  dkimOf,
  dmarcOf,
  spfNamesProvider,
  spfRecordsOf,
  spfTermsOf,
  type TxtAnswer,
} from "../../packages/channels.js";
import {
  SPF_LOOKUPS_MAX,
  SPF_RECORDS_JOIN,
  SPF_RECORD_MAX,
  type DnsRecordState,
  type MailboxDnsRecord,
  type MailboxProvider,
} from "../../packages/contracts.js";

type TxtResolver = (name: string) => Promise<string[][]>;
type MxResolver = (name: string) => Promise<Array<{ exchange: string; priority: number }>>;

/** Each of the resolver's two tries gives up after this. */
const DNS_TRY_TIMEOUT_MS = 3000;
/** How long the includes are followed for, all told: past it, the lookups are not known, and nothing is guessed. */
const SPF_FOLLOW_MS = 5000;
/**
 * What adding each provider's include costs when its own record cannot be read now: Google's names three netblocks
 * under it (four lookups in all), Microsoft's none (one).
 */
const PROVIDER_SPF_COST: Record<MailboxProvider, number> = { google: 4, microsoft: 1 };

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

/** What DNS said of a mailbox's domain, as its row keeps it: each record's state, and its SPF record as it stands. */
type MailboxDnsRead = Partial<Record<MailboxDnsRecord, DnsRecordState>> & {
  /** The one SPF record the domain publishes, or every one joined by SPF_RECORDS_JOIN when it publishes more. */
  spf_record?: string;
  /**
   * The lookups that record spends with the provider in it, counted through its includes (its own, and the provider's
   * when it must be added); left out when they could not all be read.
   */
  spf_lookups?: number;
};

/**
 * The record's includes followed, breadth first: whether the provider is named anywhere under it, and the lookups the
 * whole spends (null when an include could not be read in time, or names a domain with no SPF record, which fails the
 * record whatever else it says: RFC 7208 5.2).
 */
async function followSpf(
  record: string,
  provider: MailboxProvider,
): Promise<{ names: boolean; lookups: number | null }> {
  const until = Date.now() + SPF_FOLLOW_MS;
  let names = spfNamesProvider(record, provider);
  let { lookups, follow } = spfTermsOf(record);
  let known = true;
  const seen = new Set<string>();
  while (follow.length > 0) {
    const name = follow.shift() ?? "";
    if (seen.has(name)) continue;
    seen.add(name);
    // Past the limit, or past the time, the count stops: a record over ten fails whatever its tail spends.
    if (lookups > SPF_LOOKUPS_MAX || Date.now() >= until) {
      known = lookups > SPF_LOOKUPS_MAX;
      break;
    }
    const a = await readTxt(name);
    if (!a) {
      known = false;
      continue;
    }
    const nested = spfRecordsOf(a)[0];
    if (!nested) {
      known = false;
      continue;
    }
    if (spfNamesProvider(nested, provider)) names = true;
    const t = spfTermsOf(nested);
    lookups += t.lookups;
    follow = [...follow, ...t.follow];
  }
  return { names, lookups: known ? lookups : null };
}

/** What adding the provider's include spends: its own record followed (the include itself and what it names). */
async function providerCost(provider: MailboxProvider): Promise<number> {
  const followed = await followSpf(`v=spf1 include:${SPF_INCLUDES[provider][0]}`, provider);
  return followed.lookups ?? PROVIDER_SPF_COST[provider];
}

/** A domain's records, judged for the provider its mailbox is at. */
export async function readMailboxDns(host: string, provider: MailboxProvider): Promise<MailboxDnsRead> {
  const out: MailboxDnsRead = {};
  const [root, mxs] = await Promise.all([
    readTxt(host),
    mx(host).then(
      (r) => r,
      (e: unknown) => (NO_RECORD.has((e as { code?: string }).code ?? "") ? [] : null),
    ),
  ]);
  if (root) {
    const spf = spfRecordsOf(root);
    if (spf.length > 0) out.spf_record = spf.join(SPF_RECORDS_JOIN).slice(0, SPF_RECORD_MAX);
    if (spf.length === 1) {
      const followed = await followSpf(spf[0] ?? "", provider);
      // An include that could not be read may be the one the provider is under: not read, never missing.
      if (followed.names) out.spf = "found";
      else if (followed.lookups !== null) out.spf = "missing";
      if (followed.lookups !== null)
        out.spf_lookups = followed.names ? followed.lookups : followed.lookups + (await providerCost(provider));
    } else out.spf = "missing";
  }
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
