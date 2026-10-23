/**
 * A people search's plan as the route and the door take it (the people card, 00430), apart from people-plan.ts's words.
 * zod is not built into the browser's contracts (decision 0024): a page that says the plan loads none of it.
 */
import { z } from "zod";
import { US_CODES } from "./plan";
import { words } from "./plan-schema";
import {
  PEOPLE_CARD,
  PEOPLE_COMPANY_SIZES,
  PEOPLE_COUNT_MAX,
  PEOPLE_ASKED_CHARS,
  PEOPLE_FIND_WORDS,
  PEOPLE_INDUSTRIES_MAX,
  PEOPLE_KEYWORDS_MAX,
  PEOPLE_KEYWORD_CHARS,
  PEOPLE_SENIORITIES,
  PEOPLE_STATES_MAX,
  PEOPLE_TITLES_MAX,
  PEOPLE_TITLE_CHARS,
  type LeadPeoplePlan,
} from "./people-plan";
import { peopleIndustriesNear, peopleIndustryOf } from "./people-industries";

/**
 * An industry as the directory names it: one typed in any case, or with "and" for "&", is spelled its way; one it does
 * not list is refused in the sheet's words with the nearest of its own, which the Find people sheet shows under its box
 * (the route's `fields`).
 */
const industry = z.string().transform((typed, ctx) => {
  const name = peopleIndustryOf(typed);
  if (name) return name;
  ctx.addIssue({
    code: "custom",
    message: PEOPLE_FIND_WORDS.industryUnread(typed.trim(), peopleIndustriesNear(typed)),
  });
  return z.NEVER;
});

/** The plan, checked here and again by lead_people_search_create. */
export const LeadPeoplePlanSchema: z.ZodType<LeadPeoplePlan> = z.object({
  version: z.literal(1),
  card: z.literal(PEOPLE_CARD),
  name: words(2, 80),
  asked: words(1, PEOPLE_ASKED_CHARS),
  count: z.number().int().min(1).max(PEOPLE_COUNT_MAX),
  titles: z.array(words(2, PEOPLE_TITLE_CHARS)).min(1).max(PEOPLE_TITLES_MAX),
  seniority: z.array(z.enum(PEOPLE_SENIORITIES)).max(PEOPLE_SENIORITIES.length),
  // The directory's own names alone: it refuses a run naming any other.
  industries: z.array(industry).max(PEOPLE_INDUSTRIES_MAX),
  // The words the companies' sites use (people-plan.ts): none on a plan made before them.
  keywords: z.array(words(2, PEOPLE_KEYWORD_CHARS)).max(PEOPLE_KEYWORDS_MAX).optional(),
  sizes: z.array(z.enum(PEOPLE_COMPANY_SIZES)).max(PEOPLE_COMPANY_SIZES.length),
  states: z
    .array(
      z
        .string()
        .transform((s) => s.trim().toUpperCase())
        .refine((s) => US_CODES.has(s), "a US state's two letters"),
    )
    .max(PEOPLE_STATES_MAX),
  contact: z.literal("email"),
  // Made by peoplePlanFrom: no phrases, and the states as an area every page reads.
  terms: z.tuple([]),
  criteria: z.tuple([]),
  exclusions: z.tuple([]),
  area: z.object({
    kind: z.literal("city"),
    label: words(2, 400),
    state: z.string().max(2),
    center: z.null(),
    radius_m: z.number().int().min(0).max(0),
    query: words(2, 420),
  }),
  // Started from an idea (decision 0070): kept with the plan, as a places plan's `from` is.
  from: z.literal("idea").optional(),
});

/** POST /api/v1/lead-searches/people: the plan, where it was made, and the Ask thread it was planned in. */
export const LeadPeopleSearchSchema = z.object({
  plan: LeadPeoplePlanSchema,
  via: z.enum(["people", "ask"]),
  thread_id: z.uuid().nullable().optional(),
});
export type LeadPeopleSearchInput = z.infer<typeof LeadPeopleSearchSchema>;
