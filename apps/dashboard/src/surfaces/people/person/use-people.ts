/**
 * The People surface as the person page reads it (decision 0015, step 5): what `window.__PEOPLE` was to the JSX. The page draws
 * again when People lands, changes or fails, and answers nothing before its first read; a demo session draws the sample's
 * People (sample.ts), as the list does, since a demo has no surface to read.
 */
import { demoSession } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { demoPeople } from "../sample";
import type { PeopleSurface } from "../surface";

export function usePeopleSeam(): PeopleSurface | undefined {
  return useSurface("people") ?? (demoSession() ? demoPeople() : undefined);
}
