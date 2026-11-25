/**
 * Playbooks, the one hook a page that has not moved still calls: Today's approve re-reads the cards behind it. Every
 * other act on a playbook is a sequence's now, through the verbs' one door (commitVerb: playbook_change and the run's own
 * approve and skip); the composer's make and change went with its Every time (the closed-loop audit of 17 Oct 2026, G).
 */
import { api } from "@/bridge/api";
import { playbooksOverride } from "./surface";
import { refreshSurfaces } from "@/bridge/surface-runner";
import { provide } from "@/bridge/provided";

/** Re-read the surface: for Today's approve and anything else that changes a run elsewhere. */
async function refreshPlaybooks(): Promise<void> {
  api().forget();
  await refreshSurfaces([playbooksOverride]);
}

/** The one hook a page reaches without carrying this module: Today's approve re-reads the cards behind it (provided.ts). */
export function installPlaybooks(): void {
  provide("refreshPlaybooks", refreshPlaybooks);
}
