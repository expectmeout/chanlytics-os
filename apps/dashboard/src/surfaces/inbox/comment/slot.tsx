/**
 * Where a comment's page stands in the Inbox (pages/inbox-page.tsx), in place of a conversation: nothing for an address
 * that names none. The page itself (pane.tsx) is a chunk of its own, fetched the first time an address names a comment,
 * so the Inbox every member opens pays nothing for it.
 */
import { Suspense, lazy } from "react";
import { COMMENTS_ROUTE, COMMENT_WORDS as W } from "@chanlytics/contracts";
import { EmptyState } from "../../kit/empty/empty";
import { appNavigate, type Flash } from "../shell";

const CommentPane = lazy(() => import("./pane").then((m) => ({ default: m.CommentPane })));

/** What stands in the pane while a comment's page is fetched: said as its own read says it. */
const commentOpening = <EmptyState kind="page" glyph="inbox" title={W.reading} body="" testid="ix-cm-opening" />;

/** A comment on a post, where a conversation would stand: its own page, with the way back to the comments. */
export function CommentSlot({ comment, flash }: { comment: string | null; flash: (shown: Flash) => void }) {
  if (!comment) return null;
  return (
    <Suspense fallback={commentOpening}>
      <CommentPane key={comment} id={comment} flash={flash} onBack={() => appNavigate(COMMENTS_ROUTE)} />
    </Suspense>
  );
}
