import "server-only";

/**
 * Whether a preview's answer says a thing the business told it (decision 0079's amendment of 18 November 2026): the
 * mark the message door keeps with the turn, which the page says under the answer as "From what you told it". Pure:
 * the answer's words against the things told, no model asked. The dashboard's server alone reaches it.
 */

/** A figure as an answer and a thing told share it: its digits alone, so "$1,450" and "1450" are one. */
const taughtFiguresOf = (text: string): string[] =>
  (text.match(/\d[\d,.:]*\d/g) ?? [])
    .map((figure) => figure.replace(/[^\d]/g, ""))
    .filter((digits) => digits.length > 1);

/** A sentence as its words alone, for a run of them to be found in another. */
const plainWordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);

/** How many of a thing told's words, in a row, an answer must carry to be said to say it. */
const TAUGHT_RUN = 5;

/**
 * Whether an answer says a thing they told it: it carries a figure one of them holds (a price, a time), or a run of
 * one's own words. Said under the answer ("From what you told it") only where this holds, so the page never credits
 * them with an answer the record would have given anyway.
 */
export function answerUsesTaught(answer: string, taught: readonly string[]): boolean {
  const figures = new Set(taughtFiguresOf(answer));
  const answered = ` ${plainWordsOf(answer).join(" ")} `;
  return taught.some((sentence) => {
    if (taughtFiguresOf(sentence).some((figure) => figures.has(figure))) return true;
    const words = plainWordsOf(sentence);
    for (let at = 0; at + TAUGHT_RUN <= words.length; at += 1)
      if (answered.includes(` ${words.slice(at, at + TAUGHT_RUN).join(" ")} `)) return true;
    return false;
  });
}
