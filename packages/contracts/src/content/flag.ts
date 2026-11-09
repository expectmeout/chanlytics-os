/**
 * Whether a workspace may connect Meta (`features.content_preview`, the flag registry's `content_preview`): one connection
 * for its Instagram account's messages, posts, sounds, comments and numbers (decision 0117). On for
 * Chanlytics' own workspace until Meta's App Review passes, then per workspace as owners connect. Off, Connections draws the
 * Instagram row as before and the edge refuses the Meta door. Read off the config as stored, so anything but `true` is off.
 * The one reader of the flag: the edge's door and the page each ask it.
 */
export function contentPreviewOf(config: unknown): boolean {
  if (typeof config !== "object" || config === null || !("features" in config)) return false;
  const features: unknown = config.features;
  return (
    typeof features === "object" &&
    features !== null &&
    "content_preview" in features &&
    features.content_preview === true
  );
}
