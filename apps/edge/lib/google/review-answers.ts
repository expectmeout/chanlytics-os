/**
 * Answering a Google review: the Autonomy row for reviews, the facts a reply
 * is written from, a draft for a person to send (`draftFor`), the sync's own
 * answers by the row's mode (`answerNewReviews`, which profile-sync.ts calls:
 * posted under auto, held under Holds it and Ask me, decision 0064), a held
 * reply stopped (`holdReviewReply`), and a person's answer posted
 * (`replyOnProfile`). The model's draft itself is review-reply.ts.
 */
import { emitEvent, listPolicies, subjectsWith, workspaceAnswersOnItsOwn } from "../packages/db.js";
import { replyToReview, reviewParent, type PlacesHttp } from "../packages/channels.js";
import {
  autoReplyCandidates,
  autoReplyHold,
  parseTenantConfig,
  reviewReplyModeOf,
  REVIEW_AUTO_REPLIES_PER_SYNC,
  REVIEW_HOLD_MS,
  type EdgeRefusal,
  type ReviewReplyFacts,
  type ReviewReplyMode,
} from "../packages/contracts.js";
import { draftReviewReply } from "./review-reply.js";
import { logger } from "../log.js";
import { http } from "./places.js";
import { connectionOf, type ConnectionRow, type Db } from "./google-rows.js";
import { tokenFor } from "./profile-credentials.js";

/**
 * The drafts one sync may write under the auto mode: twice the replies it posts, so a review the model could not
 * answer or Google refused gives its place to an older one, and an hour when Google refuses everything costs a few
 * drafts, not one for every review on record.
 */
const REVIEW_DRAFTS_PER_SYNC = 2 * REVIEW_AUTO_REPLIES_PER_SYNC;

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
  const d = await draftReviewReply(
    facts,
    {
      rating: review.data.rating,
      author: review.data.author,
      text: review.data.body,
      written_at: review.data.published_at,
    },
    { tenantId, reviewId: review.data.id },
  );
  return d.ok ? { ok: true, text: d.text } : { ok: false, error: d.error, detail: d.detail };
}

/** A review the sync may answer or hold a reply for, as it reads it. */
type Unreplied = {
  id: string;
  review_id: string;
  origin: string;
  rating: number | null;
  author: string | null;
  body: string | null;
  published_at: string | null;
  reply_text: string | null;
  draft_text: string | null;
  posts_at: string | null;
};

/** What the model's draft cost, as google.replied keeps it. */
type DraftUsage = Extract<Awaited<ReturnType<typeof draftReviewReply>>, { ok: true }>["usage"];

/** What a sync did with the reviews it may answer: posted (auto, or a held reply whose time came), and held (veto, ask). */
interface ReviewAnswers {
  answered: Array<{ id: string; author: string | null; text: string }>;
  drafted: Array<{ id: string; author: string | null; text: string; posts_at: string | null }>;
}

const nothingAnswered = (): ReviewAnswers => ({ answered: [], drafted: [] });

/** A reply posted, on the row: the review answered, and the reply it held cleared. Throws what the write refused. */
async function markReplied(
  db: Db,
  tenantId: string,
  rowId: string,
  reply: { reply_text: string | null; replied_at: string | null },
): Promise<void> {
  const up = await db
    .from("google_reviews")
    .update({ ...reply, draft_text: null, drafted_at: null, posts_at: null })
    .eq("id", rowId)
    .eq("tenant_id", tenantId);
  if (up.error) throw new Error(up.error.message);
}

/**
 * The one write of the reply a review holds (decision 0064, step 6), to a review with no reply posted: written (its words,
 * when, and under Holds it when it goes), or stopped, which clears its time where it still has one (`timed`). Answers
 * whether a row changed. Throws what the write refused.
 */
async function writeHeldReply(
  db: Db,
  tenantId: string,
  rowId: string,
  set: { draft_text?: string; drafted_at?: string; posts_at: string | null },
  timed = false,
): Promise<boolean> {
  const q = db.from("google_reviews").update(set).eq("tenant_id", tenantId).eq("id", rowId).is("reply_text", null);
  const up = await (timed ? q.not("posts_at", "is", null) : q).select("id");
  if (up.error) throw new Error(up.error.message);
  return (up.data ?? []).length > 0;
}

/** A reply on Google and on the row, the held one cleared; told on the ledger as the receptionist's. Throws a refusal. */
async function postReply(
  db: Db,
  conn: ConnectionRow,
  r: Pick<Unreplied, "id" | "review_id">,
  text: string,
  at: { parent: string; token: string; net: PlacesHttp; usage?: DraftUsage },
): Promise<void> {
  const reply = await replyToReview(at.net, at.token, `${at.parent}/reviews/${r.review_id}`, text);
  await markReplied(db, conn.tenant_id, r.id, reply);
  await emitEvent(db, conn.tenant_id, "google.replied", "review", r.id, {
    review_id: r.review_id,
    chars: text.length,
    by: "receptionist",
    ...(at.usage === undefined ? {} : { usage: at.usage }),
  }).catch(() => {});
}

/**
 * The reviews that came in while the receptionist was on duty and have no reply yet, answered by the row's mode, a few
 * per sync (contracts autoReplyCandidates decides which, the held ones set aside). Under auto each is posted. Under Holds
 * it and Ask me (decision 0064, step 6) each is written and held on its row: under Holds it to post after REVIEW_HOLD_MS
 * unless stopped, which a later sync does (a held reply whose time came is posted first, before any new one), under Ask
 * me for a member's OK. A reply naming a price or money is never posted alone: under auto it is held as before (the
 * google.reply_held event), under the other two it waits for an OK. A draft that fails or a reply Google refuses is
 * logged, left for the next hour, and gives its place to the next review; nothing here stops the sync that called it.
 * Returns what was posted and what was held, for the bell.
 */
async function answerNewReviews(
  db: Db,
  conn: ConnectionRow,
  parent: string,
  now: Date,
  net: PlacesHttp = http,
): Promise<ReviewAnswers> {
  const L = logger({ tenant_id: conn.tenant_id, location: conn.location_name ?? "" });
  const mode = await reviewReplyMode(db, conn.tenant_id);
  if (mode === "never") return nothingAnswered();
  // Not while the workspace is paused or ended or its plan has stopped the receptionist: a public reply, with nobody
  // left to read it (workspaceAnswersOnItsOwn says which).
  if (!(await workspaceAnswersOnItsOwn(db, conn.tenant_id))) return nothingAnswered();
  const unreplied = await db
    .from("google_reviews")
    .select("id, review_id, origin, rating, author, body, published_at, reply_text, draft_text, posts_at")
    .eq("tenant_id", conn.tenant_id)
    .eq("origin", "profile")
    .is("reply_text", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (unreplied.error) throw new Error(unreplied.error.message);
  const rows: Unreplied[] = unreplied.data ?? [];
  if (!rows.length) return nothingAnswered();
  // A held reply whose time came goes first, under Holds it alone: one stopped has no time, and Ask me posts nothing alone.
  const due =
    mode === "veto" ? rows.filter((r) => r.draft_text && r.posts_at && Date.parse(r.posts_at) <= now.getTime()) : [];
  // A reply once held for naming a price or money is the owner's now: not drafted again every hour, and set aside
  // before the few a sync answers are taken, so a held review never keeps the ones older than it waiting. A review whose
  // reply is held on its row already is not drafted again either.
  const held = await subjectsWith(
    db,
    conn.tenant_id,
    "google.reply_held",
    rows.map((r) => r.id),
  );
  const waiting = rows.filter((r) => !held.has(r.id) && !r.draft_text);
  // Newest first, more than the sync posts: a review the model could not draft, one held just now, or one Google
  // refused gives its place to the next, and the sync stops once it has posted its few.
  const picks = autoReplyCandidates(waiting, conn.connected_at, now.getTime(), REVIEW_DRAFTS_PER_SYNC);
  if (!picks.length && !due.length) return nothingAnswered();
  const t = await tokenFor(db, conn.tenant_id, now.getTime(), net);
  if (!t.ok) return nothingAnswered();
  const out = nothingAnswered();
  for (const r of due) {
    if (out.answered.length >= REVIEW_AUTO_REPLIES_PER_SYNC) break;
    const text = r.draft_text ?? "";
    try {
      await postReply(db, conn, r, text, { parent, token: t.token, net });
    } catch (e) {
      L.warn("google_auto_reply_refused", { id: r.id, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    out.answered.push({ id: r.id, author: r.author, text });
  }
  const facts = picks.length ? await reviewFacts(db, conn.tenant_id) : null;
  for (const r of picks) {
    if (!facts || out.answered.length + out.drafted.length >= REVIEW_AUTO_REPLIES_PER_SYNC) break;
    const d = await draftReviewReply(
      facts,
      { rating: r.rating, author: r.author, text: r.body, written_at: r.published_at },
      { tenantId: conn.tenant_id, reviewId: r.id },
    );
    if (!d.ok) {
      L.warn("google_auto_reply_undrafted", { id: r.id, error: d.error });
      continue;
    }
    // Layer two for a reply posted in public (the charter): a price or money in it is never the receptionist's to say,
    // whatever the prompt asked. It is never posted alone: under auto the review waits for its owner, who can ask for a
    // draft in Reports; under Holds it and Ask me it is held for their OK, with no time to go.
    const hold = autoReplyHold(d.text);
    if (mode !== "auto") {
      const postsAt = mode === "veto" && !hold ? new Date(now.getTime() + REVIEW_HOLD_MS).toISOString() : null;
      await writeHeldReply(db, conn.tenant_id, r.id, {
        draft_text: d.text,
        drafted_at: now.toISOString(),
        posts_at: postsAt,
      });
      out.drafted.push({ id: r.id, author: r.author, text: d.text, posts_at: postsAt });
      continue;
    }
    if (hold) {
      L.warn("google_auto_reply_held", { id: r.id, why: hold });
      await emitEvent(db, conn.tenant_id, "google.reply_held", "review", r.id, {
        review_id: r.review_id,
        why: hold,
      }).catch(() => {});
      continue;
    }
    try {
      await postReply(db, conn, r, d.text, { parent, token: t.token, net, usage: d.usage });
    } catch (e) {
      L.warn("google_auto_reply_refused", { id: r.id, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    out.answered.push({ id: r.id, author: r.author, text: d.text });
  }
  return out;
}

/**
 * A held reply stopped (decision 0064, step 6): under Holds it, its time cleared, so it waits for a member's OK as one
 * held under Ask me does. Its words stay on the row. A review with no held reply, or one already answered, is no change.
 */
export async function holdReviewReply(
  db: Db,
  tenantId: string,
  rowId: string,
): Promise<{ ok: true; held: boolean } | EdgeRefusal> {
  try {
    return { ok: true, held: await writeHeldReply(db, tenantId, rowId, { posts_at: null }, true) };
  } catch (e) {
    return { ok: false, error: "review_write_failed", detail: e instanceof Error ? e.message : String(e) };
  }
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
  // The reply posted, and any it held cleared: the review is answered.
  try {
    await markReplied(db, tenantId, rowId, reply);
  } catch (e) {
    return { ok: false, error: "review_write_failed", detail: e instanceof Error ? e.message : String(e) };
  }
  await emitEvent(db, tenantId, "google.replied", "review", rowId, {
    review_id: review.data.review_id,
    chars: comment.length,
  }).catch(() => {});
  return { ok: true, ...reply };
}

export { answerNewReviews };
