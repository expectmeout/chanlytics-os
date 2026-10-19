/**
 * Where a link to a run lands (the Inbox's run review, 18 Oct 2026): a module of its own beside the page's addresses
 * (sequence-address.ts), which every page that links to a sequence imports, so the run's rules it asks (waits.ts) ride only
 * on the page that lands a run (Sent's route).
 */
import { runDecidedOnItsPage } from "../waits/waits";
import { runSheetRoute, sequenceRoute } from "./sequence-address";

/**
 * The run a link's address names (`broadcasts/run:<id>`: a bell row, Today, the Inbox, Ask's card), which lands by what the
 * run is (runLandingOf); null for any other address, its sheet's (runSheetRoute's) among them, which stays.
 */
export function arrivedRunOf(route: string): string | null {
  const [path = ""] = route.split("?");
  const [root, param = "", rest] = path.split("/");
  const run = root === "broadcasts" && rest === undefined ? /^run:([^:/]+)$/.exec(param) : null;
  return run?.[1] ?? null;
}

/** A run as the landing of a link to it reads it: a row of Sent's, or the run's own read. */
interface LandingRun {
  id: string;
  /** The sequence it is a day of (BroadcastDto.sequence_id); absent on a row read before it was said, as the run's id. */
  sequence_id?: string | null;
  state: string;
  held?: number | null;
  drafted?: number | null;
}

/**
 * Where a link to a run lands once the run is known (the Inbox's run review, 18 Oct 2026): a run decided on its own page
 * (contracts runDecidedOnItsPage: waiting for approval, or going with emails held or handed to you) stays on its sheet,
 * where the decision is, and a run that has gone lands on its sequence's History with that day open (the parity review's
 * W4), by the sequence's own id. Null where the address is no run's (arrivedRunOf) or names another run.
 */
export function runLandingOf(route: string, run: LandingRun): string | null {
  const id = arrivedRunOf(route);
  if (!id || id !== run.id) return null;
  // A run's id names its sequence too (the server reads a sequence by any of its parts), where the row does not say it.
  return runDecidedOnItsPage(run) ? runSheetRoute(id) : sequenceRoute(run.sequence_id || id, "history", id);
}
