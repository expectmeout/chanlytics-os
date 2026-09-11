import { CONSENT_SOURCES, mayReceive, offersYesRefusal, toPersonVM, type PersonVM, type SendPurpose } from "@chanlytics/contracts";
import {
  conversationsOverride,
  inboxOverride,
  invalidateInFlight,
  peopleOverride,
  scoped,
  todayOverride,
} from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";
import { api } from "./api";
import { ApiError } from "../client/api";

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
 * a session expiry has already signed the tab out by the time this throws.
 */
export async function personDetail(id: string): Promise<PersonVM | null> {
  const r = await api()("GET contacts/[id]", { params: { id } });
  if (r.ok) return toPersonVM(r.data.person);
  if (r.status === 404) return null;
  throw new ApiError(r.code, r.status, r.message);
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
 * A customer's answer, recorded by whoever heard it.
 *
 * TWO QUESTIONS, TWO DOORS, and they are never interchangeable:
 *
 *   "conversational"  messages about their own visit, and a reply when they
 *                     write. `window.__setPersonConsent(id, body)`.
 *   "marketing"       offers and news. `window.__setPersonMarketingConsent(...)`.
 *
 * The carriers require them collected separately (error 30913) and the database
 * keeps them in separate columns (00095). Both controls in this product used to
 * say "offers" and write the conversational column, so a signed marketing consent
 * could not be recorded at all — which is what this second door fixes.
 *
 * { consent: "opted_in" | "opted_out", source } or { consent: "unknown" }.
 * Owner or operator on the server. The list is re-fetched afterwards because the
 * Consent column and both consent lists read from it.
 */
export interface ConsentBody {
  consent: "opted_in" | "opted_out" | "unknown";
  source?: string;
  note?: string;
}

const CONSENT_PATH: Record<SendPurpose, string> = {
  conversational: "consent",
  marketing: "marketing-consent",
};

async function putConsent(id: string, body: ConsentBody, purpose: SendPurpose): Promise<DeleteResult> {
  try {
    const res = await fetch(scoped(`/api/v1/contacts/${encodeURIComponent(id)}/${CONSENT_PATH[purpose]}`), {
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
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

async function recordOne(id: string, body: ConsentBody, purpose: SendPurpose): Promise<DeleteResult> {
  const r = await putConsent(id, body, purpose);
  if (!r.ok) return r;
  invalidateInFlight();
  await refreshSurfaces([peopleOverride]);
  return r;
}

export async function setPersonConsent(id: string, body: ConsentBody): Promise<DeleteResult> {
  return recordOne(id, body, "conversational");
}

/** Their answer about OFFERS, on its own column and its own ledger entry. */
export async function setPersonMarketingConsent(id: string, body: ConsentBody): Promise<DeleteResult> {
  return recordOne(id, body, "marketing");
}

/**
 * The same answer for many at once — a yes given at the desk by a whole
 * class, say: `window.__setPersonConsentMany(ids, body)`. One request per
 * person (the door is per person and the ledger says who), fifty at most
 * in one go, one refresh at the end.
 */
export interface ManyResult { ok: boolean; done: number; failed: number; message?: string }

async function recordMany(ids: string[], body: ConsentBody, purpose: SendPurpose): Promise<ManyResult> {
  const take = [...new Set(ids)].slice(0, 50);
  let done = 0;
  let failed = 0;
  let message: string | undefined;
  for (const id of take) {
    const r = await putConsent(id, body, purpose);
    if (r.ok) done += 1;
    else { failed += 1; message = message ?? r.message; }
  }
  invalidateInFlight();
  await refreshSurfaces([peopleOverride]);
  return { ok: failed === 0, done, failed, message: failed ? `${failed} could not be recorded${message ? ` — ${message}` : ""}` : undefined };
}

export async function setPersonConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult> {
  return recordMany(ids, body, "conversational");
}

/** A signed marketing consent recorded for a whole class at once. */
export async function setPersonMarketingConsentMany(ids: string[], body: ConsentBody): Promise<ManyResult> {
  return recordMany(ids, body, "marketing");
}

declare global {
  interface Window {
    __personDetail?: (id: string) => Promise<PersonVM | null>;
    __setPersonConsent?: (id: string, body: ConsentBody) => Promise<DeleteResult>;
    __setPersonConsentMany?: (ids: string[], body: ConsentBody) => Promise<ManyResult>;
    __setPersonMarketingConsent?: (id: string, body: ConsentBody) => Promise<DeleteResult>;
    __setPersonMarketingConsentMany?: (ids: string[], body: ConsentBody) => Promise<ManyResult>;
    __consentSources?: readonly { id: string; label: string }[];
    /** The broadcast's own "may this person be reached", for pages that count people. */
    __mayReceive?: typeof mayReceive;
    /** The ways a yes to OFFERS may be recorded: in writing only (00100). A no keeps every source. */
    __offersYesSources?: readonly { id: string; label: string }[];
    __deletePerson?: (id: string) => Promise<DeleteResult>;
    __setPersonDetails?: (id: string, body: DetailsBody) => Promise<DeleteResult>;
    __setPersonReceptionist?: (id: string, mode: "auto" | "ask" | "never" | "inherit") => Promise<DeleteResult>;
  }
}

/**
 * A person's name and the owner's notes: `window.__setPersonDetails(id, { name?, notes? })`.
 *
 * Owner or operator on the server; an empty string clears. The People list
 * is re-fetched because names show on every row, and the profile reloads
 * on the same event.
 */
export interface DetailsBody { name?: string; notes?: string }

export async function setPersonDetails(id: string, body: DetailsBody): Promise<DeleteResult> {
  try {
    const res = await fetch(scoped(`/api/v1/contacts/${encodeURIComponent(id)}/details`), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: unknown; error?: { message?: string } } | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    invalidateInFlight();
    await refreshSurfaces([peopleOverride]);
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

export function installPeopleCourier(): void {
  window.__personDetail = personDetail;
  window.__setPersonConsentMany = setPersonConsentMany;
  window.__setPersonDetails = setPersonDetails;
  window.__deletePerson = deletePerson;
  window.__setPersonReceptionist = setPersonReceptionist;
  window.__setPersonConsent = setPersonConsent;
  window.__setPersonMarketingConsent = setPersonMarketingConsent;
  window.__setPersonMarketingConsentMany = setPersonMarketingConsentMany;
  window.__consentSources = CONSENT_SOURCES;
  // The rule, not a copy of it: the Lists page counts who a broadcast reaches, and
  // it was spelling that by hand -- without the phone the route requires.
  window.__mayReceive = mayReceive;
  // The rule, applied once, so the profile and the bulk menu offer the same ways.
  window.__offersYesSources = CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null);
}
