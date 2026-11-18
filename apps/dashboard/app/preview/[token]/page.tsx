import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEAD_PREVIEW_WORDS as W, previewPageOf } from "@chanlytics/contracts";
import { findPreviewPage } from "@/server/public/preview-page";
import { PreviewPage } from "@/surfaces/preview/preview-page";

/**
 * A lead's own receptionist, before they sign up (decision 0079): the page a cold email's `{{their preview}}` link
 * opens, by its token alone (src/server/public/preview-page.ts reads it on the service role). Public by the proxy's
 * `/preview/` prefix, which says on what terms; a token that names nothing is Not found before this renders
 * (public/page-gate.ts), and notFound() here is the floor.
 *
 * NOT INDEXED, and it sends no referrer: the token is the link's whole authority, so nothing on the page should carry it
 * anywhere. Its title is the business's, as a link preview reads it.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const read = await findPreviewPage(token).catch(() => null);
  return {
    title: read?.facts.business ? W.title(read.facts.business) : W.chip,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

// Rendered for each request: it reads its token's row before anything is drawn, and a preview must say what is true now
// (its state, its chat). Under cacheComponents a page that reads before it draws may block, and this says it may.
export const instant = false;

export default async function LeadPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ look?: string | string[] }>;
}) {
  const { token } = await params;
  // Its sender looking (the lead sheet's Open it): counted as nothing, and nothing to press.
  const look = (await searchParams).look === "1";
  const read = await findPreviewPage(token);
  if (!read) notFound();
  // The page wears the app's own colours, its one coral among them: the business is its face and its name, never a
  // second accent beside the filled act (decision 0079's amendment of 18 November 2026; 0075's colour is its links').
  const vm = previewPageOf(read.facts, new Date());
  return <PreviewPage vm={vm} token={token} look={look} />;
}
