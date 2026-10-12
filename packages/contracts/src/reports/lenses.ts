/**
 * Reports' lenses (the reports-lenses spec, §6): one page, a lens to each thing the business runs, each at its own address,
 * `/w/<slug>/reports/<lens>` and the Overview at `/w/<slug>/reports`. This is the one table every list of them is read from:
 * the frame's strip and the route's `takes` (the dashboard's surfaces/reports/chrome.ts), the palette's jumps and Ask's page
 * routes (ask/ask-jump.ts, ask/citations.ts). Six lenses are drawn; a lens joins here in the change that draws its first tile
 * (Calendar, Usage and Leads each in phase C), so no row stands for a lens that is not there. A lens that exists and is not
 * shown to a workspace draws its `empty` at its address, never a not-found: Ask and ⌘K may link it. Ads (11 Oct 2026) is shown
 * where the workspace has ads (`ads_on`: a demo session until the wiring lane reads the workspace's connected ad accounts,
 * decision 0049), and its address says what it is narrowed to after the days (`reports/ads:2026-09-11~2026-10-10:ad:<id>`).
 */
import { ADS_ROUTE, ADS_SCOPE_ALL, adsScopeKey, adsScopeOfKey } from "../ads/address";
import type { AdsScope } from "../ads/address";
import { roleAtLeast } from "../config/roles";
import type { Role } from "../config/workspace-config/role-perms";
import { dealsAreOn } from "../deals/sells-by";
import { reportRangeKey, reportRangeOfKey, type ReportDays } from "./report-periods";

/** The period a lens's words are about: the report's own dates, as the page says them ("Aug 29" to "Sep 4"). */
export interface LensRange {
  since: string;
  until: string;
}

/** What a lens says where it has nothing to draw: a title, a sentence, and where to go from there. */
export interface LensEmpty {
  title: string;
  body: string;
  door: { label: string; to: string } | null;
}

/** What a row of the table is. */
interface ReportLens {
  /** The address's word (`/reports/<id>`); the Overview's is the address of Reports itself. */
  id: string;
  /** The strip's word. */
  label: string;
  /** The palette's sub-line. */
  sub: string;
  /**
   * When the lens is shown: always, only where deals are on (`sells_by`, the one predicate `dealsAreOn`), or only where ads are
   * on (`LensWho.adsOn`). Campaigns and Reviews are shown to every workspace for now (an owner sees "Nothing went out" today,
   * and nothing an owner sees disappears in this phase); each narrows to its spec's rule in the change that gives it its own tiles.
   */
  shownWhen: "always" | "deals_on" | "ads_on";
  /** The least role that may read it. */
  role: Role;
  /** What it says where it has nothing to draw (a period nobody wrote in, a lens the workspace has no use for). */
  empty: (range: LensRange) => LensEmpty;
}

const NOTHING_CAME_IN = (r: LensRange): LensEmpty => ({
  title: "Nothing came in",
  body: `Nobody wrote or called between ${r.since} and ${r.until}.`,
  door: null,
});

export const REPORT_LENSES = [
  {
    id: "overview",
    label: "Overview",
    sub: "how the period went, and what needs a look",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN,
  },
  {
    id: "receptionist",
    label: "Receptionist",
    sub: "who answered, how fast, and why it stopped",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN,
  },
  {
    id: "people",
    label: "People",
    sub: "who reached you, whether you can reach them, and who is slipping away",
    shownWhen: "always",
    role: "viewer",
    empty: NOTHING_CAME_IN,
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
      door: { label: "Open Settings", to: "admin/workspace" },
    }),
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
      door: { label: "Open Sent", to: "broadcasts" },
    }),
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
      door: { label: "Open Ads", to: ADS_ROUTE },
    }),
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
      door: { label: "Find it", to: "start/find" },
    }),
  },
] as const satisfies readonly ReportLens[];

/** A lens's address word, from the table. */
export type LensId = (typeof REPORT_LENSES)[number]["id"];

/** A row of the table, with its id as the literal it is. */
export type LensRow = (typeof REPORT_LENSES)[number];

/**
 * The route a lens is at: the Overview is `reports`, every other `reports/<lens>`. Over days a member picked the address
 * says them too, after the lens in the shell's own grammar (`clients/leads:…`): `reports/receptionist:2026-09-01~2026-09-20`,
 * and for the Overview the days alone, `reports/2026-09-01~2026-09-20`. A period by name is never in the address: it is
 * the device's, and a link to a lens opens on whatever period its reader keeps. The Ads lens alone also says what it is
 * narrowed to, after the days: `reports/ads:2026-09-01~2026-09-20:ad:<id>`, `…:platform:meta` (every ad is no word at all).
 */
export const lensRoute = (id: LensId, days: ReportDays | null = null, scope: AdsScope | null = null): string => {
  const narrowed = id === "ads" && scope !== null && scope.kind !== "all" ? adsScopeKey(scope) : null;
  if (days === null && narrowed === null) return id === "overview" ? "reports" : `reports/${id}`;
  const rest = [days === null ? null : reportRangeKey(days), narrowed].filter((w) => w !== null).join(":");
  return id === "overview" ? `reports/${rest}` : `reports/${id}:${rest}`;
};

/** Reports › Ads over these days, narrowed to a scope: what the Results sheet's "Full report" and an ad's drawer open. */
export const adsReportRoute = (days: ReportDays | null, scope: AdsScope = ADS_SCOPE_ALL): string =>
  lensRoute("ads", days, scope);

/** A review's id as its address spells it: the row's uuid. Anything else after `reviews:` is no review's address. */
const REVIEW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where one review opens: the Reviews lens with that review drawn first and its reply box open (`reports/reviews:<id>`). The id
 * is the review's own row (google_reviews.id), the one the reply door takes and the ledger files a reply under; every notice
 * that tells of a review, the Today line, the bell's row and an Activity line carry this address, written here once
 * (record-address.ts `addressOf`). It names no days: a link to a review opens on whatever period its reader keeps. A word that is
 * no review's row (Google's own id for it, which the first bell rows carried) opens the lens, never an address no page parses.
 */
export const reviewRoute = (id: string): string =>
  REVIEW_ID.test(id) ? `reports/reviews:${id}` : lensRoute("reviews");

/** Every lens's route, in the strip's order (Ask's page routes read them). */
export const LENS_ROUTES: readonly string[] = REPORT_LENSES.map((l) => lensRoute(l.id));

/** Whether a param under `reports` is a lens's: every one but the Overview, which is `reports` itself. */
export const isLensParam = (param: string): param is Exclude<LensId, "overview"> =>
  REPORT_LENSES.some((l) => l.id === param && l.id !== "overview");

/** The days a key names, where it names days and not a period (`2026-09-01~2026-09-20`); null otherwise. */
const daysOfKey = (key: string): ReportDays | null => {
  const range = reportRangeOfKey(key);
  return range !== null && typeof range !== "string" ? range : null;
};

/**
 * What an address of Reports says: the lens, the days a member picked, for Ads alone what it is narrowed to (none: every ad),
 * and for Reviews alone the one review it opens (null: none).
 */
export interface ReportsParts {
  lens: LensId;
  days: ReportDays | null;
  scope?: AdsScope;
  review: string | null;
}

/**
 * What follows `ads:` in an address: the days, then a scope (`2026-09-01~2026-09-20:ad:<id>`), or either alone. A scope that
 * names every ad is no word of an address, so it is not read; the days come first because a scope's words never look like them.
 */
function adsParts(rest: string): { days: ReportDays | null; scope?: AdsScope } | null {
  const at = rest.indexOf(":");
  const days = daysOfKey(at < 0 ? rest : rest.slice(0, at));
  if (days && at < 0) return { days };
  const words = days ? rest.slice(at + 1) : rest;
  const scope = words === "all" ? null : adsScopeOfKey(words);
  return scope ? { days, scope } : null;
}

/**
 * What follows `reports` in an address, read: the lens, and the days a member picked where the address says them
 * (lensRoute). Nothing is the Overview; a lens is that lens; days alone are the Overview over them; `<lens>:<days>` both;
 * Ads also `ads:<days>:<scope>` or `ads:<scope>`; and Reviews also the one review it is to open (`reviews:<id>`, reviewRoute).
 * Null for anything else, which is no address of Reports'. Whether the days may be read (not to come, not too many) is not
 * asked here: the address is read before the workspace's today is known, and the report's own read refuses them.
 */
export function reportsParamParts(param: string): ReportsParts | null {
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

/**
 * A Reports route, read: `reports` and what follows it (reportsParamParts); null for a route that is not Reports'. A
 * slash with nothing after it is no address of Reports': the Overview is `reports` alone.
 */
export function reportsRouteParts(route: string): ReportsParts | null {
  if (route === "reports") return reportsParamParts("");
  const param = route.startsWith("reports/") ? route.slice("reports/".length) : "";
  return param === "" ? null : reportsParamParts(param);
}

/** The lens a route is: `reports` is the Overview, `reports/<lens>` that lens (whatever days it is over), and anything else none. */
export function lensOfRoute(route: string): LensId | null {
  return reportsRouteParts(route)?.lens ?? null;
}

/** What decides which lenses a workspace is shown: how its customers buy, whether it has ads, and the role of the person looking. */
export interface LensWho {
  sellsBy: string | null | undefined;
  /** Not yet known reads as a viewer, the lowest rung; a role the ladder does not know stands on none. */
  role: string | null | undefined;
  /** The workspace has ads to report: a demo session for now, then the workspaces with a connected ad account (decision 0049). */
  adsOn: boolean;
}

/** Whether a lens's rule lets this workspace see it. */
const shownTo = (l: LensRow, who: LensWho): boolean =>
  l.shownWhen === "always" ||
  (l.shownWhen === "deals_on" && dealsAreOn(who.sellsBy)) ||
  (l.shownWhen === "ads_on" && who.adsOn);

/** The lenses shown to this person in this workspace, in the strip's order. */
export function lensesFor(who: LensWho): LensRow[] {
  return REPORT_LENSES.filter((l) => shownTo(l, who) && roleAtLeast(who.role ?? "viewer", l.role));
}

/** Whether a lens is shown to this person here. */
export const lensIsShown = (id: LensId, who: LensWho): boolean => lensesFor(who).some((l) => l.id === id);

/** A lens's row (the frame's crumb names a lens by it). */
export function lensOf(id: LensId): LensRow {
  const found = REPORT_LENSES.find((l) => l.id === id);
  if (!found) throw new Error(`Reports has no lens ${id}`);
  return found;
}

/** What a lens says where it has nothing to draw, over the period's dates. */
export const lensEmpty = (id: LensId, range: LensRange): LensEmpty => lensOf(id).empty(range);
