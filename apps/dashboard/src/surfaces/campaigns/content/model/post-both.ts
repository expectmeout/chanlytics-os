/**
 * One draft for a post going to Instagram and to Google at once (the content canvas, "Making and posting"). The two doors stay
 * two (POST files/[id]/instagram, POST files/[id]/google): this is what the one composer holds and what stops its send.
 */
import {
  CONTENT_WORDS,
  FILE_GOOGLE_WORDS_MAX,
  postCaptionProblem,
  type InstagramPostKind,
} from "@chanlytics/contracts";
import type { PieceTakes } from "./piece-open";

export interface PostBothDraft {
  instagram: boolean;
  google: boolean;
  as: InstagramPostKind;
}

/**
 * What the composer opens holding: every place that can take it, on Instagram as a post. No time: a post goes as it is sent,
 * and a time is asked of Ask (Ruben, 12 Nov 2026: two times written into the page were guesses, the same for every business).
 * Its words are not the draft's: they are the piece's caption, typed in Details alone (viewer/caption.tsx) and read as it is
 * sent (model/viewer-line.ts postCaptionOf).
 */
export const postBothBegins = (takes: PieceTakes): PostBothDraft => ({
  instagram: takes.instagram,
  google: takes.google,
  as: "picture",
});

/** The one thing that stops a send, or null. `words` is the caption that goes with it. */
export function postBothProblemOf(draft: PostBothDraft, words: string): string | null {
  const postSays = CONTENT_WORDS.post;
  if (!draft.instagram && !draft.google) return postSays.nowhere;
  const needsWords = draft.google || draft.as === "picture";
  if (needsWords && !words) return postSays.wordsNeeded;
  if (draft.google && words.length > FILE_GOOGLE_WORDS_MAX) return postSays.tooLongForGoogle;
  if (draft.instagram && draft.as === "picture") {
    const refusal = postCaptionProblem(words);
    if (refusal) return refusal;
  }
  return null;
}
