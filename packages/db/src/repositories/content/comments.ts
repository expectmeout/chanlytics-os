/**
 * A comment on a post and its public answer (00692; the content loop PRD's 9.2 and 12.4): the comments Inbox lists, one
 * comment opened, the answer's life (AI's draft or why it could not, the owner's words on their way, what Instagram
 * said), and what the job reads to draft and to send. A member reads under the tables' row rules; the job and the edge
 * write through their doors on the service role. A read that fails THROWS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMMENT_ANSWER_STATES,
  DbFailure,
  heldTenantId,
  isOneOf,
  recordOrEmpty,
  type CommentAnswerState,
  type TenantId,
} from "@chanlytics/contracts";
import { tenantDb } from "../../shared/tenant-db";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** The most comments Inbox lists at once. */
const COMMENTS_LISTED_MAX = 100;

/** Where a comment's public answer stands, as its row says it. */
export interface CommentAnswerRead {
  state: CommentAnswerState;
  draft: string | null;
  cannotWhy: string | null;
  words: string | null;
  said: string | null;
  byHand: boolean;
  sentAt: string | null;
}

/** A comment as Inbox shows it: who, on which post, their words, when, and its answer. */
export interface CommentRead {
  touchId: string;
  postId: string;
  contactId: string | null;
  name: string | null;
  username: string | null;
  words: string | null;
  at: string;
  answer: CommentAnswerRead | null;
}

const evidenceTextOf = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

type AnswerRow = Pick<
  Database["public"]["Tables"]["comment_answers"]["Row"],
  "state" | "draft" | "cannot_why" | "words" | "said" | "by_hand" | "sent_at"
>;

function commentAnswerOf(row: AnswerRow | null | undefined): CommentAnswerRead | null {
  if (!row || !isOneOf(COMMENT_ANSWER_STATES, row.state)) return null;
  return {
    state: row.state,
    draft: row.draft,
    cannotWhy: row.cannot_why,
    words: row.words,
    said: row.said,
    byHand: row.by_hand,
    sentAt: row.sent_at,
  };
}

const COMMENT_COLUMNS =
  "id, subject_id, contact_id, at, evidence, contacts!touches_contact_same_workspace(display_name), comment_answers(state, draft, cannot_why, words, said, by_hand, sent_at)";

type CommentRow = {
  id: string;
  subject_id: string;
  contact_id: string | null;
  at: string;
  evidence: unknown;
  contacts: { display_name: string | null } | null;
  comment_answers: AnswerRow[];
};

function commentOf(row: CommentRow): CommentRead {
  const evidence = recordOrEmpty(row.evidence);
  return {
    touchId: row.id,
    postId: row.subject_id,
    contactId: row.contact_id,
    name: row.contacts?.display_name ?? null,
    username: evidenceTextOf(evidence.username),
    words: evidenceTextOf(evidence.words),
    at: row.at,
    answer: commentAnswerOf(row.comment_answers.at(0)),
  };
}

/** The workspace's comments on its posts, newest first, each with its answer (Inbox's comments). */
export async function listComments(db: Db, tenantId: TenantId, since: string): Promise<CommentRead[]> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("touches")
    .select(COMMENT_COLUMNS)
    .eq("kind", "comment")
    .not("contact_id", "is", null)
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(COMMENTS_LISTED_MAX);
  if (error) throw new DbFailure(error, "touches");
  return data.map(commentOf);
}

/** One comment, with its answer; null where the workspace has no such comment, or its person was erased. */
export async function findComment(db: Db, tenantId: TenantId, touchId: string): Promise<CommentRead | null> {
  const { data, error } = await tenantDb(db, tenantId)
    .from("touches")
    .select(COMMENT_COLUMNS)
    .eq("id", touchId)
    .eq("kind", "comment")
    .not("contact_id", "is", null)
    .maybeSingle();
  if (error) throw new DbFailure(error, "touches");
  return data ? commentOf(data) : null;
}

/** The owner's words sent as the business's public answer (comment_answer_send, on the member's own client). */
export async function sendCommentAnswer(
  db: Db,
  answer: { tenantId: TenantId; touchId: string; words: string },
): Promise<{ sent: boolean; state: CommentAnswerState | null }> {
  const { data, error } = await db.rpc("comment_answer_send", {
    p_tenant_id: answer.tenantId,
    p_touch_id: answer.touchId,
    p_words: answer.words,
  });
  if (error) throw new DbFailure(error, "comment_answer_send");
  const out = recordOrEmpty(data);
  return { sent: out.sent === true, state: isOneOf(COMMENT_ANSWER_STATES, out.state) ? out.state : null };
}

/** A comment left unanswered by the owner, or answered after all (comment_answer_leave): where its answer stands now. */
export async function leaveComment(
  db: Db,
  left: { tenantId: TenantId; touchId: string; left: boolean },
): Promise<CommentAnswerState | null> {
  const { data, error } = await db.rpc("comment_answer_leave", {
    p_tenant_id: left.tenantId,
    p_touch_id: left.touchId,
    p_left: left.left,
  });
  if (error) throw new DbFailure(error, "comment_answer_leave");
  const out = recordOrEmpty(data);
  return isOneOf(COMMENT_ANSWER_STATES, out.state) ? out.state : null;
}

/* ------------------------------------------------------------------------------------ the job's own -- */

/** What the job reads of a comment to draft its answer and to send it. */
export interface CommentForWork {
  tenantId: TenantId;
  touchId: string;
  /** Meta's id of the comment, which an answer is posted under. */
  commentId: string;
  words: string | null;
  username: string | null;
  post: { id: string; kind: string; caption: string | null; accountId: string | null; status: string };
  answer: CommentAnswerRead | null;
}

/** A comment and its post for the job; null for one gone, emptied, or not a comment. */
export async function findCommentForWork(db: Db, touchId: string): Promise<CommentForWork | null> {
  const { data, error } = await db
    .from("touches")
    .select(
      "id, tenant_id, provider_event_id, subject_id, evidence, contact_id, comment_answers(state, draft, cannot_why, words, said, by_hand, sent_at)",
    )
    .eq("id", touchId)
    .eq("kind", "comment")
    .maybeSingle();
  if (error) throw new DbFailure(error, "touches");
  if (!data?.contact_id) return null;
  const post = await db
    .from("posts")
    .select("id, kind, caption, account_id, status")
    .eq("tenant_id", data.tenant_id)
    .eq("id", data.subject_id)
    .maybeSingle();
  if (post.error) throw new DbFailure(post.error, "posts");
  if (!post.data) return null;
  const evidence = recordOrEmpty(data.evidence);
  return {
    tenantId: heldTenantId(data.tenant_id),
    touchId: data.id,
    commentId: data.provider_event_id,
    words: evidenceTextOf(evidence.words),
    username: evidenceTextOf(evidence.username),
    post: {
      id: post.data.id,
      kind: post.data.kind,
      caption: post.data.caption,
      accountId: post.data.account_id,
      status: post.data.status,
    },
    answer: commentAnswerOf(data.comment_answers.at(0)),
  };
}

/** AI's draft of a public answer, or why it could not answer safely (comment_answer_draft_keep). */
export async function keepCommentDraft(
  db: Db,
  draft: { tenantId: TenantId; touchId: string } & ({ words: string } | { cannotWhy: string }),
): Promise<boolean> {
  const { data, error } = await db.rpc("comment_answer_draft_keep", {
    p_tenant_id: draft.tenantId,
    p_touch_id: draft.touchId,
    p_draft: "words" in draft ? draft.words : "",
    p_cannot_why: "cannotWhy" in draft ? draft.cannotWhy : "",
  });
  if (error) throw new DbFailure(error, "comment_answer_draft_keep");
  return data === true;
}

/** What Instagram said of an answer on its way: up with its id, or not, in the house's words (comment_answer_settle). */
export async function settleCommentAnswer(
  db: Db,
  settled: { tenantId: TenantId; touchId: string } & (
    { sent: true; externalId: string } | { sent: false; said: string }
  ),
): Promise<boolean> {
  const { data, error } = await db.rpc("comment_answer_settle", {
    p_tenant_id: settled.tenantId,
    p_touch_id: settled.touchId,
    p_sent: settled.sent,
    p_external_id: settled.sent ? settled.externalId : "",
    p_said: settled.sent ? "" : settled.said,
  });
  if (error) throw new DbFailure(error, "comment_answer_settle");
  return data === true;
}

/** What Inbox names a comment's post by: its file (its picture and name), its kind and place, its caption, its address there. */
export interface CommentPostRead {
  id: string;
  fileId: string;
  /** The piece's file name, which its title is said from; null where the file is gone. */
  fileName: string | null;
  kind: string;
  place: string;
  caption: string | null;
  permalink: string | null;
}

/** These posts, as a comment names them. */
export async function readCommentPosts(
  db: Db,
  tenantId: TenantId,
  postIds: readonly string[],
): Promise<CommentPostRead[]> {
  const ids = [...new Set(postIds)].slice(0, COMMENTS_LISTED_MAX);
  if (ids.length === 0) return [];
  const { data, error } = await tenantDb(db, tenantId)
    .from("posts")
    .select("id, file_id, kind, place, caption, permalink")
    .in("id", ids);
  if (error) throw new DbFailure(error, "posts");
  const fileIds = [...new Set(data.map((row) => row.file_id))];
  const files = fileIds.length
    ? await tenantDb(db, tenantId).from("files").select("id, name").in("id", fileIds)
    : { data: [], error: null };
  if (files.error) throw new DbFailure(files.error, "files");
  const nameOf = new Map(files.data.map((file) => [file.id, file.name]));
  return data.map((row) => ({
    id: row.id,
    fileId: row.file_id,
    fileName: nameOf.get(row.file_id) ?? null,
    kind: row.kind,
    place: row.place,
    caption: row.caption,
    permalink: row.permalink,
  }));
}
