/**
 * Google: the listing and the connection as the edge last read them (/api/v1/google, the seam's `google` value,
 * repainted as the tables change), the view model the Reports section and Today's line derive from it
 * (contracts/google.ts), and the verbs (`googleVerbs`, which Settings › Connections and the first run's Find import) — find, link, unlink, refresh,
 * connect, locations, choose, disconnect, reply, draft — each through the
 * typed client. After a write lands the refresh map re-reads this surface
 * and Setup's, since the Setup row reads the same facts; a draft touches
 * nothing and refreshes nothing.
 *
 * It is read where it is drawn and nowhere else: Today's review line and Settings' Connections pane name it in `ROUTE_DRAWS`, and
 * every other page leaves it alone (`onDemand`). The Reviews lens draws from its own read (surfaces/reports/reviews-surface.ts), which
 * carries Google's own beside its ledger and publishes it here (`publishGoogleRead`), so while the lens is on screen this surface is
 * not read for the same events a second time.
 */
import {
  toGoogleVM,
  ratingWords,
  starsOf,
  listingLine,
  checkedWords,
  connectionWords,
  reviewSnippet,
  reviewNoticeIsAbout,
  type GoogleDto,
  type GoogleReadDto,
  type GoogleVM,
  type GoogleCandidateDto,
  type GoogleLocationDto,
} from "@chanlytics/contracts";
import { readAged, type SurfaceOverride } from "./surface-data";
import { api, read } from "./api";
import { bellNow } from "./notifications";
import { declareReads, ownsTheScreen } from "./surface-registry";
import { surfaceMoved } from "./surface-status";
import { routeOnScreen } from "./workspace";
import { setSurfaceValue, surfaceValue } from "../surfaces/surface-values";

export interface GoogleSurface {
  dto: GoogleDto;
  fetchedAt: number;
}

export interface GoogleApi {
  /** The view model for a period, from the surface's rows, said at `nowMs` in the workspace's zone. */
  vm(dto: GoogleDto, periodDays: number, nowMs: number, tz: string): GoogleVM;
  /** What Google finds: for the facts on record, or for the words given. Owners only; the route says so. */
  find(
    query?: string,
  ): Promise<{ ok: boolean; candidates: GoogleCandidateDto[]; query: string; fromFacts: boolean; message: string }>;
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

/** Whether Google has been read at all in what this tab holds, and within the measure every on-demand read is held to (`readAged`): when not, it wants a read. */
function googleIsStale(): boolean {
  return readAged(surfaceValue("google")?.fetchedAt);
}

/**
 * Google's read as another read of the same facts carried it: the Reviews lens's, which holds the listing, the connection, the newest
 * reviews and the daily readings beside its ledger. Published as Google's own, so Today's line and Connections hold what the lens just
 * saw. Only where this tab already holds Google's: what this deployment can do (`ready`) is the one thing that read does not carry, and
 * is Google's alone.
 */
export function publishGoogleRead(google: GoogleReadDto, readAt: number): void {
  const held = surfaceValue("google");
  if (!held) return;
  setSurfaceValue("google", { dto: { ...google, ready: held.dto.ready }, fetchedAt: readAt });
  surfaceMoved("google");
}

export const googleOverride: SurfaceOverride = {
  key: "google",
  value: "google",
  // Read where Today's line and Settings' Connections pane are drawn, as they come on screen, and again then when the read has aged.
  // The live feed (below) and a write's refresh by name (refresh-map.ts) keep what is held current meanwhile.
  onDemand: true,
  isStale: googleIsStale,
  events: ["surface:google"],
  // The edge writes the listing on every read, the connection on every sync, a review the first time it is seen, and its answer,
  // by the receptionist, a teammate or on Google (told when the reply moved, 00431: Today's line and the bell's "New on Google"
  // close at once; the wiring's second audit, S4-1). And the rule
  // that says whether the receptionist answers a review on its own, which its read carries (W-review-facts-rules-8): a few a month.
  ...declareReads("google", {
    reads: ["review", "rules"],
    fresh: "live",
    // Not while the Reviews lens is on screen: its own read hears the same tables and publishes Google's beside its ledger.
    when: () => !ownsTheScreen("reports_reviews", routeOnScreen()),
  }),
  apply: async () => {
    const d = await read("GET google");
    setSurfaceValue("google", { dto: d.google, fetchedAt: Date.now() });
  },
};

/**
 * An answered review is dealt with: the bell's rows that told of it (a new one, or that the receptionist replied) are read, on the
 * server, so the badge and Today's While you were away stop counting it on every device. Its notices were kept about Google's own id
 * for the review or about its row (reviewNoticeIsAbout takes either), so the surface Google's read holds names both.
 */
function readNoticesOfReview(id: string): void {
  if (typeof window === "undefined") return;
  const held = surfaceValue("google")?.dto.reviews.find((r) => r.id === id);
  const review = { id, reviewId: held?.review_id ?? null };
  bellNow()?.readWhere((n) => n.kind === "review" && reviewNoticeIsAbout(n.about, review));
}

/** An answer to a review, on Google. Operators and owners. Answered, its notices are read. */
export async function replyToReview(id: string, comment: string): Promise<{ ok: boolean; message: string }> {
  const r = await api()("POST google/reviews/[id]/reply", { params: { id }, body: { comment }, once: true });
  if (r.ok) readNoticesOfReview(id);
  return { ok: r.ok, message: r.ok ? "" : r.message };
}

/** The receptionist's draft of a reply, for the composer. Nothing is posted. Refused under Never, with the words for it. */
export async function draftReply(id: string): Promise<{ ok: boolean; text: string; message: string }> {
  const r = await api()("POST google/reviews/[id]/draft", { params: { id }, body: {}, once: true });
  if (!r.ok) return { ok: false, text: "", message: r.message };
  return { ok: typeof r.data.text === "string", text: r.data.text ?? "", message: "" };
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
  not_owner: "Only an owner or the workspace's partner can connect the Business Profile.",
  no_workspace: "The workspace the connection was started for is not one of yours.",
  no_code: "Google sent nothing back. Start the connection again.",
  scope_missing: "Google connected without access to the Business Profile. Start again and allow it.",
  no_refresh_token:
    "Google did not hand over a lasting connection. Remove Chanlytics at myaccount.google.com/permissions and connect again.",
  accounts_unreadable:
    "Google connected but the Business Profile could not be read. Is the Business Profile API enabled and approved for this project?",
  no_locations:
    "That Google account manages no business locations. Sign in with the account that owns the Business Profile.",
  not_on_maps: "None of that account's locations is on Google Maps yet. Verify one in the Business Profile first.",
  exchange_failed: "Google did not accept the sign-in code. Start the connection again.",
  credentials_failed: "The connection could not be saved safely, so it was not kept. Try again.",
  not_available: "Connecting a Business Profile is not available here yet.",
};

/** Google's verbs, each through its door. */
export const googleVerbs: GoogleApi = {
  // The Google surface reads a period that ends today: no day is named for it to stop at.
  vm: (dto, periodDays, nowMs, tz) => toGoogleVM(dto, { days: periodDays, until: null }, nowMs, tz),
  async find(query) {
    const r = await api()("POST google/search", { body: query ? { query } : {} });
    if (!r.ok) return { ok: false, candidates: [], query: query ?? "", fromFacts: false, message: r.message };
    return {
      ok: true,
      candidates: r.data.candidates,
      query: r.data.query,
      fromFacts: r.data.from_facts === true,
      message: "",
    };
  },
  async link(placeId) {
    const r = await api()("POST google/link", { body: { place_id: placeId } });
    return { ok: r.ok, read: r.ok && r.data.read?.ok === true, message: r.ok ? "" : r.message };
  },
  async unlink() {
    const r = await api()("DELETE google/link");
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
  async refresh() {
    const r = await api()("POST google/refresh", { body: {} });
    if (!r.ok) return { ok: false, fresh: 0, counted: 0, message: r.message };
    return { ok: true, fresh: r.data.fresh, counted: r.data.counted, message: "" };
  },
  connect() {
    window.location.assign(api().url("GET google/connect"));
  },
  async locations() {
    const r = await api()("GET google/locations");
    if (!r.ok) return { ok: false, locations: [], message: r.message };
    return { ok: true, locations: r.data.locations, message: "" };
  },
  async choose(accountName, locationName) {
    const r = await api()("POST google/locations", {
      body: { account_name: accountName, location_name: locationName },
    });
    return { ok: r.ok, read: r.ok && r.data.read?.ok === true, message: r.ok ? "" : r.message };
  },
  async disconnect() {
    const r = await api()("DELETE google/connection");
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
  reply: replyToReview,
  draft: draftReply,
  outcome() {
    try {
      const q = new URLSearchParams(window.location.search);
      const outcome = q.get("google");
      if (!outcome) return null;
      const why = q.get("why");
      q.delete("google");
      q.delete("why");
      const rest = q.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
      );
      return { outcome, why };
    } catch {
      return null;
    }
  },
  outcomeWords: CONNECT_OUTCOME_WORDS,
  words: {
    rating: ratingWords,
    stars: starsOf,
    listing: listingLine,
    checked: checkedWords,
    connection: connectionWords,
    snippet: reviewSnippet,
  },
};
