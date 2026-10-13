import "server-only";

/**
 * The public facts of one workspace's opt-in page, read by slug.
 *
 * This page has no session — a customer opens it from a QR at the desk or a
 * link in a bio — so it reads with the service role (public-facts.ts), and
 * returns EXACTLY the facts the page shows: the business's name, the numbers
 * customers already write to, whether its own page publishes, and whether it is
 * open to its customers. Nothing else crosses this boundary, and nothing here
 * writes. A workspace that does not exist, is a test fixture or has ended has no
 * page; a paused one keeps it, and asks nobody for a yes (contracts takesSignUps).
 */
import { publishesBusinessPage, type ConsentPageFacts } from "@chanlytics/contracts";
import type { PublicWorkspaceRead } from "@chanlytics/db";
import { activeNumberOf, publicFactsFor } from "./public-facts";

type ConsentPageRow = Required<Pick<ConsentPageFacts, "slug" | "businessPage" | "open">> &
  Omit<ConsentPageFacts, "slug" | "businessPage" | "open">;

/** The page's facts, from the one load. */
function consentFactsOf(w: PublicWorkspaceRead): ConsentPageRow {
  const r = w.record;
  return {
    businessName: w.name,
    slug: w.slug,
    // Whether `/b/<slug>` publishes, so the policy links beside the asks are the business's own.
    businessPage: publishesBusinessPage(r),
    whatsappE164: activeNumberOf(w, "whatsapp"),
    smsE164: activeNumberOf(w, "sms"),
    open: w.open,
  };
}

export async function consentPageFor(slug: string): Promise<ConsentPageRow | null> {
  const w = await publicFactsFor(slug);
  return w ? consentFactsOf(w) : null;
}
