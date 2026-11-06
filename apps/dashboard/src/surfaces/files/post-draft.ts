/**
 * A post not kept yet, as a person changes it (decision 0099, step 3): its plan, the shape on show, and the real picture of the two,
 * drawn by the server as they change. A pause in the typing draws; a newer change lets the last request go; and what was already drawn
 * comes at once (post-drawn.ts). The picture stands until the next is ready (post-frame.tsx). Only words that can't be drawn are said:
 * a lost line says nothing, and the last picture stands.
 */
import { useEffect, useRef, useState } from "react";
import { SECOND_MS, postPlanTidied, type PostPicture, type PostPlan, type PostShapeName } from "@chanlytics/contracts";
import { drawnKeyOf, keepDrawn, pictureDrawn, wordsKeyOf, type PostDrawn } from "./post-drawn";
import { fileVerbs } from "./verbs";

/** How long a pause in the typing is before the picture is drawn again. */
const DRAW_AFTER_MS = 0.35 * SECOND_MS;

/** What a draft holds, for a card to draw and press, and for its fields to change. */
export interface PostDraft<S extends PostPicture = PostShapeName> {
  plan: PostPlan;
  shape: S;
  /** The picture of what is asked, or the last one while the next comes; null before the first. */
  picture: string | null;
  /** A picture is on its way. */
  drawing: boolean;
  /** Nothing came, so there is no picture to show. */
  undrawn: boolean;
  /** What the server said of these words, in the post's language: nothing can be kept until they change. */
  refused: string | null;
  /** Whether the business has a number to print, once known. */
  hasPhone: boolean;
  change: (part: Partial<PostPlan>) => void;
  choose: (shape: S) => void;
}

/** What the last answer was, and what it was the answer to: `drawing` is derived, so a request let go can't leave it standing. */
type Answer = { key: string; picture: PostDrawn | null; refused: string | null };

/** `drawing` says whether to draw at all: a post kept shows its own file, and is never drawn again. */
export function usePostDraft<S extends PostPicture = PostShapeName>(
  start: PostPlan,
  wanted: boolean,
  startShape: S = "portrait" as S,
): PostDraft<S> {
  const [plan, setPlan] = useState(start);
  const [shape, setShape] = useState<S>(startShape);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [last, setLast] = useState<PostDrawn | null>(null);
  const key = drawnKeyOf(plan, shape);
  const words = wordsKeyOf(plan);
  const hasWords = plan.line.trim() !== "";
  const atOnce = pictureDrawn(key);
  const wordsDrawn = useRef<string | null>(null);
  useEffect(() => {
    if (!wanted || !hasWords || atOnce) return undefined;
    const stop = new AbortController();
    // The first picture and another shape are asked for now: only a change of words waits for the typing to pause.
    const timer = setTimeout(
      () => {
        wordsDrawn.current = words;
        void fileVerbs.postPicture(postPlanTidied(plan), shape, stop.signal).then((came) => {
          if (stop.signal.aborted) return;
          if (!came.ok) return setAnswer({ key, picture: null, refused: came.refused });
          const drawn = { url: URL.createObjectURL(came.picture), hasPhone: came.hasPhone };
          keepDrawn(key, drawn);
          setLast(drawn);
          setAnswer({ key, picture: drawn, refused: null });
        });
      },
      wordsDrawn.current === null || wordsDrawn.current === words ? 0 : DRAW_AFTER_MS,
    );
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
    // What is asked is the key's: the plan and the shape are read only as it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wanted, hasWords, atOnce]);
  const answered = answer?.key === key ? answer : null;
  const current = atOnce ?? answered?.picture ?? null;
  const shown = current ?? last;
  return {
    plan,
    shape,
    picture: shown?.url ?? null,
    drawing: wanted && hasWords && !atOnce && !answered,
    undrawn: !!answered && !shown,
    refused: atOnce ? null : (answered?.refused ?? null),
    hasPhone: shown?.hasPhone ?? false,
    change: (part) => setPlan((was) => ({ ...was, ...part })),
    choose: setShape,
  };
}
