/**
 * A tab whose reads are held looks again, by itself (25 Nov 2026; client/trouble.ts).
 *
 * While the server does not answer a tab, its client answers every read itself, and each surface's own retries run out
 * within a quarter of a minute: nothing would ask again until the owner came back to the tab, the live feed rejoined or the
 * quarter-hour heal came round. So when the client's wait comes due, the runner reads what stopped refreshing: the first of
 * those reads is the client's one look, and the rest wait on what it says. Answered, they follow a few at a time and the
 * page is whole again; failed, the client's wait doubles and this is asked again when that comes due. One request a look.
 *
 * A hidden tab looks at nothing: nobody is reading it, and it reads everything as it comes back in front (passes.ts).
 */
import type { SurfaceOverride } from "../surface-data";
import { getSurfaceStatuses } from "../surface-status";
import { pageHidden } from "./front";
import type { Passes } from "./passes";

/** What the mend asks of the runner it reads through. */
interface MendRun {
  readonly overrides: readonly SurfaceOverride[];
  readonly passes: Pick<Passes, "again">;
  /** Hears the client's wait come due (client/api.ts `onReadsDue`); answers the stop. */
  onDue(fn: () => void): () => void;
  stopped(): boolean;
}

/** Read what stopped refreshing each time the client's wait comes due, while the page is in front. Answers the stop. */
export function watchTheMend(run: MendRun): () => void {
  return run.onDue(() => {
    if (run.stopped() || pageHidden()) return;
    const statuses = getSurfaceStatuses();
    void run.passes.again(
      "mend",
      run.overrides.filter((o) => statuses.get(o.key) !== "live"),
    );
  });
}
