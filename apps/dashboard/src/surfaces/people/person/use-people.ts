/**
 * The People surface as the person page reads it (decision 0015, step 5): what `window.__PEOPLE` was to the JSX. The page draws
 * again when People lands, changes or fails, and answers nothing before its first read; a demo session draws the sample's
 * People (demo.ts), as the list does, since a demo has no surface to read.
 */
import { useSurface } from "../../use-surface";
import { useDemoPeople } from "../hooks/demo";
import type { PeopleSurface } from "../surface";

export function usePeopleSeam(): PeopleSurface | undefined {
  const live = useSurface("people");
  const demo = useDemoPeople();
  return live ?? demo;
}
