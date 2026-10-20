/**
 * The Calendar in a demo session: the sample (./sample.ts), fetched once a demo draws the Calendar, since a demo has no
 * surface to read (the one-system plan's step 3). Imported by the page, the sample rode in every workspace's load of
 * it; a workspace's session never fetches it now, as People's and the Inbox's samples already were not (the loadability
 * review, 19 Oct 2026).
 */
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { demoSession } from "../legacy-verbs";

/** The sample's code, fetched once; a fetch that failed is asked for again by the next draw. */
export const calendarDemo = codeOnce(() => import("./sample"));

/**
 * The sample's module as a demo draws it: null in a workspace's session and until its code is in (the page draws again
 * as it lands).
 */
export function useCalendarDemo(wanted = true) {
  const demo = demoSession();
  const sample = useCode(calendarDemo, demo && wanted).loaded;
  return demo ? sample : null;
}
