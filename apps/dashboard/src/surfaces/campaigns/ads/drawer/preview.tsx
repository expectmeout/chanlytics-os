/**
 * How an ad reads (MOCKUP): the ad as a person sees it, drawn by Chanlytics in a neutral frame (never a platform's own
 * chrome), then what happens when they tap, call or send the form. A feed ad is a 4:5 frame, and a Story or a Reel a 9:16
 * one with the platform's safe zones faintly inset (top 14%, bottom 35%, sides 6%); a Google ad is a search result of three
 * headlines joined by " | " and two lines, no stars and no coloured link; a TikTok ad is a 9:16 video with its words. Under it,
 * the chat a tap opens (`ChatStart`: the business's greeting, the message ready for them as grey text in a composer row,
 * and an example reply), the call, or the form with its consent box unticked. Placeholder photos are flat tiles.
 * The drawer folds it under its first words (parts/preview-fold.tsx); New ad draws it in its second step.
 */
import { useState } from "react";
import type { AdDoor } from "@chanlytics/contracts";
import { PREVIEW, SHOWN } from "@chanlytics/contracts/ads-page";
import type { PreviewVM, ThreadVM } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { Segmented } from "../../../kit/segmented/segmented";
import { MessagePreview } from "../../parts/message-preview";

/** The shapes a Meta feed ad is shown in. */
export type FrameKind = "feed" | "story" | "reel";

const FRAME_KINDS: readonly FrameKind[] = ["feed", "story", "reel"];

/** A neutral glyph for what the capsule asks of a person. */
const CAPSULE_GLYPH: Record<AdDoor, string> = { whatsapp: "chat", call: "phone", form: "list" };

/** The capsule under the ad: what it asks, in the platform's wording (which can differ by locale). */
function Capsule({ preview }: { preview: PreviewVM }) {
  return (
    <span className="ads-capsule" data-testid="ads-capsule">
      <Icon name={CAPSULE_GLYPH[preview.door]} size={13} />
      {preview.cta}
    </span>
  );
}

function Who({ business }: { business: string }) {
  return (
    <div className="ads-frame-top">
      <span className="ads-frame-name">{business}</span>
      <span className="ads-frame-ad">{SHOWN.adWord}</span>
    </div>
  );
}

function Copy({ preview }: { preview: PreviewVM }) {
  return (
    <div className="ads-frame-copy">
      <p className="ads-frame-text">{preview.text}</p>
      {preview.headline ? <p className="ads-frame-head">{preview.headline}</p> : null}
    </div>
  );
}

/** A flat tile where the photo (or the video) goes. */
function Photo({ label, glyph }: { label: string; glyph: string }) {
  return (
    <div className="ads-photo" role="img" aria-label={label}>
      <Icon name={glyph} size={22} />
    </div>
  );
}

/** A Facebook or Instagram ad: in the feed, 4:5, or a Story or a Reel, 9:16 with its safe zone. */
function FeedFrame({ preview, kind }: { preview: PreviewVM; kind: FrameKind }) {
  const photo = <Photo label={SHOWN.photo} glyph="content" />;
  if (kind === "feed") {
    return (
      <figure className="ads-frame" data-kind="feed">
        <Who business={preview.business} />
        {photo}
        <Copy preview={preview} />
        <Capsule preview={preview} />
      </figure>
    );
  }
  return (
    <figure className="ads-frame" data-kind={kind}>
      {photo}
      <div className="ads-safe">
        <Who business={preview.business} />
        <Copy preview={preview} />
        <Capsule preview={preview} />
      </div>
    </figure>
  );
}

/** A Google result: the business and its path, the headlines joined by " | ", two lines, and the call capsule. */
function SearchFrame({ preview }: { preview: PreviewVM }) {
  return (
    <figure className="ads-frame" data-kind="search">
      <Who business={preview.business} />
      <p className="ads-frame-path">{preview.path}</p>
      <p className="ads-frame-head">{preview.headline}</p>
      {preview.lines.map((line) => (
        <p key={line} className="ads-frame-text">
          {line}
        </p>
      ))}
      <Capsule preview={preview} />
    </figure>
  );
}

/** A TikTok ad: a vertical video, its words and its capsule inside the safe zone. */
function VideoFrame({ preview }: { preview: PreviewVM }) {
  return (
    <figure className="ads-frame" data-kind="video">
      <Photo label={SHOWN.video} glyph="play" />
      <div className="ads-safe">
        <Who business={preview.business} />
        <Copy preview={preview} />
        <Capsule preview={preview} />
      </div>
    </figure>
  );
}

function AdFrame({ preview, kind }: { preview: PreviewVM; kind: FrameKind }) {
  if (preview.frame === "search") return <SearchFrame preview={preview} />;
  if (preview.frame === "video") return <VideoFrame preview={preview} />;
  return <FeedFrame preview={preview} kind={kind} />;
}

interface ChatStartProps {
  /** The business's first message in the chat a tap opens. */
  greeting: string;
  /** The message ready for them, shown as grey text in a composer row: not yet sent. */
  ready?: string | null;
  /** The questions they can pick instead (up to three). */
  questions?: readonly string[];
  /** An example reply, written from Services and Hours. */
  reply?: string | null;
}

/** The chat a tap on a WhatsApp ad opens, as the person sees it before they send anything. */
function ChatStart({ greeting, ready = null, questions = [], reply = null }: ChatStartProps) {
  return (
    <div className="ads-chat" data-testid="ads-chat">
      <MessagePreview body={greeting} bare testid="ads-chat-greeting" />
      {questions.length > 0 ? (
        <ul className="ads-quick" aria-label={PREVIEW.tap}>
          {questions.map((question) => (
            <li key={question} className="ads-quick-one">
              {question}
            </li>
          ))}
        </ul>
      ) : null}
      {ready ? (
        <div className="ads-compose" data-testid="ads-ready">
          <span className="ads-compose-text">{ready}</span>
          <Icon name="send" size={14} />
        </div>
      ) : null}
      {reply ? (
        <div className="ads-reply">
          <p className="ads-reply-label">{PREVIEW.replyLabel}</p>
          <MessagePreview body={reply} bare testid="ads-chat-reply" />
          <p className="ads-note">{PREVIEW.receptionistWrites}</p>
        </div>
      ) : null}
    </div>
  );
}

/** The form a person fills in: their name and number already in, the yes box unticked, what comes after. */
function FormThread({ thread }: { thread: Extract<ThreadVM, { kind: "form" }> }) {
  return (
    <div className="ads-form" data-testid="ads-form">
      <ul className="ads-form-rows" aria-label={SHOWN.formRows}>
        {thread.fields.map((f) => (
          <li key={f.label} className="ads-form-row">
            <span className="ads-form-label">{f.label}</span>
            <span className="ads-form-note">{f.note}</span>
          </li>
        ))}
      </ul>
      <p className="ads-form-notice">{thread.notice}</p>
      <div className="ads-consent">
        <span className="ads-box" role="img" aria-label={SHOWN.consentBox} />
        <div className="ads-consent-words">
          <p className="ads-consent-draft">{thread.consent.title}</p>
          <p className="ads-consent-text">{thread.consent.text}</p>
        </div>
      </div>
      <p className="ads-form-privacy">{thread.privacy}</p>
      {thread.layout ? <p className="ads-note">{thread.layout}</p> : null}
      <p className="ads-form-thanks">
        <Icon name="check" size={12} />
        {thread.thanks}
      </p>
    </div>
  );
}

/** What happens next: the chat, the call, or the form. */
function Thread({ thread }: { thread: ThreadVM }) {
  return (
    <section className="ads-thread" aria-label={thread.title} data-testid="ads-thread">
      <h4 className="ads-thread-title">{thread.title}</h4>
      {thread.kind === "chat" ? (
        <ChatStart greeting={thread.greeting} ready={thread.ready} questions={thread.questions} reply={thread.reply} />
      ) : thread.kind === "call" ? (
        <p className="ads-line">{thread.line}</p>
      ) : (
        <FormThread thread={thread} />
      )}
    </section>
  );
}

interface AdPreviewProps {
  preview: PreviewVM;
  /**
   * Which shape a Meta feed ad is drawn in. Given, the page holds the choice (and draws its own switch); left out, the
   * preview draws the Feed | Story | Reel switch itself, on Feed.
   */
  frame?: FrameKind;
}

export function AdPreview({ preview, frame }: AdPreviewProps) {
  const [picked, setPicked] = useState<FrameKind>("feed");
  const kind = frame ?? picked;
  const switchable = frame === undefined && preview.frames.length > 0;
  return (
    <div className="ads-preview-body" data-testid="ads-preview-body">
      {switchable ? (
        <Segmented
          label={SHOWN.frameLabel}
          value={picked}
          onValueChange={setPicked}
          options={FRAME_KINDS.map((value, at) => ({ value, label: preview.frames[at] ?? value }))}
          className="ads-frames"
        />
      ) : null}
      <AdFrame preview={preview} kind={kind} />
      <p className="ads-drawn">{preview.caption}</p>
      {preview.warn ? (
        <p className="ads-warn" role="note">
          <Icon name="notice" size={13} />
          <span>{preview.warn}</span>
        </p>
      ) : null}
      <Thread thread={preview.thread} />
    </div>
  );
}
