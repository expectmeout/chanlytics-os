export const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const LINK_IN_TEXT = /https?:\/\/[^\s<>]+/g;
export const linkifyEscaped = (escaped, style = "") => escaped.replace(LINK_IN_TEXT, (m) => {
  const trail = /[.,;:!?)]+$/.exec(m)?.[0] ?? "";
  const href = m.slice(0, m.length - trail.length);
  return `<a href="${href}"${style ? ` style="${style}"` : ""}>${href}</a>${trail}`;
});
