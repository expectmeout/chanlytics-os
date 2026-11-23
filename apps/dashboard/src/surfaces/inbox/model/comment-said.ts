/**
 * A comment as Inbox lists it and opens it, and as Today points to it (00692; the content loop PRD's 9.2, 12.4 and
 * 12.5; the journey canvas's Results board, cells 1 to 8, approved by Ruben on 23 Nov 2026): who wrote, on which post,
 * what they wrote, and where its public answer stands with the one thing to do. AI drafts and the owner sends; a comment
 * AI can't answer safely says why, and is a point on Today; an answer whose outcome Instagram never told is never sent
 * twice blind. Pure: every sentence Inbox says of a comment is here, and Today's point on one is contracts'
 * (content/results/comment-stage.ts), which these words carry too.
 */
import {
  clockShort,
  clockStamp,
  COMMENT_ANSWER_WORDS,
  COMMENT_POINT_WORDS,
  commentStageOf,
  commentWho,
  type CommentAnswerDto,
  type CommentRowDto,
  type CommentStage,
} from "@chanlytics/contracts";

/** The words of a comment's row, its page and its line in the list, and Today's point on it (comment-stage.ts). */
export const COMMENT_WORDS = {
  ...COMMENT_POINT_WORDS,
  aPost: "a post",
  commented: (words: string | null) => (words ? `Commented “${words}”` : "Commented"),
  head: (person: string) => `${person} commented`,
  on: (post: string, kind: string, at: string) => `On ${post} · Instagram ${kind} · ${at}`,
  yours: "The answer, in public",
  aiWrote: "AI wrote it",
  placeholder: "Write your answer",
  send: "Send",
  sendAgain: "Send again",
  sending: "Sending…",
  change: "Tell AI what to change",
  changeAsk: "What should it say instead?",
  changeGo: "Write it again",
  rewriting: "AI is writing it again",
  rewriteFailed: "AI couldn't write it again just now. Change the words here, or ask again.",
  leave: "Leave it",
  left: "Left unanswered",
  leftBody: "It stays here, and nothing is posted under it.",
  answerAfterAll: "Answer it after all",
  leftToast: "Left unanswered",
  cannot: (reason: string) => `AI can't answer this one safely · ${reason}`,
  addPrice: "Add the price in Settings",
  under: "Under the comment",
  seeIt: "See it",
  openInstagram: "Open in Instagram",
  failed: "That didn't go through, and nothing was posted. Try again.",
  reading: "Opening this comment…",
  gone: {
    title: "That comment isn't here any more",
    body: "It was removed, or it belongs to another workspace.",
    act: "Show the comments",
  },
  unread: {
    title: "This comment couldn't be read just now",
    body: "Nothing is lost. It is read again when you come back to it.",
    act: "Read it again",
  },
  list: {
    title: "Comments on your posts",
    reading: "Reading the comments…",
    failed: "the comments on your posts",
    none: "No comments on your posts in the last 30 days",
    noneBody: "When someone comments on a post sent from here, it's here, with AI's answer ready to send.",
    back: "Show every conversation",
    shown: (n: number) => (n === 1 ? "1 in the last 30 days" : `${n.toLocaleString("en-US")} in the last 30 days`),
    door: (n: number) => (n === 1 ? "1 comment to answer" : `${n.toLocaleString("en-US")} comments to answer`),
    doorBody: "On your posts, with AI's answers ready to send",
    doorGo: "Show them",
    pick: "Open a comment to answer it",
  },
} as const;

const KIND_SAID: Readonly<Record<string, string>> = { reel: "reel", story: "story", picture: "post" };

/** A comment's row in Inbox's list: who and on which post, what they wrote and where its answer stands, and when. */
interface CommentRowSaid {
  title: string;
  sub: string;
  when: string;
  /** Answered, or left: drawn quieter. */
  quiet: boolean;
}

/** What the row adds after their words, by where the answer stands; nothing for AI's draft waiting. */
const STANDING: Readonly<Record<CommentStage, string>> = {
  none: "",
  drafted: "",
  cannot: COMMENT_POINT_WORDS.today.status.cannot,
  sending: "Answering",
  sent: "Answered",
  by_hand: "Answered",
  failed: COMMENT_POINT_WORDS.today.status.failed,
  unknown: "Didn't say",
  left: "Left",
};

/** The row's words. `post` is the post's title (its piece's name). */
export function commentRowSaid(row: CommentRowDto, post: string | null, tz: string, nowMs: number): CommentRowSaid {
  const stage = commentStageOf(row.answer);
  const standing = STANDING[stage];
  return {
    title: `${commentWho(row)} · on ${post || COMMENT_WORDS.aPost}`,
    sub: [COMMENT_WORDS.commented(row.words), standing].filter(Boolean).join(" · "),
    when: clockShort(Date.parse(row.at), tz, nowMs),
    quiet: stage === "sent" || stage === "by_hand" || stage === "left",
  };
}

/** The line under the comment, where its answer stands: on its way, up, refused, or not told. */
export interface CommentLine {
  words: string;
  tone: "live" | "ok" | "you";
}

/** A comment's page, opened: its head, their words, the answer's box and line, and what may be pressed. */
export interface CommentPageSaid {
  stage: CommentStage;
  head: string;
  on: string;
  words: string;
  /** The answer's box: its words to start from, whether it is typed in, and the mark over it. Null where there is none. */
  box: { start: string; typed: boolean; mark: string | null } | null;
  /** AI's reason it could not answer, over an empty box. */
  note: string | null;
  line: CommentLine | null;
  /** The press that sends the box's words, or null where nothing is sent from here now. */
  send: string | null;
  /** Whether AI may be asked to write it again (its draft is on screen). */
  change: boolean;
  /** Whether the price is the way to an answer AI could write: a price AI doesn't have. */
  addPrice: boolean;
  /** Whether it may be left unanswered, or answered after all. */
  leave: boolean;
  answerAfterAll: boolean;
  /** The link to the post on Instagram and what it says, or null. */
  look: { label: string; href: string } | null;
}

const answerLineOf = (words: string, tone: CommentLine["tone"]): CommentLine => ({ words, tone });

/** What the answer says where it went or did not, with the time it went. */
function answeredLine(answer: CommentAnswerDto, words: string, tz: string, nowMs: number): CommentLine {
  return answerLineOf(answer.sent_at ? `${words} · ${clockStamp(Date.parse(answer.sent_at), tz, nowMs)}` : words, "ok");
}

/** What a stage's page draws over the head and the words: its box, its note, its line, its presses. */
type StagePart = Partial<Omit<CommentPageSaid, "stage" | "head" | "on" | "words">>;

/** What each stage draws from: the answer, the post's address there, and the clock its times are said by. */
interface StageOf {
  answer: CommentAnswerDto | null;
  permalink: string | null;
  tz: string;
  nowMs: number;
}

/** The box the owner types in, starting from the words last sent (none where nothing was). */
const typedBox = (at: StageOf) => ({ start: at.answer?.words ?? "", typed: true, mark: null });
/** The box read only: the words on their way, or up. */
const sentBox = (at: StageOf) => ({ start: at.answer?.words ?? "", typed: false, mark: null });
/** The link to the post on Instagram, as a stage says it. */
const instagramLookOf = (at: StageOf, label: string) => (at.permalink ? { label, href: at.permalink } : null);

/** Each stage's page. */
const STAGES: Readonly<Record<CommentStage, (at: StageOf) => StagePart>> = {
  none: (at) => ({ box: typedBox(at), note: COMMENT_ANSWER_WORDS.noDraft, send: COMMENT_WORDS.send, leave: true }),
  drafted: (at) => ({
    box: { start: at.answer?.draft ?? "", typed: true, mark: COMMENT_WORDS.aiWrote },
    send: COMMENT_WORDS.send,
    change: true,
    leave: true,
  }),
  cannot: (at) => ({
    box: typedBox(at),
    note: COMMENT_WORDS.cannot(at.answer?.cannot_why ?? ""),
    send: COMMENT_WORDS.send,
    addPrice: /price/i.test(at.answer?.cannot_why ?? ""),
    leave: true,
  }),
  sending: (at) => ({ box: sentBox(at), line: answerLineOf(COMMENT_ANSWER_WORDS.sending, "live") }),
  sent: (at) => ({
    box: sentBox(at),
    line: at.answer ? answeredLine(at.answer, COMMENT_ANSWER_WORDS.sent, at.tz, at.nowMs) : null,
    look: instagramLookOf(at, COMMENT_WORDS.seeIt),
  }),
  by_hand: (at) => ({
    line: at.answer ? answeredLine(at.answer, COMMENT_ANSWER_WORDS.byHand, at.tz, at.nowMs) : null,
    look: instagramLookOf(at, COMMENT_WORDS.seeIt),
  }),
  failed: (at) => ({
    box: typedBox(at),
    line: answerLineOf(at.answer?.said || COMMENT_ANSWER_WORDS.refused, "you"),
    send: COMMENT_WORDS.sendAgain,
    leave: true,
  }),
  unknown: (at) => ({
    box: typedBox(at),
    line: answerLineOf(COMMENT_ANSWER_WORDS.unknown, "you"),
    send: COMMENT_WORDS.sendAgain,
    look: instagramLookOf(at, COMMENT_WORDS.openInstagram),
  }),
  left: () => ({ line: answerLineOf(COMMENT_WORDS.left, "ok"), answerAfterAll: true }),
};

/** A comment's page by where its answer stands. `post` is the post's title (its piece's name). */
export function commentPageSaid(row: CommentRowDto, post: string | null, tz: string, nowMs: number): CommentPageSaid {
  const stage = commentStageOf(row.answer);
  const kind = KIND_SAID[row.post.kind] ?? "post";
  return {
    stage,
    head: COMMENT_WORDS.head(commentWho(row)),
    on: COMMENT_WORDS.on(post || COMMENT_WORDS.aPost, kind, clockStamp(Date.parse(row.at), tz, nowMs)),
    words: row.words?.trim() || COMMENT_WORDS.noWords,
    box: null,
    note: null,
    line: null,
    send: null,
    change: false,
    addPrice: false,
    leave: false,
    answerAfterAll: false,
    look: null,
    ...STAGES[stage]({ answer: row.answer, permalink: row.post.permalink, tz, nowMs }),
  };
}
