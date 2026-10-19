import { ROUTE_WORDS } from "./address.js";
export const PAGE_VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"];
const PAGE_SPEED = ["READY", "SETTLED"];
export const PAGE_METRICS = [...PAGE_VITALS, ...PAGE_SPEED];
export const PAGE_DEVICES = ["desk", "phone"];
export const PAGE_PHONE_QUERY = "(max-width: 900px)";
export const PAGE_NAME = /^[a-z][a-z0-9-]{0,31}$/;
export const PAGE_VITALS_PER_BEACON = 100;
const PEOPLE_SCOPES = [
  [/^leads(:|$)/, "leads"],
  [/^pipeline(:|$)/, "pipeline"],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/|$)/i, "person"]
];
export function vitalsPageOf(route) {
  const path = (route ?? "").split("?")[0] ?? "";
  const at = path.indexOf("/");
  const head = at < 0 ? path : path.slice(0, at);
  const rest = at < 0 ? "" : path.slice(at + 1);
  if (head === "") return "today";
  if (head === "clients") return PEOPLE_SCOPES.find(([test]) => test.test(rest))?.[1] ?? "people";
  if (head === "campaigns" && /^messages(\/|$)/.test(rest)) return ROUTE_WORDS.messages ?? "templates";
  const word = ROUTE_WORDS[head] ?? head;
  return PAGE_NAME.test(word) ? word : "other";
}
export const PRIMARY_PART = {
  today: "queue",
  inbox: "list",
  conversations: "list",
  live: "list",
  people: "table",
  leads: "table",
  pipeline: "board",
  person: "hero",
  calendar: "board",
  // Campaigns is Sequences' list (decision 0060): its rows, which the page's code arrives with (a chunk of its own).
  campaigns: "list",
  // Messages, Campaigns' view beside Sequences: its list of messages, drawn as the view is shown.
  templates: "list"
};
