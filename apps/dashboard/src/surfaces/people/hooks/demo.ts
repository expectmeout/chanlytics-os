/**
 * People in a demo session: the sample (../sample.ts), fetched once a demo draws People, since a demo has no surface to
 * read. The sample is built from People's rows and a person's whole page; imported by the page, it put that code, and zod
 * with People's list rules, into every workspace's first load of People (the loadability review, 19 Oct 2026). A
 * workspace's session never fetches it.
 */
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { demoSession } from "../../legacy-verbs";
import type { PeopleSurface } from "../surface";

/**
 * The sample's code, fetched once; a fetch that failed is asked for again by the next draw. As it lands the frame is
 * told, as People's read tells it, so a person's crumb names them (frame/shell-hooks.ts useShellRouting, chrome.ts).
 */
export const demoCode = codeOnce(() =>
  import("../sample").then(({ demoPeople, samplePerson }) => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("surface:clients"));
    return { demoPeople, samplePerson };
  }),
);

/** People as a demo draws it: the sample once its code is in, nothing before (the page draws again as it lands). */
export function useDemoPeople(): PeopleSurface | undefined {
  const demo = demoSession();
  const sample = useCode(demoCode, demo).loaded;
  return demo && sample ? sample.demoPeople() : undefined;
}
