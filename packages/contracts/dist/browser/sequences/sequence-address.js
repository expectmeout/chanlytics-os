export const SEQUENCES_ROUTE = "campaigns/sequences";
const SEQUENCE_TABS = ["steps", "people", "history"];
const LEADS_ROUTE = "clients/leads";
const BACK = "back:";
export const isSequencesParam = (param) => param === "sequences";
const isTab = (word) => SEQUENCE_TABS.some((t) => t === word);
export function parseSequencesRoute(route) {
  const [path = ""] = route.split("?");
  const words = path.split("/");
  const backAt = words.findIndex((w) => w.startsWith(BACK));
  const backWords = backAt >= 0 ? (words[backAt] ?? "").slice(BACK.length) : null;
  const back = backWords === null ? {} : { back: backWords ? `${LEADS_ROUTE}:${backWords}` : LEADS_ROUTE };
  const [root, view, id, tab, day] = backAt >= 0 ? words.slice(0, backAt) : words;
  if (root !== "campaigns" || view !== "sequences") return null;
  if (!id) return { view: "list", ...back };
  if (id === "new" || id.startsWith("new:")) {
    const [, kind, moment] = id.split(":");
    return { view: "new", ...kind === "moment" && moment ? { moment } : {}, ...back };
  }
  const on = isTab(tab) ? tab : "steps";
  return { view: "record", id, tab: on, ...on === "history" && day ? { day } : {}, ...back };
}
export function sequenceRouteBack(route, back) {
  if (!back || back !== LEADS_ROUTE && !back.startsWith(`${LEADS_ROUTE}:`)) return route;
  return `${route}/${BACK}${back.slice(LEADS_ROUTE.length + 1)}`;
}
export const sequenceRoute = (id, tab = "steps", day) => tab === "steps" ? `${SEQUENCES_ROUTE}/${id}` : `${SEQUENCES_ROUTE}/${id}/${tab}${tab === "history" && day ? `/${day}` : ""}`;
export const newSequenceRoute = (moment) => moment ? `${SEQUENCES_ROUTE}/new:moment:${moment}` : `${SEQUENCES_ROUTE}/new`;
export const runSheetRoute = (id) => `broadcasts/run:${id}/sheet`;
export function sequenceLandingOf(route) {
  const [path = ""] = route.split("?");
  const [root, param = ""] = path.split("/");
  if (root === "campaigns") {
    if (param === "" || param.startsWith("in:")) return SEQUENCES_ROUTE;
    const moment = /^moment:([^:/]+)(:people)?$/.exec(param);
    if (moment?.[1]) return sequenceRoute(moment[1], moment[2] ? "people" : "steps");
    if (param === "new:every") return newSequenceRoute();
    const on = /^new:moment:([^:/]+)$/.exec(param);
    if (on?.[1]) return newSequenceRoute(on[1]);
  }
  if (root === "broadcasts" && param === "") return SEQUENCES_ROUTE;
  return null;
}
export const sequenceRepliesRoute = (id, period = "30") => `inbox/from:${id}${period === "30" ? "" : `:${period}`}`;
export function sequenceRepliesOf(param) {
  const m = param ? /^from:([0-9a-f-]{36})(?::(30|90|all))?$/i.exec(param) : null;
  return m?.[1] ? { id: m[1].toLowerCase(), period: m[2] === "90" || m[2] === "all" ? m[2] : "30" } : null;
}
