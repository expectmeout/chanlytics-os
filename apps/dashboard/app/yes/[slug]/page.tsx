import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { businessPageVM, consentPageMetadata, consentPageVM } from "@chanlytics/contracts";
import { consentPageFor } from "@/server/public/consent-page";
import { businessPageFor } from "@/server/public/business-page";
import { SignUpPage } from "@/yes/SignUpPage";

/**
 * A workspace's public "say yes" page.
 *
 * Two audiences, one page. A customer scans the QR at the desk or taps the
 * link in a bio, sees what they are agreeing to, and says yes in their own
 * message from their own phone — the strongest consent there is, and the
 * only kind this product records. A carrier reviewing the business's
 * registration opens the same URL and finds the wording they ask for.
 *
 * TWO ASKS. It used to be one — "Text YES OFFERS … Sending it is your yes" —
 * covering offers, news AND appointment reminders together, and the carriers
 * refused the campaign for exactly that (error 30913: "marketing consent was
 * combined with other consents"). Each ask now stands on its own with its own
 * keyword and its own disclosures, and the promotional one says in its own words
 * that it is optional and changes nothing if declined.
 *
 * No form, no field, no write: a number typed into a box is not proof that
 * its owner agreed, and inventing one would be the only dishonest thing on
 * the page. Not indexed — it is for the people given the link, not for a
 * search result competing with the business's own site.
 */
// Named for the business the customer is agreeing to hear from, in the page's own heading, or Not found when no
// workspace answers to the slug (the wiring audit's N14 and N21). Never indexed; the rule is contracts'.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return consentPageMetadata(await consentPageFor(slug));
}
// Rendered for each request, as it always was: it reads its slug and the workspace's record before anything is drawn,
// and a business's page must say what is true now. Under cacheComponents a page that reads before it draws may block,
// and this says it may (decision 0053, step 5).
export const instant = false;

export default async function ConsentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const facts = await consentPageFor(slug);
  if (!facts) notFound();
  const vm = consentPageVM(facts);
  // The business's own facts, by the rule `/b/<slug>` publishes by: a record too thin to identify anybody shows nothing.
  const record = await businessPageFor(slug);
  const who = record ? businessPageVM(record) : null;
  const business = who && !who.empty ? who : null;
  const qr = vm.qrLink
    ? await QRCode.toString(vm.qrLink, { type: "svg", margin: 1, width: 190, errorCorrectionLevel: "M" })
    : null;

  return <SignUpPage vm={vm} business={business} qr={qr} slug={slug} businessName={facts.businessName} />;
}
