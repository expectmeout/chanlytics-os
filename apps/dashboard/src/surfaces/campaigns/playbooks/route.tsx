/**
 * Playbooks as the route draws it (decision 0015, step 7): the playbook the address names, opened on its card. What the
 * frame's table did in its `drawPlaybooks` row, now that the layout draws the page: the address is read from the path,
 * never from the route params, because a move from one playbook to the next is a change of the path alone
 * (workspace.ts goToRoute) and the page follows it.
 */
import { usePathname } from "next/navigation";
import { routeOfPath } from "@chanlytics/contracts";
import { PlaybooksPage } from "./playbooks-page";

export function PlaybooksRoute() {
  const route = routeOfPath(usePathname()) ?? "outbound";
  // The route's second word, as the shell reads its param (`outbound/pb-1/x` names pb-1).
  const param = route.split("/")[1] || null;
  return <PlaybooksPage initialPlaybook={param} />;
}
