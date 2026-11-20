/**
 * The ad as it will look (the Ads plan's 4.6): drawn by Chanlytics in a neutral frame, and saying so, never a
 * platform's own chrome. The Page it runs as, the version's text and headline, the picture whole in its own shape
 * (Ads never crops), and the press a person sees. "1 of 3 versions" steps through the three the writer wrote, each
 * its own ad at Meta. A story and a Reel show the same picture whole in their taller frame, inside the room Meta
 * keeps clear.
 *
 * While the words are being written the three are at work beside "AI is writing…": the mark is the one moving thing,
 * and the words stand still.
 */
import { useState } from "react";
import { AskFace } from "../../../kit/face/ask-face";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Segmented } from "../../../kit/segmented/segmented";
import type { NewAdVM } from "./model";
import { NEW } from "./words";

type Face = "feed" | "story" | "reel";

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
      <div className="ads-photo ads-new-tile" role="img" aria-label={picture.alt}>
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
}

export function AdShown({ shown, onNext }: ShownProps) {
  const [face, setFace] = useState<Face>("feed");
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
      {face === "feed" ? (
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
      <p className="ads-drawn">{NEW.shown.drawn}</p>
    </section>
  );
}
