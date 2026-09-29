/**
 * The Google door's ops (api/admin/google.ts), decided apart from the wire.
 *
 * Two halves behind one door -- the public listing on Maps, and the owner's
 * Business Profile -- and eleven ops over them, each with its own refusals:
 * what the body must carry, what the deployment must hold, what Google
 * answered. They sat in one function of eighty branches. As with the lines
 * door (lib/lines/line-ops.ts): nothing here reads or writes; each function
 * takes what the door read and says what to answer, write or log, and the
 * door (which reads the rows in the order the ops need them) applies it.
 */
import type { Database } from "../packages/db.js";
import { PLACE_ID, cleanReply, type PlaceDetails } from "../packages/channels.js";
import type { EdgeRefusal, ReviewReplyMode } from "../packages/contracts.js";
import type { LogEvent } from "../log.js";
import { connectionForClient, listingForClient, type ConnectionRow, type ListingRow } from "./google-rows.js";
import type { CheckResult } from "./listing-check.js";
import type { ConnectResult, LocationChoice } from "./profile-connection.js";
import { errorMessage, type DoorAnswer } from "../admin-door.js";

type ListingInsert = Database["public"]["Tables"]["google_listings"]["Insert"];

/** A line the door logs on the plan's behalf; the event names are what alerting greps for and never change. */
interface GoogleLog {
  event: LogEvent;
  fields: Record<string, unknown>;
}

/** The body as the dashboard's /api/v1/google verbs send it; every field is checked here before it is believed. */
export interface GoogleBody {
  op?: string;
  tenant_id?: string;
  user_id?: string;
  place_id?: string;
  query?: string;
  code?: string;
  account_name?: string;
  location_name?: string;
  id?: string;
  comment?: string;
}

/** The listing as the dashboard sees it, or null when the workspace has none. */
export type ListingView = ReturnType<typeof listingForClient> | null;

export const UNKNOWN_GOOGLE_OP: DoorAnswer = {
  status: 400,
  body: {
    ok: false,
    error: "unknown_op",
    detail: "op must be status, search, link, unlink, refresh, connect, locations, choose, disconnect, reply or draft",
  },
};

export const NO_PLACES_KEY: DoorAnswer = { status: 503, body: { ok: false, error: "no_places_key" } };
export const NO_LISTING: DoorAnswer = { status: 404, body: { ok: false, error: "no_listing" } };
export const NOT_CONNECTED: DoorAnswer = { status: 404, body: { ok: false, error: "not_connected" } };

/* ---------------------------------------------------------------- search */

/** A few words become Google's Text Search: folded, at most two hundred characters, at least three. */
export function planPlaceSearch(
  key: string | null,
  rawQuery: unknown,
): { kind: "refuse"; answer: DoorAnswer } | { kind: "search"; key: string; query: string } {
  if (!key) {
    return {
      kind: "refuse",
      answer: {
        status: 503,
        body: {
          ok: false,
          error: "no_places_key",
          hint: "GOOGLE_PLACES_API_KEY on the edge, a key with Places API (New) enabled",
        },
      },
    };
  }
  const query = typeof rawQuery === "string" ? rawQuery.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (query.length < 3) {
    return {
      kind: "refuse",
      answer: {
        status: 400,
        body: {
          ok: false,
          error: "bad_request",
          detail: "query must be a few words: the business name and where it is",
        },
      },
    };
  }
  return { kind: "search", key, query };
}

/** Google's refusal, in Google's words in `detail`, never a throw. */
export function googleFailedAnswer(e: unknown): DoorAnswer {
  return { status: 502, body: { ok: false, error: "google_refused", detail: errorMessage(e) } };
}

/* ------------------------------------------------------------------ link */

export function planLink(
  key: string | null,
  rawPlaceId: unknown,
): { kind: "refuse"; answer: DoorAnswer } | { kind: "link"; key: string; placeId: string } {
  if (!key) return { kind: "refuse", answer: NO_PLACES_KEY };
  const placeId = typeof rawPlaceId === "string" ? rawPlaceId.trim() : "";
  if (!PLACE_ID.test(placeId)) {
    return {
      kind: "refuse",
      answer: { status: 400, body: { ok: false, error: "bad_request", detail: "place_id is required" } },
    };
  }
  return { kind: "link", key, placeId };
}

/** A wrong id is refused here, not kept as a row that never reads. */
export function unreadablePlaceAnswer(e: unknown): DoorAnswer {
  return { status: 502, body: { ok: false, error: "unreadable", detail: errorMessage(e) } };
}

/** The listing row for the place just read: what the read said about it, never what the listing it replaces said. */
export function linkRow(details: PlaceDetails, tenantId: string, userId: string | null, now: Date): ListingInsert {
  return {
    tenant_id: tenantId,
    place_id: details.place_id,
    name: details.name,
    address: details.address,
    maps_uri: details.maps_uri,
    business_status: details.business_status,
    facts: details.facts,
    linked_by: userId,
    linked_at: now.toISOString(),
    rating: null,
    review_count: null,
    checked_at: null,
    check_error: null,
  };
}

export function linkedAnswer(listing: ListingView, saved: ListingRow, read: CheckResult): DoorAnswer {
  return { status: 200, body: { ok: true, listing: listing ?? listingForClient(saved), read } };
}

/* --------------------------------------------------------------- connect */

export function planConnect(
  rawCode: unknown,
): { kind: "refuse"; answer: DoorAnswer } | { kind: "connect"; code: string } {
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!code || code.length > 2000) {
    return {
      kind: "refuse",
      answer: { status: 400, body: { ok: false, error: "bad_request", detail: "code is required" } },
    };
  }
  return { kind: "connect", code };
}

/** One location on Maps binds at once and the listing is read; several wait for the owner's choice. */
export function connectAnswer(r: ConnectResult, listing: ListingView): { answer: DoorAnswer; log: GoogleLog } {
  if (!r.ok) {
    return {
      log: { event: "google_connect_failed", fields: { error: r.error, detail: r.detail?.slice(0, 200) } },
      answer: {
        status: r.error === "no_oauth_client" ? 503 : 502,
        body: { ok: false, error: r.error, detail: r.detail },
      },
    };
  }
  return {
    // The account's domain, never the owner's address: a log line says what happened, not who it happened to.
    log: {
      event: "google_connected",
      fields: { pending: r.pending, email_domain: r.connection.google_email?.split("@")[1] ?? null },
    },
    answer: {
      status: 200,
      body: {
        ok: true,
        pending: r.pending,
        connection: connectionForClient(r.connection),
        ...(r.pending ? { locations: r.locations } : { read: r.read, listing }),
      },
    },
  };
}

/* ----------------------------------------------------------------- draft */

/** A draft and a reply are about one review, named by its row. */
export const NO_REVIEW_ID: DoorAnswer = {
  status: 400,
  body: { ok: false, error: "bad_request", detail: "id (the review's row) is required" },
};

/** The Autonomy row, read once for the dashboard's draft and the sweep's replies alike: Never refuses before the review is read. */
export function draftRefusal(mode: ReviewReplyMode): DoorAnswer | null {
  return mode === "never" ? { status: 409, body: { ok: false, error: "policy_never", mode } } : null;
}

export function draftAnswer(
  id: string,
  mode: ReviewReplyMode,
  r: { ok: true; text: string } | EdgeRefusal,
): { answer: DoorAnswer; log: GoogleLog } {
  if (!r.ok) {
    return {
      log: { event: "google_review_draft_failed", fields: { id, error: r.error } },
      answer: { status: r.error === "no_review" ? 404 : r.error === "no_model_key" ? 503 : 502, body: r },
    };
  }
  return {
    log: { event: "google_review_drafted", fields: { id, chars: r.text.length } },
    answer: { status: 200, body: { ok: true, text: r.text, mode } },
  };
}

/* ---------------------------------------------------- locations, choose */

type LocationsRead = { ok: true; locations: LocationChoice[] } | EdgeRefusal;

export function locationsAnswer(r: LocationsRead): DoorAnswer {
  return { status: r.ok ? 200 : 502, body: r };
}

export function planChoose(
  conn: ConnectionRow | null,
  rawAccount: unknown,
  rawLocation: unknown,
):
  | { kind: "refuse"; answer: DoorAnswer }
  | { kind: "choose"; conn: ConnectionRow; accountName: string; locationName: string } {
  if (!conn) return { kind: "refuse", answer: NOT_CONNECTED };
  const accountName = typeof rawAccount === "string" ? rawAccount.trim() : "";
  const locationName = typeof rawLocation === "string" ? rawLocation.trim() : "";
  if (!/^accounts\/[\w-]{1,64}$/.test(accountName) || !/^locations\/[\w-]{1,64}$/.test(locationName)) {
    return {
      kind: "refuse",
      answer: {
        status: 400,
        body: { ok: false, error: "bad_request", detail: "account_name and location_name are required" },
      },
    };
  }
  return { kind: "choose", conn, accountName, locationName };
}

/** The choice is proven against what the account may manage, never taken on the client's word. */
export function chosenLocation(
  r: LocationsRead,
  accountName: string,
  locationName: string,
): { kind: "refuse"; answer: DoorAnswer } | { kind: "bind"; loc: LocationChoice } {
  if (!r.ok) return { kind: "refuse", answer: { status: 502, body: { ok: false, error: r.error, detail: r.detail } } };
  const loc = r.locations.find((l) => l.account_name === accountName && l.name === locationName);
  if (!loc) return { kind: "refuse", answer: { status: 404, body: { ok: false, error: "no_such_location" } } };
  return { kind: "bind", loc };
}

type BindResult = { ok: true; connection: ConnectionRow; read: CheckResult } | EdgeRefusal;

export function bindFailedAnswer(bound: Extract<BindResult, { ok: false }>): DoorAnswer {
  return { status: 502, body: { ok: false, error: bound.error, detail: bound.detail } };
}

export function chosenAnswer(bound: Extract<BindResult, { ok: true }>, listing: ListingView): DoorAnswer {
  return {
    status: 200,
    body: { ok: true, connection: connectionForClient(bound.connection), listing, read: bound.read },
  };
}

/* ----------------------------------------------------------------- reply */

/** An answer to a review: the row it is under (null when the body named none), and the comment cleaned as Google accepts it. */
export function planReply(
  id: string | null,
  rawComment: unknown,
): { kind: "refuse"; answer: DoorAnswer } | { kind: "reply"; id: string; comment: string } {
  const comment = cleanReply(rawComment);
  if (!id) return { kind: "refuse", answer: NO_REVIEW_ID };
  if (!comment)
    return {
      kind: "refuse",
      answer: { status: 400, body: { ok: false, error: "bad_request", detail: "comment is required" } },
    };
  return { kind: "reply", id, comment };
}

export function replyAnswer(r: { ok: true } | EdgeRefusal): DoorAnswer {
  if (r.ok) return { status: 200, body: r };
  const status =
    r.error === "not_connected" || r.error === "not_from_profile" ? 409 : r.error === "no_review" ? 404 : 502;
  return { status, body: r };
}

/* --------------------------------------------------------------- refresh */

/** Read now: the profile when connected, the public listing otherwise; what the dashboard sees either way. */
export function refreshAnswer(read: CheckResult, listing: ListingView, connection: unknown): DoorAnswer {
  return { status: read.ok ? 200 : 502, body: { ok: read.ok, read, listing, connection } };
}
