/**
 * A connected profile synced: every review of its location read, decided
 * against what is on record (packages/channels google-sync.ts), written and
 * told, under the auto mode the new ones answered (review-answers.ts), and
 * last the listing's review link read again from its location (00415).
 * The hourly sweep, "Check now" and a location's bind call it.
 */
import { emitEvent, noteImport, reviewLinkOf, type Database } from "../packages/db.js";
import {
  GBP_REVIEWS_FIRST_PAGES,
  GBP_REVIEWS_MAX_PAGES,
  listReviews,
  planProfileSync,
  readLocation,
  reviewParent,
  type PlacesHttp,
  type ProfileSyncPlan,
} from "../packages/channels.js";
import {
  autoReplyBell,
  lensRoute,
  localDate,
  reviewDraftsBell,
  reviewRoute,
  type EdgeRefusal,
} from "../packages/contracts.js";
import { keepOnce, recordNotification } from "../ops/notify.js";
import { errField, logger, type Logger } from "../log.js";
import { readAllRows } from "../paged.js";
import { http } from "./places.js";
import { aboutReview, reviewRowIds, type ConnectionRow, type Db } from "./google-rows.js";
import { tokenFor } from "./profile-credentials.js";
import { causeOfRead, causeOfToken, syncMended, tellSyncStopped, type SyncCause } from "./sync-notice.js";
import { answerNewReviews } from "./review-answers.js";
import type { CheckResult } from "./listing-check.js";

/** The reviews a sync read, on the imports ledger: the count Google gives (else those read), unanswered, the oldest. */
async function noteReviews(db: Db, tenantId: string, plan: ProfileSyncPlan): Promise<void> {
  const oldest = plan.reviews
    .map((r) => (r.created_at ? Date.parse(r.created_at) : NaN))
    .filter((ms) => Number.isFinite(ms))
    .reduce<number | null>((a, b) => (a === null ? b : Math.min(a, b)), null);
  await noteImport(db, {
    tenantId,
    source: "google_reviews",
    state: plan.complete ? "done" : "running",
    counts: {
      reviews: plan.listing?.review_count ?? plan.reviews.length,
      unanswered: plan.reviews.filter((r) => !r.reply_text).length,
    },
    oldest: oldest === null ? null : new Date(oldest).toISOString(),
    via: "google",
  });
}

/**
 * How many pages of reviews a sync reads: a first sync every review the location has, as far as one sync can (decision
 * 0073, R17); later ones the newest pages.
 */
const reviewPagesOf = (first: boolean): number => (first ? GBP_REVIEWS_FIRST_PAGES : GBP_REVIEWS_MAX_PAGES);

/** A token refusal's words for the connection's `sync_error`: Google's, when it gave some, else the code. */
const syncErrorOf = (r: EdgeRefusal): string => r.detail ?? r.error;

/**
 * What the mirror lets go: on the first sync the public listing's five, whose ids are the public ones, the profile being
 * the record from then on; and after a read that listed every review, the profile's reviews it did not list, which Google
 * no longer shows (decision 0036, 00392). The rows a read listed carry its time, so the rest are older. Or the reviews of
 * these ids (`only`): the new ones a sync takes back off the record when their bell could not be kept (ringNewReviews).
 */
async function letReviewsGo(
  db: Db,
  tenantId: string,
  origin: "places" | "profile",
  which: { seenBefore?: string | null; only?: readonly string[] } = {},
): Promise<void> {
  let q = db.from("google_reviews").delete().eq("tenant_id", tenantId).eq("origin", origin);
  if (which.seenBefore) q = q.lt("last_seen_at", which.seenBefore);
  if (which.only) q = q.in("review_id", [...which.only]);
  const gone = await q;
  if (gone.error) throw new Error(gone.error.message);
}

/** The reviews a read listed, each written over the profile's row of it (one per review id), stamped with the read. */
async function keepReviews(
  db: Db,
  tenantId: string,
  reviews: ReturnType<typeof planProfileSync>["reviews"],
): Promise<void> {
  if (!reviews.length) return;
  const up = await db.from("google_reviews").upsert(
    reviews.map((r) => ({
      tenant_id: tenantId,
      review_id: r.review_id,
      origin: "profile",
      rating: r.rating,
      author: r.author,
      author_uri: null,
      author_photo_uri: r.author_photo_uri,
      body: r.text,
      language_code: null,
      published_at: r.created_at,
      reply_text: r.reply_text,
      replied_at: r.replied_at,
      maps_uri: null,
      last_seen_at: r.last_seen_at,
    })),
    { onConflict: "tenant_id,review_id" },
  );
  if (up.error) throw new Error(up.error.message);
}

/**
 * The new reviews' bells, kept before the sync is stamped (the wiring's second audit, R11 S6-12). A review is news only
 * while it is not on record and was written since the last sync, so a bell lost after the stamp was lost for good. Each
 * reaches the phones too (decision 0040), about the review's row and opening it (contracts reviewRoute), and is kept once
 * under what it tells (notify keepOnce): the review, or the reviews a line groups. One that could not be kept takes the
 * fresh reviews off the record again and fails the sync: unstamped, it is tried next hour, finds them new again, and keeps
 * only the bells still owed.
 */
async function ringNewReviews(db: Db, conn: ConnectionRow, plan: ProfileSyncPlan): Promise<void> {
  if (!plan.bells.length) return;
  const rowIds = await reviewRowIds(
    db,
    conn.tenant_id,
    plan.bells.flatMap((b) => (b.review_id ? [b.review_id] : [])),
  );
  const fresh = plan.fresh.map((r) => r.review_id).sort();
  let lost = false;
  for (const b of plan.bells) {
    const kept = await keepOnce(
      conn.tenant_id,
      {
        kind: "review",
        title: b.title,
        body: b.body,
        ...aboutReview(rowIds, b.review_id),
        onceKey: b.review_id
          ? `review_bell:${conn.tenant_id}:${b.review_id}`
          : `review_bells:${conn.tenant_id}:${fresh.join(",") || String(plan.listing?.review_count ?? "")}`,
      },
      { push: true },
      db,
    );
    if (!kept) lost = true;
  }
  if (!lost) return;
  if (fresh.length) await letReviewsGo(db, conn.tenant_id, "profile", { only: fresh });
  throw new Error("a new review's bell could not be kept; the sync is tried again next hour");
}

/** What the bell is about: the review, when it tells of one by name. */
const aboutOne = (answered: ReadonlyArray<{ id: string }>): { type: string; id: string } | null =>
  answered.length === 1 && answered[0] ? { type: "review", id: answered[0].id } : null;

/** The workspace's listing, changed in place: what a sync read of the rating and the count, or the review link. */
const changeListing = (db: Db, tenantId: string, set: Database["public"]["Tables"]["google_listings"]["Update"]) =>
  db.from("google_listings").update(set).eq("tenant_id", tenantId);

/**
 * The listing's review link (00415) as its bound location gives it now. The bind wrote it from the location it bound
 * (profile-connection.ts); every sync after the first reads that location again, alone, by its name (channels
 * readLocation: one call for an account of any size, its `new_review_uri` read as the bind's list reads it) and writes
 * it as the bind does, null where the location gives none, wherever it differs from what the listing keeps (db
 * reviewLinkOf). So a listing bound before 00415 has its link from its next sync after its first (the card's "Sync
 * now" at once), and one whose location Google gives another link, or none, follows it. It is written only onto the
 * listing of the location's own place on Maps: the write names the place, so a listing the public read linked to
 * another place, or one re-bound to another location while this sync ran, is not matched, and a location Google gives
 * no place (which the bind refuses, not_on_maps) writes and clears nothing. Each of those leaves the link as it is
 * (google_review_link_not_its_place: Google's read succeeded, so not an outage); so does a read that
 * fails or answers another location (google_review_link_read_failed), and a write that fails
 * (google_review_link_write_failed). None fails the sync or reaches its `sync_error`. It runs last, after the bells and
 * the event, so its call to Google never holds them.
 */
async function keepReviewLink(
  db: Db,
  conn: ConnectionRow,
  sync: { token: string; first: boolean; net: PlacesHttp; L: Logger; location: string },
): Promise<void> {
  const { token, net, L, location } = sync;
  // The first sync follows the bind, which wrote the link from the location it had just read.
  if (sync.first) return;
  let link: string | null;
  let place: string;
  try {
    const bound = await readLocation(net, token, location);
    if (bound.name !== location) throw new Error(`Google answered ${bound.name} for ${location}`);
    // Google answered: a location with no place on Maps is a lasting state, never a read that failed.
    if (!bound.place_id) {
      L.warn("google_review_link_not_its_place", { why: "the location has no place on Maps" });
      return;
    }
    if (bound.new_review_uri === (await reviewLinkOf(db, conn.tenant_id))) return;
    link = bound.new_review_uri;
    place = bound.place_id;
  } catch (e) {
    L.warn("google_review_link_read_failed", { error: errField(e) });
    return;
  }
  let wrote;
  try {
    wrote = await changeListing(db, conn.tenant_id, { new_review_uri: link }).eq("place_id", place).select("tenant_id");
    if (wrote.error) throw new Error(wrote.error.message);
  } catch (e) {
    L.warn("google_review_link_write_failed", { error: errField(e) });
    return;
  }
  if (!wrote.data?.length)
    L.warn("google_review_link_not_its_place", { why: "no listing of that place", place_id: place });
}

/**
 * Every review of the connected location, decided against what is on
 * record, written, and told. The first sync replaces the five the public
 * listing showed — their ids are the public listing's, not the profile's —
 * and is history: it raises nothing. A failed sync leaves its words on the
 * connection and is tried again next hour, and its owner is told once the
 * breakage lasts (sync-notice.ts); the first sync that works closes that
 * notice. A sync after the first, last of
 * all, once the reviews are kept, rung and told, reads the listing's review
 * link again from its location (keepReviewLink), which never fails it.
 */
export async function syncProfile(
  db: Db,
  conn: ConnectionRow,
  tz: string,
  now = new Date(),
  net: PlacesHttp = http,
): Promise<CheckResult> {
  const L = logger({ tenant_id: conn.tenant_id, location: conn.location_name ?? "" });
  if (!conn.location_name) return { ok: false, error: "no_location" };
  const failed = async (error: string, cause: SyncCause) => {
    // The stamp is NOT moved, for the reasons checkListing gives above: a
    // profile's `last_synced_at` is its last SUCCESSFUL sync, and moving it on
    // a failed first attempt made the next real sync think it had run before —
    // leaving the Places reviews on file as duplicates for ever and answering
    // reviews the owner had already seen.
    const { error: upErr } = await db
      .from("google_connections")
      .update({ sync_error: error.slice(0, 300) })
      .eq("tenant_id", conn.tenant_id);
    if (upErr) throw new Error(upErr.message);
    L.warn("google_profile_sync_failed", { error, cause });
    await tellSyncStopped(db, conn, { cause, now, L });
    return { ok: false as const, error };
  };
  const t = await tokenFor(db, conn.tenant_id, now.getTime(), net);
  if (!t.ok) return failed(syncErrorOf(t), causeOfToken(t));
  const first = !conn.last_synced_at;
  let page;
  try {
    page = await listReviews(net, t.token, reviewParent(conn.account_name, conn.location_name), reviewPagesOf(first));
  } catch (e) {
    return failed(e instanceof Error ? e.message : String(e), causeOfRead(e));
  }
  // Read before anything is written: whether a notice of a breakage could be open, which the sync that works closes.
  const wasFailing = !!conn.sync_error;
  const known = await readAllRows<{
    review_id: string;
    replied_at: string | null;
    reply_text: string | null;
    origin: string;
  }>("google_reviews", (from, to) =>
    db
      .from("google_reviews")
      .select("review_id, replied_at, reply_text, origin")
      .eq("tenant_id", conn.tenant_id)
      .order("review_id")
      .range(from, to),
  );
  const plan = planProfileSync(
    { last_synced_at: conn.last_synced_at },
    new Map(
      known
        .filter((k) => k.origin === "profile")
        .map((k) => [k.review_id, { updated_at: k.replied_at, reply_text: k.reply_text }]),
    ),
    page,
    localDate(tz, now),
    now.getTime(),
  );
  if (first) await letReviewsGo(db, conn.tenant_id, "places");
  await keepReviews(db, conn.tenant_id, plan.reviews);
  if (plan.prune) await letReviewsGo(db, conn.tenant_id, "profile", { seenBefore: plan.synced_at });
  if (plan.listing) {
    const l = await changeListing(db, conn.tenant_id, plan.listing);
    if (l.error) throw new Error(l.error.message);
  }
  if (plan.day) {
    const d = await db
      .from("google_listing_days")
      .upsert({ tenant_id: conn.tenant_id, ...plan.day }, { onConflict: "tenant_id,day" });
    if (d.error) throw new Error(d.error.message);
  }
  // The new reviews told before the stamp, so a bell that could not be kept is asked for again (ringNewReviews).
  await ringNewReviews(db, conn, plan);
  const done = await db
    .from("google_connections")
    .update({ last_synced_at: plan.synced_at, sync_error: null, reviews_complete: plan.complete })
    .eq("tenant_id", conn.tenant_id);
  if (done.error) throw new Error(done.error.message);
  // A notice of a breakage closes once a sync works: asked where one could be open (sync-notice.ts syncMended).
  if (wasFailing || first) await syncMended(db, conn.tenant_id, "google_connection.synced");
  // The first sync is history, never answered. After that, the row's mode answers what came in on duty (decision 0064:
  // posted under auto, held under Holds it and Ask me, a held reply posted once its time came); a failure here is
  // logged, not thrown.
  const { answered, drafted } = first
    ? { answered: [], drafted: [] }
    : await answerNewReviews(db, conn, reviewParent(conn.account_name, conn.location_name), now, net).catch((e) => {
        L.warn("google_auto_reply_failed", { error: e instanceof Error ? e.message : String(e) });
        return { answered: [], drafted: [] };
      });
  // What went, and what is held for the owner (with when it goes, or that it waits for their OK): one review's bell opens
  // that review (its reply is under it), several open the lens.
  for (const [said, which] of [
    [autoReplyBell(answered), answered],
    [reviewDraftsBell(drafted, tz), drafted],
  ] as const) {
    if (!said) continue;
    const one = aboutOne(which);
    await recordNotification(conn.tenant_id, {
      kind: "review",
      title: said.title,
      body: said.body,
      route: one ? reviewRoute(one.id) : lensRoute("reviews"),
      about: one,
    });
  }
  if (plan.fresh.length) {
    await emitEvent(db, conn.tenant_id, "google.reviews", "listing", null, {
      source: "profile",
      fresh: plan.fresh.length,
      counted: 0,
      rating: plan.listing?.rating ?? null,
      review_count: plan.listing?.review_count ?? null,
    }).catch(() => {});
  }
  // What came in, on the imports ledger as Google's reviews (decision 0073, R23): every one on record, those waiting for a
  // reply, and how far back the oldest goes. A note that fails is logged: the reviews are kept all the same.
  await noteReviews(db, conn.tenant_id, plan).catch((e: unknown) =>
    L.warn("google_profile_sync_failed", { error: errField(e), cause: "ledger" }),
  );
  // Last, once the reviews are kept, rung and told: a slow or killed read of the link costs only the link.
  await keepReviewLink(db, conn, { token: t.token, first, net, L, location: conn.location_name });
  L.info("google_profile_synced", {
    read: plan.reviews.length,
    fresh: plan.fresh.length,
    replied: plan.replied.length,
    answered: answered.length,
    held: drafted.length,
    first,
    rating: plan.listing?.rating ?? null,
    review_count: plan.listing?.review_count ?? null,
  });
  return { ok: true, fresh: plan.fresh.length, counted: 0, answered: answered.length };
}
