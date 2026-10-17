/**
 * Playbooks, the one hook a page that has not moved still calls: Today's approve re-reads the cards behind it. Every
 * other act on a playbook is a sequence's now, through the verbs' one door (commitVerb: playbook_change and the run's own
 * approve and skip); the composer's make and change went with its Every time (the closed-loop audit of 17 Oct 2026, G).
 */
import { api } from "@/legacy-bridge/api";
import { playbooksOverride } from "./surface";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";

/** Re-read the surface: for Today's approve and anything else that changes a run elsewhere. */
async function refreshPlaybooks(): Promise<void> {
  api().forget();
  await refreshSurfaces([playbooksOverride]);
}

declare global {
  interface Window {
    /** The one hook a page that has not moved still calls: Today's approve re-reads the cards behind it (today/shell.ts refreshPlaybooks). */
    __refreshPlaybooks?: () => Promise<void>;
  }
}

export function installPlaybooks(): void {
  window.__refreshPlaybooks = refreshPlaybooks;
}
