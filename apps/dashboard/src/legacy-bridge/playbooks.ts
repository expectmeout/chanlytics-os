/**
 * Playbooks, the verbs: `window.__playbooks` — make one, change one, pause,
 * resume, run now, delete; approve or skip a run that waited for a person.
 *
 * Every write goes through the app's own routes (owner or operator on the
 * server; a viewer's click returns the server's refusal) and then re-fetches
 * the Playbooks AND Broadcasts surfaces — a run is a broadcast, so the cards
 * and the runs must move together — never a row the page invented while it
 * waited.
 */
import { broadcastsOverride, invalidateInFlight, playbooksOverride, scoped } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";

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

export interface PlaybookResult<T = Record<string, unknown>> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function call<T>(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<PlaybookResult<T>> {
  try {
    const res = await fetch(scoped(path), {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message?: string } } | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    invalidateInFlight();
    await refreshSurfaces([playbooksOverride, broadcastsOverride]);
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

/** Re-read the surface: for Today's approve and anything else that changes a run elsewhere. */
export async function refreshPlaybooks(): Promise<void> {
  invalidateInFlight();
  await refreshSurfaces([playbooksOverride]);
}

const enc = (s: string) => encodeURIComponent(s);

export interface PlaybookMade { id: string; name: string; state: string }
export interface RunNowData { id: string; outcome: "sent" | "held" | "empty"; eligible: number; broadcast_id: string | null; name: string }

export const playbooks = {
  create: (body: PlaybookBody) => call<PlaybookMade>("/api/v1/playbooks", "POST", body),
  update: (id: string, body: PlaybookBody) => call<PlaybookMade>(`/api/v1/playbooks/${enc(id)}`, "PUT", body),
  pause: (id: string) => call<{ id: string; state: string }>(`/api/v1/playbooks/${enc(id)}`, "PUT", { state: "paused" }),
  resume: (id: string) => call<{ id: string; state: string }>(`/api/v1/playbooks/${enc(id)}`, "PUT", { state: "running" }),
  remove: (id: string) => call<{ deleted: true; id: string }>(`/api/v1/playbooks/${enc(id)}`, "DELETE"),
  /** A run now, at this person's request: sends now unless the class is set to never. */
  runNow: (id: string) => call<RunNowData>(`/api/v1/playbooks/${enc(id)}/run`, "POST"),
  /** A run that waited for a person goes out now, or is skipped — both are the broadcast's own doors. */
  approveRun: (broadcastId: string) => call<{ id: string; state: string; recipient_count?: number }>(`/api/v1/broadcasts/${enc(broadcastId)}/approve`, "POST"),
  skipRun: (broadcastId: string) => call<{ id: string; state: string; was?: string }>(`/api/v1/broadcasts/${enc(broadcastId)}/cancel`, "POST"),
};

declare global {
  interface Window {
    __playbooks?: typeof playbooks;
    __refreshPlaybooks?: () => Promise<void>;
  }
}

export function installPlaybooks(): void {
  window.__playbooks = playbooks;
  window.__refreshPlaybooks = refreshPlaybooks;
}
