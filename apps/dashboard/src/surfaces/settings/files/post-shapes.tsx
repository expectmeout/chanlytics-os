/**
 * A kept post, wherever it is looked at (Ask's card and the Files sheet, decision 0099, step 3): the picture in the shape chosen,
 * the shapes, and what to do with it. On a phone that is the phone's own sheet, which is also how a picture reaches Photos: a
 * download lands in Files there.
 *
 * Safari lets a page open that sheet only inside the tap itself, and one that waits on the network first works or not by how fast
 * the network is. So the picture is here before the tap, and the tap asks for nothing. The shapes are the kit's Button and not its
 * Segmented, which brings Base UI: Ask rides on every page.
 */
import { useEffect, useState, type ReactNode } from "react";
import { POST_SHAPES, POST_WORDS, fileViewOf, type PostShapeName } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { mediaSays } from "../../legacy-verbs";
import { fileVerbs } from "./verbs";
import "./post-shapes.css";

/** Whether this device hands a picture to a sheet of its own: asked of the device, never of how wide it is. */
export function sharesPictures(): boolean {
  try {
    return navigator.canShare?.({ files: [new File(["post"], "post.jpg", { type: "image/jpeg" })] }) === true;
  } catch {
    return false;
  }
}

const fetched = new Map<string, Promise<File | null>>();

/** A shape's picture as the file the sheet is handed, under a name a person can read, asked for once a tab. */
export function postFileOf(id: string, name: string, shape: PostShapeName): Promise<File | null> {
  const key = `${id}:${shape}`;
  const already = fetched.get(key);
  if (already) return already;
  const asked = fileVerbs.shape(id, shape).then((blob) => {
    if (blob) return new File([blob], `${name}-${shape}.jpg`, { type: "image/jpeg" });
    // The next look asks again: a phone between masts is back in seconds.
    fetched.delete(key);
    return null;
  });
  fetched.set(key, asked);
  return asked;
}

/** The sheet, opened in the tap's own turn, so nothing here may wait first. A person closing it is no failure. */
export function sharePostFile(file: File): Promise<"went" | "closed" | "failed"> {
  return navigator.share({ files: [file] }).then(
    () => "went" as const,
    (e: unknown) => (e instanceof DOMException && e.name === "AbortError" ? ("closed" as const) : ("failed" as const)),
  );
}

interface PostShapesProps {
  id: string;
  /** What the file goes by, for the name it is shared under. */
  name: string;
  alt: string;
  /** Said where the sheet would not open, in the words of where it is drawn. */
  shareFailed: string;
  /** What stands between the picture and its presses. */
  children?: ReactNode;
}

export function PostShapes({ id, name, alt, shareFailed, children }: PostShapesProps) {
  const [shape, setShape] = useState<PostShapeName>("portrait");
  const [canShare] = useState(sharesPictures);
  const [ready, setReady] = useState<{ shape: PostShapeName; file: File | null } | null>(null);
  const [unseen, setUnseen] = useState<PostShapeName | null>(null);
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
  const seen = unseen !== shape;
  const onTouch = mediaSays("(pointer: coarse)");
  const share = () => {
    if (!file) return;
    void sharePostFile(file).then((went) => setSaid(went === "failed" ? shareFailed : null));
  };
  const shareIt =
    canShare && seen && file !== null ? (
      <Button
        size="sm"
        variant={onTouch ? "secondary" : "quiet"}
        disabled={!file}
        onClick={share}
        data-testid="post-share"
      >
        {POST_WORDS.share}
      </Button>
    ) : null;
  const downloadIt = seen ? (
    <Button
      size="sm"
      variant={shareIt && onTouch ? "quiet" : "secondary"}
      href={`${fileViewOf(id)}?download&shape=${shape}`}
      data-testid="post-download"
    >
      {POST_WORDS.download}
    </Button>
  ) : null;
  return (
    <div className="post-shapes" data-testid="post-shapes">
      {seen ? (
        <img
          className="post-picture"
          data-shape={shape}
          src={`${fileViewOf(id)}?shape=${shape}`}
          alt={alt}
          decoding="async"
          onError={() => setUnseen(shape)}
          data-testid="post-picture"
        />
      ) : (
        <p className="post-gone" data-testid="post-gone">
          {POST_WORDS.gone}
        </p>
      )}
      {children}
      <div className="post-choose" role="group" aria-label={POST_WORDS.shapesSaid}>
        {POST_SHAPES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === shape ? "soft" : "quiet"}
            aria-pressed={s === shape}
            onClick={() => {
              setShape(s);
              setSaid(null);
            }}
            data-testid={`post-shape-${s}`}
          >
            {POST_WORDS.shapes[s]}
          </Button>
        ))}
      </div>
      {seen ? (
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
        </div>
      ) : null}
      {said ? (
        <p className="post-gone" role="alert" data-testid="post-share-failed">
          {said}
        </p>
      ) : null}
    </div>
  );
}
