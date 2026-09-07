/**
 * Google on the classic pages: the listing as the edge last read it
 * (/api/v1/google → window.__GOOGLE, repainted as the tables change), the
 * view model the Reports section and Today's line derive from it
 * (contracts/google.ts), and the owner's verbs — find, link, unlink,
 * refresh — each of which refreshes this surface and Setup's, since the
 * Setup row reads the same fact.
 */
import { toGoogleVM, ratingWords, starsOf, listingLine, checkedWords, reviewSnippet, type GoogleDto, type GoogleVM, type GoogleCandidateDto } from "@chanlytics/contracts";
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
  /** Read it now. Operators and owners. */
  refresh(): Promise<{ ok: boolean; fresh: number; counted: number; message: string }>;
  words: {
    rating: typeof ratingWords;
    stars: typeof starsOf;
    listing: typeof listingLine;
    checked: typeof checkedWords;
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
  // The edge writes the listing on every read and a review the first time it is seen.
  refreshOnTables: ["google_listings", "google_reviews"],
  apply: async () => {
    const d = await fetchEnvelope<{ google: GoogleDto }>("/api/v1/google");
    window.__GOOGLE = { dto: d.google, fetchedAt: Date.now() };
  },
};

/** One request to a v1 route: the envelope's data, or its error in a sentence. Never throws. */
async function send<T>(path: string, method: "POST" | "DELETE", body?: unknown): Promise<{ ok: boolean; data: T | null; message: string }> {
  try {
    const res = await fetch(scoped(path), { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const parsed = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (res.ok) return { ok: true, data: parsed?.data ?? null, message: "" };
    return { ok: false, data: null, message: parsed?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, data: null, message: e instanceof Error ? e.message : String(e) };
  }
}

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
    words: { rating: ratingWords, stars: starsOf, listing: listingLine, checked: checkedWords, snippet: reviewSnippet },
  };
}
