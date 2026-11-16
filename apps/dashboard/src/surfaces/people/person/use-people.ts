/**
 * The People surface as the person page reads it (decision 0015, step 5): what `window.__PEOPLE` was to the JSX. The page draws
 * again when People lands, changes or fails, and answers nothing before its first read.
 */
import { useSurface } from "../../use-surface";
import type { PeopleSurface } from "../surface";

export function usePeopleSeam(): PeopleSurface | undefined {
  return useSurface("people");
}
