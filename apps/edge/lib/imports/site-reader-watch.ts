/**
 * The page reader's credits, watched for the platform, never an owner. Every read of a business's page is one credit
 * (site-reads.ts), and a plan with none left answers every read with a refusal: the website read then says a site "didn't
 * answer", a lead has no mark, a judge sees no site, a cold email's opening reads nothing, and nothing anywhere is wrong
 * by itself. So each health sweep reads what is left, and pages while it is low, before it runs out, or the moment the key
 * is refused. A plan renews on its own; a page here says buy more, or wait for that day. Through the pager, so Health's
 * "What paged us" shows it and the platform's mail says it. A read of the provider's books that fails is logged, and the
 * sweep's other checks stand.
 *
 * Nothing here is shown to an owner, so the vendor's name is fine in what it says.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { firecrawlCredits, type SiteReaderCredits } from "../packages/channels.js";
import type { Database } from "../packages/db.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import { pageOperator, type PagePorts } from "../ops/page-operator.js";

type Db = SupabaseClient<Database>;

/** Paged under this share of the plan's credits, the plan's month having that much left to run. */
const CREDITS_LOW_SHARE = 0.1;
/** Or under this many, whatever the plan: a search reads a site a place, and a search asks for up to a thousand. */
const CREDITS_LOW_LEAST = 500;

/** Whether what is left is low: under a tenth of the plan, or under what one big search would read. */
const creditsLow = (c: { remaining: number; plan: number | null }): boolean =>
  c.remaining < Math.max(CREDITS_LOW_LEAST, (c.plan ?? 0) * CREDITS_LOW_SHARE);

/**
 * Each health sweep: the reader's credits, and a page while they are low or its key is refused, one page per the pager's
 * window. Answers what it read, for the sweep's line. Nothing is read with no key set: the website read says so itself
 * (website_read_failed, step no_reader). Never throws for the provider's sake.
 */
export async function watchSiteReader(
  db: Db,
  read: (key: string) => Promise<SiteReaderCredits> = firecrawlCredits,
  pager: Omit<PagePorts, "db"> = {},
): Promise<number | null> {
  const key = env.FIRECRAWL_API_KEY;
  if (!key) return null;
  const L = logger({ sweep: "health" });
  const credits = await read(key);
  if (credits.kind === "unread") {
    L.warn("site_reader_unreadable", {});
    return null;
  }
  if (credits.kind === "refused") {
    await pageOperator(
      { db, ...pager },
      "site_reader_key",
      "The page reader refused its key: Firecrawl",
      `Firecrawl answered ${credits.status} to FIRECRAWL_API_KEY. Until it is fixed every read of a business's website ` +
        `comes back empty: Check offers nothing from a site, a lead has no mark, a search that reads sites sends every ` +
        `place to review, and a cold email's opening reads no site. Set a working key on the edge (Vercel project ` +
        `chanlytics-messaging) and redeploy.\n`,
    );
    return null;
  }
  L.info("site_reader_credits", { remaining: credits.remaining, plan: credits.plan, period_end: credits.periodEnd });
  if (creditsLow(credits))
    await pageOperator(
      { db, ...pager },
      "site_reader_credits",
      `The page reader is low on credits: ${credits.remaining} left`,
      `Firecrawl has ${credits.remaining} credits left` +
        `${credits.plan === null ? "" : ` of ${credits.plan}`}` +
        `${credits.periodEnd ? `, and renews on ${credits.periodEnd}` : ""}. Every read of a business's website is one ` +
        `credit, and with none left each comes back empty: Check offers nothing from a site, a lead has no mark, a ` +
        `search that reads sites sends every place to review, and a cold email's opening reads no site. Top up on ` +
        `Firecrawl's billing page, or move to a larger plan.\n`,
    );
  return credits.remaining;
}
