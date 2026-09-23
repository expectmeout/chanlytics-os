/**
 * The band's turn: what the three know about a question, as a pure reducer. The page dispatches what the palette's
 * hooks and stream hand it; this decides the phase, the words on screen, and the thread.
 *
 * Every event from a stream carries the `seq` of the question that started it, so an answer to an older question,
 * or one that arrives after the page was left, changes nothing.
 */
import type { AskAnswer, AskLanguage, AskMessageVM } from "@chanlytics/contracts";

export type TurnPhase = "rest" | "listening" | "reading" | "answering" | "settled" | "failed";
export interface Turn {
  phase: TurnPhase;
  /** the question as sent */
  question: string;
  /** the words heard so far, while listening */
  heard: string;
  /** the stream's latest trace while reading, or null */
  trace: string | null;
  /** the answer so far, or the failure's sentence */
  text: string;
  message: AskMessageVM | null;
  /** a quick answer, drawn as the Line draws it (contracts ask-answer.ts) */
  answer: AskAnswer | null;
  threadId: string | null;
  language: AskLanguage;
  /** the question in flight; every stream event names the one it belongs to */
  seq: number;
  /** the phase a press interrupted, for a press that ends with no words */
  before: TurnPhase;
}
export type TurnEvent =
  | { t: "pressed" }
  | { t: "heard"; words: string }
  /** the press ended with no words, or the microphone failed */
  | { t: "released" }
  | { t: "asked"; text: string; language: AskLanguage; seq: number }
  | { t: "thread"; id: string; seq: number }
  | { t: "trace"; text: string; seq: number }
  /** the answer's Say as written so far: it replaces the words (a preview; the final message is the answer) */
  | { t: "say"; headline: string; detail: string; seq: number }
  /** a v1 turn's words, from a server before the Line: they add up */
  | { t: "delta"; text: string; seq: number }
  | { t: "final"; message: AskMessageVM; seq: number }
  | { t: "fast"; text: string; answer: AskAnswer; seq: number }
  | { t: "error"; text: string; seq: number }
  | { t: "cut-off"; text: string; seq: number }
  | { t: "cleared" }
  | { t: "left" };

export const initialTurn = (): Turn => ({
  phase: "rest",
  question: "",
  heard: "",
  trace: null,
  text: "",
  message: null,
  answer: null,
  threadId: null,
  language: "en",
  seq: 0,
  before: "rest",
});

const busy = (p: TurnPhase) => p === "reading" || p === "answering";

export function turnReducer(turn: Turn, ev: TurnEvent): Turn {
  switch (ev.t) {
    case "pressed":
      return busy(turn.phase) || turn.phase === "listening"
        ? turn
        : { ...turn, phase: "listening", before: turn.phase, heard: "" };
    case "heard":
      return turn.phase === "listening" ? { ...turn, heard: ev.words } : turn;
    case "released":
      return turn.phase === "listening" ? { ...turn, phase: turn.before, heard: "" } : turn;
    case "asked":
      if (busy(turn.phase)) return turn;
      return {
        ...turn,
        phase: "reading",
        question: ev.text,
        heard: "",
        trace: null,
        text: "",
        message: null,
        answer: null,
        language: ev.language,
        seq: ev.seq,
      };
    case "cleared":
      return { ...initialTurn(), language: turn.language, seq: turn.seq };
    case "left":
      return { ...turn, phase: "rest", heard: "", trace: null, seq: turn.seq + 1 };
    default:
      break;
  }
  // everything below belongs to one question
  if (ev.seq !== turn.seq || !busy(turn.phase)) return turn;
  switch (ev.t) {
    case "thread":
      return { ...turn, threadId: ev.id };
    case "trace":
      return turn.phase === "reading" ? { ...turn, trace: ev.text } : turn;
    case "say":
      return {
        ...turn,
        phase: "answering",
        trace: null,
        text: [ev.headline, ev.detail].filter(Boolean).join(" "),
      };
    case "delta":
      return { ...turn, phase: "answering", trace: null, text: turn.text + ev.text };
    case "final":
      return ev.message.failed
        ? { ...turn, phase: "failed", trace: null, text: ev.message.text, message: ev.message }
        : { ...turn, phase: "settled", trace: null, text: ev.message.text, message: ev.message };
    case "fast":
      return { ...turn, phase: "settled", trace: null, text: ev.text, message: null, answer: ev.answer };
    case "error":
    case "cut-off":
      return { ...turn, phase: "failed", trace: null, text: ev.text, message: null };
    default:
      return turn;
  }
}
