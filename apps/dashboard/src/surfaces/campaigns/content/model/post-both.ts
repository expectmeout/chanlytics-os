/**
 * One draft for a post going to Instagram and to Google at once (the content canvas, "Making and posting"). The two doors stay
 * two (POST files/[id]/instagram, POST files/[id]/google): this is what the one composer holds and what stops its send.
 */
import {
  CONTENT_WORDS,
  DAY_MS,
  FILE_GOOGLE_WORDS_MAX,
  SECOND_MS,
  postCaptionProblem,
  postSentencesOf,
  wallClockAt,
  zoneDayKey,
  type InstagramPostKind,
  type PostPlan,
} from "@chanlytics/contracts";
import type { PieceTakes } from "./piece-open";

export interface PostBothDraft {
  instagram: boolean;
  google: boolean;
  as: InstagramPostKind;
  words: string;
  /** When it goes up, at every place on; null is now. Google keeps a time too (00616). */
  when: string | null;
}

/** What the composer opens holding: what the picture says, and every place that can take it. */
export const postBothBegins = (plan: Pick<PostPlan, "line" | "under">, takes: PieceTakes): PostBothDraft => ({
  instagram: takes.instagram,
  google: takes.google,
  as: "picture",
  words: postSentencesOf([plan.line, plan.under]),
  when: null,
});

/** The one thing that stops a send, or null. */
export function postBothProblemOf(draft: PostBothDraft): string | null {
  const postSays = CONTENT_WORDS.post;
  if (!draft.instagram && !draft.google) return postSays.nowhere;
  const words = draft.words.trim();
  const needsWords = draft.google || draft.as === "picture";
  if (needsWords && !words) return postSays.wordsNeeded;
  if (draft.google && words.length > FILE_GOOGLE_WORDS_MAX) return postSays.tooLongForGoogle;
  if (draft.instagram && draft.as === "picture") {
    const refusal = postCaptionProblem(words);
    if (refusal) return refusal;
  }
  return null;
}

/** This evening is offered only while it is at least this far off. */
const EVENING_ROOM_MS = 30 * 60 * SECOND_MS;

/** The two times the composer offers, by the business's own clock: this evening at six, tomorrow morning at nine. */
export function postTimesOf(nowMs: number, timeZone: string): { evening: string | null; morning: string } {
  const evening = wallClockAt(timeZone, zoneDayKey(nowMs, timeZone), 18, 0);
  const morning = wallClockAt(timeZone, zoneDayKey(nowMs + DAY_MS, timeZone), 9, 0);
  return {
    evening: evening - nowMs >= EVENING_ROOM_MS ? new Date(evening).toISOString() : null,
    morning: new Date(morning).toISOString(),
  };
}
