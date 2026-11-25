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
  POST_HELD_WHYS,
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
  CONTENT_TODAY_DOWN,
  CONTENT_TODAY_PIECES,
  contentDownOf,
  contentIdeaFilesOf,
  contentPieceMarkOf,
  placementStandingOf,
  videoIsSavedOnly,
  type ContentDownDto,
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
  countFilesWaiting,
  countPostsOut,
  countPostsTimed,
  findNewestPieceBegun,
  listFilesByIds,
  listFilesFound,
  listFilesOnShelf,
  listPiecesStanding,
  listPostsOfFiles,
  listPostsRemovedThere,
  readVersionsOfFiles,
  findPostWaitingOnVersion,
  listPostsStopped,
  listPostsTimed,
  listPostsUnseen,
  listPostsUp,
  listTakeDownsOpen,
  type MemberFilePostRow,
  type MemberPostRow,
  type PieceStandingRow,
} from "@chanlytics/db/files";
import { readerStamp, type Reader, type ReaderContext } from "../shared/reader";
import { cursorAsked, fileDtoOf } from "./files";
import { readWeekToday } from "./week-today";
import { readContentSources } from "../files/found";
import { readInstagramPostable } from "../connections/meta";
import { logAndGoOn } from "@chanlytics/log";

/** A member's post with what a second read said of it: whether its place removed it itself (withRemovedThere). */
export type MemberPostRead = MemberPostRow & { removed_there?: boolean };

/**
 * These posts, each marked where its place removed it itself (the content status review of 24 Nov 2026, A12): it came
 * down, and no take-down from here asked it down. A second read only where one of them came down, which is rare; a
 * failed one marks none, and the post says "Taken down" as it did before, since a page is not lost to a word.
 */
export async function withRemovedThere<Row extends Pick<MemberPostRow, "id" | "place" | "status">>(
  db: Db,
  tenantId: TenantId,
  rows: readonly Row[],
): Promise<(Row & { removed_there?: boolean })[]> {
  const down = rows.filter((row) => row.status === "taken_down");
  if (down.length === 0) return [...rows];
  const none: string[] = [];
  const there = new Set(
    await listPostsRemovedThere(db, tenantId, down).catch(logAndGoOn("posts removed at their place", none)),
  );
  return rows.map((row) => (there.has(row.id) ? { ...row, removed_there: true } : row));
}

/** A post as a page reads it: a platform's refusal in the owner's words, never its code, and never its id there. */
export function postDtoOf(row: MemberPostRead): PostDto {
  const words = recordOrEmpty(row.error).words;
  return {
    id: row.id,
    // A value a newer write holds that this build does not know is read as the nearest it does.
    place: isOneOf(POST_PLACES, row.place) ? row.place : "instagram",
    kind: isOneOf(POST_KINDS, row.kind) ? row.kind : "picture",
    caption: row.caption,
    status: isOneOf(POST_STATUSES, row.status) ? row.status : "checking",
    held_reason: row.held_reason,
    held_why: isOneOf(POST_HELD_WHYS, row.held_why) ? row.held_why : null,
    permalink: row.permalink,
    scheduled_for: row.scheduled_for,
    published_at: row.published_at,
    verified_at: row.verified_at,
    good_until: row.good_until,
    error: typeof words === "string" ? words : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(row.removed_there ? { removed_there: true } : {}),
  };
}

/** Whether a post's row is one its owner put up themselves (00620): kept at the place `hand`, and never a PostDto. */
const isByHand = (row: Pick<MemberPostRow, "place">): boolean => row.place === "hand";

/** A file's posts that a press sent, as a page reads them: one by hand is read apart (handPostOf). */
export const sentPostsOf = (rows: readonly MemberPostRead[]): PostDto[] =>
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
 * The videos being made, and those that could not be and still wait on the owner: one that failed stops waiting once a
 * newer video was begun, as a post that stopped does once it was sent again (postsStillStopped). It stood under Needs you
 * for a week whatever was made since, a count no press answered (Ruben, 12 Nov 2026: nobody ends up stuck).
 */
async function piecesStillStanding(db: Db, tenantId: TenantId, failedSince: string): Promise<PieceStandingRow[]> {
  const standing = await listPiecesStanding(db, tenantId, { failedSince, limit: CONTENT_MAKING_MAX });
  // The newest begun is asked for only where a video that failed stands: on most reads none does, and the page and
  // Today's note read this every time.
  if (!standing.some((p) => p.status === "failed")) return standing;
  const newest = await findNewestPieceBegun(db, tenantId);
  return standing.filter((p) => p.status !== "failed" || !newest || p.created_at > newest);
}

/** A post's placement, as a key: its piece, its place and its kind (an Instagram post and an Instagram story are two). */
const placementKeyOf = (post: Pick<MemberFilePostRow, "file_id" | "place" | "kind">): string =>
  `${post.file_id}|${post.place}|${post.kind}`;

/**
 * The stopped posts still the newest of their placement, a piece's place and kind: a post refused and sent again since is
 * no longer the owner's to mend. The unit is the one a piece's tile and its open piece read (contracts
 * placements/standing.ts), so what Needs you counts is what a tile says "Didn't post" of. The newest of each placement is
 * read from all those files' posts, newest first.
 */
async function postsStillStopped(db: Db, tenantId: TenantId): Promise<MemberFilePostRow[]> {
  return stillSpeaking(db, tenantId, await listPostsStopped(db, tenantId, CONTENT_STOPPED_MAX));
}

/** How far back Needs you looks for a post nobody could confirm: an older one still says so on its own piece. */
const UNSEEN_DAYS = 30;

/**
 * What Needs you lists of posts, newest first: those that stopped, and those a place took and never confirmed, whose
 * owner is asked whether each is there (the content status review of 24 Nov 2026, D5). Which of the unseen ones are
 * past the time the read that looks for them takes is the one standing's to say (contracts placementStandingOf): a
 * post still going up needs nobody.
 */
async function postsNeedingYou(db: Db, tenantId: TenantId, now: number): Promise<MemberFilePostRow[]> {
  const [stopped, unseen] = await Promise.all([
    listPostsStopped(db, tenantId, CONTENT_STOPPED_MAX),
    listPostsUnseen(db, tenantId, {
      since: new Date(now - UNSEEN_DAYS * DAY_MS).toISOString(),
      limit: CONTENT_STOPPED_MAX,
    }),
  ]);
  const unconfirmed = unseen.filter((row) => placementStandingOf(postDtoOf(row), null, now).is === "unconfirmed");
  const newestFirst = [...stopped, ...unconfirmed].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return stillSpeaking(db, tenantId, newestFirst);
}

/** Of these posts, the ones still the newest at their file and placement, of pieces still there and in use. */
async function stillSpeaking(
  db: Db,
  tenantId: TenantId,
  stopped: readonly MemberFilePostRow[],
): Promise<MemberFilePostRow[]> {
  if (stopped.length === 0) return [];
  const newest = new Map<string, string>();
  for (const post of await listPostsOfFiles(db, tenantId, [...new Set(stopped.map((p) => p.file_id))])) {
    const at = placementKeyOf(post);
    if (!newest.has(at)) newest.set(at, post.id);
  }
  const newestStopped = stopped.filter((p) => newest.get(placementKeyOf(p)) === p.id);
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

/** How many open take-downs Today's read looks through for the few it names: more than it names, since some only wait. */
const TAKE_DOWNS_READ = 10;

/**
 * The take-downs Today names (contracts ContentDownDto): the posts still up that a place left to the owner, or has not
 * answered about in a day, newest first, each with its piece where that is still there and in use. One a piece: its
 * own lines say each place. A read that fails says nothing, as the rest of the note does not wait on it.
 */
async function takeDownsOpen(db: Db, tenantId: TenantId, now: number): Promise<ContentDownDto[]> {
  const open = await listTakeDownsOpen(db, tenantId, TAKE_DOWNS_READ);
  const named = open.flatMap((row) => {
    const is = contentDownOf(row, now);
    return is && isOneOf(POST_PLACES, row.place) ? [{ is, place: row.place, fileId: row.file_id }] : [];
  });
  // The owner's to finish before one that only waits; a piece is named once.
  const first = [...named.filter((d) => d.is === "by_hand"), ...named.filter((d) => d.is === "unconfirmed")]
    .filter((d, at, all) => all.findIndex((other) => other.fileId === d.fileId) === at)
    .slice(0, CONTENT_TODAY_DOWN);
  if (first.length === 0) return [];
  const files = new Map(
    (
      await listFilesByIds(
        db,
        tenantId,
        first.map((d) => d.fileId),
      )
    )
      .filter((f) => f.status === "filed")
      .map((f) => [f.id, fileDtoOf(f)]),
  );
  return first.flatMap((d) => {
    const file = files.get(d.fileId);
    return file ? [{ is: d.is, place: d.place, file }] : [];
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
  const [made, posted, scheduled, library, aside, waiting] = await Promise.all([
    countFilesMade(db, tenantId),
    countPostsOut(db, tenantId),
    countPostsTimed(db, tenantId, timedAfter),
    countFilesKept(db, tenantId),
    countFilesMade(db, tenantId, "set_aside"),
    countFilesWaiting(db, tenantId),
  ]);
  const failed = standing.filter((p) => p.status === "failed").length;
  return {
    made,
    posted,
    scheduled,
    library,
    aside,
    waiting,
    needs: stopped.length + failed,
    making: standing.length - failed,
  };
}

/** How many of the newest kept files the ideas choose from: enough for two photos of the work and four clips among them. */
const IDEAS_FROM = 24;

/**
 * The files each idea would be made from (contracts contentIdeaFilesOf), from the newest kept files: read with All's first
 * page alone, where the first day and Make show them.
 */
async function ideaFilesOf(db: Db, tenantId: TenantId) {
  const kept = await listFilesOnShelf(db, tenantId, { status: "filed", made: false }, { limit: IDEAS_FROM });
  return contentIdeaFilesOf(kept.map(fileDtoOf));
}

/**
 * A page of what was made, newest first, each with its posts: All, or All found by its words (`about`, 00612 files_found: a
 * piece's name, what Ask's look saw in it, what a video says), or what was set aside. Every one reads on the same way, from the
 * last piece the page before showed, by its time and its id (00668), so a search finds every match, a page at a time, and a
 * piece made meanwhile is neither read twice nor skipped. One past the page, so its last says it is the last.
 */
async function madePage(
  db: Db,
  tenantId: TenantId,
  request: Pick<ContentAsked, "limit" | "before" | "about">,
  shelf: "made" | "made_aside" = "made",
) {
  const limit = Math.min(request.limit ?? CONTENT_PAGE, CONTENT_MAX);
  const page = { limit: limit + 1, before: cursorAsked(request.before) };
  const words = request.about?.trim();
  const rows = words
    ? (await listFilesFound(db, tenantId, shelfFilterOf(shelf), { words, offset: 0, ...page })).rows
    : await listFilesOnShelf(db, tenantId, shelfFilterOf(shelf), page);
  const shown = rows.slice(0, limit);
  const last = shown.at(-1);
  return {
    made: await piecesOf(db, tenantId, shown),
    next: rows.length > limit && last ? fileCursorOf(last) : null,
  };
}

/**
 * Pieces as Made draws them: each file with its posts at every place a press sent it, and apart from them the one its owner
 * said they put up by hand (00620), which is no place of ours.
 */
async function piecesOf(db: Db, tenantId: TenantId, all: readonly Parameters<typeof fileDtoOf>[0][]) {
  // One tile a piece (00708; the version board's cell 6): a version a piece moved past, or one still being drawn, is no
  // tile of its own, and a piece whose next version is being drawn says so on its own tile.
  const versions = await readVersionsOfFiles(
    db,
    tenantId,
    all.filter((f) => f.kind === "video").map((f) => f.id),
  );
  const page = all.filter((f) => !versions.behind.has(f.id));
  const posts = await listPostsOfFiles(
    db,
    tenantId,
    page.map((f) => f.id),
  );
  const rowsOf = new Map<string, (MemberFilePostRow & { removed_there?: boolean })[]>();
  for (const post of await withRemovedThere(db, tenantId, posts)) {
    const held = rowsOf.get(post.file_id) ?? [];
    held.push(post);
    rowsOf.set(post.file_id, held);
  }
  return page.map((f) => {
    const rows = rowsOf.get(f.id) ?? [];
    const drawing = versions.drawing.get(f.id);
    return {
      file: fileDtoOf(f),
      posts: sentPostsOf(rows),
      by_hand: handPostOf(rows),
      ...(drawing === undefined ? {} : { version_drawing: drawing }),
    };
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
 * Whether Instagram takes a reel from this workspace now, asked only where the answer changes what a piece says: one of
 * `pieces` is a video that never went out and was not posted by hand (contracts videoIsSavedOnly decides Ready to post or
 * Ready to save by it). Most pages hold none, and read nothing. A read that fails says no: the tile says Ready to save,
 * as it did before reels went up from here.
 */
async function reelsWhereAsked(
  tenantId: TenantId,
  pieces: readonly { file: { kind: string }; posts: readonly PostDto[]; by_hand?: HandPostDto | null }[],
): Promise<boolean | undefined> {
  if (!pieces.some((piece) => !piece.by_hand && videoIsSavedOnly(piece.file, piece.posts, false))) return undefined;
  const can = await readInstagramPostable(tenantId).catch(logAndGoOn("content: whether Instagram takes a reel", null));
  return can === "yes";
}

/**
 * Today's Content card (contracts content/note.ts ContentTodayDto), from what the note's read holds: the newest few of the
 * week's pieces with their posts; what is being made, but a video whose file has arrived, which is the week's piece (as GET
 * content draws it once); how many of the week's never went out, counted across the page read and not said where the week
 * runs past it; and the newest post that did not go out whose piece is still there, with it.
 */
async function contentTodayOf(
  db: Db,
  tenantId: TenantId,
  held: {
    page: Awaited<ReturnType<typeof madePage>>;
    standing: readonly PieceStandingRow[];
    stopped: readonly MemberFilePostRow[];
    down: ContentDownDto[];
    now: number;
  },
): Promise<ContentTodayDto> {
  const { made, next } = held.page;
  const week = made.filter((m) => Date.parse(m.file.created_at) >= held.now - WEEK_MS);
  // The page ends past the week, or there is nothing past it: every piece of the week was read, and the count is whole.
  const whole = next === null || week.length < made.length;
  const arrived = new Set(week.map((m) => m.file.id));
  const stoppedLines = await postLinesOf(db, tenantId, held.stopped);
  const reels = (await reelsWhereAsked(tenantId, week)) === true;
  return {
    week: week.slice(0, CONTENT_TODAY_PIECES),
    making: held.standing
      .filter((p) => p.status !== "failed" && !p.revises && !(p.file_id && arrived.has(p.file_id)))
      .map(makingDtoOf),
    // Ready to post, as each one's tile says it (contracts contentPieceMarkOf): a piece that never went out. One that ran
    // as a story yesterday is not ready again, and a video with no road from here is to be saved.
    ready: whole ? week.filter((m) => contentPieceMarkOf(m, held.now, reels).is === "ready").length : null,
    stopped: stoppedLines[0] ?? null,
    down: held.down,
  };
}

/** The soonest post set to go that waits for a new version's approval, with its piece's file (the version board, cell 5). */
async function versionWaitingOf(db: Db, tenantId: TenantId): Promise<ContentTodayDto["version"]> {
  const waits = await findPostWaitingOnVersion(db, tenantId);
  if (!waits) return null;
  const [file] = await listFilesByIds(db, tenantId, [waits.fileId]);
  return file ? { file: fileDtoOf(file), n: waits.n, at: waits.at } : null;
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
    const [standing, stopped, page, down, plan, version] = await Promise.all([
      piecesStillStanding(db, rc.tenantId, new Date(now - CONTENT_FAILED_DAYS * DAY_MS).toISOString()),
      postsStillStopped(db, rc.tenantId),
      madePage(db, rc.tenantId, { limit: CONTENT_PAGE }),
      takeDownsOpen(db, rc.tenantId, now).catch(logAndGoOn("content note: open take-downs", [])),
      readWeekToday(rc).catch(logAndGoOn("content note: the week's points", null)),
      versionWaitingOf(db, rc.tenantId).catch(logAndGoOn("content note: a version that waits", null)),
    ]);
    const today = await contentTodayOf(db, rc.tenantId, { page, standing, stopped, down, now });
    return { data: { today: { ...today, plan, version } }, rows: [], stamp: readerStamp() };
  },
};

/**
 * Where Ask looked for photos and videos, and what came of it (the empty state's card): read only while nothing is kept, and
 * only on All's first page (`empty`), so a workspace with a library pays nothing for it. A read that fails says nothing.
 */
const readSourcesWhileEmpty = async (
  db: Db,
  tenantId: TenantId,
  now: number,
  page: { tally: ContentTally; view: string; about: string; before: string | null | undefined },
) =>
  page.tally.library === 0 && page.view === "all" && !page.about && !page.before
    ? readContentSources(db, tenantId, now).catch(logAndGoOn("content: where Ask looked", null))
    : null;

/**
 * What a page of Content says beside its pieces, read together once the page is known: where AI looked while nothing is
 * kept (readSourcesWhileEmpty), and whether Instagram takes a reel where a piece's tile turns on it (reelsWhereAsked,
 * left out of the answer where it was not asked).
 */
async function readBesideThePage(
  db: Db,
  tenantId: TenantId,
  now: number,
  held: { page: Parameters<typeof readSourcesWhileEmpty>[3]; made: Parameters<typeof reelsWhereAsked>[1] },
): Promise<Pick<ContentPageDto, "sources" | "reels">> {
  const [sources, reels] = await Promise.all([
    readSourcesWhileEmpty(db, tenantId, now, held.page),
    reelsWhereAsked(tenantId, held.made),
  ]);
  return reels === undefined ? { sources } : { sources, reels };
}

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
      piecesStillStanding(db, rc.tenantId, failedSince),
      postsNeedingYou(db, rc.tenantId, now),
    ]);
    const about = view === "all" ? (request.about?.trim() ?? "") : "";
    // All alone is found by its words; any other view reads as it is, whatever words were sent with it.
    const paged = { limit: request.limit, before: request.before, about };
    const empty = { making: [], made: [], lines: [], next: null, ideas: [], about: about || null };
    const [tally, shown] = await Promise.all([
      tallyOf(db, rc.tenantId, standing, stopped, timedAfter),
      view === "all" && about
        ? madePage(db, rc.tenantId, paged).then((page) => ({ ...empty, ...page }))
        : view === "aside"
          ? madePage(db, rc.tenantId, paged, "made_aside").then((page) => ({ ...empty, ...page }))
          : view === "all"
            ? Promise.all([
                madePage(db, rc.tenantId, paged),
                request.before ? Promise.resolve([]) : ideaFilesOf(db, rc.tenantId),
                // What needs the owner heads All's first page, each stopped post with its piece (Made's Needs you group;
                // Ruben, 12 Nov 2026: a heading over them, as Messages opens on Need you), rather than a line that led to them.
                request.before || stopped.length === 0 ? Promise.resolve([]) : postLinesOf(db, rc.tenantId, stopped),
              ]).then(([page, ideas, lines]) => {
                // A video whose file has arrived is that file's tile: it is drawn once. What is being made heads the first page.
                const onPage = new Set(page.made.map((m) => m.file.id));
                // A new version is drawn on its piece's own tile, never a tile of its own (00708).
                const making = request.before
                  ? []
                  : standing.filter((p) => !p.revises && (!p.file_id || !onPage.has(p.file_id)));
                return { ...empty, ...page, making: making.map(makingDtoOf), ideas, lines };
              })
            : view === "making"
              ? Promise.resolve({ ...empty, making: standing.filter((p) => !p.revises).map(makingDtoOf) })
              : view === "needs"
                ? postLinesOf(db, rc.tenantId, stopped).then((lines) => ({
                    ...empty,
                    lines,
                    making: standing.filter((p) => p.status === "failed").map(makingDtoOf),
                  }))
                : linesPage(db, rc.tenantId, view, request, timedAfter).then((page) => ({ ...empty, ...page })),
    ]);
    const beside = await readBesideThePage(db, rc.tenantId, now, {
      page: { tally, view, about, before: request.before },
      made: shown.made,
    });
    return { data: { view, ...shown, tally, ...beside }, rows: [], stamp: readerStamp() };
  },
};
