/**
 * What the ad writer is handed, built in one place for every caller (the Ads plan's 6.7, "Who calls the writer"): New
 * ad's route, a turn of AI's, and the skill's test set (tooling/scripts/evals/ad.mjs), so the tests judge the question
 * the product asks. Pure: a caller reads the business and the offer however it does, and this makes the brief.
 *
 * What it holds a brief to, whoever calls:
 *
 *  - A price is said only where the business quotes prices and the ad was not asked to leave it out. A business that
 *    never quotes one hands the writer no price line at all (decision 0050, call 7).
 *  - The facts are the owner's own, a sentence each, cut to what a brief carries. Until Content says what an owner
 *    stands behind for an ad (its step L4; the plan's 6.8), a caller hands what Services itself says of the service
 *    (adServiceFacts) and nothing else.
 *  - The miles are whole, inside what a draft offers.
 */
import { adCraftIssues } from "@chanlytics/contracts";
import type { AdBrief, AdIssue, AdPlace, AdVersion, AppointmentWord } from "@chanlytics/contracts";

/** The business an ad is written for, as its settings say it. */
export interface AdBusinessFacts {
  name: string;
  /** Its tone line (Settings › How it answers); null with none. */
  tone: string | null;
  /** What it calls a booking. */
  word: AppointmentWord;
  /** Whether AI is set to never quote a price. */
  neverPrices: boolean;
  language: AdBrief["language"];
}

/** What one ad offers, shows and reaches. */
export interface AdOfferFacts {
  service: { name: string; price: string | null };
  /** What the owner stands behind for an ad, a sentence each. */
  facts: readonly string[];
  /** What the picture shows, in a line; null where nothing is noted. */
  picture: string | null;
  area: { place: string | null; miles: number };
  places: readonly AdPlace[];
  /** The owner asked for the price to be left out of this ad. */
  noPrice?: boolean | undefined;
}

/** The job, with what only that job is handed. */
export type AdAsk =
  | { job: "write" }
  | { job: "rewrite"; refused: { version: AdVersion; words: string } }
  | {
      job: "change";
      change: {
        versions: readonly AdVersion[];
        asked: string;
        services: readonly string[];
        today: string;
        ends: string;
      };
    };

/** The most facts a brief carries, and the most of one. */
const AD_FACTS = { most: 8, chars: 240 } as const;
/** The fewest and the most miles a brief says: what a draft offers. */
const AD_BRIEF_MILES = { least: 1, most: 50 } as const;

const oneLine = (words: string): string => words.replace(/\s+/g, " ").trim();

/** What Services itself says of a service, as facts an ad may lean on: how long it takes, where it says. */
export function adServiceFacts(service: { name: string; minutes: number | null }): string[] {
  return service.minutes !== null && service.minutes > 0 ? [`${service.name} takes ${service.minutes} minutes.`] : [];
}

/** The ad writer's brief: the business, the offer and the job, held to what a brief may carry. */
export function adBriefOf(business: AdBusinessFacts, offer: AdOfferFacts, ask: AdAsk): AdBrief {
  const priced = !business.neverPrices && offer.noPrice !== true;
  const price = priced ? oneLine(offer.service.price ?? "") : "";
  const miles = Math.min(AD_BRIEF_MILES.most, Math.max(AD_BRIEF_MILES.least, Math.round(offer.area.miles)));
  return {
    job: ask.job,
    business: {
      name: oneLine(business.name),
      tone: business.tone ? oneLine(business.tone) || null : null,
      word: business.word,
      // A price left out for this ad alone is told as a business that says none: the writer's rule is the same.
      neverPrices: business.neverPrices || offer.noPrice === true,
    },
    service: { name: oneLine(offer.service.name), price: price || null },
    facts: offer.facts
      .map((fact) => oneLine(fact).slice(0, AD_FACTS.chars))
      .filter(Boolean)
      .slice(0, AD_FACTS.most),
    picture: offer.picture ? oneLine(offer.picture) || null : null,
    area: { place: offer.area.place ? oneLine(offer.area.place) || null : null, miles },
    language: business.language,
    places: offer.places,
    ...(ask.job === "rewrite" ? { refused: ask.refused } : {}),
    ...(ask.job === "change" ? { change: ask.change } : {}),
  };
}

/**
 * What stops an ad's words from being shown or turned on, against the brief they were written from (contracts
 * adCraftIssues, the plan's 5.1). An ad that reads as one of Meta's special kinds is not a fault of the words to
 * write around: it is a question for the owner (the plan's G7), which the draft itself asks.
 */
export function adWordIssues(versions: readonly AdVersion[], adBrief: AdBrief): AdIssue[] {
  return adCraftIssues(versions, adBrief).filter((issue) => issue.code !== "special_kind");
}
