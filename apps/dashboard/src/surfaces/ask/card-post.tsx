/**
 * A post's card (decision 0099, step 3): the real picture, drawn by the server from the same plan its Save keeps, so what the owner
 * sees is what they get. Before the press it is asked for once a tab; after it, it is the file itself, as the Files sheet draws it.
 */
import { useEffect, useState } from "react";
import { POST_WORDS, postNameOf, postPlanOf, type AskProposal } from "@chanlytics/contracts";
import { PostShapes } from "../settings/files/post-shapes";
import { askCalls } from "./shell";
import type { LineWords } from "./words";

/** The pictures this tab has been shown, by card: a thread drawn again does not draw them again on the server. */
const picturesShown = new Map<string, Promise<string | null>>();

function postPictureOf(p: AskProposal): Promise<string | null> {
  const held = picturesShown.get(p.id);
  if (held) return held;
  const A = askCalls();
  const asked = A
    ? A.postPicture(postPlanOf(p.payload)).then((blob) => (blob ? URL.createObjectURL(blob) : null))
    : Promise.resolve(null);
  picturesShown.set(p.id, asked);
  return asked;
}

/** The card's picture: the real one before the press, the file itself after it. */
export function AskPostCard({ p, t }: { p: AskProposal; t: LineWords }) {
  const kept = p.outcome?.state === "done" ? (p.outcome.made?.id ?? null) : null;
  const [picture, setPicture] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (kept) return undefined;
    let live = true;
    void postPictureOf(p).then((address) => {
      if (!live) return;
      setPicture(address);
      setFailed(!address);
    });
    return () => {
      live = false;
    };
    // The card's id is the plan's: a card is never asked for another picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, kept]);
  const summary = <p className="ask-card-summary">{p.summary}</p>;
  if (kept)
    return (
      <div className="ask-post" data-testid="ask-post">
        <PostShapes id={kept} name={postNameOf(asTitle(p))} alt={asTitle(p)} shareFailed={t.postShareFailed}>
          {summary}
        </PostShapes>
      </div>
    );
  return (
    <div className="ask-post" data-testid="ask-post">
      {picture ? (
        <img className="ask-post-picture" src={picture} alt={asTitle(p)} data-testid="ask-post-picture" />
      ) : failed ? (
        <p className="ask-card-note" data-testid="ask-post-failed">
          {POST_WORDS.notDrawn}
        </p>
      ) : (
        <div className="ask-post-picture ask-post-waiting" role="img" aria-label={t.postDrawing} />
      )}
      {summary}
    </div>
  );
}

const asTitle = (p: AskProposal): string => (typeof p.payload.line === "string" ? p.payload.line : p.title);
