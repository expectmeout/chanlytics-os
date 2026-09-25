/**
 * The first run's addresses, with nothing else: setup.ts reads Find's from here, not from first-run.ts, so the two
 * never import each other and no load order can find a constant not yet made. Moved whole from first-run.ts (Reach
 * out Part 2.5), which re-exports its public names.
 */
import type { FirstRunStepKey } from "./first-run";

/** The first run's address: `#/start`, and `#/start/<step>` for a step already reached. */
export const FIRST_RUN_ROUTE = "start";

/** Where one step opens: a door that names a row sends the owner to the step that draws it. */
export function firstRunStepRoute(key: FirstRunStepKey): string {
  return `${FIRST_RUN_ROUTE}/${key}`;
}

/** The address's word for Find asked for by name ("Find it"), whether or not Google was put off. */
export const FIND_PARAM = "find";

/**
 * Where "Find it" goes, wherever it is (Setup's Google row, Connections, Reports): the business step with Find asked
 * for, even after the owner said they are not on Google, since pressing it says otherwise.
 */
export const FIRST_RUN_FIND_ROUTE = `${FIRST_RUN_ROUTE}/${FIND_PARAM}`;
