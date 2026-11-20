/**
 * What the ad writer is handed and answers (the dashboard's server/ask/skills/ad/skill.ts; the Ads plan's 6.7): the
 * business, the service the ad offers, the facts the owner stands behind for an ad, what the picture shows, the area,
 * the language, and Meta's lengths for the places the ad shows. One builder for every caller (New ad's route, AI's own
 * turn, the skill's eval), so the eval judges the question the product asks.
 *
 * Three jobs, one answer. `write` answers three versions of the words. `rewrite` answers one, for a version Meta
 * turned down, from Meta's own words. `change` answers one change from a closed list (the plan's G8), read by
 * adChangeOf: never free text. The writer never decides the amount, the area, the dates or whether a check passed:
 * those are rules in code (contracts ads/draft.ts and ./checks.ts).
 */
import { z } from "zod";
import { fenced } from "../../../ai/fence";
import type { AppointmentWord } from "../../../journey/appointment-word";
import { isDayKey } from "../../../shared/zone/day-keys";

/** How many versions of its words an ad made here has: each is its own ad at Meta, under one total. */
export const AD_VERSIONS = 3;

/** Where an ad made here shows. Instagram only where the Page's Instagram account is known. */
export const AD_PLACES = ["facebook", "instagram"] as const;
export type AdPlace = (typeof AD_PLACES)[number];

/**
 * What reads whole in each place, in characters (Meta's Ads Guide, read 19 November 2026). Meta refuses neither a
 * longer text nor a longer headline: it cuts them, so these are what Chanlytics holds its own words to.
 */
const AD_PLACE_LENGTHS: Record<AdPlace, { text: number; headline: number }> = {
  facebook: { text: 125, headline: 27 },
  instagram: { text: 125, headline: 40 },
};

/** The lengths an ad's words are held to: the least of each over the places it shows. */
export function adLengths(places: readonly AdPlace[]): { text: number; headline: number } {
  const shown = places.length > 0 ? places : AD_PLACES;
  return {
    text: Math.min(...shown.map((place) => AD_PLACE_LENGTHS[place].text)),
    headline: Math.min(...shown.map((place) => AD_PLACE_LENGTHS[place].headline)),
  };
}

/** One version of an ad's words: the text above the picture and the headline under it. */
export interface AdVersion {
  text: string;
  headline: string;
}

export const AD_JOBS = ["write", "rewrite", "change"] as const;
export type AdJob = (typeof AD_JOBS)[number];

export interface AdBrief {
  job: AdJob;
  business: {
    name: string;
    /** Its tone line (Settings › How it answers), or null with none. */
    tone: string | null;
    /** What it calls a booking (contracts appointmentWordOf). */
    word: AppointmentWord;
    /** While true AI never quotes a price, and so no ad of the business says one (decision 0050, call 7). */
    neverPrices: boolean;
  };
  /** The service the ad offers, as Services says it; its price line is the business's own words, or null with none. */
  service: { name: string; price: string | null };
  /** What the owner stands behind for an ad, a sentence each: the ad may say these and nothing more. */
  facts: readonly string[];
  /** What the picture shows, in a line; null where nothing is noted. Context, never a claim to add. */
  picture: string | null;
  /** Where it is shown: the place's name where known, and the miles around the business. */
  area: { place: string | null; miles: number };
  language: "en" | "es";
  places: readonly AdPlace[];
  /** `rewrite`: the version Meta turned down, and Meta's own words for why. */
  refused?: { version: AdVersion; words: string } | undefined;
  /** `change`: the draft as it stands, what the owner asked, and what a change may pick from. */
  change?:
    | {
        versions: readonly AdVersion[];
        /** The owner's own words to AI. */
        asked: string;
        /** The other services an ad could offer, by name. */
        services: readonly string[];
        /** Today in the business's zone, and the day the draft ends: a new end is a later day. */
        today: string;
        ends: string;
      }
    | undefined;
}

/** The most of an owner's words, and of Meta's, a brief carries. */
const AD_WORDS_MAX = 1_200;
const LANGUAGE_WORDS: Record<AdBrief["language"], string> = { en: "English", es: "Spanish" };

const versionLines = (versions: readonly AdVersion[]): string =>
  versions
    .map((version, nth) => `Version ${nth + 1}\nHeadline: ${version.headline}\nText: ${version.text}`)
    .join("\n\n");

/** What the writer is asked to do, by job: the last block of its question. */
function jobLines(adBrief: AdBrief): string[] {
  if (adBrief.job === "rewrite" && adBrief.refused)
    return [
      `Meta turned this version down:\n${fenced("record", versionLines([adBrief.refused.version]))}`,
      `Meta's own words for why:\n${fenced("record", adBrief.refused.words.trim().slice(0, AD_WORDS_MAX))}`,
      "Write that one version again so Meta's reason no longer holds, from the same facts. Answer one version, and change kind none.",
    ];
  if (adBrief.job === "change" && adBrief.change)
    return [
      `The draft as it stands:\n${fenced("record", versionLines(adBrief.change.versions))}`,
      `It ends on ${adBrief.change.ends}. Today is ${adBrief.change.today}.`,
      ...(adBrief.change.services.length
        ? [`The other services it could offer: ${adBrief.change.services.join(", ")}.`]
        : []),
      `What the owner asked, in their own words:\n${fenced("record", adBrief.change.asked.trim().slice(0, AD_WORDS_MAX))}`,
      "Answer the one change they asked for, by its kind. For the words, answer all three versions again and leave the rest empty. For anything else, answer no versions. Where what they ask is none of the kinds, answer kind none and say why in could_not, in one short sentence for the owner.",
    ];
  return [
    `Write ${AD_VERSIONS} versions: three angles on the same facts, each a text and a headline. Answer change kind none.`,
    "Answer label: the service in a few words, at most 40 characters, as the business would name it to a customer, in the ad's language. It names the ad to its owner and is never shown in it.",
  ];
}

/**
 * The writer's question: the business, the service and the facts (fenced: they are the owner's words, and the only
 * things the ad may claim), the picture, the area, the language and the lengths, then the job.
 */
export function adBriefText(adBrief: AdBrief): string {
  const { business, service, area } = adBrief;
  const lengths = adLengths(adBrief.places);
  const spanish = adBrief.language === "es";
  return [
    [
      `The business: ${business.name}.`,
      business.tone ? `Its tone, in its own words: ${business.tone}` : "It has no tone line.",
      `It calls a booking: ${business.word}${spanish ? " (say it in Spanish)" : ""}.`,
    ].join("\n"),
    [
      `The service the ad offers: ${service.name}.`,
      business.neverPrices
        ? "No price may be said: this business never quotes prices."
        : service.price
          ? `Its price, in the business's own words: ${service.price}`
          : "It has no price to say.",
      adBrief.facts.length
        ? `What the owner stands behind for an ad, and all the ad may claim:\n${fenced("record", adBrief.facts.map((fact) => `- ${fact}`).join("\n"))}`
        : "The owner has given no facts for an ad: say what the service is and how to ask, and claim nothing.",
      ...(adBrief.picture ? [`The picture shows: ${adBrief.picture}`] : []),
    ].join("\n"),
    [
      `It is shown to adults within ${area.miles} miles${area.place ? ` of ${area.place}` : ""}, on ${adBrief.places.join(" and ") || "facebook"}.`,
      `Write in ${LANGUAGE_WORDS[adBrief.language]}.`,
      `A text is at most ${lengths.text} characters, with its point in its first 40. A headline is at most ${lengths.headline}.`,
      "A tap opens a WhatsApp chat with the business: that is the one thing the ad asks for.",
    ].join("\n"),
    ...jobLines(adBrief),
  ].join("\n\n");
}

/** What a change may be (the plan's G8), and none where the owner asked for none of them. */
export const AD_CHANGE_KINDS = ["none", "words", "service", "picture", "area", "amount", "end"] as const;

/** The writer's answer, for the API's structured output: every field, an empty one where the job has none. */
export const AD_CRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["versions", "change", "could_not", "label"],
  properties: {
    versions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "headline"],
        properties: { text: { type: "string" }, headline: { type: "string" } },
      },
    },
    change: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "service", "miles", "amount", "end"],
      properties: {
        kind: { type: "string", enum: AD_CHANGE_KINDS },
        service: { type: "string" },
        miles: { type: "number" },
        amount: { type: "number" },
        end: { type: "string" },
      },
    },
    could_not: { type: "string" },
    label: { type: "string" },
  },
} as const;

export const AdCraftAnswerSchema = z.object({
  versions: z.array(z.object({ text: z.string(), headline: z.string() })),
  change: z.object({
    kind: z.enum(AD_CHANGE_KINDS),
    service: z.string(),
    miles: z.number(),
    amount: z.number(),
    end: z.string(),
  }),
  could_not: z.string(),
  /** The service in a few words, for the owner's own screen: written with a draft's words; empty for the other jobs. */
  label: z.string().default(""),
});
export type AdCraftAnswer = z.infer<typeof AdCraftAnswerSchema>;

/** Words as a draft keeps them: one line, single spaces, the ends trimmed. An ad's text has no line breaks. */
const adClean = (words: string): string => words.replace(/\s+/g, " ").trim();

/** The versions the writer wrote, each cleaned, and what it says it left out. */
export function adVersionsOf(adCraftAnswer: AdCraftAnswer): { versions: AdVersion[]; couldNot: string | null } {
  return {
    versions: adCraftAnswer.versions.map((version) => ({
      text: adClean(version.text),
      headline: adClean(version.headline),
    })),
    couldNot: adClean(adCraftAnswer.could_not) || null,
  };
}

/** One change to a draft, as code takes it: only what its kind names, each already inside what a draft may hold. */
export type AdChange =
  | { kind: "words"; versions: AdVersion[] }
  | { kind: "service"; service: string }
  | { kind: "picture" }
  | { kind: "area"; miles: number }
  /** A whole number of the account's currency: what the rules in code then hold to Meta's least and the owner's most. */
  | { kind: "amount"; units: number }
  | { kind: "end"; day: string };

/** The fewest and the most miles a draft offers (Meta takes 0.63 to 50; a draft says whole miles). */
const DRAFT_MILES = { least: 1, most: 50 } as const;

/**
 * The change a `change` answer names, or null where it names none that a draft may take: a service not on the list, an
 * area outside the miles, an amount that is no whole number above zero, an end that is no later day. Its words are
 * still the checks' to pass (./checks.ts).
 */
export function adChangeOf(adCraftAnswer: AdCraftAnswer, adBrief: AdBrief): AdChange | null {
  const { change } = adCraftAnswer;
  const context = adBrief.change;
  if (!context) return null;
  if (change.kind === "words") {
    const { versions } = adVersionsOf(adCraftAnswer);
    return versions.length === AD_VERSIONS ? { kind: "words", versions } : null;
  }
  if (change.kind === "service") {
    const named = context.services.find((service) => service.toLowerCase() === change.service.trim().toLowerCase());
    return named ? { kind: "service", service: named } : null;
  }
  if (change.kind === "picture") return { kind: "picture" };
  if (change.kind === "area") {
    const miles = Math.round(change.miles);
    return miles >= DRAFT_MILES.least && miles <= DRAFT_MILES.most ? { kind: "area", miles } : null;
  }
  if (change.kind === "amount")
    return Number.isSafeInteger(change.amount) && change.amount > 0 ? { kind: "amount", units: change.amount } : null;
  if (change.kind === "end") {
    const day = change.end.trim();
    return isDayKey(day) && day > context.today ? { kind: "end", day } : null;
  }
  return null;
}
