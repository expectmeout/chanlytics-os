const MAX_LINK = 500;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
export function normalizeLink(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = SCHEME.test(s) ? s : `https://${s}`;
  if (withScheme.length > MAX_LINK) return null;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!HOST.test(u.hostname)) return null;
  return withScheme;
}
export function whyNotALink(raw) {
  if (normalizeLink(raw)) return null;
  const s = String(raw ?? "").trim();
  if (!s) return "A web address is needed.";
  if (/\s/.test(s)) return "Only the address itself, with no spaces in it.";
  if (SCHEME.test(s) && !/^https?:/i.test(s)) return "That needs to be a web address, starting with https://.";
  if (s.length > MAX_LINK) return "That address is too long to store: paste the link itself, not a whole page.";
  return "That needs a full web address, like docs.example.com/proposal.";
}
export function linkHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
}
export function publicObjectSrc(supabaseUrl, bucket, path) {
  if (!supabaseUrl) return null;
  let origin;
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {
    return null;
  }
  if (!/^https:\/\//.test(origin) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return null;
  return `${origin}/storage/v1/object/public/${bucket}/${path}`;
}
