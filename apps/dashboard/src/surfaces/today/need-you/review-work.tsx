/**
 * A Google review to answer, as a row of Need you (decision 0071): Ask drafts the reply when asked (POST
 * google/reviews/[id]/draft, a model call, so it is asked for by a press and not on every visit), the member changes it in
 * place, and Post holds it for the reply's grace before it goes public (sends.ts), with Undo the whole of it.
 */
import { useState } from "react";
import { NEED_YOU_WORDS as W, reviewerOf, type GoogleReviewDto } from "@chanlytics/contracts";
import { draftReply, replyToReview } from "@/bridge/google";
import { Button } from "../../kit";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../shell";
import { AskLine } from "./ask-line";
import { Acts, Done, Going, Note, Words, Writing, startKind, whoseWords, type WorkProps } from "./parts";
import { reviewRestKey, useRests } from "./rests";
import { clearSend, holdReviewPost, undoSend, useSend } from "./sends";
import { useRowState } from "./row-state";

/** A review's stars, in the ink: how it landed, at a glance. */
function Stars({ rating }: { rating: number }) {
  return (
    <span className="ny-stars" role="img" aria-label={W.review.stars(rating)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={15} className={n <= rating ? "ny-star-on" : "ny-star-off"} />
      ))}
    </span>
  );
}

/** A review's press: Post once there are words; Write it myself where Ask could not draft it; else Draft a reply. Called, not drawn. */
function reviewEnd(e: {
  main: WorkProps["main"];
  may: boolean;
  ready: boolean;
  words: string;
  failed: boolean;
  writing: boolean;
  post: () => void;
  draft: () => void;
  writeIt: () => void;
}) {
  if (e.ready)
    return (
      <Button variant={e.main} onClick={e.post} disabled={!e.words.trim()} {...gate("approve", "answer a review")}>
        {W.review.post}
      </Button>
    );
  if (e.failed && e.may)
    return (
      <Button variant={e.main} onClick={e.writeIt}>
        {W.writeItMyself}
      </Button>
    );
  return (
    <Button
      variant={e.main}
      onClick={e.draft}
      disabled={e.writing || !e.may}
      aria-busy={e.writing || undefined}
      {...gate("approve", "answer a review")}
    >
      {W.review.draft}
    </Button>
  );
}

/**
 * A review's row work: Draft a reply, the words to change, Post with its grace, or Not today. `keep` holds the row in its
 * place for the visit: a review answered or set aside leaves the next read of the reviews to answer.
 */
export function ReviewWork(
  p: Pick<WorkProps, "main" | "may" | "flash" | "foot" | "whole"> & {
    review: GoogleReviewDto;
    rowId: string;
    keep: () => void;
  },
) {
  const { review, rowId, main, may, flash } = p;
  const who = reviewerOf(review);
  // Kept by the review, not by this part: the row drawn again after the next read says what became of it.
  const [text, setText] = useRowState<string | null>(rowId, "text", null);
  // What Ask drafted, kept beside the words as the member changes them: Use Ask's draft puts it back.
  const [asked, setAsked] = useRowState<string | null>(rowId, "asked", null);
  const [phase, setPhase] = useRowState<"idle" | "writing" | "ready" | "editing" | "aside">(rowId, "phase", "idle");
  const [why, setWhy] = useRowState<string | null>(rowId, "why", null);
  const [postedHere, setPostedHere] = useState(false);
  const { s: send, seconds, share } = useSend(rowId);
  const { rest } = useRests();

  /** Ask's reply, with what the member said to put in it, if they said. */
  const draft = async (instruction?: string) => {
    setPhase("writing");
    setWhy(null);
    const r = await draftReply(review.id, instruction, text ?? undefined);
    if (!r.ok || !r.text) {
      setPhase(text === null ? "idle" : "ready");
      setWhy(r.message || W.couldNot);
      return false;
    }
    setText(r.text);
    setAsked(r.text);
    setPhase("ready");
    return true;
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
    setPhase("aside");
    void rest({ key: reviewRestKey(review.id), flash, onUndone: () => setPhase("idle") });
  };

  if (send?.state === "going")
    return (
      <Going
        line={W.review.postingIn(seconds)}
        sub={W.review.where}
        share={share}
        act={{ label: W.undo, onPress: () => void undoSend(rowId) }}
        takeFocus={postedHere}
        foot={p.foot}
      />
    );
  if (send?.state === "gone") return <Done words={W.review.posted} foot={p.foot} />;
  if (phase === "aside") return <Done tone="rest" words={W.idea.gone} foot={p.foot} />;
  const whose = whoseWords(asked ?? "", text, () => setText(asked));
  return (
    <>
      {p.whole && review.rating ? <Stars rating={review.rating} /> : null}
      {p.whole && review.body ? (
        <div className="ny-said">
          <div className="ny-m" data-from="them">
            {review.body}
          </div>
        </div>
      ) : null}
      {send?.state === "stopped" ? <Note>{W.canceled}</Note> : null}
      {text !== null ? (
        // Typed where they stand, as a reply's are; Write it myself opens them empty, taking the keys.
        <Words
          label={whose.by}
          asks={whose.asks}
          onRestore={whose.onRestore}
          text={text}
          who={who}
          busy={phase === "writing"}
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
      {p.whole && may ? (
        <AskLine
          placeholder={text !== null ? W.say.tell : W.review.say}
          onSay={draft}
          busy={phase === "writing"}
          why={why}
        />
      ) : why ? (
        <Note tone="danger">{why}</Note>
      ) : null}
      {!may ? <Note>{W.viewer}</Note> : null}
      <Acts
        foot={p.foot}
        start={
          <Button variant={startKind(p.foot)} onClick={aside}>
            {W.idea.notToday}
          </Button>
        }
        end={reviewEnd({
          main,
          may,
          ready: text !== null || phase === "editing",
          words: text ?? "",
          failed: !!why,
          writing: phase === "writing",
          post,
          draft: () => void draft(),
          writeIt: () => {
            setWhy(null);
            setText("");
            setPhase("editing");
          },
        })}
      />
    </>
  );
}
