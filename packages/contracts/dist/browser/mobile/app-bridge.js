import { isUuid } from "../shared/identity.js";
import { isCount } from "../shared/unknown.js";
import { parseTodayWidgetSnapshot } from "./widget.js";
export const APP_ROUTE_RE = /^[a-z][a-z0-9-]*(?:\/[A-Za-z0-9:_-]+)*$/;
const APP_FILE_TYPES = ["text/csv", "text/plain"];
const APP_FILE_MAX_CHARS = 2e6;
const APP_FILE_NAME_RE = /^[\w .()-]{1,100}\.(csv|txt)$/;
export const PUSH_TOKEN_MAX = 200;
const isRecord = (v) => typeof v === "object" && v !== null;
const PAGE_MESSAGES = {
  route: (v) => typeof v.route === "string" && APP_ROUTE_RE.test(v.route) ? { t: "route", route: v.route } : null,
  needs: (v) => isCount(v.inbox) ? { t: "needs", inbox: v.inbox } : null,
  session: (v) => v.state === "in" || v.state === "out" ? { t: "session", state: v.state } : null,
  workspace: (v) => typeof v.slug === "string" && v.slug.trim() ? { t: "workspace", slug: v.slug.trim() } : null,
  badge: (v) => isCount(v.n) ? { t: "badge", n: v.n } : null,
  device: (v) => v.state === "registered" || v.state === "forgotten" || v.state === "refused" ? { t: "device", state: v.state } : null,
  today: (v) => {
    const snapshot = parseTodayWidgetSnapshot(v.snapshot);
    return snapshot ? { t: "today", snapshot } : null;
  },
  calls: (v) => isCount(v.live) ? { t: "calls", live: v.live } : null,
  theme: (v) => v.theme === "light" || v.theme === "dark" ? { t: "theme", theme: v.theme } : null,
  overlay: (v) => typeof v.open === "boolean" ? { t: "overlay", open: v.open } : null,
  file: (v) => typeof v.name === "string" && APP_FILE_NAME_RE.test(v.name) && APP_FILE_TYPES.includes(v.type) && typeof v.text === "string" && v.text.length <= APP_FILE_MAX_CHARS ? { t: "file", name: v.name, type: v.type, text: v.text } : null
};
export function parsePageMessage(raw) {
  let v;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(v) || typeof v.t !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(PAGE_MESSAGES, v.t)) return null;
  return PAGE_MESSAGES[v.t](v);
}
const token = (v) => typeof v === "string" && v.trim() && v.trim().length <= PUSH_TOKEN_MAX ? v.trim() : null;
export function parseShellMessage(v) {
  if (!isRecord(v)) return null;
  switch (v.t) {
    case "navigate":
      if (typeof v.route !== "string" || !APP_ROUTE_RE.test(v.route)) return null;
      return isUuid(v.workspace) ? { t: "navigate", route: v.route, workspace: String(v.workspace) } : { t: "navigate", route: v.route };
    case "menu":
      return { t: "menu" };
    case "top":
      return { t: "top" };
    case "close":
      return { t: "close" };
    case "front":
      return typeof v.front === "boolean" ? { t: "front", front: v.front } : null;
    case "device": {
      const tok = token(v.token);
      const platform = v.platform === "ios" || v.platform === "android" ? v.platform : null;
      const version = typeof v.version === "string" ? v.version.trim().slice(0, 40) : "";
      const activity = token(v.activity);
      return tok && platform ? { t: "device", token: tok, platform, version, ...activity ? { activity } : {} } : null;
    }
    default:
      return null;
  }
}
