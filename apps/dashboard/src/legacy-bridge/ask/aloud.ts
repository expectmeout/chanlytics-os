/**
 * A question spoken on the Line, answered aloud (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as
 * amended 5 Oct 2026, evening). The hold goes the typed way: its reads are drawn as they run, and the voice says none
 * of them. Ask's voice says one thing while it works, the waiting words, once, when ASK_VOICE_FIRST_WORDS_MS pass with
 * no answer begun; then the answer as it lands, after the waiting words while they are being said, over them while
 * their clip is still on its way. The voice agent this replaced spoke every read's label, and its vendor held a line
 * that ended no sentence until the answer's first one did: "hold on" was heard at the start of the answer, once for
 * every read.
 */
import { ASK_VOICE_FIRST_WORDS_MS, type AskLanguage } from "@chanlytics/contracts";
import type { askSpeech } from "./speech";

type Speech = Pick<ReturnType<typeof askSpeech>, "speak" | "state" | "watchSpeech">;
interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
}

/** The waiting words, a whole sentence: in Spanish for a question in Spanish, else in English, as the door said its own. */
const WAITING_WORDS = { en: "One moment.", es: "Un momento." } as const;
const waitingWords = (language: AskLanguage): string => WAITING_WORDS[language === "es" ? "es" : "en"];
/** The longest the answer waits on the waiting words: about twice as long as they take to say. */
const WAITING_WORDS_MAX_MS = 2_500;

export function askAloud(speech: Speech, timers: Timers = globalThis) {
  /** Whether the voice is on the waiting words, or fetching them: what the answer waits for. */
  let waiting = false;
  /** Until the voice is quiet, or WAITING_WORDS_MAX_MS pass. */
  const quiet = () =>
    new Promise<void>((resolve) => {
      let over = false;
      const done = () => {
        if (over) return;
        over = true;
        off();
        resolve();
      };
      const off = speech.watchSpeech(() => {
        if (speech.state() !== "speaking") done();
      });
      // The cap, should the end never be told; once the voice is quiet it finds the wait over and does nothing.
      timers.setTimeout(done, WAITING_WORDS_MAX_MS);
    });
  return {
    /** A question spoken and asked: the waiting words, once, unless `answered` says the answer began by then. */
    waitAloud(language: AskLanguage, answered: () => boolean): void {
      timers.setTimeout(() => {
        if (answered()) return;
        waiting = true;
        // Words that could not be said need no apology: the answer, read next, says what went wrong with it.
        speech.speak(waitingWords(language), "answer").catch(() => {});
      }, ASK_VOICE_FIRST_WORDS_MS);
    },
    /** The answer read aloud: rejects in the speech module's words, which the caller says. */
    async answerAloud(text: string): Promise<void> {
      if (waiting && speech.state() === "speaking") await quiet();
      waiting = false;
      return speech.speak(text, "answer");
    },
  };
}
