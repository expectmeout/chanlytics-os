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
  POST_SOON_MS,
  POST_STATUSES,
  WEEK_MS,
  fileCursorOf,
  isOneOf,
  pieceFileIdsOf,
  pieceOpeningOf,
  piecePlanOf,
  recordOrEmpty,
  shelfFilterOf,
  CONTENT_TODAY_PIECES,
  contentIdeaFilesOf,
  contentPieceMarkOf,
  type ContentLineDto,
  type ContentMakingDto,
  type ContentPageDto,
  type ContentTally,
  type ContentTodayDto,
  type ContentView,
  type HandPostDto,
  type PostDto,
  type TenantId,
} from "@chanlytics/contracts";
import {
  countFilesKept,
  countFilesMade,
  countPostsOut,
  countPostsTimed,
  listFilesByIds,
  listFilesFound,
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
import { listReviewWords } from "@chanlytics/db/google";
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

/** Whether a post's row is one its owner put up themselves (00620): kept at the place `hand`, and never a PostDto. */
const isByHand = (row: Pick<MemberPostRow, "place">): boolean => row.place === "hand";

/** A file's posts that a press sent, as a page reads them: one by hand is read apart (handPostOf). */
export const sentPostsOf = (rows: readonly MemberPostRow[]): PostDto[] =>
  rows.filter((row) => !isByHand(row)).map(postDtoOf);

/**
 * The post by hand a piece stands on, from its posts newest first: the newest its owner still says (one taken back is
 * pulled), with when they said so and its link; none where they said none.
 */
export function handPostOf(
  rows: readonly Pick<MemberPostRow, "id" | "place" | "status" | "permalink" | "published_at" | "created_at">[],
): HandPostDto | null {
  const kept = rows.find((row) => isByHand(row) && row.status === "published");
  return kept ? { id: kept.id, at: kept.published_at ?? kept.created_at, link: kept.permalink } : null;
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
  about?: string | undefined;
}

type Db = ReaderContext["ctx"]["supabase"];

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
  const newestStopped = stopped.filter((p) => newest.get(`${p.file_id}|${p.place}`) === p.id);
  // Of pieces still there and in use: one deleted or set aside needs nothing, so the count is the list's (postLinesOf).
  const inUse = new Set(
    (await listFilesByIds(db, tenantId, [...new Set(newestStopped.map((p) => p.file_id))]))
      .filter((f) => f.status === "filed")
      .map((f) => f.id),
  );
  return newestStopped.filter((p) => inUse.has(p.file_id));
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
  const [made, posted, scheduled, library, aside] = await Promise.all([
    countFilesMade(db, tenantId),
    countPostsOut(db, tenantId),
    countPostsTimed(db, tenantId, timedAfter),
    countFilesKept(db, tenantId),
    countFilesMade(db, tenantId, "set_aside"),
  ]);
  const failed = standing.filter((p) => p.status === "failed").length;
  return { made, posted, scheduled, library, aside, needs: stopped.length + failed, making: standing.length - failed };
}

/** How many of the newest kept files the ideas choose from: enough for two photos of the work and four clips among them. */
const IDEAS_FROM = 24;

/**
 * The files each idea would be made from (contracts contentIdeaFilesOf), from the newest kept files: read with All's first
 * page alone, where the first day and Make show them.
 */
async function ideaFilesOf(db: Db, tenantId: TenantId) {
  const [kept, reviews] = await Promise.all([
    listFilesOnShelf(db, tenantId, { status: "filed", made: false }, { limit: IDEAS_FROM }),
    // One review of four or five stars that says something is enough to offer its idea (the ones a quote may come
    // from); a read that failed offers none, and fails no page.
    listReviewWords(db, tenantId, 1),
  ]);
  return contentIdeaFilesOf(kept.map(fileDtoOf), { review: !reviews.error && reviews.data.length > 0 });
}

/** A page of what was made, newest first, each with its posts: All. One past the page, so its last says it is the last. */
async function madePage(db: Db, tenantId: TenantId, request: ContentAsked, shelf: "made" | "made_aside" = "made") {
  const limit = Math.min(request.limit ?? CONTENT_PAGE, CONTENT_MAX);
  const rows = await listFilesOnShelf(db, tenantId, shelfFilterOf(shelf), {
    limit: limit + 1,
    before: cursorAsked(request.before),
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    made: await piecesOf(db, tenantId, page),
    next: rows.length > limit && last ? fileCursorOf(last) : null,
  };
}

/**
 * What was made, found by its words (00612 files_found: a piece's name, what Ask's look saw in it, what a video says), newest
 * first, as the Library is found: one page, as many as a page holds at most.
 */
async function madeFound(db: Db, tenantId: TenantId, about: string) {
  const { rows } = await listFilesFound(db, tenantId, shelfFilterOf("made"), {
    words: about,
    offset: 0,
    limit: CONTENT_MAX,
  });
  return { made: await piecesOf(db, tenantId, rows), next: null };
}

/**
 * Pieces as Made draws them: each file with its posts at every place a press sent it, and apart from them the one its owner
 * said they put up by hand (00620), which is no place of ours.
 */
async function piecesOf(db: Db, tenantId: TenantId, page: readonly Parameters<typeof fileDtoOf>[0][]) {
  const rowsOf = new Map<string, MemberFilePostRow[]>();
  for (const post of await listPostsOfFiles(
    db,
    tenantId,
    page.map((f) => f.id),
  )) {
    const held = rowsOf.get(post.file_id) ?? [];
    held.push(post);
    rowsOf.set(post.file_id, held);
  }
  return page.map((f) => {
    const rows = rowsOf.get(f.id) ?? [];
    return { file: fileDtoOf(f), posts: sentPostsOf(rows), by_hand: handPostOf(rows) };
  });
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
 * Today's Content card (contracts content/note.ts ContentTodayDto), from what the note's read holds: the newest few of the
 * week's pieces with their posts; what is being made, but a video whose file has arrived, which is the week's piece (as GET
 * content draws it once); how many of the week's have no post yet, counted across the page read and not said where the week
 * runs past it; and the newest post that did not go out whose piece is still there, with it.
 */
async function contentTodayOf(
  db: Db,
  tenantId: TenantId,
  held: {
    page: Awaited<ReturnType<typeof madePage>>;
    standing: readonly PieceStandingRow[];
    stopped: readonly MemberFilePostRow[];
    now: number;
  },
): Promise<ContentTodayDto> {
  const { made, next } = held.page;
  const week = made.filter((m) => Date.parse(m.file.created_at) >= held.now - WEEK_MS);
  // The page ends past the week, or there is nothing past it: every piece of the week was read, and the count is whole.
  const whole = next === null || week.length < made.length;
  const arrived = new Set(week.map((m) => m.file.id));
  const stoppedLines = await postLinesOf(db, tenantId, held.stopped);
  return {
    week: week.slice(0, CONTENT_TODAY_PIECES),
    making: held.standing
      .filter((p) => p.status !== "failed" && !(p.file_id && arrived.has(p.file_id)))
      .map(makingDtoOf),
    // Ready to post: a video is to be saved, and is not counted (contracts contentPieceMarkOf).
    ready: whole ? week.filter((m) => contentPieceMarkOf(m, held.now).is === "ready").length : null,
    stopped: stoppedLines[0] ?? null,
  };
}

/**
 * GET content/note: Today's Content card (contracts content/note.ts; the content canvas, PhDoors "today"). Its own small read,
 * since the page's is too much to ask each time Today opens: a page of the week's pieces, what is being made and the posts
 * still stopped, read at once, no counts of what is up.
 */
export const contentNote: Reader<undefined, { today: ContentTodayDto }> = {
  name: "content_note",
  async read(rc) {
    const db = rc.ctx.supabase;
    const now = rc.now.getTime();
    const [standing, stopped, page] = await Promise.all([
      listPiecesStanding(db, rc.tenantId, {
        failedSince: new Date(now - CONTENT_FAILED_DAYS * DAY_MS).toISOString(),
        limit: CONTENT_MAKING_MAX,
      }),
      postsStillStopped(db, rc.tenantId),
      madePage(db, rc.tenantId, { limit: CONTENT_PAGE }),
    ]);
    const today = await contentTodayOf(db, rc.tenantId, { page, standing, stopped, now });
    return { data: { today }, rows: [], stamp: readerStamp() };
  },
};

/**
 * GET content, as the route answers it (Campaigns › Content), for one view of Made: All, a page of what was made here,
 * newest first, each with its posts at every place, and what is being made on its first page; Being made, the videos being
 * made and those not made this week; Needs you, the posts that stopped and the videos not made; Scheduled, the posts that
 * wait for their time, soonest first; Posted, the posts that are up, newest first. Every view says the tally of all five.
 */
export const content: Reader<ContentAsked, ContentPageDto> = {
  name: "content",
  async read(rc, request) {
    const view = request.view ?? "all";
    const db = rc.ctx.supabase;
    // The turn's clock, as every reader that says "now" reads it.
    const now = rc.now.getTime();
    const failedSince = new Date(now - CONTENT_FAILED_DAYS * DAY_MS).toISOString();
    // A post set for later than soon waits for its time: the line the page draws (contracts postWaitsForItsTime).
    const timedAfter = new Date(now + POST_SOON_MS).toISOString();
    const [standing, stopped] = await Promise.all([
      listPiecesStanding(db, rc.tenantId, { failedSince, limit: CONTENT_MAKING_MAX }),
      postsStillStopped(db, rc.tenantId),
    ]);
    const about = view === "all" ? (request.about?.trim() ?? "") : "";
    const failedVideos = standing.filter((p) => p.status === "failed").length;
    const one = stopped.length === 1 && failedVideos === 0 ? (stopped[0]?.file_id ?? null) : null;
    const empty = { making: [], made: [], lines: [], next: null, ideas: [], about: about || null, needsOne: one };
    const [tally, shown] = await Promise.all([
      tallyOf(db, rc.tenantId, standing, stopped, timedAfter),
      view === "all" && about
        ? madeFound(db, rc.tenantId, about).then((page) => ({ ...empty, ...page }))
        : view === "aside"
          ? madePage(db, rc.tenantId, request, "made_aside").then((page) => ({ ...empty, ...page }))
          : view === "all"
            ? Promise.all([
                madePage(db, rc.tenantId, request),
                request.before ? Promise.resolve([]) : ideaFilesOf(db, rc.tenantId),
              ]).then(([page, ideas]) => {
                // A video whose file has arrived is that file's tile: it is drawn once. What is being made heads the first page.
                const onPage = new Set(page.made.map((m) => m.file.id));
                const making = request.before ? [] : standing.filter((p) => !p.file_id || !onPage.has(p.file_id));
                return { ...empty, ...page, making: making.map(makingDtoOf), ideas };
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
