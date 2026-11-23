/**
 * Where the comments on the business's posts stand in the Inbox's page (pages/inbox-page.tsx; 00696): `inbox/comments`
 * lists them where the conversations are listed and opens none beside them; `inbox/cm-<id>` opens one where a conversation
 * stands (slot.tsx), the screen on a phone; Needs you holds the line that opens the list while any has AI's answer ready
 * (list.tsx). The page asks these and draws what they answer, so what a comment needs of the page is said here, once.
 */
import type { ReactNode } from "react";
import { EmptyState } from "../../kit/empty/empty";
import { COMMENT_WORDS } from "../model/comment-said";
import type { Flash } from "../shell";
import { CommentsDoor, CommentsPart } from "./list";
import { CommentSlot } from "./slot";
import { useCommentsRead, type CommentsRead } from "./use-comments";

/** Where the page stands with the comments: whether their list is on screen, the one open, and their read. */
export interface CommentsHere {
  listed: boolean;
  open: string | null;
  read: CommentsRead | null;
}

/** The comments' list holds no conversation: none is listed, or opened, beside it. */
const NO_THREAD_IDS: ReadonlySet<string> = new Set();

/** The comments as the page holds them, from the address (`inbox/comments`, `inbox/cm-<id>`), read for the list and its line. */
export function useCommentsHere(addressed: { open: string | null } | null): CommentsHere {
  const read = useCommentsRead(true);
  return { listed: !!addressed, open: addressed?.open ?? null, read };
}

/** The conversations the list holds: none while the comments are listed, else what `only` says (a sequence's replies). */
export const threadsBeside = (here: CommentsHere, only: ReadonlySet<string> | null): ReadonlySet<string> | null =>
  here.listed ? NO_THREAD_IDS : only;

/** The line over the list: the comments' own while they are listed, else `otherwise` (a sequence's replies, or none). */
export function commentsLineOr(here: CommentsHere, otherwise: ReactNode): ReactNode {
  return here.listed ? <CommentsPart read={here.read ?? { state: "reading" }} openId={here.open} /> : otherwise;
}

/** Needs you's line that opens the comments: none while they are listed. */
export function commentsDoorOf(here: CommentsHere): ReactNode {
  return here.listed ? null : <CommentsDoor read={here.read} />;
}

/** The pane's part: the comment open, or, on a desk with none open, how to open one. */
export function CommentsInPane({
  here,
  flash,
  phone,
}: {
  here: CommentsHere;
  flash: (f: Flash) => void;
  phone: boolean;
}) {
  if (here.open) return <CommentSlot comment={here.open} flash={flash} />;
  if (!here.listed || phone) return null;
  return <EmptyState kind="page" glyph="chat" title={COMMENT_WORDS.list.pick} body="" testid="ix-cm-pick" />;
}
