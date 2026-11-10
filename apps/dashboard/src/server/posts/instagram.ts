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
  POST_KINDS,
  POST_PLACES,
  POST_STATUSES,
  isOneOf,
  metaLinesOf,
  postCaptionProblem,
  recordOrEmpty,
  type InstagramPostable,
  type InstagramPostKind,
  type PostDto,
  type TenantId,
} from "@chanlytics/contracts";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import { beginPost, listFilePosts, pullPost, type FileMemberRow, type MemberPostRow } from "@chanlytics/db/files";
import { readMetaSwitch } from "@/server/connections/meta";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";

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

/** A post as the sheet reads it: Instagram's refusal in the owner's words, never its code. */
export function postDtoOf(row: MemberPostRow): PostDto {
  const words = recordOrEmpty(row.error).words;
  return {
    id: row.id,
    // A value a newer write holds that this build does not know is read as the nearest it does.
    place: isOneOf(POST_PLACES, row.place) ? row.place : "instagram",
    kind: isOneOf(POST_KINDS, row.kind) ? row.kind : "picture",
    caption: row.caption,
    status: isOneOf(POST_STATUSES, row.status) ? row.status : "checking",
    held_reason: row.held_reason,
    permalink: row.permalink,
    scheduled_for: row.scheduled_for,
    published_at: row.published_at,
    error: typeof words === "string" ? words : null,
    created_at: row.created_at,
  };
}

/** A file's posts on Instagram, newest first, as the sheet shows them, of the file's posts read under the member's session. */
export const instagramPostsOf = (rows: readonly MemberPostRow[]): PostDto[] =>
  rows.filter((r) => r.place === "instagram").map(postDtoOf);

/** What the press refuses before anything is written, in words. */
async function refusalBefore(member: Member, row: FileMemberRow): Promise<AppError | null> {
  if (row.source !== "made") return new AppError("validation", ON_INSTAGRAM.notAPost);
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

/** DELETE files/[id]/instagram: Don't post, up to the moment it is sent. */
export async function pullFileFromInstagram(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: { post_id: string },
): Promise<{ pulled: true }> {
  const posts = await listFilePosts(ctx.supabase, member.tenantId, row.id);
  if (!posts.some((p) => p.id === input.post_id && p.place === "instagram"))
    throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  const pulled = await pullPost(ctx.supabase, input.post_id);
  if (pulled.fate === "late") throw new AppError("conflict", ON_INSTAGRAM.pullLate, 409);
  if (pulled.fate !== "pulled") throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  return { pulled: true };
}
