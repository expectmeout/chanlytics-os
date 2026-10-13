import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { businessPageMetadata, businessPageVM } from "@chanlytics/contracts";
import { businessPageFor } from "@/server/public/business-page";
import { BusinessPublicPage } from "@/yes/BusinessPublicPage";

/**
 * A workspace's own public page: who they are, what they do, and their text
 * terms.
 *
 * WHO READS IT. A carrier reviewer, opening the URL filed as a campaign's
 * website and privacy policy, checking two things they have already refused this
 * product for: that the page identifies a real business (30919) and that it sits
 * on the same domain as the opt-in page (30907). And a customer, following a
 * link, wanting to know who is texting them.
 *
 * WHY WE HOST IT. Most salons have a Facebook page and a Booksy link. Asking
 * them for a website that names their legal entity and a privacy policy carrying
 * carrier-required SMS language is not a requirement they can meet, and it is
 * the single biggest gap between signing up and texting working. So the facts
 * they already gave us — the same ones the carriers vetted on the brand — are
 * published here, on the domain the opt-in page is already on.
 *
 * The floor, not the ceiling: a business with its own website has it linked
 * here, and keeps filing it.
 *
 * INDEXED, unlike `/yes/<slug>`. This one is meant to be findable — a business
 * that cannot be looked up is what 30919 was complaining about.
 */
/**
 * The title is the BUSINESS, not the product.
 *
 * This page is indexed and it is filed with the carriers as a business's
 * website. A reviewer's tab, a search result and a link preview all read the
 * title first, and "Chanlytics OS" on a page that exists to identify Marisa's
 * Beauty Salon is the same failure as the page saying nothing at all.
 *
 * A page with nothing to show is named Not found and is not indexed, by the rule
 * the page renders by (contracts' businessPageMetadata; the wiring audit's N21).
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return businessPageMetadata(await businessPageFor(slug));
}

// Rendered for each request, as it always was: it reads its slug and the workspace's record before anything is drawn,
// and a business's page must say what is true now. Under cacheComponents a page that reads before it draws may block,
// and this says it may (decision 0053, step 5).
export const instant = false;

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await businessPageFor(slug);
  if (!facts) notFound();
  const vm = businessPageVM(facts);
  if (vm.empty) notFound();

  return <BusinessPublicPage vm={vm} />;
}
