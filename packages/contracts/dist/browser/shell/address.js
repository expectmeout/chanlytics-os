import {
  SEQUENCES_ROUTE,
  TO_SEND_PARAM,
  TO_SEND_ROUTE,
  newForLeadsRoute,
  newSequenceRoute,
  runRoute,
  sendOnceRoute,
  sequenceRoute
} from "../sequences/sequence-address.js";
import { GET_YES_PARAM, GET_YES_ROUTE } from "../people/lists/people-route.js";
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
export function retiredRouteOf(route) {
  const at = route.indexOf("?");
  const path = at < 0 ? route : route.slice(0, at);
  const query = at < 0 ? "" : route.slice(at);
  const landed = retiredPathOf(path);
  return landed === null ? null : landed + query;
}
function retiredPathOf(path) {
  const head = headOf(path);
  const param = path.slice(head.length).replace(/^\//, "").split("/")[0] ?? "";
  if (head === "messages") return path === head ? MESSAGES_ROUTE : null;
  if (head === "outbound") return param ? sequenceRoute(param) : SEQUENCES_ROUTE;
  if (head === "broadcasts") return sentLandingOf(param);
  return head === "campaigns" ? campaignsLandingOf(path, param) : null;
}
function sentLandingOf(param) {
  if (!param) return SEQUENCES_ROUTE;
  if (param.startsWith("run:")) return param.length > 4 ? runRoute(param.slice(4)) : SEQUENCES_ROUTE;
  if (param === TO_SEND_PARAM) return TO_SEND_ROUTE;
  if (param === GET_YES_PARAM) return GET_YES_ROUTE;
  return sendOnceRoute(param);
}
function campaignsLandingOf(path, param) {
  if (param === "" || param.startsWith("in:")) return SEQUENCES_ROUTE;
  if (param === "sequences") {
    const [, , id, tab, day] = path.split("/");
    return id && tab === "history" && day ? runRoute(day, id) : null;
  }
  const moment = /^moment:([^:/]+)(:people)?$/.exec(param);
  if (moment?.[1]) return sequenceRoute(moment[1], moment[2] ? "people" : "steps");
  if (param === "new:every") return newSequenceRoute();
  if (param === "new") return sendOnceRoute();
  if (param.startsWith("new:to:")) return sendOnceRoute(param.slice("new:to:".length) || null);
  if (param === "new:leads") return newForLeadsRoute();
  const change = /^new:edit:(.+)$/.exec(param);
  if (change?.[1]) return sequenceRoute(change[1]);
  const on = /^new:moment:([^:/]+)$/.exec(param);
  return on?.[1] ? newSequenceRoute(on[1]) : null;
}
function shellRoute(route) {
  const head = headOf(route);
  const name = Object.keys(ROUTE_WORDS).find((n) => ROUTE_WORDS[n] === head);
  return name === void 0 ? route : name + route.slice(head.length);
}
export function canonicalRoute(route) {
  const shell = shellRoute(route);
  return retiredRouteOf(shell) ?? shell;
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
    const door = retiredRouteOf(shellRoute(written));
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
  return `/w/${m[1] ?? ""}/${pathRoute(retiredRouteOf(name) ?? name)}${joined}`;
}
export function workspacePath(slug, route = "") {
  return `/w/${encodeURIComponent(slug)}${route ? `/${pathRoute(retiredRouteOf(route) ?? route)}` : ""}`;
}
export function appLink(slug, route = "", query) {
  const asked = Object.entries(query ?? {}).filter((e) => typeof e[1] === "string").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  if (!slug) return `/${asked ? `?${asked}` : ""}${route ? `#/${route}` : ""}`;
  const path = workspacePath(slug, route);
  return asked ? `${path}${path.includes("?") ? "&" : "?"}${asked}` : path;
}
