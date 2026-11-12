import "server-only";
import {
  CONTENT_FAILED_DAYS,
  CONTENT_LINES_PAGE,
  CONTENT_MAKING_MAX,
  CONTENT_MAX,
  CONTENT_PAGE,
  CONTENT_STOPPED_MAX,
  DAY_MS,
  PIECE_FAILS,
  PIECE_STAGES,
  POST_KINDS,
  POST_PLACES,
  POST_STATUSES,
  SECOND_MS,
  fileCursorOf,
  isOneOf,
  pieceFileIdsOf,
  pieceOpeningOf,
  piecePlanOf,
  recordOrEmpty,
  shelfFilterOf,
  contentNoteOf,
  type ContentLineDto,
  type ContentMakingDto,
  type ContentNote,
  type ContentPageDto,
  type ContentTally,
  type ContentView,
  type PostDto,
  type TenantId,
} from "@chanlytics/contracts";
import {
  countFilesMade,
  countPostsOut,
  countPostsTimed,
  listFilesByIds,
  listFilesOnShelf,
  listPiecesStanding,
  listPostsOfFiles,
  listPostsStopped,
  listPostsTimed,
  listPostsUp,
  type MemberFilePostRow,
  type MemberPostRow,
  type PieceStandingRow,
} from "@chanlytics/db/files";
import { readerStamp, type Reader, type ReaderContext } from "../shared/reader";
import { cursorAsked, fileDtoOf } from "./files";

/** A post as a page reads it: a platform's refusal in the owner's words, never its code, and never its id there. */
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

/** A video asked for that is no file yet, as the page reads it: where it stands, the words it opens on, the clip it starts from. */
function makingDtoOf(row: PieceStandingRow): ContentMakingDto {
  const plan = piecePlanOf(recordOrEmpty(row.plan));
  const failed = row.status === "failed";
  const reason = isOneOf(PIECE_FAILS, row.failed_why) ? row.failed_why : "unknown";
  return {
    id: row.id,
    status: failed ? "failed" : "making",
    stage: isOneOf(PIECE_STAGES, row.stage) ? row.stage : "queued",
    failed_why: failed ? reason : null,
    lines: pieceOpeningOf(plan),
    language: plan.language,
    moments: plan.blocks.length,
    first_picture: pieceFileIdsOf(plan)[0] ?? null,
    created_at: row.created_at,
  };
}

/** What a page of Content is asked for. Nothing asked is the first page of All. */
interface ContentAsked {
  view?: ContentView | undefined;
  limit?: number | undefined;
  before?: string | undefined;
}

type Db = ReaderContext["ctx"]["supabase"];

/** A post set for later than this from now waits for its time (campaigns/content/model/piece-open.ts, the same two minutes). */
const TIMED_AFTER_MS = 2 * 60 * SECOND_MS;

/**
 * The stopped posts still the newest at their file and place: a post refused and sent again since is no longer the owner's
 * to mend. The newest at each place is read from all those files' posts, newest first.
 */
async function postsStillStopped(db: Db, tenantId: TenantId): Promise<MemberFilePostRow[]> {
  const stopped = await listPostsStopped(db, tenantId, CONTENT_STOPPED_MAX);
  if (stopped.length === 0) return [];
  const newest = new Map<string, string>();
  for (const post of await listPostsOfFiles(db, tenantId, [...new Set(stopped.map((p) => p.file_id))])) {
    const at = `${post.file_id}|${post.place}`;
    if (!newest.has(at)) newest.set(at, post.id);
  }
  return stopped.filter((p) => newest.get(`${p.file_id}|${p.place}`) === p.id);
}

/** Posts as lines: each with the file it is of, where that file is still there. */
async function postLinesOf(db: Db, tenantId: TenantId, posts: readonly MemberFilePostRow[]): Promise<ContentLineDto[]> {
  const files = new Map(
    (await listFilesByIds(db, tenantId, [...new Set(posts.map((p) => p.file_id))])).map((f) => [f.id, fileDtoOf(f)]),
  );
  return posts.flatMap((post) => {
    const file = files.get(post.file_id);
    return file ? [{ post: postDtoOf(post), file }] : [];
  });
}

/** The tally of every view, read with any page: so the control beside Made says how many each holds wherever it stands. */
async function tallyOf(
  db: Db,
  tenantId: TenantId,
  standing: readonly PieceStandingRow[],
  stopped: readonly MemberFilePostRow[],
  timedAfter: string,
): Promise<ContentTally> {
  const [made, posted, scheduled] = await Promise.all([
    countFilesMade(db, tenantId),
    countPostsOut(db, tenantId),
    countPostsTimed(db, tenantId, timedAfter),
  ]);
  const failed = standing.filter((p) => p.status === "failed").length;
  return { made, posted, scheduled, needs: stopped.length + failed, making: standing.length - failed };
}

/** A page of what was made, newest first, each with its posts: All. One past the page, so its last says it is the last. */
async function madePage(db: Db, tenantId: TenantId, request: ContentAsked) {
  const limit = Math.min(request.limit ?? CONTENT_PAGE, CONTENT_MAX);
  const rows = await listFilesOnShelf(db, tenantId, shelfFilterOf("made"), {
    limit: limit + 1,
    before: cursorAsked(request.before),
  });
  const page = rows.slice(0, limit);
  const postsOf = new Map<string, PostDto[]>();
  for (const post of await listPostsOfFiles(
    db,
    tenantId,
    page.map((f) => f.id),
  )) {
    const held = postsOf.get(post.file_id) ?? [];
    held.push(postDtoOf(post));
    postsOf.set(post.file_id, held);
  }
  const last = page.at(-1);
  return {
    made: page.map((f) => ({ file: fileDtoOf(f), posts: postsOf.get(f.id) ?? [] })),
    next: rows.length > limit && last ? fileCursorOf(last) : null,
  };
}

/** A page of a view's lines: what waits for its time, soonest first, or what is up, newest first. */
async function linesPage(
  db: Db,
  tenantId: TenantId,
  view: "scheduled" | "posted",
  request: ContentAsked,
  timedAfter: string,
) {
  const limit = Math.min(request.limit ?? CONTENT_LINES_PAGE, CONTENT_MAX);
  const page = { limit: limit + 1, before: cursorAsked(request.before) };
  const rows =
    view === "scheduled" ? await listPostsTimed(db, tenantId, timedAfter, page) : await listPostsUp(db, tenantId, page);
  const kept = rows.slice(0, limit);
  const last = kept.at(-1);
  const at = last ? (view === "scheduled" ? last.scheduled_for : last.published_at) : null;
  return {
    lines: await postLinesOf(db, tenantId, kept),
    next: rows.length > limit && last && at ? `${at}|${last.id}` : null,
  };
}

/**
 * GET content, as the route answers it (Campaigns › Content), for one view of Made: All, a page of what was made here,
 * newest first, each with its posts at every place, and what is being made on its first page; Being made, the videos being
 * made and those not made this week; Needs you, the posts that stopped and the videos not made; Scheduled, the posts that
 * wait for their time, soonest first; Posted, the posts that are up, newest first. Every view says the tally of all five.
 */
/**
 * GET content/note: Content's one line on Today, or none (contracts content/note.ts): what needs the owner, then what is
 * being made, then the next post set for its time. Its own small read, since the page's is too much to ask each time Today
 * opens: no page of tiles, no counts of what is up.
 */
export const contentNote: Reader<undefined, { note: ContentNote | null }> = {
  name: "content_note",
  async read(rc) {
    const db = rc.ctx.supabase;
    const now = rc.now.getTime();
    const [standing, stopped, timed] = await Promise.all([
      listPiecesStanding(db, rc.tenantId, {
        failedSince: new Date(now - CONTENT_FAILED_DAYS * DAY_MS).toISOString(),
        limit: CONTENT_MAKING_MAX,
      }),
      postsStillStopped(db, rc.tenantId),
      listPostsTimed(db, rc.tenantId, new Date(now + TIMED_AFTER_MS).toISOString(), { limit: 1 }),
    ]);
    const failed = standing.filter((p) => p.status === "failed").length;
    const soonest = timed[0];
    const next =
      soonest && isOneOf(POST_PLACES, soonest.place) ? { at: soonest.scheduled_for, place: soonest.place } : null;
    const note = contentNoteOf({ needs: stopped.length + failed, making: standing.length - failed, next }, now);
    return { data: { note }, rows: [], stamp: readerStamp() };
  },
};

export const content: Reader<ContentAsked, ContentPageDto> = {
  name: "content",
  async read(rc, request) {
    const view = request.view ?? "all";
    const db = rc.ctx.supabase;
    // The turn's clock, as every reader that says "now" reads it.
    const now = rc.now.getTime();
    const failedSince = new Date(now - CONTENT_FAILED_DAYS * DAY_MS).toISOString();
    const timedAfter = new Date(now + TIMED_AFTER_MS).toISOString();
    const [standing, stopped] = await Promise.all([
      listPiecesStanding(db, rc.tenantId, { failedSince, limit: CONTENT_MAKING_MAX }),
      postsStillStopped(db, rc.tenantId),
    ]);
    const empty = { making: [], made: [], lines: [], next: null };
    const [tally, shown] = await Promise.all([
      tallyOf(db, rc.tenantId, standing, stopped, timedAfter),
      view === "all"
        ? madePage(db, rc.tenantId, request).then((page) => {
            // A video whose file has arrived is that file's tile: it is drawn once. What is being made heads the first page.
            const onPage = new Set(page.made.map((m) => m.file.id));
            const making = request.before ? [] : standing.filter((p) => !p.file_id || !onPage.has(p.file_id));
            return { ...empty, ...page, making: making.map(makingDtoOf) };
          })
        : view === "making"
          ? Promise.resolve({ ...empty, making: standing.map(makingDtoOf) })
          : view === "needs"
            ? postLinesOf(db, rc.tenantId, stopped).then((lines) => ({
                ...empty,
                lines,
                making: standing.filter((p) => p.status === "failed").map(makingDtoOf),
              }))
            : linesPage(db, rc.tenantId, view, request, timedAfter).then((page) => ({ ...empty, ...page })),
    ]);
    return { data: { view, ...shown, tally }, rows: [], stamp: readerStamp() };
  },
};
