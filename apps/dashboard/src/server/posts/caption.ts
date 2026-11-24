/**
 * A made piece's caption, changed where it stands (Campaigns › Content, Details; Ruben, 12 Nov 2026: tap the caption and type).
 * Kept with how the piece was made: a post's beside its plan (`files.made`), a video's on the plan it was drawn by, which the
 * page and Ask both read. A member's session has no grant on either (00553, 00613), so the service role keeps it, and only
 * after the route's own read of the row, under the member's RLS, said the piece is theirs.
 */
import "server-only";
import {
  AppError,
  FILE_GOOGLE_WORDS_MAX,
  FILE_WORDS as W,
  PIECE_LIMITS,
  POST_CAPTION_MAX,
  postCaptionOf,
  postCaptionProblem,
  recordOrNull,
  type PostPlace,
  type TenantId,
} from "@chanlytics/contracts";
import {
  getFileMade,
  keepPostCaption,
  keepPieceWords,
  keepVideoCaption,
  listFilePosts,
  type FileMemberRow,
  type MemberPostRow,
} from "@chanlytics/db/files";
import { changeFile } from "@/server/files/file";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { sayPostedByHand, type ByHandWord } from "./by-hand";
import { fileMadeOf } from "./made-as";

type FileChange = Parameters<typeof changeFile>[3];

/**
 * PATCH files/[id]: the caption, where one is sent, and then what else a person says of the file. Answers where a post was let
 * go as a made piece was set aside (files/file.ts), which the page says.
 */
export async function changePiece(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: FileChange & { caption?: string | undefined; posted?: ByHandWord | undefined },
): Promise<{ ok: true; stopped: PostPlace[] }> {
  const { caption, posted, ...rest } = input;
  if (caption !== undefined) await keepCaption(ctx, member, row, { said: caption });
  // "I posted it", or not after all (by-hand.ts): the owner's word of a piece they put up themselves.
  if (posted !== undefined) await sayPostedByHand(ctx, member, row, posted);
  const saysMore = rest.name !== undefined || rest.shows !== undefined || rest.status !== undefined;
  return saysMore ? changeFile(ctx, member, row, rest) : { ok: true, stopped: [] };
}

/**
 * Why a post still waiting for its time could not go up with these words, or null: it takes them (followPostCaption), so they
 * are held to what it does. Google's post wants words, and no more than it shows; Instagram's picture what Instagram takes.
 * A story shows none, and one Instagram is already making ready keeps what it was made with.
 */
function waitingRefusalOf(waiting: readonly MemberPostRow[], caption: string): string | null {
  const queued = waiting.filter((p) => p.status === "queued" && p.kind !== "story");
  if (queued.length === 0) return null;
  if (!caption) return W.captionWaitsEmpty;
  if (queued.some((p) => p.place === "google") && caption.length > FILE_GOOGLE_WORDS_MAX)
    return W.captionWaitsGoogle(FILE_GOOGLE_WORDS_MAX);
  return queued.some((p) => p.place === "instagram") ? postCaptionProblem(caption) : null;
}

/**
 * The caption, trimmed, within what its piece takes: a post's what Instagram takes, a video's what its plan holds. Emptied is
 * a caption too: the owner said there are no words. A post's is then what its posts still waiting for their time go up with
 * (Ruben, 12 Nov 2026: the sheet said the new words over "Goes up Sat", and the old ones went up); its posts are read under
 * the member's RLS, and changed by the service role once the words are kept.
 */
async function keepCaption(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  /** The words as written. */
  { said }: { said: string },
): Promise<void> {
  const caption = said.trim();
  const posts = row.kind === "video" ? [] : await listFilePosts(ctx.supabase, member.tenantId, row.id);
  const refused = captionRefusalOf(row, caption, posts);
  if (refused) throw new AppError(refused.code, refused.words);
  if (!(await keepMadeWords(member, row, caption))) throw new AppError("not_found", W.gone);
  // The piece's next version, and every placement still waiting goes up with the new words: this member's save is their
  // approval of them (00681 piece_words_keep), so a scheduled post is never left behind on the old ones.
  await keepPieceWords(ctx.supabase, { tenantId: member.tenantId, fileId: row.id, caption: caption || null });
}

/** What stands in the way of these words, trimmed, on this piece and the file's posts still waiting; null where nothing does. */
function captionRefusalOf(
  row: FileMemberRow,
  caption: string,
  posts: readonly MemberPostRow[],
): { code: "validation"; words: string } | null {
  if (row.source !== "made") return { code: "validation", words: W.captionNotMade };
  const most = row.kind === "video" ? PIECE_LIMITS.caption : POST_CAPTION_MAX;
  if (caption.length > most) return { code: "validation", words: W.captionLong(most) };
  const waiting = row.kind === "video" ? null : waitingRefusalOf(posts, caption);
  return waiting ? { code: "validation", words: waiting } : null;
}

/**
 * How it was made says the words too (Details, AI's card to put it up): a post's beside its plan, a video's on the plan it was
 * drawn by, by the service role. Whether there was a made piece to keep them on.
 */
export async function keepMadeWords(member: Member, row: FileMemberRow, caption: string): Promise<boolean> {
  const db = serviceDb();
  return row.kind === "video"
    ? keepVideoCaption(db, member.tenantId, row.id, caption)
    : keepPostCaption(db, member.tenantId, row.id, caption);
}

/**
 * A post's words, where they change what the piece says, as an approval keeps them (Ruben, 12 Nov 2026: one step, so the words
 * that go and the words kept are never two). Held to what the piece and its posts still waiting take, and refused in the
 * owner's words, before anything is kept; the approval's own door keeps them with it (00713 post_approve_whole). Null where
 * they are the piece's already.
 */
export async function readWordsToKeep(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  words: string,
): Promise<string | null> {
  const { caption, posts } = await readCaptionKept(ctx, member.tenantId, row.id);
  const trimmed = words.trim();
  if (caption === (trimmed || null)) return null;
  const refused = captionRefusalOf(row, trimmed, posts);
  if (refused) throw new AppError(refused.code, refused.words);
  return trimmed;
}

/** The caption a made post keeps, with the posts it was read from: its posts under the caller's RLS, how it was made by the service role. */
async function readCaptionKept(
  ctx: RouteContext,
  tenantId: TenantId,
  fileId: string,
): Promise<{ caption: string | null; posts: MemberPostRow[] }> {
  const [kept, posts] = await Promise.all([
    getFileMade(serviceDb(), tenantId, fileId),
    listFilePosts(ctx.supabase, tenantId, fileId),
  ]);
  const created = recordOrNull(kept);
  return { caption: postCaptionOf(posts, created ? fileMadeOf(created, null) : null), posts };
}

/**
 * A made post's caption as Details says it (contracts postCaptionOf), read on the server: what Ask's card to put it up proposes
 * where the owner named no other. Its posts under the caller's RLS; how it was made by the service role, after the caller's own
 * read of the file said it is theirs.
 */
export async function readPostCaption(ctx: RouteContext, tenantId: TenantId, fileId: string): Promise<string | null> {
  return (await readCaptionKept(ctx, tenantId, fileId)).caption;
}
