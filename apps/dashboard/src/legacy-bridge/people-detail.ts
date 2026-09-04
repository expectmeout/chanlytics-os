import { toPersonVM, type PersonDetailDto, type PersonVM } from "@chanlytics/contracts";
import {
  conversationsOverride,
  fetchEnvelope,
  inboxOverride,
  invalidateInFlight,
  peopleOverride,
  scoped,
  todayOverride,
  UnauthorizedError,
} from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";

/**
 * The profile courier: `window.__personDetail(id)`.
 *
 * The list feeds the surface through the seam's globals; a profile is one
 * person in full — every message, call and decision — and is fetched when it
 * opens, the way the Inbox fetches an off-page escalation. The mockup's
 * ClientProfile (a classic script that cannot import) calls this and renders
 * the view model it gets back, so the mapping stays in contracts where it is
 * tested by execution.
 *
 * Resolves null for "not in your workspace" (404) so the page can say so;
 * a session expiry propagates as UnauthorizedError for the runner to handle.
 */
export async function personDetail(id: string): Promise<PersonVM | null> {
  try {
    const data = await fetchEnvelope<{ person: PersonDetailDto }>(`/api/v1/contacts/${encodeURIComponent(id)}`);
    return toPersonVM(data.person);
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    if (e instanceof Error && / -> 404$/.test(e.message)) return null;
    throw e;
  }
}

export interface DeleteResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

/**
 * Delete this person: `window.__deletePerson(id)`.
 *
 * The route is the one the privacy policy promises — Postgres rows, Storage
 * media, the Blob thread and any queued job — and it is owner-only on the
 * server, so a viewer's click returns the server's refusal rather than a
 * pretend success. On success every surface that named the person is
 * re-fetched through the runner, so the list, the Inbox and Today stop
 * showing someone who no longer exists.
 */
export async function deletePerson(id: string): Promise<DeleteResult> {
  try {
    const res = await fetch(scoped(`/api/v1/contacts/${encodeURIComponent(id)}`), { method: "DELETE" });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: unknown; error?: { message?: string } }
      | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    invalidateInFlight();
    await refreshSurfaces([peopleOverride, inboxOverride, conversationsOverride, todayOverride]);
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

declare global {
  interface Window {
    __personDetail?: (id: string) => Promise<PersonVM | null>;
    __deletePerson?: (id: string) => Promise<DeleteResult>;
  }
}

export function installPeopleCourier(): void {
  window.__personDetail = personDetail;
  window.__deletePerson = deletePerson;
}
