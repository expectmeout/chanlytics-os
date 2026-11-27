/**
 * What a kept post remembers (decision 0099, step 3): the photo it came from and what it was asked to be, so a later version starts
 * from what this one did, and Ask keeps the look a person settled on. A member's session has no grant on `made` (00553), so the
 * service role reads it, and only after the caller's own read of the row said it is theirs to see, or for their own workspace.
 */
import "server-only";
import {
  fileSoundOf,
  piecePlanOf,
  postPlanOf,
  recordOrNull,
  type FilePosted,
  type FileRecordDto,
  type PieceTakeDownDto,
  type PieceVersionsDto,
  type PostDto,
  type PostPlan,
} from "@chanlytics/contracts";
import {
  getFileMade,
  findFile,
  findPieceOfVideo,
  findPiecePlanOfFile,
  findVersionDrawing,
  getNewestMade,
  listFilePosts,
  listPiecePosts,
  listPieceVersions,
  readFileSound,
  type VideoPieceRow,
  type FileMemberRow,
  type MemberPostRow,
} from "@chanlytics/db/files";
import { findFilePosted } from "@chanlytics/db/events";
import { findConnection } from "@/server/connections/google";
import { instagramPostsOf } from "./instagram";
import { readInstagramPostable } from "@/server/connections/meta";
import { facebookPostsOf, readFacebookPostable } from "./facebook";
import { fileMadeOf } from "./made-as";
import { readPieceTakeDown } from "./take-down";
import { log } from "@/server/shared/log";
import { handPostOf, sentPostsOf, withRemovedThere } from "@/server/readers/content/content";
import { fileDtoOf } from "@/server/readers/files/files";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import type { TenantId } from "@chanlytics/contracts";

/**
 * GET files/[id]: one file, and for a post what it came from and what it was asked to be. A video's is what was heard of it
 * besides (stage B): its words and how it sounds, read by id under the caller's RLS, never by the list; and one Ask made, the
 * plan it was drawn by, so its words can be made again.
 */
export async function readFileRecord(ctx: RouteContext, member: Member, row: FileMemberRow): Promise<FileRecordDto> {
  const file = fileDtoOf(row);
  if (row.kind === "video") {
    const ours = row.source === "made";
    const piece = ours ? await findPieceOfVideo(ctx.supabase, member.tenantId, row.id) : null;
    const [sound, plan, listed, can, page, version] = await Promise.all([
      readFileSound(ctx.supabase, row.id),
      ours ? findPiecePlanOfFile(ctx.supabase, member.tenantId, row.id) : null,
      // A made video's posts: its reel on Instagram (00681) and on a Page (pass 5), and the one its owner put up by hand;
      // at every one of its versions (00708), so version 1's posts that wait are said under version 2.
      ours
        ? piece
          ? listPiecePosts(ctx.supabase, member.tenantId, { id: piece.id, fileId: row.id })
          : listFilePosts(ctx.supabase, member.tenantId, row.id)
        : [],
      ours ? readInstagramPostable(ctx.supabase, member.tenantId) : null,
      ours ? readFacebookPostable(ctx.supabase, member.tenantId) : null,
      piece ? readVersions(ctx, member, piece) : null,
    ]);
    const posts = await withRemovedThere(ctx.supabase, member.tenantId, listed);
    const drawnBy = recordOrNull(plan);
    return {
      file,
      made: null,
      // Google takes no video from here (contracts PLACE_CAPABILITIES).
      google: null,
      instagram: can === null ? null : { can, posts: instagramPostsOf(posts) },
      facebook: page === null ? null : { can: page, posts: facebookPostsOf(posts) },
      ...(ours ? { posts: sentPostsOf(posts) } : {}),
      by_hand: handPostOf(posts),
      sound: fileSoundOf(sound),
      ...(drawnBy ? { video: { plan: piecePlanOf(drawnBy) } } : {}),
      ...(version ? { version: { ...version, waiting: waitingAt(posts, version.n) } } : {}),
    };
  }
  if (row.source !== "made") return { file, made: null, google: null, instagram: null };
  const [kept, connection, listed, can, page] = await Promise.all([
    getFileMade(ctx.supabase, member.tenantId, row.id),
    findConnection(ctx.supabase, member.tenantId),
    listFilePosts(ctx.supabase, member.tenantId, row.id),
    readInstagramPostable(ctx.supabase, member.tenantId),
    readFacebookPostable(ctx.supabase, member.tenantId),
  ]);
  const posts = await withRemovedThere(ctx.supabase, member.tenantId, listed);
  const google = {
    connected: !!connection?.location_name,
    posted: await onGoogle(ctx.supabase, member, row.id, posts),
  };
  const instagram = can === null ? null : { can, posts: instagramPostsOf(posts) };
  const facebook = page === null ? null : { can: page, posts: facebookPostsOf(posts) };
  // Every place's, whatever the Meta link, so a piece read on its own stands where the page that lists it says; and apart
  // from them the one its owner put up by hand.
  const placed = { google, instagram, facebook, posts: sentPostsOf(posts), by_hand: handPostOf(posts) };
  const created = recordOrNull(kept);
  if (!created) return { file, made: null, ...placed };
  // Read under the caller's RLS: a photo removed since, or one they can't see, is no photo to name.
  const from = typeof created.from === "string" ? await findFile(ctx.supabase, created.from) : null;
  return { file, made: fileMadeOf(created, from ? { id: from.id, name: from.name } : null), ...placed };
}

/** A made video's versions (00708): the one it stands at, one being made or that could not be, and each drawn. */
async function readVersions(
  ctx: RouteContext,
  member: Member,
  piece: VideoPieceRow,
): Promise<Omit<PieceVersionsDto, "waiting">> {
  const [rows, drawing] = await Promise.all([
    listPieceVersions(ctx.supabase, member.tenantId, piece.id),
    findVersionDrawing(ctx.supabase, member.tenantId, piece.id),
  ]);
  // A version is listed where it was drawn: one that moved only its words shows the bytes before it.
  const drawn = rows.filter((v, i) => v.file_id !== null && v.file_id !== rows[i + 1]?.file_id);
  return {
    n: piece.revision,
    drawing: drawing && !drawing.failed ? drawing.stage : null,
    failed: drawing?.failed ?? false,
    list: drawn.map((v) => ({ n: v.n, changed: v.changed, at: v.created_at, file_id: v.file_id ?? "" })),
  };
}

/** Posts still set to go at a version before this one: each waits for this one's approval. */
const waitingAt = (posts: readonly { id: string; status: string; revision?: number | null }[], n: number): string[] =>
  posts
    .filter((p) => (p.status === "queued" || p.status === "preparing" || p.status === "held") && (p.revision ?? n) < n)
    .map((p) => p.id);

/** A file's posts at every place, newest first, under the caller's RLS: what Ask's card to put a post up checks first. */
export async function readFilePosts(ctx: RouteContext, tenantId: TenantId, fileId: string): Promise<PostDto[]> {
  const posts = await listFilePosts(ctx.supabase, tenantId, fileId);
  return sentPostsOf(await withRemovedThere(ctx.supabase, tenantId, posts));
}

/**
 * Where the post is on Google (decision 0121, D16): its newest placement where that says it went up or came down; else what
 * the edge's events say, for a post made before placements were kept, or one whose answer the press never heard.
 */
async function onGoogle(
  db: RouteContext["supabase"],
  member: Member,
  fileId: string,
  posts: readonly MemberPostRow[],
): Promise<FilePosted | null> {
  // A post let go (Don't post) says nothing of one that is up: the newest of the others does.
  const placed = posts.find((p) => p.place === "google" && p.status !== "pulled");
  if (placed?.status === "taken_down") return null;
  if (placed?.status === "published" && placed.external_id)
    return { name: placed.external_id, search_url: placed.permalink, at: placed.published_at ?? placed.created_at };
  return findFilePosted(db, member.tenantId, fileId);
}

/** The look a person settled on, as their newest post keeps it: what a card changed, since a card's Save keeps what was pressed. */
type PostLook = Pick<PostPlan, "voice" | "layout" | "book">;

/** What the workspace's newest post looks like, or null before its first. Never costs a turn: a failed read is no look to keep. */
export async function findNewestPostLook(db: RouteContext["supabase"], tenantId: TenantId): Promise<PostLook | null> {
  try {
    const created = recordOrNull(await getNewestMade(db, tenantId));
    const plan = recordOrNull(created?.plan);
    if (!plan) return null;
    const { voice, layout, book } = postPlanOf(plan);
    return { voice, layout, book };
  } catch (e) {
    log.warn("file_post_look_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * A made piece's standing beyond its posts (GET files/[id]; 00682): its newest take-down. Null for anything AI did not
 * make.
 */
export async function readPieceStanding(
  ctx: RouteContext,
  member: Member,
  row: FileMemberRow,
  posts: readonly PostDto[],
): Promise<{ take_down: PieceTakeDownDto | null } | null> {
  if (row.source !== "made") return null;
  return { take_down: await readPieceTakeDown(ctx, member, { id: row.id, postIds: posts.map((p) => p.id) }) };
}
