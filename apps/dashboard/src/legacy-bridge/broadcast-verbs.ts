/**
 * Broadcasts, the two verbs: `window.__broadcasts.send(body)` and
 * `window.__broadcasts.cancel(id)`.
 *
 * Both go through the app's own routes (owner or operator on the server; a
 * viewer's click returns the server's refusal) and then re-fetch the
 * Broadcasts surface, so the Scheduled and History rows are the server's —
 * never a row the page invented while it waited.
 */
import type { BroadcastDetailDto } from "@chanlytics/contracts";
import { broadcastsOverride, invalidateInFlight, scoped } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";

export interface SendBody {
  template_id: string;
  params: string[];
  audience: { kind: "everyone" | "list" | "saved"; id: string | null };
  scheduled_for?: string | null;
  name?: string | null;
}

export interface BroadcastResult {
  ok: boolean;
  message?: string;
  data?: { id: string; name?: string; state: string; recipient_count?: number; scheduled_for?: string; was?: string };
}

async function call(path: string, body?: unknown): Promise<BroadcastResult> {
  try {
    const res = await fetch(scoped(path), {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: BroadcastResult["data"]; error?: { message?: string } }
      | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    invalidateInFlight();
    await refreshSurfaces([broadcastsOverride]);
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was sent." };
  }
}

/** One broadcast and every person on it. A read: nothing refreshes. */
async function detail(id: string): Promise<{ ok: boolean; message?: string; data?: BroadcastDetailDto }> {
  try {
    const res = await fetch(scoped(`/api/v1/broadcasts/${encodeURIComponent(id)}`));
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: BroadcastDetailDto; error?: { message?: string } } | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error." };
  }
}

/** Re-read the surface: for Ask's cards and anything else that changes a broadcast elsewhere. */
export async function refreshBroadcasts(): Promise<void> {
  invalidateInFlight();
  await refreshSurfaces([broadcastsOverride]);
}

export const broadcasts = {
  send: (body: SendBody) => call("/api/v1/broadcasts", body),
  cancel: (id: string) => call(`/api/v1/broadcasts/${encodeURIComponent(id)}/cancel`),
  detail,
};

declare global {
  interface Window {
    __broadcasts?: typeof broadcasts;
    __refreshBroadcasts?: () => Promise<void>;
  }
}

export function installBroadcasts(): void {
  window.__broadcasts = broadcasts;
  window.__refreshBroadcasts = refreshBroadcasts;
}
