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
 *
 * The people card (00430, the workbench's call 8) asks a B2B contact database
 * for people by title, seniority, industry, company size and state, and maps
 * each item to a person at a company (PersonAtCompany): their name, title,
 * seniority, work address and profile link, and their company's name, domain,
 * industry, size and place. Its items are read as its provider writes them at
 * the pinned build, which its calibration run read (14 Oct 2026: 81 people,
 * every filter held); an item with no company key or no name does not read.
 * Both cards share the one mailbox checker.
 */
import type { LeadEmailState, LeadPeoplePlan, LeadSearchPlan } from "@chanlytics/contracts";
import { zctaCenter } from "./geo";
import {
  finiteOrNull,
  isFreeMail,
  recordOrNull,
  trimmedOrNull,
  usStateCode,
  usStateName,
  websiteHostOf,
} from "@chanlytics/contracts";

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

/** The mailbox checker every card shares: an address in, its state out. */
export interface LeadCheckerRunner {
  actor: string;
  build: string;
  buildInput(emails: string[]): unknown;
  mapItem(item: unknown): { email: string; state: Exclude<LeadEmailState, "none" | "checking"> } | null;
  fields: readonly string[];
}

export interface LeadCardRunner {
  actor: string;
  build: string;
  buildInput(plan: LeadSearchPlan, term: string, places: number): unknown;
  mapItem(item: unknown): MapsPlace | null;
  fields: readonly string[];
  checker: LeadCheckerRunner;
}

/** One person a people run's item names, at their company (00430): what a company lead is made of. */
export interface PersonAtCompany {
  company: {
    /** Its domain, lower case: the lead's source_key. */
    key: string;
    name: string;
    industry: string | null;
    city: string | null;
    /** A US state's two letters, or null. */
    region: string | null;
    /** A country's two letters; the card searches the US. */
    country: string;
    linkedin: string | null;
    /** Its size as the provider's ranges say it ("11 - 50"). */
    size: string | null;
    about: string | null;
  };
  person: {
    name: string;
    first_name: string | null;
    title: string | null;
    /** The provider's seniority word (owner, c_suite, manager…), which contracts leadRoleOf reads. */
    seniority: string | null;
    /** Their work address, lower case; never a free mail one. */
    email: string | null;
    profile_url: string | null;
  };
}

interface PeopleCardRunner {
  actor: string;
  build: string;
  /** The provider's input for a plan and how many people to ask for (twice the count: two found make a lead). */
  buildInput(plan: LeadPeoplePlan, people: number): unknown;
  mapItem(item: unknown): PersonAtCompany | null;
  fields: readonly string[];
  checker: LeadCheckerRunner;
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(trimmedOrNull).filter((s): s is string => !!s) : []);

/** The circle a ZIP or radius ask searches: the plan's center, else the ZIP table's. Null for a city ask. */
export function areaCenter(plan: LeadSearchPlan): { lat: number; lng: number } | null {
  if (plan.area.center) return plan.area.center;
  if (plan.area.kind === "zip" && plan.area.zip) return zctaCenter(plan.area.zip);
  return null;
}

/** The one mailbox checker (Appendix B): every card's addresses are checked by it before anyone is written to. */
const CHECKER: LeadCheckerRunner = {
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
};

/**
 * The people card's item fields, as its provider writes them at the pinned build (its calibration run's items). The
 * person's own place, phone and skills, and the company's money, address and phone, are never asked for. `email` is
 * sometimes the provider's guess at the company's pattern (`emailPatternGuess` beside it says so: 36 of the 81): the
 * mailbox check decides either way, so the guess is not read.
 */
const PEOPLE_FIELDS = [
  "firstName",
  "lastName",
  "title",
  "seniority",
  "email",
  "linkedinUrl",
  "organizationName",
  "organizationWebsite",
  "organizationIndustry",
  "organizationEmployeeRange",
  "organizationSize",
  "organizationLinkedinUrl",
  "organizationCity",
  "organizationState",
  "organizationCountry",
  "organizationDescription",
] as const;

/** A people run may hold the provider this long before the sweep aborts it: about a thousand people in ten minutes. */
export const PEOPLE_RUN_TIMEOUT_SECS = 30 * 60;
/** The least a people run's cap is: the provider's start and a page of people. */
export const PEOPLE_CAP_FLOOR_USD = 0.5;
/**
 * The fewest people the provider takes a run for: it refuses `maxResults` under 100 (its calibration, 14 Oct 2026). A
 * round that wants fewer asks for this many, and keeps every company they name: each was paid for, and the check counts
 * only as many as the plan asked against the month (lead_check_commit's room). At $0.002 a person the 100 cost $0.21
 * with the start, under the cap's floor and inside the floors every people estimate already holds.
 */
const PEOPLE_PROVIDER_LEAST = 100;

/** A country's two letters from what a database writes ("United States", "USA", "us"); null for one it cannot read. */
function countryOf(raw: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^(us|usa|u\.s\.a?\.?|united states( of america)?)$/i.test(s)) return "US";
  return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : null;
}

/** A size in the provider's ranges, from a range it wrote or from a head count. */
function sizeOf(raw: unknown): string | null {
  const n = finiteOrNull(raw);
  if (n === null) return trimmedOrNull(raw)?.slice(0, 20) ?? null;
  const bands: [number, string][] = [
    [10, "1 - 10"],
    [50, "11 - 50"],
    [200, "51 - 200"],
    [500, "201 - 500"],
    [1000, "501 - 1000"],
    [5000, "1001 - 5000"],
    [10000, "5001 - 10000"],
  ];
  return bands.find(([max]) => n <= max)?.[1] ?? "10001+";
}

/**
 * An address a mail server takes as it is: printable ASCII, one @, a dotted domain. One with a letter outside ASCII in
 * it (the calibration's "málvarez@…") needs a server that speaks SMTPUTF8, and is never sent to.
 */
const EMAIL_SHAPE = /^[!-?A-~]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** A person's work address, or null: a well-formed one only, and never a free mailbox, which is no company's door. */
function workEmailOf(raw: unknown): string | null {
  const e = trimmedOrNull(raw)?.toLowerCase() ?? null;
  return e && EMAIL_SHAPE.test(e) && !isFreeMail(e.slice(e.lastIndexOf("@") + 1)) ? e : null;
}

/** A capped line of a company's own words, with no control or format characters in it. */
const wordsOf = (v: unknown, max: number): string | null =>
  trimmedOrNull(v)
    ?.replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .trim()
    .slice(0, max) || null;

/**
 * The company an item of the people card names: its name and its domain (the lead's key), or nothing. The card searches
 * the US (its rights note says so): a company elsewhere is not read, whatever the person's filter let by (the
 * calibration's one company in India, its person in Texas). Its place is the company's own, never its person's: a
 * Texan's company may stand in New York, and one with no state said has none.
 */
function companyOf(o: Record<string, unknown>): PersonAtCompany["company"] | null {
  const name = wordsOf(o.organizationName, 120);
  const key = websiteHostOf(trimmedOrNull(o.organizationWebsite));
  // None said is the card's own country; one said that reads as none is not the US.
  const where = trimmedOrNull(o.organizationCountry);
  const country = where === null ? "US" : countryOf(where);
  if (!name || !key || country !== "US") return null;
  return {
    key,
    name,
    industry: wordsOf(o.organizationIndustry, 120),
    city: wordsOf(o.organizationCity, 120),
    region: usStateCode(trimmedOrNull(o.organizationState)),
    country,
    linkedin: trimmedOrNull(o.organizationLinkedinUrl)?.slice(0, 300) ?? null,
    // The range it writes ("11 - 50"), else its head count put in a range.
    size: sizeOf(trimmedOrNull(o.organizationEmployeeRange) ?? o.organizationSize ?? null),
    about: wordsOf(o.organizationDescription, 600),
  };
}

/**
 * The person an item of the people card names: a name, or nothing; their work address where they have one. The
 * provider's first item is a note to read its log, in `firstName`: with no company it never reads.
 */
function personOf(o: Record<string, unknown>): PersonAtCompany["person"] | null {
  const first = wordsOf(o.firstName, 60);
  const name = [first, wordsOf(o.lastName, 60)].filter(Boolean).join(" ").slice(0, 120);
  if (!name) return null;
  return {
    name,
    first_name: first,
    title: wordsOf(o.title, 120),
    seniority: trimmedOrNull(o.seniority)?.toLowerCase().slice(0, 20) ?? null,
    email: workEmailOf(o.email),
    profile_url: trimmedOrNull(o.linkedinUrl)?.slice(0, 300) ?? null,
  };
}

/** The people card's runner (00430): a B2B contact database on Apify, asked by the plan's own filters. */
const PEOPLE_CARD: PeopleCardRunner = {
  actor: "olympus/b2b-leads-finder",
  // The build its calibration run read (14 Oct 2026; contracts LEAD_CARDS' `calibrated`). A new one is calibrated again
  // before it is pinned: collectPeople stops a run whose first items it reads none of.
  build: "0.0.259",
  fields: PEOPLE_FIELDS,
  buildInput(plan, people) {
    const states = plan.states.map(usStateName).filter((s): s is string => !!s);
    return {
      maxResults: Math.max(PEOPLE_PROVIDER_LEAST, people),
      personTitle: plan.titles,
      // An intern is never written to cold.
      excludeSeniority: ["intern"],
      ...(plan.seniority.length ? { seniority: plan.seniority } : {}),
      ...(plan.industries.length ? { industry: plan.industries } : {}),
      ...(plan.sizes.length ? { companyEmployeeSize: plan.sizes } : {}),
      personCountry: ["United States"],
      ...(states.length ? { personState: states } : {}),
    };
  },
  mapItem(item) {
    const o = recordOrNull(item);
    const company = o ? companyOf(o) : null;
    const person = o ? personOf(o) : null;
    return company && person ? { company, person } : null;
  },
  checker: CHECKER,
};

export const CARDS: { local_businesses: LeadCardRunner; people_at_companies: PeopleCardRunner } = {
  people_at_companies: PEOPLE_CARD,
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
    checker: CHECKER,
  },
};

/** The actors a round's runs start with: its card's own, and the one checker (the sweep's reconciliation reads them). */
export function actorsOf(plan: { card: string }): { discover: string; check: string } {
  const c = plan.card === "people_at_companies" ? CARDS.people_at_companies : CARDS.local_businesses;
  return { discover: c.actor, check: c.checker.actor };
}
