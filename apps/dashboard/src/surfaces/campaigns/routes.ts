/**
 * What the frame says around Campaigns' pages (moved from the rows `drawPlaybooks`, `drawTemplates` and `drawBroadcasts` of
 * legacy/pages/app-routes.jsx, decision 0015, step 7; then Campaigns' home, 3 Oct 2026): the crumbs each address wears, by the
 * address's own word (`campaigns/moment:<playbook>`, `campaigns/new`, `broadcasts/run:<run>`, `broadcasts/get-yes`,
 * `broadcasts/<list>`, which lands on `campaigns/new:to:<list>`) and by what the surface holds, so a crumb names a playbook or a run only once it has been read. The
 * frame asks these as it draws (src/surfaces/routes.ts). Campaigns is one page, its home (`campaigns`), and the other two are
 * its rooms, Sent (the shell's `broadcasts`) and the Library (`messages`, the path's `templates`); the old Playbooks list,
 * `outbound`, lands on the home (contracts doorOf). Every crumb's first word, Campaigns, goes back to the home.
 */
import { CAMPAIGN_ROOMS, LIFECYCLE_WORDS, templateTitle } from "@chanlytics/contracts";
import { surfaceValue } from "../surface-values";
import { parseHome } from "./home/address";

/** A crumb: its words, and where it goes. */
type Crumb = string | { label: string; to: string };

/** Campaigns, the first crumb of every address: the way back to the home. */
const CAMPAIGNS: Crumb = { label: CAMPAIGN_ROOMS.home, to: "campaigns" };

/**
 * The home's crumbs: `campaigns/moment:<id>` opens one playbook (or reach-out) in its drawer, named once the surfaces hold it,
 * and `campaigns/new` the composer. Every address is one mount, the page's own: a moment opening is no new page. A real
 * workspace's New message is the page's own, in its head; the top bar has no act.
 */
export function campaignsChrome({ param }: { param: string | null }): { crumbs: Crumb[]; mount: string; act: null } {
  const at = parseHome(param);
  const playbooks = surfaceValue("playbooks");
  const chains = surfaceValue("reach_outs");
  const rows = playbooks ? playbooks.rows : [];
  // A playbook's name, or a reach-out's, once the surfaces hold it: an address names either by its id. Before, the word
  // the drawer's head says of a campaign the page does not hold yet.
  const nameOf = (id: string): string =>
    rows.find((p) => p.id === id)?.name ??
    (Array.isArray(chains) ? chains : []).find((c) => c.root_id === id)?.name ??
    LIFECYCLE_WORDS.ledger.kicker;
  const open = at.moment;
  const named = open ? nameOf(open) : null;
  const editing = at.compose && at.compose.mode === "every" ? at.compose.edit : null;
  const edited = editing ? nameOf(editing) : null;
  return {
    crumbs: named
      ? [CAMPAIGNS, named]
      : at.message
        ? [CAMPAIGNS, templateTitle(at.message, null)]
        : edited
          ? [CAMPAIGNS, edited]
          : at.compose
            ? [CAMPAIGNS, CAMPAIGN_ROOMS.newMessage]
            : [CAMPAIGN_ROOMS.home],
    mount: "campaigns",
    act: null,
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
  const sent = { label: CAMPAIGN_ROOMS.sent, to: "broadcasts" };
  return {
    mount: "broadcasts",
    crumbs: runId
      ? [CAMPAIGNS, sent, run ? run.name : "Broadcast"]
      : getYes
        ? [CAMPAIGNS, sent, "Get their yes"]
        : list
          ? [CAMPAIGNS, sent, list.label]
          : [CAMPAIGNS, CAMPAIGN_ROOMS.sent],
  };
}
