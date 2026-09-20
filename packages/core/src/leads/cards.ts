/**
 * The half of a source card the code holds (PRD §0.3, decision 23): the
 * actors with their pinned builds, the input builder from the validated plan
 * (never from Claude's words), the output mapper from an item to a lead
 * (Appendix B), and the checker beside it. The half Claude reads is
 * contracts' LEAD_CARDS.
 *
 * The Maps input asks for exactly what a lead needs: contacts from the
 * business's own site, no reviewer data, no images, no detail pages. A ZIP or
 * radius ask is a circle around its center; a city ask is the actor's own
 * location query (decision 31). Every field read from an item is in
 * MAPS_FIELDS, including `location` (E7); an item without a name does not
 * read, and its offset still counts.
 */
import type { LeadEmailState, LeadSearchPlan } from "@chanlytics/contracts";
import { zctaCenter } from "./geo";

/** The Maps item fields a lead is built from. Nothing else is asked for. */
export const MAPS_FIELDS = [
  "title", "categoryName", "neighborhood", "street", "city", "state", "postalCode", "countryCode",
  "phoneUnformatted", "phone", "phones", "website", "domain", "emails", "instagrams", "placeId",
  "totalScore", "reviewsCount", "permanentlyClosed", "temporarilyClosed", "location",
] as const;
export const CHECKER_FIELDS = ["email", "status", "is_catch_all"] as const;
/** This actor refuses a cap under $0.50 (PRD §10.1). */
export const MAPS_CAP_FLOOR_USD = 0.5;
/** A run may hold the provider this long before the sweep aborts it (PRD §12.5). */
export const MAPS_RUN_TIMEOUT_SECS = 45 * 60;
export const CHECKER_RUN_TIMEOUT_SECS = 15 * 60;

export interface MapsPlace {
  placeId: string;
  title: string;
  category: string | null;
  neighborhood: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  phoneRaw: string | null;
  sitePhones: string[];
  website: string | null;
  emails: string[];
  instagram: string | null;
  rating: number | null;
  reviews: number | null;
  closed: boolean;
  location: { lat: number; lng: number } | null;
}

export interface LeadCardRunner {
  actor: string;
  build: string;
  buildInput(plan: LeadSearchPlan, term: string, places: number): unknown;
  mapItem(item: unknown): MapsPlace | null;
  fields: readonly string[];
  checker: {
    actor: string;
    build: string;
    buildInput(emails: string[]): unknown;
    mapItem(item: unknown): { email: string; state: Exclude<LeadEmailState, "none" | "checking"> } | null;
    fields: readonly string[];
  };
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => !!s) : []);

/** The circle a ZIP or radius ask searches: the plan's center, else the ZIP table's. Null for a city ask. */
export function areaCenter(plan: LeadSearchPlan): { lat: number; lng: number } | null {
  if (plan.area.center) return plan.area.center;
  if (plan.area.kind === "zip" && plan.area.zip) return zctaCenter(plan.area.zip);
  return null;
}

export const CARDS: Record<"local_businesses", LeadCardRunner> = {
  local_businesses: {
    actor: "compass/crawler-google-places",
    build: "0.14.757",
    fields: MAPS_FIELDS,
    buildInput(plan, term, places) {
      const center = plan.area.kind === "city" ? null : areaCenter(plan);
      return {
        searchStringsArray: [term],
        ...(center
          ? { customGeolocation: { type: "Point", coordinates: [center.lng, center.lat], radiusKm: Math.max(1, Math.round(plan.area.radius_m / 100) / 10) } }
          : { locationQuery: plan.area.query }),
        maxCrawledPlacesPerSearch: places,
        language: "en",
        scrapeContacts: true,
        scrapeReviewsPersonalData: false,
        maxReviews: 0,
        maxImages: 0,
        scrapePlaceDetailPage: false,
      };
    },
    mapItem(item) {
      const o = obj(item);
      const title = str(o?.title);
      const placeId = str(o?.placeId);
      if (!o || !title || !placeId) return null;
      const loc = obj(o.location);
      const lat = num(loc?.lat);
      const lng = num(loc?.lng);
      return {
        placeId,
        title: title.slice(0, 120),
        category: str(o.categoryName),
        neighborhood: str(o.neighborhood),
        street: str(o.street),
        city: str(o.city),
        state: str(o.state),
        postalCode: str(o.postalCode),
        countryCode: str(o.countryCode),
        phoneRaw: str(o.phoneUnformatted) ?? str(o.phone),
        sitePhones: strs(o.phones),
        website: str(o.website),
        emails: strs(o.emails),
        // Only the first: the business's own account; later ones can be staff members' (Appendix B).
        instagram: strs(o.instagrams)[0] ?? null,
        rating: num(o.totalScore),
        reviews: num(o.reviewsCount),
        closed: o.permanentlyClosed === true || o.temporarilyClosed === true,
        location: lat !== null && lng !== null ? { lat, lng } : null,
      };
    },
    checker: {
      actor: "bounceverify/bounceverify-email-verifier",
      build: "0.1.16",
      fields: CHECKER_FIELDS,
      buildInput(emails) {
        return { emails, skipInvalidSyntax: true };
      },
      mapItem(item) {
        // The checker's item: `status` with `is_catch_all` (read from the calibration's 141 items, Appendix B).
        const o = obj(item);
        const email = str(o?.email)?.toLowerCase() ?? null;
        if (!o || !email) return null;
        const status = (str(o.status) ?? "").toLowerCase();
        const state = o.is_catch_all === true || status === "risky" ? "catch_all" : status === "valid" ? "ok" : status === "invalid" ? "invalid" : "unknown";
        return { email, state };
      },
    },
  },
};
