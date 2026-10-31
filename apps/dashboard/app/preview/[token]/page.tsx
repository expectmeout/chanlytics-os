import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { accentOf, LEAD_PREVIEW_WORDS as W, previewPageOf } from "@chanlytics/contracts";
import { previewPageFor } from "@/server/public/preview-page";
import { PreviewPage } from "@/surfaces/preview/preview-page";

/**
 * A lead's own receptionist, before they sign up (decision 0079): the page a cold email's `{{their preview}}` link
 * opens, by its token alone (src/server/public/preview-page.ts reads it on the service role). Public by the proxy's
 * `/preview/` prefix, which says on what terms; a token that names nothing is Not found before this renders
 * (public-page-gate.ts), and notFound() here is the floor.
 *
 * NOT INDEXED, and it sends no referrer: the token is the link's whole authority, so nothing on the page should carry it
 * anywhere. Its title is the business's, as a link preview reads it.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const read = await previewPageFor(token).catch(() => null);
  return {
    title: read?.facts.business ? W.title(read.facts.business) : W.chip,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

// Rendered for each request: it reads its token's row before anything is drawn, and a preview must say what is true now
// (its state, its chat). Under cacheComponents a page that reads before it draws may block, and this says it may.
export const instant = false;

/** The business's colour on the one button and the links (decision 0075), as tokens: a colour its read checked. */
function accentRule(accent: string | null): string | null {
  if (!accent) return null;
  const colour = accentOf({ accent });
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return null;
  return `:root[data-theme]{--accent:${colour};--accent-ink:${colour};--accent-fg:#fff;--accent-soft:color-mix(in oklab, ${colour} 14%, transparent)}`;
}

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
  const read = await previewPageFor(token);
  if (!read) notFound();
  const vm = previewPageOf(read.facts, new Date());
  const rule = accentRule(read.look.accent);
  return (
    <>
      {rule ? <style>{rule}</style> : null}
      <PreviewPage vm={vm} token={token} look={look} />
    </>
  );
}
