/**
 * A made post on its way to the business's Instagram (decision 0121): a person's press, and only that, which is the approval
 * the placement records. The press writes the post and its first job through its door, on the member's own session (00611
 * post_begin), and answers at once; the edge makes it ready, rechecks right before the send, and sends it. Until the send,
 * Don't post stops it. Offered only where the Meta link is switched on for the workspace and its account allows posting.
 */
import "server-only";
import {
  AppError,
  ON_INSTAGRAM,
  metaLinesOf,
  postCaptionProblem,
  recordOrEmpty,
  type InstagramPostable,
  type InstagramPostKind,
  type PostDto,
  type PostPlace,
  type TenantId,
} from "@chanlytics/contracts";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import {
  beginPost,
  listFilePosts,
  movePostTime,
  pullPost,
  type FileMemberRow,
  type MemberPostRow,
} from "@chanlytics/db/files";
import { readMetaSwitch } from "@/server/connections/meta";
import { postDtoOf } from "@/server/readers/content";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { keepPostWords } from "./caption";

/**
 * Whether this workspace's Instagram takes a post now; null where the Meta link is not switched on, and nothing is offered.
 * A connection Meta no longer accepts (the daily check's `token_lapsed_at`) is not connected: a press there would only be
 * held a minute later, so it is not offered, and the sheet says to connect again.
 */
export async function readInstagramPostable(tenantId: TenantId): Promise<InstagramPostable | null> {
  if (!(await readMetaSwitch(tenantId))) return null;
  const row = await findMetaInstagramRow(serviceDb(), tenantId);
  if (!row) return "not_connected";
  const config = recordOrEmpty(row.config);
  if (config.token_lapsed_at) return "not_connected";
  return metaLinesOf(config.scopes).publish ? "yes" : "line_off";
}

/** A file's posts on Instagram, newest first, as the sheet shows them, of the file's posts read under the member's session. */
export const instagramPostsOf = (rows: readonly MemberPostRow[]): PostDto[] =>
  rows.filter((r) => r.place === "instagram").map(postDtoOf);

/** What the press refuses before anything is written, in words. */
async function refusalBefore(member: Member, row: FileMemberRow): Promise<AppError | null> {
  if (row.source !== "made") return new AppError("validation", ON_INSTAGRAM.notAPost);
  // A video made here is no picture or story: a reel waits for its own road to Instagram (decision 0121).
  if (row.kind === "video") return new AppError("validation", ON_INSTAGRAM.notYet);
  const postable = await readInstagramPostable(member.tenantId);
  if (postable === null || postable === "not_connected")
    return new AppError("conflict", ON_INSTAGRAM.notConnected, 409);
  if (postable === "line_off") return new AppError("conflict", ON_INSTAGRAM.lineOff, 409);
  return null;
}

/** POST files/[id]/instagram: the post approved for Instagram, as a picture or a story, now or at a time the person chose. */
export async function postFileToInstagram(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { as: InstagramPostKind; caption?: string | undefined; when?: string | undefined },
): Promise<{ post_id: string; status: "queued" }> {
  const refused = await refusalBefore(member, row);
  if (refused) throw refused;
  // A story shows no caption, so none is kept for one.
  const caption = input.as === "story" ? null : input.caption?.trim() || null;
  const captionProblem = caption ? postCaptionProblem(caption) : null;
  if (captionProblem) throw new AppError("validation", captionProblem);
  // The words that go are the piece's own from now on, kept in the same step (posts/caption.ts keepPostWords).
  if (caption) await keepPostWords(ctx, member, row, caption);
  const begun = await beginPost(ctx.supabase, {
    tenantId: member.tenantId,
    fileId: row.id,
    place: "instagram",
    kind: input.as,
    caption,
    when: input.when ?? null,
    via: "press",
  });
  if (begun.fate === "begun" && begun.post_id) return { post_id: begun.post_id, status: "queued" };
  if (begun.fate === "busy") throw new AppError("conflict", ON_INSTAGRAM.busy, 409);
  if (begun.fate === "gone") throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  if (begun.fate === "not_a_post") throw new AppError("validation", ON_INSTAGRAM.notAPost);
  throw new AppError("validation", ON_INSTAGRAM.notYet);
}

/** A post of this file, at the door's place where the door is a place's, as the member reads it, or why not: the one a press names. */
async function postOfFile(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  at: { post_id: string; place?: PostPlace },
) {
  const posts = await listFilePosts(ctx.supabase, member.tenantId, row.id);
  if (!posts.some((p) => p.id === at.post_id && (!at.place || p.place === at.place)))
    throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
}

/**
 * PATCH files/[id]/posts: Change time (00621), at either place. The same post, its approval and its words, set for `when`, its
 * job moved with it, in one step: never stopped and posted again. Late once a run has taken its job.
 */
export async function moveFilePost(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { post_id: string; when: string },
): Promise<{ moved: true }> {
  await postOfFile(ctx, member, row, input);
  const moved = await movePostTime(ctx.supabase, input.post_id, input.when);
  if (moved.fate === "late") throw new AppError("conflict", ON_INSTAGRAM.moveLate, 409);
  if (moved.fate !== "moved") throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  return { moved: true };
}

/**
 * DELETE files/[id]/instagram: Don't post, up to the moment it is sent. Google's door pulls its own the same way, a post set
 * for its time there (00616): `input.place` is the door's.
 */
export async function pullFilePost(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { post_id: string; place: PostPlace },
): Promise<{ pulled: true }> {
  await postOfFile(ctx, member, row, input);
  const pulled = await pullPost(ctx.supabase, input.post_id);
  if (pulled.fate === "late") throw new AppError("conflict", ON_INSTAGRAM.pullLate, 409);
  if (pulled.fate !== "pulled") throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  return { pulled: true };
}
