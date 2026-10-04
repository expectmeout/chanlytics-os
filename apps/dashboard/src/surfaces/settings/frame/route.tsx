/**
 * Settings on its App Router route (`/w/<slug>/settings`, `/w/<slug>/settings/<pane>`; decision 0015 step 11): the pane
 * the address names, read from the path the page hands it, and a tab's move. The path says the product's word,
 * `settings`, for the shell's own route, `admin` (contracts ROUTE_WORDS): a bell row, an email or a bookmark that says
 * `admin/<pane>` lands here, moved on load. A pane that moved elsewhere (surface-registry ROUTES_MOVED: `admin/setup` is
 * the first run) draws nothing while the frame takes the address there, as the shell's row drew nothing.
 */
import { routeOfPath } from "@chanlytics/contracts";
import { surfaceRetiredTo } from "@/legacy-bridge/surface-registry";
import { demoSession, navigate } from "../../legacy-verbs";
import { SettingsPage } from "./page";

/** The pane an address under Settings names: `admin/billing` is `billing`; the bare route is Business. */
const settingsParamOf = (route: string | null): string => {
  const r = route ?? "admin";
  return r.includes("/") ? r.slice(r.indexOf("/") + 1) : "";
};

export function SettingsRoute({ pathname }: { pathname: string | null }) {
  const param = settingsParamOf(routeOfPath(pathname));
  if (surfaceRetiredTo("admin", param || null, demoSession())) return null;
  return <SettingsPage tab={param || "workspace"} onTab={(t) => navigate(`admin/${t}`)} />;
}
