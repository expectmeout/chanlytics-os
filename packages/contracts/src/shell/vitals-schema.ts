/**
 * What the shell sends of a page load, as the route reads it (PageVitalsInput), apart from vitals.ts's pages, their
 * words and the one report's check (PageVitalReport, in zod/mini). zod's classic API is not built into the browser's
 * contracts (decision 0024, the browser's entry): a page that reports its load loads none of it.
 */
import { z } from "zod";
import { PAGE_BUILD, PageVitalReport } from "./vitals";
import { PAGE_DEVICES, PAGE_NAME, PAGE_VITALS_PER_BEACON } from "./vitals-pages";

/**
 * What the shell sends: the page a load landed on, the shape of screen it was on and the deploy it ran (decision
 * 0053), and its reports so far, each under its own id. A report of another page (a move's) names its page; one that
 * names none is of the page the load landed on. A shell from before 0053 sends the page and its five alone, and is
 * read the same.
 */
export const PageVitalsInput = z.object({
  page: z.string().regex(PAGE_NAME, { error: "A page's name is a word in lower case." }),
  device: z.enum(PAGE_DEVICES).optional(),
  build: z.string().regex(PAGE_BUILD, { error: "A build is its sha, or dev." }).optional(),
  vitals: z.array(PageVitalReport).min(1).max(PAGE_VITALS_PER_BEACON),
});

export type PageVitalsInputDto = z.infer<typeof PageVitalsInput>;
