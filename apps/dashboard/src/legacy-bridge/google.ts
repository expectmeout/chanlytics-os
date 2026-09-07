/**
 * Google on the classic pages: the listing and the connection as the edge
 * last read them (/api/v1/google → window.__GOOGLE, repainted as the tables
 * change), the view model the Reports section and Today's line derive from
 * it (contracts/google.ts), and the verbs — find, link, unlink, refresh,
 * connect, locations, choose, disconnect, reply, draft — each of which
 * refreshes this surface and Setup's, since the Setup row reads the same
 * facts; a draft touches nothing and refreshes nothing.
 */
import {
  toGoogleVM, ratingWords, starsOf, listingLine, checkedWords, connectionWords, reviewSnippet,
  type GoogleDto, type GoogleVM, type GoogleCandidateDto, type GoogleLocationDto,
} from "@chanlytics/contracts";
import { fetchEnvelope, scoped, type SurfaceOverride } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { setupOverride } from "./setup";

export interface GoogleSurface {
  dto: GoogleDto;
  fetchedAt: number;
}

export interface GoogleApi {
  /** The view model for a period, from the surface's rows. */
  vm(dto: GoogleDto, periodDays: number, nowMs?: number): GoogleVM;
  /** What Google finds: for the facts on record, or for the words given. Owners only; the route says so. */
  find(query?: string): Promise<{ ok: boolean; candidates: GoogleCandidateDto[]; query: string; fromFacts: boolean; message: string }>;
  /** This is the business. Owners only. */
  link(placeId: string): Promise<{ ok: boolean; read: boolean; message: string }>;
  /** The listing gone, with what was read from it. Owners only. */
  unlink(): Promise<{ ok: boolean; message: string }>;
  /** Read it now: the profile when connected, the public listing otherwise. Operators and owners. */
  refresh(): Promise<{ ok: boolean; fresh: number; counted: number; message: string }>;
  /** The way to Google's consent screen: the browser leaves the app and comes back to Integrations. Owners only. */
  connect(): void;
  /** The locations the connected account may choose among. Owners only. */
  locations(): Promise<{ ok: boolean; locations: GoogleLocationDto[]; message: string }>;
  /** This one. Owners only. */
  choose(accountName: string, locationName: string): Promise<{ ok: boolean; read: boolean; message: string }>;
  /** The profile disconnected; the listing stays. Owners only. */
  disconnect(): Promise<{ ok: boolean; message: string }>;
  /** An answer to a review, on Google. Operators and owners. */
  reply(id: string, comment: string): Promise<{ ok: boolean; message: string }>;
  /** The receptionist's draft of a reply, for the composer. Nothing is posted. Operators and owners; refused under Never, with the words for it. */
  draft(id: string): Promise<{ ok: boolean; text: string; message: string }>;
  /** What the browser came back from Google with, read once and cleared: "connected", "choose", or an error and why. */
  outcome(): { outcome: string; why: string | null } | null;
  /** The words for each outcome, by the outcome or its reason. */
  outcomeWords: Record<string, string>;
  words: {
    rating: typeof ratingWords;
    stars: typeof starsOf;
    listing: typeof listingLine;
    checked: typeof checkedWords;
    connection: typeof connectionWords;
    snippet: typeof reviewSnippet;
  };
}

declare global {
  interface Window {
    __GOOGLE?: GoogleSurface;
    __google?: GoogleApi;
  }
}

export const googleOverride: SurfaceOverride = {
  key: "google",
  globals: ["__GOOGLE"],
  events: ["surface:google"],
  // The edge writes the listing on every read, the connection on every sync, and a review the first time it is seen.
  refreshOnTables: ["google_listings", "google_reviews", "google_connections"],
  apply: async () => {
    const d = await fetchEnvelope<{ google: GoogleDto }>("/api/v1/google");
    window.__GOOGLE = { dto: d.google, fetchedAt: Date.now() };
  },
};

/** One request to a v1 route: the envelope's data, or its error in a sentence. Never throws. */
async function send<T>(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<{ ok: boolean; data: T | null; message: string }> {
  try {
    const res = await fetch(scoped(path), { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const parsed = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (res.ok) return { ok: true, data: parsed?.data ?? null, message: "" };
    return { ok: false, data: null, message: parsed?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, data: null, message: e instanceof Error ? e.message : String(e) };
  }
}

/** The words the card says for what came back from Google. */
export const CONNECT_OUTCOME_WORDS: Record<string, string> = {
  connected: "Your Business Profile is connected — every review is on Reports now, and replies go through it.",
  choose: "Google is connected. Choose the location this workspace is, and the reviews follow.",
  declined: "Google did not connect: the sign-in was declined.",
  state_expired: "The way back from Google took too long. Start the connection again.",
  state_signature: "The way back from Google could not be verified. Start the connection again.",
  state_missing: "The way back from Google was incomplete. Start the connection again.",
  state_malformed: "The way back from Google was incomplete. Start the connection again.",
  someone_else: "That connection was started by a different account. Start it again from here.",
  not_owner: "Only an owner can connect the Business Profile.",
  no_workspace: "The workspace the connection was started for is not one of yours.",
  no_code: "Google sent nothing back. Start the connection again.",
  scope_missing: "Google connected without access to the Business Profile. Start again and allow it.",
  no_refresh_token: "Google did not hand over a lasting connection. Remove Chanlytics at myaccount.google.com/permissions and connect again.",
  accounts_unreadable: "Google connected but the Business Profile could not be read. Is the Business Profile API enabled and approved for this project?",
  no_locations: "That Google account manages no business locations. Sign in with the account that owns the Business Profile.",
  not_on_maps: "None of that account's locations is on Google Maps yet. Verify one in the Business Profile first.",
  exchange_failed: "Google did not accept the sign-in code. Start the connection again.",
  credentials_failed: "The connection could not be saved safely, so it was not kept. Try again.",
  not_available: "Connecting a Business Profile is not available here yet.",
};

export function installGoogle(win: Window = window): void {
  win.__google = {
    vm: (dto, periodDays, nowMs) => toGoogleVM(dto, periodDays, nowMs),
    async find(query) {
      const r = await send<{ query: string; from_facts: boolean; candidates: GoogleCandidateDto[] }>("/api/v1/google/search", "POST", query ? { query } : {});
      return { ok: r.ok, candidates: r.data?.candidates ?? [], query: r.data?.query ?? query ?? "", fromFacts: r.data?.from_facts === true, message: r.message };
    },
    async link(placeId) {
      const r = await send<{ read?: { ok?: boolean } | null }>("/api/v1/google/link", "POST", { place_id: placeId });
      if (r.ok) await refreshSurfaces([googleOverride, setupOverride]);
      return { ok: r.ok, read: r.data?.read?.ok === true, message: r.message };
    },
    async unlink() {
      const r = await send<{ removed: boolean }>("/api/v1/google/link", "DELETE");
      if (r.ok) await refreshSurfaces([googleOverride, setupOverride]);
      return { ok: r.ok, message: r.message };
    },
    async refresh() {
      const r = await send<{ fresh?: number; counted?: number }>("/api/v1/google/refresh", "POST", {});
      await refreshSurfaces([googleOverride, setupOverride]);
      return { ok: r.ok, fresh: r.data?.fresh ?? 0, counted: r.data?.counted ?? 0, message: r.message };
    },
    connect() {
      win.location.assign(scoped("/api/v1/google/connect"));
    },
    async locations() {
      const r = await send<{ locations: GoogleLocationDto[] }>("/api/v1/google/locations", "GET");
      return { ok: r.ok, locations: r.data?.locations ?? [], message: r.message };
    },
    async choose(accountName, locationName) {
      const r = await send<{ read?: { ok?: boolean } | null }>("/api/v1/google/locations", "POST", { account_name: accountName, location_name: locationName });
      if (r.ok) await refreshSurfaces([googleOverride, setupOverride]);
      return { ok: r.ok, read: r.data?.read?.ok === true, message: r.message };
    },
    async disconnect() {
      const r = await send<{ removed: boolean }>("/api/v1/google/connection", "DELETE");
      if (r.ok) await refreshSurfaces([googleOverride, setupOverride]);
      return { ok: r.ok, message: r.message };
    },
    async reply(id, comment) {
      const r = await send<{ reply_text: string }>(`/api/v1/google/reviews/${encodeURIComponent(id)}/reply`, "POST", { comment });
      if (r.ok) await refreshSurfaces([googleOverride]);
      return { ok: r.ok, message: r.message };
    },
    async draft(id) {
      const r = await send<{ text: string }>(`/api/v1/google/reviews/${encodeURIComponent(id)}/draft`, "POST", {});
      return { ok: r.ok && typeof r.data?.text === "string", text: r.data?.text ?? "", message: r.message };
    },
    outcome() {
      try {
        const q = new URLSearchParams(win.location.search);
        const outcome = q.get("google");
        if (!outcome) return null;
        const why = q.get("why");
        q.delete("google");
        q.delete("why");
        const rest = q.toString();
        win.history.replaceState(null, "", `${win.location.pathname}${rest ? `?${rest}` : ""}${win.location.hash}`);
        return { outcome, why };
      } catch {
        return null;
      }
    },
    outcomeWords: CONNECT_OUTCOME_WORDS,
    words: { rating: ratingWords, stars: starsOf, listing: listingLine, checked: checkedWords, connection: connectionWords, snippet: reviewSnippet },
  };
}
