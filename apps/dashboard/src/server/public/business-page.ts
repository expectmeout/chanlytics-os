import "server-only";

/**
 * The public facts of one workspace's own page, read by slug.
 *
 * No session — a carrier reviewer opens this from a campaign registration, and a
 * customer from a link — so it reads with the service role (public/facts.ts) and
 * returns EXACTLY what the page shows. Nothing else crosses this boundary and
 * nothing here writes.
 *
 * The identity comes from `business_records`, its published columns (contracts
 * published-facts.ts): the facts the filing is made from, so the page agrees with
 * it when it is filed. The record can move after a filing while the carriers keep
 * what they vetted, and the save says so (contracts recordSavedWords).
 * The services come from the receptionist's own profile, because that is what
 * the business told us it does. Whether the business is open to its customers
 * decides whether the page says it answers them and asks for a yes.
 *
 * Cross-workspace: a public page resolves one workspace by slug, then reads only its public facts.
 */
import { parseTenantConfig, type BusinessPageFacts } from "@chanlytics/contracts";
import type { PublicWorkspaceRead } from "@chanlytics/db/workspace";
import { activeNumberOf, publicFactsFor } from "./facts";

/** The page's facts, from the one load; null without a business on record, which identifies nobody. */
function businessFactsOf(workspaceRead: PublicWorkspaceRead): BusinessPageFacts | null {
  const record = workspaceRead.record;
  if (!record) return null;
  const profile = parseTenantConfig(workspaceRead.config)?.brain?.profile ?? null;
  return {
    legalName: record.legal_name,
    tradeName: record.trade_name,
    street: record.street,
    streetSecondary: record.street_secondary,
    city: record.city,
    region: record.region,
    postalCode: record.postal_code,
    country: record.country,
    contactEmail: record.contact_email,
    // The number customers already reach them on. Voice first — it is the one on their door and their listing — then
    // WhatsApp.
    publicPhoneE164: activeNumberOf(workspaceRead, "voice") ?? activeNumberOf(workspaceRead, "whatsapp"),
    websiteUrl: record.website_url || null,
    about: record.about,
    industry: record.industry,
    // A sole proprietor's street is often their home: the page says where by city (00439 sole_proprietor_of, X4-5).
    soleProprietor: workspaceRead.soleProprietor,
    services: (profile?.services ?? []).map((s) => ({
      name: s.name,
      durationMin: s.duration_min ?? null,
      priceNote: s.price_note ?? null,
    })),
    // Relative: the opt-in page is on this same site, and a hardcoded origin is how a page ends up linking to the wrong
    // deployment. The ABSOLUTE form the carriers are given is built by the edge from dashboardOrigin(). This page and its
    // terms are what the campaign files as the business's privacy policy and terms: relative, for the same reason.
    optInUrl: `/yes/${workspaceRead.slug}`,
    privacyUrl: `/b/${workspaceRead.slug}`,
    termsUrl: `/b/${workspaceRead.slug}/terms`,
    open: workspaceRead.open,
  };
}

export async function findBusinessPage(slug: string): Promise<BusinessPageFacts | null> {
  const w = await publicFactsFor(slug);
  return w ? businessFactsOf(w) : null;
}
