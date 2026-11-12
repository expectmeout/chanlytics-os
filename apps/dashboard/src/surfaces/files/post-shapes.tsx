/**
 * A kept post's way out (decision 0099, step 3): what to do with the shape on show, which Ask's card draws under the picture it
 * already holds (PostActs). On a phone that is the phone's own sheet, which is also how a picture reaches Photos: a download lands in
 * Files there. How it gets there is post-share.ts's. The shapes are the kit's Button and not its Segmented, which brings Base UI: Ask
 * rides on every page.
 */
import { useEffect, useState } from "react";
import { fileViewOf, type PostShapeName, type PostWords } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { mediaSays } from "../frame-verbs";
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
