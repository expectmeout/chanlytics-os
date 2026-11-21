/**
 * Meta's own frames of the version on show (the Ads plan's 4.6, "The ad as Meta draws it"): one for each place Meta
 * drew, all loading at once so a change of place shows Meta's at once, and the place on show the only one seen. A frame
 * is seen once it has loaded; until then, or where it never does, New ad's own drawing stands in its place
 * (shown.tsx), so nothing jumps while Meta draws.
 *
 * Each frame is the address Meta's answer named, held to Meta's own preview page by the edge, never Meta's HTML as it
 * came; it runs Meta's own page apart from New ad's, and may open nothing over it.
 */
import { useEffect } from "react";
import { SECOND_MS } from "@chanlytics/contracts";
import type { AdPreviewFrame, AdPreviewPlace } from "@/server/ads/preview-shape";
import { NEW } from "./words";

/** How long a frame of Meta's may take to load before New ad says Meta didn't answer. */
const FRAME_LATE_MS = 15 * SECOND_MS;

/** What Meta's page in a frame may do: run its own page, and open a page of Meta's apart from New ad. */
const FRAME_MAY = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";

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
  useEffect(() => {
    if (loaded) return undefined;
    const late = setTimeout(() => onLate(src), FRAME_LATE_MS);
    return () => clearTimeout(late);
  }, [src, loaded, onLate]);
  return (
    <div className="ads-new-meta" data-place={place} data-on={on && loaded ? "yes" : "no"}>
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
