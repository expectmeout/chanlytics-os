import "server-only";

/**
 * The public facts of one workspace's own page, read by slug.
 *
 * No session — a carrier reviewer opens this from a campaign registration, and a
 * customer from a link — so it reads with the service role (public-facts.ts) and
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
import type { PublicWorkspaceRead } from "@chanlytics/db";
import { activeNumberOf, publicFactsFor } from "./public-facts";

/** The page's facts, from the one load; null without a business on record, which identifies nobody. */
function businessFactsOf(w: PublicWorkspaceRead): BusinessPageFacts | null {
  const r = w.record;
  if (!r) return null;
  const profile = parseTenantConfig(w.config)?.brain?.profile ?? null;
  return {
    legalName: r.legal_name,
    tradeName: r.trade_name,
    street: r.street,
    streetSecondary: r.street_secondary,
    city: r.city,
    region: r.region,
    postalCode: r.postal_code,
    country: r.country,
    contactEmail: r.contact_email,
    // The number customers already reach them on. Voice first — it is the one on their door and their listing — then
    // WhatsApp.
    publicPhoneE164: activeNumberOf(w, "voice") ?? activeNumberOf(w, "whatsapp"),
    websiteUrl: r.website_url || null,
    about: r.about,
    industry: r.industry,
    services: (profile?.services ?? []).map((s) => ({
      name: s.name,
      durationMin: s.duration_min ?? null,
      priceNote: s.price_note ?? null,
    })),
    // Relative: the opt-in page is on this same site, and a hardcoded origin is how a page ends up linking to the wrong
    // deployment. The ABSOLUTE form the carriers are given is built by the edge from dashboardOrigin(). This page and its
    // terms are what the campaign files as the business's privacy policy and terms: relative, for the same reason.
    optInUrl: `/yes/${w.slug}`,
    privacyUrl: `/b/${w.slug}`,
    termsUrl: `/b/${w.slug}/terms`,
    open: w.open,
  };
}

export async function businessPageFor(slug: string): Promise<BusinessPageFacts | null> {
  const w = await publicFactsFor(slug);
  return w ? businessFactsOf(w) : null;
}
