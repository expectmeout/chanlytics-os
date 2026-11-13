/**
 * A business's files, what a member does to one already there (decision 0099). Every write goes through a door on the member's
 * own session, which asks the settings permission itself. The service role here only signs addresses.
 */
import "server-only";
import {
  AppError,
  DAY_MS,
  FILE_TYPES,
  FILE_WORDS as W,
  HOUR_MS,
  POST_PLACES,
  POST_PULLABLE,
  POST_SHAPES,
  SECOND_MS,
  WEEK_MS,
  fileMadePathOf,
  fileNameOf,
  filePathOf,
  isOneOf,
  postPathOf,
  type FileShows,
  type PostPlace,
} from "@chanlytics/contracts";
import {
  updateFileRow,
  keepManyFiles,
  findFile,
  deleteFileRow,
  restoreFileRow,
  filesBucket,
  listFilePosts,
  pullPost,
  type FileMemberRow,
} from "@chanlytics/db/files";
import { callEdge, edgeConfigured } from "@/server/shared/edge";
import { log } from "@/server/shared/log";
import { requireUuid } from "@/server/shared/request-guards";
import { row, type Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import { writeDoorRefusal, type RouteContext } from "@/server/shared/with-route";

/**
 * How long a picture's address lasts, and a little less for how long a browser keeps being sent to it. Storage's CDN keeps a
 * copy per signed address, so a fresh address each hour would be a fresh resize for every picture on every device. It costs
 * that a link outlives a removed member by up to a week; deleting the file ends it for everyone within a minute.
 */
const VIEW_LINK_S = WEEK_MS / SECOND_MS;
const VIEW_KEEP_S = (6 * DAY_MS) / SECOND_MS;
const POSTER_KEEP_S = HOUR_MS / SECOND_MS;
/** How long the edge has to sign a player's address: one token, one signed poster. */
const PLAY_MS = 8 * SECOND_MS;
/** The widths a picture is drawn at, so one picture is resized a few times and never once per asker. */
const VIEW_WIDTHS = [480, 1280] as const;
const VIEW_WIDEST = 2000;

/** The door's refusal, in its own words; anything else is ours to say. */
export function fileDoorRefusal(error: { code?: string; message: string }): AppError {
  const refused = writeDoorRefusal(error);
  if (refused) return refused;
  log.error("db_failed", { code: error.code ?? null, error: error.message });
  return new AppError("internal", W.notSaved, 500);
}

export const bucket = () => filesBucket(serviceDb());

/** A file the caller may see (RLS), or a 404. */
export const fileScope = row(async (ctx: RouteContext, params): Promise<FileMemberRow> => {
  const found = await findFile(ctx.supabase, requireUuid(params.id, "file"));
  if (!found) throw new AppError("not_found", W.gone, 404);
  return found;
});

/**
 * A piece set aside is not posted (Ruben, 12 Nov 2026): each post of it still waiting to go out (for its time, or being made
 * ready) is let go, as Don't post does (00611 post_pull, on the member's own session and permission). One already going up
 * can't be stopped there, and goes. A post that stopped needs nobody once its piece is aside, so it is left as it is.
 * Answers the places a post was let go at, as the database said it (post_pull `pulled`), which the page says, and nothing
 * where the one that waited went up first.
 */
async function letWaitingPostsGo(ctx: RouteContext, member: Member, fileId: string): Promise<PostPlace[]> {
  const stopped = new Set<PostPlace>();
  for (const post of await listFilePosts(ctx.supabase, member.tenantId, fileId)) {
    if (!isOneOf(POST_PULLABLE, post.status) || !isOneOf(POST_PLACES, post.place)) continue;
    if ((await pullPost(ctx.supabase, post.id)).fate === "pulled") stopped.add(post.place);
  }
  return POST_PLACES.filter((place) => stopped.has(place));
}

/** PATCH files/[id]: what a person says of it. Answers where a post was let go as a made piece was set aside. */
export async function changeFile(
  ctx: RouteContext,
  member: Member,
  file: FileMemberRow,
  input: {
    name?: string | undefined;
    shows?: FileShows | undefined;
    who_in_it?: "no_one" | "agreed" | undefined;
    status?: "filed" | "set_aside" | undefined;
  },
): Promise<{ ok: true; stopped: PostPlace[] }> {
  const name = input.name === undefined ? undefined : fileNameOf(input.name);
  if (name === "") throw new AppError("validation", W.nameEmpty);
  // Its waiting posts first: a failure there leaves the piece where it was, never aside with a post still to go.
  const settingAside = input.status === "set_aside" && file.source === "made" && file.status !== "set_aside";
  const stopped = settingAside ? await letWaitingPostsGo(ctx, member, file.id) : [];
  const { error } = await updateFileRow(ctx.supabase, {
    tenantId: member.tenantId,
    id: file.id,
    name,
    shows: input.shows,
    whoInIt: input.who_in_it,
    status: input.status,
  });
  if (error) throw fileDoorRefusal(error);
  return { ok: true, stopped };
}

/** POST files/keep: the Inbox's one press. Answers how many moved. */
export async function keepFiles(
  ctx: RouteContext,
  member: Member,
  input: { ids: string[]; to?: "filed" | "set_aside" | undefined },
): Promise<{ kept: number }> {
  const { data, error } = await keepManyFiles(ctx.supabase, member.tenantId, input.ids, input.to ?? "filed");
  if (error) throw fileDoorRefusal(error);
  return { kept: typeof data === "number" ? data : 0 };
}

/**
 * DELETE files/[id]: hidden now, its bytes gone by the job. A piece deleted is not posted either, as one set aside is not: its
 * waiting posts are let go first, so a post whose time falls in Undo's ten minutes is neither sent nor told to the bell as one
 * that "didn't post". Undo brings the piece back, not its time: it is posted again from it.
 */
export async function removeFile(ctx: RouteContext, member: Member, file: FileMemberRow): Promise<{ ok: true }> {
  if (file.source === "made") await letWaitingPostsGo(ctx, member, file.id);
  const { error } = await deleteFileRow(ctx.supabase, member.tenantId, file.id);
  if (error) throw fileDoorRefusal(error);
  return { ok: true };
}

/** POST files/[id]/restore: Undo of a delete, while its purge waits (00616). One whose bytes have begun to go says so. */
export async function restoreFile(ctx: RouteContext, member: Member, id: string): Promise<{ ok: true }> {
  const { error } = await restoreFileRow(ctx.supabase, member.tenantId, id);
  if (error?.code === "P0002") throw new AppError("not_found", W.restoreGone, 404);
  if (error) throw fileDoorRefusal(error);
  return { ok: true };
}

/** The nearest width we draw at, for what a page asked. */
function widthOf(requested: string | null): number {
  const n = Number(requested);
  return VIEW_WIDTHS.find((w) => w >= n) ?? VIEW_WIDEST;
}

/**
 * GET files/[id]/view: a redirect to the picture, kept by the browser for most of the address's life, so a page of them paints
 * from disk and not from a page of requests. `w` is a resized copy; `download` the original, under its name. A HEIC is drawn
 * only as a copy, since a browser cannot read one. A video's picture is its poster (stage B): the video itself is the player's,
 * and a clip's original stays with whoever sent it, so it has no download here. A video made here is the one video that has:
 * its own file is kept in its folder as it was drawn (00613), since it exists nowhere else.
 */
/** Where a file's bytes are kept: a video's poster, or a video made here's own file; a post's shape; or the one file. */
function viewPathOf(file: FileMemberRow, download: boolean, shape: (typeof POST_SHAPES)[number] | undefined): string {
  if (file.kind === "video") return fileMadePathOf(file.tenant_id, file.id, download ? "video" : "poster");
  return shape ? postPathOf(file.tenant_id, file.id, shape) : filePathOf(file.tenant_id, file.id, file.mime);
}

/**
 * A download's address: the signed link with the name it saves under, a post's shape beside it. The name goes on the address
 * here, encoded once: Storage's client encodes it twice, so año would download as a%C3%B1o.
 */
const downloadAddressOf = (
  signedUrl: string,
  file: FileMemberRow,
  shape: (typeof POST_SHAPES)[number] | undefined,
): string =>
  `${signedUrl}&download=${encodeURIComponent(`${file.name}${shape ? `-${shape}` : ""}.${FILE_TYPES[file.mime]}`)}`;

export async function viewFile(file: FileMemberRow, url: URL): Promise<Response> {
  const download = url.searchParams.has("download");
  // A video made here keeps its own file in its folder (00613), and gives it; a clip a member sent stays with them.
  const madeVideo = file.kind === "video" && file.source === "made";
  if (file.kind === "video") {
    if (download && !madeVideo) throw new AppError("validation", W.video.noDownload);
    if (file.media_status !== "ready") throw new AppError("not_found", W.video.gettingReady, 404);
  }
  const requested = url.searchParams.get("w");
  const mime = file.mime;
  // A post is a picture made here. A video made here is a video like any other: its poster, and a file of its own besides.
  const post = file.source === "made" && file.kind !== "video";
  // A post holds a shape each; anything else has its one file, whatever is asked.
  const shape = post ? POST_SHAPES.find((s) => s === url.searchParams.get("shape")) : undefined;
  const path = viewPathOf(file, download, shape);
  // A post is drawn at its own size, and small: a resize would only count it against Storage's allowance of source images.
  const opts =
    !download && !post && (requested !== null || FILE_TYPES[mime] === "heic")
      ? { transform: { width: widthOf(requested), resize: "contain" as const } }
      : {};
  const link = await bucket().createSignedUrl(path, VIEW_LINK_S, opts);
  if (link.error || !link.data) {
    log.error("file_view_sign_failed", { tenant_id: file.tenant_id, error: link.error?.message ?? "no address" });
    throw new AppError("unavailable", W.failedRead);
  }
  // A picture's bytes never change, but a download's name does: that redirect is asked for afresh each time. A video's poster
  // is cut again when the look chooses its frame, so its redirect is kept an hour, not a week.
  const keep = download
    ? "private, no-store"
    : `private, max-age=${file.kind === "video" ? POSTER_KEEP_S : VIEW_KEEP_S}`;
  const location = download ? downloadAddressOf(link.data.signedUrl, file, shape) : link.data.signedUrl;
  return new Response(null, { status: 302, headers: { location, "cache-control": keep } });
}

/**
 * GET files/[id]/play: the player's address for a video, under a token the edge signs for an hour, for this member's session:
 * one asking per sheet opened, none per tile. A video still being made ready, or Stream unreachable, is said in words.
 */
export async function playFile(
  ctx: RouteContext,
  file: FileMemberRow,
): Promise<{ player_url: string; expires_at: string }> {
  if (file.kind !== "video") throw new AppError("validation", W.video.notAVideo);
  if (file.media_status !== "ready") throw new AppError("validation", W.video.gettingReady);
  if (!edgeConfigured()) throw new AppError("internal", W.video.cantPlay);
  const answer = await callEdge(
    "/api/admin/files/play",
    { tenant_id: file.tenant_id, id: file.id },
    { workspace: file.tenant_id, user: ctx.userId, timeoutMs: PLAY_MS },
  );
  const reply = answer.body;
  if (answer.status !== 200 || typeof reply?.player_url !== "string" || typeof reply.expires_at !== "string") {
    log.warn("file_play_failed", { tenant_id: file.tenant_id, status: answer.status });
    throw new AppError("internal", W.video.cantPlay);
  }
  return { player_url: reply.player_url, expires_at: reply.expires_at };
}
