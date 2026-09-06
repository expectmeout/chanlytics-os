import { CONSENT_SOURCES, toPersonVM, type PersonDetailDto, type PersonVM } from "@chanlytics/contracts";
import {
  calendarOverride,
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

/**
 * Receptionist mode for one person: `window.__setPersonReceptionist(id, mode)`.
 *
 * "auto" / "ask" / "never" set the person's own row; "inherit" removes it so
 * they follow the workspace policy again. Owner-only on the server. The list
 * is re-fetched afterwards because the Receptionist column reads from it.
 */
export async function setPersonReceptionist(id: string, mode: "auto" | "ask" | "never" | "inherit"): Promise<DeleteResult> {
  try {
    const res = await fetch(scoped(`/api/v1/contacts/${encodeURIComponent(id)}/receptionist`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
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
    await refreshSurfaces([peopleOverride]);
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

/**
 * The customer's answer about offers by WhatsApp: `window.__setPersonConsent(id, body)`.
 *
 * { consent: "opted_in" | "opted_out", source } or { consent: "unknown" }.
 * Owner or operator on the server. The list is re-fetched afterwards because
 * the Consent column and the "Can receive offers" list read from it.
 */
export interface ConsentBody {
  consent: "opted_in" | "opted_out" | "unknown";
  source?: string;
  note?: string;
}

export async function setPersonConsent(id: string, body: ConsentBody): Promise<DeleteResult> {
  try {
    const res = await fetch(scoped(`/api/v1/contacts/${encodeURIComponent(id)}/consent`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
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
    await refreshSurfaces([peopleOverride]);
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

declare global {
  interface Window {
    __personDetail?: (id: string) => Promise<PersonVM | null>;
    __setPersonConsent?: (id: string, body: ConsentBody) => Promise<DeleteResult>;
    __consentSources?: readonly { id: string; label: string }[];
    __deletePerson?: (id: string) => Promise<DeleteResult>;
    __addPerson?: (body: AddPersonBody) => Promise<AddPersonResult>;
    __setPersonReceptionist?: (id: string, mode: "auto" | "ask" | "never" | "inherit") => Promise<DeleteResult>;
  }
}

export interface AddPersonBody { phone: string; name?: string | null; source?: string }
export interface AddPersonResult { ok: boolean; message?: string; id?: string; existed?: boolean }

/**
 * Add a person by phone: `window.__addPerson({ phone, name, source })`.
 *
 * Get-or-create on the server, owner or operator. The People list and the
 * Calendar are re-read afterwards, so the appointment that carried the
 * number now links to the person it is for.
 */
export async function addPerson(body: AddPersonBody): Promise<AddPersonResult> {
  try {
    const res = await fetch(scoped("/api/v1/contacts"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: { contact_id: string; existed: boolean }; error?: { message?: string } } | null;
    if (!j || !j.ok || !j.data) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    invalidateInFlight();
    await refreshSurfaces([peopleOverride, calendarOverride]);
    return { ok: true, id: j.data.contact_id, existed: j.data.existed };
  } catch {
    return { ok: false, message: "Network error — nothing was added." };
  }
}

export function installPeopleCourier(): void {
  window.__personDetail = personDetail;
  window.__addPerson = addPerson;
  window.__deletePerson = deletePerson;
  window.__setPersonReceptionist = setPersonReceptionist;
  window.__setPersonConsent = setPersonConsent;
  window.__consentSources = CONSENT_SOURCES;
}
