/**
 * Try again, for a source of the business's history that stopped (decision 0073, R23): the press starts the run again
 * where it stopped (setup/surface.ts importAgain) and says Starting until the run is heard starting, or says why it could
 * not. The first run's lines (brought.tsx) and Today's setting-up card (today/zones/history.tsx) press the same one.
 */
import { useState } from "react";
import type { ImportSource } from "@chanlytics/contracts";
import { FIRST_RUN_HELPERS } from "../model/first-run-helpers";
import { refusalToast, type FrameFlash } from "../../../frame-verbs";
import { setupVerbs } from "../../surface";

/**
 * How long a pressed Try again says Starting while the run is not yet heard starting: the setup read hears the ledger's
 * row within ten seconds (setup/override.ts), so a press still unheard after this is offered again.
 */
const STARTING_HOLD_MS = 30_000;

/** A source's Try again: whether a press is still on its way, and the press. A refusal gives the press back and says why. */
export function useImportAgain(
  source: ImportSource,
  flash: (f: FrameFlash) => void,
): { starting: boolean; again: () => Promise<void> } {
  const [pressedAt, setPressedAt] = useState<number | null>(null);
  const starting = pressedAt !== null && Date.now() - pressedAt < STARTING_HOLD_MS;
  const again = async () => {
    setPressedAt(Date.now());
    const r = await setupVerbs.importAgain(source);
    if (r.ok) return;
    setPressedAt(null);
    flash(refusalToast(r, FIRST_RUN_HELPERS.importWords.stopped));
  };
  return { starting, again };
}
