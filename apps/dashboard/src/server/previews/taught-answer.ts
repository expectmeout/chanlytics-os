import "server-only";

/**
 * Where a preview's answer says a thing the business told it (decision 0079's amendment of 18 November 2026): the
 * stretches of the answer the message door keeps with the turn. The page says "From what you told it" under an answer
 * that has one, and lights each stretch in it. Pure: the answer's words against the things told, no model asked. The
 * dashboard's server alone reaches it.
 */

/** A stretch of an answer, from one of its characters up to another. */
type AnswerSpan = [from: number, to: number];

/** A figure, with the sign of its money where it has one, so a lit price keeps its "$". */
const FIGURE = /[$€£]?\d[\d,.:]*\d/g;

/** A figure as an answer and a thing told share it: its digits alone, so "$1,450" and "1450" are one. */
const digitsOf = (figure: string): string => figure.replace(/[^\d]/g, "");

const taughtFiguresOf = (text: string): string[] =>
  (text.match(FIGURE) ?? []).map(digitsOf).filter((digits) => digits.length > 1);

/** A sentence as its words alone, for a run of them to be found in another. */
const plainWordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);

/** A word of an answer as plainWordsOf reads it, and where its letters stand in the answer. */
interface PlacedWord {
  word: string;
  from: number;
  to: number;
}

/** The letters and digits of a written word, without what is written around them ("labor." is "labor"). */
const WORD_CORE = /[\p{L}\p{N}](?:.*[\p{L}\p{N}])?/su;

const placedWordsOf = (text: string): PlacedWord[] =>
  [...text.matchAll(/\S+/g)].flatMap((found) => {
    const core = WORD_CORE.exec(found[0]);
    if (!core) return [];
    const from = found.index + core.index;
    return [{ word: core[0].toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""), from, to: from + core[0].length }];
  });

/** How many of a thing told's words, in a row, an answer must carry to be said to say it. */
const TAUGHT_RUN = 5;
/** The stretches kept with one answer, at most: a turn's row holds a few, never a list without end. */
const SPANS_MOST = 8;

/** Where the answer writes a figure one of the things told holds. */
function figureSpansOf(answer: string, told: ReadonlySet<string>): AnswerSpan[] {
  return [...answer.matchAll(FIGURE)].flatMap((found): AnswerSpan[] => {
    const digits = digitsOf(found[0]);
    return digits.length > 1 && told.has(digits) ? [[found.index, found.index + found[0].length]] : [];
  });
}

/** How far the answer's words, from one of them, run along a thing told's own, from one of those. */
function runLength(answered: readonly PlacedWord[], at: number, told: readonly string[], from: number): number {
  let run = 0;
  while (at + run < answered.length && from + run < told.length && answered[at + run]?.word === told[from + run])
    run += 1;
  return run;
}

/** Where the answer carries a run of one thing told's own words. */
function runSpansOf(answered: readonly PlacedWord[], told: readonly string[]): AnswerSpan[] {
  const spans: AnswerSpan[] = [];
  let at = 0;
  while (at < answered.length) {
    let longest = 0;
    for (let from = 0; from < told.length; from += 1) longest = Math.max(longest, runLength(answered, at, told, from));
    const first = answered[at];
    const last = answered[at + longest - 1];
    if (longest >= TAUGHT_RUN && first && last) spans.push([first.from, last.to]);
    at += longest >= TAUGHT_RUN ? longest : 1;
  }
  return spans;
}

/**
 * The stretches of an answer that say a thing they told it: a figure one of them holds (a price, a time), or a run of
 * one's own words; in the answer's order, and none twice. An answer with none is the record's own, so the page never
 * credits them with an answer it would have given anyway.
 */
export function taughtSpansOf(answer: string, taught: readonly string[]): AnswerSpan[] {
  const figures = new Set(taught.flatMap(taughtFiguresOf));
  const answered = placedWordsOf(answer);
  const found = [
    ...figureSpansOf(answer, figures),
    ...taught.flatMap((sentence) => runSpansOf(answered, plainWordsOf(sentence))),
  ].sort((one, other) => one[0] - other[0]);
  const spans: AnswerSpan[] = [];
  for (const [from, to] of found) {
    const last = spans.at(-1);
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else spans.push([from, to]);
  }
  return spans.slice(0, SPANS_MOST);
}
