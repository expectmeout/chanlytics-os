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
import { Acts, Done, Editor, Going, Note, Words, Writing, type WorkProps } from "./parts";
import { reviewNotToday } from "./reviews";
import { clearSend, holdReviewPost, undoSend, useSend } from "./sends";

/** Who wrote a review, as its row names them. */
export const reviewerOf = (r: GoogleReviewDto) => r.author?.trim() || "A Google reviewer";

/**
 * A review's row work: Draft a reply, the words to change, Post with its grace, or Not today. `keep` holds the row in its
 * place for the visit: a review answered or set aside leaves the next read of the reviews to answer.
 */
export function ReviewWork(
  p: Pick<WorkProps, "main" | "may" | "flash"> & { review: GoogleReviewDto; rowId: string; keep: () => void },
) {
  const { review, rowId, main, may, flash } = p;
  const who = reviewerOf(review);
  const [text, setText] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "writing" | "ready" | "editing" | "aside">("idle");
  const [why, setWhy] = useState<string | null>(null);
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
      {phase === "editing" ? (
        <Editor who={who} value={text ?? ""} onChange={setText} />
      ) : text ? (
        <Words
          by={W.review.drafted}
          text={text}
          who={who}
          onEdit={
            may
              ? () => {
                  setPhase("editing");
                  if (send) clearSend(rowId);
                }
              : null
          }
        />
      ) : phase === "writing" ? (
        <Writing />
      ) : null}
      {why ? <Note tone="danger">{why}</Note> : null}
      {!may ? <Note>{W.viewer}</Note> : null}
      <Acts
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
