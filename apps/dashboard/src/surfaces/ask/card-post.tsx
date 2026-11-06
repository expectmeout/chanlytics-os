/**
 * A post's card (decision 0099, step 3): the real picture, drawn by the server from the same plan its Save keeps, so what the owner
 * sees is what they get. Before the press it is asked for once a tab; after it, it is the file itself, each shape to download,
 * and on a phone the phone's own sheet to Instagram or wherever they post.
 */
import { useEffect, useState } from "react";
import {
  POST_SHAPES,
  POST_WORDS,
  fileViewOf,
  postPlanOf,
  type AskProposal,
  type PostShapeName,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { askCalls, mediaSays } from "./shell";
import type { LineWords } from "./words";

/** The pictures this tab has been picturesShown, by card: a thread drawn again does not draw them again on the server. */
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

/** The address of a kept post's shape, to download under its name. */
const shapeAddress = (id: string, shape: PostShapeName): string => `${fileViewOf(id)}?download&shape=${shape}`;

/** Through the phone's own sheet, where it takes a file; nothing else is asked of the person or of Instagram. */
async function sharePost(id: string, name: string, shape: PostShapeName): Promise<boolean> {
  const res = await fetch(shapeAddress(id, shape));
  if (!res.ok) return false;
  const file = new File([await res.blob()], `${name}.jpg`, { type: "image/jpeg" });
  if (!navigator.canShare?.({ files: [file] })) return false;
  await navigator.share({ files: [file] });
  return true;
}

/** What a kept post offers: each shape, and on a phone its sheet. */
function PostKept({ id, name, t }: { id: string; name: string; t: LineWords }) {
  const [said, setSaid] = useState<string | null>(null);
  const canShare = mediaSays("(max-width: 720px)") && typeof navigator.canShare === "function";
  return (
    <div className="ask-post-kept" data-testid="ask-post-kept">
      {canShare ? (
        <Button
          size="sm"
          onClick={() =>
            void sharePost(id, name, "portrait").then(
              (went) => setSaid(went ? null : t.postShareFailed),
              () => setSaid(null),
            )
          }
          data-testid="ask-post-share"
        >
          {POST_WORDS.share}
        </Button>
      ) : null}
      {POST_SHAPES.map((shape) => (
        <Button key={shape} variant="quiet" size="sm" href={shapeAddress(id, shape)} data-testid={`ask-post-${shape}`}>
          {POST_WORDS.shapes[shape]}
        </Button>
      ))}
      {said ? <p className="ask-card-foot">{said}</p> : null}
    </div>
  );
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
  const src = kept ? `${fileViewOf(kept)}?w=1280` : picture;
  return (
    <div className="ask-post" data-testid="ask-post">
      {src ? (
        <img className="ask-post-picture" src={src} alt={asTitle(p)} data-testid="ask-post-picture" />
      ) : failed ? (
        <p className="ask-card-note" data-testid="ask-post-failed">
          {POST_WORDS.notDrawn}
        </p>
      ) : (
        <div className="ask-post-picture ask-post-waiting" role="img" aria-label={t.postDrawing} />
      )}
      <p className="ask-card-summary">{p.summary}</p>
      {kept ? <PostKept id={kept} name={kept} t={t} /> : null}
    </div>
  );
}

const asTitle = (p: AskProposal): string => (typeof p.payload.line === "string" ? p.payload.line : p.title);
