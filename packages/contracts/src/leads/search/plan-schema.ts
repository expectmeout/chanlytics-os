/**
 * A search's plan as the finder stores it (LeadSearchPlanSchema), apart from plan.ts's states and its version. zod
 * is not built into the browser's contracts (decision 0024, the browser's entry): a page that says these words loads
 * none of it.
 */
import { z } from "zod";
import { stripUnsafe, KEY, US_CODES } from "./plan";
import type { LeadSearchPlan } from "./plan";
import { LEAD_MAX_PLACES } from "./caps";

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
