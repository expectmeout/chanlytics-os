/**
 * A post's picture (decision 0099, step 3): one frame, in the shape the picture is, wherever a post is looked at. A new picture is read
 * whole before it is shown, so what is on screen stands until it can give way: the frame glides to the new shape and the new picture
 * fades in over the old, which then goes. A press answers with a picture and never with an empty frame, or with the old one wrongly
 * cropped. The web animations API on the frame itself, cancelled by the next change, and nothing under reduced motion.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PostPicture } from "@chanlytics/contracts";
import { mediaSays } from "../frame-verbs";

/** The frame's glide and the picture's fade, on the house's ease-out (tokens.css --ease-out). */
const FRAME_GLIDE_MS = 240;
const FRAME_FADE_MS = 200;
const FRAME_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

interface Layer {
  src: string;
  shape: PostPicture;
}

/** The picture, read and ready to draw. A browser that can't say when it is ready has it when it has loaded. */
function pictureReady(src: string): Promise<void> {
  const next = new Image();
  return new Promise<void>((resolve, reject) => {
    next.onload = () => resolve();
    next.onerror = () => reject(new Error("no picture"));
    next.src = src;
  }).then(() => next.decode?.().catch(() => {}));
}

interface PostFrameProps {
  src: string | null;
  shape: PostPicture;
  alt: string;
  /** Said while there is no picture yet, to whoever can't see that it is coming. */
  waiting: string;
  /** A newer one is on its way. */
  drawing?: boolean;
  /** This address has no picture: a file deleted since. */
  onUnseen?: () => void;
}

export function PostFrame({ src, shape, alt, waiting, drawing = false, onUnseen }: PostFrameProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<Layer | null>(src ? { src, shape } : null);
  const [was, setWas] = useState<Layer | null>(null);
  const sizeWas = useRef<{ width: number; height: number } | null>(null);
  const unseen = useRef(onUnseen);
  useEffect(() => {
    unseen.current = onUnseen;
  });
  useEffect(() => {
    if (!src || (now?.src === src && now.shape === shape)) return undefined;
    let live = true;
    pictureReady(src).then(
      () => {
        if (!live) return;
        const box = frame.current?.getBoundingClientRect();
        sizeWas.current = box ? { width: box.width, height: box.height } : null;
        setWas(now);
        setNow({ src, shape });
      },
      () => {
        if (live) unseen.current?.();
      },
    );
    return () => {
      live = false;
    };
  }, [src, shape, now]);
  // The first draw of a picture that was asked for on mount is checked too: its <img> says so itself (below).
  useLayoutEffect(() => {
    const box = frame.current;
    const from = sizeWas.current;
    sizeWas.current = null;
    if (!box || !from || !was) return undefined;
    if (mediaSays("(prefers-reduced-motion: reduce)") || typeof box.animate !== "function") {
      setWas(null);
      return undefined;
    }
    box.getAnimations().forEach((a) => a.cancel());
    const to = box.getBoundingClientRect();
    if (Math.abs(to.width - from.width) > 1 || Math.abs(to.height - from.height) > 1)
      box.animate(
        [
          { width: `${from.width}px`, height: `${from.height}px` },
          { width: `${to.width}px`, height: `${to.height}px` },
        ],
        { duration: FRAME_GLIDE_MS, easing: FRAME_EASE },
      );
    const fade = box
      .querySelector('[data-layer="now"]')
      ?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FRAME_FADE_MS, easing: FRAME_EASE });
    const done = () => setWas(null);
    if (fade) fade.finished.then(done, done);
    else done();
    return () => fade?.cancel();
    // Once for each picture that comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);
  if (!now)
    return (
      <div
        className="post-frame post-waiting"
        data-shape={shape}
        role="img"
        aria-label={waiting}
        data-testid="post-waiting"
      />
    );
  return (
    <div
      ref={frame}
      className="post-frame"
      data-shape={now.shape}
      data-drawing={drawing ? "true" : undefined}
      data-testid="post-frame"
    >
      {was ? <img className="post-layer" src={was.src} alt="" data-layer="was" /> : null}
      <img
        className="post-layer"
        src={now.src}
        alt={alt}
        data-layer="now"
        decoding="async"
        onError={() => onUnseen?.()}
        data-testid="post-picture"
      />
    </div>
  );
}
