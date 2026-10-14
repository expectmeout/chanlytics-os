/**
 * A people search's plan as the route and the door take it (the people card, 00429), apart from people-plan.ts's words.
 * zod is not built into the browser's contracts (decision 0024): a page that says the plan loads none of it.
 */
import { z } from "zod";
import { stripUnsafe, US_CODES } from "./plan";
import {
  PEOPLE_CARD,
  PEOPLE_COMPANY_SIZES,
  PEOPLE_COUNT_MAX,
  PEOPLE_INDUSTRIES_MAX,
  PEOPLE_SENIORITIES,
  PEOPLE_STATES_MAX,
  PEOPLE_TITLES_MAX,
  type LeadPeoplePlan,
} from "./people-plan";

const words = (min: number, max: number) =>
  z
    .string()
    .transform((s) => stripUnsafe(s).trim())
    .pipe(z.string().min(min).max(max));

/** The plan, checked here and again by lead_people_search_create. */
export const LeadPeoplePlanSchema: z.ZodType<LeadPeoplePlan> = z.object({
  version: z.literal(1),
  card: z.literal(PEOPLE_CARD),
  name: words(2, 80),
  asked: words(1, 400),
  count: z.number().int().min(1).max(PEOPLE_COUNT_MAX),
  titles: z.array(words(2, 60)).min(1).max(PEOPLE_TITLES_MAX),
  seniority: z.array(z.enum(PEOPLE_SENIORITIES)).max(PEOPLE_SENIORITIES.length),
  industries: z.array(words(2, 80)).max(PEOPLE_INDUSTRIES_MAX),
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
  area: z.object({
    kind: z.literal("city"),
    label: words(2, 400),
    state: z.string().max(2),
    center: z.null(),
    radius_m: z.number().int().min(0).max(0),
    query: words(2, 420),
  }),
});

/** POST /api/v1/lead-searches/people: the plan, where it was made, and the Ask thread it was planned in. */
export const LeadPeopleSearchSchema = z.object({
  plan: LeadPeoplePlanSchema,
  via: z.enum(["people", "ask"]),
  thread_id: z.string().uuid().nullable().optional(),
});
export type LeadPeopleSearchInput = z.infer<typeof LeadPeopleSearchSchema>;
