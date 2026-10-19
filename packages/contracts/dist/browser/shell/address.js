export const MESSAGES_ROUTE = "campaigns/messages";
export const isMessagesParam = (param) => !!param && /^messages(\/|$)/.test(param);
export const ROUTE_WORDS = {
  clients: "people",
  segments: "lists",
  outbound: "playbooks",
  messages: "templates",
  admin: "settings"
};
const headOf = (route) => route.includes("/") ? route.slice(0, route.indexOf("/")) : route;
const SENT_OWN_WORDS = /* @__PURE__ */ new Set(["get-yes", "to-send"]);
export function doorOf(route) {
  const head = headOf(route);
  if (head === "messages") return route === head ? MESSAGES_ROUTE : null;
  const word = route.slice(head.length).replace(/^\//, "").split("/")[0] ?? "";
  if (head === "broadcasts") {
    return word && !word.startsWith("run:") && !SENT_OWN_WORDS.has(word) ? `campaigns/new:to:${word}` : null;
  }
  if (head !== "outbound") return null;
  return word ? `campaigns/moment:${word}` : "campaigns";
}
function shellRoute(route) {
  const head = headOf(route);
  const name = Object.keys(ROUTE_WORDS).find((n) => ROUTE_WORDS[n] === head);
  return name === void 0 ? route : name + route.slice(head.length);
}
export function canonicalRoute(route) {
  const shell = shellRoute(route);
  return doorOf(shell) ?? shell;
}
function pathRoute(route) {
  const head = headOf(route);
  const word = Object.hasOwn(ROUTE_WORDS, head) ? ROUTE_WORDS[head] : void 0;
  return word === void 0 ? route : word + route.slice(head.length);
}
const WORKSPACE_PATH = /^\/w\/([^/?#]+)(?:\/([^?#]*))?$/;
export function routeOfPath(pathname) {
  const m = WORKSPACE_PATH.exec(pathname ?? "");
  return m ? shellRoute((m[2] ?? "").replace(/\/+$/, "")) : null;
}
export function routeOfHash(hash) {
  return typeof hash === "string" && hash.startsWith("#/") ? shellRoute(hash.slice(2)) : null;
}
export function routeOfAddress(address) {
  return routeOfPath(address.pathname) || routeOfHash(address.hash) || "today";
}
export function movedAddress(address) {
  const m = WORKSPACE_PATH.exec(address.pathname ?? "");
  if (m?.[2]) {
    const written = m[2].replace(/\/+$/, "");
    const door = doorOf(shellRoute(written));
    if (door !== null) return `/w/${m[1] ?? ""}/${door}${address.search ?? ""}${address.hash ?? ""}`;
    if (Object.hasOwn(ROUTE_WORDS, headOf(m[2]))) {
      return `/w/${m[1] ?? ""}/${pathRoute(written)}${address.search ?? ""}${address.hash ?? ""}`;
    }
  }
  const route = routeOfHash(address.hash);
  if (!m || route === null || m[2]) return null;
  const at = route.indexOf("?");
  const name = (at < 0 ? route : route.slice(0, at)).replace(/\/+$/, "");
  if (!name) return null;
  const own = at < 0 ? "" : route.slice(at + 1);
  const search = address.search ?? "";
  const joined = own ? search ? `${search}&${own}` : `?${own}` : search;
  return `/w/${m[1] ?? ""}/${pathRoute(doorOf(name) ?? name)}${joined}`;
}
export function workspacePath(slug, route = "") {
  return `/w/${encodeURIComponent(slug)}${route ? `/${pathRoute(doorOf(route) ?? route)}` : ""}`;
}
export function appLink(slug, route = "", query) {
  const asked = Object.entries(query ?? {}).filter((e) => typeof e[1] === "string").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  if (!slug) return `/${asked ? `?${asked}` : ""}${route ? `#/${route}` : ""}`;
  const path = workspacePath(slug, route);
  return asked ? `${path}${path.includes("?") ? "&" : "?"}${asked}` : path;
}
