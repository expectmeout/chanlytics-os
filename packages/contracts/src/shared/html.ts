/**
 * Writing text into HTML: the five characters that would otherwise be read as markup. The email a person receives,
 * the unsubscribe page and a reach-out's preview each escaped them on their own, the same way; this is that one way.
 * Here in contracts because the sender (packages/channels) and the preview's view model sit below packages/core,
 * which cannot be imported by either; core/html.ts is the other direction, reading what a fetched page says.
 */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
