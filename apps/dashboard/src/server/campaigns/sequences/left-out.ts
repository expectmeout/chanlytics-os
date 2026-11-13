/**
 * What Ask says it left out (`cannot`, a draft's and a rewrite's), as it is kept. Its length was read as part of the
 * answer's shape, at 300 characters Ask was never told of, so a note a clause longer lost the whole draft as "unreadable"
 * (the live run of 13 Nov 2026: a line that left out two things, each quoted). Ask is told its room now, and a note that
 * runs past it loses nothing: it is kept whole to twice that, and past that in the whole sentences that fit.
 */
import "server-only";
import { clipAtWord } from "@chanlytics/contracts";

/** How long Ask is told its note may run: “Left out: “<their words>”.”, then why, in two short sentences. */
export const LEFT_OUT_ASKED_MAX = 300;

/** How much of it is kept: Ask counts no characters, so twice what it is told. */
const LEFT_OUT_KEPT_MAX = 2 * LEFT_OUT_ASKED_MAX;

/** Where a sentence ends: a stop, any closing quote or bracket after it, then a space or the end. */
const LEFT_OUT_STOP = /[.!?]["'”’)\]]*(?=\s|$)/gu;

/** The note as it is kept: whole where it fits, else the whole sentences of it that do, else cut after a whole word. */
export function leftOutKept(note: string): string {
  const text = note.trim();
  if (text.length <= LEFT_OUT_KEPT_MAX) return text;
  let end = 0;
  for (const stop of text.matchAll(LEFT_OUT_STOP)) {
    const after = stop.index + stop[0].length;
    if (after > LEFT_OUT_KEPT_MAX) break;
    end = after;
  }
  return end > 0 ? text.slice(0, end) : clipAtWord(text, LEFT_OUT_KEPT_MAX - 1);
}
