/**
 * TlMedia: an attachment in a thread, for real sessions (moved whole from data-bits.jsx, decision 0015: the kit's one
 * implementation, which seed-globals publishes as window.TlMedia for the pages that still read it).
 *
 * The bytes live in a private bucket; the route answers with a five-minute signed URL by redirect, so an <img>, <audio>
 * or <video> can point straight at it. Without the bridge there is no route, and a seeded thread never carries `media`,
 * so the standalone mockup renders nothing here.
 */
import type { MediaVM } from "@chanlytics/contracts";
import { hasHref, hrefOf } from "../../legacy-verbs";
import { Icon } from "../icon/icon";

export function TlMedia({ media }: { media?: MediaVM | null }) {
  if (!media || !hasHref()) return null;
  if (!media.available) return <div className="tl-media tl-media-missing">Attachment couldn't be saved.</div>;
  const src = hrefOf("GET messages/[id]/media", { id: media.messageId }) ?? undefined;
  if (media.kind === "image") {
    return (
      <a className="tl-media" href={src} target="_blank" rel="noopener noreferrer" title="Open the photo">
        <img src={src} alt={media.caption || "Photo the customer sent"} loading="lazy" />
      </a>
    );
  }
  // A customer's voice note and video come with no captions to give: the player is all there is.
  // eslint-disable-next-line jsx-a11y-x/media-has-caption -- kept as the JSX drew it
  if (media.kind === "audio") return <audio className="tl-media tl-media-audio" controls preload="none" src={src} />;
  if (media.kind === "video")
    // eslint-disable-next-line jsx-a11y-x/media-has-caption -- kept as the JSX drew it
    return <video className="tl-media tl-media-video" controls preload="metadata" src={src} />;
  return (
    <a className="tl-media tl-media-file" href={src} download>
      <Icon name="external" size={12} /> {media.filename || "Download attachment"}
    </a>
  );
}
