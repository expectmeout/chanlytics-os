/**
 * A lead list's import and its choice, as the routes read them, apart from lead-import.ts's words and the plan it
 * shows. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that says these
 * words loads none of it.
 */
import { z } from "zod";
import { LEAD_LIST_MAX } from "./lead-import";

/* ------------------------------------------------------------------ the doors' bodies */

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

/** One row of POST lead-searches/import, as leadImportPlanOf reads it. */
export const LeadImportRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().min(3).max(254),
  phone: nullableText(16),
  website_host: nullableText(120),
  city: nullableText(120),
  region: nullableText(2),
  category: nullableText(120),
});

/** POST lead-searches/import: a list's name, who they are (the search's `asked`), and 1 to 500 rows (J5). */
export const LeadImportSchema = z.object({
  name: z.string().trim().min(1).max(120),
  asked: z.string().trim().max(400).optional(),
  rows: z.array(LeadImportRowSchema).min(1).max(LEAD_LIST_MAX),
});

export type LeadImportInput = z.infer<typeof LeadImportSchema>;

/** POST lead-searches/chosen: the list's name and the chosen leads (J7). */
export const LeadChooseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  lead_ids: z.array(z.string().uuid()).min(1).max(LEAD_LIST_MAX),
});

export type LeadChooseInput = z.infer<typeof LeadChooseSchema>;
