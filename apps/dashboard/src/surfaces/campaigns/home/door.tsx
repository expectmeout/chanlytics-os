/**
 * The old Playbooks address, `/w/<slug>/playbooks[/<id>]`, as a door (3 Oct 2026): Campaigns' home took the list, and a
 * playbook is a drawer over it. The frame moves such an address as it loads (contracts movedAddress) and every move the app
 * makes lands on the new one (workspace.ts goToRoute), so this draws only for an address that arrives some other way: it
 * replaces itself with the home, or the playbook's own address, so Back leaves rather than bouncing through the old route. It
 * says it is reading, as every route on its way does, until the move has landed.
 */
import { useEffect } from "react";
import { LIFECYCLE_WORDS, doorOf, routeOfPath } from "@chanlytics/contracts";
import { goToRoute } from "@/legacy-bridge/workspace";

export function PlaybooksDoor({ pathname }: { pathname: string | null }) {
  const route = routeOfPath(pathname) ?? "outbound";
  const to = doorOf(route) ?? "campaigns";
  useEffect(() => {
    goToRoute(to, { replace: true });
  }, [to]);
  return (
    <div className="route-reading" role="status">
      {LIFECYCLE_WORDS.reading}
    </div>
  );
}
