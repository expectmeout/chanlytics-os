/**
 * The reviews on record, read once for a report (google_reviews, and the two kinds of event filed under a review): the one
 * place Reports reads them. What the owner's Business Profile handed over and the database kept: the profile's reviews dated
 * since the instant the caller names (contracts reviewsReadSince, so the read is bounded), how many reviews of each origin
 * the workspace holds and when the oldest profile review was written, the ones still waiting for a reply and how many there
 * are, and the events that say who wrote a reply (google.replied) and which one was written and held back
 * (google.reply_held). The dashboard asks on the session client, so RLS decides what a member reads, and every read names
 * the workspace as well. The period's rows and the replies are paged (readAllRows, ordered by id); the rest are counts or
 * a handful of rows. A read that fails throws: "we could not read" is never "no reviews".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { REVIEWS_WAITING_SHOWN, type GoogleReviewDto, type ReviewsLedgerDto } from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";
import { readAllRows } from "../../paged";

type ReviewsDb = SupabaseClient<Database>;

/** The columns a review is drawn from: the Google read's own (the dashboard's server/connections/google.ts), so a waiting review is the row the page shows. */
const LEDGER_REVIEW_COLUMNS =
  "id, review_id, origin, rating, author, author_uri, author_photo_uri, body, language_code, published_at, reply_text, replied_at, maps_uri, first_seen_at";

/** The profile's reviews dated since `sinceIso`, as the period's counts read them; a review is answered when it holds a reply. */
async function ledgerWritten(db: ReviewsDb, tenantId: string, sinceIso: string): Promise<ReviewsLedgerDto["written"]> {
  const rows = await readAllRows("reviewsLedger written", (from, to) =>
    db
      .from("google_reviews")
      .select("id, rating, published_at, reply_text, replied_at")
      .eq("tenant_id", tenantId)
      .eq("origin", "profile")
      .gte("published_at", sinceIso)
      .order("id")
      .range(from, to),
  );
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    published_at: r.published_at,
    has_reply: r.reply_text !== null,
    replied_at: r.replied_at,
  }));
}

/** How many reviews of one origin the workspace holds: a counted head, so no row is read. */
async function ledgerCount(db: ReviewsDb, tenantId: string, origin: "profile" | "places"): Promise<number> {
  const { count, error } = await db
    .from("google_reviews")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("origin", origin);
  if (error) throw new Error(`reviewsLedger on record: ${error.message}`);
  return count ?? 0;
}

/** When the oldest dated profile review was written; null with none dated. */
async function ledgerOldest(db: ReviewsDb, tenantId: string): Promise<string | null> {
  const { data, error } = await db
    .from("google_reviews")
    .select("published_at")
    .eq("tenant_id", tenantId)
    .eq("origin", "profile")
    .not("published_at", "is", null)
    .order("published_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`reviewsLedger oldest: ${error.message}`);
  return (data ?? []).at(0)?.published_at ?? null;
}

/**
 * The profile's reviews with no reply, however old: how many there are (the exact count of the same read, before its
 * limit), and the oldest REVIEWS_WAITING_SHOWN of them, the ones with no date last, as the Google read draws a review.
 */
async function ledgerWaiting(db: ReviewsDb, tenantId: string): Promise<{ total: number; rows: GoogleReviewDto[] }> {
  const { data, count, error } = await db
    .from("google_reviews")
    .select(LEDGER_REVIEW_COLUMNS, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("origin", "profile")
    .is("reply_text", null)
    .order("published_at", { ascending: true, nullsFirst: false })
    .order("id")
    .limit(REVIEWS_WAITING_SHOWN);
  if (error) throw new Error(`reviewsLedger waiting: ${error.message}`);
  const rows = (data ?? []).map((r): GoogleReviewDto => ({
    ...r,
    origin: r.origin === "profile" ? "profile" : "places",
  }));
  return { total: count ?? 0, rows };
}

/** A text an event's data holds under `key`; undefined where the data is not an object or the key is not text. */
function ledgerTextOf(data: Json, key: string): string | undefined {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return undefined;
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * The `google.replied` events written since `sinceIso`, under the review row they are about, with who wrote the reply: the
 * receptionist where the event says so, and no one where it does not (a person's reply through Chanlytics files none of its
 * own). A reply to a review dated since then is written after it, so every such review's events are among them.
 */
async function ledgerReplies(db: ReviewsDb, tenantId: string, sinceIso: string): Promise<ReviewsLedgerDto["replies"]> {
  const events = await readAllRows("reviewsLedger replies", (from, to) =>
    db
      .from("events")
      .select("subject_id, created_at, data")
      .eq("tenant_id", tenantId)
      .eq("kind", "google.replied")
      .gte("created_at", sinceIso)
      .order("id")
      .range(from, to),
  );
  return events.flatMap((e): ReviewsLedgerDto["replies"] =>
    e.subject_id === null
      ? []
      : [
          {
            review_id: e.subject_id,
            by: ledgerTextOf(e.data, "by") === "receptionist" ? "receptionist" : null,
            at: e.created_at,
          },
        ],
  );
}

/** The `google.reply_held` events of the reviews that wait, oldest first, with why a reply written for each was not posted. */
async function ledgerHeld(db: ReviewsDb, tenantId: string, waitingIds: string[]): Promise<ReviewsLedgerDto["held"]> {
  if (!waitingIds.length) return [];
  const { data, error } = await db
    .from("events")
    .select("subject_id, data")
    .eq("tenant_id", tenantId)
    .eq("kind", "google.reply_held")
    .in("subject_id", waitingIds)
    .order("created_at")
    .order("id");
  if (error) throw new Error(`reviewsLedger held: ${error.message}`);
  return (data ?? []).flatMap((e): ReviewsLedgerDto["held"] => {
    const why = ledgerTextOf(e.data, "why");
    return e.subject_id === null || why === undefined ? [] : [{ review_id: e.subject_id, why }];
  });
}

/**
 * What the Reviews report is made from, in one bounded read (contracts toReviewsReportVM folds it): the profile's reviews
 * dated since `sinceIso`, the counts of each origin and the oldest profile review's date, the reviews waiting for a reply,
 * and who answered and what was held. `sinceIso` is contracts' reviewsReadSince. A review is filed in its events under the
 * google_reviews row's own id, which is the id every row here carries.
 */
export async function reviewsLedger(db: ReviewsDb, tenantId: string, sinceIso: string): Promise<ReviewsLedgerDto> {
  const [written, profile, places, oldestAt, waiting, replyEvents] = await Promise.all([
    ledgerWritten(db, tenantId, sinceIso),
    ledgerCount(db, tenantId, "profile"),
    ledgerCount(db, tenantId, "places"),
    ledgerOldest(db, tenantId),
    ledgerWaiting(db, tenantId),
    ledgerReplies(db, tenantId, sinceIso),
  ]);
  const held = await ledgerHeld(
    db,
    tenantId,
    waiting.rows.map((r) => r.id),
  );
  const writtenIds = new Set(written.map((r) => r.id));
  return {
    written,
    on_record: { profile, places, oldest_at: oldestAt },
    waiting_total: waiting.total,
    waiting: waiting.rows,
    replies: replyEvents.filter((e) => writtenIds.has(e.review_id)),
    held,
  };
}
