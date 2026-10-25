/**
 * The first run's addresses, with nothing else: setup.ts reads Find's from here, not from first-run.ts, so the two
 * never import each other and no load order can find a constant not yet made. Moved whole from first-run.ts (Reach
 * out Part 2.5), which re-exports its public names.
 */
/**
 * The first run's steps, in their order, by the word an address names each by: first-run.ts FIRST_RUN_STEPS is made
 * from it. Five since decision 0073: your business, your receptionist, a rehearsal, where it answers, and going live.
 */
export const FIRST_RUN_STEP_KEYS = ["business", "receptionist", "rehearse", "channels", "live"] as const;

export type FirstRunStepKey = (typeof FIRST_RUN_STEP_KEYS)[number];

/**
 * The steps of the four-step first run (before decision 0073), as an address or a bell note still names them, and the
 * step that does their work now: the phone's number, its forwarding and the test call are all Go live's. A step not yet
 * reached is never shown (first-run.ts opens the step the workspace stands at instead), so an old note to the phone
 * step lands wherever the owner is.
 */
const FIRST_RUN_STEPS_BEFORE: Readonly<Record<string, FirstRunStepKey>> = { phone: "live", try: "live" };

/**
 * The step a `#/start/<step>` address names, or null for anything else. An address's parse, so it is here: the address
 * registry reads it on every page (dashboard surfaces/addresses.ts), and from first-run.ts it carried the first run's
 * words, steps, phone and Try into every page's first load (the loadability review, 19 Oct 2026).
 */
export function firstRunStepOf(param: string | null | undefined): FirstRunStepKey | null {
  if (!param) return null;
  return FIRST_RUN_STEP_KEYS.find((k) => k === param) ?? FIRST_RUN_STEPS_BEFORE[param] ?? null;
}

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
