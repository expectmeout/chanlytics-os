/**
 * A made piece's caption, changed where it stands (Campaigns › Content, Details; Ruben, 12 Nov 2026: tap the caption and type).
 * Kept with how the piece was made: a post's beside its plan (`files.made`), a video's on the plan it was drawn by, which the
 * page and Ask both read. A member's session has no grant on either (00553, 00613), so the service role keeps it, and only
 * after the route's own read of the row, under the member's RLS, said the piece is theirs.
 */
import "server-only";
import {
  AppError,
  FILE_WORDS as W,
  PIECE_LIMITS,
  POST_CAPTION_MAX,
  postCaptionOf,
  recordOrNull,
  type TenantId,
} from "@chanlytics/contracts";
import {
  getFileMade,
  keepPostCaption,
  keepVideoCaption,
  listFilePosts,
  type FileMemberRow,
} from "@chanlytics/db/files";
import { changeFile } from "@/server/files/file";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { fileMadeOf } from "./record";

type FileChange = Parameters<typeof changeFile>[3];

/** PATCH files/[id]: the caption, where one is sent, and then what else a person says of the file. */
export async function changePiece(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  input: FileChange & { caption?: string | undefined },
): Promise<{ ok: true }> {
  const { caption, ...rest } = input;
  if (caption !== undefined) await keepCaption(member, row, caption);
  const saysMore =
    rest.name !== undefined || rest.shows !== undefined || rest.who_in_it !== undefined || rest.status !== undefined;
  if (saysMore) await changeFile(ctx, member, row, rest);
  return { ok: true };
}

/**
 * The caption, trimmed, within what its piece takes: a post's what Instagram takes, a video's what its plan holds. Emptied is
 * a caption too: the owner said there are no words.
 */
async function keepCaption(member: Member, row: FileMemberRow, said: string): Promise<void> {
  if (row.source !== "made") throw new AppError("validation", W.captionNotMade);
  const caption = said.trim();
  const video = row.kind === "video";
  const most = video ? PIECE_LIMITS.caption : POST_CAPTION_MAX;
  if (caption.length > most) throw new AppError("validation", W.captionLong(most));
  const kept = video
    ? await keepVideoCaption(serviceDb(), member.tenantId, row.id, caption)
    : await keepPostCaption(serviceDb(), member.tenantId, row.id, caption);
  if (!kept) throw new AppError("not_found", W.gone);
}

/**
 * A made post's caption as Details says it (contracts postCaptionOf), read on the server: what Ask's card to put it up proposes
 * where the owner named no other. Its posts under the caller's RLS; how it was made by the service role, after the caller's own
 * read of the file said it is theirs.
 */
export async function readPostCaption(ctx: RouteContext, tenantId: TenantId, fileId: string): Promise<string | null> {
  const [kept, posts] = await Promise.all([
    getFileMade(serviceDb(), tenantId, fileId),
    listFilePosts(ctx.supabase, tenantId, fileId),
  ]);
  const created = recordOrNull(kept);
  return postCaptionOf(posts, created ? fileMadeOf(created, null) : null);
}
