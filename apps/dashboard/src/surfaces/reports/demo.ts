/**
 * Reports in a demo session: the samples (./sample.ts, and the Campaigns lens's ./campaigns-sample.ts), fetched once a
 * demo draws Reports, since a demo has no surface to read (the one-system plan's step 3). Imported by the page, the
 * sample rode in every workspace's load of it; a workspace's session never fetches it now, as People's and the Inbox's
 * samples already were not (the loadability review, 19 Oct 2026).
 */
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { demoSession } from "../legacy-verbs";

/** The sample's code, fetched once; a fetch that failed is asked for again by the next draw. */
export const reportsDemo = codeOnce(() =>
  Promise.all([import("./sample"), import("./campaigns-sample")]).then(([lenses, campaigns]) => ({
    ...lenses,
    campaignsSample: campaigns.campaignsSample,
  })),
);

/**
 * The samples as a demo draws them: null in a workspace's session and until their code is in (the page draws again as
 * it lands).
 */
export function useReportsDemo(wanted = true) {
  const demo = demoSession();
  const sample = useCode(reportsDemo, demo && wanted).loaded;
  return demo ? sample : null;
}
