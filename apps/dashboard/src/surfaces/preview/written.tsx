"use client";

/**
 * AI's words as the page writes them (decision 0079; the review of 18 November 2026): the stretches that say a thing
 * they told it lit (the turn's `spans`, kept by the message door), and an answer that came on this visit written out
 * word by word. The answer comes whole from the receptionist's own door, so this is how it is drawn, never how it was
 * made: every word is in the document from the first, for a screen reader and for the page's height, and each is let in
 * after the last (preview.css; a device that asks for less motion shows them at once).
 */
import { Fragment, useEffect, useState } from "react";

type Span = readonly [number, number];

/** An answer cut where its lit stretches start and end. */
interface Part {
  text: string;
  lit: boolean;
}

function answerPartsOf(text: string, spans: readonly Span[]): Part[] {
  const parts: Part[] = [];
  let at = 0;
  for (const [from, to] of spans) {
    // A stretch out of order or past the answer's end is none: the words stand plain.
    if (from < at || to > text.length) continue;
    if (from > at) parts.push({ text: text.slice(at, from), lit: false });
    parts.push({ text: text.slice(from, to), lit: true });
    at = to;
  }
  if (at < text.length) parts.push({ text: text.slice(at), lit: false });
  return parts;
}

/** A part's words and the gaps between them; a word knows its place among the answer's words. */
interface Piece {
  text: string;
  word: number | null;
}

function piecesOf(parts: readonly Part[]): { lit: boolean; pieces: Piece[] }[] {
  let words = 0;
  return parts.map((part) => ({
    lit: part.lit,
    pieces: part.text
      .split(/(\s+)/)
      .filter(Boolean)
      .map((text): Piece => {
        if (!/\S/.test(text)) return { text, word: null };
        words += 1;
        return { text, word: words - 1 };
      }),
  }));
}

/** An answer is written out in about this long, whatever its length. */
const WRITTEN_IN_MS = 1_400;
/** The least and the most a word waits for the one before it: a short answer is not rushed, a long one not slow. */
const WORD_LEAST_MS = 14;
const WORD_MOST_MS = 34;

/** How many of an answer's words are in so far: one more at each beat, until all are. */
function useWordsIn(words: number): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= words) return;
    const beat = Math.min(WORD_MOST_MS, Math.max(WORD_LEAST_MS, WRITTEN_IN_MS / Math.max(1, words)));
    const next = setTimeout(() => setShown((was) => was + 1), beat);
    return () => clearTimeout(next);
  }, [shown, words]);
  return shown;
}

/** An answer being written: each word let in after the last, a lit stretch lit as its first word comes. */
function PvWriting({ parts }: { parts: readonly Part[] }) {
  const cut = piecesOf(parts);
  const words = cut.reduce((count, part) => count + part.pieces.filter((piece) => piece.word !== null).length, 0);
  const shown = useWordsIn(words);
  return (
    <>
      {cut.map((part, at) => {
        const pieces = part.pieces.map((piece, place) =>
          piece.word === null ? (
            piece.text
          ) : (
            <span key={place} className="pv-word" data-in={piece.word < shown || undefined}>
              {piece.text}
            </span>
          ),
        );
        const first = part.pieces.find((piece) => piece.word !== null)?.word ?? 0;
        return part.lit ? (
          <mark key={at} className="pv-yours" data-wait={first >= shown || undefined}>
            {pieces}
          </mark>
        ) : (
          <Fragment key={at}>{pieces}</Fragment>
        );
      })}
    </>
  );
}

/**
 * An answer's words: plain, with what it took from the things they told it lit. `write` is an answer that came on this
 * visit, which is written out.
 */
export function PvWords({ text, spans, write }: { text: string; spans: readonly Span[]; write: boolean }) {
  const parts = answerPartsOf(text, spans);
  if (write) return <PvWriting parts={parts} />;
  return (
    <>
      {parts.map((part, at) =>
        part.lit ? (
          <mark key={at} className="pv-yours">
            {part.text}
          </mark>
        ) : (
          <Fragment key={at}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
