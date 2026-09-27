import "server-only";
import { cache } from "react";

/**
 * The public facts of one workspace's own page, read by slug.
 *
 * No session — a carrier reviewer opens this from a campaign registration, and a
 * customer from a link — so it reads with the service role and returns EXACTLY
 * what the page shows. Nothing else crosses this boundary and nothing here
 * writes.
 *
 * The identity comes from `business_records`, which is the same set of facts the
 * carriers already vetted when the brand was registered: publishing anything
 * else would mean a page that disagrees with the filing it exists to support.
 * The services come from the receptionist's own profile, because that is what
 * the business told us it does.
 *
 * The fourth place the dashboard holds the service role, and the second of two
 * that serve a page with no session (consent-page.ts is the other).
 */
import { parseTenantConfig, type BusinessPageFacts } from "@chanlytics/contracts";
import { serviceDb } from "../service-db";

/** A slug as `create_workspace` mints them: lowercase letters, digits and dashes. */
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Wrapped in React's per-request `cache`: both public pages call this TWICE,
 * once in generateMetadata and once in the component, and with
 * `dynamic = "force-dynamic"` there is no render cache to fall back on — so a
 * tenants lookup plus three parallel reads ran twice on every view of a page
 * whose whole audience is carrier reviewers and customers following a link.
 * The second call is now free, and neither page had to change shape.
 */
export const businessPageFor = cache(async function businessPageFor(slug: string): Promise<BusinessPageFacts | null> {
  const clean = slug.trim().toLowerCase();
  if (!SLUG.test(clean)) return null;
  const db = serviceDb();

  const { data: tenant, error } = await db.from("tenants").select("id, status").eq("slug", clean).maybeSingle();
  if (error) throw new Error(`reading the workspace: ${error.message}`);
  if (!tenant || tenant.status === "test") return null;

  const [record, cfg, channels] = await Promise.all([
    db.from("business_records").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenant.id).maybeSingle(),
    db.from("tenant_channels").select("kind, number_e164").eq("tenant_id", tenant.id).eq("status", "active"),
  ]);
  if (record.error) throw new Error(`reading the business on record: ${record.error.message}`);
  // No record on file is no page: this exists to identify a business, and a
  // business that has not told us who it is cannot be identified.
  if (!record.data) return null;

  const r = record.data;
  const profile = parseTenantConfig(cfg.data?.config ?? null)?.brain?.profile ?? null;
  // The number customers already reach them on. Voice first — it is the one on
  // their door and their listing — then WhatsApp.
  const numberOf = (kind: string) => channels.data?.find((c) => c.kind === kind && c.number_e164)?.number_e164 ?? null;

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
    publicPhoneE164: numberOf("voice") ?? numberOf("whatsapp"),
    websiteUrl: r.website_url || null,
    about: r.about,
    industry: r.industry,
    services: (profile?.services ?? []).map((s) => ({
      name: s.name,
      durationMin: s.duration_min ?? null,
      priceNote: s.price_note ?? null,
    })),
    // Relative: the opt-in page is on this same site, and a hardcoded origin
    // is how a page ends up linking to the wrong deployment. The ABSOLUTE
    // form the carriers are given is built by the edge from dashboardOrigin().
    optInUrl: `/yes/${clean}`,
    // This page and its terms, which the campaign files as the business's
    // privacy policy and terms: relative, for the same reason.
    privacyUrl: `/b/${clean}`,
    termsUrl: `/b/${clean}/terms`,
  };
});
