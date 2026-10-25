/**
 * The first run's addresses and its door, with nothing else: setup.ts reads Find's from here, not from first-run.ts, so
 * the two never import each other and no load order can find a constant not yet made (moved whole from first-run.ts,
 * Reach out Part 2.5, which re-exports its public names). And what the frame knows of the first run: its name (the
 * crumb its page stands under), what a door to it says (the bell's), the rule that sends an arrival there, and the
 * tab's memory that it did. Every page's frame reads them (surfaces/routes.ts, the Setup surface), and reading them from
 * first-run.ts carried its steps, words, phone and Try into every first load, about 29 KB compressed (the loadability
 * review, 19 Oct 2026). first-run-door.ts held them until the setup folder needed its place (25 Oct 2026).
 */
import { ROLE_PERMS, type Role } from "../config/workspace-config/role-perms";

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

/** The first run's name: the crumb its page stands under, and its words' title (FIRST_RUN_WORDS). */
export const FIRST_RUN_TITLE = "Setting up";

/** What a door to the first run says, wherever it is: Connections, the bell, Today's card. */
export const FINISH_SETTING_UP = "Finish setting up";

/** The tab's own memory that this session has landed on the first run once: Today does not send it back again. */
export const FIRST_RUN_LANDED_KEY = "chanlytics.setup.landed";

/**
 * Whether this arrival lands on the first run: an owner, a receptionist that answers nowhere yet, a plain arrival
 * (Today or nothing), and not already sent there this session. Everyone else gets Today. Setup's rule, moved with the
 * page it lands on.
 */
export function shouldLandOnFirstRun(
  role: string | null | undefined,
  answering: boolean,
  route: string,
  landed: boolean,
): boolean {
  // Whoever may set the workspace up: its owner, and the partner who brought it (0012).
  if (landed || answering || !ROLE_PERMS[role as Role]?.settings) return false;
  return route === "" || route === "today";
}
