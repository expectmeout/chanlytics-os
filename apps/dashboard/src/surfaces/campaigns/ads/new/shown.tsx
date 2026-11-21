/**
 * The ad as it will look (the Ads plan's 4.6): Meta's own preview once the ad account is connected (meta-frame.tsx,
 * meta-preview.ts), the place on show loaded first and the others after it, and where Meta's can't be had, drawn by
 * Chanlytics in a neutral frame, saying so and why in one line, never a platform's own chrome. The Page it runs as,
 * the version's text and headline, the picture whole in its own shape (Ads never crops), and the press a person sees.
 * "1 of 3 versions" steps through the three the writer wrote, each its own ad at Meta. A story and a Reel show the
 * same picture whole in their taller frame, inside the room Meta keeps clear.
 *
 * While the words are being written the three are at work beside "AI is writing…": the mark is the one moving thing,
 * and the words stand still.
 */
import { useCallback, useEffect, useState } from "react";
import type { AdPreviewAnswer, AdPreviewFrame, AdPreviewPlace } from "@/server/ads/preview-shape";
import { AskFace } from "../../../kit/face/ask-face";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Segmented } from "../../../kit/segmented/segmented";
import { MetaFrame } from "./meta-frame";
import { useMetaPreview, type MetaPreviewHere } from "./meta-preview";
import type { NewAdVM } from "./model";
import { NEW } from "./words";

type Face = AdPreviewPlace;

const FACES: readonly { value: Face; label: string }[] = [
  { value: "feed", label: NEW.shown.feed },
  { value: "story", label: NEW.shown.story },
  { value: "reel", label: NEW.shown.reel },
];

/** The picture, whole; where it cannot be drawn, or the draft has none of its own, a plain tile in its place. */
function Picture({ picture }: { picture: NewAdVM["shown"]["picture"] }) {
  const [broken, setBroken] = useState(false);
  if (picture.src === null || broken)
    return (
      <div className="ads-photo ads-new-plain" role="img" aria-label={picture.alt}>
        <Icon name={picture.video ? "play" : "content"} size={22} />
      </div>
    );
  return (
    <img
      className="ads-new-pic"
      src={picture.src}
      alt={picture.alt}
      decoding="async"
      onError={() => setBroken(true)}
      data-testid="ads-new-picture"
    />
  );
}

/** The words of the version on show, or what stands in their place while there are none. */
function Words({ shown }: { shown: NewAdVM["shown"] }) {
  if (shown.waiting === "writing")
    return (
      <p className="ads-new-writing" role="status" data-testid="ads-new-writing">
        <AskFace className="ads-new-three" />
        {NEW.shown.writing}
      </p>
    );
  if (shown.waiting === "none")
    return (
      <p className="ads-new-writing" data-testid="ads-new-no-words">
        {NEW.shown.noWords}
      </p>
    );
  return (
    <p className="ads-frame-text" data-testid="ads-new-text">
      {shown.text}
    </p>
  );
}

function Who({ page }: { page: string }) {
  return (
    <div className="ads-frame-top">
      <span className="ads-frame-name">{page}</span>
      <span className="ads-frame-ad">
        {NEW.shown.page} · {NEW.shown.ad}
      </span>
    </div>
  );
}

function Press() {
  return (
    <span className="ads-capsule">
      <Icon name="chat" size={13} />
      {NEW.shown.cta}
    </span>
  );
}

interface ShownProps {
  shown: NewAdVM["shown"];
  onNext: () => void;
  /** Meta's own preview of a version, where New ad's source can ask for one. */
  preview?: ((version: number) => Promise<AdPreviewAnswer | null>) | undefined;
}

/** The version on show, as Meta's preview of it is asked for; null while there are no words. */
const versionAsked = (shown: NewAdVM["shown"]) =>
  shown.asks && shown.text && shown.headline ? { ...shown.asks, text: shown.text, headline: shown.headline } : null;

/** The one line under the ad: whose preview it is, and where it is Chanlytics', why. */
function shownLine(meta: MetaPreviewHere, frame: { loaded: boolean; late: boolean } | null): string {
  if (meta.at === "unasked") return meta.why === "video" ? NEW.shown.not.video : NEW.shown.drawn;
  if (meta.at === "asking") return NEW.shown.asking;
  if (frame) return frame.loaded ? NEW.shown.meta : frame.late ? NEW.shown.not.busy : NEW.shown.asking;
  return !meta.why || meta.why === "not_here" ? NEW.shown.drawn : NEW.shown.not[meta.why];
}

/** Which of Meta's frames have loaded, and which took too long: each by its address. */
function useFramesHeard() {
  const [loaded, setLoaded] = useState<readonly string[]>([]);
  const [late, setLate] = useState<readonly string[]>([]);
  const onLoaded = useCallback((src: string) => setLoaded((was) => (was.includes(src) ? was : [...was, src])), []);
  const onLate = useCallback((src: string) => setLate((was) => (was.includes(src) ? was : [...was, src])), []);
  return { loaded, late, onLoaded, onLate };
}

/**
 * Which of Meta's frames have begun to load, each by its address: the place on show at once, and the others once it
 * has loaded or run late (or where Meta drew none for it), so a phone draws the one being looked at before it fetches
 * the rest, and a change of place still finds Meta's there. A frame that has begun stays.
 */
function useFramesBegun(
  frames: Partial<Record<Face, AdPreviewFrame>>,
  face: Face,
  settled: boolean,
): readonly string[] {
  const [begun, setBegun] = useState<readonly string[]>([]);
  const onShow = frames[face]?.src ?? null;
  const wanted = FACES.flatMap(({ value }) => {
    const src = frames[value]?.src;
    return src && (src === onShow || settled || onShow === null) ? [src] : [];
  }).join(" ");
  useEffect(() => {
    const more = wanted ? wanted.split(" ") : [];
    setBegun((was) => (more.every((src) => was.includes(src)) ? was : [...new Set([...was, ...more])]));
  }, [wanted]);
  return onShow === null || begun.includes(onShow) ? begun : [...begun, onShow];
}

export function AdShown({ shown, onNext, preview }: ShownProps) {
  const [face, setFace] = useState<Face>("feed");
  const meta = useMetaPreview(versionAsked(shown), shown.picture.video, preview);
  const heard = useFramesHeard();
  const frames = meta.at === "answered" ? meta.frames : {};
  const frame = frames[face] ?? null;
  const loaded = frame !== null && heard.loaded.includes(frame.src);
  const late = frame !== null && heard.late.includes(frame.src);
  const begun = useFramesBegun(frames, face, loaded || late);
  const headline = shown.headline ? <p className="ads-frame-head">{shown.headline}</p> : null;
  return (
    <section className="ads-new-shown" aria-label={NEW.shown.label} data-testid="ads-new-shown">
      <div className="ads-new-faces">
        <Segmented label={NEW.shown.faces} value={face} onValueChange={setFace} options={FACES} />
        {shown.steps ? (
          <LinkButton
            onClick={onNext}
            aria-label={`${shown.count}. ${NEW.shown.nextVersion}`}
            data-testid="ads-new-next"
          >
            {shown.count} <Icon name="chevron" size={12} />
          </LinkButton>
        ) : (
          <span className="ads-new-count" data-testid="ads-new-count">
            {shown.count}
          </span>
        )}
      </div>
      {FACES.map(({ value, label }) => {
        const one = frames[value];
        return one && begun.includes(one.src) ? (
          <MetaFrame
            key={one.src}
            place={value}
            label={label}
            frame={one}
            on={value === face}
            loaded={heard.loaded.includes(one.src)}
            onLoaded={heard.onLoaded}
            onLate={heard.onLate}
          />
        ) : null;
      })}
      {loaded ? null : face === "feed" ? (
        <figure className="ads-frame ads-new-frame" data-kind="feed-whole">
          <Who page={shown.page} />
          <Words shown={shown} />
          <Picture picture={shown.picture} />
          {headline}
          <Press />
        </figure>
      ) : (
        <figure className="ads-frame ads-new-frame" data-kind={face}>
          <div className="ads-new-tall">
            <Picture picture={shown.picture} />
          </div>
          <div className="ads-safe">
            <Who page={shown.page} />
            <Words shown={shown} />
            <Press />
          </div>
        </figure>
      )}
      <p className="ads-drawn" role="status" data-testid="ads-new-shown-line">
        {shownLine(meta, frame ? { loaded, late } : null)}
      </p>
    </section>
  );
}
