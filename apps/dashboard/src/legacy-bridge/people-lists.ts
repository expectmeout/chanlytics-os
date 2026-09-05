/**
 * Saved lists, the verbs: `window.__lists`.
 *
 * The lists themselves ride the People surface (window.__PEOPLE.saved), so
 * the rail and the profile read them the way they read every other People
 * fact. These five calls change them and then re-fetch the surface, so the
 * counts and the chips are the server's, never assumed. Owner or operator on
 * the server; a viewer's click returns the server's refusal.
 */
import { invalidateInFlight, peopleOverride, scoped } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";

export interface ListResult {
  ok: boolean;
  message?: string;
  data?: { id: string; name: string; ids: string[] } | { deleted: true; id: string };
}

async function call(path: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<ListResult> {
  try {
    const res = await fetch(scoped(path), {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: ListResult["data"]; error?: { message?: string } }
      | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    invalidateInFlight();
    await refreshSurfaces([peopleOverride]);
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

export const lists = {
  create: (name: string) => call("/api/v1/segments", "POST", { name }),
  rename: (id: string, name: string) => call(`/api/v1/segments/${encodeURIComponent(id)}`, "PUT", { name }),
  remove: (id: string) => call(`/api/v1/segments/${encodeURIComponent(id)}`, "DELETE"),
  add: (id: string, contactIds: string[]) => call(`/api/v1/segments/${encodeURIComponent(id)}`, "PUT", { add: contactIds }),
  drop: (id: string, contactIds: string[]) => call(`/api/v1/segments/${encodeURIComponent(id)}`, "PUT", { remove: contactIds }),
};

declare global {
  interface Window {
    __lists?: typeof lists;
  }
}

export function installLists(): void {
  window.__lists = lists;
}
