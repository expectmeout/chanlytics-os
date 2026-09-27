/**
 * POST /api/admin/google — a workspace's listing on Google Maps, found and
 * read; its Business Profile, connected and answered from. Diagnostic-key
 * only; the dashboard's /api/v1/google verbs call it for an owner or an
 * operator.
 *
 *   { op: "status" }                                       → what this deployment can do, and the public half of the OAuth client
 *   { op: "search", query }                                → what Google finds for the words
 *   { op: "link", tenant_id, user_id, place_id }           → the listing on record, read at once
 *   { op: "unlink", tenant_id }                            → the listing, its reviews, its days and its connection, gone
 *   { op: "refresh", tenant_id }                           → read it now: the profile when connected, the public listing otherwise
 *   { op: "connect", tenant_id, user_id, code }            → the code from Google becomes the connection; one location binds at once, several wait
 *   { op: "locations", tenant_id }                         → the locations the connected account may choose among
 *   { op: "choose", tenant_id, user_id, account_name, location_name } → the chosen location becomes the listing, synced at once
 *   { op: "disconnect", tenant_id }                        → the grant given back, the token gone, the profile's reviews gone
 *   { op: "reply", tenant_id, user_id, id, comment }       → an answer to a review, on Google and on the row
 *   { op: "draft", tenant_id, id }                         → the receptionist's draft of a reply, for a person to send; refused under Never
 *
 * The key and the client secret live here and nowhere else. Without them the
 * ops that need them say so, and the dashboard draws nothing it cannot do.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What each op does with what it
 * read is decided in lib/google/google-ops.ts; what is left here is the
 * knock, the reads in the order the ops need them -- the connection, then the
 * listing, each read once for the ops past it -- the writes, the log and the
 * shape the dashboard wants back.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { readBody, respond, workspaceOf, workspaceRow, type Refused } from "../../lib/admin-door.js";
import { emitEvent } from "../../lib/packages/db.js";
import { UUID } from "../../lib/packages/contracts.js";
import type { PlaceDetails } from "../../lib/packages/channels.js";
import {
  bindLocation,
  checkListing,
  connectProfile,
  connectionForClient,
  disconnectProfile,
  draftFor,
  findPlaces,
  googleReadiness,
  listingForClient,
  locationsFor,
  placesKey,
  profilePublic,
  readPlace,
  replyOnProfile,
  reviewReplyMode,
  syncProfile,
  type ConnectionRow,
  type ListingRow,
} from "../../lib/google/google.js";
import { logger, type Logger } from "../../lib/log.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/packages/db.js";
import {
  type GoogleBody,
  type ListingView,
  UNKNOWN_GOOGLE_OP,
  NO_PLACES_KEY,
  NO_LISTING,
  NOT_CONNECTED,
  NO_REVIEW_ID,
  planPlaceSearch,
  googleFailedAnswer,
  planLink,
  unreadablePlaceAnswer,
  linkRow,
  linkedAnswer,
  planConnect,
  connectAnswer,
  draftRefusal,
  draftAnswer,
  locationsAnswer,
  planChoose,
  chosenLocation,
  bindFailedAnswer,
  chosenAnswer,
  planReply,
  replyAnswer,
  refreshAnswer,
} from "../../lib/google/google-ops.js";

type Db = SupabaseClient<Database>;

/** An op's call past the knock: a database, the workspace on record with its clock, who pressed the button, and the log. */
interface GoogleCall {
  body: GoogleBody;
  db: Db;
  tenantId: string;
  tz: string;
  userId: string | null;
  L: Logger;
}

type OnWorkspace = (c: GoogleCall) => Promise<Response>;
type OnConnection = (c: GoogleCall, conn: ConnectionRow | null) => Promise<Response>;
type OnListing = (c: GoogleCall, conn: ConnectionRow | null, row: ListingRow | null) => Promise<Response>;

/**
 * The ops, by what they need read first: the workspace alone; then the
 * connection; then the listing too. An op runs once the reads before it are
 * done, so the reads are the phases, and an op nobody knows falls through all
 * of them.
 */
const ON_WORKSPACE: Record<"link" | "connect" | "draft", OnWorkspace> = { link, connect, draft };
const ON_CONNECTION: Record<"locations" | "choose" | "disconnect" | "reply", OnConnection> = {
  locations,
  choose,
  disconnect,
  reply,
};
const ON_LISTING: Record<"unlink" | "refresh", OnListing> = { unlink, refresh };

const pick = <T>(table: Record<string, T>, op: string): T | null => (Object.hasOwn(table, op) ? table[op] : null);
/** A review's row, as the body names it, or null. */
const reviewIdOf = (v: unknown): string | null => {
  const id = typeof v === "string" ? v.trim() : "";
  return UUID.test(id) ? id : null;
};

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/google");
  if (!auth.ok) return auth.response;
  const body = await readBody<GoogleBody>(request);
  const op = typeof body.op === "string" ? body.op : "";
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;

  if (op === "status") return json(200, { ok: true, ready: googleReadiness(), profile: profilePublic() });
  if (op === "search") return search(body);

  const call = await workspaceCall(body);
  if (!call.ok) return call.response;
  const c = call.value;
  const onWorkspace = pick(ON_WORKSPACE, op);
  if (onWorkspace) return onWorkspace(c);
  const conn = await c.db.from("google_connections").select("*").eq("tenant_id", c.tenantId).maybeSingle();
  if (conn.error) return json(503, { ok: false, error: conn.error.message });
  const onConnection = pick(ON_CONNECTION, op);
  if (onConnection) return onConnection(c, conn.data);
  const row = await c.db.from("google_listings").select("*").eq("tenant_id", c.tenantId).maybeSingle();
  if (row.error) return json(503, { ok: false, error: row.error.message });
  const onListing = pick(ON_LISTING, op);
  if (onListing) return onListing(c, conn.data, row.data);
  return respond(UNKNOWN_GOOGLE_OP);
}

/** Past status and search every op needs a database and a workspace on record, with its clock and who is asking. */
async function workspaceCall(body: GoogleBody): Promise<{ ok: true; value: GoogleCall } | Refused> {
  const ws = workspaceOf(body.tenant_id);
  if (!ws.ok) return ws;
  const { db, tenantId } = ws;
  const read = await db.from("tenants").select("id, timezone").eq("id", tenantId).maybeSingle();
  const tenant = workspaceRow(read);
  if (!tenant.ok) return tenant;
  const tz = tenant.row.timezone || "America/New_York";
  const userId = typeof body.user_id === "string" && UUID.test(body.user_id) ? body.user_id : null;
  return { ok: true, value: { body, db, tenantId, tz, userId, L: logger({ tenant: tenantId }) } };
}

/** The listing as the dashboard sees it, read now. */
async function listingNow(c: GoogleCall): Promise<ListingView> {
  const r = await c.db.from("google_listings").select("*").eq("tenant_id", c.tenantId).maybeSingle();
  return r.data ? listingForClient(r.data) : null;
}

/** The connection as the dashboard sees it, read now. */
async function connectionNow(c: GoogleCall) {
  const r = await c.db.from("google_connections").select("*").eq("tenant_id", c.tenantId).maybeSingle();
  return r.data ? connectionForClient(r.data) : null;
}

/* ---------------------------------------------------------------- search */

/** What Google finds for the words: a question to Google, not to the database, and it needs no workspace. */
async function search(body: GoogleBody): Promise<Response> {
  const plan = planPlaceSearch(placesKey(), body.query);
  if (plan.kind === "refuse") return respond(plan.answer);
  try {
    const candidates = await findPlaces(plan.key, plan.query);
    return json(200, { ok: true, query: plan.query, candidates });
  } catch (e) {
    return respond(googleFailedAnswer(e));
  }
}

/* ------------------------------------------------------------------ link */

async function link(c: GoogleCall): Promise<Response> {
  const plan = planLink(placesKey(), c.body.place_id);
  if (plan.kind === "refuse") return respond(plan.answer);
  // Read it before writing anything: a wrong id is refused here, not kept as a row that never reads.
  let details: PlaceDetails;
  try {
    details = await readPlace(plan.key, plan.placeId);
  } catch (e) {
    return respond(unreadablePlaceAnswer(e));
  }
  const saved = await c.db
    .from("google_listings")
    .upsert(linkRow(details, c.tenantId, c.userId, new Date()), { onConflict: "tenant_id" })
    .select("*")
    .single();
  if (saved.error || !saved.data) return json(500, { ok: false, error: saved.error?.message ?? "write_failed" });
  // A new listing forgets the old one's reviews and days: they were another place's.
  await c.db.from("google_reviews").delete().eq("tenant_id", c.tenantId);
  await c.db.from("google_listing_days").delete().eq("tenant_id", c.tenantId);
  // The link reads the listing's website too, for the booking page it names: the only read that does.
  const read = await checkListing(c.db, saved.data, c.tz, "read");
  await emitEvent(c.db, c.tenantId, "google.linked", "google", "listing", null, {
    place_id: details.place_id,
    name: details.name,
    by: c.userId,
    read: read.ok,
  }).catch(() => {});
  c.L.info("google_linked", { place_id: details.place_id, read: read.ok });
  return respond(linkedAnswer(await listingNow(c), saved.data, read));
}

/* --------------------------------------------------------------- connect */

async function connect(c: GoogleCall): Promise<Response> {
  const plan = planConnect(c.body.code);
  if (plan.kind === "refuse") return respond(plan.answer);
  const r = await connectProfile(c.db, c.tenantId, c.userId, plan.code, c.tz);
  const { answer, log } = connectAnswer(r, r.ok && !r.pending ? await listingNow(c) : null);
  c.L.info(log.event, log.fields);
  return respond(answer);
}

/* ----------------------------------------------------------------- draft */

async function draft(c: GoogleCall): Promise<Response> {
  const id = reviewIdOf(c.body.id);
  if (!id) return respond(NO_REVIEW_ID);
  // The Autonomy row is read here, once, for the dashboard's draft and the sweep's replies alike.
  const mode = await reviewReplyMode(c.db, c.tenantId);
  const never = draftRefusal(mode);
  if (never) return respond(never);
  const { answer, log } = draftAnswer(id, mode, await draftFor(c.db, c.tenantId, id));
  c.L.info(log.event, log.fields);
  return respond(answer);
}

/* ---------------------------------------------------- locations, choose */

async function locations(c: GoogleCall, conn: ConnectionRow | null): Promise<Response> {
  if (!conn) return respond(NOT_CONNECTED);
  return respond(locationsAnswer(await locationsFor(c.db, c.tenantId)));
}

async function choose(c: GoogleCall, conn: ConnectionRow | null): Promise<Response> {
  const plan = planChoose(conn, c.body.account_name, c.body.location_name);
  if (plan.kind === "refuse") return respond(plan.answer);
  const chosen = chosenLocation(await locationsFor(c.db, c.tenantId), plan.accountName, plan.locationName);
  if (chosen.kind === "refuse") return respond(chosen.answer);
  const bound = await bindLocation(c.db, plan.conn, chosen.loc, c.userId, c.tz);
  if (!bound.ok) return respond(bindFailedAnswer(bound));
  c.L.info("google_location_chosen", { location: chosen.loc.name, read: bound.read.ok });
  return respond(chosenAnswer(bound, await listingNow(c)));
}

/* ----------------------------------------------------- disconnect, reply */

async function disconnect(c: GoogleCall): Promise<Response> {
  const r = await disconnectProfile(c.db, c.tenantId);
  c.L.info("google_disconnected", { removed: r.removed, revoked: r.revoked });
  return json(200, r);
}

async function reply(c: GoogleCall): Promise<Response> {
  const plan = planReply(reviewIdOf(c.body.id), c.body.comment);
  if (plan.kind === "refuse") return respond(plan.answer);
  const r = await replyOnProfile(c.db, c.tenantId, plan.id, plan.comment);
  if (r.ok) c.L.info("google_replied", { id: plan.id });
  return respond(replyAnswer(r));
}

/* ------------------------------------------------------- unlink, refresh */

/** The listing, its reviews and its days, gone -- the profile disconnected first, the grant given back on the way. */
async function unlink(c: GoogleCall, conn: ConnectionRow | null, row: ListingRow | null): Promise<Response> {
  if (conn) await disconnectProfile(c.db, c.tenantId);
  if (!row) return json(200, { ok: true, removed: false });
  const del = await c.db.from("google_listings").delete().eq("tenant_id", c.tenantId);
  if (del.error) return json(500, { ok: false, error: del.error.message });
  await emitEvent(c.db, c.tenantId, "google.unlinked", "google", "listing", null, {
    place_id: row.place_id,
    name: row.name,
    had_profile: !!conn,
  }).catch(() => {});
  c.L.info("google_unlinked", { place_id: row.place_id });
  return json(200, { ok: true, removed: true });
}

async function refresh(c: GoogleCall, conn: ConnectionRow | null, row: ListingRow | null): Promise<Response> {
  if (conn && conn.location_name) {
    const read = await syncProfile(c.db, conn, c.tz);
    return respond(refreshAnswer(read, await listingNow(c), await connectionNow(c)));
  }
  if (!row) return respond(NO_LISTING);
  if (!placesKey()) return respond(NO_PLACES_KEY);
  const read = await checkListing(c.db, row, c.tz, "keep");
  return respond(refreshAnswer(read, await listingNow(c), null));
}
