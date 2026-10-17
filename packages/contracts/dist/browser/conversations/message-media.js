export const MEDIA_LABEL = {
  image: "Photo",
  audio: "Voice note",
  video: "Video",
  document: "Document",
  other: "Attachment"
};
export function mediaKind(mime, raw) {
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
export function mediaVM(m) {
  if (m.type !== "media" || !m.media) return null;
  const mime = m.media.mime_type ?? null;
  return {
    messageId: m.id,
    kind: mediaKind(mime, m.meta && m.meta.raw_type || null),
    mime,
    filename: m.media.filename ?? null,
    caption: m.media.caption ?? null,
    available: m.media.fetch_state === "stored"
  };
}
