import { write, account } from "@/server/route";
import { PageVitalsInput } from "@chanlytics/contracts";
import { keepPageVitals } from "@/server/platform/vitals";

/**
 * POST /api/v1/vitals — {page, vitals: [{id, name, value}]}: what a page load's five numbers came to, sent by the
 * shell when the page is hidden (field data, 00225). Yours, not a workspace's, so it is declared on the account, and
 * counted: a tab sends one each time it is put away, which honest use keeps well under the ceiling.
 *
 * The answer is for a test to read; the browser's beacon never does. A report the table could not take is kept by
 * nobody and refused to nobody (`kept: 0`, and a line in the log).
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "vitals",
  input: PageVitalsInput,
  handle: async ({ input }) => ({ kept: await keepPageVitals(input) }),
});
