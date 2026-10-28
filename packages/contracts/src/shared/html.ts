/**
 * Writing text into HTML: the five characters that would otherwise be read as markup. The email a person receives,
 * the unsubscribe page and a reach-out's preview each escaped them on their own, the same way; this is that one way.
 * Here in contracts because the sender (packages/channels) and the preview's view model sit below packages/core,
 * which cannot be imported by either; core/html.ts is the other direction, reading what a fetched page says.
 */
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A web address in the words, read AFTER escaping, so `"` and `<` are already entities and cannot end it early. */
const LINK_IN_TEXT = /https?:\/\/[^\s<>]+/g;

/**
 * An address in escaped words becomes a link; the punctuation that closed the sentence around it stays outside. Only
 * http and https, and only from escaped text: `&` inside an address is already `&amp;`, which a browser reads back as
 * `&`, and nothing else in the words can reach the markup. `style` is the link's inline style, for an email's own look.
 */
export const linkifyEscaped = (escaped: string, style = ""): string =>
  escaped.replace(LINK_IN_TEXT, (m) => {
    const trail = /[.,;:!?)]+$/.exec(m)?.[0] ?? "";
    const href = m.slice(0, m.length - trail.length);
    return `<a href="${href}"${style ? ` style="${style}"` : ""}>${href}</a>${trail}`;
  });
