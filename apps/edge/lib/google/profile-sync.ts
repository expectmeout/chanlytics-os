/**
 * A connected profile synced: every review of its location read, decided
 * against what is on record (packages/channels google-sync.ts), written and
 * told, the listing's review link read again from its location (00408), and
 * under the auto mode the new ones answered (review-answers.ts).
 * The hourly sweep, "Check now" and a location's bind call it.
 */
import { emitEvent, reviewLinkOf, type Database } from "../packages/db.js";
import { listLocations, listReviews, planProfileSync, reviewParent, type PlacesHttp } from "../packages/channels.js";
import { autoReplyBell, lensRoute, localDate, type EdgeRefusal } from "../packages/contracts.js";
import { keepAndPush, recordNotification } from "../ops/notify.js";
import { errField, logger, type Logger } from "../log.js";
import { readAllRows } from "../paged.js";
import { http } from "./places.js";
import type { ConnectionRow, Db } from "./google-rows.js";
import { tokenFor } from "./profile-credentials.js";
import { answerNewReviews } from "./review-answers.js";
import type { CheckResult } from "./listing-check.js";

/** A token refusal's words for the connection's `sync_error`: Google's, when it gave some, else the code. */
const syncErrorOf = (r: EdgeRefusal): string => r.detail ?? r.error;

/**
 * What the mirror lets go: on the first sync the public listing's five, whose ids are the public ones, the profile being
 * the record from then on; and after a read that listed every review, the profile's reviews it did not list, which Google
 * no longer shows (decision 0036, 00392). The rows a read listed carry its time, so the rest are older.
 */
async function letReviewsGo(
  db: Db,
  tenantId: string,
  origin: "places" | "profile",
  seenBefore: string | null,
): Promise<void> {
  let q = db.from("google_reviews").delete().eq("tenant_id", tenantId).eq("origin", origin);
  if (seenBefore) q = q.lt("last_seen_at", seenBefore);
  const gone = await q;
  if (gone.error) throw new Error(gone.error.message);
}

/** What the bell is about: the review, when it tells of one by name. */
const aboutOne = (answered: ReadonlyArray<{ id: string }>): { type: string; id: string } | null =>
  answered.length === 1 && answered[0] ? { type: "review", id: answered[0].id } : null;

/** The workspace's listing, changed in place: what a sync read of the rating and the count, or the review link. */
const changeListing = (db: Db, tenantId: string, set: Database["public"]["Tables"]["google_listings"]["Update"]) =>
  db.from("google_listings").update(set).eq("tenant_id", tenantId);

/**
 * The listing's review link (00408) as its bound location gives it now. The bind wrote it from the location it bound
 * (profile-connection.ts); every sync after the first reads that location again with the same reader (channels
 * listLocations, its `new_review_uri`) and writes it as the bind does, null where the location gives none, wherever it
 * differs from what the listing keeps (db reviewLinkOf). So a listing bound before 00408 has its link from its next
 * sync (the card's "Sync now" at once), and one whose location Google gives another link, or none, follows it. A read
 * that fails, or that does not list the bound location, leaves the link as it is, and so does a write that fails: each
 * is logged, and neither fails the sync or reaches its `sync_error`.
 */
async function keepReviewLink(
  db: Db,
  conn: ConnectionRow,
  sync: { token: string; first: boolean; net: PlacesHttp; L: Logger },
): Promise<void> {
  const { token, net, L } = sync;
  // The first sync follows the bind, which wrote the link from the location it had just read.
  if (sync.first) return;
  let link: string | null;
  try {
    const bound = (await listLocations(net, token, conn.account_name)).find((l) => l.name === conn.location_name);
    if (!bound) throw new Error(`${conn.location_name} is not among the locations of ${conn.account_name}`);
    if (bound.new_review_uri === (await reviewLinkOf(db, conn.tenant_id))) return;
    link = bound.new_review_uri;
  } catch (e) {
    L.warn("google_review_link_read_failed", { error: errField(e) });
    return;
  }
  try {
    const { error } = await changeListing(db, conn.tenant_id, { new_review_uri: link });
    if (error) throw new Error(error.message);
  } catch (e) {
    L.warn("google_review_link_write_failed", { error: errField(e) });
  }
}

/**
 * Every review of the connected location, decided against what is on
 * record, written, and told. The first sync replaces the five the public
 * listing showed — their ids are the public listing's, not the profile's —
 * and is history: it raises nothing. A failed sync leaves its words on the
 * connection and is tried again next hour. A sync after the first, once the
 * reviews are kept, reads the listing's review link again from its location
 * (keepReviewLink), which never fails it.
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
  const failed = async (error: string) => {
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
    L.warn("google_profile_sync_failed", { error });
    return { ok: false as const, error };
  };
  const t = await tokenFor(db, conn.tenant_id, now.getTime(), net);
  if (!t.ok) return failed(syncErrorOf(t));
  let page;
  try {
    page = await listReviews(net, t.token, reviewParent(conn.account_name, conn.location_name));
  } catch (e) {
    return failed(e instanceof Error ? e.message : String(e));
  }
  const first = !conn.last_synced_at;
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
  if (first) await letReviewsGo(db, conn.tenant_id, "places", null);
  if (plan.reviews.length) {
    const up = await db.from("google_reviews").upsert(
      plan.reviews.map((r) => ({
        tenant_id: conn.tenant_id,
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
  if (plan.prune) await letReviewsGo(db, conn.tenant_id, "profile", plan.synced_at);
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
  const done = await db
    .from("google_connections")
    .update({ last_synced_at: plan.synced_at, sync_error: null, reviews_complete: plan.complete })
    .eq("tenant_id", conn.tenant_id);
  if (done.error) throw new Error(done.error.message);
  await keepReviewLink(db, conn, { token: t.token, first, net, L });
  // A new review reaches the phones too (decision 0040); what the receptionist answered is the bell's line alone.
  for (const b of plan.bells) {
    await keepAndPush(conn.tenant_id, {
      kind: "review",
      title: b.title,
      body: b.body,
      route: lensRoute("reviews"),
      about: b.review_id ? { type: "review", id: b.review_id } : null,
    });
  }
  // The first sync is history, never answered. After that, the auto mode
  // answers what came in on duty; a failure here is logged, not thrown.
  const answered = first
    ? []
    : await answerNewReviews(db, conn, reviewParent(conn.account_name, conn.location_name), now, net).catch((e) => {
        L.warn("google_auto_reply_failed", { error: e instanceof Error ? e.message : String(e) });
        return [];
      });
  const bell = autoReplyBell(answered);
  if (bell) {
    await recordNotification(conn.tenant_id, {
      kind: "review",
      title: bell.title,
      body: bell.body,
      route: lensRoute("reviews"),
      about: aboutOne(answered),
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
  L.info("google_profile_synced", {
    read: plan.reviews.length,
    fresh: plan.fresh.length,
    replied: plan.replied.length,
    answered: answered.length,
    first,
    rating: plan.listing?.rating ?? null,
    review_count: plan.listing?.review_count ?? null,
  });
  return { ok: true, fresh: plan.fresh.length, counted: 0, answered: answered.length };
}
