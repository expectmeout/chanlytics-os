/**
 * A collect's reads of its places' own sites: each host read once, whoever asks for it. The judge asks first, where a
 * plan asks what only a website shows (planReadsSites); the mark step after it (mark-places.ts) finds the page already in
 * hand. A read is one credit with the page's reader whatever it answers, its cached copy's too, so the memo is the saving,
 * and two listings of one site are one read. What the reads cost is settled once, as the collect lets go of its run: a
 * read is paid for when it is made, whether or not the page it served is ever committed (settleSiteReads).
 */
import { LEAD_SITE_FACT_MAX, LEAD_SITE_READ_USD } from "@chanlytics/contracts";
import { type SitePage } from "@chanlytics/channels/website";
import { errField, logger } from "@chanlytics/log";
import { bookingPageOfSite } from "../../website/booking-page";
import { runEachAtOnce } from "../../shared/each-at-once";
import { siteWordsOf } from "../../website/site-words";
import type { CleanPlace } from "../clean";
import type { LeadPorts } from "../ports";
import { LeadRetry } from "./rules";

const sitesLog = logger();

/**
 * Sites read at once: one slow site holds up only its own place. No more than the reader's plan renders at a time
 * (Firecrawl's Hobby: five, per team): one past them waits in its queue with its own timeout running, and reads as slow.
 */
export const SITES_AT_ONCE = 5;
/** The most one site is given, whatever is left: a site that takes longer costs its place's reading, never the batch's. */
const SITE_READ_MOST_MS = 10_000;
/**
 * The least a site is given before the judge: past this a place waits for the next job (the collect's cut), since a read
 * cut short would tell the judge a site says nothing when it was only slow.
 */
const SITE_READ_LEAST_MS = 4_000;
/** The most a batch spends reading before its judge is asked. */
const SITES_ALLOWANCE_MS = 20_000;
/**
 * This many sites read with not one page to show is the reader, not the sites (its credits gone, its key refused, its
 * outage: about one site in seven fails by itself, so five together is one batch in tens of thousands).
 */
const SITES_TO_TELL_THE_READER_DOWN = 5;

/** Between a site's booking link and its words, as siteWordsOf parts its own. */
const WORDS_AFTER_LINK = " · ";

/** The sites of one run of the collect, each read once. */
export interface SiteReads {
  /** The page at a host: read now, or the one already read or being read. Null where it could not be read. */
  read(host: string, timeoutMs: number): Promise<SitePage | null>;
  /** Whether it has been asked for. */
  asked(host: string): boolean;
  /** How many have been asked for, each a credit. */
  count(): number;
}

export function siteReadsOf(leadPorts: Pick<LeadPorts, "readSite">): SiteReads {
  const pages = new Map<string, Promise<SitePage | null>>();
  return {
    read(host, timeoutMs) {
      const held = pages.get(host);
      if (held) return held;
      const page = leadPorts.readSite ? leadPorts.readSite(host, timeoutMs).catch(() => null) : Promise.resolve(null);
      pages.set(host, page);
      return page;
    },
    asked: (host) => pages.has(host),
    count: () => (leadPorts.readSite ? pages.size : 0),
  };
}

/**
 * The hosts' sites read before the judge is asked, in the time its bound leaves (`keep`, what must stay free behind them):
 * as many as can each be given their least. What is left of them is unasked (SiteReads.asked), for the caller to hold back.
 * A reader that answered none of them is thrown to the ledger's waits: its places would each read as a site that says
 * nothing, and a whole search would go to review, and ask its owner why, for what is only our outage.
 */
export async function readSitesBeforeJudge(
  leadPorts: Pick<LeadPorts, "now" | "deadline">,
  sites: SiteReads,
  hosts: readonly string[],
  keep: number,
): Promise<void> {
  const until = Math.min(leadPorts.now().getTime() + SITES_ALLOWANCE_MS, leadPorts.deadline - keep);
  const left = () => until - leadPorts.now().getTime();
  const answered: (SitePage | null)[] = [];
  await runEachAtOnce(
    [...new Set(hosts)],
    SITES_AT_ONCE,
    () => left() >= SITE_READ_LEAST_MS,
    async (host) => {
      answered.push(await sites.read(host, Math.min(left(), SITE_READ_MOST_MS)));
    },
  );
  if (answered.length >= SITES_TO_TELL_THE_READER_DOWN && answered.every((page) => !page))
    throw new LeadRetry("the page reader answered none of a batch's sites");
}

/**
 * What a place's site says, as the judge is shown it (contracts PlaceFacts.site): null with no site, or none read. The
 * booking page it links to as the way to book comes first, read off the whole page: its main words leave out the menus
 * and footers a Book button sits in, and stop at the fact's size (5 Nov 2026: a salon that books online read as one
 * that takes calls). A listing whose website is its booking page says so, with nothing read and no credit spent.
 */
export async function findSiteFact(
  sites: SiteReads,
  { host, bookingPage }: Pick<CleanPlace, "host" | "bookingPage">,
): Promise<string | null> {
  if (!host) return bookingPage ? `This listing's website is its booking page: ${bookingPage}` : null;
  const page = await sites.read(host, SITE_READ_LEAST_MS);
  if (!page) return null;
  const booking = bookingPageOfSite(`https://${host}/`, page);
  if (!booking) return siteWordsOf(page, LEAD_SITE_FACT_MAX);
  const link = `Booking link on this site: ${booking}`;
  const words = siteWordsOf(page, LEAD_SITE_FACT_MAX - link.length - WORDS_AFTER_LINK.length);
  return words ? `${link}${WORDS_AFTER_LINK}${words}` : link;
}

/**
 * What a run of the collect read, paid for (lead_site_reads_spent): against its round while it lives, else the month and
 * the day it was read in. A write that fails is logged and costs the record, never the page.
 */
export async function settleSiteReads(
  leadPorts: Pick<LeadPorts, "db">,
  round: { id: string; tenant_id: string },
  sites: SiteReads,
): Promise<void> {
  const reads = sites.count();
  if (!reads) return;
  await leadPorts.db
    .siteReadsSpent(round.tenant_id, round.id, reads, reads * LEAD_SITE_READ_USD)
    .catch((e: unknown) => {
      sitesLog.warn("lead_site_reads_unsettled", { tenant_id: round.tenant_id, reads, error: errField(e) });
    });
}
