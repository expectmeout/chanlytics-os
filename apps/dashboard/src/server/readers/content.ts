import "server-only";
import {
  CONTENT_FAILED_DAYS,
  CONTENT_MAKING_MAX,
  CONTENT_MAX,
  CONTENT_PAGE,
  DAY_MS,
  PIECE_FAILS,
  PIECE_STAGES,
  POST_KINDS,
  POST_PLACES,
  POST_STATUSES,
  fileCursorOf,
  isOneOf,
  piecePlanOf,
  recordOrEmpty,
  shelfFilterOf,
  type ContentMakingDto,
  type ContentPageDto,
  type PostDto,
} from "@chanlytics/contracts";
import {
  countFilesMade,
  countPostsOut,
  listFilesOnShelf,
  listPiecesStanding,
  listPostsOfFiles,
  type MemberPostRow,
  type PieceStandingRow,
} from "@chanlytics/db/files";
import { readerStamp, type Reader } from "../shared/reader";
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

/** A video asked for that is no file yet, as the page reads it: where it stands and the words it opens on. */
function makingDtoOf(row: PieceStandingRow): ContentMakingDto {
  const plan = piecePlanOf(recordOrEmpty(row.plan));
  const failed = row.status === "failed";
  const reason = isOneOf(PIECE_FAILS, row.failed_why) ? row.failed_why : "unknown";
  return {
    id: row.id,
    status: failed ? "failed" : "making",
    stage: isOneOf(PIECE_STAGES, row.stage) ? row.stage : "queued",
    failed_why: failed ? reason : null,
    lines: plan.lines,
    language: plan.language,
    moments: plan.cuts.length,
    created_at: row.created_at,
  };
}

/** What a page of Content is asked for. Nothing asked is its first page. */
interface ContentAsked {
  limit?: number | undefined;
  before?: string | undefined;
}

/**
 * GET content, as the route answers it (Campaigns › Content): what is being made, a page of what was made here, newest
 * first, each with its posts at every place, and how the whole stands. Five reads, each a page or a count: the made
 * files' page, the videos that are no file yet, two counts, and that page's posts. A later page asks for nothing of what
 * is being made: that is the page's head, read with its first.
 */
export const content: Reader<ContentAsked, ContentPageDto> = {
  name: "content",
  async read(rc, request) {
    const before = cursorAsked(request.before);
    const limit = Math.min(request.limit ?? CONTENT_PAGE, CONTENT_MAX);
    const db = rc.ctx.supabase;
    const failedSince = new Date(Date.now() - CONTENT_FAILED_DAYS * DAY_MS).toISOString();
    const [rows, standing, made, posted] = await Promise.all([
      // One past the page, so its last page says it is its last with no second read.
      listFilesOnShelf(db, rc.tenantId, shelfFilterOf("made"), { limit: limit + 1, before }),
      before ? [] : listPiecesStanding(db, rc.tenantId, { failedSince, limit: CONTENT_MAKING_MAX }),
      countFilesMade(db, rc.tenantId),
      countPostsOut(db, rc.tenantId),
    ]);
    const page = rows.slice(0, limit);
    const onPage = new Set(page.map((f) => f.id));
    const postsOf = new Map<string, PostDto[]>();
    for (const post of await listPostsOfFiles(db, rc.tenantId, [...onPage])) {
      const held = postsOf.get(post.file_id) ?? [];
      held.push(postDtoOf(post));
      postsOf.set(post.file_id, held);
    }
    const last = page.at(-1);
    return {
      data: {
        // A video whose file has arrived is that file's tile: it is drawn once.
        making: standing.filter((p) => !p.file_id || !onPage.has(p.file_id)).map(makingDtoOf),
        made: page.map((f) => ({ file: fileDtoOf(f), posts: postsOf.get(f.id) ?? [] })),
        next: rows.length > limit && last ? fileCursorOf(last) : null,
        tally: { made, posted },
      },
      rows: [],
      stamp: readerStamp(),
    };
  },
};
