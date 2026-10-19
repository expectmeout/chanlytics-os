import { addressOf } from "../activity/record-address.js";
import { calendarParamParts } from "../calendar/appointment-key.js";
import { JOURNEY_STAGE_IDS } from "../journey/journey.js";
import { parseLeadsRoute, leadsRoute } from "../leads/lead-plan.js";
import { BUILTIN_LISTS, parseListToken } from "../people/lists/lists.js";
import { GET_YES_ROUTE } from "../people/lists/people-route.js";
import { LENS_ROUTES, reportsRouteParts } from "../reports/lenses.js";
import { retiredRouteOf } from "../shell/address.js";
import { TO_SEND_ROUTE } from "../sequences/sequence-address.js";
export const ASK_CITATION_KINDS = [
  "thread",
  "conversation",
  "call",
  "person",
  "page",
  "lead",
  "search",
  "deal",
  "list",
  "broadcast",
  "playbook",
  "template",
  "mailbox",
  "visit",
  "review"
];
export const ASK_ROW_WORDS = "people, threads, calls, leads, searches, deals, lists, broadcasts, playbooks, templates, mailboxes, appointments, reviews";
export function emptyReadSet() {
  return Object.fromEntries(
    ASK_CITATION_KINDS.filter((k) => k !== "page").map((k) => [k, /* @__PURE__ */ new Map()])
  );
}
export function noteRows(read, refs) {
  for (const r of refs) if (r.kind !== "page") read[r.kind].set(r.id, r);
}
export const ASK_PAGE_ROUTES = [
  "today",
  "inbox",
  "clients",
  "clients/leads",
  "clients/pipeline",
  "segments",
  "conversations",
  "live",
  "calendar",
  // Campaigns › Sequences (decision 0060): everything that sends on its own, Campaigns' first view.
  "campaigns/sequences",
  // Campaigns › Messages, its other view (19 Oct 2026); its old route, `messages`, lands on it (RETIRED_PAGES).
  "campaigns/messages",
  ...LENS_ROUTES,
  "start",
  "admin/workspace",
  "admin/hours",
  "admin/receptionist",
  "admin/team",
  "admin/autonomy",
  "admin/notifications",
  "admin/integrations",
  "admin/billing",
  "admin/activity",
  "admin/profile",
  "admin/partner",
  "admin/platform"
];
function isPageRoute(route) {
  if (ASK_PAGES.has(route)) return true;
  const at = route.indexOf("/");
  const param = at < 0 ? "" : route.slice(at + 1);
  switch (at < 0 ? route : route.slice(0, at)) {
    case "calendar": {
      const named = calendarParamParts(param);
      return named.visitId === null && (named.day !== null || named.view !== null);
    }
    case "conversations":
      return route === CALLS_ROUTE;
    case "reports": {
      const parts = reportsRouteParts(route);
      return parts !== null && parts.review === null;
    }
    case "clients":
      return route === GET_YES_ROUTE || isPeopleView(route, param);
    case "inbox":
      return route === TO_SEND_ROUTE;
    default:
      return false;
  }
}
function isPeopleView(route, param) {
  if (param.startsWith("seg:")) {
    const ref = parseListToken(param);
    return ref?.kind === "builtin" && BUILTIN_LISTS.some((l) => l.id === ref.id);
  }
  if (param !== "leads" && !param.startsWith("leads:")) return false;
  const view = parseLeadsRoute(route);
  return !!view && !view.searchId && !view.peek && leadsRoute({ list: view.list, cls: view.cls }) === route;
}
const ASK_PAGES = new Set(ASK_PAGE_ROUTES);
const CALLS_ROUTE = "conversations/phone";
const OTHER_GROUPS = { lists: true, reach_out: true, sent_once: true };
const CAMPAIGN_GROUPS = [...JOURNEY_STAGE_IDS, ...Object.keys(OTHER_GROUPS)];
const RETIRED_PAGES = /* @__PURE__ */ new Set([
  "campaigns",
  "outbound",
  "broadcasts",
  "broadcasts/to-send",
  "broadcasts/get-yes",
  "messages"
]);
function movedPageOf(route) {
  const group = route.startsWith("campaigns/in:") ? route.slice("campaigns/in:".length) : null;
  return RETIRED_PAGES.has(route) || group !== null && CAMPAIGN_GROUPS.includes(group) ? retiredRouteOf(route) : null;
}
export function groundCitations(citations, read) {
  const kept = [];
  let dropped = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const said of citations) {
    const landed = said.kind === "page" ? movedPageOf(said.id) : null;
    const c = landed === null ? said : { ...said, id: landed };
    const ok = c.kind === "page" ? isPageRoute(c.id) : read[c.kind].has(c.id);
    const key = `${c.kind}:${c.id}`;
    if (!ok || seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  return { kept, dropped };
}
const OWN_ROUTES = {
  thread: (id) => addressOf({ kind: "conversation", id }),
  conversation: (id) => addressOf({ kind: "conversation", id, in: "conversations" }),
  call: (id) => addressOf({ kind: "call", id }),
  person: (id) => addressOf({ kind: "person", id }),
  // Where the record opens them without a day: the Calendar finds a visit by its row, and the Reviews lens a review.
  visit: (id) => addressOf({ kind: "visit", id }),
  review: (id) => addressOf({ kind: "review", id })
};
export function citationRoute(c, read) {
  if (c.kind === "page") return c.id;
  return read?.[c.kind].get(c.id)?.route ?? OWN_ROUTES[c.kind]?.(c.id) ?? "";
}
