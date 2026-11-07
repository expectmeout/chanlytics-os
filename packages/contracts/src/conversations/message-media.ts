/**
 * A message's attachment: what kind of thing it is, and the shape the thread draws it in. message-words.ts
 * names it in words; the view models (inbox-thread.ts, conversations/vm.ts) carry it on the bubble.
 */
import type { MessageDto } from "./thread-dto";

/** An attachment as the thread draws it. */
export interface MediaVM {
  messageId: string;
  kind: "image" | "audio" | "video" | "document" | "other";
  mime: string | null;
  filename: string | null;
  caption: string | null;
  /** Stored and servable; false while it is fetching or after a failed fetch. */
  available: boolean;
}

export const MEDIA_LABEL: Record<MediaVM["kind"], string> = {
  image: "Photo",
  audio: "Voice note",
  video: "Video",
  document: "Document",
  other: "Attachment",
};

/** What kind of thing an attachment is: from its mime, else from WhatsApp's own word for it. */
export function mediaKind(mime: string | null | undefined, raw?: string | null): MediaVM["kind"] {
  const text = (mime ?? "").toLowerCase();
  if (text.startsWith("image/")) return "image";
  if (text.startsWith("audio/")) return "audio";
  if (text.startsWith("video/")) return "video";
  if (text.startsWith("application/") || text.startsWith("text/")) return "document";
  switch (raw) {
    case "image":
    case "sticker":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "document":
      return "document";
    default:
      return "other";
  }
}

/** The attachment on a message, as the thread draws it; null for words. */
export function mediaVM(message: MessageDto): MediaVM | null {
  if (message.type !== "media" || !message.media) return null;
  const mime = message.media.mime_type ?? null;
  return {
    messageId: message.id,
    kind: mediaKind(mime, (message.meta && (message.meta.raw_type as string)) || null),
    mime,
    filename: message.media.filename ?? null,
    caption: message.media.caption ?? null,
    available: message.media.fetch_state === "stored",
  };
}
