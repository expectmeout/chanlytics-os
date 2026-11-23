/**
 * What crosses the wire for a post's results (00696; the content loop PRD's 9.3, 12.1 and 21): the week's line Today's
 * weekly card says, Reports' content section with its total, and a comment as Inbox shows it with its public answer. Each
 * a DTO the server fills from its readers and a page draws through contracts' words; snake_case, as the wire is.
 */
import type { CommentAnswerState } from "./sets";

/** What a window's posts brought, as the week's line and Reports read it (contracts contentTotalsOf, without the list). */
export interface ContentWeekDto {
  days: number;
  posts_up: number;
  reached: number | null;
  conversations: number;
  direct: number;
  assisted: number;
}

/** Reports' content section: the window's own lines, and the total, each booking counted once. */
export interface ContentReportDto extends ContentWeekDto {
  /** Bookings any post helped or answered, each counted once whatever else touched it. */
  total: number;
  by_status: { booked: number; kept: number; missed: number; cancelled: number };
  people: { new: number; known: number };
  /** Of the total, those an ad touched too: listed with both, counted once. */
  with_an_ad: number;
  /** Each post that went up in the window, newest first, with its own lines (a booking two posts touched is in both). */
  by_post: Array<{
    post_id: string;
    title: string | null;
    kind: string;
    reached: number | null;
    conversations: number;
    direct: number;
    assisted: number;
  }>;
}

/** A comment's public answer, as its row says it. */
export interface CommentAnswerDto {
  state: CommentAnswerState;
  draft: string | null;
  cannot_why: string | null;
  words: string | null;
  said: string | null;
  by_hand: boolean;
  sent_at: string | null;
}

/** A comment as Inbox lists and opens it: who, on which post, their words, and its answer. */
export interface CommentRowDto {
  touch_id: string;
  at: string;
  contact_id: string | null;
  name: string | null;
  username: string | null;
  words: string | null;
  /** The post it is under: its title is its piece's (contracts fileSaidOf), null where the piece's file is gone. */
  post: {
    id: string;
    file_id: string;
    title: string | null;
    kind: string;
    place: string;
    caption: string | null;
    permalink: string | null;
  };
  answer: CommentAnswerDto | null;
}

/** Inbox's comments, newest first. */
export interface CommentsDto {
  comments: CommentRowDto[];
}
