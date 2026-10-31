/**
 * A Google review to answer, as a row of Need you (decision 0071): Ask drafts the reply when asked (POST
 * google/reviews/[id]/draft, a model call, so it is asked for by a press and not on every visit), the member changes it in
 * place, and Post holds it for the reply's grace before it goes public (sends.ts), with Undo the whole of it.
 */
import { useState } from "react";
import { NEED_YOU_WORDS as W, type GoogleReviewDto } from "@chanlytics/contracts";
import { draftReply, replyToReview } from "@/legacy-bridge/google";
import { Button } from "../../kit";
import { gate } from "../shell";
import { Acts, Done, Going, Note, Words, Writing, whoseWords, type WorkProps } from "./parts";
import { reviewNotToday } from "./reviews";
import { clearSend, holdReviewPost, undoSend, useSend } from "./sends";
import { useRowState } from "./row-state";

/** Who wrote a review, as its row names them. */
export const reviewerOf = (r: GoogleReviewDto) => r.author?.trim() || "A Google reviewer";

/**
 * A review's row work: Draft a reply, the words to change, Post with its grace, or Not today. `keep` holds the row in its
 * place for the visit: a review answered or set aside leaves the next read of the reviews to answer.
 */
export function ReviewWork(
  p: Pick<WorkProps, "main" | "may" | "flash" | "foot"> & { review: GoogleReviewDto; rowId: string; keep: () => void },
) {
  const { review, rowId, main, may, flash } = p;
  const who = reviewerOf(review);
  // Kept by the review, not by this part: Ask found on a phone draws it in a sheet, and its card says what became of it.
  const [text, setText] = useRowState<string | null>(rowId, "text", null);
  // What Ask drafted, kept beside the words as the member changes them: Use Ask's draft puts it back.
  const [asked, setAsked] = useRowState<string | null>(rowId, "asked", null);
  const [phase, setPhase] = useRowState<"idle" | "writing" | "ready" | "editing" | "aside">(rowId, "phase", "idle");
  const [why, setWhy] = useRowState<string | null>(rowId, "why", null);
  const [postedHere, setPostedHere] = useState(false);
  const { s: send, seconds, share } = useSend(rowId);

  const draft = async () => {
    setPhase("writing");
    setWhy(null);
    const r = await draftReply(review.id);
    if (!r.ok || !r.text) {
      setPhase("idle");
      setWhy(r.message || W.couldNot);
      return;
    }
    setText(r.text);
    setAsked(r.text);
    setPhase("ready");
  };
  const post = () => {
    const words = (text ?? "").trim();
    if (!words) return;
    p.keep();
    holdReviewPost(rowId, {
      who,
      post: (asTabGoes) =>
        replyToReview(review.id, words, asTabGoes).then((r) => {
          if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
          return r.ok;
        }),
    });
    setPostedHere(true);
  };
  const aside = () => {
    p.keep();
    reviewNotToday(review.id);
    setPhase("aside");
  };

  if (send?.state === "going")
    return (
      <Going
        line={W.review.postingIn(seconds)}
        sub={W.review.where}
        share={share}
        act={{ label: W.undo, onPress: () => void undoSend(rowId) }}
        takeFocus={postedHere}
      />
    );
  if (send?.state === "gone") return <Done words={W.review.posted} />;
  if (phase === "aside") return <Done tone="rest" words={W.idea.gone} />;
  return (
    <>
      {send?.state === "stopped" ? <Note>{W.canceled}</Note> : null}
      {text !== null ? (
        // Typed where they stand, as a reply's are; Write it myself opens them empty, taking the keys.
        <Words
          what={W.review.drafted}
          {...whoseWords(asked ?? "", text, () => setText(asked))}
          text={text}
          who={who}
          onChange={
            may
              ? (words) => {
                  setText(words);
                  if (send) clearSend(rowId);
                }
              : null
          }
          open={phase === "editing"}
        />
      ) : phase === "writing" ? (
        <Writing />
      ) : null}
      {why ? <Note tone="danger">{why}</Note> : null}
      {!may ? <Note>{W.viewer}</Note> : null}
      <Acts
        foot={p.foot}
        start={
          <Button variant="quiet" onClick={aside}>
            {W.idea.notToday}
          </Button>
        }
        end={
          text !== null || phase === "editing" ? (
            <Button
              variant={main}
              onClick={post}
              disabled={!(text ?? "").trim()}
              {...gate("approve", "answer a review")}
            >
              {W.review.post}
            </Button>
          ) : why && may ? (
            // Ask could not draft it: the member writes it, as on a reply's row.
            <Button
              variant={main}
              onClick={() => {
                setWhy(null);
                setText("");
                setPhase("editing");
              }}
            >
              {W.writeItMyself}
            </Button>
          ) : (
            <Button
              variant={main}
              onClick={() => void draft()}
              disabled={phase === "writing" || !may}
              aria-busy={phase === "writing" || undefined}
              {...gate("approve", "answer a review")}
            >
              {W.review.draft}
            </Button>
          )
        }
      />
    </>
  );
}
