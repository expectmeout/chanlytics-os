/**
 * The shared record's touches (00699; the content loop PRD's Appendix A.1, A.2, A.5): kept once by the place's own id
 * (the edge's doors), and read through one shape over every home (contracts RecordedTouch): touches, and ad_entries for a
 * message that came from an ad. Each read is bounded by its window and its workspace; doubles across homes are removed by
 * the message's id. A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DbFailure,
  heldTenantId,
  isOneOf,
  recordOrEmpty,
  TOUCH_KINDS,
  TOUCH_KEPT_SUBJECTS,
  type RecordedTouch,
  type ContactId,
  type TenantId,
  type TouchKind,
} from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The most touches one read answers: a report's month, a person's half year. */
const TOUCHES_READ_MAX = 2000;

const TOUCH_COLUMNS =
  "id, kind, subject_type, subject_id, contact_id, conversation_id, message_id, new_person, at, evidence";

type TouchRow = Pick<
  Database["public"]["Tables"]["touches"]["Row"],
  | "id"
  | "kind"
  | "subject_type"
  | "subject_id"
  | "contact_id"
  | "conversation_id"
  | "message_id"
  | "new_person"
  | "at"
  | "evidence"
>;

const touchTextOf = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/** A touches row as the one shape; null for a row whose kind or subject this build does not know. */
function keptTouchOf(row: TouchRow): RecordedTouch | null {
  if (!isOneOf(TOUCH_KINDS, row.kind) || !isOneOf(TOUCH_KEPT_SUBJECTS, row.subject_type)) return null;
  const evidence = recordOrEmpty(row.evidence);
  const words = touchTextOf(evidence.words);
  const username = touchTextOf(evidence.username);
  return {
    id: row.id,
    home: "touches",
    kind: row.kind,
    subject: { type: row.subject_type, id: row.subject_id },
    contact_id: row.contact_id,
    conversation_id: row.conversation_id,
    message_id: row.message_id,
    new_person: row.new_person,
    at: row.at,
    said: row.kind === "comment" && (words || username) ? { words, username } : null,
  };
}

/** The messages that came from an ad, read as touches: who wrote, in which thread, when. Absent where no person is. */
async function adTouchesOf(
  db: Db,
  tenantId: TenantId,
  among: { since: string; until: string },
): Promise<RecordedTouch[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("ad_entries")
    .select("id, ad_id, new_person, message_id, created_at")
    .eq("kind", "chat")
    .not("ad_id", "is", null)
    .gte("created_at", among.since)
    .lt("created_at", among.until)
    .order("created_at", { ascending: false })
    .limit(TOUCHES_READ_MAX);
  if (error) throw new DbFailure(error, "ad_entries");
  const withMessage = data.filter((row) => row.message_id && row.ad_id);
  if (withMessage.length === 0) return [];
  const read = await tenantDb(db, tenantId)
    .from("messages")
    .select("id, contact_id, conversation_id")
    .in(
      "id",
      withMessage.map((row) => row.message_id ?? ""),
    )
    .limit(TOUCHES_READ_MAX);
  if (read.error) throw new DbFailure(read.error, "messages");
  const byId = new Map(read.data.map((m) => [m.id, m]));
  return withMessage.flatMap((row): RecordedTouch[] => {
    const message = byId.get(row.message_id ?? "");
    if (!message?.contact_id || !row.ad_id) return [];
    return [
      {
        id: row.id,
        home: "ad_entries",
        kind: "ad_message",
        subject: { type: "ad", id: row.ad_id },
        contact_id: message.contact_id,
        conversation_id: message.conversation_id,
        message_id: message.id,
        new_person: row.new_person,
        at: row.created_at,
        said: null,
      },
    ];
  });
}

/** Both homes as one list, newest first, a message read from two homes kept once (touches' first). */
function oneList(kept: readonly RecordedTouch[], fromAds: readonly RecordedTouch[]): RecordedTouch[] {
  const seen = new Set(kept.flatMap((touch) => (touch.message_id ? [touch.message_id] : [])));
  return [...kept, ...fromAds.filter((touch) => !touch.message_id || !seen.has(touch.message_id))].sort(
    (one, other) => Date.parse(other.at) - Date.parse(one.at),
  );
}

/** A workspace's touches in a window, from every home, in one read each (Reports never asks person by person). */
export async function listTouchesIn(
  db: Db,
  tenantId: TenantId,
  window: { since: string; until: string },
): Promise<RecordedTouch[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("touches")
    .select(TOUCH_COLUMNS)
    .gte("at", window.since)
    .lt("at", window.until)
    .order("at", { ascending: false })
    .limit(TOUCHES_READ_MAX);
  if (error) throw new DbFailure(error, "touches");
  const kept = data.flatMap((row) => keptTouchOf(row) ?? []);
  return oneList(kept, await adTouchesOf(db, tenantId, window));
}

/** The touches of these posts, newest first (the piece's What it brought). */
export async function listPostTouches(
  db: Db,
  tenantId: TenantId,
  postIds: readonly string[],
): Promise<RecordedTouch[]> {
  const ids = [...new Set(postIds)].slice(0, 200);
  if (ids.length === 0) return [];
  const { data, error } = await tenantDb(db, tenantId)
    .from("touches")
    .select(TOUCH_COLUMNS)
    .eq("subject_type", "post")
    .in("subject_id", ids)
    .order("at", { ascending: false })
    .limit(TOUCHES_READ_MAX);
  if (error) throw new DbFailure(error, "touches");
  return data.flatMap((row) => keptTouchOf(row) ?? []);
}

/* ------------------------------------------------------------------------------- the edge's doors -- */

/** A touch to keep: who, what of, which kind, where, and the place's own id that makes it once. */
export interface TouchToKeep {
  tenantId: TenantId;
  kind: TouchKind;
  subject: { type: "post" | "link"; id: string };
  contactId: string;
  place: "instagram" | "whatsapp" | "google";
  eventId: string;
  at: string;
  conversationId: string | null;
  messageId: string | null;
}

/** A touch kept once (touches_keep): whether it was new, and its id. */
export async function keepTouch(db: Db, touch: TouchToKeep): Promise<{ kept: boolean; touchId: string | null }> {
  const { data, error } = await db.rpc("touches_keep", {
    p_tenant_id: touch.tenantId,
    p_kind: touch.kind,
    p_subject_type: touch.subject.type,
    p_subject_id: touch.subject.id,
    p_contact_id: touch.contactId,
    p_place: touch.place,
    p_event_id: touch.eventId,
    p_at: touch.at,
    ...(touch.conversationId ? { p_conversation_id: touch.conversationId } : {}),
    ...(touch.messageId ? { p_message_id: touch.messageId } : {}),
  });
  if (error) throw new DbFailure(error, "touches_keep");
  const answer = recordOrEmpty(data);
  return { kept: answer.kept === true, touchId: touchTextOf(answer.touch_id) };
}

/** A person's comment on a post, as Meta delivered it. */
export interface CommentToKeep {
  tenantId: TenantId;
  account: string;
  from: string;
  username: string | null;
  commentId: string;
  mediaId: string;
  parentId: string | null;
  words: string | null;
  at: string | null;
  /** The ad Meta says it was left on (its id at Meta), where it was: kept on the ad where the post is not ours (00719). */
  adId: string | null;
}

/**
 * What keeping a comment came to: kept on the post Chanlytics sent (and its draft asked) or on the ad it was left on, or
 * why not.
 */
export type CommentKept =
  | { kept: true; touchId: string; postId: string | null; adId: string | null; contactId: string; newPerson: boolean }
  | { kept: false; why: "not_ours" | "again" };

/** A person's comment on a post Chanlytics sent, kept once with its person (post_comment_keep). */
export async function keepPostComment(db: Db, comment: CommentToKeep): Promise<CommentKept> {
  const { data, error } = await db.rpc("post_comment_keep", {
    p_tenant_id: comment.tenantId,
    p_account: comment.account,
    p_from: comment.from,
    p_username: comment.username ?? "",
    p_comment_id: comment.commentId,
    p_media_id: comment.mediaId,
    p_parent_id: comment.parentId ?? "",
    p_words: comment.words ?? "",
    p_at: comment.at ?? new Date().toISOString(),
    ...(comment.adId ? { p_ad_id: comment.adId } : {}),
  });
  if (error) throw new DbFailure(error, "post_comment_keep");
  const answer = recordOrEmpty(data);
  const touchId = touchTextOf(answer.touch_id);
  const postId = touchTextOf(answer.post_id);
  const adId = touchTextOf(answer.ad_id);
  const contactId = touchTextOf(answer.contact_id);
  if (answer.kept === true && touchId && (postId || adId) && contactId)
    return {
      kept: true,
      touchId,
      postId: postId ?? null,
      adId: adId ?? null,
      contactId,
      newPerson: answer.new_person === true,
    };
  return { kept: false, why: answer.why === "not_ours" ? "not_ours" : "again" };
}

/** The business's own comment answering a kept one: that comment is answered, by hand (post_own_comment_keep). */
export async function keepOwnComment(
  db: Db,
  own: { tenantId: TenantId; commentId: string; parentId: string | null },
): Promise<boolean> {
  if (!own.parentId) return false;
  const { data, error } = await db.rpc("post_own_comment_keep", {
    p_tenant_id: own.tenantId,
    p_comment_id: own.commentId,
    p_parent_id: own.parentId,
  });
  if (error) throw new DbFailure(error, "post_own_comment_keep");
  return data === true;
}

/** A post Chanlytics sent, by the id its place keeps for it (a reply to a story names the story so). */
export async function findPostByPlaceId(
  db: Db,
  tenantId: TenantId,
  at: { place: "instagram" | "google"; externalId: string },
): Promise<{ id: string; kind: string } | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("posts")
    .select("id, kind")
    .eq("place", at.place)
    .eq("external_id", at.externalId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "posts");
  return data;
}

/** The post a link's code belongs to, anywhere, by the code alone (a code names one link, and its own workspace). */
export async function findPostOfCode(db: Db, code: string): Promise<{ tenantId: TenantId; postId: string } | null> {
  const { data, error } = await db
    .from("links")
    .select("tenant_id, subject_id")
    .eq("code", code.toLowerCase())
    .eq("subject_type", "post")
    .is("stopped_at", null)
    .maybeSingle();
  if (error) throw new DbFailure(error, "links");
  return data ? { tenantId: heldTenantId(data.tenant_id), postId: data.subject_id } : null;
}

/** Touches older than 180 days keep their counts only (touches_age_out). Answers how many were emptied. */
export async function scrubOldTouches(db: Db): Promise<number> {
  const { data, error } = await db.rpc("touches_age_out", {});
  if (error) throw new DbFailure(error, "touches_age_out");
  return typeof data === "number" ? data : 0;
}

/** A person's thread, the newest where there is more than one: where a code that opened their chat is kept. */
export async function findThreadOfPerson(db: Db, tenantId: TenantId, contactId: ContactId): Promise<string | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DbFailure(error, "conversations");
  return data?.id ?? null;
}
