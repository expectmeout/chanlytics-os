/**
 * A retired address of Campaigns as a door: the old Playbooks address, `/w/<slug>/playbooks[/<id>]` (3 Oct 2026; Sequences
 * took the list, and a playbook is its sequence, decision 0060), and the Library's, `/w/<slug>/templates` (19 Oct 2026:
 * Messages is a view of Campaigns, `campaigns/messages`). The frame moves such an address as it loads (contracts
 * movedAddress) and every move the app makes lands on the new one (workspace.ts goToRoute), so this draws only for an
 * address that arrives some other way: it replaces itself with the page that replaced it (contracts retiredRouteOf), so
 * Back leaves rather than bouncing through the old route. It
 * says it is reading, as every route on its way does, until the move has landed.
 */
import { useEffect } from "react";
import { LIFECYCLE_WORDS, SEQUENCES_ROUTE, retiredRouteOf, routeOfPath } from "@chanlytics/contracts";
import { goToRoute } from "@/legacy-bridge/workspace";

export function RetiredRouteDoor({ pathname }: { pathname: string | null }) {
  const route = routeOfPath(pathname) ?? "outbound";
  const to = retiredRouteOf(route) ?? SEQUENCES_ROUTE;
  useEffect(() => {
    goToRoute(to, { replace: true });
  }, [to]);
  return (
    <div className="route-reading" role="status">
      {LIFECYCLE_WORDS.reading}
    </div>
  );
}
