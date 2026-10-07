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
import { finiteOrNull, trimmedOrNull, recordOrNull } from "@chanlytics/contracts";

/** The Maps item fields a lead is built from. Nothing else is asked for. */
export const MAPS_FIELDS = [
  "title",
  "categoryName",
  "neighborhood",
  "street",
  "city",
  "state",
  "postalCode",
  "countryCode",
  "phoneUnformatted",
  "phone",
  "phones",
  "website",
  "domain",
  "emails",
  "instagrams",
  "placeId",
  "totalScore",
  "reviewsCount",
  "permanentlyClosed",
  "temporarilyClosed",
  "location",
  // What the listing shows about the business itself (D2): its own words, hours, a photo, the spread of its
  // reviews, price, the socials beside Instagram, whether the owner claimed the listing, its rank for the term
  // and its Maps page. All in the item the run already returns; nothing more is asked of the provider. None of
  // it reaches the judge (JUDGE_FACT_KEYS is the judge's whole world); it is kept for the owner to read.
  "description",
  "ownerDescription",
  "openingHours",
  "imageUrl",
  "reviewsDistribution",
  "price",
  "facebooks",
  "linkedIns",
  "tiktoks",
  "claimThisBusiness",
  "rank",
  "url",
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
  /** The listing's own line about the business: Google's, else the owner's; capped like every fact. For the owner, never the judge. */
  about: string | null;
  hours: { day: string; hours: string }[];
  imageUrl: string | null;
  reviewsDist: { one: number; two: number; three: number; four: number; five: number } | null;
  price: string | null;
  facebook: string | null;
  linkedin: string | null;
  tiktok: string | null;
  /** true: the owner claimed the listing; false: "claim this business" is showing; null: the item did not say. */
  claimed: boolean | null;
  rank: number | null;
  mapsUrl: string | null;
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

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(trimmedOrNull).filter((s): s is string => !!s) : []);

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
          ? {
              customGeolocation: {
                type: "Point",
                coordinates: [center.lng, center.lat],
                radiusKm: Math.max(1, Math.round(plan.area.radius_m / 100) / 10),
              },
            }
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
      const o = recordOrNull(item);
      const title = trimmedOrNull(o?.title);
      const placeId = trimmedOrNull(o?.placeId);
      if (!o || !title || !placeId) return null;
      const loc = recordOrNull(o.location);
      const lat = finiteOrNull(loc?.lat);
      const lng = finiteOrNull(loc?.lng);
      return {
        placeId,
        title: title.slice(0, 120),
        category: trimmedOrNull(o.categoryName),
        neighborhood: trimmedOrNull(o.neighborhood),
        street: trimmedOrNull(o.street),
        city: trimmedOrNull(o.city),
        state: trimmedOrNull(o.state),
        postalCode: trimmedOrNull(o.postalCode),
        countryCode: trimmedOrNull(o.countryCode),
        phoneRaw: trimmedOrNull(o.phoneUnformatted) ?? trimmedOrNull(o.phone),
        sitePhones: strs(o.phones),
        website: trimmedOrNull(o.website),
        emails: strs(o.emails),
        // Only the first: the business's own account; later ones can be staff members' (Appendix B).
        instagram: strs(o.instagrams)[0] ?? null,
        rating: finiteOrNull(o.totalScore),
        reviews: finiteOrNull(o.reviewsCount),
        closed: o.permanentlyClosed === true || o.temporarilyClosed === true,
        location: lat !== null && lng !== null ? { lat, lng } : null,
        about:
          (trimmedOrNull(o.description) ?? trimmedOrNull(o.ownerDescription))
            ?.replace(/[\p{Cc}\p{Cf}]/gu, "")
            .slice(0, 600) ?? null,
        hours: (Array.isArray(o.openingHours) ? o.openingHours : [])
          .map((h) => ({
            day: trimmedOrNull(recordOrNull(h)?.day) ?? "",
            hours: trimmedOrNull(recordOrNull(h)?.hours) ?? "",
          }))
          .filter((h) => h.day && h.hours)
          .slice(0, 7),
        imageUrl: trimmedOrNull(o.imageUrl),
        reviewsDist: (() => {
          const d = recordOrNull(o.reviewsDistribution);
          if (!d) return null;
          const n = (k: string) => finiteOrNull(d[k]) ?? 0;
          return {
            one: n("oneStar"),
            two: n("twoStar"),
            three: n("threeStar"),
            four: n("fourStar"),
            five: n("fiveStar"),
          };
        })(),
        price: trimmedOrNull(o.price)?.slice(0, 8) ?? null,
        facebook: strs(o.facebooks)[0] ?? null,
        linkedin: strs(o.linkedIns)[0] ?? null,
        tiktok: strs(o.tiktoks)[0] ?? null,
        claimed: o.claimThisBusiness === true ? false : o.claimThisBusiness === false ? true : null,
        rank: finiteOrNull(o.rank),
        mapsUrl: trimmedOrNull(o.url),
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
        const o = recordOrNull(item);
        const email = trimmedOrNull(o?.email)?.toLowerCase() ?? null;
        if (!o || !email) return null;
        const status = (trimmedOrNull(o.status) ?? "").toLowerCase();
        const state =
          o.is_catch_all === true || status === "risky"
            ? "catch_all"
            : status === "valid"
              ? "ok"
              : status === "invalid"
                ? "invalid"
                : "unknown";
        return { email, state };
      },
    },
  },
};
