/**
 * What the frame says around Campaigns' three pages (moved from the rows `drawPlaybooks`, `drawTemplates` and
 * `drawBroadcasts` of legacy/pages/app-routes.jsx, decision 0015, step 7): the crumbs each address wears, by the address's
 * own word (`outbound/<playbook>`, `broadcasts/run:<run>`, `broadcasts/get-yes`, `broadcasts/<list>`) and by what the surface
 * holds, so a crumb names a playbook or a run only once it has been read. The frame asks these as it draws
 * (src/surfaces/routes.ts). The path says `playbooks` and `templates` (contracts ROUTE_WORDS); the shell's routes here are
 * still `outbound` and `messages`, which is what every link, bell row and hash address says.
 */
import { surfaceValue } from "../surface-values";

/** A crumb: its words, and where it goes. */
type Crumb = string | { label: string; to: string };

/** The top bar's one act of a route, as the frame draws it (src/surfaces/routes.ts SurfaceAct). */
interface Act {
  label: string;
  glyph: string;
  primary?: boolean;
  ask?: boolean;
}

/**
 * Playbooks' crumbs: `outbound/<id>` opens one playbook's card, named once the playbooks hold it. A real workspace's New
 * playbook is the page's own, at the right of its one line; only the page's demo has the top bar's, which opens Ask.
 */
export function playbooksChrome({ param }: { param: string | null }): { crumbs: Crumb[]; act: Act | null } {
  const data = surfaceValue("playbooks");
  const open = param && data ? (data.rows || []).find((p) => p.id === param) : null;
  return {
    crumbs: param
      ? ["Campaigns", { label: "Playbooks", to: "outbound" }, open ? open.name : "Playbook"]
      : ["Campaigns", "Playbooks"],
    act: data ? null : { label: "New campaign", glyph: "plus", primary: true, ask: true },
  };
}

/**
 * What the Broadcasts page is handed for a param (`broadcasts/<param>`): a run's id for `run:<id>`, the "Get their yes"
 * section for `get-yes`, and any other word as the audience the composer opens on.
 */
export function broadcastsProps(param: string | null): {
  initialSegment: string | null;
  initialRun: string | null;
  initialYes: boolean;
} {
  const run = param && param.startsWith("run:") ? param.slice(4) : null;
  const yes = param === "get-yes";
  return { initialSegment: run || yes ? null : param, initialRun: run, initialYes: yes };
}

/**
 * Broadcasts' crumbs: `broadcasts/run:<id>` opens one broadcast, named for it once the list holds it; `broadcasts/get-yes`
 * lands on the "Get their yes" section; any other param is the audience the composer opens on, named by the page's own
 * rule (a list or a kept list with this id) and its own label. Every address is one mount.
 */
export function broadcastsChrome({ param }: { param: string | null }): { crumbs: Crumb[]; mount: string } {
  const data = surfaceValue("broadcasts");
  const runId = param && param.startsWith("run:") ? param.slice(4) : null;
  const getYes = param === "get-yes";
  const audience = runId || getYes ? null : param;
  const run = runId && data ? (data.rows || []).find((r) => r.id === runId) : null;
  const list =
    audience && data
      ? (data.audiences || []).find((a) => (a.kind === "saved" || a.kind === "list") && a.id === audience)
      : null;
  const broadcasts = { label: "Broadcasts", to: "broadcasts" };
  return {
    mount: "broadcasts",
    crumbs: runId
      ? ["Campaigns", broadcasts, run ? run.name : "Broadcast"]
      : getYes
        ? ["Campaigns", broadcasts, "Get their yes"]
        : list
          ? ["Campaigns", broadcasts, list.label]
          : ["Campaigns", "Broadcasts"],
  };
}
