/**
 * A made post on its way to the business's Instagram (decision 0121): a person's press, and only that, which is the approval
 * the placement records. The press writes the post and its first job through its door, on the member's own session (00681
 * post_approve), and answers at once; the edge makes it ready, rechecks right before the send, and sends it. Until the send,
 * Don't post stops it. Offered only where the Meta link is switched on for the workspace and its account allows posting.
 */
import "server-only";
import {
  AppError,
  ON_INSTAGRAM,
  intentOfAbout,
  type InstagramPostKind,
  type OwnersFact,
  type PostAbout,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { listFilePosts, movePostTime, pullPost, type FileMemberRow, type MemberPostRow } from "@chanlytics/db/files";
import { readInstagramPostable } from "@/server/connections/meta";
import { postDtoOf } from "@/server/readers/content";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { approvePlacements, readyApproval } from "./approve";

/** A file's posts on Instagram, newest first, as the sheet shows them, of the file's posts read under the member's session. */
export const instagramPostsOf = (rows: readonly MemberPostRow[]): PostDto[] =>
  rows.filter((r) => r.place === "instagram").map(postDtoOf);

/** What the press refuses before anything is read or written, in words: only a post or a video made here goes. */
async function refusalBefore(member: Member, row: FileMemberRow): Promise<AppError | null> {
  if (row.source !== "made") return new AppError("validation", ON_INSTAGRAM.notAPost);
  const postable = await readInstagramPostable(member.tenantId);
  if (postable === null || postable === "not_connected")
    return new AppError("conflict", ON_INSTAGRAM.notConnected, 409);
  if (postable === "line_off") return new AppError("conflict", ON_INSTAGRAM.lineOff, 409);
  return null;
}

/** What a press on Instagram carries: how it goes, its words, its time, and what AI's card said its words are about. */
interface InstagramPress {
  as: InstagramPostKind;
  caption?: string | undefined;
  when?: string | undefined;
  about?: PostAbout | undefined;
  facts?: OwnersFact[] | undefined;
  /** AI's approval under the owner's rung (00712), never a person's press. */
  via?: "rung" | undefined;
}

/**
 * POST files/[id]/instagram: the post approved for Instagram (00681), a picture as a post or a story, a video as a reel,
 * now or at a time the person chose. The press is the approval: of these bytes, these words, this place (posts/approve.ts).
 */
/** What a press on Instagram asks of the approval, after the place's own refusals. */
async function instagramAsked(member: Member, row: FileMemberRow, input: InstagramPress) {
  const refused = await refusalBefore(member, row);
  if (refused) throw refused;
  // A story shows no caption, so none is kept for one. The words that go are kept on the piece by the approval, once its
  // checks have passed (posts/approve.ts).
  const caption = input.as === "story" ? null : input.caption?.trim() || null;
  return {
    placements: [{ place: "instagram" as const, kind: input.as, caption, when: input.when ?? null }],
    intent: intentOfAbout(input.about),
    facts: input.facts ?? [],
    via: input.via ?? ("press" as const),
    connections: { instagram: "yes" as const },
  };
}

/** A held week's Instagram placement readied overnight (00712): every check, nothing approved; the door takes it at 8:00. */
export async function readyOnInstagram(ctx: RouteContext, member: Member, row: FileMemberRow, input: InstagramPress) {
  return readyApproval(ctx, member, row, await instagramAsked(member, row, input));
}

export async function postFileToInstagram(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: InstagramPress,
): Promise<{ post_id: string; status: "queued" }> {
  const approved = await approvePlacements(ctx, member, row, await instagramAsked(member, row, input));
  const postId = approved.posts[0]?.post_id;
  if (!postId) throw new AppError("not_found", ON_INSTAGRAM.gone, 404);
  return { post_id: postId, status: "queued" };
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
