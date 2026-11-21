/**
 * The ad as Meta draws it, for New ad's preview (the Ads plan's 4.6, "The ad as Meta draws it"): Meta's own frame of the
 * version on show, in each place it shows, asked of the workspace's own route (GET ads/preview) once the version's
 * words are written. The route asks for the kept draft's version and answers the picture and the words Meta drew, so
 * Meta's frame is shown only beside the same; any other answer, or none, is Chanlytics' own drawing, which says why.
 *
 * An answer is held for the tab a while, by the version's picture and words: stepping back to a version, or opening New
 * ad again on the same draft, asks Meta nothing twice. Meta's frame lasts a day (its page), so the hold is well inside it.
 */
import { useEffect, useState } from "react";
import { MIN_MS } from "@chanlytics/contracts";
import type { AdPreviewAnswer, AdPreviewFrame, AdPreviewPlace, AdPreviewWhy } from "@/server/ads/preview-shape";
import { read } from "@/bridge/api";

/** The workspace's own route: Meta's preview of one version of the kept draft, or null where no answer came. */
export const askAdPreview = (version: number): Promise<AdPreviewAnswer | null> =>
  read("GET ads/preview", { query: { version } }).catch(() => null);

/** The version on show, as Meta's preview of it is asked for. */
interface MetaPreviewAsk {
  version: number;
  picture: string;
  text: string;
  headline: string;
}

/** What New ad's preview holds of Meta's: nothing asked (and why), asked, or Meta's frames and why one is missing. */
export type MetaPreviewHere =
  | { at: "unasked"; why: AdPreviewWhy | null }
  | { at: "asking" }
  | { at: "answered"; frames: Partial<Record<AdPreviewPlace, AdPreviewFrame>>; why: AdPreviewWhy | null };

/** How long an answer is held for the tab: well inside the day Meta's frame and the picture's address last. */
const HELD_MS = 50 * MIN_MS;
const previewsHeld = new Map<string, { at: number; here: Extract<MetaPreviewHere, { at: "answered" }> }>();

/** One version's own key: its picture and its words, whatever it is numbered. */
const previewKey = (ask: Pick<MetaPreviewAsk, "picture" | "text" | "headline">): string =>
  JSON.stringify([ask.picture, ask.text, ask.headline]);

/** What was held for a version, where it is still fresh. */
function previewHeldFor(key: string, nowMs: number): Extract<MetaPreviewHere, { at: "answered" }> | null {
  const kept = previewsHeld.get(key);
  if (!kept || nowMs - kept.at > HELD_MS) return null;
  return kept.here;
}

/** An answer, read for the version it was asked for: Meta's frames only where it drew that picture and those words. */
function answeredFor(key: string, answer: AdPreviewAnswer | null): Extract<MetaPreviewHere, { at: "answered" }> {
  if (answer === null || answer.drew === null || previewKey(answer.drew) !== key)
    return { at: "answered", frames: {}, why: "busy" };
  return { at: "answered", frames: answer.frames, why: answer.why };
}

/**
 * Meta's preview of the version on show. Nothing is asked where the screen has no way to ask (its source has none),
 * while there are no words, or for a video, whose preview is not Meta's yet.
 */
export function useMetaPreview(
  ask: MetaPreviewAsk | null,
  video: boolean,
  source: ((version: number) => Promise<AdPreviewAnswer | null>) | undefined,
): MetaPreviewHere {
  const key = ask ? previewKey(ask) : null;
  const version = ask?.version ?? null;
  const unaskedFor: AdPreviewWhy | null = !source ? "not_here" : video ? "video" : null;
  const canAsk = unaskedFor === null && key !== null;
  const [here, setHere] = useState<{ key: string; here: MetaPreviewHere } | null>(null);
  useEffect(() => {
    if (!canAsk || key === null || version === null || !source) return undefined;
    const kept = previewHeldFor(key, Date.now());
    if (kept) {
      setHere({ key, here: kept });
      return undefined;
    }
    let live = true;
    setHere({ key, here: { at: "asking" } });
    void source(version).then((answer) => {
      const answered = answeredFor(key, answer);
      // Only Meta's own frames are worth holding: a version Meta did not draw is asked again next time.
      if (Object.keys(answered.frames).length > 0) previewsHeld.set(key, { at: Date.now(), here: answered });
      if (live) setHere({ key, here: answered });
    });
    return () => {
      live = false;
    };
  }, [canAsk, key, version, source]);
  if (!canAsk) return { at: "unasked", why: unaskedFor };
  return here && here.key === key ? here.here : { at: "asking" };
}
