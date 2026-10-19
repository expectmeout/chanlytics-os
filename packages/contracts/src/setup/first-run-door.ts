/**
 * What the frame knows of the first run, with nothing else: its name (the crumb its page stands under), what a door to
 * it says (the bell's), the rule that sends an arrival there, and the tab's memory that it did. Every page's frame reads them (surfaces/routes.ts, the Setup
 * surface), and reading them from first-run.ts carried its steps, words, phone and Try into every first load, about
 * 29 KB compressed (the loadability review, 19 Oct 2026). first-run.ts reads them from here.
 */
import { ROLE_PERMS, type Role } from "../config/workspace-config/role-perms";

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
