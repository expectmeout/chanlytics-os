/**
 * A kept post, wherever it is looked at (Ask's card and the Files sheet, decision 0099, step 3): the shapes to choose, and what to do
 * with the one on show. On a phone that is the phone's own sheet, which is also how a picture reaches Photos: a download lands in
 * Files there. How it gets there is post-share.ts's. The shapes are the kit's Button and not its Segmented, which brings Base UI: Ask
 * rides on every page.
 */
import { useEffect, useState } from "react";
import { POST_SHAPES, fileViewOf, type PostShapeName, type PostWords } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { mediaSays } from "../legacy-verbs";
import { PostChoice } from "./post-choice";
import { PostFrame } from "./post-frame";
import { postFileOf, sharePostFile, sharesPictures } from "./post-share";

/** Where a kept post's shape is read from. */
export const postShapeAddress = (id: string, shape: PostShapeName): string => `${fileViewOf(id)}?shape=${shape}`;

/** The shape on show's way out: Share where the device has a sheet, first under a finger; Download everywhere. */
export function PostActs({
  id,
  name,
  shape,
  says,
  children,
}: {
  id: string;
  name: string;
  shape: PostShapeName;
  says: PostWords;
  children?: React.ReactNode;
}) {
  const [canShare] = useState(sharesPictures);
  const [ready, setReady] = useState<{ shape: PostShapeName; file: File | null } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  useEffect(() => {
    if (!canShare) return undefined;
    let live = true;
    void postFileOf(id, name, shape).then((file) => {
      if (live) setReady({ shape, file });
    });
    return () => {
      live = false;
    };
  }, [canShare, id, name, shape]);
  // Undefined while it comes, null where it did not: Share waits for the one and stands aside for the other.
  const file = ready?.shape === shape ? ready.file : undefined;
  const onTouch = mediaSays("(pointer: coarse)");
  const share = () => {
    if (!file) return;
    void sharePostFile(file).then((went) => setSaid(went === "failed" ? says.shareFailed : null));
  };
  const shareIt =
    canShare && file !== null ? (
      <Button
        size="sm"
        variant={onTouch ? "secondary" : "quiet"}
        disabled={!file}
        onClick={share}
        data-testid="post-share"
      >
        {says.share}
      </Button>
    ) : null;
  const downloadIt = (
    <Button
      size="sm"
      variant={shareIt && onTouch ? "quiet" : "secondary"}
      href={`${fileViewOf(id)}?download&shape=${shape}`}
      data-testid="post-download"
    >
      {says.download}
    </Button>
  );
  return (
    <>
      <div className="post-acts">
        {onTouch ? (
          <>
            {shareIt}
            {downloadIt}
          </>
        ) : (
          <>
            {downloadIt}
            {shareIt}
          </>
        )}
        {children}
      </div>
      {said ? (
        <p className="post-said" role="alert" data-testid="post-share-failed">
          {said}
        </p>
      ) : null}
    </>
  );
}

/** A kept post whole, as the Files sheet draws it: Ask's card draws these parts around the picture it already holds. */
export function PostShapes({ id, name, alt, says }: { id: string; name: string; alt: string; says: PostWords }) {
  const [shape, setShape] = useState<PostShapeName>("portrait");
  const [unseen, setUnseen] = useState<PostShapeName | null>(null);
  const seen = unseen !== shape;
  return (
    <div className="post-shapes" data-testid="post-shapes">
      {seen ? (
        <PostFrame
          src={postShapeAddress(id, shape)}
          shape={shape}
          alt={alt}
          waiting={alt}
          onUnseen={() => setUnseen(shape)}
        />
      ) : (
        <p className="post-said" data-testid="post-gone">
          {says.gone}
        </p>
      )}
      <PostChoice
        label={says.shapesSaid}
        options={POST_SHAPES}
        words={says.shapes}
        value={shape}
        choose={setShape}
        testid="post-shape"
      />
      {seen ? <PostActs id={id} name={name} shape={shape} says={says} /> : null}
    </div>
  );
}
