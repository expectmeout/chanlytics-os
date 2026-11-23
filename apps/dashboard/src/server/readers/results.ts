import "server-only";

/**
 * What a business's posts said back, as its screens and AI read it (00699; the content loop PRD's 9 and 12.1): a
 * piece's numbers and what it brought, the week's line, Reports' content section, and the comments Inbox lists. Each is
 * read on the member's own session, under the tables' row rules, and worked out when read: nothing is kept, and the
 * credit is the one rule's (contracts creditOf). AI's report read asks these same readers, so the number AI says is the
 * number the page shows.
 */
import {
  AppError,
  asContactId,
  CREDIT_WINDOW_DAYS,
  DAY_MS,
  contentTotalsOf,
  contentWeekOf,
  creditFor,
  creditOf,
  fileSaidOf,
  isOneOf,
  personName,
  shiftKey,
  zoneDayKey,
  zoneMidnight,
  type BroughtPersonDto,
  type CommentRowDto,
  type CommentsDto,
  type ContentReportDto,
  type ContentTotals,
  type ContentWeekDto,
  type PieceResultsDto,
  type PostNumbersDto,
  type RecordedTouch,
  type TenantId,
} from "@chanlytics/contracts";
import {
  findComment,
  listComments,
  listPostTouches,
  listTouchesIn,
  listTouchesOf,
  listVisitsMadeIn,
  listVisitsOf,
  readCommentPosts,
  readPostLinks,
  readPostNumbers,
  type CommentRead,
  type PostNumber,
  type VisitForCredit,
} from "@chanlytics/db/content";
import { listFilePosts, listPostsInSpan } from "@chanlytics/db/files";
import { listNamesOfPeople } from "@chanlytics/db/people";
import type { ReportWindow } from "@chanlytics/db/reports";
import { load, readerStamp, type Reader, type ReaderContext } from "../shared/reader";
import * as facts from "./facts";
import type { RouteContext } from "../shared/with-route";

type Db = RouteContext["supabase"];

/** A post as results read it: what it is, where, and whether it went up. */
interface PostShape {
  id: string;
  place: string;
  kind: string;
  status: string;
  published_at: string | null;
}

const POST_PLACES_COUNTED = ["instagram", "google"] as const;

/** The most posts a window counts: a month of a busy business's. */
const POSTS_IN_WINDOW = 500;
const POST_KINDS_COUNTED = ["picture", "story", "reel"] as const;

/** Each placement that went up, with its newest numbers (none before its first read). */
function postsNumbersOf(posts: readonly PostShape[], numbers: readonly PostNumber[]): PostNumbersDto[] {
  return posts.flatMap((post): PostNumbersDto[] => {
    if (!post.published_at || !isOneOf(POST_PLACES_COUNTED, post.place) || !isOneOf(POST_KINDS_COUNTED, post.kind))
      return [];
    const mine = numbers.filter((number) => number.postId === post.id);
    const newest = mine.reduce<PostNumber | null>((a, b) => (!a || b.observedAt > a.observedAt ? b : a), null);
    return [
      {
        post_id: post.id,
        place: post.place,
        kind: post.kind,
        step: newest?.step ?? null,
        read_at: newest?.observedAt ?? null,
        numbers: mine.map((number) => ({
          metric: number.metric,
          value: number.value,
          availability: number.availability,
        })),
      },
    ];
  });
}

/** One person's row: their newest touch of these posts, and their best visit's class for any of them. */
function broughtPersonOf(
  contactId: string,
  of: { mine: RecordedTouch[]; all: RecordedTouch[]; visits: VisitForCredit[]; posts: Set<string>; name: string },
): BroughtPersonDto {
  const newest = of.mine[0];
  let best: { klass: BroughtPersonDto["class"]; visit: VisitForCredit } | null = null;
  for (const visit of of.visits) {
    const credit = creditOf(visit, of.all);
    const klass = [...of.posts].map((id) => creditFor({ type: "post", id }, credit)).find((c) => c !== "none");
    if (klass && (!best || (klass === "direct" && best.klass !== "direct"))) best = { klass, visit };
  }
  return {
    contact_id: contactId,
    name: of.name,
    new_person: of.mine.some((touch) => touch.new_person),
    touch: newest?.kind ?? "reply",
    touched_at: newest?.at ?? "",
    words: newest?.said?.words ?? null,
    class: best?.klass ?? "none",
    visit: best ? { starts_at: best.visit.starts_at, status: best.visit.status } : null,
  };
}

/** What a piece's posts brought: its numbers, its people, its link. */
async function readPieceResults(db: Db, tenantId: TenantId, fileId: string): Promise<PieceResultsDto> {
  const posts = (await listFilePosts(db, tenantId, fileId)).filter((post) => post.published_at);
  const ids = posts.map((post) => post.id);
  const [numbers, touches, links] = await Promise.all([
    readPostNumbers(db, tenantId, ids),
    listPostTouches(db, tenantId, ids),
    readPostLinks(db, tenantId, ids),
  ]);
  const people = [...new Set(touches.flatMap((touch) => (touch.contact_id ? [asContactId(touch.contact_id)] : [])))];
  const since = new Date(Math.min(...posts.map((post) => Date.parse(post.published_at ?? "")), Date.now()) - DAY_MS);
  const [all, visits, names] = await Promise.all([
    listTouchesOf(db, tenantId, { contactIds: people, since: since.toISOString() }),
    listVisitsOf(db, tenantId, { contactIds: people, since: since.toISOString() }),
    listNamesOfPeople(db, tenantId, people),
  ]);
  const nameOf = new Map(names.map((row) => [row.id, personName(row)]));
  const postSet = new Set(ids);
  const rows = people.map((contactId) =>
    broughtPersonOf(contactId, {
      mine: touches.filter((touch) => touch.contact_id === contactId),
      all: all.filter((touch) => touch.contact_id === contactId),
      visits: visits.filter((visit) => visit.contact_id === contactId),
      posts: postSet,
      name: nameOf.get(contactId) ?? "",
    }),
  );
  const link = [...links.values()][0] ?? null;
  return {
    posts: postsNumbersOf(posts, numbers),
    conversations: rows.length,
    direct: rows.filter((row) => row.class === "direct").length,
    assisted: rows.filter((row) => row.class === "assisted").length,
    people: rows,
    link: link ? { code: link.code, lands: link.lands, opens: link.opens } : null,
    window_days: CREDIT_WINDOW_DAYS,
  };
}

/** The instants a window covers: from its first midnight in the workspace's zone to the midnight after its last day, or now. */
interface Span {
  since: string;
  until: string;
}

/** What a window's posts brought, counted once, with the posts it counted: the week's line and Reports' read this. */
async function readContentTotals(
  db: Db,
  tenantId: TenantId,
  window: Span,
): Promise<{ totals: ContentTotals; posts: PostShape[] }> {
  const since = new Date(window.since);
  const posts = (
    await listPostsInSpan(db, tenantId, { fromIso: window.since, toIso: window.until, limit: POSTS_IN_WINDOW })
  ).filter((post) => post.published_at && post.published_at >= window.since && post.place !== "hand");
  const [numbers, touches, visits] = await Promise.all([
    readPostNumbers(
      db,
      tenantId,
      posts.map((post) => post.id),
    ),
    listTouchesIn(db, tenantId, {
      since: new Date(since.getTime() - CREDIT_WINDOW_DAYS * DAY_MS).toISOString(),
      until: window.until,
    }),
    listVisitsMadeIn(db, tenantId, window),
  ]);
  const reachOf = (postId: string) =>
    numbers.find((number) => number.postId === postId && number.metric === "reach" && number.value !== null)?.value ??
    null;
  const totals = contentTotalsOf({
    posts: posts.map((post) => ({ post_id: post.id, reach: reachOf(post.id) })),
    touches,
    visits,
  });
  return { totals, posts };
}

/**
 * A report window as instants: its first day's midnight in the workspace's zone, and the midnight after its last day, or
 * now for a window that ends today (Reports' own reading of days, readers/report.ts reportWindowFor).
 */
async function spanOfWindow(rc: ReaderContext, window: ReportWindow): Promise<Span> {
  const zone = (await load(rc, facts.facts, undefined)).data.timezone;
  const last = window.end ?? zoneDayKey(rc.now.getTime(), zone);
  const since = zoneMidnight(zone, shiftKey(last, -(window.days - 1)));
  const until = window.end ? zoneMidnight(zone, shiftKey(window.end, 1)) : rc.now.getTime();
  return { since: new Date(since).toISOString(), until: new Date(until).toISOString() };
}

/** How far back Inbox lists comments: a month. */
const COMMENT_DAYS = 30;
/** The days the week's line counts. */
const WEEK_LINE_DAYS = 7;

/** A piece's How it did and What it brought. */
export const pieceResults: Reader<{ file: string }, PieceResultsDto> = {
  name: "piece_results",
  async read(rc, args) {
    const data = await readPieceResults(rc.ctx.supabase, rc.tenantId, args.file);
    return { data, rows: [], stamp: readerStamp() };
  },
};

/** The last seven days' line: posts up, reached, conversations, from a post and it helped. */
export const contentWeek: Reader<undefined, ContentWeekDto> = {
  name: "content_week",
  async read(rc) {
    const until = rc.now;
    const span = {
      since: new Date(until.getTime() - WEEK_LINE_DAYS * DAY_MS).toISOString(),
      until: until.toISOString(),
    };
    const { totals } = await readContentTotals(rc.ctx.supabase, rc.tenantId, span);
    const data = contentWeekOf(totals, WEEK_LINE_DAYS);
    return { data, rows: [], stamp: readerStamp() };
  },
};

/** Reports' content section over Reports' own window, the total counted once, and each post's own lines. */
export const contentReport: Reader<ReportWindow, ContentReportDto> = {
  name: "content_report",
  async read(rc, window) {
    const { totals, posts } = await readContentTotals(rc.ctx.supabase, rc.tenantId, await spanOfWindow(rc, window));
    const named = await readCommentPosts(
      rc.ctx.supabase,
      rc.tenantId,
      posts.map((post) => post.id),
    );
    const titleOf = new Map(named.map((post) => [post.id, post.fileName ? fileSaidOf(post.fileName) : null]));
    const kindOf = new Map(posts.map((post) => [post.id, post.kind]));
    const data: ContentReportDto = {
      ...contentWeekOf(totals, window.days),
      total: totals.bookings.length,
      by_status: totals.byStatus,
      people: totals.people,
      with_an_ad: totals.bookings.filter((booking) => booking.touched.some((t) => t.type === "ad")).length,
      by_post: [...totals.byPost].reverse().map((post) => ({
        ...post,
        title: titleOf.get(post.post_id) ?? null,
        kind: kindOf.get(post.post_id) ?? "post",
      })),
    };
    return { data, rows: [], stamp: readerStamp() };
  },
};

function commentRowOf(comment: CommentRead, post: CommentRowDto["post"]): CommentRowDto {
  return {
    touch_id: comment.touchId,
    at: comment.at,
    contact_id: comment.contactId,
    name: comment.name,
    username: comment.username,
    words: comment.words,
    post,
    answer: comment.answer
      ? {
          state: comment.answer.state,
          draft: comment.answer.draft,
          cannot_why: comment.answer.cannotWhy,
          words: comment.answer.words,
          said: comment.answer.said,
          by_hand: comment.answer.byHand,
          sent_at: comment.answer.sentAt,
        }
      : null,
  };
}

/** Comments with the posts they are under; a comment whose post is gone is not listed. */
async function withTheirPosts(rc: ReaderContext, comments: readonly CommentRead[]): Promise<CommentRowDto[]> {
  const posts = await readCommentPosts(
    rc.ctx.supabase,
    rc.tenantId,
    comments.map((comment) => comment.postId),
  );
  const byId = new Map(posts.map((post) => [post.id, post]));
  return comments.flatMap((comment) => {
    const post = byId.get(comment.postId);
    if (!post) return [];
    return [
      commentRowOf(comment, {
        id: post.id,
        file_id: post.fileId,
        title: post.fileName ? fileSaidOf(post.fileName) : null,
        kind: post.kind,
        place: post.place,
        caption: post.caption,
        permalink: post.permalink,
      }),
    ];
  });
}

/** The comments on the business's posts, newest first, a month back. */
export const commentsList: Reader<undefined, CommentsDto> = {
  name: "comments_list",
  async read(rc) {
    const since = new Date(Date.now() - COMMENT_DAYS * DAY_MS).toISOString();
    const comments = await withTheirPosts(rc, await listComments(rc.ctx.supabase, rc.tenantId, since));
    return { data: { comments }, rows: [], stamp: readerStamp() };
  },
};

/** How far back a comment is a point on Today: a week. An older one is still in Inbox's comments. */
const WAITING_DAYS = 7;

/**
 * The comments that wait on the owner's word, for Today (contracts today/comment-rows.ts): AI could not answer it safely,
 * or its answer did not go or was never told, in the last week. A comment with AI's draft ready waits in Inbox's comments.
 */
export const commentsWaiting: Reader<undefined, CommentsDto> = {
  name: "comments_waiting",
  async read(rc) {
    const since = new Date(Date.now() - WAITING_DAYS * DAY_MS).toISOString();
    const comments = (await withTheirPosts(rc, await listComments(rc.ctx.supabase, rc.tenantId, since))).filter((row) =>
      ["cannot", "failed"].includes(row.answer?.state ?? ""),
    );
    return { data: { comments }, rows: [], stamp: readerStamp() };
  },
};

/** One comment, with its post and its answer. */
export const commentOne: Reader<{ id: string }, CommentRowDto> = {
  name: "comment_one",
  async read(rc, args) {
    const comment = await findComment(rc.ctx.supabase, rc.tenantId, args.id);
    const [row] = comment ? await withTheirPosts(rc, [comment]) : [];
    if (!row) throw new AppError("not_found", "That comment is not here any more.", 404);
    return { data: row, rows: [], stamp: readerStamp() };
  },
};
