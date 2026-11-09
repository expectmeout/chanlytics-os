/** Answer: prose. */

import { ASK_CAPS, type AskMessageVM } from "../thread-words";
import { answerText, cleanAnswer } from "../answer-text";
import type { AskLanguage } from "../language";
import { noList, structured, type AskAnswer, type AskSource } from "./shape";

/** A turn that could not be answered: its sentence as the headline (spec 5.4, step 6). The message is marked failed. */
export function failedAnswer(sentenceText: string, language: AskLanguage): AskAnswer {
  return structured(sentenceText, language);
}

/** The most a prose answer says: what the old answer field held. */
const PROSE_MAX = 1500;

/** Words with no shape: a turn whose format the API refused (D15). */
export function proseAnswer(text: string, language: AskLanguage): AskAnswer {
  return {
    v: 2,
    form: "prose",
    say: { headline: "", detail: cleanAnswer(text).slice(0, PROSE_MAX) },
    show: { figures: [], items: [], breakdown: null, list: noList() },
    do: { open: null, next: [] },
    language,
  };
}

/**
 * The v1 fields a v2 answer is stored beside (spec 5.8): its words for the history, copy and search; the sources it
 * rests on as citations, with their routes (the erase route finds a person by them); Open as navigate; next as the
 * follow-ups. Read back by every reader of v1 and by answerFromV1. Not an identity round trip.
 */
export function v1FromAnswer(
  askAnswer: AskAnswer,
): Pick<AskMessageVM, "text" | "citations" | "navigate" | "followups"> {
  const seen = new Set<string>();
  const citations: AskMessageVM["citations"] = [];
  const add = (s: AskSource | null) => {
    if (!s || seen.has(`${s.kind}:${s.id}`)) return;
    seen.add(`${s.kind}:${s.id}`);
    citations.push({ kind: s.kind, id: s.id, label: s.label, to: s.to });
  };
  for (const i of askAnswer.show.items) add(i.source);
  for (const f of askAnswer.show.figures) add(f.source);
  add(askAnswer.show.breakdown ? askAnswer.show.breakdown.source : null);
  add(askAnswer.show.chart?.source ?? null);
  return {
    text: answerText(askAnswer),
    citations: citations.slice(0, ASK_CAPS.citations),
    navigate: askAnswer.do.open
      ? { to: askAnswer.do.open.to, label: askAnswer.do.open.label, now: askAnswer.do.open.now }
      : null,
    followups: askAnswer.do.next,
  };
}
