/**
 * Settings on its App Router route (`/w/<slug>/settings`, `/w/<slug>/settings/<pane>`; decision 0015 step 11): the pane
 * the address names, read from the path the page hands it, and a tab's move. The path says the product's word,
 * `settings`, for the shell's own route, `admin` (contracts ROUTE_WORDS): a bell row, an email or a bookmark that says
 * `admin/<pane>` lands here, moved on load. A pane that moved elsewhere (surface-registry ROUTES_MOVED: `admin/setup` is
 * the first run) draws nothing while the frame takes the address there, as the shell's row drew nothing.
 */
import { useEffect } from "react";
import { routeOfPath } from "@chanlytics/contracts";
import { surfaceRetiredTo } from "@/legacy-bridge/surface-registry";
import { goToRoute } from "@/legacy-bridge/workspace";
import { demoSession, navigate } from "../../legacy-verbs";
import { SettingsPage } from "./page";
import { settingsAddressNow } from "./tabs";

/** The pane an address under Settings names: `admin/billing` is `billing`; the bare route names none (page.tsx says what it is). */
const settingsParamOf = (route: string | null): string => {
  const r = route ?? "admin";
  return r.includes("/") ? r.slice(r.indexOf("/") + 1) : "";
};

export function SettingsRoute({ pathname }: { pathname: string | null }) {
  const param = settingsParamOf(routeOfPath(pathname));
  // An old address for a row that moved pages (a bell, an Ask answer, the Calendar's rules: `admin/workspace/hours`) is
  // replaced by the one it names now, so the crumbs and the tab's title say the page drawn; the row opens either way.
  const now = settingsAddressNow(param);
  useEffect(() => {
    if (now !== param) goToRoute(`admin/${now}`, { replace: true });
  }, [now, param]);
  if (surfaceRetiredTo("admin", param || null, demoSession())) return null;
  return <SettingsPage tab={param} onTab={(t) => navigate(`admin/${t}`)} />;
}
