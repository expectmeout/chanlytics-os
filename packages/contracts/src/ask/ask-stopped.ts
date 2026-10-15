/**
 * A turn the person stopped (the Line's Stop): the Line draws it the moment Stop is pressed, and the turn's door keeps
 * the same answer on the thread (the dashboard's server/ask/turn.ts), so the conversation opened again shows what the
 * person saw, and the next question's history says the turn was stopped before its answer.
 */
import { ASK_ANSWER_CAPS, clip, failedAnswer, type AskAnswer } from "./ask-answer";
import type { AskLanguage } from "./ask-language";

/** What a stopped turn says, as its headline: to the person, and to the model reading the thread's history. */
const ASK_STOPPED_WORDS = {
  en: "Stopped before the answer was finished.",
  es: "Detenido antes de terminar la respuesta.",
} as const;

/**
 * A stopped turn's answer: marked failed by its message, the headline saying it was stopped, and what its Say had
 * written so far under it, as the person read it. Nothing written yet leaves the headline alone.
 */
export function stoppedAnswer(said: { headline: string; detail: string } | null, language: AskLanguage): AskAnswer {
  const a = failedAnswer(ASK_STOPPED_WORDS[language === "es" ? "es" : "en"], language);
  const so = [said?.headline, said?.detail].filter(Boolean).join(" ");
  return { ...a, say: { ...a.say, detail: clip(so, ASK_ANSWER_CAPS.detail) } };
}
