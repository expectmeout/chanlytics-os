/**
 * The lead finder: the plan, the sets, the caps, and every rule with a right
 * answer (PRD 2026-09-17 v3 §0, §7.2, §10, §12, §13.3; release A1).
 *
 * Pure. The dashboard's routes, the edge's jobs and, later, the page read this
 * file. The model proposes a plan in these shapes and judges places criterion
 * by criterion (lead-judge.ts); everything decidable is decided here, by code:
 * what a junk address is, which class a place gets from the judge's answers
 * (§0.1), how many places a round asks for (S6), when the search stops to ask
 * (P4), which of the nine endings a round gets (S7), what a round is likely
 * to cost. No word here names the vendor that runs the searches: the owner
 * sees Claude finding businesses, and where each fact came from.
 *
 * This module holds the plan itself: its shape, the schema the route and the door check it with, the states an
 * area may name, and a changed plan's version. The rest is beside it: sets.ts, caps.ts, sentence.ts (the plan in
 * words), cards.ts (the card, and what a round asks for, costs and takes), endings.ts, class.ts, question.ts (the
 * question after the probe) and clean.ts (what code keeps of a listing).
 */
import { z } from "zod";
import { LEAD_MAX_PLACES } from "./caps";

/* ------------------------------------------------------------ the plan -- */

export type LeadContactStandard = "phone" | "email";
/** likely: Claude's read is enough. seen: a fact the card can show, cited by key (§0.1, 26). */
export type LeadCriterionStandard = "likely" | "seen";
export interface LeadCriterion {
  key: string;
  text: string;
  standard: LeadCriterionStandard;
  required: boolean;
}
/** A "Leaving out" chip. The judge answers it as a required criterion: `fail` means the place is what is left out. */
export interface LeadExclusion {
  key: string;
  text: string;
  origin: "claude" | "you_said";
  category_key?: string;
}
export interface LeadArea {
  kind: "zip" | "city" | "radius";
  /** As the sentence says it: "Austin, TX". */
  label: string;
  /** Two letters. */
  state: string;
  /** Null for a city ask until the probe's coordinates give one, or a ZIP ask until A2 derives it from the ZCTA table (§12.5, 31). */
  center: { lat: number; lng: number } | null;
  radius_m: number;
  zip?: string;
  /** The card's own location query, built from the validated plan. */
  query: string;
}
export interface LeadSearchPlan {
  version: number;
  card: "local_businesses";
  /** Who is sought, plural, as the sentence says it: "personal trainers". */
  name: string;
  /** The owner's words, at most 400 characters. */
  asked: string;
  terms: string[];
  area: LeadArea;
  count: number;
  contact: LeadContactStandard;
  criteria: LeadCriterion[];
  exclusions: LeadExclusion[];
}

/** The fifty states and DC, as a listing spells them; also the plan schema's set of valid state codes. */
export const US_STATES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};
export const US_CODES = new Set(Object.values(US_STATES));

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
// Control/format characters (bidi overrides, tag characters) and newlines are stripped from every
// plan-authored text field before it can reach the judge's rubric (26; security review, item 9).
const stripUnsafe = (s: string) => s.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ");
const words = (min: number, max: number) =>
  z
    .string()
    .transform((s) => stripUnsafe(s).trim())
    .pipe(z.string().min(min).max(max));

/** The route's input and the door's: the same shape, checked twice on purpose. */
export const LeadSearchPlanSchema: z.ZodType<LeadSearchPlan> = z
  .object({
    version: z.number().int().min(1),
    card: z.literal("local_businesses"),
    name: words(2, 80),
    asked: words(1, 400),
    terms: z.array(words(2, 60)).min(1).max(5),
    area: z.object({
      kind: z.enum(["zip", "city", "radius"]),
      label: words(2, 80),
      state: z.string().regex(/^[A-Z]{2}$/),
      center: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
      radius_m: z.number().int().min(500).max(200_000),
      zip: z
        .string()
        .regex(/^\d{5}$/)
        .optional(),
      query: words(2, 120),
    }),
    count: z.number().int().min(1).max(LEAD_MAX_PLACES),
    contact: z.enum(["phone", "email"]),
    criteria: z
      .array(
        z.object({
          key: z.string().regex(KEY),
          text: words(2, 120),
          standard: z.enum(["likely", "seen"]),
          required: z.boolean(),
        }),
      )
      .max(8),
    exclusions: z
      .array(
        z.object({
          key: z.string().regex(KEY),
          text: words(2, 80),
          origin: z.enum(["claude", "you_said"]),
          category_key: z.string().regex(KEY).optional(),
        }),
      )
      .max(8),
  })
  .superRefine((p, ctx) => {
    const keys = [...p.criteria.map((c) => c.key), ...p.exclusions.map((e) => e.key)];
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: "custom",
        message: "every criterion and exclusion has a key of its own",
        path: ["criteria"],
      });
    const lowerTerms = p.terms.map((t) => t.toLowerCase());
    if (new Set(lowerTerms).size !== lowerTerms.length)
      ctx.addIssue({ code: "custom", message: "the terms are not the same phrase twice", path: ["terms"] });
    if (p.area.kind === "radius" && p.area.center === null)
      ctx.addIssue({ code: "custom", message: "a radius needs a center", path: ["area", "center"] });
    if (p.area.kind === "zip" && !p.area.zip)
      ctx.addIssue({
        code: "custom",
        message: "a ZIP ask needs a zip code (A2 derives its center from the ZCTA table)",
        path: ["area", "zip"],
      });
    if (!US_CODES.has(p.area.state))
      ctx.addIssue({ code: "custom", message: "state is not a real US state or DC", path: ["area", "state"] });
  });

/** JSON.stringify with every object's keys sorted first, so the same value written in another key order compares equal. Array element order still matters. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

/** The changed plan, with its version bumped when the area, count, contact standard, criteria or exclusions moved (S15). */
export function planVersionOf(plan: LeadSearchPlan, changed: Partial<LeadSearchPlan>): LeadSearchPlan {
  const next: LeadSearchPlan = { ...plan, ...changed, version: plan.version };
  const material = (["area", "count", "contact", "criteria", "exclusions"] as const).some(
    (k) => !same(plan[k], next[k]),
  );
  return { ...next, version: material ? plan.version + 1 : plan.version };
}
