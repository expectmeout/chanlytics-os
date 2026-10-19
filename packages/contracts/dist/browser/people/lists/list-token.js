const SAVED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILTIN_ID = /^[a-z_]{1,40}$/;
export function listToken(ref) {
  return ref.kind === "builtin" ? `seg:${ref.id}` : `list:${ref.id}`;
}
export function parseListToken(token) {
  if (typeof token !== "string") return null;
  const at = token.indexOf(":");
  const kind = token.slice(0, at);
  const id = token.slice(at + 1);
  if ((kind === "seg" || kind === "state") && BUILTIN_ID.test(id)) return { kind: "builtin", id };
  if (kind === "list" && SAVED_ID.test(id)) return { kind: "saved", id: id.toLowerCase() };
  return null;
}
