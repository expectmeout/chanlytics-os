/**
 * One comment as the Inbox answers it (00699; the content loop PRD's 12.4): its read, the answer's box, and the owner's
 * presses. The comment is read as its page opens, again after each press, and again every few seconds while its answer
 * is on its way, until Instagram has said (its job posts it once, and settles it within a minute or says it was never
 * told). The box starts from AI's draft or the words last sent, and holds what the owner types while the tab lives, by the
 * comment's id, so opening it again shows them. AI asked to write it again hands back words for the box, never kept.
 *
 * A press that fails says so in the Inbox's toast and changes nothing here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SECOND_MS, commentStageOf, type CommentRowDto } from "@chanlytics/contracts";
import { leaveComment, readComment, rewriteComment, sendCommentAnswer } from "@/bridge/verbs/comments";
import { COMMENT_WORDS as W } from "../model/comment-said";
import type { Flash } from "../shell";
import { commentsMoved } from "./use-comments";

/** Where the comment's read stands. */
export type CommentRead =
  { state: "reading" } | { state: "gone" } | { state: "failed" } | { state: "read"; dto: CommentRowDto };

/** How often an answer on its way is read again, and for how long: its job settles it within a minute. */
const SENDING_READ_MS = 3 * SECOND_MS;
const SENDING_READS_MAX = 40;

/** What the owner typed this visit, by comment: a comment opened again shows the words it had. */
const KEPT_WORDS = new Map<string, string>();

/** The comment's read, kept fresh: again on `again`, and every few seconds while its answer is on its way. */
function useCommentRead(id: string): [CommentRead, () => Promise<void>] {
  const [read, setRead] = useState<CommentRead>({ state: "reading" });
  const live = useRef(true);
  const known = useRef<CommentRowDto | null>(null);
  const again = useCallback(async () => {
    const answer = await readComment(id).catch(() => null);
    if (!live.current) return;
    if (answer?.ok) {
      known.current = answer.data;
      setRead({ state: "read", dto: answer.data });
    } else if (answer && answer.status === 404) setRead({ state: "gone" });
    // What was known stays on screen; only a page that knows nothing says it could not read.
    else if (!known.current) setRead({ state: "failed" });
  }, [id]);
  useEffect(() => {
    live.current = true;
    known.current = null;
    setRead({ state: "reading" });
    void again();
    return () => {
      live.current = false;
    };
  }, [again]);
  const sending = read.state === "read" && read.dto.answer?.state === "sending";
  useEffect(() => {
    if (!sending) return undefined;
    let reads = 0;
    const timer = setInterval(() => {
      reads += 1;
      if (reads > SENDING_READS_MAX) clearInterval(timer);
      else void again();
    }, SENDING_READ_MS);
    return () => clearInterval(timer);
  }, [sending, again]);
  return [read, again];
}

/** AI asked to write the answer again: not asked, being written, or not written (the box keeps its words). */
type RewriteState = "none" | "writing" | "failed";

/** What the comment's page draws from and presses. */
export interface CommentPage {
  read: CommentRead;
  /** The box's words: what the owner typed, else where the answer stands (AI's draft, the words last sent). */
  words: string;
  setWords: (words: string) => void;
  /** AI's reason it can't write this one, where it said so when asked again; null otherwise. */
  rewriteCannot: string | null;
  rewrite: RewriteState;
  busy: "send" | "leave" | "back" | null;
  again: () => Promise<void>;
  send: () => void;
  leave: () => void;
  answerAfterAll: () => void;
  askAgain: (change: string) => Promise<boolean>;
}

/** The words a box starts from, by where the answer stands. */
function boxStartOf(dto: CommentRowDto): string {
  const answer = dto.answer;
  if (!answer) return "";
  return commentStageOf(answer) === "drafted" ? (answer.draft ?? "") : (answer.words ?? "");
}

/** What a press on the comment hands its acts: the comment, the toast, the read again, the way back and the busy mark. */
interface PressIo {
  dto: CommentRowDto;
  flash: (f: Flash) => void;
  again: () => Promise<void>;
  close: () => void;
  setBusy: (act: CommentPage["busy"]) => void;
}

/** A press sent, the comment read again whatever came back; false where it did not go through, said in a toast. */
async function pressComment(io: PressIo, act: "send" | "leave" | "back", go: () => ReturnType<typeof leaveComment>) {
  io.setBusy(act);
  const answer = await go().catch(() => null);
  await io.again();
  io.setBusy(null);
  commentsMoved();
  if (answer?.ok) return true;
  io.flash({ tone: "danger", msg: answer?.message ?? W.failed });
  return false;
}

/** Left unanswered, with its Undo, and the page goes back to the comments. */
async function leaveIt(io: PressIo) {
  const back = () => pressComment(io, "back", () => leaveComment(io.dto.touch_id, "back"));
  if (!(await pressComment(io, "leave", () => leaveComment(io.dto.touch_id, "leave")))) return;
  io.flash({ msg: W.leftToast, undo: () => void back() });
  io.close();
}

/** AI asked to write the answer again: where it stands, why it couldn't where it said so, and the ask itself. */
function useCommentRewrite(id: string, dto: CommentRowDto | null, words: string, setWords: (words: string) => void) {
  const [rewrite, setRewrite] = useState<RewriteState>("none");
  const [rewriteCannot, setRewriteCannot] = useState<string | null>(null);
  useEffect(() => {
    setRewrite("none");
    setRewriteCannot(null);
  }, [id]);
  const askAgain = async (change: string) => {
    if (!dto || !change.trim()) return false;
    setRewrite("writing");
    setRewriteCannot(null);
    const answer = await rewriteComment(dto.touch_id, words, change.trim()).catch(() => null);
    if (!answer?.ok) {
      setRewrite("failed");
      return false;
    }
    setRewrite("none");
    if (answer.data.draft) setWords(answer.data.draft);
    else setRewriteCannot(answer.data.cannot_why);
    return true;
  };
  return { rewrite, rewriteCannot, askAgain };
}

/** One comment's page: `flash` is the Inbox's toast, `close` goes back to the comments. */
export function useCommentPage(id: string, flash: (f: Flash) => void, close: () => void): CommentPage {
  const [read, again] = useCommentRead(id);
  const dto = read.state === "read" ? read.dto : null;
  const [typed, setTyped] = useState<string | null>(() => KEPT_WORDS.get(id) ?? null);
  const [busy, setBusy] = useState<CommentPage["busy"]>(null);
  useEffect(() => setTyped(KEPT_WORDS.get(id) ?? null), [id]);
  const setWords = useCallback(
    (words: string) => {
      KEPT_WORDS.set(id, words);
      setTyped(words);
    },
    [id],
  );
  const words = typed ?? (dto ? boxStartOf(dto) : "");
  const rewriting = useCommentRewrite(id, dto, words, setWords);
  const io: PressIo | null = dto && !busy ? { dto, flash, again, close, setBusy } : null;
  const send = () => {
    const text = words.trim();
    if (!io || !text) return;
    void pressComment(io, "send", () => sendCommentAnswer(io.dto.touch_id, text)).then((ok) => {
      if (!ok) return;
      KEPT_WORDS.delete(id);
      setTyped(null);
    });
  };
  return {
    read,
    words,
    setWords,
    ...rewriting,
    busy,
    again,
    send,
    leave: () => void (io && leaveIt(io)),
    answerAfterAll: () => void (io && pressComment(io, "back", () => leaveComment(io.dto.touch_id, "back"))),
  };
}
