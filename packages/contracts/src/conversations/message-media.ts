/**
 * A message's attachment: what kind of thing it is, and the shape the thread draws it in. message-words.ts
 * names it in words; the view models (inbox-thread.ts, conversation-vm.ts) carry it on the bubble.
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
  const t = (mime ?? "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("application/") || t.startsWith("text/")) return "document";
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
export function mediaVM(m: MessageDto): MediaVM | null {
  if (m.type !== "media" || !m.media) return null;
  const mime = m.media.mime_type ?? null;
  return {
    messageId: m.id,
    kind: mediaKind(mime, (m.meta && (m.meta.raw_type as string)) || null),
    mime,
    filename: m.media.filename ?? null,
    caption: m.media.caption ?? null,
    available: m.media.fetch_state === "stored",
  };
}
