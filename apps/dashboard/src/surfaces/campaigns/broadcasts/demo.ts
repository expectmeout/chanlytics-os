/**
 * Sent in a demo session: the sample (./sample.ts), fetched once a demo draws Sent or New's send screen, since a demo
 * has no surface to read (the one-system plan's step 3). Imported by the page, the sample rode in every workspace's
 * load of it; a workspace's session never fetches it now, as People's and the Inbox's samples already were not (the
 * loadability review, 19 Oct 2026).
 */
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { demoSession } from "../../legacy-verbs";

/** The sample's code, fetched once; a fetch that failed is asked for again by the next draw. */
export const broadcastsDemo = codeOnce(() => import("./sample"));

/** The sample's module as a demo draws it, once `wanted`: null in a workspace's session and until its code is in. */
export function useBroadcastsDemo(wanted = true) {
  const demo = demoSession();
  const sample = useCode(broadcastsDemo, demo && wanted).loaded;
  return demo ? sample : null;
}
