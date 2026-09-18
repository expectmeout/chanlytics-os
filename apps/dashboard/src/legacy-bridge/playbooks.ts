/**
 * Playbooks, the verbs: `window.__playbooks` — make one, change one, pause,
 * resume, run now, delete; approve or skip a run that waited for a person.
 *
 * Every write goes through the typed client (owner or operator on the
 * server; a viewer's click returns the server's refusal), and after it lands
 * the refresh map re-reads the Playbooks AND Broadcasts surfaces — a run is
 * a broadcast, so the cards and the runs must move together — never a row
 * the page invented while it waited.
 */
import { PLAYBOOK_REACH_DOOR, PLAYBOOK_REACH_WORDS, playbookReach } from "@chanlytics/contracts";
import { api } from "./api";
import { playbooksOverride } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";

export interface PlaybookBody {
  name?: string | null;
  trigger: string;
  template_id: string;
  /** Typed text, or a source the wire fills per person: { kind: "first_name" | "business_name" | "booking_link" }. */
  params: Array<string | { kind: string }>;
  run_hour?: number;
  cap_per_run?: number;
  gap_days?: number;
  cadence_days?: number;
}

/** Re-read the surface: for Today's approve and anything else that changes a run elsewhere. */
export async function refreshPlaybooks(): Promise<void> {
  api().forget();
  await refreshSurfaces([playbooksOverride]);
}

export const playbooks = {
  create: (body: PlaybookBody) => api()("POST playbooks", { body }),
  update: (id: string, body: PlaybookBody) => api()("PUT playbooks/[id]", { params: { id }, body }),
  pause: (id: string) => api()("PUT playbooks/[id]", { params: { id }, body: { state: "paused" } }),
  resume: (id: string) => api()("PUT playbooks/[id]", { params: { id }, body: { state: "running" } }),
  remove: (id: string) => api()("DELETE playbooks/[id]", { params: { id } }),
  /** A run now, at this person's request: sends now unless the class is set to never. */
  runNow: (id: string) => api()("POST playbooks/[id]/run", { params: { id } }),
  /** A run that waited for a person goes out now, or is skipped — both are the broadcast's own doors. */
  approveRun: (broadcastId: string) => api()("POST broadcasts/[id]/approve", { params: { id: broadcastId } }),
  skipRun: (broadcastId: string) => api()("POST broadcasts/[id]/cancel", { params: { id: broadcastId } }),
};

declare global {
  interface Window {
    __playbooks?: typeof playbooks;
    __refreshPlaybooks?: () => Promise<void>;
    /** What the next run will actually do -- the card reads it beside the state. */
    __playbookReach?: typeof playbookReach;
    __playbookReachWords?: typeof PLAYBOOK_REACH_WORDS;
    __playbookReachDoor?: typeof PLAYBOOK_REACH_DOOR;
  }
}

export function installPlaybooks(): void {
  window.__playbooks = playbooks;
  window.__refreshPlaybooks = refreshPlaybooks;
  window.__playbookReach = playbookReach;
  window.__playbookReachWords = PLAYBOOK_REACH_WORDS;
  window.__playbookReachDoor = PLAYBOOK_REACH_DOOR;
}
