/**
 * Answering a Google review: the Autonomy row for reviews, the facts a reply
 * is written from, a draft for a person to send (`draftFor`), the auto
 * mode's own answers (`answerNewReviews`, which profile-sync.ts calls), and
 * a person's answer posted (`replyOnProfile`). The model's draft itself is
 * review-reply.ts.
 */
import { emitEvent, listPolicies } from "../packages/db.js";
import { replyToReview, reviewParent, type PlacesHttp } from "../packages/channels.js";
import {
  autoReplyCandidates,
  parseTenantConfig,
  reviewReplyModeOf,
  type EdgeRefusal,
  type ReviewReplyFacts,
  type ReviewReplyMode,
} from "../packages/contracts.js";
import { draftReviewReply } from "./review-reply.js";
import { logger } from "../log.js";
import { http } from "./places.js";
import { connectionOf, type ConnectionRow, type Db } from "./google-rows.js";
import { tokenFor } from "./profile-credentials.js";

/** The Autonomy row for reviews. No row reads as ask: a draft on request, nothing posted alone. */
export async function reviewReplyMode(db: Db, tenantId: string): Promise<ReviewReplyMode> {
  return reviewReplyModeOf(await listPolicies(db, tenantId));
}

/** What the receptionist knows about the business when it writes under a review: the name, the tone, the languages, the services — from the same profile the WhatsApp brain speaks from. */
async function reviewFacts(db: Db, tenantId: string): Promise<ReviewReplyFacts> {
  const [t, c] = await Promise.all([
    db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (t.error) throw new Error(t.error.message);
  if (c.error) throw new Error(c.error.message);
  const brain = parseTenantConfig(c.data?.config)?.brain ?? null;
  const p = brain?.profile;
  return {
    name: brain?.business_name || t.data?.name || "the business",
    tone: p?.tone?.trim() || null,
    languages: p?.languages ?? [],
    phone: brain?.phone_display || null,
    website: p?.website ?? null,
    services: (p?.services ?? []).map((s) => s.name),
  };
}

/** A draft for one review on record, for a person to send. Never posts. */
export async function draftFor(
  db: Db,
  tenantId: string,
  rowId: string,
): Promise<{ ok: true; text: string } | EdgeRefusal> {
  const review = await db
    .from("google_reviews")
    .select("id, rating, author, body, published_at")
    .eq("tenant_id", tenantId)
    .eq("id", rowId)
    .maybeSingle();
  if (review.error) return { ok: false, error: "review_read_failed", detail: review.error.message };
  if (!review.data) return { ok: false, error: "no_review" };
  const facts = await reviewFacts(db, tenantId);
  const d = await draftReviewReply(facts, {
    rating: review.data.rating,
    author: review.data.author,
    text: review.data.body,
    written_at: review.data.published_at,
  });
  return d.ok ? { ok: true, text: d.text } : { ok: false, error: d.error, detail: d.detail };
}

/**
 * Under the auto mode, the reviews that came in while the receptionist was
 * on duty and have no reply yet are answered on Google, a few per sync
 * (contracts autoReplyCandidates decides which). A draft that fails or a
 * reply Google refuses is logged and left for the next hour; nothing here
 * stops the sync that called it. Returns what was answered, for the bell.
 */
async function answerNewReviews(
  db: Db,
  conn: ConnectionRow,
  parent: string,
  now: Date,
  net: PlacesHttp = http,
): Promise<Array<{ id: string; author: string | null; text: string }>> {
  const L = logger({ tenant: conn.tenant_id, location: conn.location_name ?? "" });
  if ((await reviewReplyMode(db, conn.tenant_id)) !== "auto") return [];
  const unreplied = await db
    .from("google_reviews")
    .select("id, review_id, origin, rating, author, body, published_at, reply_text")
    .eq("tenant_id", conn.tenant_id)
    .eq("origin", "profile")
    .is("reply_text", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (unreplied.error) throw new Error(unreplied.error.message);
  const picks = autoReplyCandidates(unreplied.data ?? [], conn.connected_at, now.getTime());
  if (!picks.length) return [];
  const t = await tokenFor(db, conn.tenant_id, now.getTime(), net);
  if (!t.ok) return [];
  const facts = await reviewFacts(db, conn.tenant_id);
  const answered: Array<{ id: string; author: string | null; text: string }> = [];
  for (const r of picks) {
    const d = await draftReviewReply(facts, {
      rating: r.rating,
      author: r.author,
      text: r.body,
      written_at: r.published_at,
    });
    if (!d.ok) {
      L.warn("google_auto_reply_undrafted", { id: r.id, error: d.error });
      continue;
    }
    let reply;
    try {
      reply = await replyToReview(net, t.token, `${parent}/reviews/${r.review_id}`, d.text);
    } catch (e) {
      L.warn("google_auto_reply_refused", { id: r.id, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const up = await db
      .from("google_reviews")
      .update({ reply_text: reply.reply_text, replied_at: reply.replied_at })
      .eq("id", r.id)
      .eq("tenant_id", conn.tenant_id);
    if (up.error) throw new Error(up.error.message);
    await emitEvent(
      db,
      conn.tenant_id,
      "google.replied",
      { type: "review", id: r.id },
      {
        review_id: r.review_id,
        chars: d.text.length,
        by: "receptionist",
        usage: d.usage,
      },
    ).catch(() => {});
    answered.push({ id: r.id, author: r.author, text: d.text });
  }
  return answered;
}

/** An answer to a review, on Google and on the row. The ledger entry is the dashboard's. */
export async function replyOnProfile(
  db: Db,
  tenantId: string,
  rowId: string,
  comment: string,
  now = new Date(),
): Promise<{ ok: true; reply_text: string | null; replied_at: string | null } | EdgeRefusal> {
  const conn = await connectionOf(db, tenantId);
  if (!conn || !conn.location_name) return { ok: false, error: "not_connected" };
  const review = await db
    .from("google_reviews")
    .select("id, review_id, origin")
    .eq("tenant_id", tenantId)
    .eq("id", rowId)
    .maybeSingle();
  if (review.error) return { ok: false, error: "review_read_failed", detail: review.error.message };
  if (!review.data) return { ok: false, error: "no_review" };
  if (review.data.origin !== "profile") return { ok: false, error: "not_from_profile" };
  const t = await tokenFor(db, tenantId, now.getTime());
  if (!t.ok) return { ok: false, error: "no_token", detail: t.detail ?? t.error };
  let reply;
  try {
    reply = await replyToReview(
      http,
      t.token,
      `${reviewParent(conn.account_name, conn.location_name)}/reviews/${review.data.review_id}`,
      comment,
    );
  } catch (e) {
    return { ok: false, error: "google_refused", detail: e instanceof Error ? e.message : String(e) };
  }
  const up = await db
    .from("google_reviews")
    .update({ reply_text: reply.reply_text, replied_at: reply.replied_at })
    .eq("id", rowId)
    .eq("tenant_id", tenantId);
  if (up.error) return { ok: false, error: "review_write_failed", detail: up.error.message };
  await emitEvent(
    db,
    tenantId,
    "google.replied",
    { type: "review", id: rowId },
    {
      review_id: review.data.review_id,
      chars: comment.length,
    },
  ).catch(() => {});
  return { ok: true, ...reply };
}

export { answerNewReviews };
