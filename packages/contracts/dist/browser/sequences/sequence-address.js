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
  if (id === "new" || id.startsWith("new:")) return { ...newPlaceOf(id), ...back };
  if ((tab === "runs" || tab === "history") && day) return { view: "record", id, tab: "history", run: day, ...back };
  return { view: "record", id, tab: isTab(tab) ? tab : "steps", ...back };
}
function newPlaceOf(word) {
  const [, kind, ...rest] = word.split(":");
  if (kind === "moment" && rest[0]) return { view: "new", moment: rest[0] };
  if (kind === "leads") return { view: "new", who: "leads" };
  if (kind !== "once") return { view: "new" };
  const to = rest[0] === "to" ? rest.slice(1).join(":") : "";
  return to ? { view: "new", who: "once", to } : { view: "new", who: "once" };
}
export function sequenceRouteBack(route, back) {
  if (!back || back !== LEADS_ROUTE && !back.startsWith(`${LEADS_ROUTE}:`)) return route;
  return `${route}/${BACK}${back.slice(LEADS_ROUTE.length + 1)}`;
}
export const sequenceRoute = (id, tab = "steps") => tab === "steps" ? `${SEQUENCES_ROUTE}/${id}` : `${SEQUENCES_ROUTE}/${id}/${tab}`;
export const newSequenceRoute = (moment) => moment ? `${SEQUENCES_ROUTE}/new:moment:${moment}` : `${SEQUENCES_ROUTE}/new`;
export const runRoute = (id, sequenceId) => `${SEQUENCES_ROUTE}/${sequenceId || id}/runs/${id}`;
export const sendOnceRoute = (audience) => audience ? `${SEQUENCES_ROUTE}/new:once:to:${audience}` : `${SEQUENCES_ROUTE}/new:once`;
export const newForLeadsRoute = () => `${SEQUENCES_ROUTE}/new:leads`;
export const messageRoute = (name) => `campaigns/message:${name}`;
export const sequenceRepliesRoute = (id, period = "30") => `inbox/from:${id}${period === "30" ? "" : `:${period}`}`;
export const TO_SEND_PARAM = "to-send";
export const TO_SEND_ROUTE = `inbox/${TO_SEND_PARAM}`;
export const isToSendParam = (param) => param === TO_SEND_PARAM;
export function sequenceRepliesOf(param) {
  const m = param ? /^from:([0-9a-f-]{36})(?::(30|90|all))?$/i.exec(param) : null;
  return m?.[1] ? { id: m[1].toLowerCase(), period: m[2] === "90" || m[2] === "all" ? m[2] : "30" } : null;
}
