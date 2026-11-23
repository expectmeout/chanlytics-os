/**
 * The comments on the business's posts as the Inbox lists them (00696; the content loop PRD's 9.2): read where they are
 * drawn (the comments' list, and Needs you's line that opens it), again when a comment's page presses, and again when
 * Needs you moves. A read that failed says so where it is drawn, and lists nothing in its place.
 */
import { useEffect, useState } from "react";
import type { CommentsDto } from "@chanlytics/contracts";
import { readComments } from "@/bridge/verbs/comments";
import { hearNeedsYou } from "../../needs-you";

/** Where the comments' read stands. */
export type CommentsRead =
  { state: "reading" } | { state: "failed"; why: string | null } | { state: "ready"; data: CommentsDto };

/** Who hears that a comment moved: the lists drawn now. */
const listHearers = new Set<() => void>();

/** A comment's page pressed: every list drawn reads again. */
export function commentsMoved(): void {
  for (const hear of [...listHearers]) hear();
}

/** What an answer to the comments' read makes of what the list held: a list, what it held before, or a failure. */
function readAfter(answer: Awaited<ReturnType<typeof readComments>> | null, was: CommentsRead | null): CommentsRead {
  // An answer that holds no list (a server from before, a stand-in) is no list to draw.
  if (answer?.ok && Array.isArray(answer.data.comments)) return { state: "ready", data: answer.data };
  // What was read stays on screen; only a list that holds nothing says it could not read.
  if (was?.state === "ready") return was;
  return { state: "failed", why: answer && !answer.ok ? answer.message || null : null };
}

/** The month's comments, read while `on`; null while off. */
export function useCommentsRead(on: boolean): CommentsRead | null {
  const [read, setRead] = useState<CommentsRead | null>(null);
  useEffect(() => {
    if (!on) {
      setRead(null);
      return undefined;
    }
    let live = true;
    const again = () =>
      void readComments()
        .catch(() => null)
        .then((answer) => {
          if (live) setRead((was) => readAfter(answer, was));
        });
    setRead({ state: "reading" });
    again();
    listHearers.add(again);
    const stop = hearNeedsYou(again);
    return () => {
      live = false;
      listHearers.delete(again);
      stop();
    };
  }, [on]);
  return read;
}
