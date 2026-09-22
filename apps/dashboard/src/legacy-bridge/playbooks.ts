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
import {
  PLAYBOOK_REACH_WORDS,
  playbookName,
  playbookNoNumberWords,
  playbookReach,
  playbookReachDoor,
  poolWords,
  reachLines,
} from "@chanlytics/contracts";
import { api } from "./api";
import type { Output } from "../client/api";
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

/** Each act says so the moment the server takes it (`onAccepted`, with what it answered), not once both surfaces are read again behind it. */
type Accepted<
  K extends
    | "PUT playbooks/[id]"
    | "DELETE playbooks/[id]"
    | "POST playbooks/[id]/run"
    | "POST broadcasts/[id]/approve"
    | "POST broadcasts/[id]/cancel",
> = { onAccepted?: (data: Output<K>) => void };

export const playbooks = {
  create: (body: PlaybookBody) => api()("POST playbooks", { body }),
  update: (id: string, body: PlaybookBody) => api()("PUT playbooks/[id]", { params: { id }, body }),
  pause: (id: string, opts: Accepted<"PUT playbooks/[id]"> = {}) =>
    api()("PUT playbooks/[id]", { params: { id }, body: { state: "paused" }, onAccepted: opts.onAccepted }),
  resume: (id: string, opts: Accepted<"PUT playbooks/[id]"> = {}) =>
    api()("PUT playbooks/[id]", { params: { id }, body: { state: "running" }, onAccepted: opts.onAccepted }),
  remove: (id: string, opts: Accepted<"DELETE playbooks/[id]"> = {}) =>
    api()("DELETE playbooks/[id]", { params: { id }, onAccepted: opts.onAccepted }),
  /** A run now, at this person's request: sends now unless the class is set to never. */
  runNow: (id: string, opts: Accepted<"POST playbooks/[id]/run"> = {}) =>
    api()("POST playbooks/[id]/run", { params: { id }, onAccepted: opts.onAccepted }),
  /** A run that waited for a person goes out now, or is skipped — both are the broadcast's own doors. */
  approveRun: (broadcastId: string, opts: Accepted<"POST broadcasts/[id]/approve"> = {}) =>
    api()("POST broadcasts/[id]/approve", { params: { id: broadcastId }, onAccepted: opts.onAccepted }),
  skipRun: (broadcastId: string, opts: Accepted<"POST broadcasts/[id]/cancel"> = {}) =>
    api()("POST broadcasts/[id]/cancel", { params: { id: broadcastId }, onAccepted: opts.onAccepted }),
};

declare global {
  interface Window {
    __playbooks?: typeof playbooks;
    __refreshPlaybooks?: () => Promise<void>;
    /** What the next run will actually do -- the card reads it beside the state. */
    __playbookReach?: typeof playbookReach;
    __playbookReachWords?: typeof PLAYBOOK_REACH_WORDS;
    __playbookReachDoor?: typeof playbookReachDoor;
    /** A card's count when its yes has no number to send to, in the send screen's words; null when its own count stands. */
    __playbookNoNumberWords?: typeof playbookNoNumberWords;
    /** Who a moment names and why the rest are left out, in the words the approval sheet says them. */
    __reachLines?: typeof reachLines;
    /** What "of 312" counts on a card: "on the list", "in People", "with a visit tomorrow". */
    __poolWords?: typeof poolWords;
    /** The name a playbook gets when it is given none, which the composer shows before it is saved. */
    __playbookName?: typeof playbookName;
  }
}

export function installPlaybooks(): void {
  window.__playbooks = playbooks;
  window.__refreshPlaybooks = refreshPlaybooks;
  window.__playbookReach = playbookReach;
  window.__playbookReachWords = PLAYBOOK_REACH_WORDS;
  window.__playbookReachDoor = playbookReachDoor;
  window.__playbookNoNumberWords = playbookNoNumberWords;
  window.__reachLines = reachLines;
  window.__poolWords = poolWords;
  window.__playbookName = playbookName;
}
