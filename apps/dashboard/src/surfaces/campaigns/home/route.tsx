/**
 * Campaigns' home as the route draws it (decision 0015, step 7): what the address opens the page on. `campaigns` is the home,
 * `campaigns/moment:<id>` a playbook open in its drawer, `campaigns/new` (and `new:every`, `new:moment:<trigger>`,
 * `new:edit:<id>`) the composer (address.ts). The address is read from the path, never from the route params, because a move
 * from the home to a moment, or from one composer to the other, is a change of the path alone (workspace.ts goToRoute) and
 * the page follows it, one mount across them all.
 */
import { usePathname } from "next/navigation";
import { routeOfPath } from "@chanlytics/contracts";
import { CampaignsHome } from "./home-page";

export function CampaignsRoute() {
  const route = routeOfPath(usePathname()) ?? "campaigns";
  // The route's second word, as the shell reads its param (`campaigns/moment:pb-1/x` names moment:pb-1).
  const param = route.split("/")[1] || null;
  return <CampaignsHome param={param} />;
}
