import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { textingTermsMetadata, textingTermsVM } from "@chanlytics/contracts";
import { businessPageFor } from "@/server/public/business-page";
import { TextingTerms } from "@/yes/TextingTerms";

/**
 * A workspace's text-messaging terms: `/b/<slug>/terms`.
 *
 * Filed with the carriers as the campaign's TermsAndConditionsUrl -- a required
 * field since 30 June 2026 -- and read by a reviewer against a list of eight
 * things (the program's name and description, the rates disclosure, the
 * frequency, help, how to stop, a privacy link, carrier liability), each its own
 * error code since 15 September 2026. Chanlytics' /terms is a software
 * agreement for workspace owners and carries none of them, so filing it named
 * the wrong company's terms for the wrong reader. These are the business's own,
 * from the same record the brand was vetted on, beside the page filed as its
 * privacy policy.
 *
 * Public by the `/b/` prefix like its neighbour, indexed like it; it reads by
 * slug and writes nothing.
 */
// Named for the business customers know, or Not found and unindexed when the page has nothing to show, by the rule the
// page renders by (contracts' textingTermsMetadata; the wiring audit's N21).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return textingTermsMetadata(await businessPageFor(slug));
}

// Rendered for each request, as it always was: it reads its slug and the workspace's record before anything is drawn,
// and a business's page must say what is true now. Under cacheComponents a page that reads before it draws may block,
// and this says it may (decision 0053, step 5).
export const instant = false;

export default async function TextingTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await businessPageFor(slug);
  if (!facts) notFound();
  const vm = textingTermsVM(facts);
  if (vm.empty) notFound();

  return <TextingTerms vm={vm} />;
}
