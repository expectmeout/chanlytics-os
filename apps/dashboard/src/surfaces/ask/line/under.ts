/** What is under the line, and the keys that walk it. */
import type { KeyboardEvent } from "react";
import type { FoldedTurn, Line, LineTaken } from "./types";
import { buildLineRows, flatRows, type LineRow } from "../home";
import { answerMoves, freshNext } from "../turn";
import { arEscape } from "./place";

/** The conversation's turns, whether the rows show (and are drawn: not while a phone's field is in use), the rows, and the answer drawn with its moves and words. */
export const arUnder = ({
  A,
  t,
  lang,
  query,
  surface,
  scope,
  threads,
  view,
  active,
  talk,
  live,
  quick,
  composing,
}: Line) => {
  const turns = active ? A.turns(active.messages) : []; // its questions and their answers, in order (palette.ts)
  const latest = turns.length ? turns[turns.length - 1] : null;
  const folded = turns.slice(0, -1).filter((tn): tn is FoldedTurn => !!tn.q && !!tn.a); // the thread's earlier turns, each drawn in full
  const answerMsg = latest && latest.a ? latest.a : null;
  const showRows = arShowRows({ talk, view, query, active, quick, live, answerMsg });
  // A phone's field in use with rows under the three (the home, or the words' own): the middle composes (spec 5.9).
  const composingRows = composing && showRows;
  // The rows on screen: not while the field is in use (with the keyboard up there is no room for them, the words' own
  // rows and the jumps included, and Enter sends), so nothing is built or walked; nor for words typed that find no place
  // to jump to and no question that matches (buildLineRows draws them none), which the field holds and Enter asks.
  const rowsShown = showRows && !composing;
  const sections = rowsShown ? buildLineRows({ A, t, lang, query, surface, scope, threads, view }) : [];
  const rows = flatRows(sections);
  const rowsDrawn = rowsShown && (view === "earlier" || !query.trim() || rows.length > 0);
  const drawn =
    showRows || talk.listening || live || quick || !answerMsg
      ? null
      : freshNext(A, A.answer(answerMsg), active ? turns : []);
  const moves = drawn ? answerMoves(drawn.answer) : [];
  const [words, spoken] = drawn ? [A.answerCopy(drawn.answer), A.answerSpoken(drawn.answer)] : ["", ""];
  const th = arThreadOf({ view, active, quick, showRows, composing, talk, live, latest });
  // An answer with cards keeps its next questions in the thread, under them: over the field they stood on the card.
  const nextInThread = !!(answerMsg && answerMsg.proposals && answerMsg.proposals.length);
  return {
    latest,
    folded,
    answerMsg,
    showRows,
    composingRows: composingRows && !th.thread,
    rowsDrawn,
    sections,
    rows,
    drawn,
    moves,
    words,
    spoken,
    nextInThread,
    ...th,
  };
};

/** Whether the rows show: Earlier, words typed outside a conversation (a conversation's draft keeps its thread, D1), or nothing to answer yet. */
const arShowRows = ({
  talk,
  view,
  query,
  active,
  quick,
  live,
  answerMsg,
}: Pick<Line, "talk" | "view" | "query" | "active" | "quick" | "live" | "answerMsg">) =>
  !talk.listening && (view === "earlier" || (!!query && !(active || quick)) || (!live && !quick && !answerMsg));

/** The thread (the spec 2026-09-27-ask-chat-on-a-phone, D1, D4): whether the middle is one, whether the three come forward over the field to listen, and the newest question. */
const arThreadOf = ({
  view,
  active,
  quick,
  showRows,
  composing,
  talk,
  live,
  latest,
}: Pick<Line, "view" | "active" | "quick" | "showRows" | "composing" | "talk" | "live" | "latest">) => {
  // A conversation or a quick answer, every turn in full, unless Earlier is open; a phone's field in use or a held mic
  // keeps it, dimmed, with the three come forward over the field.
  const thread = view === "rows" && (!!active || !!quick) && (!showRows || composing || talk.listening);
  const listen = thread && (composing || talk.listening) && !live && !(quick && quick.pending);
  const nowQ = live ? live.q : quick ? quick.q : latest && latest.q ? latest.q.text : "";
  const nowFiles = live ? live.files : quick ? [] : (latest?.q?.files ?? []);
  return { thread, listen, nowQ, nowFiles };
};

/** A row or a move taken: a conversation opened, Earlier, a place gone to, words to finish, or a question asked. */
export const arActivate = ({ openThread, nav, setQuery, inputRef, submit }: Line) => {
  const activate = (it: LineTaken | undefined) => {
    if (!it) return;
    if (it.type === "thread") {
      void openThread(it.th as NonNullable<LineRow["th"]>);
      return;
    }
    if (it.type === "jump") {
      nav(it.to as string, { leave: true });
      return;
    }
    if (it.type === "item" || it.type === "open") {
      nav(it.to as string);
      return;
    }
    if (it.compose) {
      setQuery(it.q as string);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
      return;
    }
    void submit(it.q, undefined, it.following ? { following: it.following } : undefined); // a follow-up come due: its id rides with it
  };
  return activate;
};

/** A key the field keeps as a field's: Shift with Enter breaks a line, and the arrows move between its lines once it has several. */
const arFieldKey = (e: KeyboardEvent, query: string) =>
  (e.key === "Enter" && e.shiftKey) || ((e.key === "ArrowDown" || e.key === "ArrowUp") && query.includes("\n"));

/** The line's keys: Esc, the arrows over the rows or the answer's moves, Delete on a conversation, Enter; the field's own first (arFieldKey). */
export const arOnKey = ({
  hold,
  live,
  stop,
  onClose,
  showRows,
  rows,
  moves,
  sel,
  setSel,
  move,
  setMove,
  active,
  query,
  setQuery,
  askDelete,
  view,
  setView,
  activate,
  submit,
  attached,
}: Line) => {
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (hold.onKeyDown(e) || arFieldKey(e, query)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      arEscape({ live, stop, view, setView, onClose });
      return;
    }
    if (e.key === "ArrowDown") {
      if (showRows && rows.length) {
        e.preventDefault();
        setSel((s) => Math.min(rows.length - 1, s + 1));
      } else if (moves.length) {
        e.preventDefault();
        setMove((m) => Math.min(moves.length - 1, m + 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      if (showRows && sel > 0) {
        e.preventDefault();
        setSel((s) => s - 1);
        return;
      }
      if (!showRows && move >= 0) {
        e.preventDefault();
        setMove((m) => m - 1);
        return;
      }
      // Nothing to walk back to: an empty line in a conversation takes the last question again.
      if (active && !query) {
        const last = [...active.messages].reverse().find((m) => m.role === "user");
        if (last) {
          e.preventDefault();
          setQuery(last.text);
        }
      }
      return;
    }
    // Delete asks to delete the conversation the keys stand on, from an empty line; with words it edits them.
    if (e.key === "Delete" && !query && showRows && rows[sel] && rows[sel].type === "thread") {
      e.preventDefault();
      askDelete(rows[sel].th as NonNullable<LineRow["th"]>);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const q = query.trim();
      // A photo beside the field makes a question of an empty line.
      if (attached.length && !q) void submit();
      // Typed words are asked, unless the keys moved to a row; in Earlier they only find a conversation to open.
      else if (showRows && rows[sel] && (!q || sel > 0 || view === "earlier")) activate(rows[sel]);
      else if (q) void submit(q);
      else if (moves[move]) activate(moves[move]);
    }
  };
  return onKey;
};
/** The hero as it stands: shrunk with the question under it, at rest, and the standing pills. */
export const arHeroState = ({
  live,
  answerMsg,
  quick,
  latest,
  talk,
  showRows,
  view,
  query,
  A,
  lang,
  composing,
  composingRows,
  thread,
}: Line) => {
  // Small once an answer is written, and while words are typed at home with the field not composing (a desk's, or a
  // phone's left with words once its keyboard went), so their rows stand under the three and not a screen below them.
  const typed = showRows && view === "rows" && !!query.trim() && !composing;
  const heroSmall = !!(live && (live.say || live.text)) || !!answerMsg || typed;
  // In the thread the three lead the newest answer (D3), its question the bubble over them, not a line under.
  const heroMode = arHeroModeOf({ thread, heroSmall, live, quick });
  const heroQ = !heroSmall || thread ? null : live ? live.q : latest && latest.q ? latest.q.text : null;
  const restful = !thread && (talk.listening || (showRows && view === "rows" && !query));
  // The standing pills (who needs you, the runs and searches waiting) are the hero's: under the three at rest, and
  // still there while a phone's field is in use, since they are what a person came to see (spec 5.9).
  const parts = A.rightNowParts ? A.rightNowParts(lang) : null;
  const standing =
    !!parts && !!(parts.people || parts.runs || parts.searches) && !talk.listening && (composingRows || restful);
  return { heroSmall, heroMode, heroQ, restful, parts, standing };
};

/** The three in the thread (D3, D11): large while Ask reads; at the answer's start, speaking, the moment its words arrive, in one move; still there once it is whole. */
const arHeroModeOf = ({ thread, heroSmall, live, quick }: Pick<Line, "thread" | "heroSmall" | "live" | "quick">) => {
  if (!thread) return heroSmall ? " small" : "";
  const reading = (!!live && !(live.say || live.text)) || !!(quick && quick.pending);
  return reading ? " thinking" : live ? " sig speaking" : " sig";
};
