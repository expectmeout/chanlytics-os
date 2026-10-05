/**
 * Reports' lenses (the reports-lenses spec, §6): one page, a lens to each thing the business runs, each at its own address,
 * `/w/<slug>/reports/<lens>` and the Overview at `/w/<slug>/reports`. This is the one table every list of them is read from:
 * the frame's strip and the route's `takes` (the dashboard's surfaces/reports/chrome.ts), the palette's jumps and Ask's page
 * routes (ask/ask-jump.ts, ask/citations.ts). Six lenses are drawn; a lens joins here in the change that draws its first tile
 * (Calendar, Usage and Leads each in phase C), so no row stands for a lens that is not there. A lens that exists and is not
 * shown to a workspace draws its `empty` at its address, never a not-found: Ask and ⌘K may link it.
 */
import { roleAtLeast } from "../config/roles";
import type { Role } from "../config/workspace-config/role-perms";
import { dealsAreOn } from "../deals/sells-by";

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
   * When the lens is shown: always, or only where deals are on (`sells_by`, the one predicate `dealsAreOn`). Campaigns and
   * Reviews are shown to every workspace for now (an owner sees "Nothing went out" today, and nothing an owner sees
   * disappears in this phase); each narrows to its spec's rule in the change that gives it its own tiles.
   */
  shownWhen: "always" | "deals_on";
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
    sub: "who reached you, and where and when",
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
    sub: "what went out, and who wrote back",
    shownWhen: "always",
    role: "viewer",
    empty: (r) => ({
      title: "Nothing went out",
      body: `No broadcast or playbook run reached anyone between ${r.since} and ${r.until}, and nobody said yes or asked to stop.`,
      door: { label: "Open Sent", to: "broadcasts" },
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

/** The route a lens is at: the Overview is `reports`, every other `reports/<lens>`. */
export const lensRoute = (id: LensId): string => (id === "overview" ? "reports" : `reports/${id}`);

/** Every lens's route, in the strip's order (Ask's page routes read them). */
export const LENS_ROUTES: readonly string[] = REPORT_LENSES.map((l) => lensRoute(l.id));

/** Whether a param under `reports` is a lens's: every one but the Overview, which is `reports` itself. */
export const isLensParam = (param: string): param is Exclude<LensId, "overview"> =>
  REPORT_LENSES.some((l) => l.id === param && l.id !== "overview");

/** The lens a route is: `reports` is the Overview, `reports/<lens>` that lens, and anything else none. */
export function lensOfRoute(route: string): LensId | null {
  if (route === "reports") return "overview";
  const param = route.startsWith("reports/") ? route.slice("reports/".length) : "";
  return isLensParam(param) ? param : null;
}

/** What decides which lenses a workspace is shown: how its customers buy, and the role of the person looking. */
export interface LensWho {
  sellsBy: string | null | undefined;
  /** Not yet known reads as a viewer, the lowest rung; a role the ladder does not know stands on none. */
  role: string | null | undefined;
}

/** The lenses shown to this person in this workspace, in the strip's order. */
export function lensesFor(who: LensWho): LensRow[] {
  return REPORT_LENSES.filter(
    (l) => (l.shownWhen === "always" || dealsAreOn(who.sellsBy)) && roleAtLeast(who.role ?? "viewer", l.role),
  );
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
