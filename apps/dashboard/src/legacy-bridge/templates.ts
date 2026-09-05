/**
 * Templates, the one verb: `window.__syncTemplates()`.
 *
 * Reads Meta through the app's own route and re-fetches the two surfaces
 * that show templates — Settings (every template, with its status) and the
 * Inbox (the approved ones the composer may send). Owner or operator on the
 * server; a viewer's click returns the server's refusal.
 */
import { inboxOverride, invalidateInFlight, scoped, settingsOverride } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";

export interface SyncResult {
  ok: boolean;
  message?: string;
  data?: { seen: number; approved: number; marketing: number; synced_at: string };
}

export async function syncTemplates(): Promise<SyncResult> {
  try {
    const res = await fetch(scoped("/api/v1/templates/sync"), { method: "POST" });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: SyncResult["data"]; error?: { message?: string } }
      | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    invalidateInFlight();
    await refreshSurfaces([settingsOverride, inboxOverride]);
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

declare global {
  interface Window {
    __syncTemplates?: () => Promise<SyncResult>;
  }
}

export function installTemplates(): void {
  window.__syncTemplates = syncTemplates;
}
