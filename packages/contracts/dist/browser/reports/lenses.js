import { ADS_ROUTE, ADS_SCOPE_ALL, adsScopeKey, adsScopeOfKey } from "../ads/address.js";
import { roleAtLeast } from "../config/roles.js";
import { dealsAreOn } from "../deals/sells-by.js";
import { reportRangeKey, reportRangeOfKey } from "./report-periods.js";
const NOTHING_CAME_IN = (r) => ({
  title: "Nothing came in",
  body: `Nobody wrote or called between ${r.since} and ${r.until}.`,
  door: null
});
export const REPORT_LENSES = [
  {
    id: "overview",
    label: "Overview",
    sub: "how the period went, and what needs a look",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN
  },
  {
    id: "receptionist",
    label: "Receptionist",
    sub: "who answered, how fast, and why it stopped",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN
  },
  {
    id: "people",
    label: "People",
    sub: "who reached you, whether you can reach them, and who is slipping away",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN
  },
  {
    id: "pipeline",
    label: "Pipeline",
    sub: "proposals, and what became of them",
    shownWhen: "deals_on",
    role: "viewer",
    empty: () => ({
      title: "No proposals to report",
      body: "Proposals you send, and what became of them, show here. Where your customers book directly, there is nothing to report.",
      door: { label: "Open Settings", to: "admin/workspace" }
    })
  },
  {
    id: "campaigns",
    label: "Campaigns",
    sub: "did your messages reach people, did they answer, and what is stuck",
    shownWhen: "always",
    role: "viewer",
    empty: (r) => ({
      title: "Nothing went out",
      body: `No broadcast or campaign run reached anyone between ${r.since} and ${r.until}, and nobody said yes or asked to stop.`,
      door: { label: "Open Sequences", to: "campaigns/sequences" }
    })
  },
  {
    id: "ads",
    label: "Ads",
    sub: "what your ads cost, who they brought, and who booked",
    shownWhen: "ads_on",
    role: "viewer",
    empty: (r) => ({
      title: "No ads in this period",
      body: `Nothing was spent on ads, and nobody got in touch through one, between ${r.since} and ${r.until}.`,
      door: { label: "Open Ads", to: ADS_ROUTE }
    })
  },
  {
    id: "reviews",
    label: "Reviews",
    sub: "what customers say on Google",
    shownWhen: "always",
    role: "viewer",
    empty: () => ({
      title: "Find your business on Google once.",
      body: "Its rating, its count and its newest reviews show here for the period, with a line on Today and a row on the bell when one lands.",
      door: { label: "Find it", to: "start/find" }
    })
  }
];
export const lensRoute = (id, days = null, scope = null) => {
  const narrowed = id === "ads" && scope !== null && scope.kind !== "all" ? adsScopeKey(scope) : null;
  if (days === null && narrowed === null) return id === "overview" ? "reports" : `reports/${id}`;
  const rest = [days === null ? null : reportRangeKey(days), narrowed].filter((w) => w !== null).join(":");
  return id === "overview" ? `reports/${rest}` : `reports/${id}:${rest}`;
};
export const adsReportRoute = (days, scope = ADS_SCOPE_ALL) => lensRoute("ads", days, scope);
const REVIEW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const reviewRoute = (id) => REVIEW_ID.test(id) ? `reports/reviews:${id}` : lensRoute("reviews");
export const LENS_ROUTES = REPORT_LENSES.map((l) => lensRoute(l.id));
export const isLensParam = (param) => REPORT_LENSES.some((l) => l.id === param && l.id !== "overview");
const daysOfKey = (key) => {
  const range = reportRangeOfKey(key);
  return range !== null && typeof range !== "string" ? range : null;
};
function adsParts(rest) {
  const at = rest.indexOf(":");
  const days = daysOfKey(at < 0 ? rest : rest.slice(0, at));
  if (days && at < 0) return { days };
  const words = days ? rest.slice(at + 1) : rest;
  const scope = words === "all" ? null : adsScopeOfKey(words);
  return scope ? { days, scope } : null;
}
export function reportsParamParts(param) {
  if (param === "") return { lens: "overview", days: null, review: null };
  const alone = daysOfKey(param);
  if (alone) return { lens: "overview", days: alone, review: null };
  const at = param.indexOf(":");
  const word = at < 0 ? param : param.slice(0, at);
  if (!isLensParam(word)) return null;
  if (at < 0) return { lens: word, days: null, review: null };
  const rest = param.slice(at + 1);
  if (word === "ads") {
    const ads = adsParts(rest);
    return ads ? { lens: word, ...ads, review: null } : null;
  }
  if (word === "reviews" && REVIEW_ID.test(rest)) return { lens: word, days: null, review: rest };
  const days = daysOfKey(rest);
  return days ? { lens: word, days, review: null } : null;
}
export function reportsRouteParts(route) {
  if (route === "reports") return reportsParamParts("");
  const param = route.startsWith("reports/") ? route.slice("reports/".length) : "";
  return param === "" ? null : reportsParamParts(param);
}
export function lensOfRoute(route) {
  return reportsRouteParts(route)?.lens ?? null;
}
const shownTo = (l, who) => l.shownWhen === "always" || l.shownWhen === "deals_on" && dealsAreOn(who.sellsBy) || l.shownWhen === "ads_on" && who.adsOn;
export function lensesFor(who) {
  return REPORT_LENSES.filter((l) => shownTo(l, who) && roleAtLeast(who.role ?? "viewer", l.role));
}
export const lensIsShown = (id, who) => lensesFor(who).some((l) => l.id === id);
export function lensOf(id) {
  const found = REPORT_LENSES.find((l) => l.id === id);
  if (!found) throw new Error(`Reports has no lens ${id}`);
  return found;
}
export const lensEmpty = (id, range) => lensOf(id).empty(range);
