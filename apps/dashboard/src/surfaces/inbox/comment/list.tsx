/**
 * Comments in the Inbox's list (00696; the content loop PRD's 9.2; the journey canvas's Results board, cell 1, approved
 * by Ruben on 23 Nov 2026). `inbox/comments` lists the comments on the business's posts and nothing else: a line that
 * says whose they are and the way back to every conversation, then a row each, the post's picture where a face would
 * stand, who wrote and on which post, what they wrote and where its answer stands. A comment is its own row, never a
 * message on a conversation: Instagram lets a business write privately to someone who only commented once, within a
 * week, and that is AI's rules for messages, not this. Needs you holds one line that opens the list, while any comment
 * has AI's answer ready to send; one AI can't answer, or whose answer didn't go, is Today's point, and in Needs you's rows.
 */
import "./comment.css";
import { COMMENTS_ROUTE, commentAddress, commentStageOf, type CommentRowDto } from "@chanlytics/contracts";
import { knownZone } from "@/bridge/zone";
import { routeDoor } from "../../frame-verbs";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { COMMENT_WORDS as W, commentRowSaid } from "../model/comment-said";
import { commentStillOf } from "./still";
import type { CommentsRead } from "./use-comments";

/** One comment's row: the post's picture, who and on which post, what they wrote and where its answer stands, when. */
function CommentRow({ row, open, nowMs }: { row: CommentRowDto; open: boolean; nowMs: number }) {
  const view = commentRowSaid(row, row.post.title, knownZone() ?? "UTC", nowMs);
  return (
    <a
      className="ix-cm-row"
      data-open={open ? "" : undefined}
      data-quiet={view.quiet ? "" : undefined}
      aria-current={open ? "true" : undefined}
      data-testid="ix-cm-row"
      {...routeDoor(commentAddress(row.touch_id))}
    >
      <img className="ix-cm-still" src={commentStillOf(row.post.file_id)} alt="" loading="lazy" />
      <span className="ix-cm-row-words">
        <b>{view.title}</b>
        <span>{view.sub}</span>
      </span>
      <span className="ix-cm-row-when">{view.when}</span>
    </a>
  );
}

/** `inbox/comments`: the line over the list, and the comments' rows; the one open marked. */
export function CommentsPart({ read, openId }: { read: CommentsRead; openId: string | null }) {
  const back = { label: W.list.back, to: "inbox", testid: "ix-cm-leave-list" };
  if (read.state === "failed")
    return <FailedRead kind="line" what={W.list.failed} why={read.why} testid="ix-cm-failed" />;
  if (read.state === "reading")
    return <EmptyState kind="line" glyph="chat" title={W.list.reading} action={back} testid="ix-cm-list-reading" />;
  const rows = read.data.comments;
  const nowMs = Date.now();
  return (
    <>
      <EmptyState
        kind="line"
        glyph="chat"
        title={rows.length ? W.list.title : W.list.none}
        body={rows.length ? W.list.shown(rows.length) : W.list.noneBody}
        action={back}
        testid="ix-cm-list"
      />
      {rows.length ? (
        <div className="ix-cm-rows" data-testid="ix-cm-rows">
          {rows.map((row) => (
            <CommentRow key={row.touch_id} row={row} open={row.touch_id === openId} nowMs={nowMs} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/** How many comments have AI's answer ready (or none written yet) and wait for the owner's Send. */
const commentsReady = (read: CommentsRead | null): number =>
  read?.state === "ready"
    ? read.data.comments.filter((row) => {
        const stage = commentStageOf(row.answer);
        return stage === "drafted" || stage === "none";
      }).length
    : 0;

/** Needs you's line that opens the comments, while any has AI's answer ready to send; nothing otherwise. */
export function CommentsDoor({ read }: { read: CommentsRead | null }) {
  const ready = commentsReady(read);
  if (!ready) return null;
  return (
    <EmptyState
      kind="line"
      glyph="chat"
      title={W.list.door(ready)}
      body={W.list.doorBody}
      action={{ label: W.list.doorGo, to: COMMENTS_ROUTE, testid: "ix-cm-door-go" }}
      testid="ix-cm-door"
    />
  );
}
