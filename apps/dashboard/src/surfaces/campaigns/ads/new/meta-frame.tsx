/**
 * Meta's own frames of the version on show (the Ads plan's 4.6, "The ad as Meta draws it"): one for each place Meta
 * drew, the place on show the only one seen. A frame is seen once it has loaded; until then, or where it never does,
 * New ad's own drawing stands in its place (shown.tsx), so nothing jumps while Meta draws.
 *
 * Each frame is the address Meta's answer named, held to Meta's own preview page by the edge, never Meta's HTML as it
 * came; it runs Meta's own page apart from New ad's, and may open nothing over it.
 *
 * A frame is the size Meta's page draws the place at (the edge says it), and Meta's page never narrows below that. So
 * where New ad has less room than the frame is wide, on a narrow phone, the frame is shrunk whole to the room, the ad
 * in it as Meta drew it and smaller, never cut at its edge.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { SECOND_MS } from "@chanlytics/contracts";
import type { AdPreviewFrame, AdPreviewPlace } from "@/server/ads/preview-shape";
import { NEW } from "./words";

/** How long a frame of Meta's may take to load before New ad says Meta didn't answer. */
const FRAME_LATE_MS = 15 * SECOND_MS;

/** What Meta's page in a frame may do: run its own page, and open a page of Meta's apart from New ad. */
const FRAME_MAY = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";

/** How much of its own size a frame is drawn at: whole where the room holds it, else shrunk to the room's width. */
const frameFit = (roomWidth: number, frameWidth: number): number =>
  roomWidth > 0 && frameWidth > roomWidth ? roomWidth / frameWidth : 1;

/**
 * The frame's box, kept to the room New ad has for it: its parent's width is measured, and the box told how much of
 * its own size to draw at and the room that takes (new.css reads the three). A frame with no size of its own is left
 * as it is.
 */
function useFrameFit(width: number | null, height: number | null): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    const room = box?.parentElement;
    if (!box || !room || width === null || height === null) return undefined;
    const fit = () => {
      const by = frameFit(room.clientWidth, width);
      box.style.setProperty("--ads-meta-fit", String(by));
      box.style.setProperty("--ads-meta-wide", `${Math.floor(width * by)}px`);
      box.style.setProperty("--ads-meta-tall", `${Math.ceil(height * by)}px`);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return undefined;
    const watching = new ResizeObserver(fit);
    watching.observe(room);
    return () => watching.disconnect();
  }, [width, height]);
  return ref;
}

interface FrameProps {
  place: AdPreviewPlace;
  /** The place's name, as New ad's switch says it. */
  label: string;
  frame: AdPreviewFrame;
  /** Whether this is the place on show, and whether its frame has loaded. */
  on: boolean;
  loaded: boolean;
  onLoaded: (src: string) => void;
  onLate: (src: string) => void;
}

/** One place's frame of Meta's: seen only where it is the place on show and has loaded. */
export function MetaFrame({ place, label, frame, on, loaded, onLoaded, onLate }: FrameProps) {
  const { src } = frame;
  const box = useFrameFit(frame.width, frame.height);
  useEffect(() => {
    if (loaded) return undefined;
    const late = setTimeout(() => onLate(src), FRAME_LATE_MS);
    return () => clearTimeout(late);
  }, [src, loaded, onLate]);
  return (
    <div ref={box} className="ads-new-meta" data-place={place} data-on={on && loaded ? "yes" : "no"}>
      <iframe
        className="ads-new-meta-frame"
        src={src}
        title={NEW.shown.metaFrame(label)}
        {...(frame.width === null ? {} : { width: frame.width })}
        {...(frame.height === null ? {} : { height: frame.height })}
        sandbox={FRAME_MAY}
        referrerPolicy="no-referrer"
        onLoad={() => onLoaded(src)}
        data-testid={`ads-new-meta-${place}`}
      />
    </div>
  );
}
